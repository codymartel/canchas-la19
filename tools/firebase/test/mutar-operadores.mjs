// Mutacion automatica de todos los operadores de comparacion y logicos de
// mobile/firestore.rules.
//
// Para cada operador encontrado se generan variantes: una comparacion con la
// relacion equivalente, otra con la opuesta, y los logicos intercambiados. Se
// corre la suite completa contra cada mutacion y se clasifica el resultado:
//
//   detectado  la mutacion hace fallar al menos una prueba que antes pasaba
//   sobrevive  ninguna prueba cambia de veredicto
//   rompe      la mutacion ni siquiera deja cargar las reglas
//
// El emulador lo arranca quien invoque este script y se mantiene vivo entre
// mutaciones, porque los limites de accesos y de expresiones los evalua el.
//
//   firebase emulators:exec --project demo-grass-local --only firestore \
//     "node tools/firebase/test/mutar-operadores.mjs"
//
// Opciones por variables de entorno:
//   MUTAR_SOLO=<regex>   limita a operadores cuyo texto o linea coincida
//   MUTAR_DESDE=<n>      salta las primeras n mutaciones, para reanudar
//   MUTAR_LIMITE=<n>     corta despues de n mutaciones
//   MUTAR_INFORME=<ruta> donde escribir el informe json

import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const SUITE = join(here, 'firestore.rules.test.mjs');
const ORIGINAL = readFileSync(join(here, '..', '..', '..', 'mobile', 'firestore.rules'), 'utf8');
const COPIA = join(here, '.mutacion-operadores.rules');
const INFORME = process.env.MUTAR_INFORME || join(here, 'mutar-operadores.informe.json');

// Primero los de dos caracteres, para que "a <= b" no se lea como "a <" mas "= b".
const OPERADORES = ['<=', '>=', '==', '!=', '&&', '||', '<', '>'];

const VARIANTES = {
  '<=': ['<', '>'],
  '>=': ['>', '<'],
  '==': ['!=', '!='],
  '!=': ['==', '=='],
  '&&': ['||', '||'],
  '||': ['&&', '&&'],
  '<': ['<=', '>='],
  '>': ['>=', '<='],
};

// Sustituye por un espacio el interior de comentarios y cadenas, conservando el
// ancho, para no mutar operadores que no son codigo.
function enmascarar(linea) {
  let enComilla = null;
  let enComentario = false;
  let salida = '';
  for (let i = 0; i < linea.length; i += 1) {
    const ch = linea[i];
    const sig = linea[i + 1];
    if (enComilla) {
      salida += ch;
      if (ch === enComilla && linea[i - 1] !== '\\') enComilla = null;
      continue;
    }
    if (enComentario) { salida += ch; continue; }
    if (ch === '"' || ch === "'") { enComilla = ch; salida += ch; continue; }
    if (ch === '/' && sig === '/') { enComentario = true; salida += '  '; i += 1; continue; }
    salida += ch;
  }
  return salida;
}

function operadoresDe(linea) {
  const texto = enmascarar(linea);
  const hallados = [];
  let i = 0;
  while (i < texto.length) {
    const dos = texto.slice(i, i + 2);
    const par = OPERADORES.find((o) => o.length === 2 && dos === o);
    if (par) { hallados.push({ op: par, col: i }); i += 2; continue; }
    const uno = OPERADORES.find((o) => o.length === 1 && texto[i] === o);
    if (uno) { hallados.push({ op: uno, col: i }); i += 1; continue; }
    i += 1;
  }
  return hallados;
}

const lineasOriginal = ORIGINAL.split('\n');
const plan = [];
for (let n = 0; n < lineasOriginal.length; n += 1) {
  for (const { op, col } of operadoresDe(lineasOriginal[n])) {
    const texto = lineasOriginal[n].trim();
    if (process.env.MUTAR_SOLO
      && !new RegExp(process.env.MUTAR_SOLO, 'i').test(`${texto} L${n + 1}`)) continue;
    for (const nuevo of VARIANTES[op]) {
      plan.push({
        linea: n + 1, col, op, nuevo, texto,
        id: `L${n + 1}:${col} ${op} -> ${nuevo}`,
      });
    }
  }
}

const desde = Number(process.env.MUTAR_DESDE || 0);
const hasta = Math.min(
  plan.length,
  desde + Number(process.env.MUTAR_LIMITE || plan.length),
);
const trabajo = plan.slice(desde, hasta);
process.stderr.write(`mutaciones planificadas ${plan.length}, ejecutando ${trabajo.length}\n`);

function aplicar(linea, m) {
  return linea.slice(0, m.col) + m.nuevo + linea.slice(m.col + m.op.length);
}

function primeraLinea(s) {
  return (s.split('\n').map((x) => x.trim())
    .find((x) => x && !x.startsWith('#') && !x.startsWith('>')) || 'sin detalle')
    .slice(0, 200);
}

function correrSuite() {
  const r = spawnSync(process.execPath, [SUITE], {
    encoding: 'utf8',
    env: { ...process.env, RULES_PATH: COPIA },
    maxBuffer: 64 * 1024 * 1024,
  });
  const salida = `${r.stdout || ''}${r.stderr || ''}`;
  if (/error parsing rules|error while parsing|syntax error/i.test(salida)) {
    return { estado: 'rompe', detalle: primeraLinea(salida) };
  }
  const pass = (salida.match(/^# pass (\d+)$/m) || [])[1];
  const fail = (salida.match(/^# fail (\d+)$/m) || [])[1];
  if (pass === undefined) return { estado: 'rompe', detalle: primeraLinea(salida) };
  return { estado: 'ok', pass: Number(pass), fail: Number(fail) };
}

const resultados = [];
for (const [i, m] of trabajo.entries()) {
  const mutada = ORIGINAL.split('\n');
  mutada[m.linea - 1] = aplicar(mutada[m.linea - 1], m);
  writeFileSync(COPIA, mutada.join('\n'));
  const r = correrSuite();
  const estado = r.estado === 'rompe' ? 'rompe'
    : r.fail > 0 ? 'detectado' : 'sobrevive';
  resultados.push({ ...m, estado, pass: r.pass, fail: r.fail, detalle: r.detalle });
  if ((i + 1) % 10 === 0 || i === trabajo.length - 1) {
    const cuenta = (e) => resultados.filter((x) => x.estado === e).length;
    process.stderr.write(`  ${i + 1}/${trabajo.length} detectados=${cuenta('detectado')} `
      + `sobreviven=${cuenta('sobrevive')} rotos=${cuenta('rompe')}\n`);
  }
}

mkdirSync(dirname(INFORME), { recursive: true });
writeFileSync(INFORME, JSON.stringify({ total: plan.length, resultados }, null, 2));
rmSync(COPIA, { force: true });
const cuenta = (e) => resultados.filter((x) => x.estado === e).length;
process.stderr.write(`TOTAL detectados=${cuenta('detectado')} `
  + `sobreviven=${cuenta('sobrevive')} rotos=${cuenta('rompe')}\ninforme ${INFORME}\n`);

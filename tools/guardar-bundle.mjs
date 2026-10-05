// Guarda una copia del bundle web aprobado del panel, fuera de Git, y la
// asocia al commit y a la etiqueta de la version.
//
//   node tools/guardar-bundle.mjs              guarda mobile/build/web
//   node tools/guardar-bundle.mjs --verificar  compara lo guardado con lo actual
//   node tools/guardar-bundle.mjs --forzar     reemplaza la copia existente
//
// El bundle vive en mobile/build/web, que flutter clean borra y que
// mobile/.gitignore excluye. Sin esta copia, un build roto en Git es
// indescifrable: habria que recompilar y cruzar los dedos.

import { createHash } from 'node:crypto';
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const origen = join(raiz, 'mobile', 'build', 'web');
const destinoRaiz = join(raiz, 'bundles');
const argumentos = process.argv.slice(2);
const verificar = argumentos.includes('--verificar');
const forzar = argumentos.includes('--forzar');

// El discriminante que revisa mobile/test/bundle_web_test.dart. Se repite aqui
// para que guardar un bundle roto no dependa de que alguien corra flutter test.
const MARCADOR_RTDB = '.firebase_database';

function git(...partes) {
  return execFileSync('git', partes, { cwd: raiz, encoding: 'utf8' }).trim();
}

function listarArchivos(directorio, base = directorio) {
  const encontrados = [];
  for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
    const completo = join(directorio, entrada.name);
    if (entrada.isDirectory()) encontrados.push(...listarArchivos(completo, base));
    else encontrados.push(relative(base, completo).split(sep).join('/'));
  }
  return encontrados.sort();
}

function sha256(ruta) {
  return createHash('sha256').update(readFileSync(ruta)).digest('hex');
}

// Un resumen unico de todo el contenido: cambia si cambia un solo byte de
// cualquier archivo, sin depender de los nombres.
function resumenDe(manifiesto) {
  const lineas = manifiesto.archivos.map((a) => `${a.sha256}  ${a.ruta}`).join('\n');
  return createHash('sha256').update(lineas).digest('hex');
}

function manifiestoDe(directorio, version) {
  const archivos = listarArchivos(directorio).map((ruta) => {
    const completa = join(directorio, ruta);
    return { ruta, bytes: statSync(completa).size, sha256: sha256(completa) };
  });
  const manifiesto = { ...version, archivos };
  manifiesto.resumen = resumenDe(manifiesto);
  manifiesto.totalBytes = archivos.reduce((suma, a) => suma + a.bytes, 0);
  return manifiesto;
}

function versionActual() {
  const commit = git('rev-parse', 'HEAD');
  let etiqueta = '';
  try {
    etiqueta = git('describe', '--tags', '--exact-match');
  } catch {
    etiqueta = '';
  }
  return {
    commit,
    commitCorto: commit.slice(0, 7),
    etiqueta,
    fecha: new Date().toISOString(),
  };
}

function comparar(guardado, actual) {
  const diferencias = [];
  if (guardado.resumen === actual.resumen) return diferencias;
  const porRuta = new Map(guardado.archivos.map((a) => [a.ruta, a.sha256]));
  for (const archivo of actual.archivos) {
    const antes = porRuta.get(archivo.ruta);
    if (antes === undefined) diferencias.push(`solo en el actual: ${archivo.ruta}`);
    else if (antes !== archivo.sha256) diferencias.push(`cambio: ${archivo.ruta}`);
    porRuta.delete(archivo.ruta);
  }
  for (const ruta of porRuta.keys()) diferencias.push(`solo en la copia: ${ruta}`);
  return diferencias;
}

if (!existsSync(origen)) {
  console.error(`No existe ${origen}. Compila primero:\n  flutter build web --release`);
  process.exit(1);
}

const principal = join(origen, 'main.dart.js');
if (!readFileSync(principal).includes(MARCADOR_RTDB)) {
  console.error(`El bundle no enlaza ${MARCADOR_RTDB}.`);
  console.error('La implementacion web de Realtime Database se perdio y el panel quedaria sin conexion.');
  console.error('No se guarda. Revisa mobile/test/bundle_web_test.dart.');
  process.exit(1);
}

const version = versionActual();
const destino = join(destinoRaiz, version.commitCorto);

if (verificar) {
  if (!existsSync(destino)) {
    console.error(`No hay copia guardada para ${version.commitCorto} en ${destinoRaiz}.`);
    process.exit(1);
  }
  const guardado = JSON.parse(readFileSync(join(destino, 'MANIFIESTO.json'), 'utf8'));
  const actual = manifiestoDe(origen, version);
  const diferencias = comparar(guardado, actual);
  if (diferencias.length) {
    console.error('La copia guardada no coincide con el bundle actual:');
    for (const linea of diferencias) console.error(`  ${linea}`);
    process.exit(1);
  }
  console.log(`Coincide con la copia de ${destino}.`);
  console.log(`  commit  ${guardado.commitCorto}${guardado.etiqueta ? ` (${guardado.etiqueta})` : ''}`);
  console.log(`  resumen ${guardado.resumen}`);
  process.exit(0);
}

if (existsSync(destino) && !forzar) {
  console.error(`Ya existe una copia para ${version.commitCorto} en ${destino}.`);
  console.error('Usa --forzar para reemplazarla, o --verificar para compararla.');
  process.exit(1);
}

const manifiesto = manifiestoDe(origen, version);
cpSync(origen, destino, { recursive: true });
writeFileSync(join(destino, 'MANIFIESTO.json'), `${JSON.stringify(manifiesto, null, 2)}\n`);

const megabytes = (manifiesto.totalBytes / 1048576).toFixed(2);
console.log('Bundle del panel guardado fuera de Git.');
console.log(`  ruta     ${destino}`);
console.log(`  commit   ${manifiesto.commitCorto}${manifiesto.etiqueta ? ` (${manifiesto.etiqueta})` : ''}`);
console.log(`  archivos ${manifiesto.archivos.length}  ${megabytes} MB`);
console.log(`  resumen  ${manifiesto.resumen}`);
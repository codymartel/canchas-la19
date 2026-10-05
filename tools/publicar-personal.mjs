// Publica SOLO el panel, y solo si hay copia guardada del bundle.
//
//   node tools/publicar-personal.mjs
//
// Publicar el panel republica mobile/build/web, que no vive en Git y que
// flutter clean borra. Sin este paso previo, un bundle roto en Git seria
// irrecuperable: habria que recompilar y confiar. Por eso el script exige que
// `tools/guardar-bundle.mjs --verificar` confirme que mobile/build/web coincide
// con una copia aprobada antes de tocar Hosting.
//
// Secuencia completa de una version nueva del panel:
//
//   flutter build web --release
//   flutter test
//   node tools/guardar-bundle.mjs
//   node tools/publicar-personal.mjs

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const CONFIG = 'firebase.personal.json';
const PROYECTO = 'glass-sintetico';
const TARGET = 'personal';
const SITIO = 'glass-sintetico';

const config = JSON.parse(readFileSync(join(raiz, CONFIG), 'utf8'));

// El config solo puede tener `hosting`. Asi el panel no puede arrastrar la web
// publica ni reglas que no le corresponden.
const secciones = Object.keys(config);
if (secciones.length !== 1 || secciones[0] !== 'hosting') {
  console.error(`${CONFIG} deberia contener solo "hosting". Encontrado: ${secciones.join(', ')}`);
  console.error('Publicar el panel no debe poder desplegar la web publica ni reglas.');
  process.exit(1);
}

const sitios = Array.isArray(config.hosting) ? config.hosting : [config.hosting];
if (sitios.length !== 1 || sitios[0].target !== TARGET) {
  console.error(`${CONFIG} deberia declarar un unico site con target "${TARGET}".`);
  process.exit(1);
}

const firebaserc = JSON.parse(readFileSync(join(raiz, '.firebaserc'), 'utf8'));
const destinos = firebaserc?.targets?.[PROYECTO]?.hosting?.[TARGET];
const real = Array.isArray(destinos) ? destinos[0] : destinos;
if (real !== SITIO) {
  console.error(`El target "${TARGET}" de ${PROYECTO} apunta a "${real}", no a "${SITIO}".`);
  console.error('Revisa .firebaserc antes de publicar.');
  process.exit(1);
}

// Paso 1 y 2: la copia guardada tiene que existir y coincidir byte a byte con
// mobile/build/web. Si falla, no se despliega nada.
console.log('Comprobando la copia guardada del bundle...');
const verificacion = spawnSync(
  process.execPath,
  [join(raiz, 'tools', 'guardar-bundle.mjs'), '--verificar'],
  { cwd: raiz, stdio: 'inherit' },
);

if (verificacion.error) {
  console.error(verificacion.error.message);
  process.exit(1);
}
if (verificacion.status !== 0) {
  console.error('');
  console.error('La copia guardada no coincide con mobile/build/web. No se publica.');
  console.error('Revisa el bundle y, si es correcto, guardalo antes de desplegar:');
  console.error('  node tools/guardar-bundle.mjs');
  process.exit(1);
}

// Paso 3: solo ahora se toca Hosting.
console.log('');
console.log(`Publicando el panel en ${SITIO} (${PROYECTO}).`);
console.log(`  origen   ${sitios[0].public}`);
console.log(`  alcance  solo hosting:${TARGET}; sin la web publica, sin reglas`);
console.log('');

const resultado = spawnSync(
  'firebase',
  ['deploy', '--project', PROYECTO, '--only', `hosting:${TARGET}`, '--config', CONFIG],
  { cwd: raiz, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (resultado.error) {
  console.error(resultado.error.message);
  process.exit(1);
}
process.exit(resultado.status ?? 1);

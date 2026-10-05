// Publica SOLO la web publica, en el site glass-sintetico-tienda.
//
//   node tools/publicar-publica.mjs
//
// Que la web publica no pase por `flutter build web` es lo que hace seguro este
// script: editar web/public/ y desplegar no puede tocar el bundle del panel ni
// las reglas de Realtime Database.
//
// El archivo firebase.publica.json no menciona `database` ni `firestore`, asi
// que un `firebase deploy -c firebase.publica.json` sin --only tampoco puede
// publicar reglas. La comprobacion de abajo lo verifica antes de actuar, y
// falla si alguien amplia ese archivo sin darse cuenta.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const CONFIG = 'firebase.publica.json';
const PROYECTO = 'glass-sintetico';
const TARGET = 'publica';
const SITIO = 'glass-sintetico-tienda';

const config = JSON.parse(readFileSync(join(raiz, CONFIG), 'utf8'));

// El config solo puede tener `hosting`. Cualquier otra seccion reintroduce la
// capacidad de publicar reglas desde este archivo.
const secciones = Object.keys(config);
if (secciones.length !== 1 || secciones[0] !== 'hosting') {
  console.error(`${CONFIG} deberia contener solo "hosting". Encontrado: ${secciones.join(', ')}`);
  console.error('Publicar la web publica no debe poder desplegar reglas ni el panel.');
  process.exit(1);
}

const sitios = Array.isArray(config.hosting) ? config.hosting : [config.hosting];
if (sitios.length !== 1 || sitios[0].target !== TARGET) {
  console.error(`${CONFIG} deberia declarar un unico site con target "${TARGET}".`);
  process.exit(1);
}

// El target debe seguir apuntando al sitio conocido. Asi el script falla en vez
// de publicar en un sitio que nadie reviso.
const firebaserc = JSON.parse(readFileSync(join(raiz, '.firebaserc'), 'utf8'));
const destinos = firebaserc?.targets?.[PROYECTO]?.hosting?.[TARGET];
const real = Array.isArray(destinos) ? destinos[0] : destinos;
if (real !== SITIO) {
  console.error(`El target "${TARGET}" de ${PROYECTO} apunta a "${real}", no a "${SITIO}".`);
  console.error('Revisa .firebaserc antes de publicar.');
  process.exit(1);
}

const origen = join(raiz, sitios[0].public);
if (!existsSync(join(origen, 'index.html'))) {
  console.error(`No existe ${join(sitios[0].public, 'index.html')}.`);
  process.exit(1);
}

console.log(`Publicando la web publica en ${SITIO} (${PROYECTO}).`);
console.log(`  origen   ${sitios[0].public}`);
console.log(`  alcance  solo hosting:${TARGET}; sin reglas, sin panel, sin RTDB`);
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

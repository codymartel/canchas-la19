// Levanta el entorno local completo: Auth, Firestore, Realtime Database y la
// web publica de web/public. Es SOLO desarrollo local.
//
//   node tools/emuladores.mjs
//
// Existe porque el Paso 3 separó los dos Hosting de producción en
// firebase.publica.json y firebase.personal.json, y ninguno de los dos se
// puede usar para desarrollo: cada uno sirve un unico site y ninguno declara
// emuladores. firebase.json conserva las reglas pero ya no tiene `hosting`, así
// que `firebase emulators:start` se levanta sin web.
//
// Este archivo no participa en ningun despliegue. Los scripts de publicacion
// usan firebase.publica.json y firebase.personal.json, y nunca este.
//
// La web publica es lo que consume el 5000. `web/public/app.js` detecta
// localhost y engancha Auth 9099 y Firestore 8081, y `firebase-config.js` fuerza
// el proyecto demo-grass-local. Para ver el formulario hay que pedir
// reservas habilitadas de forma explicita:
//
//   node tools/emuladores.mjs
//   http://127.0.0.1:5000/?reservas=1
//
// El panel usa los mismos emuladores desde Flutter con EMULATOR_HOST, que
// anade ademas el 9000 de RTDB:
//
//   EMULATOR_HOST=127.0.0.1 flutter run -d chrome

import { spawnSync } from 'node:child_process';

const raiz = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const CONFIG = 'firebase.emuladores.json';

// Proyecto inventado a proposito: ninguna peticion puede salir a produccion.
// Es el mismo que usan las pruebas de reglas con emulators:exec.
const PROYECTO = 'demo-grass-local';

const PUERTOS = [
  ['Auth', '9099'],
  ['Firestore', '8081'],
  ['Realtime Database', '9000'],
  ['Hosting (web/public)', '5000'],
];

console.log(`Emuladores locales de ${PROYECTO}`);
console.log(`  config  ${CONFIG}`);
for (const [nombre, puerto] of PUERTOS) console.log(`  ${String(puerto).padEnd(5)} ${nombre}`);
console.log('');
console.log(`  web  http://127.0.0.1:5000/?reservas=1`);
console.log('  Ctrl+C para detener.');
console.log('');

const resultado = spawnSync(
  'firebase',
  ['emulators:start', '--config', CONFIG, '--project', PROYECTO],
  { cwd: raiz, stdio: 'inherit', shell: process.platform === 'win32' },
);

if (resultado.error) {
  console.error(resultado.error.message);
  process.exit(1);
}
process.exit(resultado.status ?? 1);

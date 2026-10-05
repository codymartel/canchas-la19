// Guard de coherencia entre las reglas que Firebase despliega y las que las
// suites de reglas realmente prueban. Una suite puede pasar en verde contra un
// archivo que la configuracion nunca despliega; este test delata esa distancia.
//
// Solo lee archivos. No modifica reglas, configuracion ni codigo de reservas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..', '..');

// Compara rutas sin depender de separadores ni de mayusculas en Windows.
const normalizar = ruta => (process.platform === 'win32' ? ruta.toLowerCase() : ruta).replace(/\\/g, '/');

const leerJson = nombre => JSON.parse(readFileSync(join(raiz, nombre), 'utf8'));

// Resuelve la ruta de reglas que una suite carga. Ambas declaran el bloque con
// readFileSync(join(here, '..', '..', '..', 'mobile', '<archivo>')), donde `here`
// es el directorio de la propia suite.
function reglasDeSuite(nombre) {
  const rutaSuite = join(raiz, nombre);
  const fuente = readFileSync(rutaSuite, 'utf8');
  const coincidencia = fuente.match(/join\(\s*here\s*,\s*((?:'[^']*'\s*,\s*)*'[^']*')\s*\)/);
  assert.ok(coincidencia, `No se encontro join(here, ...) para las reglas en ${nombre}.`);
  const segmentos = [...coincidencia[1].matchAll(/'([^']*)'/g)].map(m => m[1]);
  return resolve(dirname(rutaSuite), ...segmentos);
}

const reglasFirebaseJson = leerJson('firebase.json').firestore.rules;
const reglasEmuladoresJson = leerJson('firebase.emuladores.json').firestore.rules;
const reglasDesplegables = join(raiz, reglasFirebaseJson);

test('firebase.json y firebase.emuladores.json declaran el mismo archivo de reglas', () => {
  assert.equal(
    normalizar(join(raiz, reglasEmuladoresJson)),
    normalizar(reglasDesplegables),
    `firebase.json declara "${reglasFirebaseJson}" y firebase.emuladores.json declara "${reglasEmuladoresJson}".`,
  );
});

test('el archivo de reglas declarado por firebase.json existe', () => {
  assert.ok(existsSync(reglasDesplegables), `No existe el archivo de reglas: ${reglasDesplegables}`);
});

test('firestore.rules.test.mjs carga el archivo de reglas que firebase.json despliega', () => {
  assert.equal(
    normalizar(reglasDeSuite('tools/firebase/test/firestore.rules.test.mjs')),
    normalizar(reglasDesplegables),
  );
});

test('web-flow.test.mjs carga el archivo de reglas que firebase.json despliega', () => {
  assert.equal(
    normalizar(reglasDeSuite('tools/firebase/test/web-flow.test.mjs')),
    normalizar(reglasDesplegables),
  );
});
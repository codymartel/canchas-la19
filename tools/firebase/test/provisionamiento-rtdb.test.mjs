import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';

for (const variable of [
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_DATABASE_EMULATOR_HOST',
]) {
  if (!process.env[variable]) throw new Error(`Falta ${variable}.`);
}

const projectId = process.env.GCLOUD_PROJECT || 'demo-grass-local';
const databaseURL = `https://${projectId}-default-rtdb.firebaseio.com`;
const app = initializeApp({ projectId, databaseURL }, 'preparar-provisionamiento');
const auth = getAuth(app);
const firestore = getFirestore(app);
const database = getDatabase(app);
const ADMIN = 'admin-provisionado-01';
const ACTIVO = 'empleado-activo-02';
const INACTIVO = 'empleado-inactivo-03';
const AJENO = 'cuenta-ajena-04';

// El emulador es compartido entre suites y con ejecuciones anteriores. El ACL
// que reconcilia el script se construye desde TODOS los empleados activos de
// Firestore, asi que un empleado que dejo otra suite haria fallar la asercion
// final. Esta suite declara su propio punto de partida, igual que las demas
// limpian antes de sembrar.
await firestore.recursiveDelete(firestore.collection('negocios'));
await firestore.doc('sistema/grass').delete();
// La cuenta administradora tambien es estado previo: crear un UID que ya existe
// aborta la suite, asi que se rehace siempre desde cero.
await auth.deleteUser(ADMIN).catch(() => {});

await auth.createUser({
  uid: ADMIN,
  email: 'admin-provisionamiento@local.test',
  emailVerified: true,
  password: 'prueba-segura-123',
});
await firestore.doc('sistema/grass').set({
  administradorUid: ADMIN,
  negocioId: 'grass-sintetico',
  zonaHoraria: 'America/Lima',
});
await firestore.doc(`negocios/grass-sintetico/empleados/${ACTIVO}`).set({
  nombre: 'Ana Activa', rol: 'empleado_control', activo: true,
});
await firestore.doc(`negocios/grass-sintetico/empleados/${INACTIVO}`).set({
  nombre: 'Beto Inactivo', rol: 'empleado_control', activo: false,
});
await database.ref('acceso/grass-sintetico').set({
  [AJENO]: { rol: 'empleado_control', activo: true, nombre: 'Ajeno' },
  [INACTIVO]: { rol: 'empleado_control', activo: true, nombre: 'Beto Inactivo' },
});
await deleteApp(app);

const here = dirname(fileURLToPath(import.meta.url));
const resultado = spawnSync(
  process.execPath,
  [join(here, '..', 'scripts', 'sincronizar-acceso-rtdb.mjs')],
  {
    cwd: join(here, '..'),
    env: { ...process.env, GCLOUD_PROJECT: projectId },
    encoding: 'utf8',
  },
);
assert.equal(resultado.status, 0, resultado.stderr || resultado.stdout);

const verificacion = initializeApp(
  { projectId, databaseURL },
  'verificar-provisionamiento',
);
const acceso = (await getDatabase(verificacion)
  .ref('acceso/grass-sintetico')
  .get()).val();
assert.deepEqual(Object.keys(acceso).sort(), [ACTIVO, ADMIN].sort());
assert.deepEqual(acceso[ADMIN], {
  rol: 'administrador', activo: true, nombre: 'Administrador',
});
assert.deepEqual(acceso[ACTIVO], {
  rol: 'empleado_control', activo: true, nombre: 'Ana Activa',
});
assert.equal(acceso[INACTIVO], undefined);
assert.equal(acceso[AJENO], undefined);
await deleteApp(verificacion);

console.log('Provisionamiento RTDB: admin protegido, alta activa y revocaciones OK.');

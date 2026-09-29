import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { solicitarReserva } from '../../../web/public/reserva.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Solo emuladores de Auth y Firestore.');
}

const here = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(
  join(here, '..', '..', '..', 'mobile', 'firestore.rules'),
  'utf8',
);
const PROJECT = 'demo-grass-local';
const BUSINESS = 'grass-sintetico';
const EMPLOYEE = 'empleado-panel-01';
const OUTSIDER = 'cuenta-ajena-01';
const environment = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { host: '127.0.0.1', port: 8081, rules },
});

function futureDay(days = 2) {
  const lima = new Date(Date.now() - 5 * 60 * 60 * 1000 + days * 86400000);
  return lima.toISOString().slice(0, 10);
}

const horarioGlobal = {
  aperturaMinuto: 480,
  cierreMinuto: 1320,
  duracionTurnoMinutos: 30,
};

await environment.clearFirestore();
await environment.withSecurityRulesDisabled(async context => {
  const db = context.firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, 'sistema/grass'), {
    administradorUid: 'admin-panel-01',
    negocioId: BUSINESS,
    zonaHoraria: 'America/Lima',
  });
  batch.set(doc(db, `negocios/${BUSINESS}`), {
    propietarioUid: 'admin-panel-01',
    preparado: true,
    // El horario es del negocio y es el mismo para las tres canchas.
    ...horarioGlobal,
  });
  batch.set(doc(db, `negocios_publicos/${BUSINESS}`), {
    negocioId: BUSINESS,
    slug: BUSINESS,
    nombre: 'Grass Sintetico',
    descripcion: 'Tres canchas con agenda compartida.',
    galeria: [],
    ...horarioGlobal,
  });
  for (const [id, name] of [['la-19', 'La 19'], ['la-23', 'La 23'], ['la-24', 'La 24']]) {
    const court = {
      id,
      negocioId: BUSINESS,
      sedeId: id,
      nombre: name,
      direccion: `Direccion ${name}`,
      activa: true,
      tarifaTurnoCentimos: 5000,
    };
    batch.set(doc(db, `negocios/${BUSINESS}/canchas/${id}`), court);
    batch.set(doc(db, `canchas_publicas/${id}`), court);
  }
  batch.set(doc(db, `negocios/${BUSINESS}/empleados/${EMPLOYEE}`), {
    nombre: 'Empleado Panel',
    rol: 'empleado_control',
    activo: true,
    permisos: { agenda: true, reservas: true, clientes: false, promociones: false },
    sedes: ['la-19', 'la-23', 'la-24'],
    sedePrincipal: 'la-19',
  });
  await batch.commit();
});

const app = firebase.initializeApp({
  apiKey: 'demo-key',
  projectId: PROJECT,
  authDomain: `${PROJECT}.firebaseapp.com`,
}, 'web-flow');
const auth = app.auth();
auth.useEmulator('http://127.0.0.1:9099');
const db = app.firestore();
db.useEmulator('127.0.0.1', 8081);
await auth.signInAnonymously();
const uid = auth.currentUser.uid;

const publicCourts = await db.collection('canchas_publicas')
  .where('activa', '==', true)
  .get({ source: 'server' });
assert.deepEqual(publicCourts.docs.map(doc => doc.id).sort(), ['la-19', 'la-23', 'la-24']);

// El horario viaja en la pagina publica del negocio y las canchas ya no lo
// guardan: la web lee un solo horario para las tres.
const publicBusiness = await db.collection('negocios_publicos').doc(BUSINESS).get({ source: 'server' });
assert.equal(publicBusiness.exists, true, 'Falta la pagina publica del negocio.');
assert.equal(publicBusiness.data().aperturaMinuto, horarioGlobal.aperturaMinuto);
assert.equal(publicBusiness.data().cierreMinuto, horarioGlobal.cierreMinuto);
assert.equal(publicBusiness.data().duracionTurnoMinutos, horarioGlobal.duracionTurnoMinutos);
for (const cancha of publicCourts.docs) {
  for (const legacy of ['aperturaMinuto', 'cierreMinuto', 'duracionTurnoMinutos']) {
    assert.equal(legacy in cancha.data(), false, `${cancha.id} todavia guarda ${legacy}.`);
  }
}

const day = futureDay();
const request = {
  requestId: 'web-flow-000001',
  dia: day,
  canchaId: 'la-19',
  minuto: 1140,
  duracion: 30,
  nombre: 'PRUEBA WEB EMULADOR',
  telefono: '+51900000000',
};
const created = await solicitarReserva({
  firebase,
  db,
  uid,
  negocio: BUSINESS,
  datos: request,
});
assert.equal(created.estado, 'confirmada');

const staff = environment.authenticatedContext(EMPLOYEE, {
  firebase: { sign_in_provider: 'password' },
}).firestore();
const panelQuery = query(
  collection(staff, `negocios/${BUSINESS}/reservas`),
  where('dia', '==', day),
  limit(1500),
);
const panelRows = await assertSucceeds(getDocs(panelQuery));
assert.equal(panelRows.docs.some(doc => doc.id === created.id), true);
assert.equal(panelRows.docs.find(doc => doc.id === created.id).data().estado, 'confirmada');
const privateAgenda = await assertSucceeds(getDoc(doc(
  staff,
  `negocios/${BUSINESS}/agenda/la-19/dias/${day}`,
)));
assert.deepEqual(privateAgenda.data().ocupados, { '1140': true });
assert.equal(privateAgenda.data().ultimaOperacion.reservaId, created.id);
const publicAgenda = await db.doc(
  `agenda_publica/${BUSINESS}/canchas/la-19/dias/${day}`,
).get({ source: 'server' });
assert.deepEqual(publicAgenda.data(), { ocupados: { '1140': true } });

const secondApp = firebase.initializeApp({
  apiKey: 'demo-key',
  projectId: PROJECT,
  authDomain: `${PROJECT}.firebaseapp.com`,
}, 'web-flow-second');
const secondAuth = secondApp.auth();
secondAuth.useEmulator('http://127.0.0.1:9099');
const secondDb = secondApp.firestore();
secondDb.useEmulator('127.0.0.1', 8081);
await secondAuth.signInAnonymously();
await assert.rejects(
  solicitarReserva({
    firebase,
    db: secondDb,
    uid: secondAuth.currentUser.uid,
    negocio: BUSINESS,
    datos: { ...request, requestId: 'web-flow-000002' },
  }),
  error => error.code === 'already-exists',
);

await assert.rejects(
  db.collection(`negocios/${BUSINESS}/reservas`).limit(1500).get(),
  error => error.code === 'permission-denied',
);
await assert.rejects(
  db.doc(`negocios/${BUSINESS}/empleados/${uid}`).set({
    activo: true,
    rol: 'empleado_control',
  }),
  error => error.code === 'permission-denied',
);
const outsider = environment.authenticatedContext(OUTSIDER, {
  firebase: { sign_in_provider: 'password' },
}).firestore();
await assertFails(getDoc(doc(outsider, `negocios/${BUSINESS}/reservas/${created.id}`)));
await assertFails(getDoc(doc(outsider, `negocios/${BUSINESS}/empleados/${EMPLOYEE}`)));

await auth.signOut();
await secondAuth.signOut();
await app.delete();
await secondApp.delete();
await environment.cleanup();
console.log('Web Spark schema 5: 3 canchas, reserva, agenda diaria, colision y privacidad OK.');

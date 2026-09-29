import assert from 'node:assert/strict';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Esta comprobacion es de solo lectura contra produccion.');
}

const PROJECT = 'glass-sintetico';
const BUSINESS = 'grass-sintetico';
const app = firebase.initializeApp({
  apiKey: 'AIzaSyCxZ3cbXROSZd67zp6WWe72iOpyDRVqrhc',
  authDomain: 'glass-sintetico.firebaseapp.com',
  projectId: PROJECT,
  appId: '1:666840330833:web:cf55eab78a7c087d68be70',
}, 'verificar-web-publica');
const auth = app.auth();
const db = app.firestore();

try {
  await auth.signInAnonymously();
  const negocio = await db.collection('negocios_publicos').doc(BUSINESS).get({ source: 'server' });
  assert.equal(negocio.exists, true, 'Falta negocios_publicos/grass-sintetico.');
  // El horario es del negocio y es el mismo para las tres canchas.
  const publicacion = negocio.data();
  assert.ok(
    Number.isInteger(publicacion.aperturaMinuto)
      && publicacion.aperturaMinuto >= 0
      && publicacion.aperturaMinuto <= 1439
      && publicacion.aperturaMinuto % 30 === 0,
    'Apertura global invalida en la pagina publica.',
  );
  assert.ok(
    Number.isInteger(publicacion.cierreMinuto)
      && publicacion.cierreMinuto >= 1
      && publicacion.cierreMinuto <= 1440
      && publicacion.cierreMinuto % 30 === 0,
    'Cierre global invalido en la pagina publica.',
  );
  assert.notEqual(publicacion.aperturaMinuto, publicacion.cierreMinuto, 'Apertura y cierre no pueden coincidir.');
  assert.ok(
    Number.isInteger(publicacion.duracionTurnoMinutos)
      && publicacion.duracionTurnoMinutos >= 30
      && publicacion.duracionTurnoMinutos <= 240
      && publicacion.duracionTurnoMinutos % 30 === 0,
    'Duracion de turno global invalida.',
  );
  const canchas = await db.collection('canchas_publicas')
    .where('activa', '==', true)
    .get({ source: 'server' });
  const ids = canchas.docs.map(doc => doc.id).sort();
  assert.deepEqual(ids, ['la-19', 'la-23', 'la-24']);
  for (const cancha of canchas.docs) {
    const datos = cancha.data();
    assert.equal(typeof datos.direccion, 'string', `Falta direccion en ${cancha.id}.`);
    assert.ok(datos.direccion.trim(), `Falta direccion en ${cancha.id}.`);
    assert.ok(
      Number.isInteger(datos.tarifaTurnoCentimos) && datos.tarifaTurnoCentimos >= 0,
      `Tarifa por turno invalida en ${cancha.id}.`,
    );
  }
  const promociones = await db.collection('promociones_publicas')
    .where('activa', '==', true)
    .get({ source: 'server' });
  const lima = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const cancha of ids) {
    const agenda = await db.collection('agenda_publica').doc(BUSINESS)
      .collection('canchas').doc(cancha).collection('dias').doc(lima)
      .get({ source: 'server' });
    if (agenda.exists) {
      assert.deepEqual(Object.keys(agenda.data()), ['ocupados']);
      assert.equal(typeof agenda.data().ocupados, 'object');
    }
  }
  console.log(JSON.stringify({
    projectId: PROJECT,
    authAnonimo: true,
    canchas: ids,
    promocionesActivas: promociones.size,
    agendaPublicaConsultable: true,
  }, null, 2));
} finally {
  await auth.signOut().catch(() => {});
  await app.delete();
}

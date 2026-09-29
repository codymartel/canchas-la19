import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp,
  deleteField,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Solo emuladores. Ejecuta con firebase emulators:exec.');
}

const here = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(join(here, 'private-index-daily.rules'), 'utf8');
const environment = await initializeTestEnvironment({
  projectId: 'demo-grass-local',
  firestore: { host: '127.0.0.1', port: 8081, rules },
});

const DAY = '2030-10-15';
const COURT = 'la-19';
const WEB_A = 'web-anon-a';
const WEB_B = 'web-anon-b';
const EMPLOYEE = 'empleado-la-19';
const OTHER_EMPLOYEE = 'empleado-la-23';

const anonymous = uid => environment.authenticatedContext(uid, {
  firebase: { sign_in_provider: 'anonymous' },
});
const employee = (uid, courts) => environment.authenticatedContext(uid, {
  rol: 'empleado_control',
  canchas: courts,
  email: `${uid}@test.local`,
});

function reservationRef(db, id) {
  return doc(db, 'reservas_privadas', id);
}

function occupancyRef(db, court = COURT, day = DAY) {
  return doc(db, 'ocupacion_publica', court, 'dias', day);
}

function indexRef(db, booking) {
  return doc(
    db,
    'indices_reserva', booking.body.canchaId,
    'dias', booking.body.dia,
    'inicios', String(booking.body.minuto),
  );
}

function minutesFor(minute, duration) {
  return Array.from({ length: duration / 30 }, (_, index) => String(minute + index * 30));
}

function makeReservation(db, {
  id,
  uid,
  court = COURT,
  day = DAY,
  minute = 600,
  duration = 60,
  origin = 'publico',
  patch = {},
} = {}) {
  const now = Timestamp.now();
  const body = {
    schemaVersion: 1,
    canchaId: court,
    dia: day,
    minuto: minute,
    duracion: duration,
    minutos: minutesFor(minute, duration),
    estado: duration <= 180 ? 'confirmada' : 'pendiente',
    clienteNombre: 'Cliente privado',
    telefono: '+51999888777',
    montoCentimos: 0,
    adelantoCentimos: 0,
    saldoCentimos: 0,
    metodoPago: '',
    historialPagos: [],
    origen: origin,
    solicitanteUid: origin === 'publico' ? uid : '',
    creadoPor: uid,
    atendidoPor: '',
    createdAt: now,
    updatedAt: now,
    version: 1,
    ...patch,
  };
  return { id, ref: reservationRef(db, id), body };
}

function occupancyData(minuteKeys) {
  return { ocupados: Object.fromEntries(minuteKeys.map(minute => [minute, true])) };
}

function directBatch(db, booking, minuteKeys = booking.body.minutos, omissions = []) {
  const batch = writeBatch(db);
  if (!omissions.includes('reserva')) batch.set(booking.ref, booking.body);
  if (!omissions.includes('indice')) batch.set(indexRef(db, booking), { reservaId: booking.id });
  if (!omissions.includes('ocupacion')) {
    batch.set(
      occupancyRef(db, booking.body.canchaId, booking.body.dia),
      occupancyData(minuteKeys),
      { merge: true },
    );
  }
  return batch;
}

function approvalBatch(db, booking, actor, minuteKeys = booking.body.minutos) {
  const batch = writeBatch(db);
  batch.update(booking.ref, {
    estado: 'confirmada',
    atendidoPor: actor,
    updatedAt: Timestamp.now(),
    version: 2,
  });
  batch.set(indexRef(db, booking), { reservaId: booking.id });
  batch.set(
    occupancyRef(db, booking.body.canchaId, booking.body.dia),
    occupancyData(minuteKeys),
    { merge: true },
  );
  return batch;
}

function cancellationBatch(db, booking, actor, minuteKeys = booking.body.minutos) {
  const batch = writeBatch(db);
  batch.update(booking.ref, {
    estado: 'cancelada',
    atendidoPor: actor,
    updatedAt: Timestamp.now(),
    version: booking.body.version + 1,
  });
  batch.delete(indexRef(db, booking));
  batch.set(
    occupancyRef(db, booking.body.canchaId, booking.body.dia),
    { ocupados: Object.fromEntries(minuteKeys.map(minute => [minute, deleteField()])) },
    { merge: true },
  );
  return batch;
}

let expressionLimitErrors = 0;

function recordError(error) {
  if (String(error?.message ?? error).includes('maximum of 1000 expressions')) {
    expressionLimitErrors += 1;
  }
}

async function succeeds(promise) {
  try {
    return await promise;
  } catch (error) {
    recordError(error);
    throw error;
  }
}

async function denied(promise) {
  try {
    await promise;
    assert.fail('La operacion maliciosa fue aceptada');
  } catch (error) {
    if (error?.code === 'ERR_ASSERTION') throw error;
    recordError(error);
    assert.match(String(error?.code ?? error), /permission-denied|PERMISSION_DENIED/);
  }
}

const tests = [];
const test = (name, run) => tests.push([name, run]);

for (const duration of [30, 60, 120, 180]) {
  test(`reserva directa de ${duration} minutos`, async () => {
    const db = anonymous(WEB_A).firestore();
    const booking = makeReservation(db, {
      id: `r_directa_${duration}_0001`, uid: WEB_A, duration,
    });
    await succeeds(directBatch(db, booking).commit());
    const privateData = (await succeeds(getDoc(booking.ref))).data();
    const publicData = (await succeeds(getDoc(occupancyRef(db)))).data();
    assert.equal(privateData.telefono, '+51999888777');
    assert.deepEqual(Object.keys(publicData), ['ocupados']);
    for (const minute of booking.body.minutos) assert.equal(publicData.ocupados[minute], true);
  });
}

test('inicio mas tardio permitido no supera el limite de expresiones', async () => {
  const db = anonymous(WEB_A).firestore();
  const booking = makeReservation(db, {
    id: 'r_inicio_1470_0001', uid: WEB_A, minute: 1470, duration: 30,
  });
  await succeeds(directBatch(db, booking).commit());
});

for (const duration of [210, 240, 300, 360, 420, 480, 540, 600]) {
  test(`solicitud de ${duration} minutos se ocupa solo al aprobar`, async () => {
    const requester = anonymous(WEB_A).firestore();
    const approver = employee(EMPLOYEE, [COURT]).firestore();
    const booking = makeReservation(requester, {
      id: `r_larga_${duration}_0001`, uid: WEB_A, minute: 900, duration,
    });
    await succeeds(setDoc(booking.ref, booking.body));
    assert.equal((await succeeds(getDoc(occupancyRef(requester)))).exists(), false);
    const approved = { ...booking, ref: reservationRef(approver, booking.id) };
    await succeeds(approvalBatch(approver, approved, EMPLOYEE).commit());
  });
}

test('cada documento obligatorio se rechaza si falta su contraparte', async () => {
  const db = anonymous(WEB_A).firestore();
  for (const omitted of ['reserva', 'indice', 'ocupacion']) {
    const booking = makeReservation(db, {
      id: `r_omite_${omitted}_0001`, uid: WEB_A, minute: 600,
    });
    await denied(directBatch(db, booking, booking.body.minutos, [omitted]).commit());
  }
});

test('ocupacion sola, huecos y franjas adicionales son rechazados', async () => {
  const db = anonymous(WEB_A).firestore();
  await denied(setDoc(occupancyRef(db), occupancyData(['600', '630'])));

  const withGap = makeReservation(db, {
    id: 'r_con_hueco_0001', uid: WEB_A, duration: 180,
    patch: { minutos: ['600', '630', '690', '720', '750', '780'] },
  });
  await denied(directBatch(db, withGap).commit());

  const extra = makeReservation(db, {
    id: 'r_franja_extra_0001', uid: WEB_A, minute: 900,
  });
  await denied(directBatch(db, extra, [...extra.body.minutos, '960']).commit());
});

test('horarios falsos y posteriores al cierre son rechazados', async () => {
  const db = anonymous(WEB_A).firestore();
  const cases = [
    makeReservation(db, { id: 'r_antes_apertura_01', uid: WEB_A, minute: 390 }),
    makeReservation(db, { id: 'r_desalineada_0001', uid: WEB_A, minute: 435 }),
    makeReservation(db, { id: 'r_rebasa_cierre_1', uid: WEB_A, minute: 900, duration: 630 }),
  ];
  for (const booking of cases) {
    const operation = booking.body.estado === 'confirmada'
      ? directBatch(db, booking).commit()
      : setDoc(booking.ref, booking.body);
    await denied(operation);
  }
});

test('el cruce de medianoche permanece en el dia operativo anterior', async () => {
  const db = anonymous(WEB_A).firestore();
  const booking = makeReservation(db, {
    id: 'r_cruza_medianoche_1', uid: WEB_A, minute: 1380, duration: 120,
  });
  await succeeds(directBatch(db, booking).commit());
  const publicData = (await succeeds(getDoc(occupancyRef(db, COURT, DAY)))).data();
  assert.deepEqual(booking.body.minutos, ['1380', '1410', '1440', '1470']);
  assert.equal(publicData.ocupados['1470'], true);
});

test('web y personal concurrentes dejan exactamente un ganador', async () => {
  const web = anonymous(WEB_A).firestore();
  const staff = employee(EMPLOYEE, [COURT]).firestore();
  const first = makeReservation(web, {
    id: 'r_carrera_web_0001', uid: WEB_A, duration: 180,
  });
  const second = makeReservation(staff, {
    id: 'r_carrera_staff_01', uid: EMPLOYEE, duration: 180, origin: 'personal',
  });
  const results = await Promise.allSettled([
    directBatch(web, first).commit(),
    directBatch(staff, second).commit(),
  ]);
  for (const result of results) if (result.status === 'rejected') recordError(result.reason);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
});

test('las tres canchas son independientes', async () => {
  const db = employee(EMPLOYEE, ['la-19', 'la-23', 'la-24']).firestore();
  for (const court of ['la-19', 'la-23', 'la-24']) {
    const booking = makeReservation(db, {
      id: `r_independiente_${court.replace('-', '_')}`,
      uid: EMPLOYEE,
      court,
      origin: 'personal',
    });
    await succeeds(directBatch(db, booking).commit());
  }
});

test('empleado no asignado no aprueba ni cancela', async () => {
  const requester = anonymous(WEB_A).firestore();
  const wrong = employee(OTHER_EMPLOYEE, ['la-23']).firestore();
  const pending = makeReservation(requester, {
    id: 'r_aprobador_invalido', uid: WEB_A, duration: 240,
  });
  await succeeds(setDoc(pending.ref, pending.body));
  await denied(approvalBatch(
    wrong,
    { ...pending, ref: reservationRef(wrong, pending.id) },
    OTHER_EMPLOYEE,
  ).commit());

  const direct = makeReservation(requester, {
    id: 'r_cancelador_invalido', uid: WEB_A, minute: 900,
  });
  await succeeds(directBatch(requester, direct).commit());
  await denied(cancellationBatch(
    wrong,
    { ...direct, ref: reservationRef(wrong, direct.id) },
    OTHER_EMPLOYEE,
  ).commit());
});

test('cancelar conserva la reserva privada y permite una nueva en el mismo inicio', async () => {
  const owner = anonymous(WEB_A).firestore();
  const staff = employee(EMPLOYEE, [COURT]).firestore();
  const first = makeReservation(owner, {
    id: 'r_historial_primera', uid: WEB_A, duration: 60,
  });
  await succeeds(directBatch(owner, first).commit());
  const staffFirst = { ...first, ref: reservationRef(staff, first.id) };
  await succeeds(cancellationBatch(staff, staffFirst, EMPLOYEE).commit());

  const oldData = (await succeeds(getDoc(staffFirst.ref))).data();
  const afterCancel = (await succeeds(getDoc(occupancyRef(owner)))).data();
  assert.equal(oldData.estado, 'cancelada');
  assert.equal(oldData.telefono, '+51999888777');
  assert.deepEqual(afterCancel, { ocupados: {} });
  assert.equal((await getDoc(indexRef(staff, staffFirst))).exists(), false);

  const second = makeReservation(owner, {
    id: 'r_historial_segunda', uid: WEB_A, duration: 60,
    patch: { clienteNombre: 'Segundo cliente', telefono: '+51911111111' },
  });
  await succeeds(directBatch(owner, second).commit());
  assert.equal((await succeeds(getDoc(staffFirst.ref))).data().clienteNombre, 'Cliente privado');
  assert.equal((await succeeds(getDoc(second.ref))).data().clienteNombre, 'Segundo cliente');
});

test('cancelacion parcial y repeticion obsoleta son rechazadas', async () => {
  const owner = anonymous(WEB_A).firestore();
  const staff = employee(EMPLOYEE, [COURT]).firestore();
  const booking = makeReservation(owner, {
    id: 'r_cancelacion_segura', uid: WEB_A, duration: 90,
  });
  await succeeds(directBatch(owner, booking).commit());
  const staffBooking = { ...booking, ref: reservationRef(staff, booking.id) };
  await denied(cancellationBatch(staff, staffBooking, EMPLOYEE, ['600', '630']).commit());
  await succeeds(cancellationBatch(staff, staffBooking, EMPLOYEE).commit());
  await denied(cancellationBatch(staff, staffBooking, EMPLOYEE).commit());
});

test('la lectura publica contiene exclusivamente Libre/Ocupado', async () => {
  const owner = anonymous(WEB_A).firestore();
  const attacker = anonymous(WEB_B).firestore();
  const publicDb = environment.unauthenticatedContext().firestore();
  const booking = makeReservation(owner, {
    id: 'r_privacidad_000001', uid: WEB_A,
  });
  await succeeds(directBatch(owner, booking).commit());
  await denied(getDoc(reservationRef(attacker, booking.id)));
  await denied(getDoc(reservationRef(publicDb, booking.id)));
  await denied(getDoc(indexRef(publicDb, booking)));
  await denied(updateDoc(reservationRef(attacker, booking.id), { telefono: '+51000000000' }));
  const publicData = (await succeeds(getDoc(occupancyRef(publicDb)))).data();
  assert.deepEqual(publicData, { ocupados: { '600': true, '630': true } });
});

let failures = 0;
for (const [name, run] of tests) {
  try {
    await environment.clearFirestore();
    await run();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    recordError(error);
    console.error(`  FALLA  ${name}\n        ${String(error?.message ?? error).split('\n')[0]}`);
  }
}

await environment.cleanup();
console.log(`\n${tests.length - failures}/${tests.length} pruebas pasaron.`);
console.log(`Errores por limite de 1.000 expresiones: ${expressionLimitErrors}.`);
process.exit(failures ? 1 : 0);

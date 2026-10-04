import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  serverTimestamp,
  runTransaction,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Solo emuladores. Ejecuta con firebase emulators:exec.');
}

const here = dirname(fileURLToPath(import.meta.url));
// RULES_PATH permite correr la suite contra una copia mutada (ver
// mutar-operadores.mjs). Sin la variable se leen las reglas activas.
const rules = readFileSync(
  process.env.RULES_PATH || join(here, '..', '..', '..', 'mobile', 'firestore.rules'),
  'utf8',
);

const PROJECT_ID = 'demo-grass-local';
const BUSINESS = 'grass-sintetico';
const COURT = 'la-19';
const ADMIN = 'admin-uid-0001';
const EMPLOYEE = 'empleado-uid-01';
const DEACTIVATED = 'empleado-uid-02';
const NO_RESERVATIONS = 'empleado-uid-03';
const UNLINKED = 'usuario-sin-vinculo';
const ANON_A = 'anonimo-publico-a';
const ANON_B = 'anonimo-publico-b';
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000;

const environment = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    host: '127.0.0.1',
    port: 8081,
    rules,
  },
});

const verified = (uid) => environment.authenticatedContext(uid, {
  email: `${uid}@test.local`,
  email_verified: true,
});

const unverified = (uid) => environment.authenticatedContext(uid, {
  email: `${uid}@test.local`,
  email_verified: false,
});

const anonymous = (uid) => environment.authenticatedContext(uid, {
  firebase: { sign_in_provider: 'anonymous' },
});

function futureLocalDay(days = 2) {
  const local = new Date(Date.now() - LIMA_OFFSET_MS + days * 24 * 60 * 60 * 1000);
  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  const day = String(local.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTimestamp(day, minute) {
  const [year, month, date] = day.split('-').map(Number);
  return Timestamp.fromMillis(Date.UTC(year, month - 1, date, 5, 0) + minute * 60 * 1000);
}

function canonicalSlots(day, minute, duration) {
  const start = localTimestamp(day, minute).toMillis();
  return Array.from({ length: duration / 30 }, (_, index) => {
    const millis = start + index * 30 * 60 * 1000;
    const local = new Date(millis - LIMA_OFFSET_MS);
    const year = String(local.getUTCFullYear());
    const month = String(local.getUTCMonth() + 1).padStart(2, '0');
    const date = String(local.getUTCDate()).padStart(2, '0');
    return {
      dia: `${year}-${month}-${date}`,
      year,
      month,
      day: date,
      minute: String(local.getUTCHours() * 60 + local.getUTCMinutes()),
      inicio: Timestamp.fromMillis(millis),
    };
  });
}

function slotDay(slot) {
  return slot.dia;
}

function agendaRef(db, booking) {
  return doc(
    db, 'negocios', BUSINESS, 'agenda', booking.body.canchaId,
    'dias', booking.body.dia,
  );
}

function publicSlotRef(db, booking) {
  return doc(
    db, 'agenda_publica', BUSINESS, 'canchas', booking.body.canchaId,
    'dias', booking.body.dia,
  );
}

function operationalMinutes(booking) {
  return booking.slots.map((_, index) => String(booking.body.minuto + index * 30));
}

function makeBooking(db, {
  id,
  uid,
  day = futureLocalDay(),
  minute = 600,
  duration = 60,
  court = COURT,
  publicRequest = false,
  block = false,
  patch = {},
} = {}) {
  const slots = canonicalSlots(day, minute, duration);
  const segmentos = [];
  for (const slot of slots) {
    const ultimo = segmentos.at(-1);
    if (ultimo?.dia === slot.dia) {
      ultimo.cantidad += 1;
    } else {
      segmentos.push({
        dia: slot.dia,
        year: slot.year,
        month: slot.month,
        day: slot.day,
        minuto: slot.minute,
        cantidad: 1,
      });
    }
  }
  const collectionName = block ? 'bloqueos' : 'reservas';
  const now = Timestamp.now();
  const body = {
    schemaVersion: 5,
    negocioId: BUSINESS,
    sedeId: court,
    canchaId: court,
    dia: day,
    jornada: {
      year: day.slice(0, 4),
      month: day.slice(5, 7),
      day: day.slice(8, 10),
    },
    minuto: minute,
    duracion: duration,
    minutos: slots.map((_, index) => String(minute + index * 30)),
    inicio: slots[0].inicio,
    fin: Timestamp.fromMillis(slots[0].inicio.toMillis() + duration * 60 * 1000),
    estado: duration > 180 ? 'pendiente' : 'confirmada',
    bloqueo: block,
    clienteId: '',
    clienteNombre: block ? 'Mantenimiento' : 'Cliente privado',
    telefono: block ? '' : '+51999888777',
    montoCentimos: 0,
    adelantoCentimos: 0,
    saldoCentimos: 0,
    metodoPago: '',
    promocionId: '',
    historialPagos: [],
    origen: publicRequest ? 'publico' : 'personal',
    solicitanteUid: publicRequest ? uid : '',
    creadoPor: uid,
    atendidoPor: duration > 180 || publicRequest ? '' : uid,
    createdAt: now,
    updatedAt: now,
    version: 1,
    ...patch,
  };
  return {
    id,
    collectionName,
    ref: doc(db, 'negocios', BUSINESS, collectionName, id),
    body,
    slots,
  };
}

function bookingBatch(db, booking, slotIndexes = booking.slots.map((_, index) => index)) {
  const batch = writeBatch(db);
  batch.set(booking.ref, booking.body);
  if (booking.body.estado === 'confirmada') {
    const minutos = operationalMinutes(booking).filter((_, index) => slotIndexes.includes(index));
    batch.set(agendaRef(db, booking), {
      ocupados: Object.fromEntries(minutos.map(minuto => [minuto, true])),
      ultimaOperacion: {
        reservaId: booking.id,
        coleccion: booking.collectionName,
        tipo: 'ocupar',
        minutos,
      },
    }, { merge: true });
    batch.set(publicSlotRef(db, booking), {
      ocupados: Object.fromEntries(minutos.map(minuto => [minuto, true])),
    }, { merge: true });
  }
  return batch;
}

function promotionBatch(db, id, contenido) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'negocios', BUSINESS, 'promociones', id), {
    ...contenido,
    actualizadoPor: 'autor-desconocido',
  });
  batch.set(doc(db, 'promociones_publicas', id), {
    negocioId: BUSINESS,
    ...contenido,
    actualizadoEn: Timestamp.now(),
  });
  return batch;
}

function cancellationBatch(db, booking, actor, slotIndexes = booking.slots.map((_, index) => index)) {
  const batch = writeBatch(db);
  batch.update(booking.ref, {
    estado: 'cancelada',
    atendidoPor: actor,
    updatedAt: Timestamp.now(),
    version: booking.body.version + 1,
  });
  const minutos = operationalMinutes(booking).filter((_, index) => slotIndexes.includes(index));
  batch.set(agendaRef(db, booking), {
    ocupados: Object.fromEntries(minutos.map(minuto => [minuto, deleteField()])),
    ultimaOperacion: {
      reservaId: booking.id,
      coleccion: booking.collectionName,
      tipo: 'liberar',
      minutos,
    },
  }, { merge: true });
  batch.set(publicSlotRef(db, booking), {
    ocupados: Object.fromEntries(minutos.map(minuto => [minuto, deleteField()])),
  }, { merge: true });
  return batch;
}

function approvalBatch(db, booking, actor) {
  const batch = writeBatch(db);
  const minutos = operationalMinutes(booking);
  batch.update(booking.ref, {
    estado: 'confirmada',
    atendidoPor: actor,
    updatedAt: Timestamp.now(),
    version: booking.body.version + 1,
  });
  batch.set(agendaRef(db, booking), {
    ocupados: Object.fromEntries(minutos.map(minuto => [minuto, true])),
    ultimaOperacion: {
      reservaId: booking.id,
      coleccion: booking.collectionName,
      tipo: 'ocupar',
      minutos,
    },
  }, { merge: true });
  batch.set(publicSlotRef(db, booking), {
    ocupados: Object.fromEntries(minutos.map(minuto => [minuto, true])),
  }, { merge: true });
  return batch;
}

// Toda asercion de estado pasa por una relectura del servidor: jamas se afirma
// sobre el cuerpo que el cliente construyo, porque eso no prueba nada. El lector
// puede ser otro cliente porque la agenda privada no es legible por el publico.
async function assertEstadoYAgenda(escritor, booking, esperado, lector = escritor) {
  const refLectura = doc(lector, 'negocios', BUSINESS, booking.collectionName, booking.id);
  const stored = (await getDoc(refLectura)).data();
  const minutos = operationalMinutes(booking);
  assert.equal(stored.estado, esperado);
  assert.equal(stored.version, 1);
  assert.deepEqual(stored.minutos, minutos);
  const agenda = await getDoc(agendaRef(lector, booking));
  const publica = await getDoc(publicSlotRef(lector, booking));
  if (esperado === 'confirmada') {
    const ocupados = Object.fromEntries(minutos.map(minuto => [minuto, true]));
    assert.deepEqual(agenda.data().ocupados, ocupados);
    assert.deepEqual(publica.data().ocupados, ocupados);
    assert.equal(agenda.data().ultimaOperacion.reservaId, booking.id);
    assert.equal(agenda.data().ultimaOperacion.tipo, 'ocupar');
    assert.deepEqual(agenda.data().ultimaOperacion.minutos, minutos);
  } else {
    assert.equal(agenda.exists(), false);
    assert.equal(publica.exists(), false);
  }
  return stored;
}

function employeeRecord({ active = true, reservations = true, rol = 'empleado_control' } = {}) {
  return {
    nombre: 'Empleado de control',
    email: 'empleado@test.local',
    rol,
    activo: active,
    permisos: {
      agenda: true,
      reservas: reservations,
      clientes: true,
      promociones: true,
    },
    sedes: [COURT],
    sedePrincipal: COURT,
  };
}

async function seedAnchor() {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'sistema', 'grass'), {
      administradorUid: ADMIN,
      negocioId: BUSINESS,
      zonaHoraria: 'America/Lima',
    });
  });
}

async function seedApplication() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'sistema', 'grass'), {
      administradorUid: ADMIN,
      negocioId: BUSINESS,
      zonaHoraria: 'America/Lima',
    });
    batch.set(doc(db, 'negocios', BUSINESS), {
      propietarioUid: ADMIN,
      nombreNegocio: 'Grass Sintetico',
      preparado: true,
      aperturaMinuto: 420,
      cierreMinuto: 60,
      duracionTurnoMinutos: 30,
    });
    for (const id of ['la-19', 'la-23', 'la-24']) {
      batch.set(doc(db, 'negocios', BUSINESS, 'sedes', id), {
        id,
        nombre: `Sede ${id}`,
      });
      batch.set(doc(db, 'negocios', BUSINESS, 'canchas', id), {
        id,
        sedeId: id,
        negocioId: BUSINESS,
        nombre: `Cancha ${id}`,
        direccion: `Direccion ${id}`,
        activa: true,
        tarifaTurnoCentimos: 2500,
      });
    }
    batch.set(doc(db, 'negocios', BUSINESS, 'empleados', EMPLOYEE), employeeRecord());
    batch.set(doc(db, 'negocios', BUSINESS, 'empleados', DEACTIVATED), employeeRecord({ active: false }));
    batch.set(doc(db, 'negocios', BUSINESS, 'empleados', NO_RESERVATIONS), employeeRecord({ reservations: false }));
    for (const uid of [ADMIN, EMPLOYEE, DEACTIVATED, NO_RESERVATIONS, UNLINKED]) {
      batch.set(doc(db, 'users', uid), { negocioId: BUSINESS, email: `${uid}@test.local` });
    }
    await batch.commit();
  });
}

async function seedPublicProjections() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'canchas_publicas', COURT), {
      id: COURT,
      negocioId: BUSINESS,
      nombre: 'Cancha publica activa',
      sedeId: COURT,
      direccion: 'Direccion publica',
      activa: true,
      tarifaTurnoCentimos: 2500,
      actualizadoEn: Timestamp.now(),
    });
    batch.set(doc(db, 'canchas_publicas', 'la-23'), {
      id: 'la-23',
      negocioId: BUSINESS,
      nombre: 'Cancha privada inactiva',
      sedeId: 'la-23',
      direccion: 'No visible',
      activa: false,
      tarifaTurnoCentimos: 2500,
      actualizadoEn: Timestamp.now(),
    });
    batch.set(doc(db, 'promociones_publicas', 'promo-activa'), {
      negocioId: BUSINESS,
      titulo: 'Promocion publica',
      descripcion: 'Visible',
      sedes: [COURT],
      desde: futureLocalDay(),
      hasta: futureLocalDay(10),
      activa: true,
      descuentoCentimos: 500,
      actualizadoEn: Timestamp.now(),
    });
    batch.set(doc(db, 'promociones_publicas', 'promo-inactiva'), {
      negocioId: BUSINESS,
      titulo: 'Promocion interna',
      descripcion: 'No visible',
      sedes: [COURT],
      desde: futureLocalDay(),
      hasta: futureLocalDay(10),
      activa: false,
      descuentoCentimos: 500,
      actualizadoEn: Timestamp.now(),
    });
    batch.set(doc(db, 'negocios_publicos', BUSINESS), {
      negocioId: BUSINESS,
      slug: 'grass-sintetico',
      nombre: 'Grass Sintetico',
      descripcion: 'Informacion publica',
      galeria: [],
      aperturaMinuto: 420,
      cierreMinuto: 60,
      duracionTurnoMinutos: 30,
    });
    await batch.commit();
  });
}

async function seedBooking(booking) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const seeded = {
      ...booking,
      ref: doc(db, 'negocios', BUSINESS, booking.collectionName, booking.id),
    };
    await bookingBatch(db, seeded).commit();
  });
}

const tests = [];
const test = (name, run, motivo) => tests.push([name, run, motivo]);

test('el ancla es inmutable y solo el administrador verificado completa la configuracion', async () => {
  const admin = verified(ADMIN).firestore();
  await assertFails(setDoc(doc(admin, 'negocios', BUSINESS), {
    propietarioUid: ADMIN,
    preparado: true,
  }));

  await seedAnchor();
  await assertSucceeds(getDoc(doc(admin, 'sistema', 'grass')));
  await assertFails(setDoc(doc(admin, 'sistema', 'grass'), {
    administradorUid: UNLINKED,
    negocioId: BUSINESS,
  }));
  await assertFails(deleteDoc(doc(admin, 'sistema', 'grass')));

  await assertSucceeds(setDoc(doc(admin, 'negocios', BUSINESS), {
    propietarioUid: ADMIN,
    preparado: false,
    zonaHoraria: 'America/Lima',
    aperturaMinuto: 0,
    cierreMinuto: 1440,
    duracionTurnoMinutos: 30,
  }));
  await assertFails(updateDoc(doc(admin, 'negocios', BUSINESS), { propietarioUid: UNLINKED }));
  // Una cancha nace sin direccion ni tarifa: todavia no es reservable.
  await assertSucceeds(setDoc(doc(admin, 'negocios', BUSINESS, 'canchas', COURT), {
    id: COURT,
    sedeId: COURT,
    negocioId: BUSINESS,
    nombre: 'Cancha La 19',
    direccion: '',
    activa: false,
    tarifaTurnoCentimos: null,
  }));
  const activarCancha = writeBatch(admin);
  activarCancha.update(doc(admin, 'negocios', BUSINESS, 'canchas', COURT), {
    direccion: 'Direccion de prueba',
    activa: true,
    tarifaTurnoCentimos: 2500,
  });
  activarCancha.set(doc(admin, 'canchas_publicas', COURT), {
    id: COURT,
    negocioId: BUSINESS,
    nombre: 'Cancha La 19',
    sedeId: COURT,
    direccion: 'Direccion de prueba',
    activa: true,
    tarifaTurnoCentimos: 2500,
    actualizadoEn: Timestamp.now(),
  });
  await assertSucceeds(activarCancha.commit());
  await assertSucceeds(setDoc(doc(admin, 'negocios', BUSINESS, 'empleados', 'nuevo-empleado'), employeeRecord({ active: false })));
  await assertSucceeds(updateDoc(doc(admin, 'negocios', BUSINESS, 'empleados', 'nuevo-empleado'), { activo: true }));
});

test('el administrador no verificado queda denegado pero un empleado activo no verificado opera', async () => {
  await seedApplication();
  const admin = unverified(ADMIN).firestore();
  const employee = unverified(EMPLOYEE).firestore();
  await assertFails(getDoc(doc(admin, 'negocios', BUSINESS)));
  await assertFails(bookingBatch(admin, makeBooking(admin, {
    id: 'admin-unverified',
    uid: ADMIN,
    duration: 30,
  })).commit());
  await assertSucceeds(getDoc(doc(employee, 'negocios', BUSINESS)));
  await assertSucceeds(bookingBatch(employee, makeBooking(employee, {
    id: 'employee-unverified',
    uid: EMPLOYEE,
    duration: 30,
  })).commit());
});

test('empleados activos, desactivados y no vinculados quedan correctamente aislados', async () => {
  await seedApplication();
  const active = verified(EMPLOYEE).firestore();
  const deactivated = verified(DEACTIVATED).firestore();
  const unlinked = verified(UNLINKED).firestore();
  await assertSucceeds(getDoc(doc(active, 'negocios', BUSINESS)));
  await assertSucceeds(getDocs(query(collection(active, 'negocios', BUSINESS, 'reservas'), limit(1500))));
  await assertFails(getDoc(doc(deactivated, 'negocios', BUSINESS)));
  await assertFails(getDocs(query(collection(deactivated, 'negocios', BUSINESS, 'reservas'), limit(1500))));
  await assertFails(getDoc(doc(unlinked, 'negocios', BUSINESS)));
  await assertFails(getDocs(query(collection(unlinked, 'negocios', BUSINESS, 'reservas'), limit(1500))));
});

test('un empleado desactivado tampoco puede escribir', async () => {
  await seedApplication();
  const deactivated = verified(DEACTIVATED).firestore();
  // El aislamiento de arriba solo mira lecturas. Aqui se intenta escribir de
  // verdad: una reserva corta confirmada con su agenda y su espejo.
  const booking = makeBooking(deactivated, { id: 'r_desactivado', uid: DEACTIVATED, duration: 30 });
  await assertFails(bookingBatch(deactivated, booking).commit());
  // Y aprobar una solicitud larga, que es la via de escritura mas delicada.
  const pendiente = makeBooking(deactivated, {
    id: 'r_desactivado_larga', uid: EMPLOYEE, duration: 240, minute: 900,
  });
  await seedBooking(pendiente);
  await assertFails(approvalBatch(deactivated, pendiente, DEACTIVATED).commit());
});

test('reclamar la configuracion exige correo verificado y ancla sin dono', async () => {
  // Sistema sin ancla: la unica forma de crearlo es reclamoValido.
  const sinVerificar = unverified('usuario-sin-verificar').firestore();
  const ancla = {
    administradorUid: 'usuario-sin-verificar',
    negocioId: BUSINESS,
    zonaHoraria: 'America/Lima',
  };
  await assertFails(setDoc(doc(sinVerificar, 'sistema', 'grass'), ancla));
  await assertSucceeds(setDoc(doc(verified('usuario-sin-verificar').firestore(), 'sistema', 'grass'), ancla));
  // Ya existe el ancla: nadie puede reclamar ni sustituir al administrador.
  await assertFails(setDoc(doc(verified(UNLINKED).firestore(), 'sistema', 'grass'), {
    ...ancla,
    administradorUid: UNLINKED,
  }));
});

test('un rol que no sea de control no escribe, y sin sesion tampoco', async () => {
  await seedApplication();
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'negocios', BUSINESS, 'empleados', NO_RESERVATIONS),
      employeeRecord({ rol: 'recepcion' }));
  });
  const recepcion = verified(NO_RESERVATIONS).firestore();
  const booking = makeBooking(recepcion, {
    id: 'r_rol_recepcion', uid: NO_RESERVATIONS, duration: 30,
  });
  await assertFails(bookingBatch(recepcion, booking).commit());

  // Sin sesion no se entra ni por la rama de empleado ni por la de admin.
  const sinSesion = environment.unauthenticatedContext().firestore();
  const anonima = makeBooking(sinSesion, {
    id: 'r_sin_sesion', uid: ANON_A, duration: 30, publicRequest: true,
  });
  await assertFails(bookingBatch(sinSesion, anonima).commit());
  await assertFails(setDoc(doc(sinSesion, 'sistema', 'grass'), {
    administradorUid: ANON_A,
    negocioId: BUSINESS,
    zonaHoraria: 'America/Lima',
  }));
});

test('los negocios no se enumeran; se consulta el id configurado', async () => {
  await seedApplication();
  const admin = verified(ADMIN).firestore();
  await assertFails(getDocs(query(collection(admin, 'negocios'), limit(10))));
  await assertFails(getDocs(query(collection(admin, 'negocios'), limit(11))));
});

test('la consulta de empleados respeta el limite maximo de 100', async () => {
  await seedApplication();
  const admin = verified(ADMIN).firestore();
  await assertSucceeds(getDocs(query(collection(admin, 'negocios', BUSINESS, 'empleados'), limit(100))));
  await assertFails(getDocs(query(collection(admin, 'negocios', BUSINESS, 'empleados'), limit(101))));
});

test('la consulta de clientes respeta el limite maximo de 50', async () => {
  await seedApplication();
  const admin = verified(ADMIN).firestore();
  await assertSucceeds(getDocs(query(collection(admin, 'negocios', BUSINESS, 'clientes'), limit(50))));
  await assertFails(getDocs(query(collection(admin, 'negocios', BUSINESS, 'clientes'), limit(51))));
});

test('la consulta de promociones respeta el limite maximo de 100', async () => {
  await seedApplication();
  const admin = verified(ADMIN).firestore();
  await assertSucceeds(getDocs(query(collection(admin, 'negocios', BUSINESS, 'promociones'), limit(100))));
  await assertFails(getDocs(query(collection(admin, 'negocios', BUSINESS, 'promociones'), limit(101))));
});

test('las consultas de reservas y bloqueos respetan el limite maximo de 1500', async () => {
  await seedApplication();
  const admin = verified(ADMIN).firestore();
  await assertSucceeds(getDocs(query(collection(admin, 'negocios', BUSINESS, 'reservas'), limit(1500))));
  await assertFails(getDocs(query(collection(admin, 'negocios', BUSINESS, 'reservas'), limit(1501))));
  await assertSucceeds(getDocs(query(collection(admin, 'negocios', BUSINESS, 'bloqueos'), limit(1500))));
});

test('permisos de empleado y escrituras maliciosas no escalan privilegios', async () => {
  await seedApplication();
  const employee = verified(EMPLOYEE).firestore();
  const restricted = verified(NO_RESERVATIONS).firestore();
  await assertSucceeds(setDoc(doc(employee, 'negocios', BUSINESS, 'clientes', 'cliente-9'), {
    nombre: 'Ana Ruiz',
    nombreBusqueda: 'ana ruiz',
    telefono: '+51999888777',
  }));
  await assertSucceeds(promotionBatch(employee, 'promo-9', {
    titulo: 'Promo valida',
    descripcion: 'Descripcion',
    descuentoCentimos: 500,
    activa: true,
    desde: futureLocalDay(),
    hasta: futureLocalDay(10),
    sedes: [COURT],
  }).commit());
  await assertFails(updateDoc(doc(employee, 'negocios', BUSINESS, 'empleados', EMPLOYEE), { rol: 'administrador' }));
  await assertFails(updateDoc(doc(employee, 'negocios', BUSINESS, 'empleados', EMPLOYEE), { activo: false }));
  await assertFails(updateDoc(doc(employee, 'negocios', BUSINESS, 'canchas', COURT), { activa: false }));
  await assertFails(bookingBatch(restricted, makeBooking(restricted, {
    id: 'sin-permiso-reservas',
    uid: NO_RESERVATIONS,
  })).commit());
  const forged = makeBooking(employee, {
    id: 'creador-falsificado',
    uid: EMPLOYEE,
    patch: { creadoPor: ADMIN },
  });
  await assertFails(bookingBatch(employee, forged).commit());
});

test('una reserva publica directa guarda segmentos canonicos y datos privados', async () => {
  await seedApplication();
  const db = anonymous(ANON_A).firestore();
  const booking = makeBooking(db, {
    id: 'r_publica_000001',
    uid: ANON_A,
    publicRequest: true,
    duration: 60,
  });
  await assertSucceeds(bookingBatch(db, booking).commit());
  const stored = (await getDoc(booking.ref)).data();
  assert.equal(stored.schemaVersion, 5);
  assert.equal(stored.estado, 'confirmada');
  assert.equal(stored.solicitanteUid, ANON_A);
  assert.equal(stored.clienteNombre, 'Cliente privado');
  assert.equal(stored.telefono, '+51999888777');
  assert.equal(stored.metodoPago, '');
  assert.deepEqual(stored.minutos, ['600', '630']);
  assert.ok(stored.inicio instanceof Timestamp);

  const extra = makeBooking(db, {
    id: 'r_publica_extra01',
    uid: ANON_A,
    publicRequest: true,
    duration: 60,
    minute: 660,
    patch: { notaPrivada: 'campo no autorizado' },
  });
  await assertFails(bookingBatch(db, extra).commit());

  const pagoInventado = makeBooking(db, {
    id: 'r_publica_pago001',
    uid: ANON_A,
    publicRequest: true,
    duration: 60,
    minute: 720,
    patch: { metodoPago: 'efectivo' },
  });
  await assertFails(bookingBatch(db, pagoInventado).commit());

  const montoInventado = makeBooking(db, {
    id: 'r_publica_monto01',
    uid: ANON_A,
    publicRequest: true,
    duration: 60,
    minute: 720,
    patch: { montoCentimos: 1000, saldoCentimos: 1000 },
  });
  await assertFails(bookingBatch(db, montoInventado).commit());
});

test('el personal conserva nombre y telefono sin inventar precio ni pago', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();
  const booking = makeBooking(db, {
    id: 'personal-minima',
    uid: EMPLOYEE,
    duration: 30,
    patch: {
      clienteId: '',
      telefono: '+51999888777',
      montoCentimos: 0,
      adelantoCentimos: 0,
      saldoCentimos: 0,
      metodoPago: '',
    },
  });
  await assertSucceeds(bookingBatch(db, booking).commit());
  const stored = (await getDoc(booking.ref)).data();
  assert.equal(stored.clienteNombre, 'Cliente privado');
  assert.equal(stored.clienteId, '');
  assert.equal(stored.telefono, '+51999888777');
  assert.equal(stored.montoCentimos, 0);
  assert.equal(stored.metodoPago, '');
});

test('los datos de reservas son privados incluso para otros solicitantes publicos', async () => {
  await seedApplication();
  const owner = anonymous(ANON_A).firestore();
  const other = anonymous(ANON_B).firestore();
  const unauthenticated = environment.unauthenticatedContext().firestore();
  const booking = makeBooking(owner, {
    id: 'r_privada_000001',
    uid: ANON_A,
    publicRequest: true,
    duration: 60,
  });
  await bookingBatch(owner, booking).commit();
  await assertSucceeds(getDoc(booking.ref));
  await assertFails(getDoc(doc(other, 'negocios', BUSINESS, 'reservas', booking.id)));
  await assertFails(getDoc(doc(unauthenticated, 'negocios', BUSINESS, 'reservas', booking.id)));
  await assertFails(getDocs(query(
    collection(owner, 'negocios', BUSINESS, 'reservas'),
    where('solicitanteUid', '==', ANON_A),
    limit(1500),
  )));
  const employee = verified(EMPLOYEE).firestore();
  await assertSucceeds(getDoc(doc(employee, 'negocios', BUSINESS, 'reservas', booking.id)));
});

test('las proyecciones publicas exponen solo activos y no filtran datos privados', async () => {
  await seedApplication();
  await seedPublicProjections();
  const publicDb = environment.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(publicDb, 'canchas_publicas', COURT)));
  await assertFails(getDoc(doc(publicDb, 'canchas_publicas', 'la-23')));
  await assertSucceeds(getDocs(query(
    collection(publicDb, 'canchas_publicas'),
    where('activa', '==', true),
  )));
  await assertFails(getDocs(collection(publicDb, 'canchas_publicas')));
  await assertSucceeds(getDoc(doc(publicDb, 'promociones_publicas', 'promo-activa')));
  await assertFails(getDoc(doc(publicDb, 'promociones_publicas', 'promo-inactiva')));
  await assertSucceeds(getDoc(doc(publicDb, 'negocios_publicos', BUSINESS)));
  await assertFails(getDoc(doc(publicDb, 'negocios', BUSINESS)));
  await assertFails(getDoc(doc(publicDb, 'negocios', BUSINESS, 'empleados', EMPLOYEE)));
  await assertFails(getDocs(query(collection(publicDb, 'negocios', BUSINESS, 'reservas'), limit(1500))));

  const admin = verified(ADMIN).firestore();
  await assertFails(setDoc(doc(admin, 'canchas_publicas', COURT), {
    id: COURT,
    negocioId: BUSINESS,
    nombre: 'Intento de filtrar telefono',
    sedeId: COURT,
    direccion: 'Publica',
    activa: true,
    tarifaTurnoCentimos: 2500,
    actualizadoEn: Timestamp.now(),
    telefonoCliente: '+51999888777',
  }));
});

test('la agenda publica solo expone ocupado y no puede fabricarse ni liberarse', async () => {
  await seedApplication();
  const employee = verified(EMPLOYEE).firestore();
  const attacker = anonymous(ANON_B).firestore();
  const publicDb = environment.unauthenticatedContext().firestore();
  const booking = makeBooking(employee, {
    id: 'proyeccion-minima', uid: EMPLOYEE, duration: 60,
  });
  await assertSucceeds(bookingBatch(employee, booking).commit());

  const privateRef = agendaRef(publicDb, booking);
  const publicRef = publicSlotRef(publicDb, booking);
  await assertFails(getDoc(privateRef));
  const visible = (await assertSucceeds(getDoc(publicRef))).data();
  assert.deepEqual(visible, { ocupados: { '600': true, '630': true } });

  const free = makeBooking(attacker, {
    id: 'proyeccion-falsa', uid: ANON_B, minute: 900, duration: 30,
  });
  await assertFails(setDoc(publicSlotRef(attacker, free), { ocupado: true }));
  await assertFails(setDoc(publicSlotRef(attacker, free), {
    ocupado: true,
    reservaId: 'dato-interno',
  }));
  await assertFails(deleteDoc(publicSlotRef(attacker, booking)));
  await assertFails(deleteDoc(publicSlotRef(employee, booking)));
});

for (const duration of [30, 60, 90, 120, 150, 180, 210, 240, 300, 360, 420, 480, 540, 600]) {
  test(`el personal reserva ${duration} minutos dentro de los limites`, async () => {
    await seedApplication();
    const employee = verified(EMPLOYEE).firestore();
    const personal = makeBooking(employee, {
      id: `duracion-personal-${duration}`,
      uid: EMPLOYEE,
      duration,
    });
    await assertSucceeds(bookingBatch(employee, personal).commit());
    await assertEstadoYAgenda(employee, personal, duration <= 180 ? 'confirmada' : 'pendiente');
  });

  test(`el publico ${duration % 60 ? "rechaza" : "reserva"} ${duration} minutos`, async () => {
    await seedApplication();
    const publicDb = anonymous(ANON_A).firestore();
    const publica = makeBooking(publicDb, {
      id: `r_duracion_publica_${duration}`,
      uid: ANON_A,
      publicRequest: true,
      duration,
    });
    if (duration % 60) {
      await assertFails(bookingBatch(publicDb, publica).commit());
      return;
    }
    await assertSucceeds(bookingBatch(publicDb, publica).commit());
    await assertEstadoYAgenda(
      publicDb,
      publica,
      duration <= 180 ? 'confirmada' : 'pendiente',
      verified(ADMIN).firestore(),
    );
  });
}

test('solo el empleado asignado aprueba una solicitud larga tras comprobar disponibilidad', async () => {
  await seedApplication();
  const requester = anonymous(ANON_A).firestore();
  const unassigned = verified(EMPLOYEE).firestore();
  const booking = makeBooking(requester, {
    id: 'r_aprobacion_larga_01',
    uid: ANON_A,
    publicRequest: true,
    court: 'la-23',
    duration: 240,
  });
  await assertSucceeds(bookingBatch(requester, booking).commit());
  assert.equal((await getDoc(publicSlotRef(requester, booking))).exists(), false);

  const deniedBooking = {
    ...booking,
    ref: doc(unassigned, 'negocios', BUSINESS, 'reservas', booking.id),
  };
  await assertFails(approvalBatch(unassigned, deniedBooking, EMPLOYEE).commit());
  // Tambien el alta directa y la solicitud pendiente exigen asignacion.
  await assertFails(bookingBatch(unassigned, makeBooking(unassigned, {
    id:'sin-sede-corta',uid:EMPLOYEE,court:'la-23',minute:1200,duration:30,
  })).commit());
  await assertFails(bookingBatch(unassigned, makeBooking(unassigned, {
    id:'sin-sede-larga',uid:EMPLOYEE,court:'la-23',minute:1200,duration:240,
  })).commit());

  const admin = verified(ADMIN).firestore();
  await assertFails(approvalBatch(admin, {...booking,ref:doc(admin,'negocios',BUSINESS,'reservas',booking.id)},ADMIN).commit());
  await environment.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(),'negocios',BUSINESS,'empleados',EMPLOYEE),{sedes:['la-19','la-23']});
  });
  const assigned = verified(EMPLOYEE).firestore();
  const approvedBooking = {
    ...booking,
    ref: doc(assigned, 'negocios', BUSINESS, 'reservas', booking.id),
  };
  await assertSucceeds(approvalBatch(assigned, approvedBooking, EMPLOYEE).commit());
  const visible = (await getDoc(publicSlotRef(requester, booking))).data();
  assert.equal(visible.ocupados['600'], true);
});

test('reserva y slots estan completamente acoplados en ambas direcciones', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();

  const withoutSlots = makeBooking(db, { id: 'sin-slots', uid: EMPLOYEE });
  await assertFails(bookingBatch(db, withoutSlots, []).commit());

  const missingOne = makeBooking(db, { id: 'falta-un-slot', uid: EMPLOYEE });
  await assertFails(bookingBatch(db, missingOne, [0]).commit());

  const orphan = makeBooking(db, { id: 'slot-huerfano', uid: EMPLOYEE, minute: 720 });
  await assertFails(setDoc(
    agendaRef(db, orphan),
    {
      ocupados: { '720': true, '750': true },
      ultimaOperacion: {
        reservaId: orphan.id,
        coleccion: orphan.collectionName,
        tipo: 'ocupar',
        minutos: ['720', '750'],
      },
    },
  ));

  const numericMap = makeBooking(db, { id: 'mapa-no-canonico', uid: EMPLOYEE, minute: 780 });
  numericMap.body.minutos[0] = 780;
  await assertFails(bookingBatch(db, numericMap).commit());

  const wrongDay = makeBooking(db, { id: 'dia-no-canonico', uid: EMPLOYEE, minute: 810 });
  wrongDay.body.dia = '2099-01-01';
  await assertFails(bookingBatch(db, wrongDay).commit());

  const wrongMinute = makeBooking(db, { id: 'minuto-no-canonico', uid: EMPLOYEE, minute: 870 });
  wrongMinute.body.minuto = 900;
  await assertFails(bookingBatch(db, wrongMinute).commit());

  const complete = makeBooking(db, {
    id: 'acoplamiento-completo',
    uid: EMPLOYEE,
    minute: 840,
    duration: 30,
  });
  await assertSucceeds(bookingBatch(db, complete).commit());
  const agendaCompleta = (await getDoc(agendaRef(db, complete))).data();
  assert.equal(agendaCompleta.ocupados['840'], true);
});

test('admin, empleado y publico compitiendo por el mismo slot dejan exactamente un ganador', async () => {
  await seedApplication();
  const admin = verified(ADMIN).firestore();
  const employee = verified(EMPLOYEE).firestore();
  const publicDb = anonymous(ANON_A).firestore();
  const contenders = [
    [admin, makeBooking(admin, { id: 'carrera-admin', uid: ADMIN, duration: 30 })],
    [employee, makeBooking(employee, { id: 'carrera-empleado', uid: EMPLOYEE, duration: 30 })],
    [publicDb, makeBooking(publicDb, {
      id: 'r_carrera_publica',
      uid: ANON_A,
      duration: 30,
      publicRequest: true,
    })],
  ];
  const results = await Promise.allSettled(
    contenders.map(([db, booking]) => bookingBatch(db, booking).commit()),
  );
  assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);

  const reservations = await getDocs(query(
    collection(admin, 'negocios', BUSINESS, 'reservas'),
    limit(1500),
  ));
  assert.equal(reservations.size, 1);
  assert.equal((await getDoc(agendaRef(admin, contenders[0][1]))).exists(), true);
});

// Lote con una reserva y una agenda que declara minutos arbitrarios: sirve para
// atacar la acoplamiento sin pasar por bookingBatch.
function ocuparBatch(db, booking, minutos, {
  incluirAgenda = true,
  incluirPublico = true,
  reservaId = booking.id,
} = {}) {
  const batch = writeBatch(db);
  batch.set(booking.ref, booking.body);
  if (incluirAgenda) {
    batch.set(agendaRef(db, booking), {
      ocupados: Object.fromEntries(minutos.map(minuto => [minuto, true])),
      ultimaOperacion: {
        reservaId,
        coleccion: booking.collectionName,
        tipo: 'ocupar',
        minutos,
      },
    }, { merge: true });
  }
  if (incluirPublico) {
    batch.set(publicSlotRef(db, booking), {
      ocupados: Object.fromEntries(minutos.map(minuto => [minuto, true])),
    }, { merge: true });
  }
  return batch;
}

function transicionBatch(db, booking, actor, extra = {}) {
  const batch = writeBatch(db);
  batch.update(booking.ref, {
    estado: 'cancelada',
    atendidoPor: actor,
    updatedAt: Timestamp.now(),
    version: booking.body.version + 1,
    ...extra,
  });
  const minutos = operationalMinutes(booking);
  batch.set(agendaRef(db, booking), {
    ocupados: Object.fromEntries(minutos.map(minuto => [minuto, deleteField()])),
    ultimaOperacion: {
      reservaId: booking.id,
      coleccion: booking.collectionName,
      tipo: 'liberar',
      minutos,
    },
  }, { merge: true });
  batch.set(publicSlotRef(db, booking), {
    ocupados: Object.fromEntries(minutos.map(minuto => [minuto, deleteField()])),
  }, { merge: true });
  return batch;
}

test('dos reservas solapadas se rechazan en lotes separados', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();

  const ancla = makeBooking(db, { id: 'solape-ancla', uid: EMPLOYEE, minute: 600, duration: 60 });
  await assertSucceeds(bookingBatch(db, ancla).commit());

  // Solapamiento total: identico inicio y duracion.
  const total = makeBooking(db, { id: 'solape-total', uid: EMPLOYEE, minute: 600, duration: 60 });
  await assertFails(bookingBatch(db, total).commit());

  // Solapamiento parcial por el final: empieza dentro y termina fuera.
  const parcialFinal = makeBooking(db, { id: 'solape-parcial-final', uid: EMPLOYEE, minute: 630, duration: 60 });
  await assertFails(bookingBatch(db, parcialFinal).commit());

  // Solapamiento parcial por el inicio: termina dentro de la ancla.
  const parcialInicio = makeBooking(db, { id: 'solape-parcial-inicio', uid: EMPLOYEE, minute: 570, duration: 60 });
  await assertFails(bookingBatch(db, parcialInicio).commit());

  // Contenido exacto, un minuto menos: sigue siendo solapamiento.
  const casi = makeBooking(db, { id: 'solape-casi', uid: EMPLOYEE, minute: 630, duration: 30 });
  await assertFails(bookingBatch(db, casi).commit());

  // Ninguna escritura llego al servidor y la agenda quedo intacta.
  for (const id of ['solape-total', 'solape-parcial-final', 'solape-parcial-inicio', 'solape-casi']) {
    assert.equal((await getDoc(doc(db, 'negocios', BUSINESS, 'reservas', id))).exists(), false, id);
  }
  const agenda = (await getDoc(agendaRef(db, ancla))).data();
  assert.deepEqual(agenda.ocupados, { '600': true, '630': true });
  assert.deepEqual((await getDoc(publicSlotRef(db, ancla))).data().ocupados, { '600': true, '630': true });
  assert.equal(agenda.ultimaOperacion.reservaId, 'solape-ancla');
});

test('dos reservas solapadas se rechazan dentro de un mismo lote', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();

  const ancla = makeBooking(db, { id: 'lote-ancla', uid: EMPLOYEE, minute: 600, duration: 60 });
  await assertSucceeds(bookingBatch(db, ancla).commit());

  // Mismo lote: la reserva entra junto a una agenda que pisa minutos ya
  // ocupados. Todas las escrituras viajan en un solo commit.
  const invasor = makeBooking(db, { id: 'lote-invasor', uid: EMPLOYEE, minute: 600, duration: 30 });
  await assertFails(ocuparBatch(db, invasor, ['600']).commit());
  assert.equal((await getDoc(invasor.ref)).exists(), false);

  const invasorParcial = makeBooking(db, { id: 'lote-invasor-parcial', uid: EMPLOYEE, minute: 630, duration: 30 });
  await assertFails(ocuparBatch(db, invasorParcial, ['630']).commit());
  assert.equal((await getDoc(invasorParcial.ref)).exists(), false);

  const agenda = (await getDoc(agendaRef(db, ancla))).data();
  assert.deepEqual(agenda.ocupados, { '600': true, '630': true });
  assert.equal(agenda.ultimaOperacion.reservaId, 'lote-ancla');
});

test('el SDK impide dos escrituras al mismo documento en un lote, no las reglas', async () => {
  // Documenta el limite que impide expresar el solapamiento en un unico lote
  // sobre la misma cancha: el rechazo es del cliente, no de firestore.rules.
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();
  const a = makeBooking(db, { id: 'sdk-a', uid: EMPLOYEE, minute: 600, duration: 30 });
  const b = makeBooking(db, { id: 'sdk-b', uid: EMPLOYEE, minute: 630, duration: 30 });
  const batch = writeBatch(db);
  batch.set(a.ref, a.body);
  batch.set(agendaRef(db, a), {
    ocupados: { '600': true },
    ultimaOperacion: { reservaId: a.id, coleccion: 'reservas', tipo: 'ocupar', minutos: ['600'] },
  }, { merge: true });
  batch.set(b.ref, b.body);
  batch.set(agendaRef(db, b), {
    ocupados: { '630': true },
    ultimaOperacion: { reservaId: b.id, coleccion: 'reservas', tipo: 'ocupar', minutos: ['630'] },
  }, { merge: true });
  await assertFails(batch.commit());
  assert.equal((await getDoc(a.ref)).exists(), false);
  assert.equal((await getDoc(b.ref)).exists(), false);
});

test('una reserva no puede ocupar minutos fuera de los suyos', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();

  // De mas: declara tres minutos para una reserva de 30.
  const deMas = makeBooking(db, { id: 'fuera-de-mas', uid: EMPLOYEE, minute: 600, duration: 30 });
  await assertFails(ocuparBatch(db, deMas, ['600', '630', '660']).commit());
  assert.equal((await getDoc(deMas.ref)).exists(), false);

  // De menos: reserva de 90 minutos y escribe solo el primero.
  const deMenos = makeBooking(db, { id: 'fuera-de-menos', uid: EMPLOYEE, minute: 690, duration: 90 });
  await assertFails(ocuparBatch(db, deMenos, ['690']).commit());
  assert.equal((await getDoc(deMenos.ref)).exists(), false);

  // Mismo tamano, minuto equivocado. Con la agenda ya poblada, el tamano no
  // delata el cambio: solo lo detiene la igualdad con los minutos de la reserva.
  const previa = makeBooking(db, { id: 'fuera-previa', uid: EMPLOYEE, minute: 780, duration: 120 });
  await assertSucceeds(bookingBatch(db, previa).commit());
  const mismaCantidad = makeBooking(db, { id: 'fuera-misma-cantidad', uid: EMPLOYEE, minute: 990, duration: 30 });
  await assertFails(ocuparBatch(db, mismaCantidad, ['1020']).commit());
  assert.equal((await getDoc(mismaCantidad.ref)).exists(), false);

  // Con otra reserva legitima en el mismo dia tampoco puede robarle minutos.
  const legitima = makeBooking(db, { id: 'fuera-legitima', uid: EMPLOYEE, minute: 1050, duration: 60 });
  await assertSucceeds(bookingBatch(db, legitima).commit());
  const ladrona = makeBooking(db, { id: 'fuera-ladrona', uid: EMPLOYEE, minute: 1140, duration: 30 });
  await assertFails(ocuparBatch(db, ladrona, ['1080']).commit());
  assert.equal((await getDoc(ladrona.ref)).exists(), false);

  // Todo lo legitimo quedo como estaba. Las dos reservas comparten la agenda del
  // dia, asi que el mapa es la union de sus minutos y nada mas.
  const esperadoDelDia = {
    '780': true, '810': true, '840': true, '870': true,
    '1050': true, '1080': true,
  };
  assert.deepEqual((await getDoc(agendaRef(db, previa))).data().ocupados, esperadoDelDia);
  assert.deepEqual((await getDoc(publicSlotRef(db, previa))).data().ocupados, esperadoDelDia);
  for (const prohibido of ['660', '690', '990', '1020', '1140', '1170']) {
    assert.equal((await getDoc(agendaRef(db, previa))).data().ocupados[prohibido], undefined, prohibido);
  }
});

test('escribir la agenda privada sin actualizar el espejo publico se rechaza', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();

  // Alta: reserva y agenda privada correctas, pero el espejo no se escribe.
  const sinEspejo = makeBooking(db, { id: 'espejo-sin-alta', uid: EMPLOYEE, minute: 600, duration: 60 });
  await assertFails(ocuparBatch(db, sinEspejo, ['600', '630'], { incluirPublico: false }).commit());
  assert.equal((await getDoc(sinEspejo.ref)).exists(), false);
  assert.equal((await getDoc(agendaRef(db, sinEspejo))).exists(), false);
  assert.equal((await getDoc(publicSlotRef(db, sinEspejo))).exists(), false);

  // Aprobacion: la reserva larga pasa a confirmada y solo se toca la agenda.
  const pendiente = makeBooking(db, { id: 'espejo-pendiente', uid: EMPLOYEE, minute: 600, duration: 240 });
  await assertSucceeds(bookingBatch(db, pendiente).commit());
  const aprobacion = writeBatch(db);
  aprobacion.update(pendiente.ref, {
    estado: 'confirmada',
    atendidoPor: EMPLOYEE,
    updatedAt: Timestamp.now(),
    version: 2,
  });
  const minutos = operationalMinutes(pendiente);
  aprobacion.set(agendaRef(db, pendiente), {
    ocupados: Object.fromEntries(minutos.map(minuto => [minuto, true])),
    ultimaOperacion: {
      reservaId: pendiente.id,
      coleccion: 'reservas',
      tipo: 'ocupar',
      minutos,
    },
  }, { merge: true });
  await assertFails(aprobacion.commit());
  assert.equal((await getDoc(pendiente.ref)).data().estado, 'pendiente');
  assert.equal((await getDoc(agendaRef(db, pendiente))).exists(), false);
  assert.equal((await getDoc(publicSlotRef(db, pendiente))).exists(), false);

  // Y el camino inverso: espejo sin agenda privada.
  const soloEspejo = makeBooking(db, { id: 'espejo-solo-publico', uid: EMPLOYEE, minute: 600, duration: 30 });
  await assertFails(ocuparBatch(db, soloEspejo, ['600'], { incluirAgenda: false }).commit());
  assert.equal((await getDoc(soloEspejo.ref)).exists(), false);
  assert.equal((await getDoc(publicSlotRef(db, soloEspejo))).exists(), false);
});

test('una transicion de estado no puede modificar otros campos', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();
  const ancla = makeBooking(db, { id: 'transicion-ancla', uid: EMPLOYEE, minute: 600, duration: 60 });
  await assertSucceeds(bookingBatch(db, ancla).commit());

  const intrusos = {
    clienteNombre: 'Nombre inyectado',
    clienteId: 'cliente-inventado',
    telefono: '+51999999999',
    minutos: ['600', '630', '660'],
    duracion: 90,
    montoCentimos: 50000,
    adelantoCentimos: 25000,
    saldoCentimos: 50000,
    metodoPago: 'efectivo',
    historialPagos: [{ montoCentimos: 25000, metodo: 'efectivo' }],
    promocionId: 'promo-falsa',
    origen: 'publico',
    solicitanteUid: ANON_B,
    dia: '2099-01-01',
    canchaId: 'la-24',
    negocioId: 'otro-negocio',
    schemaVersion: 3,
  };
  let minuto = 660;
  for (const [campo, valor] of Object.entries(intrusos)) {
    const booking = makeBooking(db, {
      id: `transicion-${campo}`,
      uid: EMPLOYEE,
      minute: minuto,
      duration: 30,
    });
    minuto += 30;
    await assertSucceeds(bookingBatch(db, booking).commit());
    const antesDelIntento = (await getDoc(booking.ref)).data();
    await assertFails(transicionBatch(db, booking, EMPLOYEE, { [campo]: valor }).commit());
    // El documento entero debe seguir igual: ni el estado ni el campo intruso.
    assert.deepEqual((await getDoc(booking.ref)).data(), antesDelIntento, campo);
  }

  // Sin campos intrusos la misma transicion si prospera: el rechazo venia del
  // campo, no de la forma del lote. Empieza donde el bucle anterior termino.
  const limpia = makeBooking(db, { id: 'transicion-limpia', uid: EMPLOYEE, minute: 1200, duration: 30 });
  await assertSucceeds(bookingBatch(db, limpia).commit());
  await assertSucceeds(transicionBatch(db, limpia, EMPLOYEE).commit());
  const cancelada = (await getDoc(limpia.ref)).data();
  assert.equal(cancelada.estado, 'cancelada');
  assert.equal(cancelada.version, 2);
  assert.equal(cancelada.atendidoPor, EMPLOYEE);
  assert.equal((await getDoc(agendaRef(db, limpia))).data().ocupados['1200'], undefined);
  assert.equal((await getDoc(publicSlotRef(db, limpia))).data().ocupados['1200'], undefined);
});

test('una transicion tiene que avanzar exactamente una version y a su nombre', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();
  const booking = makeBooking(db, { id: 'version-ancla', uid: EMPLOYEE, minute: 600, duration: 30 });
  await assertSucceeds(bookingBatch(db, booking).commit());
  const inicial = (await getDoc(booking.ref)).data();
  assert.equal(inicial.version, 1);

  // Repetir la version actual.
  await assertFails(transicionBatch(db, booking, EMPLOYEE, { version: 1 }).commit());
  // Saltarse una version.
  await assertFails(transicionBatch(db, booking, EMPLOYEE, { version: 3 }).commit());
  // Firmar la transicion en nombre de otro.
  await assertFails(transicionBatch(db, booking, EMPLOYEE, { atendidoPor: ADMIN }).commit());
  // Retroceder la version.
  await assertFails(transicionBatch(db, booking, EMPLOYEE, { version: 0 }).commit());

  assert.deepEqual((await getDoc(booking.ref)).data(), inicial);

  // El avance correcto si prospera.
  await assertSucceeds(transicionBatch(db, booking, EMPLOYEE).commit());
  const final = (await getDoc(booking.ref)).data();
  assert.equal(final.version, 2);
  assert.equal(final.estado, 'cancelada');
  assert.equal(final.atendidoPor, EMPLOYEE);
});

test('el publico no puede declararse confirmada una reserva larga', async () => {
  await seedApplication();
  const publicDb = anonymous(ANON_A).firestore();
  const lector = verified(ADMIN).firestore();
  const leer = (booking) => getDoc(doc(lector, 'negocios', BUSINESS, 'reservas', booking.id));

  // Cuatro horas auto-confirmadas y sin agenda: la via para saltarse la
  // aprobacion y ocupar sin aparecer en el espejo. Solo se escribe la
  // reserva, asi que la unica defensa posible es la propia regla de alta.
  const mentirosa = makeBooking(publicDb, {
    id: 'r_mentirosa_larga',
    uid: ANON_A,
    publicRequest: true,
    duration: 240,
    patch: { estado: 'confirmada' },
  });
  const sola = writeBatch(publicDb);
  sola.set(mentirosa.ref, mentirosa.body);
  await assertFails(sola.commit());
  assert.equal((await leer(mentirosa)).exists(), false);
  assert.equal((await getDoc(agendaRef(lector, mentirosa))).exists(), false);
  assert.equal((await getDoc(publicSlotRef(lector, mentirosa))).exists(), false);

  // La misma reserva escribiendo agenda y espejo tampoco prospera.
  const conAgenda = makeBooking(publicDb, {
    id: 'r_mentirosa_con_agenda',
    uid: ANON_A,
    publicRequest: true,
    court: 'la-23',
    duration: 240,
    patch: { estado: 'confirmada' },
  });
  await assertFails(bookingBatch(publicDb, conAgenda).commit());
  assert.equal((await leer(conAgenda)).exists(), false);

  // Y al reves: 30 minutos no pueden quedar esperando aprobacion.
  const corta = makeBooking(publicDb, {
    id: 'r_corta_pendiente',
    uid: ANON_A,
    publicRequest: true,
    court: 'la-24',
    duration: 30,
    patch: { estado: 'pendiente' },
  });
  const solaCorta = writeBatch(publicDb);
  solaCorta.set(corta.ref, corta.body);
  await assertFails(solaCorta.commit());
  assert.equal((await leer(corta)).exists(), false);

  // Justo en el borde: 180 minutos tampoco se auto-confirman.
  const borde = makeBooking(publicDb, {
    id: 'r_borde_confirmada',
    uid: ANON_A,
    publicRequest: true,
    duration: 180,
    patch: { estado: 'confirmada' },
  });
  const soloBorde = writeBatch(publicDb);
  soloBorde.set(borde.ref, borde.body);
  await assertFails(soloBorde.commit());
  assert.equal((await leer(borde)).exists(), false);
});

test('una reserva puede empezar en el minuto exacto de apertura y acabar en el de cierre', async () => {
  await seedApplication();
  const admin = verified(ADMIN).firestore();
  // Horario de un solo dia: cierre > apertura, asi que manda la primera rama
  // de cabe, que es la que las otras pruebas no tocaban.
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'negocios', BUSINESS), {
      aperturaMinuto: 420,
      cierreMinuto: 1080,
      duracionTurnoMinutos: 30,
    });
  });

  const apertura = makeBooking(admin, {
    id: 'borde-apertura-exacta', uid: ADMIN, minute: 420, duration: 30,
  });
  await assertSucceeds(bookingBatch(admin, apertura).commit());
  assert.deepEqual(operationalMinutes(apertura), ['420']);

  const cierre = makeBooking(admin, {
    id: 'borde-cierre-exacto', uid: ADMIN, court: 'la-23', minute: 1050, duration: 30,
  });
  await assertSucceeds(bookingBatch(admin, cierre).commit());
  assert.deepEqual(operationalMinutes(cierre), ['1050']);

  // Un minuto antes de abrir y un minuto despues de cerrar.
  const antes = makeBooking(admin, {
    id: 'borde-apertura-antes', uid: ADMIN, court: 'la-24', minute: 390, duration: 30,
  });
  await assertFails(bookingBatch(admin, antes).commit());

  const despues = makeBooking(admin, {
    id: 'borde-cierre-despues', uid: ADMIN, minute: 1080, duration: 30,
  });
  await assertFails(bookingBatch(admin, despues).commit());
});

test('el horario del negocio solo admite medias horas dentro del dia', async () => {
  await seedApplication();
  const admin = verified(ADMIN).firestore();
  const negocio = doc(admin, 'negocios', BUSINESS);
  // El horario solo cambia si se proyecta a la web en el mismo lote.
  const cambiar = (horario) => {
    const batch = writeBatch(admin);
    batch.update(negocio, horario);
    batch.set(doc(admin, 'negocios_publicos', BUSINESS), {
      negocioId: BUSINESS,
      slug: 'grass-sintetico',
      nombre: 'Grass Sintetico',
      descripcion: 'Informacion publica',
      galeria: [],
      ...horario,
    });
    return batch;
  };

  const invalidos = [
    { aperturaMinuto: 435, cierreMinuto: 60, duracionTurnoMinutos: 30 },
    { aperturaMinuto: 405, cierreMinuto: 60, duracionTurnoMinutos: 30 },
    { aperturaMinuto: 420, cierreMinuto: 1005, duracionTurnoMinutos: 30 },
    { aperturaMinuto: 420, cierreMinuto: 1500, duracionTurnoMinutos: 30 },
    { aperturaMinuto: 1440, cierreMinuto: 60, duracionTurnoMinutos: 30 },
    { aperturaMinuto: -30, cierreMinuto: 60, duracionTurnoMinutos: 30 },
    { aperturaMinuto: 420, cierreMinuto: 60, duracionTurnoMinutos: 45 },
    { aperturaMinuto: 420, cierreMinuto: 60, duracionTurnoMinutos: 270 },
    { aperturaMinuto: 420, cierreMinuto: 420, duracionTurnoMinutos: 30 },
  ];
  for (const horario of invalidos) {
    await assertFails(cambiar(horario).commit(), JSON.stringify(horario));
  }

  const intacto = (await getDoc(negocio)).data();
  assert.equal(intacto.aperturaMinuto, 420);
  assert.equal(intacto.cierreMinuto, 60);
  assert.equal(intacto.duracionTurnoMinutos, 30);

  // Medias horas validas si se aceptan.
  await assertSucceeds(cambiar({ aperturaMinuto: 450, cierreMinuto: 1080, duracionTurnoMinutos: 60 }).commit());
  const nuevo = (await getDoc(negocio)).data();
  assert.equal(nuevo.aperturaMinuto, 450);
  assert.equal(nuevo.cierreMinuto, 1080);
  assert.equal(nuevo.duracionTurnoMinutos, 60);
});

test('el dia mas lleno y la reserva mas larga caben sin rozar los limites', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();
  const day = futureLocalDay();

  // 16 minutos previos: 420..870, el mayor preexistente posible.
  const previos = Array.from({ length: 16 }, (_, index) => String(420 + index * 30));
  await environment.withSecurityRulesDisabled(async (context) => {
    const crudo = context.firestore();
    const marcador = makeBooking(crudo, { id: 'previa', uid: EMPLOYEE, minute: 420, duration: 30 });
    await setDoc(agendaRef(crudo, marcador), {
      ocupados: Object.fromEntries(previos.map(minuto => [minuto, true])),
      ultimaOperacion: { reservaId: 'previa', coleccion: 'reservas', tipo: 'ocupar', minutos: previos },
    });
    await setDoc(publicSlotRef(crudo, marcador), {
      ocupados: Object.fromEntries(previos.map(minuto => [minuto, true])),
    });
  });

  // 600 minutos es la duracion maxima admitida y queda pendiente, asi que la
  // ocupacion de 20 minutos solo existe tras aprobarla. Esa es la operacion
  // mas grande que las reglas tienen que evaluar.
  const maxima = makeBooking(db, { id: 'dia-lleno', uid: EMPLOYEE, minute: 900, duration: 600 });
  assert.equal(operationalMinutes(maxima).length, 20);
  const esperadosPrevios = Object.fromEntries(previos.map(minuto => [minuto, true]));
  await assertSucceeds(bookingBatch(db, maxima).commit());
  const pendiente = (await getDoc(doc(db, 'negocios', BUSINESS, 'reservas', maxima.id))).data();
  assert.equal(pendiente.estado, 'pendiente');
  assert.equal(pendiente.version, 1);
  assert.deepEqual(pendiente.minutos, operationalMinutes(maxima));
  const antesDeAprobar = (await getDoc(agendaRef(db, maxima))).data();
  assert.deepEqual(antesDeAprobar.ocupados, esperadosPrevios);
  assert.deepEqual((await getDoc(publicSlotRef(db, maxima))).data().ocupados, esperadosPrevios);

  await assertSucceeds(approvalBatch(db, maxima, EMPLOYEE).commit());
  const aprobada = (await getDoc(doc(db, 'negocios', BUSINESS, 'reservas', maxima.id))).data();
  assert.equal(aprobada.estado, 'confirmada');
  assert.equal(aprobada.version, 2);

  const esperados = [...previos, ...operationalMinutes(maxima)];
  assert.equal(esperados.length, 36);
  const agenda = (await getDoc(agendaRef(db, maxima))).data();
  const publica = (await getDoc(publicSlotRef(db, maxima))).data();
  assert.equal(Object.keys(agenda.ocupados).length, 36);
  assert.deepEqual(agenda.ocupados, publica.ocupados);
  for (const minuto of esperados) {
    assert.equal(agenda.ocupados[minuto], true, minuto);
  }
  assert.deepEqual(agenda.ultimaOperacion.minutos, operationalMinutes(maxima));

  // Con el dia completo, cualquier minuto posterior ya esta ocupado: el tope
  // de 36 entradas coincide con los 36 mediosfos del dia operativo.
  const rebose = makeBooking(db, { id: 'dia-rebosado', uid: EMPLOYEE, minute: 900, duration: 30 });
  await assertFails(bookingBatch(db, rebose).commit());
  assert.equal((await getDoc(rebose.ref)).exists(), false);
  assert.equal((await getDoc(agendaRef(db, maxima))).data().ocupados['900'], true);
});

test('dos reservas adyacentes de 30 minutos pueden coexistir', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();
  const first = makeBooking(db, { id: 'adyacente-a', uid: EMPLOYEE, minute: 600, duration: 30 });
  const second = makeBooking(db, { id: 'adyacente-b', uid: EMPLOYEE, minute: 630, duration: 30 });
  await assertSucceeds(bookingBatch(db, first).commit());
  await assertSucceeds(bookingBatch(db, second).commit());
  const agenda = (await getDoc(agendaRef(db, first))).data();
  assert.equal(agenda.ocupados['600'], true);
  assert.equal(agenda.ocupados['630'], true);
});

test('una solicitud de cuatro horas queda pendiente y no ocupa agenda', async () => {
  await seedApplication();
  const db = verified(ADMIN).firestore();
  const booking = makeBooking(db, { id: 'cuatro-horas', uid: ADMIN, minute: 600, duration: 240 });
  assert.equal(booking.slots.length, 8);
  await assertSucceeds(bookingBatch(db, booking).commit());
  await assertEstadoYAgenda(db, booking, 'pendiente');
  const stored = (await getDoc(booking.ref)).data();
  assert.deepEqual(stored.minutos, ['600', '630', '660', '690', '720', '750', '780', '810']);
  assert.equal(stored.duracion, 240);
  assert.equal(stored.atendidoPor, '');
  assert.equal((await getDoc(agendaRef(db, booking))).exists(), false);
  assert.equal((await getDoc(publicSlotRef(db, booking))).exists(), false);
});

test('el limite de tres horas separa confirmado y pendiente en el servidor', async () => {
  await seedApplication();
  const db = verified(ADMIN).firestore();
  const corta = makeBooking(db, { id: 'limite-corta', uid: ADMIN, court: 'la-23', minute: 600, duration: 180 });
  const larga = makeBooking(db, { id: 'limite-larga', uid: ADMIN, court: 'la-24', minute: 600, duration: 210 });
  await assertSucceeds(bookingBatch(db, corta).commit());
  await assertSucceeds(bookingBatch(db, larga).commit());
  const cortaStored = await assertEstadoYAgenda(db, corta, 'confirmada');
  const largaStored = await assertEstadoYAgenda(db, larga, 'pendiente');
  assert.equal(cortaStored.minutos.length, 6);
  assert.equal(largaStored.minutos.length, 7);
  assert.equal(cortaStored.atendidoPor, ADMIN);
  assert.equal(largaStored.atendidoPor, '');
  assert.equal((await getDoc(agendaRef(db, larga))).exists(), false);
  assert.equal((await getDoc(publicSlotRef(db, larga))).exists(), false);
});

test('una reserva que cruza medianoche usa el dia y minuto canonicos siguientes', async () => {
  await seedApplication();
  const db = verified(ADMIN).firestore();
  // El horario nocturno es global: basta cambiar el documento del negocio.
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'negocios', BUSINESS), {
      aperturaMinuto: 1320,
      cierreMinuto: 120,
    });
  });
  const booking = makeBooking(db, {
    id: 'cruza-medianoche',
    uid: ADMIN,
    minute: 1410,
    duration: 90,
  });
  assert.deepEqual(booking.slots.map(({ minute }) => minute), ['1410', '0', '30']);
  assert.equal(booking.body.minutos.length, 3);
  assert.notEqual(booking.slots[0].day, booking.slots[1].day);
  await assertSucceeds(bookingBatch(db, booking).commit());
  const agenda = (await getDoc(agendaRef(db, booking))).data();
  assert.equal(agenda.ocupados['1410'], true);
  assert.equal(agenda.ocupados['1440'], true);
  assert.equal(agenda.ocupados['1470'], true);
});

test('cancelar libera todos los slots atomicamente y permite reutilizarlos', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();
  const booking = makeBooking(db, {
    id: 'cancelacion-atomica',
    uid: EMPLOYEE,
    duration: 90,
  });
  await seedBooking(booking);
  await assertFails(updateDoc(booking.ref, {
    estado: 'cancelada',
    atendidoPor: EMPLOYEE,
    updatedAt: Timestamp.now(),
    version: 2,
  }));
  await assertFails(cancellationBatch(db, booking, EMPLOYEE, [0, 1]).commit());
  await assertSucceeds(cancellationBatch(db, booking, EMPLOYEE).commit());
  const agendaCancelada = (await getDoc(agendaRef(db, booking))).data();
  for (const minuto of operationalMinutes(booking)) {
    assert.equal(minuto in agendaCancelada.ocupados, false);
  }
  assert.deepEqual((await getDoc(publicSlotRef(db, booking))).data(), { ocupados: {} });
  for (let index = 0; index < booking.slots.length; index += 1) {
    const retry = makeBooking(db, {
      id: `reintento-tras-cancelar-${index}`,
      uid: EMPLOYEE,
      minute: booking.body.minuto + index * 30,
      duration: 30,
    });
    await assertSucceeds(bookingBatch(db, retry).commit());
  }
});

test('direccion y tarifa pendientes permiten reservar sin registrar pagos', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();
  await environment.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'negocios', BUSINESS, 'canchas', COURT), {direccion: '', tarifaTurnoCentimos: null});
  });
  const booking = makeBooking(db, {id:'pendiente-config', uid:EMPLOYEE});
  await assertSucceeds(bookingBatch(db, booking).commit());
  assert.equal((await getDoc(booking.ref)).data().adelantoCentimos, 0);
  await assertFails(bookingBatch(db, makeBooking(db,{id:'conflicto-config',uid:EMPLOYEE})).commit());
  const publicDb = anonymous(ANON_A).firestore();
  const publico = makeBooking(publicDb,{id:'r_publico_config',uid:ANON_A,minute:900,publicRequest:true});
  await assertSucceeds(bookingBatch(publicDb, publico).commit());
});

test('solo personal registra medias horas; la web exige horas e inicios completos', async () => {
  await seedApplication();
  const publico = anonymous(ANON_A).firestore();
  await assertFails(bookingBatch(publico, makeBooking(publico,{id:'r_publico_media_hora',uid:ANON_A,minute:900,duration:30,publicRequest:true})).commit());
  await assertFails(bookingBatch(publico, makeBooking(publico,{id:'r_publico_media_inicio',uid:ANON_A,minute:930,duration:60,publicRequest:true})).commit());
  const personal = verified(EMPLOYEE).firestore();
  await assertSucceeds(bookingBatch(personal, makeBooking(personal,{id:'especial-personal',uid:EMPLOYEE,minute:930,duration:30})).commit());
});

test('una reserva publica anterior con inicio a media hora sigue visible y cancelable', async () => {
  await seedApplication();
  await environment.withSecurityRulesDisabled(async context => {
    const db=context.firestore();
    await bookingBatch(db,makeBooking(db,{id:'r_publica_legacy_hora',uid:ANON_A,minute:1290,duration:60,publicRequest:true})).commit();
  });
  const personal=verified(EMPLOYEE).firestore();
  const anterior=makeBooking(personal,{id:'r_publica_legacy_hora',uid:ANON_A,minute:1290,duration:60,publicRequest:true});
  await assertSucceeds(getDoc(anterior.ref));
  await assertSucceeds(cancellationBatch(personal,anterior,EMPLOYEE).commit());
  assert.equal((await getDoc(anterior.ref)).data().estado,'cancelada');
  assert.deepEqual((await getDoc(publicSlotRef(personal,anterior))).data(),{ocupados:{}});
});

test('sin horario global configurado ninguna cancha admite reservas', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore();
    const negocio = doc(admin, 'negocios', BUSINESS);
    const antes = await getDoc(negocio);
    await updateDoc(negocio, {
      aperturaMinuto: null,
      cierreMinuto: null,
      duracionTurnoMinutos: null,
    });
    assert.equal(antes.exists(), true);
  });
  const booking = makeBooking(db, { id: 'sin-horario', uid: EMPLOYEE });
  await assertFails(bookingBatch(db, booking).commit());
});

test('el horario global se aplica igual a las tres canchas', async () => {
  await seedApplication();
  const db = verified(ADMIN).firestore();
  // Turno de 90 minutos: solo caben inicios alineados a 90 desde la apertura.
  await environment.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore();
    await updateDoc(doc(admin, 'negocios', BUSINESS), {
      aperturaMinuto: 360,
      cierreMinuto: 1080,
      duracionTurnoMinutos: 90,
    });
  });
  for (const court of ['la-19', 'la-23', 'la-24']) {
    const desalineado = makeBooking(db, {
      id: `desalineado-${court}`, uid: ADMIN, court, minute: 420, duration: 90,
    });
    await assertFails(bookingBatch(db, desalineado).commit(), court);

    const alineado = makeBooking(db, {
      id: `alineado-${court}`, uid: ADMIN, court, minute: 450, duration: 90,
    });
    await assertSucceeds(bookingBatch(db, alineado).commit(), court);
  }
});

test('el horario comun de 07:00 a 01:00 incluye la madrugada y excluye sus bordes', async () => {
  await seedApplication();
  const db = verified(ADMIN).firestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'negocios', BUSINESS), {
      aperturaMinuto: 420,
      cierreMinuto: 60,
      duracionTurnoMinutos: 60,
    });
  });

  const apertura = makeBooking(db, {
    id: 'horario-apertura', uid: ADMIN, minute: 420, duration: 60,
  });
  await assertSucceeds(bookingBatch(db, apertura).commit());

  const madrugada = makeBooking(db, {
    id: 'horario-madrugada', uid: ADMIN, minute: 1440, duration: 60,
  });
  await assertSucceeds(bookingBatch(db, madrugada).commit());

  const cruza = makeBooking(db, {
    id: 'horario-cruza-dia', uid: ADMIN, court: 'la-23', minute: 1380, duration: 120,
  });
  await assertSucceeds(bookingBatch(db, cruza).commit());
  assert.equal(cruza.body.minutos.length, 4);

  const antes = makeBooking(db, {
    id: 'horario-antes', uid: ADMIN, minute: 360, duration: 60,
  });
  await assertFails(bookingBatch(db, antes).commit());

  const cierre = makeBooking(db, {
    id: 'horario-cierre', uid: ADMIN, minute: 1500, duration: 60,
  });
  await assertFails(bookingBatch(db, cierre).commit());

  const mediaFranja = makeBooking(db, {
    id: 'horario-media-franja', uid: ADMIN, minute: 450, duration: 60,
  });
  await assertFails(bookingBatch(db, mediaFranja).commit());
});

test('el horario global solo lo cambia el administrador y queda sincronizado', async () => {
  await seedApplication();
  const admin = verified(ADMIN).firestore();
  const employee = verified(EMPLOYEE).firestore();

  // Un empleado no puede tocar el horario del negocio.
  await assertFails(updateDoc(doc(employee, 'negocios', BUSINESS), {
    aperturaMinuto: 480,
  }));

  // El administrador tampoco puede cambiarlo sin proyectarlo a la web.
  await assertFails(updateDoc(doc(admin, 'negocios', BUSINESS), {
    aperturaMinuto: 480,
  }));

  // Si actualiza el negocio y la web en el mismo lote, se acepta.
  const cambio = writeBatch(admin);
  cambio.update(doc(admin, 'negocios', BUSINESS), {
    aperturaMinuto: 480,
    cierreMinuto: 1200,
    duracionTurnoMinutos: 60,
  });
  cambio.set(doc(admin, 'negocios_publicos', BUSINESS), {
    negocioId: BUSINESS,
    slug: 'grass-sintetico',
    nombre: 'Grass Sintetico',
    descripcion: 'Informacion publica',
    galeria: [],
    aperturaMinuto: 480,
    cierreMinuto: 1200,
    duracionTurnoMinutos: 60,
  });
  await assertSucceeds(cambio.commit());
});

test('cancelar un bloqueo libera sus slots y deja reservar el horario', async () => {
  await seedApplication();
  const db = verified(ADMIN).firestore();
  const block = makeBooking(db, {
    id: 'bloqueo-mantenimiento',
    uid: ADMIN,
    block: true,
    duration: 60,
  });
  await assertSucceeds(bookingBatch(db, block).commit());
  const colliding = makeBooking(db, { id: 'reserva-contra-bloqueo', uid: ADMIN });
  await assertFails(bookingBatch(db, colliding).commit());
  await assertSucceeds(cancellationBatch(db, block, ADMIN).commit());
  await assertSucceeds(bookingBatch(db, colliding).commit());
  await assertFails(getDoc(doc(
    environment.unauthenticatedContext().firestore(),
    'negocios', BUSINESS, 'bloqueos', block.id,
  )));
});

test('el espejo publico exige una reserva y una agenda privada que lo respalden', async () => {
  await seedApplication();
  const employee = verified(EMPLOYEE).firestore();
  const anon = anonymous(ANON_A).firestore();
  const day = futureLocalDay();
  const court = COURT;
  const huecos = [];
  const debeFallar = async (etiqueta, accion) => {
    try {
      await accion();
      huecos.push(`PERMITIDO (debia denegar): ${etiqueta}`);
    } catch {
      // Denegado por las reglas, que es lo esperado.
    }
  };
  const debePasar = async (etiqueta, accion) => {
    try {
      await accion();
    } catch (error) {
      huecos.push(`DENEGADO (debia pasar): ${etiqueta} -> ${String(error?.message ?? error).split('\n')[0]}`);
    }
  };

  // 1. Escritura de un solo documento: solo el espejo publico, con la forma
  //    correcta {ocupados:{minuto:true}} y sin nada mas en la transaccion.
  const suelta = doc(anon, 'agenda_publica', BUSINESS, 'canchas', court, 'dias', day);
  await debeFallar('anonimo escribe {ocupados} sin reserva ni agenda', () => setDoc(suelta, { ocupados: { '900': true } }));
  await debeFallar('anonimo escribe {ocupados} con reservaId inventada', () => setDoc(suelta, { ocupados: { '900': true }, reservaId: 'inventada' }));
  await debeFallar('empleado fabrica ocupacion sin agenda privada', () => setDoc(
    doc(employee, 'agenda_publica', BUSINESS, 'canchas', court, 'dias', day),
    { ocupados: { '900': true } },
  ));
  await debeFallar('anonimo libera minutos que no son suyos', () => updateDoc(suelta, { ocupados: {} }));

  // 2. Con una reserva real y confirmada, el espejo no se puede alterar: debe
  //    seguir siendo identico a la agenda privada.
  const real = makeBooking(employee, {
    id: 'espejo-real', uid: EMPLOYEE, day, minute: 1020, duration: 60,
  });
  await debePasar('reserva confirmada de referencia', () => bookingBatch(employee, real).commit());
  const espejoReal = publicSlotRef(employee, real);
  const ocupado = { '1020': true, '1050': true };
  await debeFallar('espejo no puede anadir un minuto libre', () => updateDoc(espejoReal, { ocupados: { ...ocupado, '1080': true } }));
  await debeFallar('espejo no puede vaciar la ocupacion', () => updateDoc(espejoReal, { ocupados: {} }));
  await debeFallar('espejo no puede marcar minutos en false', () => updateDoc(espejoReal, { ocupados: { '1020': false, '1050': true } }));
  await debeFallar('espejo no puede reescribirse con otro mapa', () => setDoc(espejoReal, { ocupados: { '1020': true } }));
  await debeFallar('espejo no puede añadir campos privados', () => updateDoc(espejoReal, { ocupado: true }));
  await debeFallar('espejo no se puede borrar', () => deleteDoc(espejoReal));
  // DEBILIDAD RESIDUAL VERIFICADA, no un agujero de integridad: el espejo si
  // admite una reescritura IDENTICA. Al no cambiar nada, los dos diffs quedan
  // vacios y la regla los da por iguales. No fabrica ocupacion, no altera estado
  // y no filtra nada: ese documento ya es publico para quien escribe. Queda
  // constancia ejecutable en vez de ocultarlo.
  await debePasar('espejo admite reescritura identica (no-op sin efecto)', () => setDoc(espejoReal, { ocupados: ocupado }));
  assert.deepEqual((await getDoc(espejoReal)).data(), { ocupados: ocupado });

  // 3. Minuto extra: la agenda no puede ocupar minutos que la reserva no cubre.
  const extra = makeBooking(employee, {
    id: 'minuto-extra', uid: EMPLOYEE, day, minute: 1080, duration: 30,
  });
  const batchExtra = writeBatch(employee);
  batchExtra.set(extra.ref, extra.body);
  batchExtra.set(agendaRef(employee, extra), {
    ocupados: { '1080': true, '1110': true },
    ultimaOperacion: {
      reservaId: extra.id,
      coleccion: extra.collectionName,
      tipo: 'ocupar',
      minutos: ['1080'],
    },
  });
  batchExtra.set(publicSlotRef(employee, extra), { ocupados: { '1080': true, '1110': true } });
  await debeFallar('la agenda no ocupa un minuto que la reserva no cubre', () => batchExtra.commit());

  // 4. Hueco: la agenda no puede omitir un minuto que la reserva si cubre.
  const hueco = makeBooking(employee, {
    id: 'minuto-hueco', uid: EMPLOYEE, day, minute: 1140, duration: 60,
  });
  await debeFallar('la agenda no puede omitir un minuto de la reserva', () => bookingBatch(employee, hueco, [0]).commit());

  // 5. Cancelacion indebida: ni el publico ni un tercero pueden liberar.
  await debeFallar('anonimo cancela una reserva ajena', () => cancellationBatch(anon, real, ANON_A).commit());
  const intruso = verified(NO_RESERVATIONS).firestore();
  await debeFallar('empleado sin permiso cancela', () => cancellationBatch(intruso, real, NO_RESERVATIONS).commit());
  assert.deepEqual((await getDoc(espejoReal)).data(), { ocupados: ocupado });

  assert.deepEqual(huecos, []);
});


function efectivoPatch(a, cobro, monto = 10000, uid = EMPLOYEE, id = 'efectivo-operacion-0001') {
  return {montoCentimos:monto, adelantoCentimos:a.adelantoCentimos+cobro,
    saldoCentimos:monto-a.adelantoCentimos-cobro, metodoPago:'efectivo_manual', version:a.version+1,
    updatedAt:serverTimestamp(), historialPagos:[...a.historialPagos,{id, registradoPor:uid,
      importeCentimos:cobro,montoCentimos:monto,fecha:Timestamp.now(),metodo:'efectivo_manual'}]};
}

test('efectivo manual: adelanto, saldo y pago completo preservan privacidad y ocupacion', async () => {
  await seedApplication(); const db=verified(EMPLOYEE).firestore();
  const b=makeBooking(db,{id:'efectivo-simple',uid:EMPLOYEE}); await assertSucceeds(bookingBatch(db,b).commit());
  const before=(await getDoc(agendaRef(db,b))).data();
  await assertSucceeds(updateDoc(b.ref, efectivoPatch(b.body,0,10000,EMPLOYEE,'efectivo-fijar-monto-001')));
  const sinPago=(await getDoc(b.ref)).data();assert.equal(sinPago.adelantoCentimos,0);
  await assertSucceeds(updateDoc(b.ref, efectivoPatch(sinPago,3000)));
  const a=(await getDoc(b.ref)).data(); assert.equal(a.saldoCentimos,7000);
  await assertSucceeds(updateDoc(b.ref,efectivoPatch(a,7000,10000,EMPLOYEE,'efectivo-operacion-0002')));
  const r=(await getDoc(b.ref)).data();assert.equal(r.saldoCentimos,0);assert.equal(r.historialPagos.length,3);
  assert.deepEqual((await getDoc(agendaRef(db,b))).data(),before);
  await assertFails(getDoc(doc(anonymous(ANON_A).firestore(),'negocios',BUSINESS,'reservas',b.id)));
  await assertSucceeds(cancellationBatch(db,{...b,body:r},EMPLOYEE).commit());
  const cancelada=(await getDoc(b.ref)).data();assert.equal(cancelada.adelantoCentimos,10000);assert.deepEqual(cancelada.historialPagos,r.historialPagos);
  assert.deepEqual((await getDoc(publicSlotRef(db,b))).data().ocupados,{});
  await assertFails(updateDoc(b.ref,efectivoPatch(cancelada,1,10001,EMPLOYEE,'efectivo-cancelada-0001')));
});

test('efectivo rechaza exceso, historial alterado, suplantacion, permisos y cambios de agenda', async () => {
  await seedApplication(); const db=verified(EMPLOYEE).firestore(); const b=makeBooking(db,{id:'efectivo-seguro',uid:EMPLOYEE}); await bookingBatch(db,b).commit();
  await assertFails(updateDoc(b.ref,efectivoPatch(b.body,10001)));
  await assertFails(updateDoc(b.ref,{...efectivoPatch(b.body,1000), estado:'cancelada'}));
  await assertFails(updateDoc(b.ref,efectivoPatch(b.body,1000,10000,ADMIN)));
  for(const actor of [anonymous(ANON_A),verified(DEACTIVATED),verified(NO_RESERVATIONS),verified(UNLINKED)])
    await assertFails(updateDoc(doc(actor.firestore(),'negocios',BUSINESS,'reservas',b.id),efectivoPatch(b.body,1000)));
  await updateDoc(b.ref,efectivoPatch(b.body,3000));const a=(await getDoc(b.ref)).data();
  await assertFails(updateDoc(b.ref,efectivoPatch(a,1000,20000)));
  const forged=efectivoPatch(a,1000,10000,EMPLOYEE,'efectivo-operacion-0002');forged.historialPagos[0]={...forged.historialPagos[0],importeCentimos:9999};
  await assertFails(updateDoc(b.ref,forged));
  await assertFails(updateDoc(b.ref,{...efectivoPatch(a,1000),saldoCentimos:0}));
});

test('efectivo: dos sesiones y reintento de la misma operacion no duplican cobro', async () => {
  await seedApplication();const db=verified(EMPLOYEE).firestore();const b=makeBooking(db,{id:'efectivo-concurrente',uid:EMPLOYEE});await bookingBatch(db,b).commit();
  const registrar=(id) => runTransaction(db,async tx=>{const a=(await tx.get(b.ref)).data();
    if(a.historialPagos.some(e=>e.id===id))return;
    if(a.version!==1)throw new Error('Version obsoleta');tx.update(b.ref,efectivoPatch(a,3000,10000,EMPLOYEE,id));});
  const results=await Promise.allSettled([registrar('efectivo-operacion-0001'),registrar('efectivo-operacion-0002')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const a=(await getDoc(b.ref)).data();await registrar(a.historialPagos[0].id);
  const r=(await getDoc(b.ref)).data();assert.equal(r.adelantoCentimos,3000);assert.equal(r.historialPagos.length,1);
});

test('efectivo: 100 movimientos conservan historial sin agotar expresiones', async () => {
  await seedApplication();const db=verified(EMPLOYEE).firestore();const b=makeBooking(db,{id:'efectivo-historial-maximo',uid:EMPLOYEE});
  await seedBooking(b);
  await environment.withSecurityRulesDisabled(async ctx=>{
    await updateDoc(doc(ctx.firestore(),'negocios',BUSINESS,'reservas',b.id),{adelantoCentimos:99,saldoCentimos:9901,montoCentimos:10000,metodoPago:'efectivo_manual',
      historialPagos:Array.from({length:99},(_,i)=>({id:'efectivo-historico-'+i,registradoPor:EMPLOYEE,importeCentimos:1,montoCentimos:10000,fecha:Timestamp.now(),metodo:'efectivo_manual'}))});
  });
  const a=(await getDoc(b.ref)).data();await assertSucceeds(updateDoc(b.ref,efectivoPatch(a,1)));
  const r=(await getDoc(b.ref)).data();await assertFails(updateDoc(b.ref,efectivoPatch(r,1,10000,EMPLOYEE,'efectivo-operacion-0101')));
});


test('principal: solo administrador, empleado elegible e historial inmutable', async () => {
  await seedApplication();
  const db = verified(ADMIN).firestore();
  const base = 'negocios/'+BUSINESS+'/responsablesCanchas/'+COURT;
  async function asignar(client, uid, id, anterior = '') {
    const batch = writeBatch(client);
    batch.set(doc(client,base), {empleadoUid:uid, actualizadoPor:ADMIN, actualizadoEn:serverTimestamp(), eventoId:id});
    batch.set(doc(client,base+'/historial/'+id), {anteriorUid:anterior, empleadoUid:uid, actualizadoPor:ADMIN, actualizadoEn:serverTimestamp()});
    return batch.commit();
  }
  await assertFails(asignar(verified(EMPLOYEE).firestore(),EMPLOYEE,'no-admin'));
  await assertFails(asignar(db,DEACTIVATED,'inactivo'));
  await assertFails(asignar(db,NO_RESERVATIONS,'sin-permiso'));
  await assertFails(asignar(db,UNLINKED,'sin-vinculo'));
  await assertFails(setDoc(doc(db,base),{empleadoUid:EMPLOYEE,actualizadoPor:ADMIN,actualizadoEn:serverTimestamp(),eventoId:'sin-historial'}));
  await assertSucceeds(asignar(db,EMPLOYEE,'correcto'));
  await assertSucceeds(getDoc(doc(verified(EMPLOYEE).firestore(),base)));
  await assertFails(getDoc(doc(anonymous(ANON_A).firestore(),base)));
  await assertFails(updateDoc(doc(db,base+'/historial/correcto'),{anteriorUid:'alterado'}));
  await assertFails(deleteDoc(doc(db,base+'/historial/correcto')));
  await assertFails(asignar(db,EMPLOYEE,'falso-anterior','otro'));
});



test('parámetros: administrador, principal exclusivo, privacidad y auditoría', async () => {
 await seedApplication();await environment.withSecurityRulesDisabled(async c=>{await setDoc(doc(c.firestore(),'negocios/'+BUSINESS+'/responsablesCanchas/'+COURT),{empleadoUid:EMPLOYEE});});
 const base='negocios/'+BUSINESS+'/parametrosCanchas/'+COURT+'/dias/2026-10-10';
 const bloque={desde:420,hasta:1500,precioCentimos:5000,adelantoCentimos:1000};
 async function guardar(db,uid,id,version,antes,bl=bloque,plazo=10){const b=writeBatch(db),despues={bloque:bl,plazoMinutos:plazo};b.set(doc(db,base),{...despues,version,eventoId:id,actualizadoPor:uid,actualizadoEn:serverTimestamp()});b.set(doc(db,base+'/historial/'+id),{antes,despues,version,actualizadoPor:uid,actualizadoEn:serverTimestamp()});return b.commit();}
 const vacio={bloque:null,plazoMinutos:null};
 await assertFails(guardar(verified(NO_RESERVATIONS).firestore(),NO_RESERVATIONS,'no-permiso',1,vacio));
 await assertFails(guardar(anonymous(ANON_A).firestore(),ANON_A,'publico',1,vacio));
 await assertSucceeds(guardar(verified(EMPLOYEE).firestore(),EMPLOYEE,'principal',1,vacio));
 await assertSucceeds(guardar(verified(ADMIN).firestore(),ADMIN,'admin',2,{bloque,plazoMinutos:10},bloque,15));
 await assertFails(getDoc(doc(anonymous(ANON_A).firestore(),base)));
 await assertFails(getDoc(doc(anonymous(ANON_A).firestore(),base+'/historial/admin')));
 await assertFails(deleteDoc(doc(verified(ADMIN).firestore(),base+'/historial/admin')));
 await assertFails(updateDoc(doc(verified(ADMIN).firestore(),base),{plazoMinutos:20}));
 await environment.withSecurityRulesDisabled(async c=>{await updateDoc(doc(c.firestore(),'negocios/'+BUSINESS+'/responsablesCanchas/'+COURT),{empleadoUid:'otro'});});
 await assertFails(guardar(verified(EMPLOYEE).firestore(),EMPLOYEE,'ex-principal',3,{bloque,plazoMinutos:15}));
});
test('parámetros: límites de precio, adelanto, plazo, bloque y auditoría', async () => {
 await seedApplication();const db=verified(ADMIN).firestore(),base='negocios/'+BUSINESS+'/parametrosCanchas/'+COURT+'/dias/2026-10-10';
 const correcto={desde:1440,hasta:1500,precioCentimos:1000,adelantoCentimos:100};
 async function guardar(bl,plazo,antes={bloque:null,plazoMinutos:null}){const b=writeBatch(db),despues={bloque:bl,plazoMinutos:plazo};b.set(doc(db,base),{...despues,version:1,eventoId:'test',actualizadoPor:ADMIN,actualizadoEn:serverTimestamp()});b.set(doc(db,base+'/historial/test'),{antes,despues,version:1,actualizadoPor:ADMIN,actualizadoEn:serverTimestamp()});return b.commit();}
 await assertFails(guardar({...correcto,precioCentimos:0},10));await assertFails(guardar({...correcto,adelantoCentimos:1500},10));await assertFails(guardar({...correcto,adelantoCentimos:-1},10));await assertFails(guardar({...correcto,desde:450},10));await assertFails(guardar({...correcto,hasta:1560},10));await assertFails(guardar(correcto,0));await assertFails(guardar(correcto,121));await assertFails(guardar(correcto,10,{bloque:null,plazoMinutos:99}));await assertSucceeds(guardar(correcto,10));
});

test('precios públicos: proyección exacta sin datos privados', async () => {
 await seedApplication();
 const db=verified(ADMIN).firestore(),base='negocios/'+BUSINESS+'/parametrosCanchas/'+COURT+'/dias/2026-10-10';
 const publico='precios_publicos/'+BUSINESS+'/canchas/'+COURT+'/dias/2026-10-10/bloques/precio';
 const bloque={desde:420,hasta:480,precioCentimos:5000,adelantoCentimos:1000},despues={bloque,plazoMinutos:10},b=writeBatch(db);
 b.set(doc(db,base),{...despues,version:1,eventoId:'precio',actualizadoPor:ADMIN,actualizadoEn:serverTimestamp()});
 b.set(doc(db,base+'/historial/precio'),{antes:{bloque:null,plazoMinutos:null},despues,version:1,actualizadoPor:ADMIN,actualizadoEn:serverTimestamp()});
 b.set(doc(db,publico),{...despues,version:1});await assertSucceeds(b.commit());
 const anon=anonymous(ANON_A).firestore(),visto=await assertSucceeds(getDoc(doc(anon,publico)));
 if(Object.keys(visto.data()).sort().join(',')!=='bloque,plazoMinutos,version')throw new Error('Privacidad');
 await assertFails(setDoc(doc(anon,publico+'-falso'),{...despues,version:2}));
 await assertFails(updateDoc(doc(db,publico),{plazoMinutos:15}));
 await assertFails(setDoc(doc(db,publico+'-falso'),{...despues,version:2,actualizadoPor:ADMIN}));
 await assertFails(getDoc(doc(anon,base+'/historial/precio')));
 await assertFails(setDoc(doc(anon,'negocios/'+BUSINESS+'/preferenciasReservas/inexistente'),{modalidad:'adelanto',solicitanteUid:ANON_A,reservaId:'inexistente',creadoEn:serverTimestamp()}));
});

test('WhatsApp empleado: administrador valida, personal no cambia ni público lee', async () => {
 await seedApplication();const admin=verified(ADMIN).firestore(),employee=verified(EMPLOYEE).firestore(),base='negocios/'+BUSINESS+'/empleados/'+EMPLOYEE;
 await assertSucceeds(updateDoc(doc(admin,base),{whatsappReservas:'+51900000000'}));
 await assertSucceeds(getDoc(doc(employee,base)));
 for(const valor of ['abc','900000000','+00123456789',123])await assertFails(updateDoc(doc(admin,base),{whatsappReservas:valor}));
 await assertFails(updateDoc(doc(employee,base),{whatsappReservas:'+51911111111'}));
 await assertFails(getDoc(doc(anonymous(ANON_A).firestore(),base)));
 await assertSucceeds(updateDoc(doc(admin,base),{whatsappReservas:''}));
 await assertFails(setDoc(doc(admin,'negocios/'+BUSINESS+'/empleados/nuevo-whatsapp'),{...employeeRecord(),whatsappReservas:'mal'}));
 await assertSucceeds(setDoc(doc(admin,'negocios/'+BUSINESS+'/empleados/nuevo-whatsapp'),{...employeeRecord(),whatsappReservas:'+51900000000'}));
});

let failures = 0;
let skipped = 0;
for (const [name, run, motivo] of tests) {
  if (motivo) {
    skipped += 1;
    console.log(`  skip  ${name}\n        ${motivo}`);
    continue;
  }
  try {
    await environment.clearFirestore();
    await run();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    const message = String(error?.message ?? error).split('\n').slice(0, 10).join(' | ');
    console.error(`  FALLA  ${name}\n        ${message}`);
  }
}

await environment.cleanup();
console.log(failures
  ? `\n${failures} prueba(s) fallaron de ${tests.length - skipped}.`
  : `\n${tests.length - skipped} pruebas de reglas schemaVersion 5 OK`
    + (skipped ? `, ${skipped} omitidas en emulador.` : '.'));
process.exit(failures ? 1 : 0);

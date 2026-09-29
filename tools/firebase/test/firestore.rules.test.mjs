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
const rules = readFileSync(join(here, '..', '..', '..', 'mobile', 'firestore.rules'), 'utf8');

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

function employeeRecord({ active = true, reservations = true } = {}) {
  return {
    nombre: 'Empleado de control',
    email: 'empleado@test.local',
    rol: 'empleado_control',
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
    duration: 30,
  });
  await assertSucceeds(bookingBatch(db, booking).commit());
  const stored = (await getDoc(booking.ref)).data();
  assert.equal(stored.schemaVersion, 5);
  assert.equal(stored.estado, 'confirmada');
  assert.equal(stored.solicitanteUid, ANON_A);
  assert.equal(stored.clienteNombre, 'Cliente privado');
  assert.equal(stored.telefono, '+51999888777');
  assert.equal(stored.metodoPago, '');
  assert.deepEqual(stored.minutos, ['600']);
  assert.ok(stored.inicio instanceof Timestamp);

  const extra = makeBooking(db, {
    id: 'r_publica_extra01',
    uid: ANON_A,
    publicRequest: true,
    duration: 30,
    minute: 660,
    patch: { notaPrivada: 'campo no autorizado' },
  });
  await assertFails(bookingBatch(db, extra).commit());

  const pagoInventado = makeBooking(db, {
    id: 'r_publica_pago001',
    uid: ANON_A,
    publicRequest: true,
    duration: 30,
    minute: 690,
    patch: { metodoPago: 'efectivo' },
  });
  await assertFails(bookingBatch(db, pagoInventado).commit());

  const montoInventado = makeBooking(db, {
    id: 'r_publica_monto01',
    uid: ANON_A,
    publicRequest: true,
    duration: 30,
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
    duration: 30,
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
    assert.equal(personal.body.estado, duration <= 180 ? 'confirmada' : 'pendiente');
  });

  test(`el publico reserva ${duration} minutos dentro de los limites`, async () => {
    await seedApplication();
    const publicDb = anonymous(ANON_A).firestore();
    const publica = makeBooking(publicDb, {
      id: `r_duracion_publica_${duration}`,
      uid: ANON_A,
      publicRequest: true,
      duration,
    });
    await assertSucceeds(bookingBatch(publicDb, publica).commit());
    assert.equal(publica.body.estado, duration <= 180 ? 'confirmada' : 'pendiente');
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

  const admin = verified(ADMIN).firestore();
  const approvedBooking = {
    ...booking,
    ref: doc(admin, 'negocios', BUSINESS, 'reservas', booking.id),
  };
  await assertSucceeds(approvalBatch(admin, approvedBooking, ADMIN).commit());
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
  assert.equal(booking.body.estado, 'pendiente');
  await assertSucceeds(bookingBatch(db, booking).commit());
  assert.equal((await getDoc(agendaRef(db, booking))).exists(), false);
  assert.equal((await getDoc(publicSlotRef(db, booking))).exists(), false);
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

test('una cancha sin direccion o sin tarifa no admite reservas', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore();
    await updateDoc(doc(admin, 'negocios', BUSINESS, 'canchas', 'la-23'), {
      direccion: '',
      tarifaTurnoCentimos: null,
    });
  });

  // Habilitada pero incompleta: sigue sin ser reservable.
  const sinDireccion = makeBooking(db, {
    id: 'sin-direccion', uid: EMPLOYEE, court: 'la-23',
  });
  await assertFails(bookingBatch(db, sinDireccion).commit());

  const sinTarifa = makeBooking(db, {
    id: 'sin-tarifa', uid: EMPLOYEE, court: 'la-23',
  });
  await assertFails(bookingBatch(db, sinTarifa).commit());

  // Tampoco se proyecta activa a la web publica.
  await assertFails(setDoc(doc(db, 'canchas_publicas', 'la-23'), {
    id: 'la-23',
    negocioId: BUSINESS,
    nombre: 'Cancha La 23',
    sedeId: 'la-23',
    direccion: '',
    activa: true,
    tarifaTurnoCentimos: null,
  }));
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

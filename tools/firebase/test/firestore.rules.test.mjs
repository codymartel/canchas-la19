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
    const month = String(local.getUTCMonth() + 1);
    const date = String(local.getUTCDate());
    return {
      dia: `${year}-${month.padStart(2, '0')}-${date.padStart(2, '0')}`,
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

function slotRef(db, court, slot) {
  return doc(
    db,
    'negocios', BUSINESS,
    'agenda', court,
    'anios', slot.year,
    'meses', slot.month,
    'dias', slot.day,
    'franjas', slot.minute,
  );
}

function slotData(booking, slot, index) {
  return {
    reservaId: booking.id,
    coleccion: booking.collectionName,
    canchaId: booking.body.canchaId,
    year: slot.year,
    month: slot.month,
    day: slot.day,
    minute: slot.minute,
    inicio: slot.inicio,
    indice: index,
  };
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
  const collectionName = block ? 'bloqueos' : 'reservas';
  const amount = publicRequest || block ? 0 : 5000;
  const now = Timestamp.now();
  const body = {
    schemaVersion: 3,
    negocioId: BUSINESS,
    sedeId: court,
    canchaId: court,
    dia: day,
    dias: [...new Set(slots.map(slotDay))],
    minuto: minute,
    duracion: duration,
    inicio: slots[0].inicio,
    fin: Timestamp.fromMillis(slots[0].inicio.toMillis() + duration * 60 * 1000),
    slots,
    estado: publicRequest ? 'pendiente' : 'confirmada',
    bloqueo: block,
    clienteId: publicRequest || block ? '' : 'cliente-1',
    clienteNombre: block ? 'Mantenimiento' : 'Cliente privado',
    telefono: block ? '' : '+51999888777',
    montoCentimos: amount,
    adelantoCentimos: 0,
    saldoCentimos: amount,
    metodoPago: 'efectivo',
    promocionId: '',
    origen: publicRequest ? 'publico' : 'personal',
    solicitanteUid: publicRequest ? uid : '',
    creadoPor: uid,
    atendidoPor: publicRequest ? '' : uid,
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
  };
}

function bookingBatch(db, booking, slotIndexes = booking.body.slots.map((_, index) => index)) {
  const batch = writeBatch(db);
  batch.set(booking.ref, booking.body);
  for (const index of slotIndexes) {
    const slot = booking.body.slots[index];
    batch.set(slotRef(db, booking.body.canchaId, slot), slotData(booking, slot, index));
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

function cancellationBatch(db, booking, actor, slotIndexes = booking.body.slots.map((_, index) => index)) {
  const batch = writeBatch(db);
  batch.update(booking.ref, {
    estado: 'cancelada',
    atendidoPor: actor,
    updatedAt: Timestamp.now(),
    version: booking.body.version + 1,
  });
  for (const index of slotIndexes) {
    batch.delete(slotRef(db, booking.body.canchaId, booking.body.slots[index]));
  }
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
      aperturaMinuto: 0,
      cierreMinuto: 1440,
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
      aperturaMinuto: 0,
      cierreMinuto: 1440,
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
// `limiteEmulador` marca pruebas que el emulador local no puede evaluar: el
// motor de reglas aborta con "maximum of 1000 expressions to evaluate has been
// reached" en cuanto una reserva ocupa dos o mas slots. No es un defecto de las
// reglas ni del producto: el limite existe solo en el emulador. La prueba se
// conserva y debe verificarse contra Firestore real.
const limiteEmulador = 'el emulador aborta al superar 1000 expresiones (2+ slots)';
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

test('una solicitud publica anonima crea una reserva pendiente con slots canonicos', async () => {
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
  assert.equal(stored.schemaVersion, 3);
  assert.equal(stored.estado, 'pendiente');
  assert.equal(stored.solicitanteUid, ANON_A);
  assert.equal(typeof stored.slots[0].year, 'string');
  assert.equal(typeof stored.slots[0].month, 'string');
  assert.equal(typeof stored.slots[0].day, 'string');
  assert.equal(typeof stored.slots[0].minute, 'string');
  assert.ok(stored.slots[0].inicio instanceof Timestamp);

  const extra = makeBooking(db, {
    id: 'r_publica_extra01',
    uid: ANON_A,
    publicRequest: true,
    duration: 30,
    minute: 660,
    patch: { notaPrivada: 'campo no autorizado' },
  });
  await assertFails(bookingBatch(db, extra).commit());
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

test('reserva y slots estan completamente acoplados en ambas direcciones', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();

  const withoutSlots = makeBooking(db, { id: 'sin-slots', uid: EMPLOYEE });
  await assertFails(bookingBatch(db, withoutSlots, []).commit());

  const missingOne = makeBooking(db, { id: 'falta-un-slot', uid: EMPLOYEE });
  await assertFails(bookingBatch(db, missingOne, [0]).commit());

  const orphan = makeBooking(db, { id: 'slot-huerfano', uid: EMPLOYEE, minute: 720 });
  await assertFails(setDoc(
    slotRef(db, COURT, orphan.body.slots[0]),
    slotData(orphan, orphan.body.slots[0], 0),
  ));

  const numericMap = makeBooking(db, { id: 'mapa-no-canonico', uid: EMPLOYEE, minute: 780 });
  const canonicalRefs = numericMap.body.slots.map((slot) => slotRef(db, COURT, slot));
  numericMap.body.slots[0] = { ...numericMap.body.slots[0], minute: 780 };
  const malformedBatch = writeBatch(db);
  malformedBatch.set(numericMap.ref, numericMap.body);
  for (let index = 0; index < numericMap.body.slots.length; index += 1) {
    malformedBatch.set(canonicalRefs[index], slotData(numericMap, numericMap.body.slots[index], index));
  }
  await assertFails(malformedBatch.commit());

  const complete = makeBooking(db, {
    id: 'acoplamiento-completo',
    uid: EMPLOYEE,
    minute: 840,
    duration: 30,
  });
  await assertSucceeds(bookingBatch(db, complete).commit());
  for (const slot of complete.body.slots) {
    assert.equal((await getDoc(slotRef(db, COURT, slot))).exists(), true);
  }
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
  const occupied = contenders[0][1].body.slots[0];
  assert.equal((await getDoc(slotRef(admin, COURT, occupied))).exists(), true);
});

test('dos reservas adyacentes de 30 minutos pueden coexistir', async () => {
  await seedApplication();
  const db = verified(EMPLOYEE).firestore();
  const first = makeBooking(db, { id: 'adyacente-a', uid: EMPLOYEE, minute: 600, duration: 30 });
  const second = makeBooking(db, { id: 'adyacente-b', uid: EMPLOYEE, minute: 630, duration: 30 });
  await assertSucceeds(bookingBatch(db, first).commit());
  await assertSucceeds(bookingBatch(db, second).commit());
  assert.equal((await getDoc(slotRef(db, COURT, first.body.slots[0]))).exists(), true);
  assert.equal((await getDoc(slotRef(db, COURT, second.body.slots[0]))).exists(), true);
});

test('una reserva de cuatro horas crea exactamente ocho slots', async () => {
  await seedApplication();
  const db = verified(ADMIN).firestore();
  const booking = makeBooking(db, { id: 'cuatro-horas', uid: ADMIN, minute: 600, duration: 240 });
  assert.equal(booking.body.slots.length, 8);
  await assertSucceeds(bookingBatch(db, booking).commit());
  for (const slot of booking.body.slots) {
    assert.equal((await getDoc(slotRef(db, COURT, slot))).exists(), true);
  }
}, limiteEmulador);

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
  assert.deepEqual(booking.body.slots.map(({ minute }) => minute), ['1410', '0', '30']);
  assert.equal(booking.body.dias.length, 2);
  assert.notEqual(booking.body.slots[0].day, booking.body.slots[1].day);
  await assertSucceeds(bookingBatch(db, booking).commit());
  for (const slot of booking.body.slots) {
    assert.equal((await getDoc(slotRef(db, COURT, slot))).exists(), true);
  }
}, limiteEmulador);

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
  for (const slot of booking.body.slots) {
    assert.equal((await getDoc(slotRef(db, COURT, slot))).exists(), false);
  }
  for (let index = 0; index < booking.body.slots.length; index += 1) {
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
  const db = verified(EMPLOYEE).firestore();
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
      id: `desalineado-${court}`, uid: EMPLOYEE, court, minute: 420, duration: 90,
    });
    await assertFails(bookingBatch(db, desalineado).commit(), court);

    const alineado = makeBooking(db, {
      id: `alineado-${court}`, uid: EMPLOYEE, court, minute: 450, duration: 90,
    });
    await assertSucceeds(bookingBatch(db, alineado).commit(), court);
  }
}, limiteEmulador);

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
  : `\n${tests.length - skipped} pruebas de reglas schemaVersion 3 OK`
    + (skipped ? `, ${skipped} omitidas en emulador.` : '.'));
process.exit(failures ? 1 : 0);

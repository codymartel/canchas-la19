import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST
    || !process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
  throw new Error('Este seed solo puede ejecutarse con Auth, Firestore y Database Emulator.');
}

const projectId = process.env.GCLOUD_PROJECT || 'demo-grass-local';
if (!projectId.startsWith('demo-')) throw new Error(`Proyecto no permitido: ${projectId}`);

const NEGOCIO = 'grass-sintetico';
// El administrador es la cuenta real del proyecto, no una identidad inventada.
// Se puede Override con ADMIN_UID / ADMIN_EMAIL para otros entornos.
const ADMIN = process.env.ADMIN_UID || 'OkzFyx72AcWbaY3PiFaiCIfVERi2';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'andymartel222@gmail.com';
const EMPLEADO = 'empleado-e2e-0002';
const LIMA_MINUTOS = 300;
const app = initializeApp({
  projectId,
  databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
});
const auth = getAuth();
const db = getFirestore();
const password = 'prueba-segura-123';

for (const user of [
  { uid: ADMIN, email: ADMIN_EMAIL, emailVerified: true },
  { uid: EMPLEADO, email: 'empleado@local.test', emailVerified: false },
]) {
  try {
    await auth.updateUser(user.uid, { emailVerified: user.emailVerified });
  } catch {
    await auth.createUser({ ...user, password });
  }
}

await db.doc('sistema/grass').set({
  administradorUid: ADMIN,
  negocioId: NEGOCIO,
  zonaHoraria: 'America/Lima',
});

// El horario es del negocio y es el mismo para las tres canchas.
const horario = {
  aperturaMinuto: 420,
  cierreMinuto: 60,
  duracionTurnoMinutos: 60,
};

const canchas = [
  {
    id: 'la-19',
    nombre: 'Cancha 19',
    direccion: 'Av. Synthetic 19, La Molina',
    tarifaTurnoCentimos: 7000,
  },
  {
    id: 'la-23',
    nombre: 'Cancha 23',
    direccion: 'Av. Synthetic 23, La Molina',
    tarifaTurnoCentimos: 6000,
  },
  {
    id: 'la-24',
    nombre: 'Cancha 24',
    direccion: 'Av. Synthetic 24, La Molina',
    tarifaTurnoCentimos: 6400,
  },
];

const lote = db.batch();
const doc = (...segmentos) => db.doc(segmentos.join('/'));
lote.set(doc('negocios_publicos', NEGOCIO), {
  negocioId: NEGOCIO,
  slug: 'grass-sintetico',
  nombre: 'Grass Sintetico',
  descripcion: 'Tres canchas de grass sintetico con agenda compartida y reserva en linea.',
  telefonoPublico: '+51 999 888 777',
  whatsapp: '+51 999 888 777',
  galeria: [
    { url: '/galeria/cancha-1.svg', alt: 'Cancha 19 al atardecer', orden: 0 },
    { url: '/galeria/cancha-2.svg', alt: 'Cancha 23 con focos', orden: 1 },
    { url: '/galeria/cancha-3.svg', alt: 'Cancha 24 de noche', orden: 2 },
  ],
  ...horario,
  actualizadoEn: FieldValue.serverTimestamp(),
});
lote.set(doc('negocios', NEGOCIO), {
  nombre: 'Grass Sintetico',
  sedePrincipal: 'la-19',
  propietarioUid: ADMIN,
  zonas: ['la-19', 'la-23', 'la-24'],
  ...horario,
  actualizadoEn: FieldValue.serverTimestamp(),
});
for (const cancha of canchas) {
  const privada = {
    id: cancha.id,
    sedeId: cancha.id,
    nombre: cancha.nombre,
    direccion: cancha.direccion,
    activa: true,
    tarifaTurnoCentimos: cancha.tarifaTurnoCentimos,
    actualizadoEn: FieldValue.serverTimestamp(),
  };
  const publica = { negocioId: NEGOCIO, ...privada };
  delete publica.actualizadoEn;
  publica.actualizadoEn = FieldValue.serverTimestamp();
  lote.set(doc('negocios', NEGOCIO, 'sedes', cancha.id), {
    nombre: cancha.nombre,
  });
  lote.set(doc('negocios', NEGOCIO, 'canchas', cancha.id), privada);
  lote.set(doc('canchas_publicas', cancha.id), publica);
}
// Empleado de control: mismo panel, sin promociones y sin gestion de empleados.
lote.set(doc('negocios', NEGOCIO, 'empleados', EMPLEADO), {
  nombre: 'Ana Ruiz',
  email: 'empleado@local.test',
  rol: 'empleado_control',
  activo: true,
  permisos: {
    agenda: true,
    reservas: true,
    clientes: true,
    promociones: false,
  },
  sedes: ['la-19', 'la-23', 'la-24'],
  sedePrincipal: 'la-19',
  actualizadoPor: ADMIN,
  actualizadoEn: FieldValue.serverTimestamp(),
});
lote.set(doc('users', EMPLEADO), { negocioId: NEGOCIO, email: 'empleado@local.test' });
await lote.commit();
await getDatabase().ref(`acceso/${NEGOCIO}`).set({
  [ADMIN]: { rol: 'administrador', activo: true, nombre: 'Administrador' },
  [EMPLEADO]: { rol: 'empleado_control', activo: true, nombre: 'Ana Ruiz' },
});

const hoy = new Date(Date.now() - LIMA_MINUTOS * 60 * 1000);
const diaLocal = (offsetDias = 0) => {
  const fecha = new Date(hoy.getTime() + offsetDias * 24 * 60 * 60 * 1000);
  const dos = (n) => String(n).padStart(2, '0');
  return `${fecha.getUTCFullYear()}-${dos(fecha.getUTCMonth() + 1)}-${dos(fecha.getUTCDate())}`;
};

async function reserva({ clave, cancha, dia, minuto, duracion, estado, origen, nombre, telefono, solicitanteUid }) {
  const id = `r_seed_${clave}`;
  const [year, month, day] = dia.split('-');
  const inicio = Timestamp.fromDate(new Date(`${dia}T00:00:00-05:00`));
  const inicioReal = Timestamp.fromMillis(inicio.toMillis() + minuto * 60 * 1000);
  const minutos = Array.from({ length: duracion / 30 }, (_, indice) => String(minuto + indice * 30));
  const ahora = FieldValue.serverTimestamp();
  const cuerpo = {
    schemaVersion: 5,
    negocioId: NEGOCIO,
    sedeId: cancha,
    canchaId: cancha,
    dia,
    jornada: { year, month, day },
    minuto,
    duracion,
    minutos,
    inicio: inicioReal,
    fin: Timestamp.fromMillis(inicioReal.toMillis() + duracion * 60 * 1000),
    estado,
    bloqueo: false,
    clienteId: '',
    clienteNombre: nombre,
    telefono,
    montoCentimos: 0,
    adelantoCentimos: 0,
    saldoCentimos: 0,
    metodoPago: '',
    promocionId: '',
    historialPagos: [],
    origen,
    solicitanteUid: origen === 'publico' ? solicitanteUid : '',
    creadoPor: origen === 'publico' ? solicitanteUid : ADMIN,
    atendidoPor: origen === 'publico' ? '' : ADMIN,
    createdAt: ahora,
    updatedAt: ahora,
    version: 1,
  };
  const escritura = db.batch();
  escritura.set(doc('negocios', NEGOCIO, 'reservas', id), cuerpo);
  if (estado === 'confirmada') {
    const ocupados = Object.fromEntries(minutos.map((valor) => [valor, true]));
    escritura.set(doc('negocios', NEGOCIO, 'agenda', cancha, 'dias', dia), {
      ocupados,
      ultimaOperacion: {
        reservaId: id,
        coleccion: 'reservas',
        tipo: 'ocupar',
        minutos,
      },
    });
    escritura.set(doc('agenda_publica', NEGOCIO, 'canchas', cancha, 'dias', dia), { ocupados });
  }
  await escritura.commit();
  return id;
}

const hoyTexto = diaLocal();
const manana = diaLocal(1);
const creada = [];

creada.push(await reserva({
  clave: 'la19_hoy', cancha: 'la-19', dia: hoyTexto, minuto: 600, duracion: 120, estado: 'confirmada',
  origen: 'personal', nombre: 'Cliente demo uno', telefono: '+51999888777',
}));
creada.push(await reserva({
  clave: 'la23_hoy', cancha: 'la-23', dia: hoyTexto, minuto: 1020, duracion: 120, estado: 'confirmada',
  origen: 'personal', nombre: 'Cliente demo dos', telefono: '+51999888766',
}));
// Cruce de medianoche en la cancha con horario nocturno.
creada.push(await reserva({
  clave: 'la24_hoy', cancha: 'la-24', dia: hoyTexto, minuto: 1380, duracion: 120, estado: 'confirmada',
  origen: 'personal', nombre: 'Cliente demo tres', telefono: '+51999888755',
}));
// Las solicitudes mayores de tres horas quedan pendientes y no ocupan agenda.
creada.push(await reserva({
  clave: 'la19_manana', cancha: 'la-19', dia: manana, minuto: 780, duracion: 240, estado: 'pendiente',
  origen: 'publico', nombre: 'Reserva web pendiente', telefono: '+51999888744',
  solicitanteUid: 'anon-web-demo',
}));
creada.push(await reserva({
  clave: 'la24_manana', cancha: 'la-24', dia: manana, minuto: 1200, duracion: 240, estado: 'pendiente',
  origen: 'publico', nombre: 'Segunda solicitud web', telefono: '+51999888733',
  solicitanteUid: 'anon-web-demo-2',
}));

console.log('Seed de emulador listo.');
console.log(`Canchas: ${canchas.map((c) => c.id).join(', ')}`);
console.log(`Reservas de ejemplo: ${creada.length} (${hoyTexto} y ${manana})`);
console.log(`Admin: ${ADMIN_EMAIL} / ${password} (uid ${ADMIN})`);
console.log(`Empleado: empleado@local.test / ${password}`);
await deleteApp(app);

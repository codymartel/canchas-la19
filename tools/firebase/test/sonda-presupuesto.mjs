// Sonda del presupuesto de accesos a documentos en las reglas.
// Inserta N accesos sinteticos (a documentos distintos, para que la cache de
// accesos no los absorba) en una funcion del camino de escritura y comprueba si
// el emulador deniega al superarse el limite oficial (10 por escritura, 20 por
// lote). Solo lee mobile/firestore.rules: no lo modifica.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, writeBatch } from 'firebase/firestore';

const here = dirname(fileURLToPath(import.meta.url));
const ORIGINAL = readFileSync(join(here, '..', '..', '..', 'mobile', 'firestore.rules'), 'utf8');

const BUSINESS = 'grass-sintetico';
const COURT = 'la-19';
const ADMIN = 'admin-uid-0001';
const EMPLOYEE = 'empleado-uid-01';
const LIMA = 5 * 60 * 60 * 1000;

const futureLocalDay = (days = 2) => {
  const d = new Date(Date.now() - LIMA + days * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
function localTimestamp(day, minute) {
  const [y, m, d] = day.split('-').map(Number);
  return Timestamp.fromMillis(Date.UTC(y, m - 1, d, 5, 0) + minute * 60000);
}
function makeBooking(db, { id, uid, minute = 600, duration = 60, court = COURT }) {
  const day = futureLocalDay();
  const n = duration / 30;
  const start = localTimestamp(day, minute).toMillis();
  const minutos = Array.from({ length: n }, (_, i) => String(minute + i * 30));
  const now = Timestamp.now();
  return {
    id, day, minutos,
    ref: doc(db, 'negocios', BUSINESS, 'reservas', id),
    agendaRef: doc(db, 'negocios', BUSINESS, 'agenda', court, 'dias', day),
    publicRef: doc(db, 'agenda_publica', BUSINESS, 'canchas', court, 'dias', day),
    body: {
      schemaVersion: 5, negocioId: BUSINESS, sedeId: court, canchaId: court, dia: day,
      jornada: { year: day.slice(0, 4), month: day.slice(5, 7), day: day.slice(8, 10) },
      minuto: minute, duracion: duration, minutos,
      inicio: Timestamp.fromMillis(start),
      fin: Timestamp.fromMillis(start + duration * 60000),
      estado: duration > 180 ? 'pendiente' : 'confirmada',
      bloqueo: false, clienteId: '', clienteNombre: 'Sonda', telefono: '+51999888777',
      montoCentimos: 0, adelantoCentimos: 0, saldoCentimos: 0, metodoPago: '',
      promocionId: '', historialPagos: [], origen: 'personal', solicitanteUid: '',
      creadoPor: uid, atendidoPor: duration > 180 ? '' : uid, createdAt: now, updatedAt: now,
      version: 1,
    },
  };
}

async function seed(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const b = writeBatch(db);
    b.set(doc(db, 'sistema', 'grass'), { administradorUid: ADMIN, negocioId: BUSINESS, zonaHoraria: 'America/Lima' });
    b.set(doc(db, 'negocios', BUSINESS), {
      propietarioUid: ADMIN, nombreNegocio: 'Grass', preparado: true,
      aperturaMinuto: 420, cierreMinuto: 60, duracionTurnoMinutos: 30,
    });
    b.set(doc(db, 'negocios', BUSINESS, 'canchas', COURT), {
      id: COURT, sedeId: COURT, negocioId: BUSINESS, nombre: 'Cancha', direccion: 'Dir', activa: true, tarifaTurnoCentimos: 2500,
    });
    b.set(doc(db, 'negocios', BUSINESS, 'empleados', EMPLOYEE), {
      nombre: 'Empleado', email: 'e@test.local', rol: 'empleado_control', activo: true,
      permisos: { agenda: true, reservas: true, clientes: true, promociones: true },
      sedes: [COURT], sedePrincipal: COURT,
    });
    await b.commit();
  });
}

// Cada parentesis es siempre true, asi que la cadena nunca cortocircuita y cada
// get llega a ejecutarse. Rutas distintas para no compartir cache. Se inyectan
// justo despues de "return" de la funcion, que es donde empieza su expresion.
const ANCLAS = {
  publica: "return d.keys().hasOnly(['ocupados'])",
  agenda: 'return d is map && d.size() == 2',
  transicion: 'return antes.schemaVersion == 5',
  reserva: 'return id.size() > 0 && id.size() <= 128',
};
function inyectar(texto, ancla, n, etiqueta) {
  if (n === 0) return texto;
  const terms = Array.from({ length: n }, (_, i) =>
    `(get(/databases/$(database)/documents/sonda/${etiqueta}-${i}) != null || true)`).join(' && ');
  return texto.replace(ancla, `return ${terms} && ${ancla.slice('return '.length)}`);
}

// donde admite "publica:7,agenda:7,transicion:4" para repartir accesos entre
// varias escrituras del mismo lote.
const donde = process.argv[2] || 'publica';
let rules = ORIGINAL;
const inyectado = [];
for (const parte of donde.split(',')) {
  const [ancla, n] = parte.split(':');
  const cuantos = Number(n || 0);
  if (!ANCLAS[ancla]) throw new Error(`ancla desconocida: ${ancla}`);
  rules = inyectar(rules, ANCLAS[ancla], cuantos, `${ancla}${cuantos}`);
  inyectado.push(`${ancla}=${cuantos}`);
}

const env = await initializeTestEnvironment({
  projectId: 'demo-grass-local',
  firestore: { host: '127.0.0.1', port: 8081, rules },
});
const db = env.authenticatedContext(EMPLOYEE, { email: 'e@test.local', email_verified: true }).firestore();
await seed(env);

const resultado = { donde, inyectado, unaEscritura: null, loteTres: null };

// Una sola escritura: alta de una reserva larga pendiente (sin agenda).
const una = makeBooking(db, { id: 'sonda-una', uid: EMPLOYEE, duration: 240 });
resultado.unaEscritura = 'OK';
try {
  await writeBatch(db).set(una.ref, una.body).commit();
} catch { resultado.unaEscritura = 'DENEGADO'; }

// Lote de tres escrituras: aprobacion de la reserva mas larga (20 minutos).
// El empleado solo opera en la-19, que es su unica sede.
const larga = makeBooking(db, { id: 'sonda-larga', uid: EMPLOYEE, duration: 600 });
try {
  await writeBatch(db).set(larga.ref, { ...larga.body, estado: 'pendiente', atendidoPor: '' }).commit();
} catch (e) {
  process.stdout.write(JSON.stringify({ donde, inyectados: n, error: 'no se pudo crear la pendiente' }) + '\n');
  await env.cleanup();
  process.exit(0);
}
const ocup = Object.fromEntries(larga.minutos.map(m => [m, true]));
const lote = writeBatch(db);
lote.update(larga.ref, { estado: 'confirmada', atendidoPor: EMPLOYEE, updatedAt: Timestamp.now(), version: 2 });
lote.set(larga.agendaRef, {
  ocupados: ocup,
  ultimaOperacion: { reservaId: larga.id, coleccion: 'reservas', tipo: 'ocupar', minutos: larga.minutos },
}, { merge: true });
lote.set(larga.publicRef, { ocupados: ocup }, { merge: true });
resultado.loteTres = 'OK';
try { await lote.commit(); } catch { resultado.loteTres = 'DENEGADO'; }

process.stdout.write(JSON.stringify(resultado) + '\n');
await env.cleanup();

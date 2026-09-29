// Reconstruye exclusivamente proyecciones publicas sanitizadas desde las
// colecciones privadas canonicas. Usa la sesion Firebase CLI solo en memoria.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const args = process.argv.slice(2);
const projectId = args.includes('--project')
  ? args[args.indexOf('--project') + 1]
  : 'glass-sintetico';
const inspect = args.includes('--inspect');
const BUSINESS = 'grass-sintetico';
const COURTS = ['la-19', 'la-23', 'la-24'];
if (projectId !== 'glass-sintetico') throw new Error(`Proyecto no autorizado: ${projectId}.`);
if (!process.env.APPDATA) throw new Error('No se encontro Firebase CLI.');

const require = createRequire(import.meta.url);
const cliRoot = join(process.env.APPDATA, 'npm', 'node_modules', 'firebase-tools', 'lib');
const authCli = require(join(cliRoot, 'auth'));
const requireAuth = require(join(cliRoot, 'requireAuth'));
const api = require(join(cliRoot, 'apiv2'));
const account = authCli.getProjectDefaultAccount(process.cwd())
  || authCli.getGlobalDefaultAccount();
if (!account) throw new Error('Firebase CLI no tiene una cuenta autenticada.');
const cliOptions = { project: projectId };
authCli.setActiveAccount(cliOptions, account);
await requireAuth.requireAuth(cliOptions);
const token = await api.getAccessToken();
const documentsBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

async function request(url, options = {}, allow404 = false) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (allow404 && response.status === 404) return null;
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new Error(body?.error?.message || `Error ${response.status}.`);
  return body;
}

function decode(value) {
  if (!value) return undefined;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return undefined;
}

function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}

function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  return { mapValue: { fields: encodeFields(value) } };
}

function encodeFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]));
}

async function getDocument(path) {
  const document = await request(`${documentsBase}/${path}`, {}, true);
  return document ? { id: document.name.split('/').pop(), ...decodeFields(document.fields) } : null;
}

async function listCollection(path) {
  const documents = [];
  let pageToken;
  do {
    const params = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await request(`${documentsBase}/${path}?${params}`);
    for (const document of page.documents || []) {
      documents.push({ id: document.name.split('/').pop(), ...decodeFields(document.fields) });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return documents;
}

const [business, privateCourts, privatePromotions, publicBusiness, publicCourts, publicPromotions] = await Promise.all([
  getDocument(`negocios/${BUSINESS}`),
  listCollection(`negocios/${BUSINESS}/canchas`),
  listCollection(`negocios/${BUSINESS}/promociones`),
  getDocument(`negocios_publicos/${BUSINESS}`),
  listCollection('canchas_publicas'),
  listCollection('promociones_publicas'),
]);
const courtMap = new Map(privateCourts.map(court => [court.id, court]));
const issues = [];
if (!business?.preparado) issues.push('El negocio privado no esta preparado.');
// El horario es del negocio: se valida una sola vez y es el que viaja a la web.
const apertura = business?.aperturaMinuto;
const cierre = business?.cierreMinuto;
const duracionTurno = business?.duracionTurnoMinutos;
if (!Number.isInteger(apertura) || apertura < 0 || apertura > 1439 || apertura % 30 !== 0) {
  issues.push('Apertura global invalida en el negocio.');
}
if (!Number.isInteger(cierre) || cierre < 1 || cierre > 1440 || cierre % 30 !== 0) {
  issues.push('Cierre global invalido en el negocio.');
}
if (apertura === cierre) issues.push('La apertura y el cierre global no pueden coincidir.');
if (!Number.isInteger(duracionTurno)
    || duracionTurno < 30
    || duracionTurno > 240
    || duracionTurno % 30 !== 0) {
  issues.push('Falta una duracion de turno valida en el negocio.');
}
for (const id of COURTS) {
  const court = courtMap.get(id);
  if (!court) {
    issues.push(`Falta la cancha privada ${id}.`);
    continue;
  }
  if (court.id !== id || court.sedeId !== id || court.negocioId !== BUSINESS) {
    issues.push(`Identidad invalida en la cancha ${id}.`);
  }
  if (!court.nombre || !court.direccion) issues.push(`Falta nombre o direccion en ${id}.`);
  if (!Number.isInteger(court.tarifaTurnoCentimos) || court.tarifaTurnoCentimos < 0) {
    issues.push(`Falta una tarifa por turno valida en ${id}.`);
  }
}

const summary = {
  projectId,
  negocioPreparado: business?.preparado === true,
  horarioGlobal: {
    aperturaMinuto: apertura,
    cierreMinuto: cierre,
    duracionTurnoMinutos: duracionTurno,
  },
  canchasPrivadas: COURTS.map(id => ({
    id,
    existe: courtMap.has(id),
    activa: courtMap.get(id)?.activa === true,
    nombre: courtMap.get(id)?.nombre,
    direccionConfigurada: !!courtMap.get(id)?.direccion,
    tarifaTurnoCentimos: courtMap.get(id)?.tarifaTurnoCentimos,
  })),
  promocionesPrivadas: privatePromotions.length,
  negocioPublicoExiste: !!publicBusiness,
  canchasPublicas: publicCourts.map(court => court.id).sort(),
  promocionesPublicas: publicPromotions.length,
  problemas: issues,
};
console.log(JSON.stringify(summary, null, 2));
if (!inspect) {
  if (issues.length) throw new Error(issues.join(' '));

  const now = new Date().toISOString();
  const publicConfig = {
  negocioId: BUSINESS,
  slug: publicBusiness?.slug || BUSINESS,
  nombre: publicBusiness?.nombre || business.nombreNegocio || 'Grass Sintetico',
  descripcion: publicBusiness?.descripcion || 'Tres canchas de grass sintetico con agenda compartida y reserva en linea.',
  telefonoPublico: publicBusiness?.telefonoPublico || '',
  whatsapp: publicBusiness?.whatsapp || '',
  galeria: Array.isArray(publicBusiness?.galeria) ? publicBusiness.galeria : [],
  // El horario viaja con la pagina publica porque es del negocio, no de la cancha.
  aperturaMinuto: apertura,
  cierreMinuto: cierre,
  duracionTurnoMinutos: duracionTurno,
  actualizadoEn: now,
  };
  const writes = [{
  update: {
    name: `projects/${projectId}/databases/(default)/documents/negocios_publicos/${BUSINESS}`,
    fields: {
      ...encodeFields(publicConfig),
      actualizadoEn: { timestampValue: now },
    },
  },
  }];
  for (const id of COURTS) {
    const court = courtMap.get(id);
    const projection = {
    id,
    negocioId: BUSINESS,
    nombre: court.nombre,
    sedeId: id,
    direccion: court.direccion,
    activa: court.activa === true,
    tarifaTurnoCentimos: court.tarifaTurnoCentimos,
    };
    writes.push({ update: {
    name: `projects/${projectId}/databases/(default)/documents/canchas_publicas/${id}`,
    fields: {
      ...encodeFields(projection),
      actualizadoEn: { timestampValue: now },
    },
    } });
  }
  for (const promotion of privatePromotions) {
    const projection = {
    negocioId: BUSINESS,
    titulo: promotion.titulo,
    descripcion: promotion.descripcion,
    sedes: promotion.sedes,
    desde: promotion.desde,
    hasta: promotion.hasta,
    activa: promotion.activa === true,
    descuentoCentimos: promotion.descuentoCentimos,
    };
    writes.push({ update: {
    name: `projects/${projectId}/databases/(default)/documents/promociones_publicas/${promotion.id}`,
    fields: {
      ...encodeFields(projection),
      actualizadoEn: { timestampValue: now },
    },
    } });
  }
  const privatePromotionIds = new Set(privatePromotions.map(promotion => promotion.id));
  for (const stale of publicPromotions) {
    if (!privatePromotionIds.has(stale.id)) {
      writes.push({ delete: `projects/${projectId}/databases/(default)/documents/promociones_publicas/${stale.id}` });
    }
  }
  await request(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`,
    { method: 'POST', body: JSON.stringify({ writes }) },
  );
  console.log(`Proyecciones publicas sincronizadas: ${writes.length} escrituras atomicas.`);
}

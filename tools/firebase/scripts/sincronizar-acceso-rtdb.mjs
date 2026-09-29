// Reconcilia la lista privada de acceso de Realtime Database con la autoridad
// protegida en Firestore. Requiere credenciales de operador; nunca se ejecuta
// desde una aplicacion cliente.
import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const args = process.argv.slice(2);
const valor = (nombre) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const projectId = valor('project')
  || process.env.GCLOUD_PROJECT
  || process.env.GOOGLE_CLOUD_PROJECT
  || 'glass-sintetico';
const emulador = !!process.env.FIRESTORE_EMULATOR_HOST;
const databaseURL = valor('database-url')
  || process.env.FIREBASE_DATABASE_URL
  || (emulador
    ? `https://${projectId}-default-rtdb.firebaseio.com`
    : 'https://glass-sintetico-default-rtdb.firebaseio.com');
const inspeccionar = args.includes('--inspect');
const usarFirebaseCli = args.includes('--firebase-cli');

function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

exigir(
  emulador || projectId === 'glass-sintetico',
  `Proyecto no autorizado: ${projectId}.`,
);
if (emulador) {
  exigir(
    !!process.env.FIREBASE_DATABASE_EMULATOR_HOST,
    'Falta FIREBASE_DATABASE_EMULATOR_HOST.',
  );
} else {
  exigir(
    databaseURL === 'https://glass-sintetico-default-rtdb.firebaseio.com',
    `Instancia RTDB no autorizada: ${databaseURL}.`,
  );
}

const nombreSeguro = (valorNombre) => {
  const nombre = String(valorNombre || '').trim() || 'Personal';
  return nombre.slice(0, 80);
};

function construirAcceso(config, empleados) {
  exigir(config?.administradorUid, 'Falta sistema/grass.administradorUid.');
  exigir(config?.negocioId, 'Falta sistema/grass.negocioId.');
  exigir(
    config.negocioId === 'grass-sintetico',
    `Negocio no autorizado: ${config.negocioId}.`,
  );
  const acceso = {
    [config.administradorUid]: {
      rol: 'administrador',
      activo: true,
      nombre: 'Administrador',
    },
  };
  for (const empleado of empleados) {
    if (empleado.activo === true && empleado.rol === 'empleado_control') {
      acceso[empleado.uid] = {
        rol: 'empleado_control',
        activo: true,
        nombre: nombreSeguro(empleado.nombre),
      };
    }
  }
  return acceso;
}

function mostrarResumen(config, acceso) {
  console.log(JSON.stringify({
    projectId,
    databaseURL,
    negocioId: config.negocioId,
    administradorUid: config.administradorUid,
    empleadosActivos: Object.keys(acceso).length - 1,
  }, null, 2));
}

async function sincronizarConAdminSdk() {
  const app = initializeApp({
    projectId,
    databaseURL,
    ...(emulador ? {} : { credential: applicationDefault() }),
  });
  const firestore = getFirestore();
  const config = (await firestore.doc('sistema/grass').get()).data();
  exigir(config?.administradorUid, 'Falta sistema/grass.administradorUid.');
  const administrador = await getAuth().getUser(config.administradorUid);
  exigir(!administrador.disabled, 'La cuenta administradora esta deshabilitada.');
  exigir(administrador.emailVerified, 'El administrador no tiene correo verificado.');
  const consulta = await firestore
    .collection(`negocios/${config.negocioId}/empleados`)
    .get();
  const empleados = consulta.docs.map((empleado) => ({
    uid: empleado.id,
    ...empleado.data(),
  }));
  const acceso = construirAcceso(config, empleados);
  mostrarResumen(config, acceso);
  if (inspeccionar) {
    console.log('Inspeccion solamente: no se modifico Realtime Database.');
  } else {
    await getDatabase().ref(`acceso/${config.negocioId}`).set(acceso);
    console.log('Acceso RTDB sincronizado desde la configuracion protegida y empleados activos.');
  }
  await deleteApp(app);
}

function valorFirestore(campo) {
  if (!campo) return undefined;
  if ('stringValue' in campo) return campo.stringValue;
  if ('booleanValue' in campo) return campo.booleanValue;
  return undefined;
}

async function respuestaJson(url, token, opciones = {}) {
  const respuesta = await fetch(url, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...opciones.headers,
    },
  });
  const texto = await respuesta.text();
  const cuerpo = texto ? JSON.parse(texto) : undefined;
  if (!respuesta.ok) {
    throw new Error(cuerpo?.error?.message || `Solicitud rechazada (${respuesta.status}).`);
  }
  return cuerpo;
}

async function tokenFirebaseCli() {
  exigir(process.env.APPDATA, 'No se encontro la instalacion de Firebase CLI.');
  const raiz = join(process.env.APPDATA, 'npm', 'node_modules', 'firebase-tools', 'lib');
  const require = createRequire(import.meta.url);
  const authCli = require(join(raiz, 'auth'));
  const requireAuth = require(join(raiz, 'requireAuth'));
  const api = require(join(raiz, 'apiv2'));
  const cuenta = authCli.getProjectDefaultAccount(process.cwd())
    || authCli.getGlobalDefaultAccount();
  exigir(cuenta, 'Firebase CLI no tiene una cuenta autenticada.');
  const opciones = { project: projectId };
  authCli.setActiveAccount(opciones, cuenta);
  await requireAuth.requireAuth(opciones);
  return api.getAccessToken();
}

async function sincronizarConFirebaseCli() {
  exigir(!emulador, '--firebase-cli se reserva para la operacion real.');
  const token = await tokenFirebaseCli();
  const baseFirestore = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const configDoc = await respuestaJson(`${baseFirestore}/sistema/grass`, token);
  const config = {
    administradorUid: valorFirestore(configDoc.fields?.administradorUid),
    negocioId: valorFirestore(configDoc.fields?.negocioId),
  };
  exigir(config.administradorUid, 'Falta sistema/grass.administradorUid.');
  const authRespuesta = await respuestaJson(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
    token,
    { method: 'POST', body: JSON.stringify({ localId: [config.administradorUid] }) },
  );
  const administrador = authRespuesta.users?.[0];
  exigir(administrador, 'El administrador configurado no existe en Authentication.');
  exigir(!administrador.disabled, 'La cuenta administradora esta deshabilitada.');
  exigir(administrador.emailVerified, 'El administrador no tiene correo verificado.');

  const empleados = [];
  let pagina;
  do {
    const parametros = new URLSearchParams({ pageSize: '1000' });
    if (pagina) parametros.set('pageToken', pagina);
    const listado = await respuestaJson(
      `${baseFirestore}/negocios/${config.negocioId}/empleados?${parametros}`,
      token,
    );
    for (const documento of listado.documents || []) {
      empleados.push({
        uid: documento.name.split('/').pop(),
        nombre: valorFirestore(documento.fields?.nombre),
        rol: valorFirestore(documento.fields?.rol),
        activo: valorFirestore(documento.fields?.activo),
      });
    }
    pagina = listado.nextPageToken;
  } while (pagina);

  const acceso = construirAcceso(config, empleados);
  mostrarResumen(config, acceso);
  if (inspeccionar) {
    console.log('Inspeccion solamente: no se modifico Realtime Database.');
    return;
  }
  await respuestaJson(
    `${databaseURL}/acceso/${config.negocioId}.json?print=silent`,
    token,
    { method: 'PUT', body: JSON.stringify(acceso) },
  );
  console.log('Acceso RTDB sincronizado desde la configuracion protegida y empleados activos.');
}

if (usarFirebaseCli) {
  await sincronizarConFirebaseCli();
} else {
  await sincronizarConAdminSdk();
}

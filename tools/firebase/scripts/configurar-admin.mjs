// Registra el UID del administrador inicial en sistema/grass.
//
// Es la UNICA forma de otorgar el rol de administrador, y es deliberadamente
// externa a la app: el documento sistema/grass es inmutable desde cualquier
// cliente (ver mobile/firestore.rules), de modo que ningun usuario puede
// concederse el permiso a si mismo.
//
// Uso:
//   node scripts/configurar-admin.mjs --email <correo> [--project glass-sintetico] [--inspect]
//   node scripts/configurar-admin.mjs --uid <UID> [--project glass-sintetico] [--inspect]
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//     GCLOUD_PROJECT=demo-grass-local node scripts/configurar-admin.mjs --email <correo> --inspect
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const NEGOCIO = 'grass-sintetico';
const args = process.argv.slice(2);
const valor = (nombre) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const correo = valor('email');
const soloInspeccion = args.includes('--inspect');
const projectId = valor('project')
  || process.env.GCLOUD_PROJECT
  || process.env.GOOGLE_CLOUD_PROJECT
  || 'glass-sintetico';
const emulador = !!process.env.FIRESTORE_EMULATOR_HOST;

function exigir(condicion, mensaje) {
  if (!condicion) {
    console.error(`ERROR: ${mensaje}`);
    process.exit(1);
  }
}

exigir(emulador || projectId === 'glass-sintetico', `Proyecto no autorizado: ${projectId}.`);
exigir(correo || valor('uid') || soloInspeccion, 'Falta --email o --uid con el administrador de Firebase Auth.');
if (correo) {
  exigir(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo), 'El correo no tiene un formato valido.');
}

initializeApp({ projectId, ...(emulador ? {} : { credential: applicationDefault() }) });
const db = getFirestore();
const auth = getAuth();
const ref = db.doc('sistema/grass');
const actual = (await ref.get()).data();

console.log(JSON.stringify({ projectId, emulador, negocio: NEGOCIO, actual: actual ?? null }, null, 2));
if (soloInspeccion) process.exit(0);

const usuario = correo ? await auth.getUserByEmail(correo) : await auth.getUser(valor('uid'));
const uid = usuario.uid;
exigir(usuario.emailVerified === true, 'El administrador debe tener el correo verificado.');
exigir(usuario.disabled !== true, 'La cuenta del administrador esta deshabilitada.');

if (actual?.administradorUid) {
  exigir(
    actual.administradorUid === uid,
    `Ya existe un administrador distinto (${actual.administradorUid}). `
      + 'No se reemplaza desde aqui: deja la decision al titular de la cuenta.',
  );
  console.log('El administrador ya estaba registrado. No se modifica nada.');
  process.exit(0);
}

await ref.set(
  {
    administradorUid: uid,
    negocioId: actual?.negocioId ?? NEGOCIO,
    zonaHoraria: 'America/Lima',
    registradoPor: 'configurar-admin.mjs',
    registradoEn: new Date(),
  },
  { merge: true },
);
console.log(
  `OK: administrador ${usuario.email} (${uid}) vinculado al negocio ${actual?.negocioId ?? NEGOCIO}. `
  + 'Abre el panel: aparecera "Vamos a coordinar".',
);

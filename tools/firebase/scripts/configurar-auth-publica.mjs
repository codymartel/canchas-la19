// Habilita exclusivamente Auth anonimo para la solicitud web publica usando
// la sesion de operador de Firebase CLI. El token solo se conserva en memoria.
import { createRequire } from 'node:module';
import { join } from 'node:path';

const projectId = process.argv.includes('--project')
  ? process.argv[process.argv.indexOf('--project') + 1]
  : 'glass-sintetico';
if (projectId !== 'glass-sintetico') {
  throw new Error(`Proyecto no autorizado: ${projectId}.`);
}
if (!process.env.APPDATA) throw new Error('No se encontro Firebase CLI.');

const raiz = join(process.env.APPDATA, 'npm', 'node_modules', 'firebase-tools', 'lib');
const require = createRequire(import.meta.url);
const authCli = require(join(raiz, 'auth'));
const requireAuth = require(join(raiz, 'requireAuth'));
const api = require(join(raiz, 'apiv2'));
const cuenta = authCli.getProjectDefaultAccount(process.cwd())
  || authCli.getGlobalDefaultAccount();
if (!cuenta) throw new Error('Firebase CLI no tiene una cuenta autenticada.');
const opciones = { project: projectId };
authCli.setActiveAccount(opciones, cuenta);
await requireAuth.requireAuth(opciones);
const token = await api.getAccessToken();
const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;

async function json(endpoint, opcionesFetch = {}) {
  const respuesta = await fetch(endpoint, {
    ...opcionesFetch,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const cuerpo = await respuesta.json();
  if (!respuesta.ok) throw new Error(cuerpo.error?.message || `Error ${respuesta.status}.`);
  return cuerpo;
}

const antes = await json(url);
if (antes.signIn?.anonymous?.enabled !== true) {
  await json(`${url}?updateMask=signIn.anonymous.enabled`, {
    method: 'PATCH',
    body: JSON.stringify({ signIn: { anonymous: { enabled: true } } }),
  });
}
const despues = await json(url);
if (despues.signIn?.anonymous?.enabled !== true) {
  throw new Error('No se pudo habilitar Authentication anonimo.');
}
console.log(JSON.stringify({
  projectId,
  anonimoAntes: antes.signIn?.anonymous?.enabled === true,
  anonimoAhora: true,
}, null, 2));

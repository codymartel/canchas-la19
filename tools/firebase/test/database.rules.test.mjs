import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { get, ref, remove, set } from 'firebase/database';

if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
  throw new Error('Solo emuladores.');
}

const here = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(
  join(here, '..', '..', '..', 'mobile', 'database.rules.json'),
  'utf8',
);
const environment = await initializeTestEnvironment({
  projectId: 'demo-grass-local',
  database: { host: '127.0.0.1', port: 9000, rules },
});
const passwordUser = uid => environment.authenticatedContext(uid, {
  firebase: { sign_in_provider: 'password' },
});
const anonymous = environment.authenticatedContext('anon-1', {
  firebase: { sign_in_provider: 'anonymous' },
});
const ADMIN = 'admin-uid-01';
const ANA = 'ana-uid-01';
const BETO = 'beto-uid-02';
const INACTIVO = 'inactivo-uid-03';
const AJENO = 'ajeno-uid-04';
const SESION = 'session-00000001';
const path = (uid, session = SESION) =>
  `presencia/grass-sintetico/la-19/2026-10-05/1140/${uid}/${session}`;
const nombres = {
  [ADMIN]: 'Administrador',
  [ANA]: 'Ana Ruiz',
  [BETO]: 'Beto Paz',
  [INACTIVO]: 'Inactivo',
};
const activity = (uid, session = SESION, patch = {}) => ({
  uid,
  sesionId: session,
  canchaId: 'la-19',
  dia: '2026-10-05',
  minuto: '1140',
  nombre: nombres[uid] ?? 'Ajeno',
  estado: 'preparando',
  actualizadoEn: Date.now() - 1000,
  expiraEn: Date.now() + 10 * 60 * 1000,
  ...patch,
});

await environment.clearDatabase();
await environment.withSecurityRulesDisabled(async context => {
  await set(ref(context.database(), 'acceso/grass-sintetico'), {
    [ADMIN]: { rol: 'administrador', activo: true, nombre: nombres[ADMIN] },
    [ANA]: { rol: 'empleado_control', activo: true, nombre: nombres[ANA] },
    [BETO]: { rol: 'empleado_control', activo: true, nombre: nombres[BETO] },
    [INACTIVO]: { rol: 'empleado_control', activo: false, nombre: nombres[INACTIVO] },
  });
});

for (const uid of [ADMIN, ANA, BETO]) {
  await assertSucceeds(set(ref(passwordUser(uid).database(), path(uid)), activity(uid)));
}
const dia = await get(ref(passwordUser(ANA).database(),
  'presencia/grass-sintetico/la-19/2026-10-05'));
assert.equal(Object.keys(dia.val()['1140']).length, 3);

await assertFails(set(
  ref(passwordUser(ANA).database(), path(BETO, 'session-ajena-0001')),
  activity(BETO, 'session-ajena-0001'),
));
await assertFails(set(
  ref(passwordUser(INACTIVO).database(), path(INACTIVO)),
  activity(INACTIVO),
));
await assertFails(get(ref(passwordUser(INACTIVO).database(),
  'presencia/grass-sintetico/la-19/2026-10-05')));
await assertFails(set(
  ref(passwordUser(AJENO).database(), path(AJENO)),
  activity(AJENO),
));
await assertFails(get(ref(passwordUser(AJENO).database(),
  'presencia/grass-sintetico/la-19/2026-10-05')));
await assertFails(set(ref(anonymous.database(), path('anon-1')), activity('anon-1')));
await assertFails(get(ref(anonymous.database(),
  'presencia/grass-sintetico/la-19/2026-10-05')));
await assertFails(set(
  ref(passwordUser(ANA).database(), path(ANA, 'session-invalida1')),
  activity(ANA, 'session-invalida1', { estado: 'confirmada' }),
));
await assertFails(set(
  ref(passwordUser(ANA).database(), path(ANA, 'session-nombre-01')),
  activity(ANA, 'session-nombre-01', { nombre: 'Otra persona' }),
));

const NUEVO = 'nuevo-uid-05';
const accesoNuevo = `acceso/grass-sintetico/${NUEVO}`;
await assertFails(set(ref(passwordUser(ANA).database(), accesoNuevo), {
  rol: 'empleado_control', activo: true, nombre: 'Nuevo',
}));
await assertFails(set(ref(passwordUser(ADMIN).database(),
  'acceso/grass-sintetico/admin-falso'), {
  rol: 'administrador', activo: true, nombre: 'Admin falso',
}));
await assertFails(set(ref(passwordUser(ADMIN).database(),
  `acceso/grass-sintetico/${ADMIN}`), {
  rol: 'empleado_control', activo: true, nombre: 'Autocambio',
}));
await assertSucceeds(set(ref(passwordUser(ADMIN).database(), accesoNuevo), {
  rol: 'empleado_control', activo: true, nombre: 'Nuevo',
}));
await assertSucceeds(set(
  ref(passwordUser(NUEVO).database(), path(NUEVO)),
  activity(NUEVO, SESION, { nombre: 'Nuevo' }),
));
await assertSucceeds(remove(ref(passwordUser(ADMIN).database(), accesoNuevo)));
await assertFails(get(ref(passwordUser(NUEVO).database(),
  'presencia/grass-sintetico/la-19/2026-10-05')));

await assertSucceeds(remove(ref(passwordUser(ANA).database(), path(ANA))));
assert.equal((await get(ref(passwordUser(BETO).database(), path(ANA)))).exists(), false);

await environment.cleanup();
console.log('Realtime Database Rules: vinculacion, baja, cuenta ajena, propiedad y ACL OK.');

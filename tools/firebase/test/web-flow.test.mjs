import {registrarCliente} from '../../../web/public/acceso.js';
import {reconstruirPrecios,calcularPrecio} from '../../../web/public/precios.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
  runTransaction,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { solicitarReserva } from '../../../web/public/reserva.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Solo emuladores de Auth y Firestore.');
}

const here = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(
  join(here, '..', '..', '..', 'mobile', 'firestore.rules'),
  'utf8',
);
const PROJECT = 'demo-grass-local';
const BUSINESS = 'grass-sintetico';
const EMPLOYEE = 'empleado-panel-01';
const OUTSIDER = 'cuenta-ajena-01';
const environment = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: { host: '127.0.0.1', port: 8081, rules },
});

function futureDay(days = 2) {
  const lima = new Date(Date.now() - 5 * 60 * 60 * 1000 + days * 86400000);
  return lima.toISOString().slice(0, 10);
}

const horarioGlobal = {
  aperturaMinuto: 420,
  cierreMinuto: 60,
  duracionTurnoMinutos: 30,
};

await environment.clearFirestore();
await environment.withSecurityRulesDisabled(async context => {
  const db = context.firestore();
  const batch = writeBatch(db);
  batch.set(doc(db, 'sistema/grass'), {
    administradorUid: 'admin-panel-01',
    negocioId: BUSINESS,
    zonaHoraria: 'America/Lima',
  });
  batch.set(doc(db, `negocios/${BUSINESS}`), {
    propietarioUid: 'admin-panel-01',
    preparado: true,
    // El horario es del negocio y es el mismo para las tres canchas.
    ...horarioGlobal,
  });
  batch.set(doc(db, `negocios_publicos/${BUSINESS}`), {
    negocioId: BUSINESS,
    slug: BUSINESS,
    nombre: 'Grass Sintetico',
    descripcion: 'Tres canchas con agenda compartida.',
    galeria: [],
    ...horarioGlobal,
  });
  for (const [id, name] of [['la-19', 'La 19'], ['la-23', 'La 23'], ['la-24', 'La 24']]) {
    const court = {
      id,
      negocioId: BUSINESS,
      sedeId: id,
      nombre: name,
      direccion: '',
      activa: true,
      tarifaTurnoCentimos: null,
    };
    batch.set(doc(db, `negocios/${BUSINESS}/canchas/${id}`), court);
    batch.set(doc(db, `canchas_publicas/${id}`), court);
  }
  batch.set(doc(db, `negocios/${BUSINESS}/empleados/${EMPLOYEE}`), {
    nombre: 'Empleado Panel',
    rol: 'empleado_control',
    activo: true,
    permisos: { agenda: true, reservas: true, clientes: false, promociones: false },
    sedes: ['la-19', 'la-23', 'la-24'],
    sedePrincipal: 'la-19',
  });
  await batch.commit();
});

const app = firebase.initializeApp({
  apiKey: 'demo-key',
  projectId: PROJECT,
  authDomain: `${PROJECT}.firebaseapp.com`,
}, 'web-flow');
const auth = app.auth();
auth.useEmulator('http://127.0.0.1:9099');
const db = app.firestore();
db.useEmulator('127.0.0.1', 8081);
await auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(JSON.stringify({sub:'google-primero',email:'primero@test.local',email_verified:true,name:'Cliente local'})));
await registrarCliente(firebase,db,BUSINESS,auth.currentUser);
const uid = auth.currentUser.uid;

const publicCourts = await db.collection('canchas_publicas')
  .where('activa', '==', true)
  .get({ source: 'server' });
assert.deepEqual(publicCourts.docs.map(doc => doc.id).sort(), ['la-19', 'la-23', 'la-24']);

// El horario viaja en la pagina publica del negocio y las canchas ya no lo
// guardan: la web lee un solo horario para las tres.
const publicBusiness = await db.collection('negocios_publicos').doc(BUSINESS).get({ source: 'server' });
assert.equal(publicBusiness.exists, true, 'Falta la pagina publica del negocio.');
assert.equal(publicBusiness.data().aperturaMinuto, horarioGlobal.aperturaMinuto);
assert.equal(publicBusiness.data().cierreMinuto, horarioGlobal.cierreMinuto);
assert.equal(publicBusiness.data().duracionTurnoMinutos, horarioGlobal.duracionTurnoMinutos);
for (const cancha of publicCourts.docs) {
  for (const legacy of ['aperturaMinuto', 'cierreMinuto', 'duracionTurnoMinutos']) {
    assert.equal(legacy in cancha.data(), false, `${cancha.id} todavia guarda ${legacy}.`);
  }
}

const day = futureDay();
const request = {
  requestId: 'web-flow-000001',
  dia: day,
  canchaId: 'la-19',
  minuto: 1140,
  duracion: 60,
  nombre: 'PRUEBA WEB EMULADOR',
  telefono: '+51900000000',
  modalidad: 'adelanto',
};
const created = await solicitarReserva({
  firebase,
  db,
  uid,
  negocio: BUSINESS,
  datos: request,
});
assert.equal(created.estado, 'confirmada');
const fichaAntes=(await db.doc('negocios/'+BUSINESS+'/clientesRegistrados/'+uid).get()).data();
assert.equal(fichaAntes.nombre,request.nombre);assert.equal(fichaAntes.telefono,request.telefono);
assert.equal((await solicitarReserva({firebase,db,uid,negocio:BUSINESS,datos:request})).id,created.id);
assert.equal((await db.doc('negocios/'+BUSINESS+'/clientesRegistrados/'+uid).get()).data().actualizadoEn.toMillis(),fichaAntes.actualizadoEn.toMillis());
await assert.rejects(solicitarReserva({firebase,db,uid,negocio:BUSINESS,datos:{...request,requestId:'cuenta-segunda',canchaId:'la-24',duracion:300}}));


const staff = environment.authenticatedContext(EMPLOYEE, {
  firebase: { sign_in_provider: 'password' },
}).firestore();
const preferencia = await assertSucceeds(getDoc(doc(staff, `negocios/${BUSINESS}/preferenciasReservas/${created.id}`)));
assert.equal(preferencia.data().modalidad, 'adelanto');
await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), `negocios/${BUSINESS}/preferenciasReservas/${created.id}`)));
const panelQuery = query(
  collection(staff, `negocios/${BUSINESS}/reservas`),
  where('dia', '==', day),
  limit(1500),
);
const panelRows = await assertSucceeds(getDocs(panelQuery));
assert.equal(panelRows.docs.some(doc => doc.id === created.id), true);
assert.equal(panelRows.docs.find(doc => doc.id === created.id).data().estado, 'confirmada');
const privateAgenda = await assertSucceeds(getDoc(doc(
  staff,
  `negocios/${BUSINESS}/agenda/la-19/dias/${day}`,
)));
assert.deepEqual(privateAgenda.data().ocupados, { '1140': true, '1170': true });
assert.equal(privateAgenda.data().ultimaOperacion.reservaId, created.id);
const publicAgenda = await db.doc(
  `agenda_publica/${BUSINESS}/canchas/la-19/dias/${day}`,
).get({ source: 'server' });
assert.deepEqual(publicAgenda.data(), { ocupados: { '1140': true, '1170': true } });

const secondApp = firebase.initializeApp({
  apiKey: 'demo-key',
  projectId: PROJECT,
  authDomain: `${PROJECT}.firebaseapp.com`,
}, 'web-flow-second');
const secondAuth = secondApp.auth();
secondAuth.useEmulator('http://127.0.0.1:9099');
const secondDb = secondApp.firestore();
secondDb.useEmulator('127.0.0.1', 8081);
await assert.rejects(secondDb.doc('negocios/'+BUSINESS+'/clientesRegistrados/'+uid).get(),e=>e.code==='permission-denied');
await secondAuth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(JSON.stringify({sub:'google-segundo',email:'segundo@test.local',email_verified:true,name:'Segundo local'})));
await registrarCliente(firebase,secondDb,BUSINESS,secondAuth.currentUser);
await assert.rejects(
  solicitarReserva({
    firebase,
    db: secondDb,
    uid: secondAuth.currentUser.uid,
    negocio: BUSINESS,
    datos: { ...request, requestId: 'web-flow-000002' },
  }),
  error => error.code === 'already-exists',
);

await assert.rejects(
  db.collection(`negocios/${BUSINESS}/reservas`).limit(1500).get(),
  error => error.code === 'permission-denied',
);
await assert.rejects(
  db.doc(`negocios/${BUSINESS}/empleados/${uid}`).set({
    activo: true,
    rol: 'empleado_control',
  }),
  error => error.code === 'permission-denied',
);
const outsider = environment.authenticatedContext(OUTSIDER, {
  firebase: { sign_in_provider: 'password' },
}).firestore();
await assertFails(getDoc(doc(outsider, `negocios/${BUSINESS}/reservas/${created.id}`)));
await assertFails(getDoc(doc(outsider, `negocios/${BUSINESS}/empleados/${EMPLOYEE}`)));

// Dos sesiones reales de SDK observan las tres canchas sin recargar.
const vistas=new Map(), privadas=new Map(), stops=[];
for(const court of ['la-19','la-23','la-24']){
  stops.push(secondDb.doc('agenda_publica/'+BUSINESS+'/canchas/'+court+'/dias/'+day).onSnapshot(s=>vistas.set(court,s.data()?.ocupados??{})));
  stops.push(onSnapshot(doc(staff,'negocios/'+BUSINESS+'/agenda/'+court+'/dias/'+day),s=>privadas.set(court,s.data()?.ocupados??{})));
}
async function esperar(test){const limit=Date.now()+10000;while(!test()){if(Date.now()>limit)throw Error('Listener no sincronizado');await new Promise(r=>setTimeout(r,20));}}
await esperar(()=>vistas.size===3&&privadas.size===3);
assert.deepEqual(vistas.get('la-23'),{});assert.deepEqual(vistas.get('la-24'),{});
async function resolver(id,estado){
  await runTransaction(staff,async tx=>{
    const ref=doc(staff,'negocios/'+BUSINESS+'/reservas/'+id);const s=await tx.get(ref),r=s.data();
    const agenda=doc(staff,'negocios/'+BUSINESS+'/agenda/'+r.canchaId+'/dias/'+r.dia);
    const pub=doc(staff,'agenda_publica/'+BUSINESS+'/canchas/'+r.canchaId+'/dias/'+r.dia);
    const a=await tx.get(agenda),ocupados={...(a.data()?.ocupados??{})};
    if(estado==='confirmada'&&r.minutos.some(m=>ocupados[m]))throw Error('Horario ocupado');
    for(const m of r.minutos){if(estado==='cancelada')delete ocupados[m];else ocupados[m]=true;}
    tx.update(ref,{estado,version:r.version+1,atendidoPor:EMPLOYEE,updatedAt:firebase.firestore.Timestamp.now()});
    tx.set(agenda,{ocupados,ultimaOperacion:{reservaId:id,coleccion:'reservas',tipo:estado==='cancelada'?'liberar':'ocupar',minutos:r.minutos}});
    tx.set(pub,{ocupados});
  });
}
const extraApps=[];
async function reservar(datos,database=null,identidad=null){
 if(!database){
  const n='independiente-'+extraApps.length;
  const a=firebase.initializeApp({apiKey:'demo-key',projectId:PROJECT,authDomain:PROJECT+'.firebaseapp.com'},n);extraApps.push(a);
  a.auth().useEmulator('http://127.0.0.1:9099');database=a.firestore();database.useEmulator('127.0.0.1',8081);
  await a.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(JSON.stringify({sub:n,email:n+'@test.local',email_verified:true,name:'Cliente local'})));
  identidad=a.auth().currentUser.uid;await registrarCliente(firebase,database,BUSINESS,a.auth().currentUser);
 }
 return solicitarReserva({firebase,db:database,uid:identidad,negocio:BUSINESS,datos:{...request,...datos}});
}
const nocturnas=[];
for(const court of ['la-19','la-23','la-24']){
 const r=await reservar({requestId:'nocturna-'+court,canchaId:court,minuto:1440,duracion:60});nocturnas.push(r.id);
 await esperar(()=>vistas.get(court)?.['1440']===true&&privadas.get(court)?.['1470']===true);
 const stored=(await getDoc(doc(staff,'negocios/'+BUSINESS+'/reservas/'+r.id))).data();
 assert.equal(stored.dia,day);assert.equal(stored.inicio.toDate().toISOString(),new Date(new Date(day+'T00:00:00-05:00').getTime()+1440*60000).toISOString());
 assert.deepEqual(Object.keys(vistas.get(court)).filter(m=>Number(m)>=1440),['1440','1470']);
}
const race=await Promise.allSettled([
 reservar({requestId:'integracion-race-a',minuto:780}),
 reservar({requestId:'integracion-race-b',minuto:780},secondDb,secondAuth.currentUser.uid),
]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
const winner=race.find(r=>r.status==='fulfilled').value.id;await resolver(winner,'cancelada');
const larga=await reservar({requestId:'cinco-horas',canchaId:'la-23',minuto:600,duracion:300});
assert.equal(larga.estado,'pendiente');assert.equal(vistas.get('la-23')['600'],undefined);
await assertFails(writeBatch(outsider).update(doc(outsider,'negocios/'+BUSINESS+'/reservas/'+larga.id),{estado:'confirmada',version:2,atendidoPor:OUTSIDER}).commit());
const corta=await reservar({requestId:'interferencia',canchaId:'la-23',minuto:660,duracion:60});
await assert.rejects(resolver(larga.id,'confirmada'),/Horario ocupado/);
await resolver(corta.id,'cancelada');await resolver(larga.id,'confirmada');
await esperar(()=>vistas.get('la-23')['600']===true&&privadas.get('la-23')['870']===true);
await resolver(larga.id,'cancelada');
for(const id of nocturnas)await resolver(id,'cancelada');
await resolver(created.id,'cancelada');
await esperar(()=>[...vistas.values()].every(v=>Object.keys(v).length===0)&&[...privadas.values()].every(v=>Object.keys(v).length===0));
for(const stop of stops)stop();
console.log('Integracion: listeners de tres canchas, carrera de dos sesiones, madrugada operativa, cinco horas, rechazo ajeno, revalidacion y cancelacion OK.');
const preciosAdmin=environment.authenticatedContext('admin-panel-01',{email_verified:true,firebase:{sign_in_provider:'password'}}).firestore();
const basePrecio='negocios/'+BUSINESS+'/parametrosCanchas/la-19/dias/'+day;
const publicPrecio='precios_publicos/'+BUSINESS+'/canchas/la-19/dias/'+day+'/bloques';
let preciosVista=null;
const stopPrecios=onSnapshot(collection(environment.unauthenticatedContext().firestore(),publicPrecio), snap=>{preciosVista=reconstruirPrecios(snap.docs.map(d=>d.data()));});
let antesPrecio={bloque:null,plazoMinutos:null};
for(const [v,p] of [[1,5000],[2,7500]]){
 const bloque={desde:420,hasta:540,precioCentimos:p,adelantoCentimos:1000};
 const despues={bloque,plazoMinutos:10},batch=writeBatch(preciosAdmin),evt='tarifa-'+v;
 batch.set(doc(preciosAdmin,basePrecio),{...despues,version:v,eventoId:evt,actualizadoPor:'admin-panel-01',actualizadoEn:serverTimestamp()});
 batch.set(doc(preciosAdmin,basePrecio+'/historial/'+evt),{antes:antesPrecio,despues,version:v,actualizadoPor:'admin-panel-01',actualizadoEn:firebase.firestore.FieldValue.serverTimestamp()});
 batch.set(doc(preciosAdmin,publicPrecio+'/'+evt),{...despues,version:v});
 await assertSucceeds(batch.commit());await esperar(()=>preciosVista?.version===v);
 assert.deepEqual(calcularPrecio(preciosVista,new Set([420,480])),{total:p*2,adelanto:2000,saldo:p*2-2000});antesPrecio=despues;
}
stopPrecios();console.log('Precios en tiempo real, cálculo por hora y preferencia de adelanto privada OK.');
await auth.signOut();
await secondAuth.signOut();
for(const a of extraApps){await a.auth().signOut();await a.delete();}
await app.delete();
await secondApp.delete();
await environment.cleanup();
console.log('Web Spark schema 5: 3 canchas, reserva, agenda diaria, colision y privacidad OK.');

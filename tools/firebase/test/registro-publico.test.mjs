import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,query,limit,updateDoc,deleteDoc,writeBatch,serverTimestamp,Timestamp} from 'firebase/firestore';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import {guardarFichaCliente} from '../../../web/public/acceso.js';
if(!process.env.FIRESTORE_EMULATOR_HOST||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Solo demo-grass-local con emuladores.');
const negocio='grass-sintetico',projectId='demo-grass-local';
const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8081,rules:readFileSync('mobile/firestore.registro.rules','utf8')}});
await env.clearFirestore();
await env.withSecurityRulesDisabled(async c=>{
 const db=c.firestore(),b=writeBatch(db);
 b.set(doc(db,'sistema/grass'),{administradorUid:'gerente',negocioId:negocio,zonaHoraria:'America/Lima'});
 b.set(doc(db,'negocios/'+negocio),{propietarioUid:'gerente',preparado:true,aperturaMinuto:420,cierreMinuto:60,duracionTurnoMinutos:30});
 b.set(doc(db,'negocios/'+negocio+'/empleados/personal'),{nombre:'Personal local',rol:'empleado_control',activo:true,permisos:{agenda:true,reservas:true,clientes:true,promociones:false},sedes:['la-19','la-23','la-24'],sedePrincipal:'la-19'});
 for(const id of ['la-19','la-23','la-24'])b.set(doc(db,'negocios/'+negocio+'/canchas/'+id),{id,negocioId:negocio,sedeId:id,nombre:id,direccion:'',activa:true,tarifaTurnoCentimos:null});
 await b.commit();
});
const apps=[];
async function google(id){const app=firebase.initializeApp({apiKey:'demo-key',projectId,authDomain:projectId+'.firebaseapp.com'},id);apps.push(app);app.auth().useEmulator('http://127.0.0.1:9099');app.firestore().useEmulator('127.0.0.1',8081);await app.auth().signInWithCredential(firebase.auth.GoogleAuthProvider.credential(JSON.stringify({sub:id,email:id+'@test.local',email_verified:false,name:'Cliente local'})));return {db:app.firestore(),user:app.auth().currentUser};}
const a=await google('registro-a'),b=await google('registro-b');
const path='negocios/'+negocio+'/clientesRegistrados/'+a.user.uid;
assert.equal((await a.db.doc(path).get()).exists,false,'No se inventa una ficha incompleta al iniciar sesión.');
await assert.rejects(guardarFichaCliente(firebase,a.db,negocio,a.user,'','900000000'));
await assert.rejects(guardarFichaCliente(firebase,a.db,negocio,a.user,'Cliente','abc'));
await guardarFichaCliente(firebase,a.db,negocio,a.user,'Nombre local','900000000');
const primero=(await a.db.doc(path).get()).data();assert.equal(primero.nombre,'Nombre local');assert.equal(primero.telefono,'+51900000000');assert.equal(primero.email,'registro-a@test.local');
await guardarFichaCliente(firebase,a.db,negocio,a.user,'Nombre corregido','+51 900 000 001');
const segundo=(await a.db.doc(path).get()).data();assert.equal(segundo.nombre,'Nombre corregido');assert.equal(segundo.telefono,'+51900000001');assert.equal(segundo.creadoEn.toMillis(),primero.creadoEn.toMillis());
console.log('Registro SDK Google sin verificación adicional: nombre, teléfono normalizado y fechas conservadas OK.');
await assert.rejects(b.db.doc(path).get(),e=>e.code==='permission-denied');
await assert.rejects(b.db.doc(path).update({nombre:'Usurpado',actualizadoEn:firebase.firestore.FieldValue.serverTimestamp()}),e=>e.code==='permission-denied');
const anon=env.unauthenticatedContext().firestore(),staff=env.authenticatedContext('personal',{firebase:{sign_in_provider:'password'}}).firestore();
await assertFails(getDoc(doc(anon,path)));await assertSucceeds(getDoc(doc(staff,path)));
await assertSucceeds(getDocs(query(collection(staff,'negocios/'+negocio+'/clientesRegistrados'),limit(50))));
await assertFails(getDocs(query(collection(staff,'negocios/'+negocio+'/clientesRegistrados'),limit(51))));
await assert.rejects(a.db.doc(path).update({email:'otra@test.local',actualizadoEn:firebase.firestore.FieldValue.serverTimestamp()}),e=>e.code==='permission-denied');
await assert.rejects(a.db.doc(path).update({telefono:'',actualizadoEn:firebase.firestore.FieldValue.serverTimestamp()}),e=>e.code==='permission-denied');
await assert.rejects(a.db.doc(path).delete(),e=>e.code==='permission-denied');
const password=env.authenticatedContext('password-cliente',{email:'password@test.local',firebase:{sign_in_provider:'password'}}).firestore();
await assertFails(setDoc(doc(password,'negocios/'+negocio+'/clientesRegistrados/password-cliente'),{...segundo,uid:'password-cliente',email:'password@test.local',creadoEn:serverTimestamp(),actualizadoEn:serverTimestamp()}));
console.log('Privacidad, identidad de Google, campos obligatorios, permiso de Clientes y límite de lectura OK.');
const dia=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
function reserva(uid,origen){const inicio=Timestamp.fromDate(new Date(dia+'T10:00:00-05:00'));return {schemaVersion:5,negocioId:negocio,sedeId:'la-19',canchaId:'la-19',dia,jornada:{year:dia.slice(0,4),month:dia.slice(5,7),day:dia.slice(8,10)},minuto:600,duracion:60,minutos:['600','630'],inicio,fin:Timestamp.fromMillis(inicio.toMillis()+3600000),estado:'confirmada',bloqueo:false,clienteId:'',clienteNombre:'Cliente local',telefono:'+51900000000',montoCentimos:0,adelantoCentimos:0,saldoCentimos:0,metodoPago:'',promocionId:'',historialPagos:[],origen,solicitanteUid:origen==='publico'?uid:'',creadoPor:uid,atendidoPor:origen==='personal'?uid:'',createdAt:Timestamp.now(),updatedAt:Timestamp.now(),version:1};}
function lote(db,id,r){const batch=writeBatch(db);batch.set(doc(db,'negocios/'+negocio+'/reservas/'+id),r);batch.set(doc(db,'negocios/'+negocio+'/agenda/la-19/dias/'+dia),{ocupados:{'600':true,'630':true},ultimaOperacion:{reservaId:id,coleccion:'reservas',tipo:'ocupar',minutos:r.minutos}});batch.set(doc(db,'agenda_publica/'+negocio+'/canchas/la-19/dias/'+dia),{ocupados:{'600':true,'630':true}});return batch;}
for(const [uid,ctx] of [[a.user.uid,env.authenticatedContext(a.user.uid,{email:a.user.email,firebase:{sign_in_provider:'google.com'}})],['anonimo',env.authenticatedContext('anonimo',{firebase:{sign_in_provider:'anonymous'}})]]){
 const db=ctx.firestore();await assertFails(lote(db,'r_publica_cerrada_'+uid,reserva(uid,'publico')).commit());
 const pendiente={...reserva(uid,'publico'),duracion:300,minutos:Array.from({length:10},(_,i)=>String(600+i*30)),fin:Timestamp.fromDate(new Date(dia+'T15:00:00-05:00')),estado:'pendiente'};
 await assertFails(setDoc(doc(db,'negocios/'+negocio+'/reservas/r_pendiente_cerrada_'+uid),pendiente));
}
await assertSucceeds(lote(staff,'r_personal_igual',reserva('personal','personal')).commit());
await env.withSecurityRulesDisabled(async c=>assert.equal((await getDocs(collection(c.firestore(),'negocios/'+negocio+'/reservas'))).size,1));
console.log('Reservas públicas directas y largas denegadas; reserva del personal con login original aprobada.');
for(const app of apps){await app.auth().signOut();await app.delete();}await env.cleanup();
console.log('Etapa registro público solamente: integración y reglas OK.');

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configurarAcceso,normalizarTelefonoRegistro} from '../public/acceso.js';
test('registro solo: Google muestra contacto pero mantiene reserva deshabilitada',async()=>{
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,disabled:false,textContent:'',events:{},addEventListener(t,f){this.events[t]=f;}});return elements.get(id);};
 const anterior=globalThis.document;globalThis.document={getElementById:element};
 try{
  let cambio;const auth={currentUser:null,onAuthStateChanged(cb){cambio=cb;}};
  const ref={collection(){return this;},doc(){return this;},async get(){return {data:()=>({nombre:'Nombre guardado',telefono:'+51900000000'})};},onSnapshot(){throw Error('El registro no debe iniciar listeners de reservas.');}};
  configurarAcceso({},auth,{collection:()=>ref},'grass-sintetico',()=>{},()=>false,false);
  await cambio(null);assert.equal(element('registro-contacto').hidden,true);assert.equal(element('enviar').disabled,true);
  auth.currentUser={uid:'google-uid',email:'cliente@test.local',displayName:'Nombre Google',providerData:[{providerId:'google.com'}]};
  await cambio(auth.currentUser);assert.equal(element('registro-contacto').hidden,false);assert.equal(element('enviar').disabled,true);assert.equal(element('nombre-registro').value,'Nombre guardado');assert.equal(element('telefono-registro').value,'+51900000000');
 }finally{globalThis.document=anterior;}
});
test('teléfono obligatorio y con formato internacional; Perú local se normaliza',()=>{
 assert.equal(normalizarTelefonoRegistro('900 000 000'),'+51900000000');assert.equal(normalizarTelefonoRegistro('+51 900-000-001'),'+51900000001');for(const numero of ['', 'abc', '+00123456789'])assert.throws(()=>normalizarTelefonoRegistro(numero));
});

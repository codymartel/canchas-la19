import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import * as disponibilidad from '../public/disponibilidad.js';
import * as precios from '../public/precios.js';
import {conTiempoLimite} from '../public/lectura.js';
test('actualizar termina sin esperar listeners y funciona después de reservar',async()=>{
 const elementos=new Map();
 function elemento(){return {attributes:{},setAttribute(n,v){this.attributes[n]=v;},value:'',textContent:'',dataset:{},disabled:false,hidden:false,children:[],events:{},append(...a){this.children.push(...a);},replaceChildren(...a){this.children=a;this.value=a[0]?.value??'';},querySelectorAll(){return [];},addEventListener(t,f){this.events[t]=f;}};}
 const document={getElementById(id){if(!elementos.has(id))elementos.set(id,elemento());return elementos.get(id);},createElement:elemento};
 let lecturas=0,envios=0,payload,listener;
 const ref={collection(){return this;},doc(){return this;},where(){return this;},orderBy(){return this;},async get(){lecturas++;return {exists:true,data:()=>({aperturaMinuto:420,cierreMinuto:60,duracionTurnoMinutos:30,ocupados:{'600':true}}),docs:[{id:'la-19',data:()=>({nombre:'La 19',sedeId:'la-19',sedes:['la-19']})}]};},onSnapshot(opciones,callback){listener=callback;return ()=>{};}};
 const auth={currentUser:{uid:'sesion',providerData:[{providerId:'google.com'}]}};
 const db={collection:()=>ref};
 const firebase={initializeApp(){},auth:()=>auth,firestore:()=>db};
 const fuente=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const dependencias={...disponibilidad,...precios};const nombres=Object.keys(dependencias);
 await new AsyncFunction('document','window','location','firebase','crypto','sessionStorage','conTiempoLimite','solicitarReserva','configurarAcceso',...nombres,fuente)(document,{GRASS_RESERVAS_HABILITADAS:true,GRASS_FIREBASE_CONFIG:{}},{hostname:'sitio.example'},firebase,webcrypto,{getItem:()=>null,setItem(){}},conTiempoLimite,async({datos})=>{payload=datos;envios++;return {id:'r_prueba',estado:'confirmada'};},()=>{},...nombres.map(n=>dependencias[n]));
 const recargar=elementos.get('recargar');assert.equal(recargar.disabled,false);
 const dia=elementos.get('dia');dia.value=disponibilidad.siguienteDia(disponibilidad.hoyLima());dia.events.change();
 // La fecha inicia una lectura; espera su final antes de elegir.
 while(recargar.disabled)await new Promise(resolve=>setImmediate(resolve));
 function nodos(n){return [n,...n.children.flatMap(nodos)];}
 function casilla(inicio){return nodos(elementos.get('sedes')).find(n=>n.type==='checkbox'&&n.attributes['aria-label']===`Reservar La 19 ${disponibilidad.hora(inicio)} a ${disponibilidad.hora(inicio+60)}`);}
 await elementos.get('reserva').events.submit({preventDefault(){}});assert.equal(envios,0);
 assert.equal(casilla(600),undefined); // La hora ocupada muestra X, no ofrece casilla.
 let check=casilla(480);check.checked=true;check.events.change();
 check=casilla(540);check.checked=true;check.events.change();
 assert.equal(elementos.get('cancha').value,'la-19');assert.equal(elementos.get('minuto').value,'480');assert.equal(elementos.get('duracion').value,'120');
 assert.match(elementos.get('seleccion').textContent,/08:00 a 10:00.*2 horas/);
 listener({metadata:{fromCache:false},data:()=>({ocupados:{'480':true,'600':true}})});
 assert.equal(elementos.get('minuto').value,'');assert.equal(casilla(480),undefined);
 listener({metadata:{fromCache:false},data:()=>({ocupados:{'600':true}})});
 check=casilla(480);check.checked=true;check.events.change();check=casilla(540);check.checked=true;check.events.change();
 check=casilla(660);check.checked=true;check.events.change(); // No admite huecos.
 assert.equal(elementos.get('duracion').value,'120');assert.equal(casilla(660).checked,false);
 document.getElementById('nombre').value='Prueba local';document.getElementById('telefono').value='900000000';
 auth.currentUser=null;
 await elementos.get('reserva').events.submit({preventDefault(){}});assert.equal(envios,0);assert.match(elementos.get('estado').textContent,/Google/);
 auth.currentUser={uid:'sesion',providerData:[{providerId:'google.com'}]};
 await elementos.get('reserva').events.submit({preventDefault(){}});assert.equal(envios,1);assert.equal(payload.minuto,480);assert.equal(payload.duracion,120);
 const recibo=elementos.get('estado').textContent,antes=lecturas;
 await recargar.events.click();assert.ok(lecturas>antes);assert.equal(recargar.disabled,false);
 assert.equal(elementos.get('estado').textContent,recibo);assert.equal(elementos.get('minuto').value,'480');
 await recargar.events.click();assert.equal(recargar.disabled,false);
});

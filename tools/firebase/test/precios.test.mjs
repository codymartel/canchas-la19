import test from 'node:test';
import assert from 'node:assert/strict';
import {reconstruirPrecios,calcularPrecio} from '../../../web/public/precios.js';
test('horas consecutivas con tarifas diferentes, adelanto y saldo exactos',()=>{
 const p=reconstruirPrecios([{version:1,plazoMinutos:10,bloque:{desde:420,hasta:1500,precioCentimos:5000,adelantoCentimos:1000}},{version:2,plazoMinutos:15,bloque:{desde:480,hasta:540,precioCentimos:7500,adelantoCentimos:1500}}]);
 assert.deepEqual(calcularPrecio(p,new Set([420,480])),{total:12500,adelanto:2500,saldo:10000});assert.equal(p.plazoMinutos,15);assert.equal(p.horas[540].precioCentimos,5000);
 assert.deepEqual(calcularPrecio(p,new Set([1440])),{total:5000,adelanto:1000,saldo:4000});
});
test('tarifas pendientes no inventan importes y selección vacía no calcula',()=>{
 assert.equal(calcularPrecio(null,new Set([420])),null);assert.equal(calcularPrecio({horas:{420:{precioCentimos:100,adelantoCentimos:0}}},new Set([420,480])),null);assert.equal(calcularPrecio({},new Set()),null);
});
test('bajo medio alto y 100 cambios conservan otras franjas',()=>{
 const events=[{version:1,plazoMinutos:10,bloque:{desde:420,hasta:1500,precioCentimos:100,adelantoCentimos:0}}];
 for(let v=2;v<=101;v++)events.push({version:v,plazoMinutos:10,bloque:{desde:480,hasta:540,precioCentimos:v%2?100000:5000,adelantoCentimos:1000}});
 const p=reconstruirPrecios(events.reverse());assert.equal(p.horas[420].precioCentimos,100);assert.equal(p.horas[480].precioCentimos,100000);assert.equal(Object.keys(p.horas).length,18);
});

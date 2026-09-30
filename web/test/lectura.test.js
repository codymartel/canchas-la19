import {test} from 'node:test';
import assert from 'node:assert/strict';
import {conTiempoLimite} from '../public/lectura.js';
test('una lectura sin respuesta termina y permite reintentar',async()=>{
 await assert.rejects(conTiempoLimite(new Promise(()=>{}),10),/No se pudo actualizar/);
 assert.equal(await conTiempoLimite(Promise.resolve('disponible'),10),'disponible');
});
test('los errores del servidor llegan sin esperar al temporizador',async()=>{
 await assert.rejects(conTiempoLimite(Promise.reject(new Error('sin acceso')),100),/sin acceso/);
});

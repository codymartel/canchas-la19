import {test} from 'node:test';
import assert from 'node:assert/strict';
import {intervaloSeleccionado} from '../public/disponibilidad.js';
test('horas consecutivas producen un solo intervalo',()=>assert.deepEqual(intervaloSeleccionado([540,480]),{minuto:480,duracion:120}));
test('medianoche conserva el día operativo',()=>assert.deepEqual(intervaloSeleccionado([1380,1440]),{minuto:1380,duracion:120}));
test('no se reserva sin marcar horas',()=>assert.equal(intervaloSeleccionado([]),null));
test('rechaza horas separadas y medias horas públicas',()=>{assert.throws(()=>intervaloSeleccionado([480,600]),/consecutivas/);assert.throws(()=>intervaloSeleccionado([510]),/consecutivas/);});
test('máximo diez horas y sin contar dos veces una casilla',()=>{assert.deepEqual(intervaloSeleccionado([480,480]),{minuto:480,duracion:60});assert.equal(intervaloSeleccionado(Array.from({length:10},(_,i)=>420+i*60)).duracion,600);assert.throws(()=>intervaloSeleccionado(Array.from({length:11},(_,i)=>420+i*60)),/máximo/);});

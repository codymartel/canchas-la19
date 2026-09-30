import {test} from 'node:test';
import assert from 'node:assert/strict';
import {iniciosDisponibles,iniciosDeTurno,hora,siguienteDia,leerHorario} from '../public/disponibilidad.js';
test('no ofrece duración que atraviesa una franja ocupada',()=>assert.deepEqual(iniciosDisponibles([600,630,690,720],60),[600,690]));
test('cuatro horas requieren ocho franjas consecutivas',()=>assert.deepEqual(iniciosDisponibles([600,630,660],240),[]));
test('cruza medianoche solo con la franja siguiente libre',()=>assert.deepEqual(iniciosDisponibles([1410,1440],60),[1410]));
test('calcula el siguiente dia sin depender del huso del navegador',()=>assert.equal(siguienteDia('2026-12-31'),'2027-01-01'));
test('formato accesible de hora',()=>assert.equal(hora(630),'10:30'));
test('formato de madrugada conserva el dia operativo',()=>assert.equal(hora(1470),'00:30 (+1 día)'));
test('respeta la duracion y alineacion del horario global del negocio',()=>assert.deepEqual(
  iniciosDeTurno([420,450,480,510,540,570],60,420,60),
  [420,480,540],
));
test('el turno base de 90 minutos alinea los inicios desde la apertura',()=>assert.deepEqual(
  iniciosDeTurno([360,390,420,450,480,510,540,570,600,630,660,690,720,750,780],90,360,90),
  [360,450,540,630,720],
));
test('acepta un horario global valido',()=>assert.deepEqual(
  leerHorario({aperturaMinuto:480,cierreMinuto:1320,duracionTurnoMinutos:90}),
  {aperturaMinuto:480,cierreMinuto:1320,duracionTurnoMinutos:90},
));
test('acepta el horario nocturno que cruza medianoche',()=>assert.deepEqual(
  leerHorario({aperturaMinuto:1320,cierreMinuto:120,duracionTurnoMinutos:30}),
  {aperturaMinuto:1320,cierreMinuto:120,duracionTurnoMinutos:30},
));
test('rechaza un horario global ausente o invalido',()=>{
  assert.equal(leerHorario(null),null);
  assert.equal(leerHorario({}),null);
  assert.equal(leerHorario({aperturaMinuto:480,cierreMinuto:1320,duracionTurnoMinutos:45}),null);
  assert.equal(leerHorario({aperturaMinuto:480,cierreMinuto:480,duracionTurnoMinutos:60}),null);
  assert.equal(leerHorario({aperturaMinuto:490,cierreMinuto:1320,duracionTurnoMinutos:60}),null);
  assert.equal(leerHorario({aperturaMinuto:480,cierreMinuto:1470,duracionTurnoMinutos:60}),null);
  assert.equal(leerHorario({aperturaMinuto:480,cierreMinuto:1320,duracionTurnoMinutos:300}),null);
});

import {diaOperativoLima} from '../public/disponibilidad.js';
test('madrugada pertenece al dia operativo anterior',()=>assert.equal(diaOperativoLima(Date.parse('2026-09-30T00:30:00-05:00')),'2026-09-29'));

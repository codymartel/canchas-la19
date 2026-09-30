// Seleccion priorizada de mutaciones sobre las reglas que protegen horarios,
// solapamientos, ocupacion y permisos.
//
// No barre el archivo entero: cada entrada nombra una condicion concreta y el
// riesgo que abriria si nadie la cubre. Para cada una se copia el archivo a una
// ruta temporal, se cambia solo esa condicion, se corre la suite completa y
// despues se restaura la copia antes de la siguiente.
//
//   detectado  alguna prueba que antes pasaba ahora falla
//   sobrevive  ninguna prueba cambia de veredicto
//   rompe      las reglas ni siquiera cargan
//
//   firebase emulators:exec --project demo-grass-local --only firestore \
//     "node tools/firebase/test/mutar-prioritarias.mjs"
//
// Si sobrevive algo que de verdad abre una escritura indebida, la conclusion es
// un hueco de pruebas: la respuesta es escribir la prueba que lo reproduzca, no
// tocar las reglas activas.

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const SUITE = join(here, 'firestore.rules.test.mjs');
const RUTAS = join(here, '..', '..', '..', 'mobile', 'firestore.rules');
const ORIGINAL = readFileSync(RUTAS, 'utf8');
const COPIA = join(here, '.mutacion-prioritaria.rules');
const INFORME = process.env.MUTAR_INFORME || join(here, 'mutar-prioritarias.informe.json');

// buscar: texto exacto dentro de la linea. reemplazar: lo que queda.
const MUTACIONES = [
  // --- ocupacion y solapamiento: doble reserva, minutos extra, escritura falsa ---
  { f: 'agendaDiaValida', l: 487, buscar: '!antes.keys().hasAny(op.minutos)', reemplazar: 'antes.keys().hasAny(op.minutos)', riesgo: 'permite ocupar minutos que ya estaban ocupados: doble reserva en la misma franja' },
  { f: 'agendaDiaValida', l: 488, buscar: 'd.ocupados.keys().hasAll(op.minutos)', reemplazar: 'd.ocupados.keys().hasAny(op.minutos)', riesgo: 'permite declarar ocupados solo una parte de los minutos de la reserva' },
  { f: 'agendaDiaValida', l: 483, buscar: 'cambio.hasOnly(op.minutos)', reemplazar: 'cambio.hasAny(op.minutos)', riesgo: 'permite cambiar en la agenda minutos que no son los de la operacion' },
  { f: 'agendaDiaValida', l: 483, buscar: 'cambio.hasAll(op.minutos)', reemplazar: 'cambio.hasOnly(op.minutos)', riesgo: 'permite cambiar solo algunos minutos de la operacion' },
  { f: 'agendaDiaValida', l: 476, buscar: "d.ocupados.values().hasOnly([true])", reemplazar: 'd.ocupados.values().hasAny([true])', riesgo: 'permite escribir agenda con valores false: ocupacion falsa y espejo publico amoldado' },
  { f: 'agendaDiaValida', l: 475, buscar: 'd.ocupados.size() <= 36', reemplazar: 'd.ocupados.size() <= 100', riesgo: 'permite un mapa de ocupados mayor que el dia operativo' },
  { f: 'agendaDiaValida', l: 482, buscar: 'r.canchaId == cancha', reemplazar: 'r.canchaId != cancha', riesgo: 'permite validar la agenda contra la reserva de otra cancha' },
  { f: 'agendaDiaValida', l: 482, buscar: 'r.dia == dia', reemplazar: 'r.dia != dia', riesgo: 'permite validar la agenda contra la reserva de otro dia' },
  { f: 'agendaDiaValida', l: 485, buscar: "op.tipo == 'ocupar'", reemplazar: "op.tipo != 'liberar'", riesgo: 'invierte que rama exige la reserva y el estado que la respalda' },
  { f: 'agendaDiaValida', l: 497, buscar: "r.estado == 'cancelada'", reemplazar: "r.estado != 'confirmada'", riesgo: 'permite liberar agenda de una reserva que no esta cancelada' },
  { f: 'agendaDiaValida', l: 499, buscar: "get(ruta).data.estado == 'confirmada'", reemplazar: "get(ruta).data.estado != 'pendiente'", riesgo: 'permite liberar la agenda de una reserva que no llego a confirmarse' },
  { f: 'agendaDiaValida', l: 501, buscar: 'antes.keys().hasAll(op.minutos)', reemplazar: 'antes.keys().hasAny(op.minutos)', riesgo: 'permite liberar solo parte de los minutos ocupados' },

  // --- aprobacion: otro empleado, otra version, ocupacion sin pasar por el alta ---
  { f: 'agendaDiaValida', l: 493, buscar: 'get(ruta).data.version + 1 == r.version', reemplazar: 'get(ruta).data.version + 2 == r.version', riesgo: 'permite aprobar una reserva cuya version no es la siguiente a la pendiente' },
  { f: 'agendaDiaValida', l: 494, buscar: 'r.duracion > 180', reemplazar: 'r.duracion > 0', riesgo: 'una reserva corta pendiente ocupa agenda sin venir del alta normal' },
  { f: 'agendaDiaValida', l: 490, buscar: 'r.duracion <= 180', reemplazar: 'r.duracion <= 600', riesgo: 'una reserva larga nueva aparece como confirmada y salta la comprobacion de version' },
  { f: 'agendaDiaValida', l: 495, buscar: 'puedeResolverCancha(n, cancha)', reemplazar: 'puedeResolverCancha(n, n)', riesgo: 'resuelve la cancha contra el id de negocio, que no existe: deja de exigir permiso por cancha' },
  { f: 'transicionValida', l: 403, buscar: 'ahora.atendidoPor == request.auth.uid', reemplazar: 'ahora.atendidoPor != request.auth.uid', riesgo: 'un empleado puede aprobar en nombre de otro' },
  { f: 'transicionValida', l: 399, buscar: 'ahora.version == antes.version + 1', reemplazar: 'ahora.version == antes.version + 2', riesgo: 'permite saltar versiones al transicionar' },
  { f: 'transicionValida', l: 397, buscar: "antes.estado in ['pendiente', 'confirmada']", reemplazar: "antes.estado in ['pendiente']", riesgo: 'estrecha el origen valido: solo pendiente' },
  { f: 'transicionValida', l: 404, buscar: 'antes.duracion > 180', reemplazar: 'antes.duracion > 0', riesgo: 'permite aprobar como larga una reserva corta, saltandose la regla de las cortas' },
  { f: 'transicionValida', l: 406, buscar: 'cambioOcupaAgenda(n, id, coleccion, ahora)', reemplazar: 'cambioOcupaAgenda(n, id, coleccion, antes)', riesgo: 'valida la ocupacion contra los minutos antiguos en vez de los nuevos' },
  { f: 'cambioOcupaAgenda', l: 333, buscar: 'despues.ultimaOperacion.minutos == r.minutos', reemplazar: 'despues.ultimaOperacion.minutos != r.minutos', riesgo: 'la agenda puede ocupar minutos distintos de los de la reserva' },
  { f: 'cambioOcupaAgenda', l: 332, buscar: "despues.ultimaOperacion.tipo == 'ocupar'", reemplazar: "despues.ultimaOperacion.tipo != 'liberar'", riesgo: 'acepta la marca de liberar donde se exige ocupar' },
  { f: 'cambioOcupaAgenda', l: 330, buscar: 'despues.ultimaOperacion.reservaId == id', reemplazar: 'despues.ultimaOperacion.reservaId != id', riesgo: 'la ocupacion se puede atribuir a otra reserva' },

  // --- horarios ---
  { f: 'minutosOperacionValidos', l: 432, buscar: 'int(minutos[0]) >= 420', reemplazar: 'int(minutos[0]) > 420', riesgo: 'excluye el minuto exacto de apertura, comprueba que nadie abre antes' },
  { f: 'minutosOperacionValidos', l: 432, buscar: 'int(minutos[0]) >= 420', reemplazar: 'int(minutos[0]) >= 0', riesgo: 'permite minutos de la agenda antes de la apertura' },
  { f: 'minutosOperacionValidos', l: 453, buscar: 'int(minutos[cantidad - 1]) < 1500', reemplazar: 'int(minutos[cantidad - 1]) <= 1500', riesgo: 'permite el ultimo minuto en el limite exacto' },
  { f: 'minutosOperacionValidos', l: 429, buscar: 'cantidad <= 20', reemplazar: 'cantidad <= 21', riesgo: 'permite 21 medias horas, mas que la duracion maxima de 600' },
  { f: 'minutosOperacionValidos', l: 429, buscar: 'cantidad >= 1', reemplazar: 'cantidad >= 0', riesgo: 'permite una operacion sin minutos' },
  { f: 'minutosOperacionValidos', l: 434, buscar: 'cantidad < 2 || int(minutos[1]) == int(minutos[0]) + 30', reemplazar: 'cantidad < 2 || int(minutos[1]) == int(minutos[0])', riesgo: 'los minutos dejan de exigir el paso de 30 y se rompen en la suite' },
  { f: 'cabe', l: 210, buscar: 'r.minuto + r.duracion <= h.cierreMinuto', reemplazar: 'r.minuto + r.duracion < h.cierreMinuto', riesgo: 'estrecha el cierre: ninguna reserva puede acabar exactamente al cierre' },
  { f: 'cabe', l: 209, buscar: 'r.minuto >= h.aperturaMinuto', reemplazar: 'r.minuto > h.aperturaMinuto', riesgo: 'estrecha la apertura: no se puede empezar exactamente al abrir' },
  { f: 'cabe', l: 213, buscar: 'r.minuto + r.duracion <= h.cierreMinuto + 1440', reemplazar: 'r.minuto + r.duracion <= h.cierreMinuto + 1500', riesgo: 'una reserva que cruza medianoche puede rebasar el cierre en 60' },
  { f: 'dentroHorario', l: 223, buscar: 'cabe(h, r)', reemplazar: 'true', riesgo: 'elimina por completo la comprobacion de que la reserva cabe en el horario' },
  { f: 'dentroHorario', l: 221, buscar: 'r.duracion % h.duracionTurnoMinutos == 0', reemplazar: 'r.duracion % h.duracionTurnoMinutos >= 0', riesgo: 'deja de exigir duracion multiple del turno' },
  { f: 'dentroHorario', l: 222, buscar: '(r.minuto - h.aperturaMinuto + 1440) % h.duracionTurnoMinutos == 0', reemplazar: '(r.minuto - h.aperturaMinuto + 1440) % h.duracionTurnoMinutos >= 0', riesgo: 'deja de exigir que el inicio caiga en una franja del turno' },

  // --- permisos ---
  { f: 'puedeResolverCancha', l: 103, buscar: 'cancha in get(ruta).data.sedes', reemplazar: "cancha in ['la-19', 'la-23', 'la-24']", riesgo: 'cualquier empleado activo opera en cualquier cancha, sin mirar sus sedes' },
  { f: 'puedeResolverCancha', l: 98, buscar: 'get(ruta).data.activo == true', reemplazar: 'true', riesgo: 'un empleado desactivado vuelve a tener permisos' },
  { f: 'puedeResolverCancha', l: 99, buscar: "get(ruta).data.rol == 'empleado_control'", reemplazar: 'true', riesgo: 'cualquier rol de empleado obtiene permisos de control' },
  { f: 'puedeResolverCancha', l: 101, buscar: 'get(ruta).data.permisos.reservas == true', reemplazar: 'true', riesgo: 'un empleado sin permiso de reservas opera igual' },
  { f: 'puedeResolverCancha', l: 93, buscar: 'autenticado() && exists(config)', reemplazar: 'true', riesgo: 'deja de exigir sesion iniciada y configuracion existente' },

  // --- reclamo de configuracion ---
  { f: 'reclamoValido', l: 50, buscar: '!exists(rutaConfiguracion())', reemplazar: 'true', riesgo: 'permite reclamar la configuracion de un sistema ya configurado y suplantar al administrador' },
  { f: 'reclamoValido', l: 52, buscar: 'getAfter(rutaConfiguracion()).data.administradorUid == request.auth.uid', reemplazar: 'getAfter(rutaConfiguracion()).data.administradorUid != request.auth.uid', riesgo: 'cualquiera puede escribir el administradorUid del sistema' },
  { f: 'reclamoValido', l: 49, buscar: 'verificado()', reemplazar: 'true', riesgo: 'permite reclamar la configuracion con el email sin verificar' },
  { f: 'reclamoValido', l: 55, buscar: 'getAfter(rutaConfiguracion()).data.negocioId.size() <= 64', reemplazar: 'getAfter(rutaConfiguracion()).data.negocioId.size() <= 200', riesgo: 'amplia el tope del id de negocio: comprobacion de longitud, sin efecto directo' },
];

function primeraLinea(s) {
  return (s.split('\n').map((x) => x.trim())
    .find((x) => x && !x.startsWith('#') && !x.startsWith('>')) || 'sin detalle').slice(0, 200);
}

function correrSuite() {
  const r = spawnSync(process.execPath, [SUITE], {
    encoding: 'utf8',
    env: { ...process.env, RULES_PATH: COPIA },
    maxBuffer: 64 * 1024 * 1024,
  });
  const salida = `${r.stdout || ''}${r.stderr || ''}`;
  const ok = (salida.match(/^\s+ok\s/gm) || []).length;
  // El runner reporta las pruebas que no pasan como "FALLA", no como "not ok".
  const fallos = salida.split('\n').filter((x) => /^\s*FALLA\s/.test(x))
    .map((x) => x.replace(/^\s*FALLA\s*/, '').trim());
  if (/error parsing rules|error while parsing|syntax error/i.test(salida)) {
    return { estado: 'rompe', ok: 0, fallos, detalle: primeraLinea(salida) };
  }
  // El resumen sale como "... OK." si todo pasa y como "N prueba(s) fallaron
  // de M." si hay fallos: cualquiera de los dos confirma que la suite corrio.
  if (!/pruebas de reglas schemaVersion|prueba\(s\) fallaron/.test(salida)) {
    return { estado: 'rompe', ok, fallos, detalle: primeraLinea(salida) };
  }
  return { estado: fallos.length ? 'detectado' : 'sobrevive', ok, fallos };
}

const desde = Number(process.env.MUTAR_ENTRE_A || 0);
const hasta = Number(process.env.MUTAR_ENTRE_B || MUTACIONES.length);
const lote = MUTACIONES.slice(desde, hasta);

const resultados = [];
for (const [i, m] of lote.entries()) {
  const lineas = ORIGINAL.split('\n');
  const linea = lineas[m.l - 1];
  if (linea === undefined || linea.indexOf(m.buscar) === -1) {
    resultados.push({ ...m, estado: 'no-encontrado' });
    process.stderr.write(`[${desde + i + 1}] ${m.f} L${m.l}: no encontre "${m.buscar}"\n`);
    continue;
  }
  lineas[m.l - 1] = linea.replace(m.buscar, m.reemplazar);
  writeFileSync(COPIA, lineas.join('\n'));
  const r = correrSuite();
  // Restaura la copia antes de la siguiente mutacion.
  writeFileSync(COPIA, ORIGINAL);
  resultados.push({ ...m, estado: r.estado, ok: r.ok, fallos: r.fallos, detalle: r.detalle });
  process.stderr.write(`[${desde + i + 1}/${MUTACIONES.length}] ${r.estado.toUpperCase().padEnd(12)} `
    + `${m.f} L${m.l}  ${m.buscar}  ->  ${m.reemplazar}\n`);
  if (r.estado === 'detectado') {
    for (const f of r.fallos.slice(0, 4)) process.stderr.write(`        detectada por: ${f}\n`);
    if (r.fallos.length > 4) process.stderr.write(`        y ${r.fallos.length - 4} mas\n`);
  }
}

rmSync(COPIA, { force: true });
writeFileSync(INFORME, JSON.stringify({ total: MUTACIONES.length, desde, hasta, resultados }, null, 2));
const cuenta = (e) => resultados.filter((x) => x.estado === e).length;
process.stderr.write(`LOTE ${desde + 1}-${hasta}: detectados=${cuenta('detectado')} `
  + `sobreviven=${cuenta('sobrevive')} rotos=${cuenta('rompe')}\n`);

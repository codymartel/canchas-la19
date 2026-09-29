// Prueba de la web publica en un Chrome real, hablando WebDriver con el
// chromedriver local. No instala dependencias: usa la API de WebDriver por HTTP.
//
//   node web/scripts/probar-navegador.mjs [url] [carpetaCapturas]
//
// Imprime PASS/FAIL por cada paso y devuelve codigo de salida 1 si algo falla.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const WEBDRIVER = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:4444';
const URL_BASE = process.argv[2] ?? 'http://127.0.0.1:5000/?reservas=1';
const CARPETA = process.argv[3] ?? 'C:/Users/User/AppData/Local/Temp/opencode/capturas-web';

let sesion = null;
let numero = 0;
const fallos = [];

function ok(paso, detalle = '') {
  console.log(`PASS  ${paso}${detalle ? ` :: ${detalle}` : ''}`);
}
function fail(paso, detalle) {
  console.log(`FAIL  ${paso} :: ${detalle}`);
  fallos.push(`${paso} :: ${detalle}`);
}
function check(paso, condicion, detalle) {
  if (condicion) ok(paso, detalle);
  else fail(paso, detalle);
  return Boolean(condicion);
}

async function webdriver(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${WEBDRIVER}${ruta}`, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error(`WebDriver ${metodo} ${ruta}: ${texto.slice(0, 300)}`);
  }
  const valor = json.value ?? json;
  if (valor && valor.error) {
    throw new Error(`WebDriver ${metodo} ${ruta}: ${valor.error} ${valor.message ?? ''}`);
  }
  return valor;
}

/** Ejecuta JS en la pagina y devuelve su valor (WebDriver serializa JSON). */
async function enPagina(script, args = []) {
  // `esperar` queda disponible en todos los pasos: las lectures de Firebase
  // son asincronas y un solo frame no basta.
  return webdriver('POST', `/session/${sesion}/execute/sync`, {
    script: `${ESPERAR}\n${script}`,
    args,
  });
}

async function capturar(nombre) {
  numero += 1;
  const base64 = await webdriver('GET', `/session/${sesion}/screenshot`);
  const archivo = join(CARPETA, `${String(numero).padStart(2, '0')}-${nombre}.png`);
  await writeFile(archivo, Buffer.from(base64, 'base64'));
  console.log(`      captura: ${archivo}`);
  return archivo;
}

// Espera activa dentro de la pagina: sondea hasta que la condicion sea cierta.
const ESPERAR = `
const esperar = async (prueba, ms = 30000) => {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    let valor;
    try { valor = prueba(); } catch { valor = false; }
    if (valor) return valor;
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
};
`;

// -----------------------------------------------------------------------------

async function main() {
  await mkdir(CARPETA, { recursive: true });
  console.log(`\n=== Web publica sobre ${URL_BASE} ===\n`);

  console.log('--- Paso 0: abrir la pagina en Chrome ---');
  const capacidades = {
    capabilities: {
      alwaysMatch: {
        browserName: 'chrome',
        'goog:chromeOptions': {
          args: ['--headless=new', '--window-size=1280,1500', '--no-sandbox', '--disable-gpu'],
        },
      },
    },
  };
  const creada = await webdriver('POST', '/session', capacidades);
  sesion = creada.sessionId;
  check('sesion de Chrome creada', Boolean(sesion), `id ${sesion}`);
  await webdriver('POST', `/session/${sesion}/url`, { url: URL_BASE });
  await webdriver('POST', `/session/${sesion}/window/rect`, { width: 1280, height: 1500 });
  // El flujo de reserva escribe en Firestore: 30s de script se quedan cortos.
  await webdriver('POST', `/session/${sesion}/timeouts`, { script: 90000 });

  const cargo = await enPagina(`
    return esperar(() => {
      const e = document.getElementById('estado');
      return e && e.textContent.trim() && e.textContent.trim() !== 'Conectando…'
        ? e.textContent.trim() : false;
    });`);
  check('la pagina cargo y|reporto su estado', Boolean(cargo), cargo);
  await capturar('carga-inicial');

  // --- Paso 1: las tres canchas se ven --------------------------------------
  console.log('\n--- Paso 1: La 19, La 23 y La 24 visibles ---');
  const sedes = await enPagina(`
    return [...document.querySelectorAll('#sedes article')].map(a => ({
      titulo: a.querySelector('h3')?.textContent?.trim() ?? '',
      detalle: a.querySelector('p')?.textContent?.trim() ?? '',
    }));`);
  const titulos = sedes.map(s => s.titulo);
  check('se listan las tres sedes', ['La 19', 'La 23', 'La 24'].every(t => titulos.includes(t)), titulos.join(' | '));
  check(
    'cada cancha trae nombre, tarifa y direccion',
    sedes.every(s => s.detalle.includes('S/') && s.detalle.includes('Av.')),
    sedes.map(s => s.detalle.split('\n')[0]).join(' | '),
  );

  const opciones = await enPagina(`
    return [...document.getElementById('cancha').options].map(o => o.textContent.trim());`);
  check('el selector de cancha ofrece tres canchas habilitadas', opciones.length === 4, opciones.join(' | '));

  // --- Paso 2: disponibilidad real, no inventada ----------------------------
  console.log('\n--- Paso 2: la disponibilidad coincide con el servidor ---');
  // Hoy se filtra por la hora actual, asi que solo se comprueba que lo ya
  // reservado no se ofrezca. La reserva de prueba va para manana, donde si
  // hay horario amplio para comprobar que la disponibilidad se mueve.
  const hoy = await enPagina(`
    const $ = id => document.getElementById(id);
    $('cancha').value = 'la-23';
    $('cancha').dispatchEvent(new Event('change', {bubbles:true}));
    await esperar(() => [...$('minuto').options].map(o => o.value).filter(Boolean).length ? true : false);
    return { hoy: $('dia').value, minutos: [...$('minuto').options].map(o => o.value).filter(Boolean) };`);
  const minutosHoy = (hoy?.minutos ?? []).map(Number);
  const ocupadasServidor = [1020, 1050, 1080, 1110];
  check(
    'hoy: las franjas ya reservadas en el servidor NO se ofrecen',
    ocupadasServidor.every(o => !minutosHoy.includes(o)),
    `fecha ${hoy?.hoy} · ocupadas en servidor: ${ocupadasServidor.join(', ')} · ofrecidas: ${minutosHoy.join(', ') || 'ninguna (fin de jornada)'}`,
  );

  const manana = await enPagina(`
    const $ = id => document.getElementById(id);
    const dia = $('dia');
    dia.value = String(new Date(new Date(dia.value).getTime() + 86400000).toISOString().slice(0,10));
    dia.dispatchEvent(new Event('change', {bubbles:true}));
    await esperar(() => $('estado').textContent.includes('Confirmada') || $('estado').textContent.includes('confirma') ? true : false);
    $('cancha').value = 'la-23';
    $('cancha').dispatchEvent(new Event('change', {bubbles:true}));
    return esperar(() => {
      const vals = [...$('minuto').options].map(o => o.value).filter(Boolean);
      return vals.length ? vals : false;
    });`);
  const libres = (manana ?? []).map(Number);
  check('manana: La 23 ofrece horas libres', libres.length > 3, `${libres.length} horas: ${libres.slice(0, 8).join(', ')}`);
  await capturar('disponibilidad');

  // --- Paso 3: la reserva de prueba se guarda -------------------------------
  console.log('\n--- Paso 3: solicitar una reserva de prueba (corta, se confirma) ---');
  // Se elige una franja media: la primera suele estar muy cerca de la hora actual.
  const elegido = libres[Math.floor(libres.length / 2)];
  const envio = await enPagina(`
    const $ = id => document.getElementById(id);
    $('minuto').value = String(${elegido});
    $('minuto').dispatchEvent(new Event('change', {bubbles:true}));
    $('nombre').value = 'Visitante De Prueba';
    $('telefono').value = '+51 900 000 001';
    $('campos').querySelector('input[type=checkbox]').checked = true;
    $('reserva').requestSubmit();
    const fin = esperar(() => {
      const t = $('estado').textContent;
      return t.includes('Reserva') || t.includes('Solicitud') || t.includes('Reintentar') || t.includes('ocupado') || t.includes('permitidas')
        ? { estado: t.trim(), tipo: $('estado').dataset.tipo ?? '' }
        : false;
    }, 60000);
    return {
      estado: fin ? fin.estado : ($('estado').textContent.trim() + ' [sin resolver]'),
      tipo: fin ? fin.tipo : ($('estado').dataset.tipo ?? ''),
      habilitado: !$('enviar').disabled,
      minutoElegido: String(${elegido}),
    };`);
  const estadoEnvio = envio?.estado ?? '(sin respuesta)';
  // Hasta 180 minutos la reserva se confirma sola y ocupa el horario.
  check('la reserva corta se confirmo y ocupa el horario', estadoEnvio.startsWith('Reserva'), estadoEnvio);
  const idReserva = estadoEnvio.match(/(?:Reserva|Solicitud)\s+(\S+?):/)?.[1] ?? null;
  if (idReserva) ok('la reserva quedo registrada con identificador', idReserva);
  else fail('la reserva quedo registrada con identificador', `estado=${estadoEnvio} tipo=${envio?.tipo}`);
  await capturar('reserva-enviada');

  // --- Paso 3b: una reserva larga queda pendiente y NO ocupa ---------------
  console.log('\n--- Paso 3b: una reserva de 6 turnos queda pendiente sin ocupar ---');
  const largo = await enPagina(`
    const $ = id => document.getElementById(id);
    $('nueva').click();
    await esperar(() => $('estado').textContent.includes('confirma') ? true : false);
    $('cancha').value = 'la-23';
    $('cancha').dispatchEvent(new Event('change', {bubbles:true}));
    const turno = Number(document.querySelector('#duracion option')?.value) || 60;
    $('duracion').value = String(turno * 6);
    $('duracion').dispatchEvent(new Event('change', {bubbles:true}));
    const vals = await esperar(() => {
      const v = [...$('minuto').options].map(o => Number(o.value)).filter(n => n);
      return v.length ? v : false;
    });
    const duracion = Number($('duracion').value);
    const minuto = vals[Math.floor(vals.length / 2)];
    $('minuto').value = String(minuto);
    $('minuto').dispatchEvent(new Event('change', {bubbles:true}));
    $('nombre').value = 'Visitante De Prueba';
    $('telefono').value = '+51 900 000 002';
    $('campos').querySelector('input[type=checkbox]').checked = true;
    $('reserva').requestSubmit();
    const fin = esperar(() => {
      const t = $('estado').textContent;
      return t.includes('Solicitud') || t.includes('Reserva') || t.includes('Reintentar') || t.includes('ocupado') || t.includes('permitidas')
        ? t.trim() : false;
    }, 60000);
    return { estado: fin, minuto, duracion };`);
  check('la reserva larga quedo pendiente de aprobacion',
    (largo?.estado ?? '').startsWith('Solicitud'), largo?.estado ?? '(sin respuesta)');
  await capturar('reserva-larga-pendiente');

  // --- Paso 4: la disponibilidad cambia en vivo -----------------------------
  console.log('\n--- Paso 4: solo lo confirmado ocupa; lo pendiente no bloquea ---');
  const despues = await enPagina(`
    const $ = id => document.getElementById(id);
    const leer = () => [...$('minuto').options].map(o => o.value).filter(Boolean);
    $('nueva').click();
    const estado = await esperar(() => $('estado').textContent.includes('confirma') ? $('estado').textContent.trim() : false);
    const c = $('cancha');
    c.value = 'la-23';
    c.dispatchEvent(new Event('change', {bubbles:true}));
    const turno = Number(document.querySelector('#duracion option')?.value) || 60;
    $('duracion').value = String(turno);
    $('duracion').dispatchEvent(new Event('change', {bubbles:true}));
    const cortos = await esperar(() => leer().length ? leer() : false);
    $('duracion').value = String(turno * 6);
    $('duracion').dispatchEvent(new Event('change', {bubbles:true}));
    const largos = await esperar(() => leer().length ? leer() : false);
    return { estado, cortos, largos };`);
  const cortos = (despues?.cortos ?? []).map(Number);
  const largos = (despues?.largos ?? []).map(Number);
  // La corta quedo confirmada: su inicio desaparecio de la disponibilidad.
  check('la franja confirmada ya no se ofrece', !cortos.includes(Number(elegido)),
    `reservado ${elegido} · sigue ofrecida: ${cortos.includes(Number(elegido))}`);
  // La larga quedo pendiente: su inicio sigue disponible para el publico.
  check('la franja pendiente sigue libre (no ocupa hasta aprobacion)',
    largos.includes(Number(largo?.minuto)),
    `pendiente en ${largo?.minuto} · ${largo?.duracion} min · sigue offered: ${largos.includes(Number(largo?.minuto))} · ${largos.length} inicios de 6 turnos libres`);
  check('el resto de la disponibilidad sigue en pie', cortos.length > 0, `${cortos.length} inicios de 1 turno libres ahora`);
  await capturar('disponibilidad-actualizada');

  // --- Paso 5: no se expone informacion privada -----------------------------
  console.log('\n--- Paso 5: no se muestran datos privados ---');
  const privado = await enPagina(`
    const texto = document.body.innerText;
    const prohibidos = [
      'Cliente demo uno','Cliente demo dos','Cliente demo tres',
      'Reserva web pendiente','Segunda solicitud web',
      '51999888777','51999888766','51999888755','51999888744','51999888733',
      'Ana Ruiz','Administrador','gerente@e2e.local','empleado@local.test',
      'andymartel222',
    ];
    const hallados = prohibidos.filter(t => texto.includes(t));
    const rutas = performance.getEntriesByType('resource')
      .map(r => r.name)
      .filter(n => n.includes('/documents/'));
    const permitidas = ['negocios_publicos','canchas_publicas','promociones_publicas','agenda_publica'];
    const ajenas = rutas.filter(n => !permitidas.some(p => n.includes(p)));
    return { hallados, rutas, ajenas, textoLongitud: texto.length };`);
  check('ningun dato personal o de cliente en la pagina', (privado?.hallados ?? []).length === 0,
    privado?.hallados?.length ? `filtrado: ${privado.hallados.join(', ')}` : 'sin filtraciones');
  check('la web solo lee colecciones publicas', (privado?.ajenas ?? []).length === 0,
    privado?.ajenas?.length ? `rutas no publicas: ${privado.ajenas.join(', ')}` : `${privado?.rutas?.length ?? 0} lecturas, todas publicas`);

  const guion = await enPagina(`return document.body.innerText.toLowerCase();`);
  check('la web no se anuncia con clave ni con comprobante', !/contrase|password|api[_-]?key|token/i.test(guion));

  await capturar('final');

  console.log(`\n=== Resultado: ${fallos.length === 0 ? 'TODO OK' : `${fallos.length} FALLO(S)`} ===`);
  for (const f of fallos) console.log(`  - ${f}`);
  return fallos.length === 0;
}

try {
  const bien = await main();
  if (sesion) await webdriver('DELETE', `/session/${sesion.sessionId}`).catch(() => {});
  process.exit(bien ? 0 : 1);
} catch (error) {
  console.error(`\nERROR  ${error.message}`);
  if (sesion) await webdriver('DELETE', `/session/${sesion.sessionId}`).catch(() => {});
  process.exit(1);
}

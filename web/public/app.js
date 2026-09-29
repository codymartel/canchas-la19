import {hora,soles,hoyLima,iniciosDeTurno,siguienteDia,leerHorario} from './disponibilidad.js';
import {solicitarReserva} from './reserva.js';

const $ = id => document.getElementById(id);
const NEGOCIO = 'grass-sintetico';
const RESERVAS = window.GRASS_RESERVAS_HABILITADAS === true;
const nombres = {'la-19':'La 19','la-23':'La 23','la-24':'La 24'};

firebase.initializeApp(window.GRASS_FIREBASE_CONFIG);
const auth = firebase.auth();
const db = firebase.firestore();
if (['localhost','127.0.0.1'].includes(location.hostname)) {
  auth.useEmulator('http://127.0.0.1:9099');
  db.useEmulator('127.0.0.1',8081);
}

let canchas = [], promociones = [], ocupacion = new Map(), horario = null;
let enviando = false, solicitud = null, cargando = false, revision = 0, completada = false;

// Mientras las reservas esten deshabilitadas el formulario no se ofrece: se
// oculta y todos sus controles quedan inutilizables, aunque se publiquen canchas.
function aplicarEstadoReservas(){
  if(RESERVAS)return;
  $('reserva').hidden=true;
  $('campos').disabled=true;
  for(const control of $('campos').querySelectorAll('input,select'))control.disabled=true;
  for(const boton of [$('enviar'),$('nueva')]){boton.disabled=true;boton.hidden=true;}
  $('aviso-reservas').hidden=false;
}

function mensaje(texto,tipo='info'){
  $('estado').textContent=texto;
  $('estado').dataset.tipo=tipo;
}
function errorMensaje(error){
  if(['unavailable','deadline-exceeded','aborted'].includes(error.code)) {
    return 'No se confirmó el resultado. Reintenta la misma solicitud; conservará su identificador.';
  }
  if(error.code==='permission-denied') return 'La solicitud no cumple las reglas o el horario cambió. Actualiza la disponibilidad.';
  if(error.code==='already-exists') return 'Ese horario acaba de ser ocupado. Actualiza y elige otro.';
  return error.message || 'No se pudo conectar. Intenta actualizar.';
}
function opcion(value,label){const o=document.createElement('option');o.value=value;o.textContent=label;return o;}
function telefonoNormalizado(valor){
  let numero=valor.replace(/[\s()+.\-]/g,'');
  if(/^9\d{8}$/.test(numero))numero=`51${numero}`;
  if(!/^\d{10,15}$/.test(numero))throw new Error('Incluye el código de país en el teléfono.');
  return `+${numero}`;
}
function rutaDia(cancha,dia){
  return db.collection('agenda_publica').doc(NEGOCIO).collection('canchas').doc(cancha)
    .collection('dias').doc(dia);
}
function libresCancha(canchaId,dia){
  const usados=ocupacion.get(canchaId)??new Set();
  const posibles=[];
  if(!horario)return posibles;
  const ahoraLima=new Date(Date.now()-5*3600000);
  const minimo=dia===hoyLima()?Math.ceil((ahoraLima.getUTCHours()*60+ahoraLima.getUTCMinutes())/30)*30:0;
  const apertura=horario.aperturaMinuto,cierre=horario.cierreMinuto;
  const limite=cierre>apertura?cierre:1440+cierre;
  for(let m=apertura;m<limite;m+=30)if(m>=minimo&&!usados.has(m))posibles.push(m);
  return posibles;
}
function tarjetasCanchas(){
  const contenedor=$('sedes');contenedor.replaceChildren();
  for(const id of Object.keys(nombres)){
    const cancha=canchas.find(c=>c.id===id),article=document.createElement('article');
    const h=document.createElement('h3');h.textContent=nombres[id];article.append(h);
    const p=document.createElement('p');
    if(!cancha){p.textContent='Información pendiente de habilitación por el personal.';article.className='inactiva';}
    else{
      const turno=horario?.duracionTurnoMinutos;
      const proximos=RESERVAS&&turno?iniciosDeTurno(libresCancha(cancha.id,$('dia').value),turno,horario.aperturaMinuto,turno).slice(0,4).map(hora).join(' · '):'';
      const lineas=[`${cancha.nombre} · ${cancha.direccion}`,`${soles(cancha.tarifaTurnoCentimos)}${turno?` por turno de ${turno} min`:''}`];
      if(RESERVAS)lineas.push(`Próximos inicios: ${proximos||'sin horarios libres'}`);
      p.textContent=lineas.join('\n');
    }
    article.append(p);contenedor.append(article);
  }
}
function tarjetasPromociones(){
  const contenedor=$('promociones');contenedor.replaceChildren();
  for(const promo of promociones){
    const a=document.createElement('article'),h=document.createElement('h3'),p=document.createElement('p');
    h.textContent=promo.titulo;p.textContent=`${promo.descripcion} · ${promo.sedes.map(s=>nombres[s]).join(', ')} · hasta ${promo.hasta}`;
    a.append(h,p);contenedor.append(a);
  }
  if(!promociones.length)contenedor.textContent='No hay promociones vigentes.';
}
function actualizarHoras(){
  const cancha=canchas.find(c=>c.id===$('cancha').value),anterior=$('minuto').value;
  const turno=horario?.duracionTurnoMinutos,duracionAnterior=Number($('duracion').value);
  const duraciones=cancha&&turno?Array.from({length:Math.floor(600/turno)},(_,i)=>(i+1)*turno):[];
  $('duracion').replaceChildren(...duraciones.map(valor=>opcion(valor,valor===turno?`${valor} minutos (1 turno)`:`${valor} minutos (${valor/turno} turnos)`)));
  if(duraciones.includes(duracionAnterior))$('duracion').value=String(duracionAnterior);
  const libres=cancha&&turno?iniciosDeTurno(libresCancha(cancha.id,$('dia').value),Number($('duracion').value),horario.aperturaMinuto,turno):[];
  $('minuto').replaceChildren(opcion('','Selecciona horario'),...libres.map(m=>opcion(m,hora(m))));
  if(libres.includes(Number(anterior))&&anterior!=='')$('minuto').value=anterior;
  actualizarPrecio();
}
function actualizarPrecio(){
  const c=canchas.find(c=>c.id===$('cancha').value);
  const turno=horario?.duracionTurnoMinutos,duracion=Number($('duracion').value);
  $('precio').textContent=c&&turno&&duracion
    ? `Referencial: ${soles(c.tarifaTurnoCentimos*duracion/turno)} por ${duracion} minutos. El personal confirma el precio total acordado.`
    :'Selecciona una cancha habilitada.';
}
async function cargarConfiguracion(){
  const snap=await db.collection('negocios_publicos').doc(NEGOCIO).get({source:'server'});
  if(!snap.exists)return;
  const datos=snap.data();
  horario=leerHorario(datos);
  $('marca').textContent=datos.nombre||'Grass Sintético';
  $('descripcion').textContent=datos.descripcion||'Tres canchas, una agenda compartida.';
  $('contacto').textContent=[datos.telefonoPublico,datos.whatsapp?`WhatsApp ${datos.whatsapp}`:''].filter(Boolean).join(' · ');
  const fotos=Array.isArray(datos.galeria)?[...datos.galeria].sort((a,b)=>(a.orden??0)-(b.orden??0)):[];
  if(fotos.length){
    const contenedor=$('galeria');contenedor.replaceChildren();
    for(const foto of fotos){
      // Se aceptan URLs HTTPS de Cloudinary y rutas locales del mismo sitio.
      if(typeof foto.url!=='string'||!(foto.url.startsWith('https://')||foto.url.startsWith('/')))continue;
      const figure=document.createElement('figure'),img=document.createElement('img'),pie=document.createElement('figcaption');
      img.src=foto.url;img.alt=foto.alt||'Cancha de Grass Sintético';img.loading='lazy';
      pie.textContent=foto.alt||'';figure.append(img,pie);contenedor.append(figure);
    }
    if(contenedor.children.length)$('seccion-galeria').hidden=false;
  }
}
async function cargar(){
  if(cargando||solicitud)return;
  cargando=true;const actual=++revision,dia=$('dia').value;$('recargar').disabled=true;
  mensaje('Consultando el servidor…');
  try{
    if(RESERVAS&&!auth.currentUser)await auth.signInAnonymously();
    const canchasSnap=await db.collection('canchas_publicas').where('activa','==',true).get({source:'server'});
    const promosSnap=await db.collection('promociones_publicas').where('activa','==',true).get({source:'server'});
    if(actual!==revision||dia!==$('dia').value)return;
    canchas=canchasSnap.docs.map(d=>({id:d.id,...d.data()}));
    promociones=promosSnap.docs.map(d=>({id:d.id,...d.data()}));
    const lecturas=[];
    for(const cancha of canchas){
      lecturas.push(rutaDia(cancha.id,dia).get({source:'server'}).then(snap=>{
        const usados=new Set(Object.keys(snap.data()?.ocupados??{}).map(Number));
        ocupacion.set(cancha.id,usados);
      }));
    }
    await Promise.all(lecturas);
    const anterior=$('cancha').value;
    $('cancha').replaceChildren(opcion('','Selecciona cancha'),...canchas.map(c=>opcion(c.id,`${nombres[c.sedeId]} / ${c.nombre}`)));
    if(canchas.some(c=>c.id===anterior))$('cancha').value=anterior;
    tarjetasCanchas();tarjetasPromociones();actualizarHoras();
    mensaje(!RESERVAS?'Reservas en línea aún no habilitadas. Estado pendiente.'
      :!horario?'El horario global aun no esta publicado. No se pueden solicitar reservas.'
      :canchas.length?'Disponibilidad confirmada por el servidor. El horario se asegura al enviar.':'No hay canchas habilitadas todavía.','ok');
  }catch(error){mensaje(errorMensaje(error),'error');}
  finally{cargando=false;$('recargar').disabled=false;}
}
$('dia').value=hoyLima();$('dia').min=hoyLima();$('dia').max=siguienteDia(hoyLima(),179);
$('dia').addEventListener('change',()=>{revision++;cargando=false;cargar();});
$('cancha').addEventListener('change',actualizarHoras);$('duracion').addEventListener('change',actualizarHoras);
$('recargar').addEventListener('click',cargar);
$('nueva').addEventListener('click',()=>{solicitud=null;completada=false;$('campos').disabled=false;$('enviar').disabled=false;$('enviar').textContent='Solicitar reserva';$('nueva').hidden=true;cargar();});
$('reserva').addEventListener('submit',async event=>{
  event.preventDefault();
  // Barrera explicita: aunque alguien dispare el formulario a mano, no se escribe.
  if(!RESERVAS){mensaje('Las reservas en línea aún no están habilitadas.','error');return;}
  if(enviando||completada)return;enviando=true;$('enviar').disabled=true;mensaje('Guardando y comprobando todas las franjas…');
  try{
    if(!auth.currentUser)await auth.signInAnonymously();
    if(!solicitud){
      const payload={dia:$('dia').value,canchaId:$('cancha').value,minuto:Number($('minuto').value),duracion:Number($('duracion').value),nombre:$('nombre').value,telefono:telefonoNormalizado($('telefono').value)};
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
      const clave='grass-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      const requestId=sessionStorage.getItem(clave)||crypto.randomUUID();sessionStorage.setItem(clave,requestId);
      solicitud={...payload,requestId};$('campos').disabled=true;
    }
    const resultado=await solicitarReserva({firebase,db,uid:auth.currentUser.uid,negocio:NEGOCIO,datos:solicitud});completada=true;
    mensaje(resultado.estado==='confirmada'
      ?`Reserva ${resultado.id}: confirmada y horario ocupado. Guarda este código.`
      :`Solicitud ${resultado.id}: pendiente. El horario no se ocupará hasta que el personal asignado la apruebe. Guarda este código.`,'ok');
    $('nueva').hidden=false;
  }catch(error){mensaje(errorMensaje(error),'error');$('enviar').textContent='Reintentar misma solicitud';$('nueva').hidden=false;}
  finally{enviando=false;$('enviar').disabled=completada;}
});

// La configuracion publica trae el horario global: se carga antes que las
// canchas para no pintar disponibilidad con un horario que aun no se conoce.
aplicarEstadoReservas();
await cargarConfiguracion();
await cargar();
setInterval(()=>{if(!document.hidden&&!enviando)cargar();},30000);

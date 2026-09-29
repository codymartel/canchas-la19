import {hora,soles,hoyLima,iniciosDeTurno,siguienteDia,leerHorario} from './disponibilidad.js';
import {solicitarReserva} from './reserva.js';

const $ = id => document.getElementById(id);
const NEGOCIO = 'grass-sintetico';
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
  const [year,month,day]=dia.split('-').map(Number);
  return db.collection('negocios').doc(NEGOCIO).collection('agenda').doc(cancha)
    .collection('anios').doc(String(year)).collection('meses').doc(String(month))
    .collection('dias').doc(String(day)).collection('franjas');
}
function libresCancha(canchaId,dia){
  const usados=ocupacion.get(canchaId)??new Set();
  const posibles=[];
  if(!horario)return posibles;
  const ahoraLima=new Date(Date.now()-5*3600000);
  const minimo=dia===hoyLima()?Math.ceil((ahoraLima.getUTCHours()*60+ahoraLima.getUTCMinutes())/30)*30:0;
  const apertura=horario.aperturaMinuto,cierre=horario.cierreMinuto;
  if(cierre>apertura){
    for(let m=apertura;m<cierre;m+=30)if(m>=minimo&&!usados.has(m))posibles.push(m);
  }else{
    for(let m=0;m<cierre;m+=30)if(m>=minimo&&!usados.has(m))posibles.push(m);
    for(let m=apertura;m<1440+cierre;m+=30)if(m>=minimo&&!usados.has(m))posibles.push(m);
  }
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
      const proximos=turno?iniciosDeTurno(libresCancha(cancha.id,$('dia').value),turno,horario.aperturaMinuto,turno).slice(0,4).map(hora).join(' · '):'';
      p.textContent=`${cancha.nombre} · ${cancha.direccion}\n${soles(cancha.tarifaTurnoCentimos)}${turno?` por turno de ${turno} min`:''}\nPróximos inicios: ${proximos||'sin horarios libres'}`;
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
  const duraciones=cancha&&turno?Array.from({length:Math.floor(240/turno)},(_,i)=>(i+1)*turno):[];
  $('duracion').replaceChildren(...duraciones.map(valor=>opcion(valor,valor===turno?`${valor} minutos (1 turno)`:`${valor} minutos (${valor/turno} turnos)`)));
  if(duraciones.includes(duracionAnterior))$('duracion').value=String(duracionAnterior);
  const libres=cancha&&turno?iniciosDeTurno(libresCancha(cancha.id,$('dia').value),Number($('duracion').value),horario.aperturaMinuto,turno):[];
  $('minuto').replaceChildren(opcion('','Selecciona horario'),...libres.map(m=>opcion(m,hora(m))));
  if(libres.includes(Number(anterior))&&anterior!=='')$('minuto').value=anterior;
  const seleccion=$('promocion').value;
  const aplicables=promociones.filter(p=>p.sedes.includes(cancha?.sedeId)&&p.desde<=$('dia').value&&p.hasta>=$('dia').value);
  $('promocion').replaceChildren(opcion('','Sin promoción'),...aplicables.map(p=>opcion(p.id,p.titulo)));
  if(aplicables.some(p=>p.id===seleccion))$('promocion').value=seleccion;
  actualizarPrecio();
}
function actualizarPrecio(){
  const c=canchas.find(c=>c.id===$('cancha').value),p=promociones.find(p=>p.id===$('promocion').value);
  const turno=horario?.duracionTurnoMinutos;
  $('precio').textContent=c&&turno
    ? `Estimado: ${soles(Math.max(0,c.tarifaTurnoCentimos*Number($('duracion').value)/turno-(p?.descuentoCentimos??0)))}. El personal confirma el precio total acordado.`
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
    if(!auth.currentUser)await auth.signInAnonymously();
    const canchasSnap=await db.collection('canchas_publicas').where('activa','==',true).get({source:'server'});
    const promosSnap=await db.collection('promociones_publicas').where('activa','==',true).get({source:'server'});
    if(actual!==revision||dia!==$('dia').value)return;
    canchas=canchasSnap.docs.map(d=>({id:d.id,...d.data()}));
    promociones=promosSnap.docs.map(d=>({id:d.id,...d.data()}));
    const manana=siguienteDia(dia),lecturas=[];
    for(const cancha of canchas){
      lecturas.push(Promise.all([rutaDia(cancha.id,dia).get({source:'server'}),rutaDia(cancha.id,manana).get({source:'server'})])
        .then(([hoy,prox])=>{
          const usados=new Set(hoy.docs.map(d=>Number(d.id)));
          for(const d of prox.docs)usados.add(1440+Number(d.id));
          ocupacion.set(cancha.id,usados);
        }));
    }
    await Promise.all(lecturas);
    const anterior=$('cancha').value;
    $('cancha').replaceChildren(opcion('','Selecciona cancha'),...canchas.map(c=>opcion(c.id,`${nombres[c.sedeId]} / ${c.nombre}`)));
    if(canchas.some(c=>c.id===anterior))$('cancha').value=anterior;
    tarjetasCanchas();tarjetasPromociones();actualizarHoras();
    mensaje(!horario?'El horario global aun no esta publicado. No se pueden solicitar reservas.'
      :canchas.length?'Disponibilidad confirmada por el servidor. El horario se asegura al enviar.':'No hay canchas habilitadas todavía.','ok');
  }catch(error){mensaje(errorMensaje(error),'error');}
  finally{cargando=false;$('recargar').disabled=false;}
}
$('dia').value=hoyLima();$('dia').min=hoyLima();$('dia').max=siguienteDia(hoyLima(),179);
$('dia').addEventListener('change',()=>{revision++;cargando=false;cargar();});
$('cancha').addEventListener('change',actualizarHoras);$('duracion').addEventListener('change',actualizarHoras);$('promocion').addEventListener('change',actualizarPrecio);
$('recargar').addEventListener('click',cargar);
$('nueva').addEventListener('click',()=>{solicitud=null;completada=false;$('campos').disabled=false;$('enviar').disabled=false;$('enviar').textContent='Solicitar reserva';$('nueva').hidden=true;cargar();});
$('reserva').addEventListener('submit',async event=>{
  event.preventDefault();if(enviando||completada)return;enviando=true;$('enviar').disabled=true;mensaje('Guardando y comprobando todas las franjas…');
  try{
    if(!auth.currentUser)await auth.signInAnonymously();
    if(!solicitud){
      const payload={dia:$('dia').value,canchaId:$('cancha').value,minuto:Number($('minuto').value),duracion:Number($('duracion').value),nombre:$('nombre').value,telefono:telefonoNormalizado($('telefono').value),metodoPago:$('metodo').value,promocionId:$('promocion').value||''};
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
      const clave='grass-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      const requestId=sessionStorage.getItem(clave)||crypto.randomUUID();sessionStorage.setItem(clave,requestId);
      solicitud={...payload,requestId};$('campos').disabled=true;
    }
    const resultado=await solicitarReserva({firebase,db,uid:auth.currentUser.uid,negocio:NEGOCIO,datos:solicitud});completada=true;
    mensaje(`Solicitud ${resultado.id}: pendiente. El horario quedó ocupado y el personal debe confirmar el precio y el adelanto manual. Guarda este código.`,'ok');
    $('nueva').hidden=false;
  }catch(error){mensaje(errorMensaje(error),'error');$('enviar').textContent='Reintentar misma solicitud';$('nueva').hidden=false;}
  finally{enviando=false;$('enviar').disabled=completada;}
});

// La configuracion publica trae el horario global: se carga antes que las
// canchas para no pintar disponibilidad con un horario que aun no se conoce.
await cargarConfiguracion();
await cargar();
setInterval(()=>{if(!document.hidden&&!enviando)cargar();},30000);

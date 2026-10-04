import {configurarAcceso} from './acceso.js';
import {reconstruirPrecios,calcularPrecio} from './precios.js';
import {conTiempoLimite} from './lectura.js';
import {hora,soles,hoyLima,diaOperativoLima,iniciosDeTurno,siguienteDia,leerHorario,intervaloSeleccionado} from './disponibilidad.js';
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
let suscripciones = [], suscripcionesPrecios = [];
let precios = new Map();
let horasSeleccionadas = new Set(), diaCargado = null;
let enviando = false, solicitud = null, cargando = false, revision = 0, completada = false;

// Mientras las reservas esten deshabilitadas el formulario no se ofrece: se
// oculta y todos sus controles quedan inutilizables, aunque se publiquen canchas.
function aplicarEstadoReservas(){
  if(RESERVAS){$('reserva').hidden=false;$('aviso-reservas').hidden=true;return;}
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
$('modalidad').addEventListener('change',actualizarPrecio);
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
  if(!horario||diaCargado!==dia)return posibles;
  const base=new Date(`${dia}T00:00:00-05:00`).getTime();
  const minimo=Math.max(0,Math.ceil((Date.now()-base)/1800000)*30);
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
      const lineas=[cancha.direccion||'Dirección pendiente','Precios según el horario elegido'];
      p.textContent=lineas.join('\n');
    }
    article.append(p);
    if(cancha&&horario){
      const table=document.createElement('table'),caption=document.createElement('caption');
      caption.textContent=`Día operativo ${$('dia').value} · 07:00 a 01:00 (+1 día) · America/Lima`;table.append(caption);
      const head=document.createElement('tr');for(const label of ['Hora','Estado','Precio']){const th=document.createElement('th');th.textContent=label;head.append(th);}table.append(head);
      const usados=ocupacion.get(id)??new Set();
      const disponibles=new Set(iniciosDeTurno(libresCancha(id,$('dia').value),60,horario.aperturaMinuto,60));
      for(let m=horario.aperturaMinuto;m<(horario.cierreMinuto>horario.aperturaMinuto?horario.cierreMinuto:1440+horario.cierreMinuto);m+=60){
        const row=document.createElement('tr'),tiempo=document.createElement('td'),estado=document.createElement('td');
        tiempo.textContent=hora(m)+' – '+hora(m+60);
        const ocupado=usados.has(m)||usados.has(m+30);
        if(diaCargado!==$('dia').value||(cargando&&!solicitud)){estado.textContent='Consultando…';}
        else if(ocupado){estado.textContent='✕ Ocupado';estado.className='hora-ocupada';}
        else if(RESERVAS&&disponibles.has(m)){
          const label=document.createElement('label'),check=document.createElement('input'),texto=document.createElement('span');
          label.className='hora-libre';check.type='checkbox';check.checked=$('cancha').value===id&&horasSeleccionadas.has(m);
          check.disabled=!!solicitud||enviando||cargando;
          check.setAttribute('aria-label',`Reservar ${nombres[id]} ${hora(m)} a ${hora(m+60)}`);
          check.addEventListener('change',()=>seleccionarHora(id,m,check.checked));texto.textContent='Libre';label.append(check,texto);estado.append(label);
          if(check.checked)row.className='hora-elegida';
        }else{estado.textContent=disponibles.has(m)?'✓ Libre':'✓ Libre · ya pasó';}
        const tarifa=document.createElement('td'),importe=precios.get(id)?.horas?.[m]?.precioCentimos;tarifa.textContent=Number.isInteger(importe)?soles(importe):'Pendiente';
        row.append(tiempo,estado,tarifa);table.append(row);
      }
      article.append(table);
    }
    contenedor.append(article);
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
function seleccionarHora(cancha,minuto,marcada){
  if(solicitud||enviando||cargando)return;
  const siguientes=$('cancha').value===cancha?new Set(horasSeleccionadas):new Set();
  if(marcada)siguientes.add(minuto);else siguientes.delete(minuto);
  try{
    intervaloSeleccionado(siguientes);
    $('cancha').value=cancha;horasSeleccionadas=siguientes;
    actualizarHoras();tarjetasCanchas();
    mensaje('Horario elegido. Completa tu nombre y teléfono para solicitarlo.');
  }catch(error){mensaje(error.message,'error');tarjetasCanchas();}
}
function actualizarHoras(){
  if(solicitud)return;
  const cancha=$('cancha').value;
  const libres=new Set(horario?iniciosDeTurno(libresCancha(cancha,$('dia').value),60,horario.aperturaMinuto,60):[]);
  if([...horasSeleccionadas].some(m=>!libres.has(m))){
    horasSeleccionadas.clear();mensaje('Una hora elegida ya no está disponible. Marca un nuevo horario.','error');
  }
  const intervalo=intervaloSeleccionado(horasSeleccionadas);
  $('minuto').value=intervalo?String(intervalo.minuto):'';
  $('duracion').value=intervalo?String(intervalo.duracion):'';
  $('seleccion').textContent=intervalo
    ?`${nombres[cancha]} · ${$('dia').value} · ${hora(intervalo.minuto)} a ${hora(intervalo.minuto+intervalo.duracion)} · ${intervalo.duracion/60} ${intervalo.duracion===60?'hora':'horas'}${intervalo.duracion>180?' · Solicitud pendiente de aprobación':''}`
    :'Marca una hora libre en las tablas.';
  actualizarPrecio();
}
function actualizarPrecio(){
  const parametros=precios.get($('cancha').value), calculo=calcularPrecio(parametros,horasSeleccionadas);
  $('modalidad').disabled=!calculo || !!solicitud;
  $('precio').textContent=!horasSeleccionadas.size ? 'Marca una hora libre en las tablas.' : !calculo
    ? 'Precio pendiente de configurar para este horario. No se puede calcular el importe todavía.'
    : 'Total: '+soles(calculo.total)+' · Adelanto mínimo: '+soles(calculo.adelanto)+' · Saldo con adelanto: '+soles(calculo.saldo);
  $('importe-elegido').textContent=calculo ? ($('modalidad').value==='adelanto' ? 'Adelanto elegido: '+soles(calculo.adelanto) : 'Importe completo elegido: '+soles(calculo.total))+'. No se ha cobrado ni verificado ningún pago.' : '';
}
function observarPrecios(dia,actual){
  for(const cancelar of suscripcionesPrecios)cancelar();suscripcionesPrecios=[];precios.clear();actualizarPrecio();
  for(const id of Object.keys(nombres)){
    const ref=db.collection('precios_publicos').doc(NEGOCIO).collection('canchas').doc(id).collection('dias').doc(dia).collection('bloques').orderBy('version');
    suscripcionesPrecios.push(ref.onSnapshot(snap=>{
      if(actual!==revision || dia!==$('dia').value)return;
      try {precios.set(id,reconstruirPrecios(snap.docs.map(d=>d.data())));actualizarPrecio();tarjetasCanchas();}
      catch(error){precios.delete(id);actualizarPrecio();tarjetasCanchas();mensaje(error.message,'error');}
    },()=>{if(actual===revision){precios.delete(id);actualizarPrecio();mensaje('No se pudieron consultar los precios. Actualiza antes de continuar.','error');}}));
  }
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
  if(cargando)return;
  cargando=true;
  const actual=++revision,dia=$('dia').value;
  $('recargar').disabled=true;tarjetasCanchas();
  if(!solicitud)mensaje('Consultando el servidor…');
  try{

    if(!horario)await conTiempoLimite(cargarConfiguracion());
    const [canchasSnap,promosSnap]=await conTiempoLimite(Promise.all([
      db.collection('canchas_publicas').where('activa','==',true).get({source:'server'}),
      db.collection('promociones_publicas').where('activa','==',true).get({source:'server'})
    ]));
    const nuevas=canchasSnap.docs.map(d=>({id:d.id,...d.data()}));
    const dias=await conTiempoLimite(Promise.all(nuevas.map(c=>rutaDia(c.id,dia).get({source:'server'}))));
    if(actual!==revision||dia!==$('dia').value)return;
    for(const cancelar of suscripciones)cancelar();suscripciones=[];
    diaCargado=dia;observarPrecios(dia,actual);canchas=nuevas;promociones=promosSnap.docs.map(d=>({id:d.id,...d.data()}));
    ocupacion=new Map(canchas.map((c,i)=>[c.id,new Set(Object.keys(dias[i].data()?.ocupados??{}).map(Number))]));
    for(const cancha of canchas){
      const cancelar=rutaDia(cancha.id,dia).onSnapshot({includeMetadataChanges:true},snap=>{
        if(actual!==revision||dia!==$('dia').value||snap.metadata.fromCache)return;
        ocupacion.set(cancha.id,new Set(Object.keys(snap.data()?.ocupados??{}).map(Number)));
        if(!solicitud)actualizarHoras();tarjetasCanchas();
      },error=>{if(actual===revision&&!solicitud)mensaje(errorMensaje(error),'error');});
      suscripciones.push(cancelar);
    }
    if(!solicitud){
      actualizarHoras();
      mensaje(!RESERVAS?'Reservas en línea aún no habilitadas. Estado pendiente.'
        :!horario?'El horario global aun no esta publicado. No se pueden solicitar reservas.'
        :canchas.length?'Disponibilidad confirmada por el servidor. El horario se asegura al enviar.':'No hay canchas habilitadas todavía.','ok');
    }
    tarjetasCanchas();tarjetasPromociones();
  }catch(error){if(actual===revision)mensaje(errorMensaje(error),'error');}
  finally{if(actual===revision){cargando=false;$('recargar').disabled=false;tarjetasCanchas();}}
}
$('dia').value=diaOperativoLima();$('dia').min=diaOperativoLima();$('dia').max=siguienteDia(hoyLima(),179);
$('dia').addEventListener('change',()=>{if(solicitud)return;horasSeleccionadas.clear();revision++;cargando=false;actualizarHoras();cargar();});
$('recargar').addEventListener('click',cargar);
$('nueva').addEventListener('click',()=>{solicitud=null;completada=false;horasSeleccionadas.clear();$('dia').disabled=false;actualizarHoras();$('campos').disabled=false;$('enviar').disabled=!auth.currentUser?.providerData.some(p=>p.providerId==='google.com');$('enviar').textContent='Solicitar reserva';$('nueva').hidden=true;cargar();});
$('reserva').addEventListener('submit',async event=>{
  event.preventDefault();
  // Barrera explicita: aunque alguien dispare el formulario a mano, no se escribe.
  if(!RESERVAS){mensaje('Las reservas en línea aún no están habilitadas.','error');return;}
  if(enviando||completada)return;enviando=true;$('enviar').disabled=true;mensaje('Guardando y comprobando todas las franjas…');
  try{
    if(!auth.currentUser?.providerData.some(p=>p.providerId==='google.com'))throw new Error('Continúa con Google antes de reservar.');
    if(!solicitud){
      actualizarHoras();
      if(!$('minuto').value||!$('duracion').value)throw new Error('Marca al menos una hora libre en las tablas.');
      const payload={dia:$('dia').value,canchaId:$('cancha').value,minuto:Number($('minuto').value),duracion:Number($('duracion').value),nombre:$('nombre').value,telefono:telefonoNormalizado($('telefono').value),modalidad:calcularPrecio(precios.get($('cancha').value),horasSeleccionadas)?$('modalidad').value:null};
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
      const clave='grass-'+auth.currentUser.uid+'-'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      const requestId=sessionStorage.getItem(clave)||crypto.randomUUID();sessionStorage.setItem(clave,requestId);
      solicitud={...payload,requestId};$('campos').disabled=true;$('dia').disabled=true;tarjetasCanchas();
    }
    const resultado=await solicitarReserva({firebase,db,uid:auth.currentUser.uid,negocio:NEGOCIO,datos:solicitud});completada=true;
    mensaje(resultado.estado==='confirmada'
      ?`Reserva ${resultado.id}: confirmada y horario ocupado. Guarda este código.`
      :`Solicitud ${resultado.id}: pendiente. El horario no se ocupará hasta que el personal asignado la apruebe. Guarda este código.`,'ok');
    $('nueva').hidden=false;
  }catch(error){mensaje(errorMensaje(error),'error');$('enviar').textContent='Reintentar misma solicitud';$('nueva').hidden=false;}
  finally{enviando=false;$('enviar').disabled=completada || !auth.currentUser?.providerData.some(p=>p.providerId==='google.com');tarjetasCanchas();}
});

// La configuracion publica trae el horario global: se carga antes que las
// canchas para no pintar disponibilidad con un horario que aun no se conoce.
configurarAcceso(firebase,auth,db,NEGOCIO,()=>{solicitud=null;completada=false;horasSeleccionadas.clear();$('nombre').value='';$('telefono').value='';$('campos').disabled=false;$('dia').disabled=false;$('nueva').hidden=true;actualizarHoras();tarjetasCanchas();},()=>enviando,RESERVAS);
aplicarEstadoReservas();
await cargar();
// La ocupacion llega por listeners de Firestore, sin recargar la pagina.

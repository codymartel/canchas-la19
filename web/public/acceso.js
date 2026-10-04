export async function registrarCliente(firebase,db,negocio,user){
 const ref=db.collection('negocios').doc(negocio).collection('clientesRegistrados').doc(user.uid);
 return db.runTransaction(async tx=>{const actual=await tx.get(ref);if(actual.exists)return actual.data();
  const ahora=firebase.firestore.FieldValue.serverTimestamp();
  tx.set(ref,{uid:user.uid,email:user.email,nombre:(user.displayName||'Cliente').slice(0,120),telefono:'',creadoEn:ahora,actualizadoEn:ahora});return null;
 });
}
export function normalizarTelefonoRegistro(valor){
 let n=valor.replace(/[\s()+.\-]/g,'');if(/^9\d{8}$/.test(n))n='51'+n;
 if(!/^[1-9]\d{9,14}$/.test(n))throw new Error('Escribe un teléfono válido con código de país.');return '+'+n;
}
export async function guardarFichaCliente(firebase,db,negocio,user,nombre,telefono){
 if(!user?.providerData.some(p=>p.providerId==='google.com'))throw new Error('Continúa con Google para guardar tu ficha.');
 nombre=nombre.trim();if(!nombre||nombre.length>120)throw new Error('Completa tu nombre, hasta 120 caracteres.');
 telefono=normalizarTelefonoRegistro(telefono);
 const ref=db.collection('negocios').doc(negocio).collection('clientesRegistrados').doc(user.uid);
 await db.runTransaction(async tx=>{const actual=await tx.get(ref);const ahora=firebase.firestore.FieldValue.serverTimestamp();
  if(actual.exists)tx.update(ref,{nombre,telefono,actualizadoEn:ahora});
  else tx.set(ref,{uid:user.uid,email:user.email,nombre,telefono,creadoEn:ahora,actualizadoEn:ahora});
 });return {nombre,telefono};
}
export function configurarAcceso(firebase,auth,db,negocio,alSalir,estaOcupado,reservasHabilitadas=true){
 const $=id=>document.getElementById(id);let stopLimite=null,stopReserva=null,revision=0;
 auth.onAuthStateChanged(async user=>{
  const actual=++revision;stopLimite?.();stopReserva?.();stopLimite=null;stopReserva=null;$('solicitud-activa').textContent='';
  const valido=user?.providerData.some(p=>p.providerId==='google.com');
  $('google-cliente').hidden=!!valido;$('salir-cliente').hidden=!valido;$('enviar').disabled=true;$('registro-contacto').hidden=!valido;
  $('estado-cliente').textContent=valido?'Sesión con Google: '+user.email:'Continúa con Google para registrar tu cuenta.';
  if(!valido)return;
  try{const ficha=reservasHabilitadas?await registrarCliente(firebase,db,negocio,user):(await db.collection('negocios').doc(negocio).collection('clientesRegistrados').doc(user.uid).get()).data();if(actual!==revision)return;
   $('enviar').disabled=!reservasHabilitadas||estaOcupado();
   $('nombre-registro').value=ficha?.nombre||user.displayName||'';$('telefono-registro').value=ficha?.telefono||'';
   $('estado-registro').textContent=ficha?.telefono?'Tu ficha está guardada. Puedes actualizar tus datos.':'Completa nombre y teléfono y guarda tu ficha.';
   if(!$('nombre').value)$('nombre').value=ficha?.nombre||user.displayName||'';
   if(!$('telefono').value)$('telefono').value=ficha?.telefono||'';
   if(!reservasHabilitadas)return;
   stopLimite=db.collection('negocios').doc(negocio).collection('limitesPublicos').doc(user.uid).onSnapshot(s=>{
    stopReserva?.();if(actual!==revision)return;
    if(!s.exists){$('solicitud-activa').textContent='';return;}
    stopReserva=db.collection('negocios').doc(negocio).collection('reservas').doc(s.data().reservaId).onSnapshot(r=>{
     if(actual!==revision)return;const d=r.data();$('solicitud-activa').textContent=d?'Última solicitud: '+r.id+' · '+d.estado+'. Si sigue activa, coordina su cancelación con el personal antes de pedir otra.':'';
    },()=>{$('solicitud-activa').textContent='No se pudo consultar la última solicitud.';});
   },()=>{$('solicitud-activa').textContent='No se pudo consultar el límite de solicitudes.';});
  }catch(e){if(actual===revision){$('enviar').disabled=true;$('estado-cliente').textContent='No se pudo guardar tu ficha. Cierra sesión y vuelve a entrar antes de reservar.';}}
 });
 $('google-cliente').addEventListener('click',async()=>{const b=$('google-cliente');b.disabled=true;
  try{const provider=new firebase.auth.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await auth.signInWithPopup(provider);}
  catch(e){$('estado-cliente').textContent=['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(e.code)?'Acceso cancelado. Puedes volver a intentarlo.':e.code==='auth/popup-blocked'?'Permite la ventana de Google para continuar.':'No se pudo iniciar sesión con Google. Reintenta o consulta al personal.';}
  finally{b.disabled=false;}
 });
 $('registro-contacto').addEventListener('submit',async e=>{e.preventDefault();const b=$('guardar-registro');if(b.disabled)return;b.disabled=true;
  const user=auth.currentUser,actual=revision;
  try{const ficha=await guardarFichaCliente(firebase,db,negocio,user,$('nombre-registro').value,$('telefono-registro').value);
   if(actual!==revision)return;$('nombre').value=ficha.nombre;$('telefono').value=ficha.telefono;$('estado-registro').textContent='Ficha guardada. Las reservas públicas siguen cerradas.';
  }catch(error){if(actual===revision)$('estado-registro').textContent=error.code==='permission-denied'?'No se pudo guardar la ficha. Revisa tu sesión y vuelve a intentar.':error.message;}
  finally{b.disabled=false;}
 });
 $('salir-cliente').addEventListener('click',async()=>{if(estaOcupado())return;await auth.signOut();$('nombre-registro').value='';$('telefono-registro').value='';$('estado-registro').textContent='';alSalir();});
}

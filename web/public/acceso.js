export async function registrarCliente(firebase,db,negocio,user){
 const ref=db.collection('negocios').doc(negocio).collection('clientesRegistrados').doc(user.uid);
 return db.runTransaction(async tx=>{const actual=await tx.get(ref);if(actual.exists)return actual.data();
  const ahora=firebase.firestore.FieldValue.serverTimestamp();
  tx.set(ref,{uid:user.uid,email:user.email,nombre:(user.displayName||'Cliente').slice(0,120),telefono:'',creadoEn:ahora,actualizadoEn:ahora});return null;
 });
}
export function configurarAcceso(firebase,auth,db,negocio,alSalir,estaOcupado){
 const $=id=>document.getElementById(id);let stopLimite=null,stopReserva=null,revision=0;
 auth.onAuthStateChanged(async user=>{
  const actual=++revision;stopLimite?.();stopReserva?.();stopLimite=null;stopReserva=null;$('solicitud-activa').textContent='';
  const valido=user?.providerData.some(p=>p.providerId==='google.com');
  $('google-cliente').hidden=!!valido;$('salir-cliente').hidden=!valido;$('enviar').disabled=true;
  $('estado-cliente').textContent=valido?'Sesión con Google: '+user.email:'Continúa con Google para enviar tu reserva.';
  if(!valido)return;
  try{const ficha=await registrarCliente(firebase,db,negocio,user);if(actual!==revision)return;
   $('enviar').disabled=estaOcupado();
   if(!$('nombre').value)$('nombre').value=ficha?.nombre||user.displayName||'';
   if(!$('telefono').value)$('telefono').value=ficha?.telefono||'';
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
 $('salir-cliente').addEventListener('click',async()=>{if(estaOcupado())return;await auth.signOut();alSalir();});
}

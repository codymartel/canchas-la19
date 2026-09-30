// Una lectura manual termina incluso si el servidor no responde. Los listeners
// quedan independientes para seguir recibiendo cambios en tiempo real.
export async function conTiempoLimite(operacion, milisegundos=15000){
  let temporizador;
  try {
    return await Promise.race([operacion,new Promise((_,rechazar)=>{
      temporizador=setTimeout(()=>rechazar(new Error('No se pudo actualizar. Revisa tu conexión e intenta nuevamente.')),milisegundos);
    })]);
  } finally {clearTimeout(temporizador);}
}

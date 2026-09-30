export const hora = m => `${String(Math.floor((m % 1440) / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}${m >= 1440 ? ' (+1 día)' : ''}`;
export const soles = c => new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(c / 100);
export const hoyLima = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0,10);
export function diaOperativoLima(instante=Date.now()){
  const local=new Date(instante-5*3600000);
  if(local.getUTCHours()<7)local.setUTCDate(local.getUTCDate()-1);
  return local.toISOString().slice(0,10);
}
export function iniciosDisponibles(libres, duracion) {
  const set = new Set(libres);
  if (!Number.isInteger(duracion) || duracion < 30 || duracion > 600 || duracion % 30) return [];
  return libres.filter(m => Array.from({length:duracion / 30},(_,i)=>m + i * 30).every(s=>set.has(s)));
}
export function iniciosDeTurno(libres, duracion, apertura, turno) {
  if (!Number.isInteger(turno) || turno < 30 || turno > 240 || turno % 30) return [];
  return iniciosDisponibles(libres, duracion)
    .filter(minuto => (minuto - apertura + 1440) % turno === 0);
}
export function siguienteDia(iso,cantidad=1){const d=new Date(`${iso}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+cantidad);return d.toISOString().slice(0,10);}
// El horario es del negocio, no de cada cancha. Esta lectura valida exactamente
// las mismas reglas que el servidor y el panel: si algo no cuadra se devuelve
// null y la web no ofrece ningun inicio, en vez de prometer horas que el
// servidor va a rechazar.
export function leerHorario(datos){
  if(!datos)return null;
  const apertura=Number(datos.aperturaMinuto),cierre=Number(datos.cierreMinuto),turno=Number(datos.duracionTurnoMinutos);
  if(!Number.isInteger(apertura)||apertura<0||apertura>1439||apertura%30)return null;
  if(!Number.isInteger(cierre)||cierre<1||cierre>1440||cierre%30)return null;
  if(!Number.isInteger(turno)||turno<30||turno>240||turno%30)return null;
  if(apertura===cierre)return null;
  return {aperturaMinuto:apertura,cierreMinuto:cierre,duracionTurnoMinutos:turno};
}

// Una solicitud representa un único intervalo continuo, máximo diez horas.
export function intervaloSeleccionado(horas){
  const ordenadas=[...new Set(horas)].sort((a,b)=>a-b);
  if(!ordenadas.length)return null;
  if(ordenadas.length>10||ordenadas.some((m,i)=>!Number.isInteger(m)||m%60!==0||(i>0&&m!==ordenadas[i-1]+60)))throw new Error('Marca horas consecutivas de una cancha, hasta un máximo de 10 horas.');
  return {minuto:ordenadas[0],duracion:ordenadas.length*60};
}

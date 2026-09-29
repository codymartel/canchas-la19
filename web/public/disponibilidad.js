export const hora = m => `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
export const soles = c => new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(c / 100);
export const hoyLima = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0,10);
export function iniciosDisponibles(libres, duracion) {
  const set = new Set(libres);
  if (!Number.isInteger(duracion) || duracion < 30 || duracion > 240 || duracion % 30) return [];
  return libres.filter(m => m < 1440 && Array.from({length:duracion / 30},(_,i)=>m + i * 30).every(s=>set.has(s)));
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

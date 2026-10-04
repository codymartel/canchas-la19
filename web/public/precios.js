export function reconstruirPrecios(eventos) {
  const horas = {};
  let plazoMinutos = null, version = 0;
  for (const e of [...eventos].sort((a,b)=>a.version-b.version)) {
    const b=e.bloque;
    if (!b || !Number.isInteger(e.version) || e.version <= version) throw new Error('Precios no válidos. Actualiza antes de continuar.');
    for(let m=b.desde;m<b.hasta;m+=60)horas[m]={precioCentimos:b.precioCentimos,adelantoCentimos:b.adelantoCentimos};
    version=e.version;plazoMinutos=e.plazoMinutos;
  }
  return {horas,version,plazoMinutos};
}
export function calcularPrecio(parametros, seleccion) {
  if(!seleccion.size)return null;
  let total=0,adelanto=0;
  for(const m of seleccion){
    const h=parametros?.horas?.[m];
    if(!h || !Number.isInteger(h.precioCentimos) || h.precioCentimos<=0 || !Number.isInteger(h.adelantoCentimos) || h.adelantoCentimos<0 || h.adelantoCentimos>h.precioCentimos)return null;
    total+=h.precioCentimos;adelanto+=h.adelantoCentimos;
  }
  return {total,adelanto,saldo:total-adelanto};
}

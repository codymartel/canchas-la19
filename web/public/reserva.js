export function slotDe(firebase, dia, minuto, indice) {
  const [anio, mes, diaNum] = dia.split('-').map(Number);
  const local = new Date(Date.UTC(anio, mes - 1, diaNum));
  local.setUTCMinutes(minuto + indice * 30);
  const instante = new Date(Date.UTC(anio, mes - 1, diaNum));
  instante.setUTCMinutes(minuto + indice * 30 + 300);
  return {
    dia: `${String(local.getUTCFullYear()).padStart(4, '0')}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`,
    year: String(local.getUTCFullYear()),
    month: String(local.getUTCMonth() + 1),
    day: String(local.getUTCDate()),
    minute: String(local.getUTCHours() * 60 + local.getUTCMinutes()),
    inicio: firebase.firestore.Timestamp.fromDate(instante),
  };
}

function referenciaSlot(db, negocio, cancha, slot) {
  return db.collection('negocios').doc(negocio).collection('agenda').doc(cancha)
    .collection('anios').doc(slot.year).collection('meses').doc(slot.month)
    .collection('dias').doc(slot.day).collection('franjas').doc(slot.minute);
}

export async function solicitarReserva({ firebase, db, uid, negocio, datos }) {
  const id = `r_${datos.requestId}`;
  const ref = db.collection('negocios').doc(negocio).collection('reservas').doc(id);
  const slots = Array.from(
    { length: datos.duracion / 30 },
    (_, indice) => slotDe(firebase, datos.dia, datos.minuto, indice),
  );
  return db.runTransaction(async tx => {
    const previa = await tx.get(ref);
    if (previa.exists) {
      if (previa.data().solicitanteUid === uid) {
        return { id, estado: previa.data().estado };
      }
      throw new Error('La clave ya existe.');
    }
    const slotRefs = slots.map(slot => referenciaSlot(db, negocio, datos.canchaId, slot));
    const ocupadas = [];
    for (const slotRef of slotRefs) ocupadas.push(await tx.get(slotRef));
    if (ocupadas.some(slot => slot.exists)) {
      const error = new Error('Ese horario acaba de ser ocupado.');
      error.code = 'already-exists';
      throw error;
    }
    const inicio = new Date(`${datos.dia}T00:00:00-05:00`);
    inicio.setUTCMinutes(inicio.getUTCMinutes() + datos.minuto);
    const fin = new Date(inicio.getTime() + datos.duracion * 60000);
    const ahora = firebase.firestore.FieldValue.serverTimestamp();
    tx.set(ref, {
      schemaVersion: 3,
      negocioId: negocio,
      sedeId: datos.canchaId,
      canchaId: datos.canchaId,
      dia: datos.dia,
      dias: [...new Set(slots.map(slot => slot.dia))],
      minuto: datos.minuto,
      duracion: datos.duracion,
      inicio: firebase.firestore.Timestamp.fromDate(inicio),
      fin: firebase.firestore.Timestamp.fromDate(fin),
      slots,
      estado: 'pendiente',
      bloqueo: false,
      clienteId: '',
      clienteNombre: datos.nombre.trim(),
      telefono: datos.telefono.trim(),
      montoCentimos: 0,
      adelantoCentimos: 0,
      saldoCentimos: 0,
      metodoPago: datos.metodoPago,
      promocionId: datos.promocionId || '',
      origen: 'publico',
      solicitanteUid: uid,
      creadoPor: uid,
      atendidoPor: '',
      createdAt: ahora,
      updatedAt: ahora,
      version: 1,
    });
    slots.forEach((slot, indice) => tx.set(slotRefs[indice], {
      reservaId: id,
      coleccion: 'reservas',
      canchaId: datos.canchaId,
      year: slot.year,
      month: slot.month,
      day: slot.day,
      minute: slot.minute,
      inicio: slot.inicio,
      indice,
    }));
    return { id, estado: 'pendiente' };
  });
}

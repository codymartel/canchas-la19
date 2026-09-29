function referenciaAgenda(db, negocio, cancha, dia) {
  return db.collection('negocios').doc(negocio).collection('agenda').doc(cancha)
    .collection('dias').doc(dia);
}

function referenciaPublica(db, negocio, cancha, dia) {
  return db.collection('agenda_publica').doc(negocio).collection('canchas').doc(cancha)
    .collection('dias').doc(dia);
}

export async function solicitarReserva({ firebase, db, uid, negocio, datos }) {
  const id = `r_${datos.requestId}`;
  const ref = db.collection('negocios').doc(negocio).collection('reservas').doc(id);
  const agendaRef = referenciaAgenda(db, negocio, datos.canchaId, datos.dia);
  const publicaRef = referenciaPublica(db, negocio, datos.canchaId, datos.dia);
  const minutos = Array.from(
    { length: datos.duracion / 30 },
    (_, indice) => String(datos.minuto + indice * 30),
  );
  const [year, month, day] = datos.dia.split('-');
  return db.runTransaction(async tx => {
    const previa = await tx.get(ref);
    if (previa.exists) {
      const anterior = previa.data();
      if (anterior.schemaVersion === 5 && anterior.solicitanteUid === uid
        && anterior.canchaId === datos.canchaId && anterior.dia === datos.dia
        && anterior.minuto === datos.minuto && anterior.duracion === datos.duracion) {
        return { id, estado: anterior.estado };
      }
      throw new Error('La clave ya existe para otra reserva.');
    }
    const publica = await tx.get(publicaRef);
    const ocupados = { ...(publica.data()?.ocupados ?? {}) };
    const confirmada = datos.duracion <= 180;
    if (confirmada && minutos.some(minuto => ocupados[minuto] === true)) {
      const error = new Error('Ese horario acaba de ser ocupado.');
      error.code = 'already-exists';
      throw error;
    }
    const inicio = new Date(`${datos.dia}T00:00:00-05:00`);
    inicio.setUTCMinutes(inicio.getUTCMinutes() + datos.minuto);
    const fin = new Date(inicio.getTime() + datos.duracion * 60000);
    const ahora = firebase.firestore.FieldValue.serverTimestamp();
    tx.set(ref, {
      schemaVersion: 5,
      negocioId: negocio,
      sedeId: datos.canchaId,
      canchaId: datos.canchaId,
      dia: datos.dia,
      jornada: { year, month, day },
      minuto: datos.minuto,
      duracion: datos.duracion,
      minutos,
      inicio: firebase.firestore.Timestamp.fromDate(inicio),
      fin: firebase.firestore.Timestamp.fromDate(fin),
      estado: confirmada ? 'confirmada' : 'pendiente',
      bloqueo: false,
      clienteId: '',
      clienteNombre: datos.nombre.trim(),
      telefono: datos.telefono.trim(),
      montoCentimos: 0,
      adelantoCentimos: 0,
      saldoCentimos: 0,
      metodoPago: '',
      promocionId: '',
      historialPagos: [],
      origen: 'publico',
      solicitanteUid: uid,
      creadoPor: uid,
      atendidoPor: '',
      createdAt: ahora,
      updatedAt: ahora,
      version: 1,
    });
    if (confirmada) {
      for (const minuto of minutos) ocupados[minuto] = true;
      tx.set(agendaRef, {
        ocupados,
        ultimaOperacion: {
          reservaId: id,
          coleccion: 'reservas',
          tipo: 'ocupar',
          minutos,
        },
      });
      tx.set(publicaRef, { ocupados });
    }
    return { id, estado: confirmada ? 'confirmada' : 'pendiente' };
  });
}

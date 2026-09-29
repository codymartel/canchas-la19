import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/data/servicios.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/domain/resultado.dart';
import '../domain/reserva.dart';

class ReservasRepository {
  final Servicios servicios;
  final String negocio;
  ReservasRepository(this.servicios, this.negocio);

  String _coleccion(Map<String, dynamic> datos) =>
      datos['bloqueo'] == true ? 'bloqueos' : 'reservas';

  Stream<LecturaReservas> observarDia(String dia, {bool bloqueos = false}) =>
      servicios
          .coleccion(negocio, bloqueos ? 'bloqueos' : 'reservas')
          .where('dias', arrayContains: dia)
          .limit(1500)
          .snapshots(includeMetadataChanges: true)
          .map(
            (s) => LecturaReservas(
              reservas: s.docs
                  .map(
                    (d) => Reserva(d.id, {
                      ...d.data(),
                      '_pendiente': d.metadata.hasPendingWrites,
                      '_desdeCache': d.metadata.isFromCache,
                    }, bloqueo: bloqueos),
                  )
                  .toList(),
              desdeCache: s.metadata.isFromCache,
              pendientes: s.docs.any((d) => d.metadata.hasPendingWrites),
            ),
          );

  /// Horario comun a todas las canchas, para pintar los inicios permitidos.
  Stream<HorarioNegocio?> observarHorario() => servicios.db
      .doc('negocios/$negocio')
      .snapshots()
      .map((doc) => doc.exists ? leerHorario(convertir(doc)) : null);

  /// Registra una reserva o bloqueo y todas sus franjas canonicas de 30 minutos.
  Future<Resultado<void>> registrar(
    Map<String, dynamic> datos,
  ) => servicios.guardando(() async {
    final bloqueo = datos['bloqueo'] == true;
    final dia = '${datos['dia']}';
    final minuto = datos['minuto'] as int? ?? -1;
    final duracion = datos['duracion'] as int? ?? 0;
    final canchaId = '${datos['canchaId']}';
    if (!esDiaValido(dia)) throw const FormatException('Fecha invalida.');
    if (!esSede(canchaId)) throw const FormatException('Cancha invalida.');
    if (!esFranjaValida(minuto)) {
      throw const FormatException(
        'Elige un inicio en una franja de 30 minutos.',
      );
    }
    if (!esDuracionValida(duracion)) {
      throw const FormatException('Duracion: de 30 a 240 minutos.');
    }
    var monto = 0, adelanto = 0, clienteId = '', nombre = '', telefono = '';
    var metodo = 'efectivo';
    if (!bloqueo) {
      monto = datos['montoCentimos'] as int? ?? 0;
      adelanto = datos['adelantoCentimos'] as int? ?? 0;
      if (monto < 0 || monto > 100000000) {
        throw const FormatException('Monto invalido.');
      }
      if (adelanto < 0 || adelanto > monto) {
        throw const FormatException('El adelanto supera el monto.');
      }
      metodo = '${datos['metodoPago']}';
      if (!['yape', 'efectivo'].contains(metodo)) {
        throw const FormatException('Metodo de pago invalido.');
      }
      nombre = '${datos['nombre'] ?? ''}'.trim();
      if (nombre.isEmpty) {
        throw const FormatException('Completa el nombre del cliente.');
      }
      telefono = normalizarTelefono('${datos['telefono']}');
      clienteId = '${datos['clienteId'] ?? ''}';
      if (clienteId.isEmpty) {
        clienteId =
            'c_${telefono.replaceAll('+', '').hashCode.toUnsigned(32).toRadixString(16)}';
      }
    } else {
      nombre = '${datos['motivo'] ?? ''}'.trim();
      if (nombre.isEmpty) {
        throw const FormatException('Describe el motivo del mantenimiento.');
      }
    }
    final requestId = '${datos['requestId']}';
    if (!RegExp(r'^[A-Za-z0-9_-]{8,100}$').hasMatch(requestId)) {
      throw const FormatException('Clave de operacion invalida.');
    }
    final id = idReserva(requestId);
    final coleccion = _coleccion(datos);
    final slots = slotsDe(dia: dia, minuto: minuto, duracion: duracion);
    final dias = slots.map((s) => s.dia).toSet().toList();
    final inicio = inicioDe(dia, minuto);
    final sedeId = canchaId;
    final slotRefs = [
      for (final slot in slots)
        servicios.db.doc(rutaFranja(negocio, canchaId, slot)),
    ];
    await servicios.db.runTransaction((tx) async {
      final reservaRef = servicios.doc(negocio, coleccion, id);
      final previa = await tx.get(reservaRef);
      // El horario se lee del documento del negocio dentro de la misma
      // transaccion que la cancha: si alguien lo cambia mientras se reserva,
      // la transaccion vuelve a ejecutarse con el horario vigente.
      final negocioDoc = await tx.get(servicios.db.doc('negocios/$negocio'));
      final cancha = await tx.get(servicios.doc(negocio, 'canchas', canchaId));
      final ocupadas = <DocumentSnapshot<Map<String, dynamic>>>[];
      for (final ref in slotRefs) {
        ocupadas.add(await tx.get(ref));
      }
      if (previa.exists) {
        final anterior = previa.data();
        if (anterior?['schemaVersion'] == 3 &&
            anterior?['canchaId'] == canchaId &&
            anterior?['dia'] == dia &&
            anterior?['minuto'] == minuto &&
            anterior?['duracion'] == duracion) {
          return;
        }
        throw const FormatException(
          'La clave de operacion corresponde a otra reserva.',
        );
      }
      final horario = negocioDoc.exists
          ? leerHorario(convertir(negocioDoc))
          : null;
      if (horario == null) {
        throw const FormatException(
          'El horario de atencion no esta configurado. Pidelo en Configuracion.',
        );
      }
      final canchaDatos = cancha.data();
      if (canchaDatos == null || !esReservable(convertir(cancha))) {
        final faltan = canchaDatos == null
            ? <String>['existe']
            : pendientesDeReserva(convertir(cancha));
        throw FormatException(
          'La cancha no es reservable: falta ${faltan.join(' y ')}.',
        );
      }
      if (!iniciosDeTurno(
        horario: horario,
        duracion: duracion,
      ).contains(minuto)) {
        if (duracion % horario.duracionTurno != 0 ||
            (minuto - horario.apertura + 1440) % horario.duracionTurno != 0) {
          throw const FormatException(
            'El inicio y la duracion deben respetar el turno configurado.',
          );
        }
        throw const FormatException(
          'El horario queda fuera de la atencion configurada.',
        );
      }
      if (ocupadas.any((d) => d.exists)) {
        throw const FormatException(
          'Horario ocupado. Actualiza la agenda y elige otra franja.',
        );
      }
      final ahora = FieldValue.serverTimestamp();
      tx.set(reservaRef, {
        'schemaVersion': 3,
        'negocioId': negocio,
        'sedeId': sedeId,
        'canchaId': canchaId,
        'dia': dia,
        'minuto': minuto,
        'duracion': duracion,
        'inicio': Timestamp.fromDate(inicio),
        'fin': Timestamp.fromDate(inicio.add(Duration(minutes: duracion))),
        'dias': dias,
        'slots': [
          for (final slot in slots)
            {
              'dia': slot.dia,
              'year': '${slot.year}',
              'month': '${slot.month}',
              'day': '${slot.day}',
              'minute': '${slot.minute}',
              'inicio': Timestamp.fromDate(slot.inicio),
            },
        ],
        'estado': 'confirmada',
        'bloqueo': bloqueo,
        'clienteId': bloqueo ? '' : clienteId,
        'clienteNombre': nombre,
        'telefono': telefono,
        'montoCentimos': monto,
        'adelantoCentimos': adelanto,
        'saldoCentimos': monto - adelanto,
        'metodoPago': metodo,
        'promocionId': '${datos['promocionId'] ?? ''}',
        'origen': 'personal',
        'solicitanteUid': '',
        'creadoPor': servicios.uid,
        'atendidoPor': servicios.uid,
        'createdAt': ahora,
        'updatedAt': ahora,
        'version': 1,
      });
      for (var i = 0; i < slots.length; i++) {
        final slot = slots[i];
        tx.set(slotRefs[i], {
          'reservaId': id,
          'coleccion': coleccion,
          'canchaId': canchaId,
          'year': '${slot.year}',
          'month': '${slot.month}',
          'day': '${slot.day}',
          'minute': '${slot.minute}',
          'inicio': Timestamp.fromDate(slot.inicio),
          'indice': i,
        });
      }
    });
  });

  /// Confirma, cancela o marca no_asistio. Cancelar libera las franjas en la
  /// misma operacion atomica.
  Future<Resultado<void>> actualizar(
    Map<String, dynamic> datos,
  ) => servicios.guardando(() async {
    final id = '${datos['id']}';
    final bloqueo = datos['bloqueo'] == true;
    final estado = '${datos['estado']}';
    if (!esEstadoReserva(estado)) {
      throw const FormatException('Estado invalido.');
    }
    if (!['confirmada', 'cancelada', 'no_asistio'].contains(estado)) {
      throw const FormatException('Transicion no permitida.');
    }
    final version = datos['version'] as int? ?? 0;
    final adelanto = datos['adelantoCentimos'] as int? ?? 0;
    final coleccion = bloqueo ? 'bloqueos' : 'reservas';
    final ref = servicios.doc(negocio, coleccion, id);
    await servicios.db.runTransaction((tx) async {
      final actual = await tx.get(ref);
      final data = actual.data();
      if (data == null || data['schemaVersion'] != 3) {
        throw const FormatException('Reserva no encontrada.');
      }
      if (data['version'] != version) {
        throw const FormatException(
          'Otro empleado modifico la reserva. Vuelve a abrirla.',
        );
      }
      if (!['pendiente', 'confirmada'].contains('${data['estado']}')) {
        throw const FormatException('La reserva ya no admite cambios.');
      }
      final montoAnterior = (data['montoCentimos'] as num?)?.toInt() ?? 0;
      final monto = data['estado'] == 'pendiente'
          ? datos['montoCentimos'] as int? ?? montoAnterior
          : montoAnterior;
      final previo = (data['adelantoCentimos'] as num?)?.toInt() ?? 0;
      if (adelanto < previo || adelanto > monto) {
        throw const FormatException('Adelanto invalido.');
      }
      tx.update(ref, {
        'estado': estado,
        'montoCentimos': monto,
        'adelantoCentimos': adelanto,
        'saldoCentimos': monto - adelanto,
        'atendidoPor': servicios.uid,
        'updatedAt': FieldValue.serverTimestamp(),
        'version': version + 1,
      });
      if (estado == 'cancelada') {
        final cancha = '${data['canchaId']}';
        final slots = List<Map<String, dynamic>>.from(
          (data['slots'] as List? ?? const []).map(
            (s) => Map<String, dynamic>.from(s as Map),
          ),
        );
        for (final slot in slots) {
          tx.delete(
            servicios.db.doc(
              'negocios/$negocio/agenda/$cancha/anios/${slot['year']}/meses/${slot['month']}/dias/${slot['day']}/franjas/${slot['minute']}',
            ),
          );
        }
      }
    });
  });
}

class LecturaReservas {
  final List<Reserva> reservas;
  final bool desdeCache, pendientes;
  const LecturaReservas({
    required this.reservas,
    required this.desdeCache,
    required this.pendientes,
  });
}

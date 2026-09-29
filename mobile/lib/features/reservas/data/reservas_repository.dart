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
          .where('dia', isEqualTo: dia)
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

  Stream<LecturaOcupacion> observarOcupacion(String cancha, String dia) =>
      servicios.db
          .doc(rutaAgendaDia(negocio, cancha, dia))
          .snapshots(includeMetadataChanges: true)
          .map((doc) {
            final data = doc.data();
            final ocupados = Map<String, dynamic>.from(
              data?['ocupados'] as Map? ?? const {},
            );
            return LecturaOcupacion(
              minutos: ocupados.keys.map(int.parse).toSet(),
              desdeCache: doc.metadata.isFromCache,
              pendientes: doc.metadata.hasPendingWrites,
            );
          });

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
    if (!esMinutoOperacionValido(minuto)) {
      throw const FormatException(
        'Elige un inicio en una franja de 30 minutos.',
      );
    }
    if (!esDuracionReservaValida(duracion) || minuto + duracion > 1500) {
      throw const FormatException('Duracion: de 30 a 600 minutos.');
    }
    var nombre = '', telefono = '';
    if (!bloqueo) {
      nombre = '${datos['nombre'] ?? ''}'.trim();
      if (nombre.isEmpty) {
        throw const FormatException('Completa el nombre del cliente.');
      }
      telefono = normalizarTelefono('${datos['telefono']}');
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
    if (bloqueo && duracion > 180) {
      throw const FormatException('Un bloqueo no puede superar 180 minutos.');
    }
    final minutos = minutosDe(minuto: minuto, duracion: duracion);
    final inicio = inicioDe(dia, minuto);
    final sedeId = canchaId;
    final agendaRef = servicios.db.doc(rutaAgendaDia(negocio, canchaId, dia));
    final publicaRef = servicios.db.doc(
      rutaAgendaPublica(negocio, canchaId, dia),
    );
    await servicios.db.runTransaction((tx) async {
      final reservaRef = servicios.doc(negocio, coleccion, id);
      final previa = await tx.get(reservaRef);
      // El horario se lee del documento del negocio dentro de la misma
      // transaccion que la cancha: si alguien lo cambia mientras se reserva,
      // la transaccion vuelve a ejecutarse con el horario vigente.
      final negocioDoc = await tx.get(servicios.db.doc('negocios/$negocio'));
      final cancha = await tx.get(servicios.doc(negocio, 'canchas', canchaId));
      final agenda = duracion <= 180 ? await tx.get(agendaRef) : null;
      if (previa.exists) {
        final anterior = previa.data();
        if (anterior?['schemaVersion'] == 5 &&
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
      final ocupados = Map<String, dynamic>.from(
        agenda?.data()?['ocupados'] as Map? ?? const {},
      );
      if (minutos.any(ocupados.containsKey)) {
        throw const FormatException(
          'Horario ocupado. Actualiza la agenda y elige otra franja.',
        );
      }
      final ahora = FieldValue.serverTimestamp();
      final confirmada = duracion <= 180;
      tx.set(reservaRef, {
        'schemaVersion': 5,
        'negocioId': negocio,
        'sedeId': sedeId,
        'canchaId': canchaId,
        'dia': dia,
        'jornada': jornadaDe(dia),
        'minuto': minuto,
        'duracion': duracion,
        'minutos': minutos,
        'inicio': Timestamp.fromDate(inicio),
        'fin': Timestamp.fromDate(inicio.add(Duration(minutes: duracion))),
        'estado': confirmada ? 'confirmada' : 'pendiente',
        'bloqueo': bloqueo,
        'clienteId': '',
        'clienteNombre': nombre,
        'telefono': telefono,
        'montoCentimos': 0,
        'adelantoCentimos': 0,
        'saldoCentimos': 0,
        'metodoPago': '',
        'promocionId': '',
        'historialPagos': <Map<String, dynamic>>[],
        'origen': 'personal',
        'solicitanteUid': '',
        'creadoPor': servicios.uid,
        'atendidoPor': confirmada ? servicios.uid : '',
        'createdAt': ahora,
        'updatedAt': ahora,
        'version': 1,
      });
      if (confirmada) {
        for (final minuto in minutos) {
          ocupados[minuto] = true;
        }
        tx.set(agendaRef, {
          'ocupados': ocupados,
          'ultimaOperacion': {
            'reservaId': id,
            'coleccion': coleccion,
            'tipo': 'ocupar',
            'minutos': minutos,
          },
        });
        tx.set(publicaRef, {'ocupados': ocupados});
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
    if (![
      'confirmada',
      'rechazada',
      'cancelada',
      'no_asistio',
    ].contains(estado)) {
      throw const FormatException('Transicion no permitida.');
    }
    final version = datos['version'] as int? ?? 0;
    final coleccion = bloqueo ? 'bloqueos' : 'reservas';
    final ref = servicios.doc(negocio, coleccion, id);
    await servicios.db.runTransaction((tx) async {
      final actual = await tx.get(ref);
      final data = actual.data();
      if (data == null || data['schemaVersion'] != 5) {
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
      final anterior = '${data['estado']}';
      final permitida = anterior == 'pendiente'
          ? ['confirmada', 'rechazada'].contains(estado)
          : ['cancelada', 'no_asistio'].contains(estado);
      if (!permitida) {
        throw const FormatException('Transicion no permitida.');
      }
      final cancha = '${data['canchaId']}';
      final dia = '${data['dia']}';
      final minutos = List<String>.from(data['minutos'] as List? ?? const []);
      final cambiaOcupacion =
          anterior == 'pendiente' && estado == 'confirmada' ||
          anterior == 'confirmada' && estado == 'cancelada';
      final agendaRef = servicios.db.doc(rutaAgendaDia(negocio, cancha, dia));
      final publicaRef = servicios.db.doc(
        rutaAgendaPublica(negocio, cancha, dia),
      );
      final agenda = cambiaOcupacion ? await tx.get(agendaRef) : null;
      final ocupados = Map<String, dynamic>.from(
        agenda?.data()?['ocupados'] as Map? ?? const {},
      );
      if (anterior == 'pendiente' && estado == 'confirmada') {
        if (minutos.any(ocupados.containsKey)) {
          throw const FormatException('El horario ya no esta disponible.');
        }
        for (final minuto in minutos) {
          ocupados[minuto] = true;
        }
      } else if (anterior == 'confirmada' && estado == 'cancelada') {
        if (minutos.any((minuto) => ocupados[minuto] != true)) {
          throw const FormatException(
            'La ocupacion de la reserva esta incompleta.',
          );
        }
        for (final minuto in minutos) {
          ocupados.remove(minuto);
        }
      }
      tx.update(ref, {
        'estado': estado,
        'atendidoPor': servicios.uid,
        'updatedAt': FieldValue.serverTimestamp(),
        'version': version + 1,
      });
      if (cambiaOcupacion) {
        tx.set(agendaRef, {
          'ocupados': ocupados,
          'ultimaOperacion': {
            'reservaId': id,
            'coleccion': coleccion,
            'tipo': estado == 'confirmada' ? 'ocupar' : 'liberar',
            'minutos': minutos,
          },
        });
        tx.set(publicaRef, {'ocupados': ocupados});
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

class LecturaOcupacion {
  final Set<int> minutos;
  final bool desdeCache, pendientes;
  const LecturaOcupacion({
    required this.minutos,
    required this.desdeCache,
    required this.pendientes,
  });
}

import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/data/servicios.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/domain/resultado.dart';

class ConfiguracionRepository {
  final Servicios servicios;
  final String negocio;
  ConfiguracionRepository(this.servicios, this.negocio);

  DocumentReference<Map<String, dynamic>> get referencia =>
      servicios.db.doc('negocios_publicos/$negocio');

  /// Documento privado del negocio: fuente de verdad del horario.
  DocumentReference<Map<String, dynamic>> get privada =>
      servicios.db.doc('negocios/$negocio');

  Stream<Registro?> observar() =>
      referencia.snapshots().map((doc) => doc.exists ? convertir(doc) : null);

  Stream<HorarioNegocio?> observarHorario() => privada.snapshots().map(
    (doc) => doc.exists ? leerHorario(convertir(doc)) : null,
  );

  /// Guarda en una sola operacion atomica la pagina publica y el horario
  /// comun. Si el horario publico se desincronizara del privado, la web
  /// mostraria horas que el servidor no acepta.
  Future<Resultado<void>> guardar({
    required String nombre,
    required String slug,
    required String descripcion,
    required String telefonoPublico,
    required String whatsapp,
    required int aperturaMinuto,
    required int cierreMinuto,
    required int duracionTurnoMinutos,
  }) => servicios.guardando(() async {
    final slugLimpio = slug.trim().toLowerCase();
    if (!RegExp(r'^[a-z0-9][a-z0-9-]{2,49}$').hasMatch(slugLimpio)) {
      throw const FormatException(
        'El slug usa de 3 a 50 letras minusculas, numeros o guiones.',
      );
    }
    if (nombre.trim().isEmpty || nombre.trim().length > 120) {
      throw const FormatException('Nombre publico invalido.');
    }
    if (descripcion.trim().length > 1000) {
      throw const FormatException(
        'La descripcion admite hasta 1000 caracteres.',
      );
    }
    if (!esHorarioValido(
      apertura: aperturaMinuto,
      cierre: cierreMinuto,
      duracionTurno: duracionTurnoMinutos,
    )) {
      throw const FormatException(
        'El horario debe tener apertura y cierre distintos en franjas de 30 '
        'minutos, y el turno entre 30 minutos y 4 horas.',
      );
    }
    final previa = await referencia.get();
    final galeria = List<Map<String, dynamic>>.from(
      (previa.data()?['galeria'] as List? ?? const []).map(
        (foto) => Map<String, dynamic>.from(foto as Map),
      ),
    );
    final ahora = FieldValue.serverTimestamp();
    final lote = servicios.db.batch();
    lote.set(privada, {
      'aperturaMinuto': aperturaMinuto,
      'cierreMinuto': cierreMinuto,
      'duracionTurnoMinutos': duracionTurnoMinutos,
      'horarioActualizadoPor': servicios.uid,
      'horarioActualizadoEn': ahora,
    }, SetOptions(merge: true));
    lote.set(referencia, {
      'negocioId': negocio,
      'slug': slugLimpio,
      'nombre': nombre.trim(),
      'descripcion': descripcion.trim(),
      'telefonoPublico': telefonoPublico.trim(),
      'whatsapp': whatsapp.trim(),
      'galeria': galeria,
      'aperturaMinuto': aperturaMinuto,
      'cierreMinuto': cierreMinuto,
      'duracionTurnoMinutos': duracionTurnoMinutos,
      'actualizadoEn': ahora,
    });
    await lote.commit();
  });
}

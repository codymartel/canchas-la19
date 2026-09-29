import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/data/servicios.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/domain/resultado.dart';

class SedesRepository {
  final Servicios servicios;
  final String negocio;
  SedesRepository(this.servicios, this.negocio);
  Stream<List<Registro>> observarCanchas() =>
      observar(servicios.coleccion(negocio, 'canchas').limit(30));

  /// El horario de atencion y la duracion del turno no son de la cancha: se
  /// leen del documento privado del negocio, que es el que valida las reservas.
  Stream<HorarioNegocio?> observarHorario() => servicios.db
      .doc('negocios/$negocio')
      .snapshots()
      .map((doc) => doc.exists ? leerHorario(convertir(doc)) : null);

  Future<Resultado<void>> guardar(
    Map<String, dynamic> datos,
  ) => servicios.guardando(() async {
    final id = '${datos['id']}';
    final sedeId = '${datos['sedeId']}';
    if (!esSede(sedeId)) throw const FormatException('Sede invalida.');
    if (id != sedeId) {
      throw const FormatException(
        'Las canchas de Grass son La 19, La 23 y La 24 y no se agregan otras.',
      );
    }
    final nombre = '${datos['nombre']}'.trim();
    if (nombre.isEmpty) throw const FormatException('Completa el nombre.');
    final direccion = '${datos['direccion'] ?? ''}'.trim();
    if (direccion.length > 300) {
      throw const FormatException(
        'La direccion publica admite hasta 300 caracteres.',
      );
    }
    // La tarifa puede quedar vacia: la cancha se guarda como no reservable en
    // lugar de inventar un precio. Lo mismo con la direccion.
    final escrito = '${datos['tarifaTurnoCentimos'] ?? ''}'.trim();
    final tarifa = escrito.isEmpty ? null : int.tryParse(escrito);
    if (escrito.isNotEmpty && tarifa == null) {
      throw const FormatException('Tarifa por turno invalida.');
    }
    if (tarifa != null && !esTarifaValida(tarifa)) {
      throw const FormatException('Tarifa por turno invalida.');
    }
    final activa = datos['activa'] == true;
    final reservable = activa && direccion.isNotEmpty && tarifa != null;
    final ahora = FieldValue.serverTimestamp();
    final privada = servicios.doc(negocio, 'canchas', id);
    final publica = servicios.db.doc('canchas_publicas/$id');
    final lote = servicios.db.batch();
    lote.set(privada, {
      'id': id,
      'sedeId': sedeId,
      'nombre': nombre,
      'direccion': direccion,
      'negocioId': negocio,
      'activa': activa,
      'tarifaTurnoCentimos': tarifa,
      // El horario vivia en la cancha. Ahora es del negocio, asi que se retira
      // de los documentos existentes en lugar de dejar dos fuentes de verdad.
      'tarifaCentimos': FieldValue.delete(),
      'aperturaMinuto': FieldValue.delete(),
      'cierreMinuto': FieldValue.delete(),
      'duracionTurnoMinutos': FieldValue.delete(),
      'actualizadoPor': servicios.uid,
      'actualizadoEn': ahora,
    }, SetOptions(merge: true));
    // La proyeccion publica marca `activa` con la definicion de reservable, no
    // con el switch del panel: así la web solo lista canchas que el servidor
    // efectivamente acepta.
    lote.set(publica, {
      'id': id,
      'negocioId': negocio,
      'nombre': nombre,
      'sedeId': sedeId,
      'direccion': direccion,
      'activa': reservable,
      'tarifaTurnoCentimos': tarifa,
      'actualizadoEn': ahora,
    });
    await lote.commit();
  });
}

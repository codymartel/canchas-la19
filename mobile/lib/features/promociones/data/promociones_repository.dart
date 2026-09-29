import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/data/servicios.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/domain/resultado.dart';

class PromocionesRepository {
  final Servicios servicios;
  final String negocio;
  PromocionesRepository(this.servicios, this.negocio);
  Stream<List<Registro>> observarTodas() => observar(
    servicios
        .coleccion(negocio, 'promociones')
        .orderBy('hasta', descending: true)
        .limit(100),
  );

  Future<Resultado<void>> guardar(Map<String, dynamic> datos) =>
      servicios.guardando(() async {
        final id = '${datos['id'] ?? ''}';
        if (!RegExp(r'^[A-Za-z0-9_-]{3,100}$').hasMatch(id)) {
          throw const FormatException('Identificador de promocion invalido.');
        }
        final titulo = '${datos['titulo'] ?? ''}'.trim();
        final descripcion = '${datos['descripcion'] ?? ''}'.trim();
        if (titulo.isEmpty || titulo.length > 120) {
          throw const FormatException('Titulo invalido.');
        }
        if (descripcion.isEmpty || descripcion.length > 1000) {
          throw const FormatException('Descripcion invalida.');
        }
        final desde = '${datos['desde']}';
        final hasta = '${datos['hasta']}';
        if (!esDiaValido(desde) ||
            !esDiaValido(hasta) ||
            desde.compareTo(hasta) > 0) {
          throw const FormatException('Vigencia invalida.');
        }
        final sedes = List<String>.from(datos['sedes'] as List? ?? const []);
        if (sedes.isEmpty || sedes.any((s) => !esSede(s))) {
          throw const FormatException('Selecciona al menos una sede valida.');
        }
        final descuento = datos['descuentoCentimos'] as int? ?? 0;
        if (descuento < 0 || descuento > 100000000) {
          throw const FormatException('Descuento invalido.');
        }
        final ahora = FieldValue.serverTimestamp();
        final privada = servicios.doc(negocio, 'promociones', id);
        final publica = servicios.db.doc('promociones_publicas/$id');
        final contenido = <String, Object?>{
          'titulo': titulo,
          'descripcion': descripcion,
          'sedes': sedes,
          'desde': desde,
          'hasta': hasta,
          'activa': datos['activa'] == true,
          'descuentoCentimos': descuento,
          'actualizadoEn': ahora,
        };
        final lote = servicios.db.batch();
        lote.set(privada, {
          ...contenido,
          'actualizadoPor': servicios.uid,
        }, SetOptions(merge: true));
        lote.set(publica, {'negocioId': negocio, ...contenido});
        await lote.commit();
      });
}

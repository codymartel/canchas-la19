import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/data/servicios.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/domain/resultado.dart';

class Pagina {
  final List<Registro> registros;
  final Object? cursor;
  final bool hayMas;
  const Pagina(this.registros, this.cursor, this.hayMas);
}

class ClientesRepository {
  final Servicios servicios;
  final String negocioId;
  ClientesRepository(this.servicios, this.negocioId);
  Future<Pagina> buscar(String busqueda, {Object? cursor}) async {
    Query<Map<String, dynamic>> q = servicios.coleccion(negocioId, 'clientes');
    if (RegExp(r'^[+\d\s()-]+$').hasMatch(busqueda) &&
        busqueda.trim().isNotEmpty) {
      q = q
          .where('telefono', isEqualTo: normalizarTelefono(busqueda))
          .orderBy('nombreBusqueda');
    } else {
      final texto = busqueda.trim().toLowerCase();
      q = q.orderBy('nombreBusqueda');
      if (texto.isNotEmpty) q = q.startAt([texto]).endAt(['$texto\uf8ff']);
    }
    if (cursor != null) {
      q = q.startAfterDocument(
        cursor as DocumentSnapshot<Map<String, dynamic>>,
      );
    }
    final snap = await q.limit(25).get();
    return Pagina(
      snap.docs.map(convertir).toList(),
      snap.docs.lastOrNull,
      snap.size == 25,
    );
  }

  Future<Pagina> historial(String clienteId, {Object? cursor}) async {
    Query<Map<String, dynamic>> q = servicios
        .coleccion(negocioId, 'reservas')
        .where('clienteId', isEqualTo: clienteId)
        .orderBy('inicio', descending: true);
    if (cursor != null) {
      q = q.startAfterDocument(
        cursor as DocumentSnapshot<Map<String, dynamic>>,
      );
    }
    final snap = await q.limit(25).get();
    return Pagina(
      snap.docs.map(convertir).toList(),
      snap.docs.lastOrNull,
      snap.size == 25,
    );
  }

  Future<Resultado<void>> guardar(
    Map<String, dynamic> datos,
  ) => servicios.guardando(() async {
    final nombre = '${datos['nombre'] ?? ''}'.trim();
    if (nombre.isEmpty || nombre.length > 120) {
      throw const FormatException('Nombre de cliente invalido.');
    }
    final telefono = normalizarTelefono('${datos['telefono']}');
    final existente = '${datos['id'] ?? ''}';
    final clienteId = existente.isNotEmpty
        ? existente
        : 'c_${telefono.replaceAll('+', '').hashCode.toUnsigned(32).toRadixString(16)}';
    await servicios.doc(negocioId, 'clientes', clienteId).set({
      'nombre': nombre,
      'nombreBusqueda': normalizarBusqueda(nombre),
      'telefono': telefono,
      'actualizadoPor': servicios.uid,
      'actualizadoEn': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  });
}

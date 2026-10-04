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

  Stream<List<Registro>> observarPrincipales() =>
      observar(servicios.coleccion(negocio, 'responsablesCanchas'));
  DocumentReference<Map<String, dynamic>> parametrosRef(
    String cancha,
    String dia,
  ) =>
      servicios.db.doc('negocios/$negocio/parametrosCanchas/$cancha/dias/$dia');
  Stream<Registro?> observarParametros(String cancha, String dia) =>
      parametrosRef(
        cancha,
        dia,
      ).collection('historial').orderBy('version').snapshots().map((snapshot) {
        if (snapshot.docs.isEmpty) return null;
        final horas = <String, dynamic>{};
        for (final evento in snapshot.docs) {
          final despues = evento.data()['despues'] as Map;
          final bloque = despues['bloque'] as Map;
          for (
            var m = bloque['desde'] as int;
            m < (bloque['hasta'] as int);
            m += 60
          ) {
            horas['$m'] = {
              'precioCentimos': bloque['precioCentimos'],
              'adelantoCentimos': bloque['adelantoCentimos'],
            };
          }
        }
        final ultimo = snapshot.docs.last.data();
        return Registro(dia, {
          'horas': horas,
          'plazoMinutos': (ultimo['despues'] as Map)['plazoMinutos'],
          'version': ultimo['version'],
        });
      });
  Future<Resultado<void>> guardarBloque({
    required String cancha,
    required String dia,
    required int desde,
    required int hasta,
    required int precio,
    required int adelanto,
    required int plazo,
    required int version,
  }) => servicios.guardando(() async {
    if (!esSede(cancha) ||
        !RegExp(r'^[0-9]{4}-[0-9]{2}-[0-9]{2}$').hasMatch(dia) ||
        desde < 420 ||
        hasta > 1500 ||
        desde >= hasta ||
        (desde - 420) % 60 != 0 ||
        (hasta - 420) % 60 != 0) {
      throw const FormatException(
        'Selecciona un bloque válido de 07:00 a 01:00.',
      );
    }
    if (precio <= 0 ||
        precio > 100000000 ||
        adelanto < 0 ||
        adelanto > precio ||
        plazo < 1 ||
        plazo > 120) {
      throw const FormatException(
        'Precio positivo, adelanto entre cero y precio, plazo de 1 a 120 minutos.',
      );
    }
    final ref = parametrosRef(cancha, dia);
    await servicios.db.runTransaction((tx) async {
      final actual = await tx.get(ref);
      final old = actual.data();
      if ((old?['version'] ?? 0) != version) {
        throw const FormatException(
          'Los parámetros cambiaron. Cierra y vuelve a abrir el bloque.',
        );
      }
      final bloque = {
        'desde': desde,
        'hasta': hasta,
        'precioCentimos': precio,
        'adelantoCentimos': adelanto,
      };
      final antes = {
        'bloque': old?['bloque'],
        'plazoMinutos': old?['plazoMinutos'],
      };
      final despues = {'bloque': bloque, 'plazoMinutos': plazo};
      final evento = ref.collection('historial').doc();
      tx.set(evento, {
        'version': version + 1,
        'antes': antes,
        'despues': despues,
        'actualizadoPor': servicios.uid,
        'actualizadoEn': FieldValue.serverTimestamp(),
      });
      tx.set(
        servicios.db.doc(
          'precios_publicos/$negocio/canchas/$cancha/dias/$dia/bloques/${evento.id}',
        ),
        {'bloque': bloque, 'plazoMinutos': plazo, 'version': version + 1},
      );
      tx.set(ref, {
        ...despues,
        'version': version + 1,
        'eventoId': evento.id,
        'actualizadoPor': servicios.uid,
        'actualizadoEn': FieldValue.serverTimestamp(),
      });
    });
  });

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
    if (direccion.length > 200) {
      throw const FormatException(
        'La direccion publica admite hasta 200 caracteres.',
      );
    }
    // La tarifa puede quedar vacia: se conserva pendiente en
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
    final reservable = activa;
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
      // Conserva los campos heredados; las reservas usan el horario del negocio.
      'actualizadoEn': ahora,
    }, SetOptions(merge: true));
    // La proyeccion publica respeta la habilitacion; no requiere precio ni direccion.
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

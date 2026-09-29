import 'package:cloud_firestore/cloud_firestore.dart';
import '../../../core/data/servicios.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/domain/resultado.dart';

class NegocioRepository {
  final Servicios servicios;
  final String negocio;
  NegocioRepository(this.servicios, [this.negocio = negocioId]);

  DocumentReference<Map<String, dynamic>> get raiz =>
      servicios.db.doc('negocios/$negocio');

  Future<DocumentSnapshot<Map<String, dynamic>>> leerRaiz() => raiz.get();

  Future<Map<String, dynamic>> leerCanchas() async {
    final snap = await servicios.coleccion(negocio, 'canchas').get();
    return {for (final d in snap.docs) d.id: d.data()};
  }

  /// Prepara el negocio una sola vez.
  ///
  /// Los identificadores son deterministas ([negocioId], `la-19`, `la-23`,
  /// `la-24`). Si `sistema/grass` no existe, un batch minimo registra el UID y
  /// el negocio. Ya reconocido como administrador, una transaccion prepara las
  /// canchas y completa solo los datos ausentes.
  Future<Resultado<void>> preparar({required String uid, String? email}) =>
      servicios.guardando(() async {
        // Las reglas leen email_verified del token: sin refrescarlo, la sesion
        // puede seguir mostrando el valor anterior a la verificacion.
        await servicios.auth.currentUser?.getIdToken(true);
        final sedeRefs = [
          for (final s in sedesIds) servicios.doc(negocio, 'sedes', s),
        ];
        final canchaRefs = [
          for (final s in sedesIds) servicios.doc(negocio, 'canchas', s),
        ];
        final usuarioRef = servicios.db.doc('users/$uid');
        final configuracionRef = servicios.db.doc(documentoConfiguracion);
        final configuracion = await configuracionRef.get();
        if (!configuracion.exists) {
          final batch = servicios.db.batch();
          final ahora = FieldValue.serverTimestamp();
          batch.set(configuracionRef, <String, Object?>{
            'administradorUid': uid,
            'negocioId': negocio,
            'zonaHoraria': 'America/Lima',
            'creadoEn': ahora,
          });
          final ficha = <String, Object?>{'negocioId': negocio};
          if (email != null) ficha['email'] = email;
          batch.set(usuarioRef, ficha, SetOptions(merge: true));
          await batch.commit();
        }
        await servicios.db.runTransaction((tx) async {
          final previa = await tx.get(raiz);
          final sedes = <DocumentSnapshot<Map<String, dynamic>>>[];
          final canchas = <DocumentSnapshot<Map<String, dynamic>>>[];
          for (final ref in sedeRefs) {
            sedes.add(await tx.get(ref));
          }
          for (final ref in canchaRefs) {
            canchas.add(await tx.get(ref));
          }
          final usuario = await tx.get(usuarioRef);
          final ahora = FieldValue.serverTimestamp();
          final negocioActual = previa.data();
          final escritura = <String, Object?>{
            if (negocioActual?['propietarioUid'] != uid) 'propietarioUid': uid,
            if (!previa.exists) 'nombreNegocio': 'Grass Sintetico',
            if (negocioActual?['preparado'] != true) ...{
              'preparado': true,
              'preparadoEn': ahora,
            },
            'zonaHoraria': 'America/Lima',
          };
          if (escritura.isNotEmpty) {
            tx.set(raiz, escritura, SetOptions(merge: true));
          }
          for (var i = 0; i < sedesIds.length; i++) {
            final faltaNombre = sedes[i].data()?['nombre'] == null;
            if (faltaNombre) {
              tx.set(sedeRefs[i], {
                'nombre': 'La ${sedesIds[i].substring(3)}',
              }, SetOptions(merge: true));
            }
          }
          for (var i = 0; i < sedesIds.length; i++) {
            final id = sedesIds[i];
            final actual = canchas[i].data();
            if (actual == null) {
              // Nacen cerradas y sin tarifa ni direccion: el horario y la
              // duracion del turno son del negocio, no de cada cancha.
              tx.set(canchaRefs[i], {
                'id': id,
                'sedeId': id,
                'nombre': 'La ${id.substring(3)}',
                'negocioId': negocio,
                'activa': false,
                'direccion': '',
                'tarifaTurnoCentimos': null,
              });
            } else if (actual['sedeId'] == null) {
              tx.set(canchaRefs[i], {'sedeId': id}, SetOptions(merge: true));
            }
          }
          if (usuario.data()?['negocioId'] == null) {
            final ficha = <String, Object?>{'negocioId': negocio};
            if (email != null) ficha['email'] = email;
            tx.set(usuarioRef, ficha, SetOptions(merge: true));
          }
        });
      });
}

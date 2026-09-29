import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../../core/data/servicios.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/domain/resultado.dart';
import '../domain/sesion.dart';

class AccesoRepository {
  final Servicios servicios;
  AccesoRepository(this.servicios);

  Future<Map<String, dynamic>?> leerConfiguracion() async {
    final snap = await servicios.db.doc(documentoConfiguracion).get();
    return snap.data();
  }

  Stream<Sesion> observar() {
    late StreamController<Sesion> salida;
    StreamSubscription<User?>? auth;
    StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? empleado;
    var revision = 0;
    salida = StreamController<Sesion>(
      onListen: () {
        auth = servicios.auth.userChanges().listen((user) async {
          final actual = ++revision;
          await empleado?.cancel();
          empleado = null;
          if (salida.isClosed || actual != revision) return;
          if (user == null) {
            salida.add(const Sesion.sinSesion());
            return;
          }
          try {
            final config = await leerConfiguracion();
            if (salida.isClosed || actual != revision) return;
            if (config == null || config['administradorUid'] is! String) {
              // Negocio sin fundar: el admin verificado pasa a "Vamos a
              // coordinar", que crea sistema/grass y las canchas en una sola
              // transaccion. Sin verificar, primero el correo.
              salida.add(
                user.emailVerified
                    ? Sesion.preparar(
                        uid: user.uid,
                        email: user.email,
                        negocioId: negocioId,
                      )
                    : Sesion.noVerificado(uid: user.uid, email: user.email),
              );
              return;
            }
            final negocio = '${config['negocioId'] ?? negocioId}';
            if (config['administradorUid'] == user.uid) {
              if (!user.emailVerified) {
                salida.add(
                  Sesion.noVerificado(uid: user.uid, email: user.email),
                );
                return;
              }
              final raiz = servicios.db.doc('negocios/$negocio');
              final preparado = await raiz.get();
              if (salida.isClosed || actual != revision) return;
              salida.add(
                preparado.data()?['preparado'] == true
                    ? Sesion(
                        EstadoSesion.vinculado,
                        uid: user.uid,
                        email: user.email,
                        negocioId: negocio,
                        nombre: 'Administrador',
                        administrador: true,
                        activo: true,
                      )
                    : Sesion.preparar(
                        uid: user.uid,
                        email: user.email,
                        negocioId: negocio,
                      ),
              );
              return;
            }
            empleado = servicios
                .coleccion(negocio, 'empleados')
                .doc(user.uid)
                .snapshots()
                .listen((doc) {
                  if (salida.isClosed || actual != revision) return;
                  final datos = doc.data();
                  if (!doc.exists) {
                    salida.add(
                      Sesion.noVinculado(uid: user.uid, email: user.email),
                    );
                    return;
                  }
                  salida.add(
                    datos?['activo'] == true
                        ? Sesion(
                            EstadoSesion.vinculado,
                            uid: user.uid,
                            email: user.email,
                            negocioId: negocio,
                            activo: true,
                            nombre:
                                '${datos?['nombre'] ?? user.email?.split('@').first ?? 'Personal'}',
                            permisos: Map<String, bool>.from(
                              datos?['permisos'] as Map? ?? const {},
                            ),
                          )
                        : Sesion.desactivado(uid: user.uid, email: user.email),
                  );
                }, onError: salida.addError);
          } catch (e, st) {
            if (!salida.isClosed && actual == revision) salida.addError(e, st);
          }
        }, onError: salida.addError);
      },
      onCancel: () async {
        revision++;
        await auth?.cancel();
        await empleado?.cancel();
      },
    );
    return salida.stream;
  }

  Future<Resultado<void>> ingresar(String email, String clave) =>
      servicios.guardando(() async {
        await servicios.auth.signInWithEmailAndPassword(
          email: email.trim(),
          password: clave,
        );
      });

  /// Vuelve a leer el estado real del usuario en Firebase Auth y, en cuanto el
  /// correo queda verificado, deja creada su ficha en `users/{uid}`.
  Future<Resultado<void>> comprobarVerificacion() =>
      servicios.guardando(() async {
        final user = servicios.auth.currentUser;
        if (user == null) return;
        await user.reload();
        // Obligatorio: las reglas leen email_verified del token, no del perfil.
        await user.getIdToken(true);
        if (!user.emailVerified) return;
        final ref = servicios.db.doc('users/${user.uid}');
        if ((await ref.get()).exists) return;
        await ref.set(<String, Object?>{
          'email': user.email,
          'verificadoEn': FieldValue.serverTimestamp(),
        });
      });

  Future<Resultado<void>> reenviarVerificacion() =>
      servicios.guardando(() async {
        await servicios.auth.currentUser?.sendEmailVerification();
      });

  Future<Resultado<void>> recuperar(String email) => servicios.guardando(
    () => servicios.auth.sendPasswordResetEmail(email: email.trim()),
  );

  Future<Resultado<void>> salir() =>
      servicios.guardando(() => servicios.auth.signOut());
}

import 'dart:async';

import 'package:flutter/foundation.dart';
import '../../../core/data/servicios.dart';
import '../../../core/domain/resultado.dart';
import '../data/acceso_repository.dart';
import '../domain/sesion.dart';

class AccesoProvider extends ChangeNotifier {
  final AccesoRepository repository;
  Sesion sesion = const Sesion.cargando();
  String? error;
  bool ocupado = false;
  String? mensaje;
  StreamSubscription<Sesion>? _sub;

  AccesoProvider(this.repository) {
    recargar();
  }

  void recargar() {
    _sub?.cancel();
    error = null;
    sesion = const Sesion.cargando();
    _sub = repository.observar().listen(
      (s) {
        sesion = s;
        error = null;
        notifyListeners();
      },
      onError: (Object e) {
        error = mensajeError(e);
        sesion = const Sesion.sinSesion();
        notifyListeners();
      },
    );
    notifyListeners();
  }

  Future<bool> _ejecutar(Future<Resultado<void>> Function() tarea) async {
    if (ocupado) return false;
    ocupado = true;
    error = null;
    mensaje = null;
    notifyListeners();
    try {
      final r = await tarea();
      if (r.esError) error = r.mensaje;
      return !r.esError;
    } finally {
      ocupado = false;
      notifyListeners();
    }
  }

  Future<bool> ingresar(String email, String clave) =>
      _ejecutar(() => repository.ingresar(email, clave));

  Future<bool> comprobarVerificacion() async {
    final ok = await _ejecutar(repository.comprobarVerificacion);
    if (ok) recargar();
    return ok;
  }

  Future<bool> reenviarVerificacion() async {
    final ok = await _ejecutar(repository.reenviarVerificacion);
    if (ok) {
      mensaje = 'Correo de verificacion enviado.';
      notifyListeners();
    }
    return ok;
  }

  Future<bool> recuperar(String email) async {
    final ok = await _ejecutar(() => repository.recuperar(email));
    if (ok) {
      mensaje = 'Si corresponde, recibiras un correo de recuperacion.';
      notifyListeners();
    }
    return ok;
  }

  Future<bool> salir() async {
    final ok = await _ejecutar(repository.salir);
    if (ok) recargar();
    return ok;
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}

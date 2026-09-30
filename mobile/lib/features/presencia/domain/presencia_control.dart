import 'package:flutter/foundation.dart';

import 'actividad.dart';

enum EstadoConexionPresencia { conectado, reconectando, sinConexion }

abstract interface class PresenciaControl implements Listenable {
  bool get conectado;
  EstadoConexionPresencia get estadoConexion;
  String? get error;
  List<Actividad> get actividades;
  void observar(String dia);
  Future<void> reconectar();
  Future<bool> publicar({
    required String sesionId,
    required String canchaId,
    required String dia,
    required int minuto,
    required String nombre,
    required String estado,
  });
  Future<void> limpiar(String sesionId);
}

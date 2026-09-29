import 'dart:async';

import 'package:flutter/foundation.dart';

import '../data/presencia_repository.dart';
import '../domain/actividad.dart';
import '../domain/presencia_control.dart';

class PresenciaProvider extends ChangeNotifier implements PresenciaControl {
  final PresenciaRepository repository;
  StreamSubscription<bool>? _conexion;
  StreamSubscription<List<Actividad>>? _actividades;
  Timer? _sinConexion;
  late final Timer _caducidad;
  String _dia = '';
  @override
  bool conectado = false;
  @override
  EstadoConexionPresencia estadoConexion = EstadoConexionPresencia.reconectando;
  @override
  String? error;
  @override
  List<Actividad> actividades = const [];

  PresenciaProvider(this.repository) {
    _caducidad = Timer.periodic(const Duration(seconds: 30), (_) {
      final vigentes = actividades.where((a) => a.vigente).toList();
      if (vigentes.length != actividades.length) {
        actividades = vigentes;
        notifyListeners();
      }
    });
    _conexion = repository.conexion.listen(
      (valor) {
        conectado = valor;
        _sinConexion?.cancel();
        if (valor) {
          estadoConexion = EstadoConexionPresencia.conectado;
        } else {
          estadoConexion = EstadoConexionPresencia.reconectando;
          _sinConexion = Timer(const Duration(seconds: 8), () {
            estadoConexion = EstadoConexionPresencia.sinConexion;
            notifyListeners();
          });
        }
        notifyListeners();
      },
      onError: (_) {
        conectado = false;
        estadoConexion = EstadoConexionPresencia.sinConexion;
        notifyListeners();
      },
    );
  }

  @override
  void observar(String dia) {
    if (_dia == dia) return;
    _dia = dia;
    _actividades?.cancel();
    actividades = const [];
    _actividades = repository
        .observarDia(dia)
        .listen(
          (lista) {
            actividades = lista;
            error = null;
            notifyListeners();
          },
          onError: (Object e) {
            error = 'No se pudo leer la actividad temporal.';
            conectado = false;
            estadoConexion = EstadoConexionPresencia.sinConexion;
            notifyListeners();
          },
        );
  }

  @override
  Future<bool> publicar({
    required String sesionId,
    required String canchaId,
    required String dia,
    required int minuto,
    required String nombre,
    required String estado,
  }) async {
    if (!conectado) {
      error =
          'Sin conexion confirmada. No se puede asegurar la disponibilidad.';
      notifyListeners();
      return false;
    }
    final resultado = await repository.publicar(
      sesionId: sesionId,
      canchaId: canchaId,
      dia: dia,
      minuto: minuto,
      nombre: nombre,
      estado: estado,
    );
    error = resultado.esError ? resultado.mensaje : null;
    if (resultado.esError) {
      conectado = false;
      estadoConexion = EstadoConexionPresencia.sinConexion;
    }
    notifyListeners();
    return !resultado.esError;
  }

  @override
  Future<void> limpiar(String sesionId) => repository.limpiar(sesionId);

  @override
  void dispose() {
    _sinConexion?.cancel();
    _caducidad.cancel();
    _conexion?.cancel();
    _actividades?.cancel();
    repository.dispose();
    super.dispose();
  }
}

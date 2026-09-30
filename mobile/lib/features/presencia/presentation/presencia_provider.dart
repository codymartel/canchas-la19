import 'dart:async';

import 'package:flutter/foundation.dart';
import '../../../core/data/servicios.dart';

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
  bool _transporte = false, _lecturaLista = false;
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
        _transporte = valor;
        conectado = valor && _lecturaLista;
        _sinConexion?.cancel();
        if (valor) {
          estadoConexion = conectado
              ? EstadoConexionPresencia.conectado
              : EstadoConexionPresencia.reconectando;
          if (_dia.isNotEmpty && error != null) _observar(_dia, forzar: true);
        } else {
          estadoConexion = EstadoConexionPresencia.reconectando;
          _sinConexion = Timer(const Duration(seconds: 8), () {
            estadoConexion = EstadoConexionPresencia.sinConexion;
            notifyListeners();
          });
        }
        notifyListeners();
      },
      onError: (Object e) {
        error = 'Coordinación en vivo: ${mensajeError(e)}';
        debugPrint('Error de conexión de presencia: $e');
        _transporte = false;
        conectado = false;
        estadoConexion = EstadoConexionPresencia.sinConexion;
        notifyListeners();
      },
    );
  }

  @override
  void observar(String dia) => _observar(dia);

  void _observar(String dia, {bool forzar = false}) {
    if (_dia == dia && !forzar) return;
    _lecturaLista = false;
    conectado = false;
    _dia = dia;
    _actividades?.cancel();
    actividades = const [];
    _actividades = repository
        .observarDia(dia)
        .listen(
          (lista) {
            actividades = lista;
            _lecturaLista = true;
            conectado = _transporte;
            estadoConexion = conectado
                ? EstadoConexionPresencia.conectado
                : EstadoConexionPresencia.reconectando;
            error = null;
            notifyListeners();
          },
          onError: (Object e) {
            error = 'Coordinación en vivo: ${mensajeError(e)}';
            debugPrint('Error de lectura de presencia: $e');
            _lecturaLista = false;
            conectado = false;
            estadoConexion = EstadoConexionPresencia.sinConexion;
            notifyListeners();
          },
        );
  }

  @override
  Future<void> reconectar() async {
    conectado = false;
    _lecturaLista = false;
    error = null;
    estadoConexion = EstadoConexionPresencia.reconectando;
    notifyListeners();
    try {
      await repository.reconectar().timeout(const Duration(seconds: 15));
      if (_dia.isNotEmpty) _observar(_dia, forzar: true);
    } catch (e) {
      error = 'Coordinación en vivo: ${mensajeError(e)}';
      estadoConexion = EstadoConexionPresencia.sinConexion;
      notifyListeners();
    }
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

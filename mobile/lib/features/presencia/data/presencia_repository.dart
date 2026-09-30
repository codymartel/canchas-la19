import 'dart:async';

import 'package:firebase_database/firebase_database.dart';

import '../../../core/data/servicios.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/domain/resultado.dart';
import '../domain/actividad.dart';

class PresenciaRepository {
  final Servicios servicios;
  final String negocio;
  final String _instanciaId = nuevaOperacion();
  final Map<String, _SesionPresencia> _sesiones = {};
  StreamSubscription<bool>? _conexion;
  late final Timer _renovacion;

  PresenciaRepository(this.servicios, this.negocio) {
    _conexion = conexion.listen((conectado) {
      if (conectado) _reanunciarTodo();
    });
    _renovacion = Timer.periodic(
      const Duration(minutes: 5),
      (_) => _reanunciarTodo(),
    );
  }

  Stream<bool> get conexion => servicios.realtime
      .ref('.info/connected')
      .onValue
      .map((event) => event.snapshot.value == true);

  Future<void> reconectar() async {
    await servicios.auth.currentUser?.getIdToken(true);
    await servicios.realtime.goOffline();
    await servicios.realtime.goOnline();
  }

  Stream<List<Actividad>> observarDia(String dia) {
    late StreamController<List<Actividad>> salida;
    final valores = <String, List<Actividad>>{
      for (final id in sedesIds) id: [],
    };
    final subs = <StreamSubscription<DatabaseEvent>>[];
    final recibidas = <String>{};

    List<Actividad> convertirValor(String cancha, Object? valor) {
      final resultado = <Actividad>[];
      final minutos = valor is Map ? valor : const {};
      for (final minutoEntry in minutos.entries) {
        final usuarios = minutoEntry.value is Map
            ? minutoEntry.value as Map
            : const {};
        for (final usuarioEntry in usuarios.entries) {
          final sesiones = usuarioEntry.value is Map
              ? usuarioEntry.value as Map
              : const {};
          for (final sesionEntry in sesiones.entries) {
            final datos = sesionEntry.value is Map
                ? sesionEntry.value as Map
                : const {};
            final actividad = Actividad(
              uid: '${datos['uid'] ?? usuarioEntry.key}',
              sesionId: '${datos['sesionId'] ?? sesionEntry.key}',
              canchaId: cancha,
              dia: '${datos['dia'] ?? dia}',
              minuto:
                  int.tryParse('${datos['minuto'] ?? minutoEntry.key}') ?? -1,
              nombre: '${datos['nombre'] ?? 'Personal'}',
              estado: '${datos['estado'] ?? 'preparando'}',
              expiraEn: (datos['expiraEn'] as num?)?.toInt() ?? 0,
            );
            if (actividad.vigente) resultado.add(actividad);
          }
        }
      }
      return resultado;
    }

    salida = StreamController<List<Actividad>>(
      onListen: () {
        for (final cancha in sedesIds) {
          final ref = servicios.realtime.ref('presencia/$negocio/$cancha/$dia');
          subs.add(
            ref.onValue.listen((event) {
              valores[cancha] = convertirValor(cancha, event.snapshot.value);
              recibidas.add(cancha);
              if (!salida.isClosed && recibidas.length == sedesIds.length) {
                salida.add(valores.values.expand((lista) => lista).toList());
              }
            }, onError: salida.addError),
          );
        }
      },
      onCancel: () async {
        for (final sub in subs) {
          await sub.cancel();
        }
      },
    );
    return salida.stream;
  }

  Future<Resultado<void>> publicar({
    required String sesionId,
    required String canchaId,
    required String dia,
    required int minuto,
    required String nombre,
    required String estado,
  }) => servicios.guardando(() async {
    if (!esSede(canchaId) ||
        !esDiaValido(dia) ||
        !esMinutoOperacionValido(minuto)) {
      throw const FormatException('Actividad temporal invalida.');
    }
    if (!['preparando', 'guardando'].contains(estado)) {
      throw const FormatException('Estado temporal invalido.');
    }
    await limpiar(sesionId);
    final uid = servicios.uid;
    if (uid.isEmpty) {
      throw const FormatException('La sesion ya no esta activa.');
    }
    final sesionRemota = '${_instanciaId}_$sesionId';
    final ref = servicios.realtime.ref(
      'presencia/$negocio/$canchaId/$dia/$minuto/$uid/$sesionRemota',
    );
    final sesion = _SesionPresencia(ref, {
      'uid': uid,
      'sesionId': sesionRemota,
      'canchaId': canchaId,
      'dia': dia,
      'minuto': '$minuto',
      'nombre': nombrePresencia(nombre),
      'estado': estado,
    });
    _sesiones[sesionId] = sesion;
    try {
      await _anunciar(sesion);
    } catch (_) {
      _sesiones.remove(sesionId);
      rethrow;
    }
  });

  Future<void> _anunciar(_SesionPresencia sesion) async {
    if (!sesion.activa) return;
    // El servidor conoce primero la limpieza por desconexion y solo despues
    // recibe el anuncio visible para las demas pestañas.
    await sesion.ref.onDisconnect().remove();
    if (!sesion.activa) return;
    await sesion.ref.set({
      ...sesion.datos,
      'actualizadoEn': ServerValue.timestamp,
      'expiraEn': DateTime.now().millisecondsSinceEpoch + 14 * 60 * 1000,
    });
    if (!sesion.activa) await sesion.ref.remove();
  }

  Future<void> _reanunciarTodo() async {
    for (final sesion in _sesiones.values.toList()) {
      if (!_sesiones.containsValue(sesion)) continue;
      try {
        await _anunciar(sesion);
      } catch (_) {
        // Firebase volvera a notificar la conexion; el formulario sigue abierto.
      }
    }
  }

  Future<void> limpiar(String sesionId) async {
    final sesion = _sesiones.remove(sesionId);
    if (sesion == null) return;
    sesion.activa = false;
    await sesion.ref.remove();
    await sesion.ref.onDisconnect().cancel();
  }

  Future<void> limpiarTodo() async {
    for (final id in _sesiones.keys.toList()) {
      await limpiar(id);
    }
  }

  void dispose() {
    _conexion?.cancel();
    _renovacion.cancel();
    limpiarTodo();
  }
}

class _SesionPresencia {
  final DatabaseReference ref;
  final Map<String, Object?> datos;
  bool activa = true;
  _SesionPresencia(this.ref, this.datos);
}

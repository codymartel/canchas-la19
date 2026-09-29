import 'package:flutter/foundation.dart';
import '../data/servicios.dart';
import '../domain/resultado.dart';

class Operacion extends ChangeNotifier {
  bool ocupado = false;
  String? error;
  bool _cerrado = false;
  void notificar() {
    if (!_cerrado) notifyListeners();
  }

  Future<bool> realizar(Future<void> Function() tarea) => _enviar(() async {
    await tarea();
    return const Ok(null);
  });

  /// Para repositorios que ya traducen los errores a [Resultado]: el mensaje
  /// llega a `error` sin lanzar excepciones desde la capa de datos.
  Future<bool> conResultado<T>(Future<Resultado<T>> Function() tarea) =>
      _enviar(tarea);

  Future<bool> _enviar<T>(Future<Resultado<T>> Function() tarea) async {
    if (ocupado) return false;
    ocupado = true;
    error = null;
    notificar();
    try {
      final r = await tarea();
      if (r.esError) error = r.mensaje;
      return !r.esError;
    } catch (e, st) {
      debugPrint('Operación fallida: $e\n$st');
      error = mensajeError(e);
      return false;
    } finally {
      ocupado = false;
      notificar();
    }
  }

  @override
  void dispose() {
    _cerrado = true;
    super.dispose();
  }
}

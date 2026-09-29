import '../../../core/domain/formatos.dart';
import '../../../core/domain/resultado.dart';
import '../data/reservas_repository.dart';

class GestionarReserva {
  final ReservasRepository repository;
  GestionarReserva(this.repository);
  Future<Resultado<void>> registrar(Map<String, dynamic> datos) {
    if (datos['bloqueo'] != true) {
      datos = {
        ...datos,
        'telefono': normalizarTelefono(datos['telefono'] as String),
      };
    }
    return repository.registrar(datos);
  }
}

import '../../../core/presentation/operacion.dart';
import '../../../core/domain/formatos.dart';
import '../data/promociones_repository.dart';

class PromocionesProvider extends Operacion {
  final PromocionesRepository repository;
  Stream<List<Registro>> get promociones => repository.observarTodas();
  PromocionesProvider(this.repository);
  Future<bool> guardar(Map<String, dynamic> datos) =>
      conResultado(() => repository.guardar(datos));
}

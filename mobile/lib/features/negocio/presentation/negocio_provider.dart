import '../../../core/presentation/operacion.dart';
import '../data/negocio_repository.dart';

class NegocioProvider extends Operacion {
  final NegocioRepository repository;
  NegocioProvider(this.repository);
  Future<bool> preparar({required String uid, String? email}) =>
      conResultado(() => repository.preparar(uid: uid, email: email));
}

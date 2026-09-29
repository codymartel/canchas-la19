import '../../../core/presentation/operacion.dart';
import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../data/sedes_repository.dart';

class SedesProvider extends Operacion {
  final SedesRepository repository;
  Stream<List<Registro>> get canchas => repository.observarCanchas();

  /// Horario y duracion base del turno, comunes a las tres canchas.
  Stream<HorarioNegocio?> get horario => repository.observarHorario();
  SedesProvider(this.repository);
  Future<bool> guardar(Map<String, dynamic> datos) =>
      conResultado(() => repository.guardar(datos));
}

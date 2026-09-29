import '../../../core/domain/formatos.dart';
import '../../../core/domain/negocio.dart';
import '../../../core/presentation/operacion.dart';
import '../data/configuracion_repository.dart';

class ConfiguracionProvider extends Operacion {
  final ConfiguracionRepository repository;
  ConfiguracionProvider(this.repository);

  Stream<Registro?> get configuracion => repository.observar();

  /// Horario comun a las tres canchas, leido del documento privado.
  Stream<HorarioNegocio?> get horario => repository.observarHorario();

  Future<bool> guardar(Map<String, dynamic> datos) => conResultado(
    () => repository.guardar(
      nombre: '${datos['nombre'] ?? ''}',
      slug: '${datos['slug'] ?? ''}',
      descripcion: '${datos['descripcion'] ?? ''}',
      telefonoPublico: '${datos['telefonoPublico'] ?? ''}',
      whatsapp: '${datos['whatsapp'] ?? ''}',
      aperturaMinuto: datos['aperturaMinuto'] as int? ?? 360,
      cierreMinuto: datos['cierreMinuto'] as int? ?? 1440,
      duracionTurnoMinutos: datos['duracionTurnoMinutos'] as int? ?? 60,
    ),
  );
}

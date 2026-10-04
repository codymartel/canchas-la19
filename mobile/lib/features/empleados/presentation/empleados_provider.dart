import '../../../core/domain/formatos.dart';
import '../../../core/presentation/operacion.dart';
import '../data/empleados_repository.dart';

class EmpleadosProvider extends Operacion {
  final EmpleadosRepository repository;
  late final Stream<List<Registro>> empleados = repository.empleados();
  String? aviso;
  AltaEmpleado? creado;
  EmpleadosProvider(this.repository);

  late final Stream<List<Registro>> responsables = repository.responsables();
  Future<bool> asignarPrincipal(String cancha, String uid) =>
      conResultado(() => repository.asignarPrincipal(cancha, uid));

  Future<bool> guardar(Map<String, dynamic> datos) =>
      conResultado(() => repository.guardar(datos));

  /// Alta completa: cuenta en Auth (instancia secundaria) y luego documento de
  /// empleado. Si el documento es rechazado por las reglas, la cuenta queda
  /// creada pero sin vinculo, y el alta se reporta como fallida.
  Future<bool> crearEmpleado({
    required String nombre,
    required String email,
    required String clave,
    required Map<String, bool> permisos,
    required List<String> sedes,
    required String sedePrincipal,
    required bool activo,
  }) async {
    if (ocupado) return false;
    ocupado = true;
    error = null;
    aviso = null;
    creado = null;
    notificar();
    try {
      final cuenta = await repository.crearCuenta(email: email, clave: clave);
      if (cuenta.esError) {
        error = cuenta.mensaje;
        return false;
      }
      final alta = cuenta.valor!;
      final registro = await repository.registrarEmpleado(
        uid: alta.uid,
        nombre: nombre,
        email: alta.email,
        permisos: permisos,
        sedes: sedes,
        sedePrincipal: sedePrincipal,
        activo: activo,
      );
      if (registro.esError) {
        error =
            '${registro.mensaje} La cuenta ${alta.email} quedo creada pero '
            'sin vinculo: el administrador debe reintentar el alta.';
        return false;
      }
      creado = AltaEmpleado(uid: alta.uid, email: alta.email, nombre: nombre);
      aviso = activo
          ? 'Cuenta creada y activa. El empleado ya puede iniciar sesion.'
          : 'Cuenta creada e inactiva. Activala cuando tenga todo listo.';
      return true;
    } finally {
      ocupado = false;
      notificar();
    }
  }
}

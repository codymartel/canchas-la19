enum EstadoSesion {
  cargando,
  sinSesion,
  noVerificado,
  sinConfiguracion,
  preparar,
  vinculado,
  desactivado,
  noVinculado,
}

class Sesion {
  final EstadoSesion estado;
  final String? uid, email, negocioId, nombre;
  final bool administrador, activo;
  final Map<String, bool> permisos;
  const Sesion(
    this.estado, {
    this.uid,
    this.email,
    this.negocioId,
    this.nombre,
    this.administrador = false,
    this.activo = false,
    this.permisos = const {},
  });

  const Sesion.cargando() : this(EstadoSesion.cargando);
  const Sesion.sinSesion() : this(EstadoSesion.sinSesion);
  const Sesion.noVerificado({String? uid, String? email})
    : this(EstadoSesion.noVerificado, uid: uid, email: email);
  const Sesion.sinConfiguracion() : this(EstadoSesion.sinConfiguracion);
  const Sesion.preparar({
    required String uid,
    String? email,
    required String negocioId,
  }) : this(
         EstadoSesion.preparar,
         uid: uid,
         email: email,
         negocioId: negocioId,
         administrador: true,
         activo: true,
       );
  const Sesion.noVinculado({String? uid, String? email})
    : this(EstadoSesion.noVinculado, uid: uid, email: email);
  const Sesion.desactivado({String? uid, String? email})
    : this(EstadoSesion.desactivado, uid: uid, email: email);

  bool get enPanel =>
      estado == EstadoSesion.vinculado && uid != null && negocioId != null;
  bool get esAdministrador => administrador && enPanel;
  bool permite(String permiso) =>
      enPanel && activo && (administrador || permisos[permiso] == true);
}

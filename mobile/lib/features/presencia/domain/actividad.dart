class Actividad {
  final String uid, sesionId, canchaId, dia, nombre, estado;
  final int minuto, expiraEn;

  const Actividad({
    required this.uid,
    required this.sesionId,
    required this.canchaId,
    required this.dia,
    required this.minuto,
    required this.nombre,
    required this.estado,
    required this.expiraEn,
  });

  bool get vigente => expiraEn > DateTime.now().millisecondsSinceEpoch;
}

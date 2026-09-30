import '../../../core/domain/formatos.dart';

class Reserva extends Registro {
  final bool bloqueo;
  const Reserva(super.id, super.datos, {this.bloqueo = false});
  int get monto => entero('montoCentimos');
  int get adelanto => entero('adelantoCentimos');
  int get saldo => monto - adelanto;
  int get adelantoInicial {
    final movimientos = (datos['historialPagos'] as List? ?? const []).where(
      (e) =>
          e is Map && e['importeCentimos'] is int && e['importeCentimos'] > 0,
    );
    if (movimientos.isEmpty) return adelanto;
    final primero = movimientos.first['importeCentimos'] as int;
    return primero < monto ? primero : 0;
  }

  String get estado => texto('estado');
  bool get ocupa => ['confirmada', 'no_asistio'].contains(estado);
  int minutoEnDia(String dia) => entero('minuto');
}

class ResumenDia {
  final int contratado, recibido, pendiente, retenidoCancelaciones;
  const ResumenDia(
    this.contratado,
    this.recibido,
    this.pendiente,
    this.retenidoCancelaciones,
  );
  factory ResumenDia.de(List<Reserva> reservas) {
    var contratado = 0, recibido = 0, pendiente = 0, cancelado = 0;
    for (final r in reservas.where((r) => !r.bloqueo)) {
      if (r.estado == 'cancelada') {
        cancelado += r.adelanto;
        continue;
      }
      contratado += r.monto;
      recibido += r.adelanto;
      pendiente += r.saldo;
    }
    return ResumenDia(contratado, recibido, pendiente, cancelado);
  }
}

import '../../../core/domain/formatos.dart';

class Reserva extends Registro {
  final bool bloqueo;
  const Reserva(super.id, super.datos, {this.bloqueo = false});
  int get monto => entero('montoCentimos');
  int get adelanto => entero('adelantoCentimos');
  int get saldo => monto - adelanto;
  String get estado => texto('estado');
  bool get ocupa => estado != 'cancelada';
  int minutoEnDia(String dia) {
    final partes = dia.split('-');
    if (partes.length != 3) return entero('minuto');
    final slots = datos['slots'] as List? ?? const [];
    for (final valor in slots) {
      final slot = valor as Map? ?? const {};
      if ('${slot['year']}'.padLeft(4, '0') == partes[0] &&
          '${slot['month']}'.padLeft(2, '0') == partes[1] &&
          '${slot['day']}'.padLeft(2, '0') == partes[2]) {
        return int.tryParse('${slot['minute']}') ?? entero('minuto');
      }
    }
    return entero('minuto');
  }
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

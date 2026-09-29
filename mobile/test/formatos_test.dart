import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/domain/formatos.dart';
import 'package:mobile/features/reservas/domain/reserva.dart';

void main() {
  test('céntimos sin error de coma flotante', () {
    expect(centimos('0.29'), 29);
    expect(centimos('19,95'), 1995);
    for (final valor in ['NaN', '-1', '1.999', '1e2']) {
      expect(() => centimos(valor), throwsFormatException);
    }
  });
  test('fecha de Lima independiente de la zona del dispositivo', () {
    expect(fechaLima(DateTime.parse('2026-09-26T04:59:59Z')), '2026-09-25');
    expect(fechaLima(DateTime.parse('2026-09-26T05:00:00Z')), '2026-09-26');
  });
  test('normalización de teléfono', () {
    expect(normalizarTelefono('999 888 777'), '+51999888777');
    expect(normalizarTelefono('+51 (999) 888-777'), '+51999888777');
  });
  test('planilla separa reservas canceladas de importe vigente', () {
    final resumen = ResumenDia.de([
      const Reserva('1', {
        'estado': 'confirmada',
        'montoCentimos': 10000,
        'adelantoCentimos': 2500,
      }),
      const Reserva('2', {
        'estado': 'cancelada',
        'montoCentimos': 10000,
        'adelantoCentimos': 1000,
      }),
      const Reserva('3', {
        'estado': 'confirmada',
        'montoCentimos': 99999,
      }, bloqueo: true),
    ]);
    expect(resumen.contratado, 10000);
    expect(resumen.recibido, 2500);
    expect(resumen.pendiente, 7500);
    expect(resumen.retenidoCancelaciones, 1000);
  });
}

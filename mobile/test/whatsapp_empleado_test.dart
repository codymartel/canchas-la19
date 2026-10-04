import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/empleados/data/empleados_repository.dart';

void main() {
  test('WhatsApp empleado: vacío compatible y normalización internacional', () {
    expect(normalizarWhatsappEmpleado(''), '');
    expect(normalizarWhatsappEmpleado('900 000 000'), '+51900000000');
    expect(normalizarWhatsappEmpleado('+51 (900) 000-000'), '+51900000000');
    expect(normalizarWhatsappEmpleado('51900000000'), '+51900000000');
    expect(normalizarWhatsappEmpleado('+1 202 555 0100'), '+12025550100');
    for (final valor in [
      '123',
      'abc',
      '+00 123456789',
      '+519000000000000000',
    ]) {
      expect(() => normalizarWhatsappEmpleado(valor), throwsFormatException);
    }
  });
}

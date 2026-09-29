import 'dart:io';

import 'package:integration_test/integration_test_driver_extended.dart';

Future<void> main() async {
  final destino = Directory(
    Platform.environment['CAPTURAS_DIR'] ??
        'test/features/navegador/capturas',
  );
  if (!destino.existsSync()) destino.createSync(recursive: true);
  var numero = 0;
  await integrationDriver(
    onScreenshot:
        (String nombre, List<int> bytes, [Map<String, Object?>? args]) async {
          final archivo = File('${destino.path}/$nombre.png');
          await archivo.writeAsBytes(bytes);
          stdout.writeln('captura ${archivo.path} (${bytes.length} bytes)');
          numero++;
          return true;
        },
  );
  stdout.writeln('capturas escritas: $numero');
}

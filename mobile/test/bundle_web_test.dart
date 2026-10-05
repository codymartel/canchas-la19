@Tags(['bundle'])
library;

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// El fallo que esta prueba evita: una compilacion `flutter build web --release`
/// puede perder la implementacion web de Realtime Database durante el tree
/// shaking de dart2js. El bundle arranca, la agenda de Firestore se ve y el
/// login funciona; solo falla al leer presencia, con MissingPluginException en
/// `Query#observe`, porque el paquete cae a su canal de metodo por defecto.
///
/// `flutter test` corre en la VM, donde el plugin real esta presente, asi que
/// las demas pruebas pasan aunque el shim de JavaScript no se haya compilado.
/// Esta prueba mira el bundle de verdad.
///
/// Etiqueta `bundle` a proposito: si todavia no compilaste, ejecuta
/// `flutter test --exclude-tags=bundle` para correr solo las unitarias.
void main() {
  const bundle = 'build/web/main.dart.js';

  test('el bundle web incluye la implementacion web de Realtime Database', () {
    final archivo = File(bundle);
    expect(
      archivo.existsSync(),
      isTrue,
      reason:
          'No existe $bundle. Compila antes de probar:\n'
          '  flutter build web --release\n'
          'O corre solo las unitarias con: flutter test --exclude-tags=bundle',
    );

    final texto = archivo.readAsStringSync();
    final binding = const _Binding(
      '.firebase_database',
      'sin ella la presencia en Realtime Database deja de funcionar y el panel '
      'muestra Sin conexion',
    );
    expect(
      texto.contains(binding.nombre),
      isTrue,
      reason:
          'El bundle no enlaza la libreria de interoperabilidad '
          '${binding.nombre}. ${binding.paraQue} se perdio en el tree shaking '
          'de dart2js, y la presencia en RTDB dejara de funcionar en el panel.',
    );
  });

  test('el bundle web incluye las implementaciones de los demas plugins', () {
    final texto = File(bundle).readAsStringSync();
    for (final binding in const [
      _Binding('.firebase_core', 'sin ella no arranca Firebase'),
      _Binding('.firebase_auth', 'sin ella no hay inicio de sesion'),
      _Binding('.firebase_firestore', 'sin ella no se ve la agenda'),
    ]) {
      expect(
        texto.contains(binding.nombre),
        isTrue,
        reason: 'El bundle no enlaza ${binding.nombre}: ${binding.paraQue}.',
      );
    }
  });

  test('el bundle de release no apunta a los emuladores', () {
    final texto = File(bundle).readAsStringSync();
    expect(
      texto.contains('demo-grass-local'),
      isFalse,
      reason:
          'Aparece demo-grass-local en un bundle de release. Compila sin '
          'EMULATOR_HOST definido.',
    );
    expect(
      texto.contains('demo-key'),
      isFalse,
      reason: 'Aparece la clave de emulador demo-key en un bundle de release.',
    );
    expect(
      texto.contains('glass-sintetico-default-rtdb'),
      isTrue,
      reason: 'El bundle debe apuntar a la base de datos de produccion.',
    );
  });

  test('el bundle declara el arranque sin service worker PWA', () {
    final indice = File('build/web/index.html');
    if (!indice.existsSync()) {
      markTestSkipped('No existe build/web/index.html todavia.');
      return;
    }
    final html = indice.readAsStringSync();
    expect(
      html.contains('flutter_service_worker.js'),
      isFalse,
      reason:
          'El panel se publico con estrategia PWA none. Si el service '
          'worker vuelve a activarse puede servir un bundle antiguo.',
    );
  });
}

class _Binding {
  final String nombre;
  final String paraQue;
  const _Binding(this.nombre, this.paraQue);
}

# Version sana 1.0: el panel vuelve a conectar en vivo

Fecha: 2026-10-05
Alcance: solo `hosting:personal` (el panel). No se tocaron reglas, Realtime Database, web pública ni datos.

## Síntoma

El panel mostraba "Sin conexión" en rojo y se recusaba a guardar, aunque la agenda sí se veía. En la consola del navegador:

```
main.dart.js:30068 Error de conexión de presencia: MissingPluginException(No implementation
found for method Query#observe on channel plugins.flutter.io/firebase_database)
main.dart.js:30068 Error de lectura de presencia: MissingPluginException(...)
```

## Descartado antes de investigar

- Las dependencias están alineadas: `firebase_database 11.3.10` con `firebase_database_web 0.2.6+16`, que es lo que el propio paquete declara.
- El registrante local sí registraba el plugin: `FirebaseDatabaseWeb.registerWith(registrar)`.
- La autenticación funciona: `glass-sintetico.web.app` está en `authorizedDomains`.
- La instancia de RTDB existe: responde 401 sin token, no 404.
- La ACL de RTDB está vigente: `/acceso/grass-sintetico` tiene dos cuentas con `activo: true` y rol válido.
- No es caché. El `flutter_service_worker.js` desplegado es un shim que se desregistra en `activate` y no precachea nada, así que la única capa de caché se neutraliza. Descargando `main.dart.js` con un parámetro único e irrepetible, la respuesta del servidor ya venía sin el plugin.
- No es un problema de reglas: `presencia` en RTDB tiene reglas que permiten leer a esas cuentas, y `firestore.rules` nunca se vio afectado.

## Causa raíz

Una compilación `flutter build web --release` concreta perdió la implementación web de Realtime Database durante el tree shaking de dart2js. El bundle salió con el programa de Firestore pero sin el de RTDB.

Al no estar registrado el plugin, el paquete `firebase_database` cae a su implementación por defecto, que habla por el canal de método antiguo `plugins.flutter.io/firebase_database`. Nadie responde a `Query#observe` y sale `MissingPluginException`.

`presencia_provider.dart` convierte cualquier error de lectura en `EstadoConexionPresencia.sinConexion` (línea 94), y por eso la agenda se veía pero el panel se declaraba sin conexión: Firestore funcionaba, RTDB no.

Marcadores que lo delatan, buscados en el bundle publicado:

| Marcador | Bundle roto | Bundle sano |
| --- | --- | --- |
| `getDatabase` | ausente | presente |
| `onChildAdded` | ausente | presente |
| `onDisconnect` | ausente | presente |
| `getFirestore` | presente | presente |

De los cuatro builds que había en `.dart_tool/flutter_build`, tres incluían el plugin y solo uno lo perdió. Fue un fallo puntual de esa compilación, no un defecto del código: `flutter run -d chrome` funcionaba porque DDC recompila desde el fuente y genera el registrant al vuelo.

`.last_build_id` no sirve para distinguir builds: el nuevo volvió a dar `cd71e811930b9f22d4fca240142a7291`, el mismo id del roto, porque deriva de la configuración y no del contenido. La comparación válida es el SHA256 y los marcadores.

## Reparación

```
flutter clean          # borra build/ y .dart_tool/, incluidos 4 builds cacheados
flutter pub get
flutter build web --release
```

Antes de publicar se comprobó que el bundle contenía el plugin. Solo después:

```
firebase deploy --project glass-sintetico --only hosting:personal
```

## Verificación

- `flutter analyze`: sin incidencias.
- `flutter test`: 52 de 52.
- Bundle servido en producción idéntico al local, descargado con cache-buster:
  `211C4069E7B840A0B7DE3BBFCF134FFADBD9B2512375D002745D1D404E4C1A46`
- Bundle roto que estaba desplegado: `83AFFC17FC6DAD6DFB5BBDB74E538FAEC139CD82A0931ACD882C93BDC48F97CE`
- Web pública sin cambios: `reservasProduccionHabilitadas = false` y `acceso.js` sin rastro del piloto.

## Lo que esta versión no cubre

El bundle no vive en Git: `mobile/.gitignore` excluye `/build/`. El artefacto desplegado se reproduce con los tres comandos de arriba, pero no queda guardado en el repositorio. Conviene conservar una copia del bundle por versión en un almacén externo, porque un build roto en Git es indescifrable.

Tampoco hay ninguna prueba que detecte este fallo. `flutter test` corre en la VM, donde el plugin real está presente, así que las 52 pruebas pasan aunque el shim de JavaScript no se compile. Falta una comprobación que verifique que el bundle web incluye los plugins web.
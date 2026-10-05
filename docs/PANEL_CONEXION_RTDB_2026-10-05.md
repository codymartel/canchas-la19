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

## Guardia añadida: `mobile/test/bundle_web_test.dart`

Cuatro pruebas que miran el artefacto compilado, no el código Dart. Marcadas con la etiqueta `bundle` para poder saltarlas sin compilar.

1. El bundle enlaza `.firebase_database`. Es el discriminante que faltaba: el bundle sano lo tiene 11 veces y el roto 0. El enlace es literally la llamada de interoperabilidad con JavaScript:
   ```js
   r = v.G.firebase_database;  // libreria de interoperabilidad
   s = r.getDatabase(p.a, s);  // llamada al SDK
   ```
2. Enlaza `.firebase_core`, `.firebase_auth` y `.firebase_firestore`.
3. Un bundle de release no menciona `demo-grass-local` ni `demo-key`, y sí menciona `glass-sintetico-default-rtdb`.
4. `index.html` no referencia `flutter_service_worker.js`, para que la estrategia PWA none no se pierda por descuido.

Comprobado que la guardia sirve: sustituyendo el bundle sano por el roto, la prueba 1 falla con

```
Expected: true
Actual: <false>
El bundle no enlaza la libreria de interoperabilidad .firebase_database...
```

y las otras tres siguen pasando, porque el bundle roto solo perdió RTDB.

Con el bundle sano en su sitio, la suite completa da 56 de 56. Para correr solo las unitarias sin compilar antes:

```
flutter test --exclude-tags=bundle
```

Antes de publicar el panel, la comprobacion es:

```
flutter build web --release
flutter test
firebase deploy --project glass-sintetico --only hosting:personal
```

## Copia del bundle por version, fuera de Git: `tools/guardar-bundle.mjs`

El bundle no cabe en Git y `flutter clean` borra `mobile/build/`, así que un artefacto roto se vuelve irrecuperable: habría que recompilar y confiar. El script guarda una copia por versión en `bundles/`, carpeta ignorada por `.gitignore` siguiendo el precedente de `.production-audit/`.

```
node tools/guardar-bundle.mjs              guarda mobile/build/web
node tools/guardar-bundle.mjs --verificar  compara lo guardado con lo actual
node tools/guardar-bundle.mjs --forzar     reemplaza la copia existente
```

Cada copia va en `bundles/<commit>/` e incluye un `MANIFIESTO.json` con el commit completo, la etiqueta si el HEAD está etiquetado, la fecha, el tamaño y el SHA-256 de cada archivo, más un `resumen` que es el SHA-256 de la lista de hashes: cambia si cambia un solo byte de cualquier archivo.

El destino lo decide el commit, así que guardar dos veces el mismo commit no pisa nada sin `--forzar`.

El script repite el discriminante `.firebase_database` antes de copiar. Comprobado: con el bundle roto se niega a guardar con exit 1, de modo que no depende de que alguien recuerde correr `flutter test` antes.

La primera copia, `bundles/a8c5973` de la etiqueta `version-sana-1.1`:

| | |
| --- | --- |
| Archivos | 38 |
| Peso | 40,97 MB, de los cuales 36,69 MB son `canvaskit/` |
| `main.dart.js` | 3.026.383 bytes, `211c4069e7b840a0b7de3bbfcf134ffadbd9b2512375d002745d1d404e4c1a46` |
| `resumen` | `7d219f66fdbcd7c765e9500d8ebe33f9a363aa1effdfb80f9bc03c1b88b9c3f3` |

Son casi 41 MB por versión porque se guarda completo, incluido `canvaskit/`. Guardarlo sin ese directorio reduciría a 4 MB, pero la copia dejaría de ser desplegable, así que se conserva entero.

Como segunda red existe la retención de versiones de Firebase Hosting, que ya conserva cada publicación y se puede recuperar con `firebase hosting:clone`. No se ha aprovechado porque el CLI no expone el identificador de versión y habría que leerlo en la consola a mano.

La secuencia completa para una versión nueva:

```
flutter build web --release
flutter test
node tools/guardar-bundle.mjs
firebase deploy --project glass-sintetico --only hosting:personal
git tag -a version-sana-1.2 -m "..."
```

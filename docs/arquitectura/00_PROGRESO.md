# Progreso — Análisis de Arquitectura

Proyecto: **Grass Sintético** (reserva de canchas)
Raíz del repositorio git: `reservas_cancha/canchas-cliente/` (repo git confirmado, ver sección 5)
Firebase projectId: `glass-sintetico` (producción) y `demo-grass-local` (emuladores)

---

## FASE ACTUAL: 1 — Visión global (COMPLETADA) → siguiente: Fase 2, Tanda 1

---

## 1. Árbol de carpetas (profundidad 3-4, sin node_modules/.git/build)

```
canchas-cliente/
  .git/                            REPO GIT. Top-level = esta carpeta (ver sección 5)
  .firebaserc                      [259 B]   targets de hosting (publica/personal)
  .gitignore                       [137 B]
  firebase.json                    raíz: reglas + emuladores, SIN hosting (Paso 3)
  firebase.publica.json            raíz: solo hosting:publica → web/public (Paso 3)
  firebase.personal.json           raíz: solo hosting:personal → mobile/build/web (Paso 3)
  database-debug.log
  firestore-debug.log              [437 KB]  logs en raíz, IGNORADOS por .gitignore:2 (*.log)

  docs/                            8 archivos .md, 684 líneas (7 trackeados + 1 untracked)
    ARQUITECTURA_SPARK.md          229 líneas  (confirmado por el dueño: describe el ESTADO ACTUAL)
    ESTADO_CODEX_2026-09-30.md     142 líneas  (untracked)
    VALIDACION_PRODUCCION_...md    112 líneas
    CORRECCION_HORAS_...md         54 líneas
    PLANILLAS_EFECTIVO_...md       48 líneas
    CORRECCION_PANEL_...md         38 líneas
    SELECCION_HORAS_...md          32 líneas
    SELECTOR_UNIFICADO_...md       29 líneas
    arquitectura/                  documentación de este análisis (creada en Fase 0)
  functions/                       SIN CÓDIGO, por decisión del dueño (plan Spark, sin Cloud Functions)
    src/  test/  scripts/          carpetas vacías
    firestore-debug.log            ignorado
    node_modules/                  207 paquetes, 16 074 archivos (resto huérfano, ignorado)
    NO existe package.json ni package-lock.json
                                   0 archivos trackeados en todo el historial git

  mobile/                          Flutter (panel interno del negocio) + reglas de seguridad
    pubspec.yaml  pubspec.lock  analysis_options.yaml  firebase.json  README.md
    firebase_options.dart          dentro de lib/
    firestore.rules                [740 líneas, 35 KB]
    database.rules.json            [46 líneas]
    firestore.indexes.json
    lib/                           44 archivos Dart / 5 439 líneas
    test/                          6 .dart en la raíz
      firestore_rules/             SIN código fuente (ver hallazgo 10)
                               node_modules propio, ignorado por su .gitignore
      features/empleados/capturas/ 4 PNG ~1,1 MB (ignorados)
    integration_test/              2 .dart
    test_driver/                   2 .dart
    android/ ios/ linux/ macos/ windows/ web/    scaffolds de plataforma Flutter

  web/                             sitio público de reservas (HTML + JS sin framework, sin build)
    package.json                   solo scripts de test con node:test, sin dependencias
    public/                        index.html, app.js, reserva.js, disponibilidad.js,
                                   lectura.js, firebase-config.js, styles.css,
                                   galeria/*.svg, moldes/
    scripts/probar-navegador.mjs   285 líneas (Playwright)
    test/                          4 .test.js (node:test)

  tools/firebase/                  backend de operaciones (firebase-admin, Node 22, ESM)
    package.json                   10 scripts npm
    scripts/                       6 .mjs (configurar-admin, configurar-auth-publica,
                                   sincronizar-acceso-rtdb, sincronizar-datos-publicos,
                                   seed-emulator, verificar-web-publica)
    test/                          7 .mjs
      prototypes/                  3 pares (.rules + .test.mjs): daily-occupancy,
                                   private-index-daily, private-mirror-daily

  .opencode/                       tooling del agente, 8 .md TRACKEADOS en git
    agent/  commit, generador-tests, guardian-de-fronteras, revisor-conexiones,
            revisor-provider, revisor-repository, revisor-widget, subir-github

  .production-audit/               144 archivos, 0 trackeados, IGNORADO (.gitignore:9)
                                   confirmado por el dueño: LOCAL, no forma parte del proyecto
```

---

## 2. Dimensionamiento (código de producto; excluye node_modules, assets, logs)

| Carpeta | Archivos | Líneas |
|---|---|---|
| `mobile/lib` | 44 | 5 439 |
| `mobile/firestore.rules` | 1 | 740 |
| `mobile/database.rules.json` | 1 | 46 |
| `mobile/test` (6) + `integration_test` (2) + `test_driver` (2) | 10 | ~3 900 |
| `web/public` (sin galeria/moldes) | 7 | 417 |
| `web/test` (4) + `web/scripts` (1) | 5 | 383 |
| `tools/firebase/scripts` | 6 | 869 |
| `tools/firebase/test` (sin prototypes) | 7 | 2 671 |
| `tools/firebase/test/prototypes` | 6 | 1 721 |
| `docs` (8 .md, excluyendo este archivo) | 8 | 684 |
| `.production-audit` | 144 | artefactos (JSON, log, PNG, .py, .mjs) — no es código de producto |
| `.opencode/agent` | 8 | prompts markdown |
| `functions` | 0 | 0 (sin código) |

**Total código de producto (Dart + JS + Node + reglas): ~16 200 líneas.**

---

## 3. Módulos detectados (unidades de análisis para Fase 2)

| # | Módulo | Ruta | Archivos | Líneas aprox. | Estado |
|---|---|---|---|---|---|
| M01 | **core** (núcleo compartido) | `mobile/lib/core` | 7 | 631 | pendiente |
| M02 | **bootstrap / shell de app** | `mobile/lib/main.dart`, `mobile/lib/firebase_options.dart` | 2 | 333 | pendiente |
| M03 | acceso (auth, login, verificación) | `mobile/lib/features/acceso` | 5 | 378 | pendiente |
| M04 | reservas (agenda) | `mobile/lib/features/reservas` | 6 | 1 731 | pendiente |
| M05 | sedes | `mobile/lib/features/sedes` | 3 | 283 | pendiente |
| M06 | clientes | `mobile/lib/features/clientes` | 3 | 294 | pendiente |
| M07 | empleados | `mobile/lib/features/empleados` | 3 | 437 | pendiente |
| M08 | promociones | `mobile/lib/features/promociones` | 3 | 217 | pendiente |
| M09 | configuracion | `mobile/lib/features/configuracion` | 3 | 351 | pendiente |
| M10 | presencia | `mobile/lib/features/presencia` | 4 | 368 | pendiente |
| M11 | negocio | `mobile/lib/features/negocio` | 4 | 254 | pendiente |
| M12 | dashboard | `mobile/lib/features/dashboard` | 1 | 162 | pendiente |
| M13 | **web pública** (reserva online) | `web/public` | 7 | 417 | pendiente |
| M14 | **reglas de seguridad** (Firestore + RTDB) | `mobile/firestore.rules`, `mobile/database.rules.json`, `mobile/firestore.indexes.json` | 3 | ~800 | pendiente |
| M15 | **tools/firebase** (operaciones y tests de reglas) | `tools/firebase` | 20 | 5 261 | pendiente |
| M16 | **funciones de servidor** | `functions/` | 0 | 0 | Analizado en Fase 0 — ver hallazgo 1 |
| M17 | **carpetas de feature vacías** | 11 carpetas bajo `mobile/lib/features` | 0 | 0 | Analizado en Fase 0 — ver hallazgo 2 |

### M17 — detalle: carpetas vacías confirmadas en `mobile/lib/features`
`auth/`, `caja/`, `colaboradores/`, `encuestas/`, `home/`, `marketing/`, `pedidos/`,
`planes/`, `productos/`, `quejas/`, `stock/`. Todas con `data/`, `domain/`, `presentation/`
y sub-subcarpetas (`screens/`, `widgets/`, `providers/`, `state/`, `models/`,
`repositories/`, `use_cases/`, `mappers/`) sin un solo archivo.

Confirmado por el dueño: es **hoja de ruta acordada**, no residuo.

Carpetas de dominio vacías de la capa antigua:
`mobile/lib/data/`, `mobile/lib/domain/`, `mobile/lib/services/`,
`mobile/lib/core/config/`, `mobile/lib/core/services/`,
`mobile/lib/core/theme/`, `mobile/lib/core/widgets/`.

---

## 4. Hallazgos de Fase 0 (corregidos, v4)

### 1. `functions/` está vacío — decisión confirmada, NO es una pérdida
**Respuesta del dueño: intencional, plan Spark, sin Cloud Functions.**

Evidencia verificada en código:
- `git ls-files functions` = **0 archivos** en HEAD; `git log --all -- "functions/src/*"` = **0 commits**.
  Nunca se versionó código ahí.
- NO existen `functions/package.json` ni `functions/package-lock.json`.
  Solo `functions/node_modules/.package-lock.json` (manifiesto generado por npm).
- Contenido real de `functions/node_modules` (**ls de nivel 1: 207 paquetes, 16 074 archivos**):

  ```
  .bin                      (24 shims: firebase-functions, fxparser, playwright, rimraf,
                             proto-loader-gen-types, semver, uuid, glob, mime, node-which)
  @fastify @firebase @google-cloud @grpc @isaacs @js-sdsl @nodable @opentelemetry
  @pkgjs @protobufjs @tootallnate @types
  firebase-functions@7.4.0   firebase-admin   firebase
  @google-cloud/{firestore, firestore-api, paginator, projectify, promisify, storage}
  express  cors  body-parser  finalhandler  router  serve-static  cookie  path-to-regexp
  google-auth-library  google-gax  gcp-metadata  gaxios  gtoken  jose  jsonwebtoken
  jwa  jwks-rsa  jws  fast-xml-parser  fast-xml-builder  xml-naming
  protobufjs  proto3-json-serializer  long  re2js  functional-red-black-tree
  playwright@1.63.0  playwright-core
  path-expression-matcher  limiters  stubs  object-hash  json-bigint  safe-buffer
  teeny-request  stream-events  node-fetch  undici-types  web-streams-polyfill  ...
  .package-lock.json
  ```

Verificación de dependencias (escaneo de los **458 `package.json`** presentes en el árbol,
buscando el paquete en `dependencies`, `devDependencies`, `peerDependencies` y `optionalDependencies`):

| Paquete | ¿Lo declara `firebase-functions@7.4.0`? | ¿Quién lo declara en el árbol? |
|---|---|---|
| `express`, `cors`, `protobufjs`, `@types/express`, `@types/cors` | **Sí** (5 deps directas) | — |
| `firebase-admin` | No (es *peerDependency*) | — |
| `path-expression-matcher` | **No** | `fast-xml-builder`, `fast-xml-parser` |
| `stubs` | **No** | `stream-events` |
| `functional-red-black-tree` | **No** | `@google-cloud/firestore` |
| `object-hash` | **No** | `google-gax` |
| **`playwright@1.63.0`** | **No** | `re2js@2.8.6` (en `devDependencies`), `web-streams-polyfill@3.3.3` (en `devDependencies`), y el propio paquete `playwright` |
| `limiters`, `expression-catcher`, `cacheable` | **No** | **Ningún `package.json` del árbol** (verificado sobre los 458) |

Sobre `playwright`, exactamente lo comprobable:
- **NO es una dependencia de `firebase-functions`** (`firebase-functions@7.4.0` declara 5
  dependencias y 4 peers; `playwright` no está en ninguna).
- Está declarado únicamente como **`devDependency`** de `re2js@2.8.6` y de
  `web-streams-polyfill@3.3.3`, ambos **paquetes transitive** de la cadena
  `firebase-admin` → `@google-cloud/firestore` → `re2js`.
- **NO CONFIRMADO** de dónde vino: por qué una `devDependency` de un paquete transitive terminó
  instalada aquí. Haría falta `functions/package.json` y `functions/package-lock.json` (borrados),
  o ejecutar `npm ls playwright` desde un directorio que sí tenga `package.json`, o el historial
  de shell de la instalación. No se puede determinar leyendo el árbol actual.
- **NO CONFIRMADO** también qué versión de `firebase-functions` se usó al instalar, y si existe
  algún deploy activo en producción.

**Consecuencia arquitectónica:** no existe capa de servidor. Toda la lógica de negocio (validación
de horarios, cálculo de precio, disponibilidad, control de concurrencia) se ejecuta en el cliente
(Dart y JavaScript), y la única autoridad de integridad son las reglas de `firestore.rules`.

### 2. Esqueleto de features sobredimensionado — hoja de ruta, no residuo
11 de 21 carpetas de `mobile/lib/features` están vacías, con 3-4 niveles de subcarpetas.
**Respuesta del dueño: hoja de ruta.** El código real está en 10 módulos de `features/`
(acceso, reservas, sedes, clientes, empleados, promociones, configuracion, presencia, negocio,
dashboard) más `core/`.

### 3. Dos capas de dominio coexisten
`core/domain/negocio.dart` (203 líneas) convive con `features/negocio/`.
`features/presencia/domain/` y `features/reservas/domain/` conviven con modelos definidos
dentro de sus respectivos repositorios.

### 4. Archivos grandes (responsabilidades mezcladas, a detallar en su módulo)
- `mobile/lib/features/reservas/presentation/agenda_screen.dart` = **766 líneas**
- `tools/firebase/test/firestore.rules.test.mjs` = **1 783 líneas**
- `mobile/firestore.rules` = **740 líneas**
- `mobile/lib/features/reservas/data/reservas_repository.dart` = **401 líneas**
- `mobile/lib/features/reservas/presentation/reserva_dialog.dart` = **350 líneas**
- `mobile/lib/main.dart` = **291 líneas**
- `web/scripts/probar-navegador.mjs` = **285 líneas**

### 5. Web pública sin build, con API heredada (compat)
`web/public/*.js` es JavaScript de módulos ES servido tal cual, sin bundler ni transpilador.
`web/public/index.html` (líneas 20-22) carga la **API heredada `compat` 10.14.1** desde gstatic
(`firebase-app-compat.js`, `firebase-auth-compat.js`, `firebase-firestore-compat.js`),
mientras el panel Flutter usa los SDKs **modulares** `firebase_core ^3.6.0`,
`firebase_auth ^5.3.1`, `cloud_firestore ^5.4.3`, `firebase_database ^11.1.4`.
Es decir: la web pública y el panel interno consumen la misma plataforma con dos generaciones
distintas de la API de cliente.

### 6. Configuración Firebase duplicada en 3 lugares
`mobile/lib/firebase_options.dart`, `mobile/firebase.json` y `web/public/firebase-config.js`.
Las claves `apiKey` de Flutter (web) y de la web pública son **el mismo valor literal**.
(El valor concreto se omite deliberadamente de este documento.) No hay `.env` ni `.env.example`;
`.gitignore:5` excluye `.env*`.

### 7. Dos mecanismos distintos de configuración de entorno
- Flutter: `main.dart:37` lee `String.fromEnvironment('EMULATOR_HOST')` (dart-define).
- Web: `web/public/firebase-config.js:10,17-20` decide por `location.hostname`
  (`localhost` / `127.0.0.1`) y por query param `?reservas=1`.
No hay unificación entre ambos.

> **Hipótesis (no verificada):** como la web decide su entorno por `location.hostname`, un preview
> o un dominio distinto de producción no caería en ninguno de los dos casos contemplados y
> apuntaría al proyecto real con reservas habilitadas. **No lo he verificado**: no hay ningún
> entorno de preview configurado en el repo (`.firebaserc` solo declara `glass-sintetico` y
> `demo-grass-local`) ni forma de probarlo sin desplegar. Queda como hipótesis a contrastar con el
> dueño en Fase 1.

### 8. `.production-audit/` es local, no del proyecto
144 archivos, **0 trackeados** en git, cubierto por `.gitignore:9`.
**Respuesta del dueño: local, no forma parte del proyecto.** Contiene scripts `.py/.cjs/.mjs`
que operaron sobre producción y volcados del inventario de Firestore/RTDB
(`metrics-after.json` 340 KB, `panel-before.json` 45 KB). Documenta un proceso manual de
migración/verificación en producción que no quedó automatizado.

### 9. Logs y artefactos de depuración presentes en disco, no versionados
`.gitignore:2` (`*.log`) los excluye, pero siguen presentes:
`firestore-debug.log` 437 KB (raíz), `database-debug.log` (raíz), `functions/firestore-debug.log`,
`tools/firebase/firestore-debug.log` 60 KB, `tools/firebase/database-debug.log`,
`mobile/test/firestore_rules/firestore-debug.log` 657 KB.
Las 4 capturas PNG de `mobile/test/features/empleados/capturas/` (~1,1 MB) también.

### 10. La suite de reglas NO está en `mobile/test/firestore_rules` — CORREGIDO
En la v3 afirmé que ahí había "una suite propia en Dart". **Es falso.** Contenido real y completo
de `mobile/test/firestore_rules/` (4 entradas):

| Entrada | Detalle |
|---|---|
| `.gitignore` | 15 B, contiene `node_modules/` |
| `firestore-debug.log` | 657 733 B, ignorado |
| `node_modules/` | **paquetes JavaScript/Node**, no Dart |
| `package.json` | **NO existe** |
| código fuente | **NINGUNO**: 0 archivos `.dart`, 0 `.js`, 0 `.mjs`, 0 `.ts` |

El `node_modules` de ahí es idéntico en versiones al de `tools/firebase/package.json`:
`@firebase/rules-unit-testing@5.0.2` y `firebase@12.19.0`, más `@firebase/*` (41 paquetes),
`protobufjs`, `websocket-driver`, `web-vitals`, `idb`, `re2js`, `@grpc`.
Su `.bin` solo expone `proto-loader-gen-types` (heredado de `protobufjs`), sin runner de tests.

Por tanto: la **única suite de reglas de seguridad que existe y se ejecuta** es
`tools/firebase/test/firestore.rules.test.mjs` (1 783 líneas, Node/JavaScript) más
`tools/firebase/test/database.rules.test.mjs`, declarados en `tools/firebase/package.json`
(`@firebase/rules-unit-testing 5.0.2`). `mobile/test/firestore_rules/` es una **instalación
duplicada y huérfana** de esas mismas dependencias, sin código que las use.

Además, `tools/firebase/test/prototypes/` mantiene **3 juegos de reglas alternativas**
(`daily-occupancy`, `private-index-daily`, `private-mirror-daily`) en archivos `.rules`
que **no son** los desplegados desde `mobile/firestore.rules`.

Las pruebas Dart que sí existen y son trackeadas están en `mobile/test/` (6 archivos),
`mobile/integration_test/` (2) y `mobile/test_driver/` (2), y usan
`fake_cloud_firestore` + `mocktail`, no `@firebase/rules-unit-testing`.

### 11. Git confirmado
`.git` existe en `reservas_cancha/canchas-cliente/.git`. NO existe en `reservas_cancha/`.
**Respuesta del dueño: rama de trabajo `checkpoint/agenda-diaria-schema5`.**

- `git rev-parse --show-toplevel` → `C:/Users/User/Downloads/reservas_cancha/canchas-cliente`
- **245 archivos trackeados**: `mobile` 189, `tools` 21, `web` 17, `.opencode` 8, `docs` 7,
  y 3 en la raíz (`.firebaserc`, `.gitignore`, `firebase.json`).
- Rama actual `checkpoint/agenda-diaria-schema5`, HEAD `e9db165`
  `feat: planillas por cancha y registro privado de efectivo`
- Rama `main` en `83ed479`, con `origin/main` y **ahead 4**.
- Todos los commits de la tabla siguiente tienen cuerpo vacío (`%b` vacío).

Mensajes de commit **copiados textualmente** de `git log` (todos con cuerpo vacío):

| Hash | Fecha | Mensaje exacto (subject) |
|---|---|---|
| `a950625` | Tue Sep 29 23:14:07 2026 -0500 | `fix: select private booking times with consecutive slot checkboxes` |
| `5fb3625` | Tue Sep 29 22:50:05 2026 -0500 | `fix: recover private panel presence and show unattended bookings` |
| `2b6407c` | Tue Sep 29 22:14:42 2026 -0500 | `fix: prevent stale booking pages and record checkbox selection rollout` |
| `be7f6df` | Tue Sep 29 22:01:39 2026 -0500 | `feat: select available hourly ranges directly from court tables` |

- **Working tree con cambios sin commitear**:
  `M mobile/lib/features/reservas/presentation/agenda_screen.dart`,
  `M mobile/test/agenda_test.dart`,
  `?? docs/ESTADO_CODEX_2026-09-30.md`,
  `?? docs/arquitectura/`.
  Este análisis describe por tanto un estado **en desarrollo**, no una release.

---

## 5. Configuración y entradas leídas en Fase 0

| Archivo | Contenido clave |
|---|---|
| `mobile/pubspec.yaml` | Flutter, SDK `^3.12.2`; deps: `firebase_core ^3.6.0`, `firebase_auth ^5.3.1`, `cloud_firestore ^5.4.3`, `firebase_database ^11.1.4`. Dev: `flutter_test`, `fake_cloud_firestore ^3.1.0`, `mocktail ^1.0.4`, `http`, `integration_test`, `flutter_lints ^6.0.0`. **Sin `provider`, sin `go_router`, sin `build_runner`, sin `freezed`, sin `riverpod`, sin `bloc`.** |
| `firebase.json` (raíz) | Reglas desde `mobile/firestore.rules` + `mobile/firestore.indexes.json`; `database` desde `mobile/database.rules.json`. **Sin `hosting`** desde el Paso 3. Emuladores: auth 9099, firestore 8081, database 9000, hosting 5000. `singleProjectMode: false`. |
| `firebase.publica.json` | Solo `hosting:publica` → `web/public`, headers de no-cache. Sin reglas ni panel. |
| `firebase.personal.json` | Solo `hosting:personal` → `mobile/build/web`, headers de no-cache. Sin reglas ni web pública. |
| `.firebaserc` | default `glass-sintetico`; hosting `publica` → `glass-sintetico-tienda`, `personal` → `glass-sintetico`. También declara `demo-grass-local` con sus dos targets. |
| `mobile/firebase.json` | Config de `flutterfire`; projectId `glass-sintetico`; appIds android, ios y web. |
| `mobile/lib/firebase_options.dart` | `DefaultFirebaseOptions.currentPlatform` con opciones web/android/ios. **En `TargetPlatform.windows` devuelve `web`** (línea 11); en linux/macos lanza `UnsupportedError`. |
| `mobile/lib/main.dart` | Punto de entrada. Inicializa Firebase (producción o emulador), crea `Servicios(db, auth, authAltas, realtime)`, pasa a `GrassApp`. **Construye a mano los 9 providers, repartidos en tres `State`: `AccesoProvider` en `_GrassAppState:110`, `NegocioProvider` en `_PrepararState:223-225`, y 7 en `_PanelState:255-279`.** Sin contenedor de inyección de dependencias. |
| `web/public/index.html` | Carga 3 scripts compat de Firebase 10.14.1 vía gstatic, luego `firebase-config.js` y `app.js` como módulo ES. |
| `web/public/firebase-config.js` | Config en `window.GRASS_FIREBASE_CONFIG`; fuerza `demo-grass-local` en localhost; expone `window.GRASS_RESERVAS_HABILITADAS`. |
| `web/package.json` | Sin dependencias. `"type":"module"`. Scripts: `test` (`node --test test/*.test.js`), `check` (`node --check`). |
| `tools/firebase/package.json` | `firebase-admin ^14.5.0`; dev `@firebase/rules-unit-testing 5.0.2`, `firebase 12.19.0`; `engines.node 22`. 10 scripts npm. |
| `.gitignore` (raíz) | `node_modules/`, `*.log`, `.firebase/`, `.env*`, `!*.example`, `*-service-account.json`, `mobile/test/features/empleados/capturas/*.png`, `.production-audit/`. |

---

## 6. Estado de fases

| Fase | Estado |
|---|---|
| 0 — Reconocimiento | COMPLETADA (v4, con respuestas del dueño incorporadas) |
| 1 — Visión global | COMPLETADA → `01_vision_global.md` |
| 2 — Análisis por módulo | pendiente (17 módulos; 15 por analizar, en tandas de 3 → 5 tandas) |
| 3 — Aspectos transversales | pendiente |
| 4 — Datos e integraciones | pendiente |
| 5 — Flujos reales | pendiente |
| 6 — Dependencias, problemas y fortalezas | pendiente |
| 7 — Consolidación (`ARQUITECTURA_ACTUAL.md`) | pendiente |

### Orden de las tandas de Fase 2 (propuesta)
- **Tanda 1:** M01 `core`, M02 `main.dart`, M03 `acceso`
- **Tanda 2:** M04 `reservas`, M14 `reglas de seguridad`
- **Tanda 3:** M05 `sedes`, M06 `clientes`, M07 `empleados`
- **Tanda 4:** M08 `promociones`, M09 `configuracion`, M10 `presencia`
- **Tanda 5:** M11 `negocio`, M12 `dashboard`, M13 `web pública`
- **Tanda 6:** M15 `tools/firebase`, M16 `functions` (ya analizado en Fase 0), M17 carpetas vacías

## 7 bis. Resultado del contraste de `ARQUITECTURA_SPARK.md` (Fase 1)

`docs/ARQUITECTURA_SPARK.md` leído completo (229 líneas) y contrastado con el código.
Detalle completo en `01_vision_global.md` §5. Resultado: **20 afirmaciones coinciden,
5 difieren (D1, D2, D3, D6, D7), 2 NO CONFIRMADAS por no ejecutar las suites (D4, D5),
y 3 NO CONFIRMADAS por depender del proyecto real o del emulador (N1-N3).**

Las 5 diferencias (el documento describe un estado anterior):
- **D1** dice que `GRASS_RESERVAS_HABILITADAS = false`; `web/public/firebase-config.js:18` tiene
  `const reservasProduccionHabilitadas = true;` → el código del repositorio **sí** habilita las
  reservas en origen no local. Aclarado en el documento: esto es lo que dice el **código**, no lo
  que hay desplegado (el bundle publicado no es verificable desde el árbol local).
- **D2** dice que solo se publicó `hosting:publica`; hay cachés de despliegue de **ambos** sites
  (`web\public` y `mobile\build\web`, nombres base64 decodificados).
- **D3** dice que no existe "ninguna vía para registrar adelanto o saldo";
  `mobile/firestore.rules:397` define `efectivoValido(n)` y `:704` lo permite en el `update` de
  reservas → el panel **sí cobra efectivo manual**. Contradicción interna del propio documento
  (su sección "Etapa operativa" de la línea 13 sí lo describe; la sección de pagos de la línea 225
  quedó sin marcar como histórica).
- **D6** `d.ocupados.size() <= 36` está en `firestore.rules:511` y `:556`, no en 475.
- **D7** de las 20 referencias de línea del análisis de mutaciones, **18 apuntan a una línea
  distinta** del archivo actual; solo `:93` y `:50` siguen exactas y `:55` acierta línea pero no
  valor (`200` en el doc, `>= 3 && <= 64` en el código). Corrección: las expresiones con `+1500`,
  `>= 0` y `hasAny` **no son errores de transcripción**, son las variantes mutadas que el propio
  documento introduce. Por eso **D8 (supuesto error de transcripción del `+1500`) queda ELIMINADA**.

NO CONFIRMADAS (D4, D5 y N1-N4): los conteos de pruebas del documento (71 activas / 20 del
prototipo). Conté estáticamente `firestore.rules.test.mjs`: **51 declaraciones `test(`**, 0
`test.each`, 0 `it`, 21 helpers, 14 bucles; 2 declaraciones están dentro de un bucle sobre **14
duraciones**, lo que da 49 + 28 = **77 casos en ejecución**. Los prototipos suman **35**
declaraciones. Ninguna de las tres cifras (51, 77, 71) es reconciliable sin ejecutar.
**No ejecuté ninguna suite ni el emulador** en este análisis. Los conteos son estáticos.

---

## 7. Preguntas abiertas — ESTADO FINAL

### Respondidas por el dueño
| # | Pregunta | Respuesta |
|---|---|---|
| 1 | `functions/` vacío: ¿intencional o perdido? | **Intencional. Plan Spark, sin Cloud Functions.** |
| 2 | Dominio canónico de autenticación? | **`features/acceso`. `features/auth` es residuo.** |
| 3 | Carpetas vacías: ¿hoja de ruta o residuo? | **Hoja de ruta.** |
| 4 | `ARQUITECTURA_SPARK.md`: ¿estado actual o diseño previsto? | **Estado actual.** Debe leerse completo en Fase 1 y contrastarse con el código. |
| 5 | `.production-audit/` ¿local o del proyecto? | **Local, no forma parte del proyecto.** |
| 6 | ¿Dónde está el control de versiones? | **`canchas-cliente/.git`, rama de trabajo `checkpoint/agenda-diaria-schema5`.** |

### NO CONFIRMADO (no bloqueante; se tratará como tal en fases siguientes)
1. Por qué una `devDependency` de un paquete transitive (`playwright`) quedó instalada en
   `functions/node_modules`. Falta `functions/package.json` + `package-lock.json`, o `npm ls`,
   o el historial de shell.
2. Qué versión de `firebase-functions` se usó al poblar `functions/node_modules`, y si existe
   algún deploy de Cloud Functions activo en producción.
3. Por qué existe `mobile/test/firestore_rules/node_modules` con las mismas dependencias que
   `tools/firebase` y sin ningún código fuente que las use. Falta historial del comando `npm i`.
4. En qué orden se implementarán las 11 carpetas de la hoja de ruta; no hay planning file versionado
   que lo indique (`docs/` solo tiene informes de cambio, no un roadmap).
5. Si `docs/ESTADO_CODEX_2026-09-30.md` (untracked) refleja una decisión posterior a la rama
   actual. Menciona "Pagos: no implementado" y "Culqi: decisiones abiertas".
6. Si el target `personal` de Hosting (`mobile/build/web`) se despliega en producción o solo se
   usa el APK de Android. Falta un artefacto de build.
7. Si existe algún entorno de preview para la web pública (ver hipótesis en hallazgo 7).

---

_Fase 0 corregida (v4). Esperando aprobación._

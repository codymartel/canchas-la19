# 01 — Visión Global

Proyecto: **Grass Sintético** · Huánuco, Perú · reservas de 3 canchas de grass sintético
Raíz: `reservas_cancha/canchas-cliente/` · repo git, rama de trabajo `checkpoint/agenda-diaria-schema5`
Documento fuente de contexto: `docs/ARQUITECTURA_SPARK.md` (229 líneas, confirmado por el dueño como
descripción del **estado actual**)

---

## 1. Resumen ejecutivo

Grass Sintético es una aplicación de reserva de canchas con **dos superficies sobre una única base
de datos**: un panel interno (Flutter, Android y web) para el personal del negocio —que agenda,
cobra efectivo manual y controla la presencia— y una web pública (HTML + JavaScript sin framework)
donde el cliente final pide horas en línea de forma anónima. El negocio tiene **3 canchas
identificadas de forma fixa como `la-19`, `la-23` y `la-24`**
(`mobile/lib/core/domain/negocio.dart:5` `sedesIds`, replicado en `web/public/app.js:8` `nombres`,
`mobile/database.rules.json` —que las enumera en las reglas de presencia— y
`tools/firebase/scripts/seed-emulator.mjs:95`). No existe capa de servidor: el plan Spark descarta
Cloud Functions y **toda la lógica de negocio se ejecuta en el cliente** (Dart y JavaScript), con
la **integridad delegada a `mobile/firestore.rules`** (740 líneas) y `mobile/database.rules.json`
(46 líneas). La arquitectura es *feature-first*, pero **no por capas completas**: solo 3 de los 10
módulos con código tienen carpeta `domain/` (`acceso`, `presencia`, `reservas`) y solo 1 tiene
carpeta `application/` (`reservas`). El estado es por módulo, con `ChangeNotifier` propio
(`Operacion`), sin librería de estado externa ni contenedor de inyección de dependencias. Hay
**9 providers**, de los cuales 7 heredan de `Operacion`. El acceso a Firebase se resuelve a mano en
`main.dart`, que construye e inicializa los 9 uno a uno (§3.5). La lógica de dominio crítico
—horarios, duración, exclusividad, precio— está **duplicada en tres lugares**: las reglas de
Firestore, el panel Flutter y la web pública.

---

## 2. Stack tecnológico

### 2.1 Lenguajes y runtimes

| Elemento | Versión / declaración | Dónde | Para qué |
|---|---|---|---|
| Dart | SDK `^3.12.2` (`mobile/pubspec.yaml:8`) | `mobile/lib/**` | Panel interno del negocio |
| JavaScript (módulos ES) | sin build, sin transpilar | `web/public/*.js` | Web pública de reservas |
| Node.js | `22` (`tools/firebase/package.json:3`, `engines.node`) | `tools/firebase/**` | Operaciones y tests de reglas |
| Rules DSL de Firestore | — | `mobile/firestore.rules` (740 líneas) | Autoridad de integridad |
| Rules JSON de RTDB | — | `mobile/database.rules.json` (46 líneas) | Autoridad de presencia y ACL |
| Python 3 (scripts de auditoría) | — | `.production-audit/*.py` (12 archivos) | Scripts de auditoría de producción (local, no versionado) |
| JavaScript CommonJS | — | `.production-audit/*.cjs` (11 archivos) | ídem |
| JavaScript ESM | — | `.production-audit/*.mjs` (28 archivos) | ídem |
| JSON de volcado | — | `.production-audit/*.json` (32 archivos) | Inventarios de Firestore/RTDB (local) |

Composición real de `.production-audit/` (144 archivos): `.log` 49, `.json` 32, `.mjs` 28,
`.png` 12, `.py` 12, `.cjs` 11.

### 2.2 Frameworks y librerías del panel Flutter

| Paquete | Versión | Rol |
|---|---|---|
| `flutter` | SDK | UI del panel |
| `firebase_core` | `^3.6.0` | Inicialización; `DefaultFirebaseOptions` |
| `firebase_auth` | `^5.3.1` | Correo/contraseña del personal; **instancia secundaria** para altas |
| `cloud_firestore` | `^5.4.3` | Base de datos principal (autoridad) |
| `firebase_database` | `^11.1.4` | Solo presencia en tiempo real y ACL `acceso/` |
| `flutter_lints` | `^6.0.0` | Lints |

**Ausentes de forma notable:** sin `provider`, sin `go_router`, sin `riverpod`, sin `bloc`, sin
`build_runner`, sin `freezed`, sin `get_it`/`injectable`, sin `firebase_storage`. El estado, la
navegación y la inyección de dependencias son **propios o manuales**.

Dev-dependencies de test: `flutter_test`, `fake_cloud_firestore ^3.1.0`, `mocktail ^1.0.4`,
`http ^1.2.0`, `integration_test`.

### 2.3 Web pública

Sin framework, sin bundler, sin dependencias (`web/package.json` declara `"type":"module"` y nada más).
Carga la **API heredada `compat` de Firebase 10.14.1** por CDN gstatic
(`web/public/index.html:20-22`). Scripts:
`app.js` (234 líneas, orquestación y render), `reserva.js` (88, transacción de reserva),
`disponibilidad.js` (39, dominio de horarios/turnos), `lectura.js` (10, timeout de lectura),
`firebase-config.js` (19, configuración por entorno).

### 2.4 Backend de operaciones

`tools/firebase/package.json`: `firebase-admin ^14.5.0`; dev `@firebase/rules-unit-testing 5.0.2`,
`firebase 12.19.0`. 10 scripts npm: `configurar-admin`, `configurar-auth-publica`,
`sincronizar-acceso`, `sincronizar-publico`, `seed-emulator`, `verificar-web`, `reglas`,
`reglas:database`, `test:provisionamiento`, `test:web-flow`.

### 2.5 Servicios externos

| Servicio | Uso | Configuración |
|---|---|---|
| Firebase Authentication | correo/contraseña del personal + **anónimo** para la web | `mobile/firebase.json`, `mobile/lib/firebase_options.dart`, `web/public/firebase-config.js` |
| Cloud Firestore | autoridad definitiva de reservas, agenda, configuración, personal | reglas en `mobile/firestore.rules`, índices en `mobile/firestore.indexes.json` |
| Realtime Database | presencia en vivo (`presencia/…`) y réplica de ACL (`acceso/{negocio}/{uid}`) | `mobile/database.rules.json`, URL `https://glass-sintetico-default-rtdb.firebaseio.com` en `mobile/lib/firebase_options.dart` (web:25, android:33, ios:41) |
| Firebase Hosting | dos sites: `publica` → `web/public`, `personal` → `mobile/build/web` | `firebase.json:9-96`, `.firebaserc` |
| Firebase Emulators | auth 9099, firestore 8081, database 9000, hosting 5000 | `firebase.json:98-115` |
| gcloud ADC | credenciales del operador para los scripts | fuera del repo (`gcloud auth application-default login`) |

**No hay** pagos, pasarela (Culqi), WhatsApp, Cloudinary, correo saliente, ni webhooks.
`docs/ESTADO_CODEX_2026-09-30.md` (untracked) declara "Pagos: no implementado" y
"Culqi: decisiones abiertas".

### 2.6 Artifactos

Rama con 245 archivos trackeados: `mobile` 189, `tools` 21, `web` 17, `.opencode` 8, `docs` 7, raíz 3.
2 hostings desplegados (cachés `.firebase/hosting.*.cache` con origen
`mobile\build\web` y `web\public`, ambos decodificables en base64). 2 escrituras sin commitear
(`agenda_screen.dart`, `agenda_test.dart`).

---

## 3. Patrones arquitectónicos identificados

### 3.1 Patron dominante: feature-first por capas con Provider propio — **heterogéneo**

**Evidencia (estructura verificada archivo por archivo):**

| Capa | Convención | Módulos que la siguen |
|---|---|---|
| `data/` | `XRepository` con métodos que devuelven `Resultado<T>` | acceso, reservas, sedes, clientes, empleados, promociones, configuracion, negocio, presencia — **9 de 10** |
| `domain/` | modelos e tipos del dominio | **solo 3 de 10**: `acceso/domain/sesion.dart`, `presencia/domain/{actividad,presencia_control}.dart`, `reservas/domain/reserva.dart` |
| `application/` | caso de uso | **solo 1 de 10**: `reservas/application/gestionar_reserva.dart` (16 líneas) |
| `presentation/` | `XProvider` + `XScreen` | **9 de 10** (dashboard solo tiene `presentation/panel_screen.dart`, sin provider ni repositorio propio) |

Hay **9 providers** en total: `AccesoProvider`, `AgendaProvider`, `ClientesProvider`,
`ConfiguracionProvider`, `EmpleadosProvider`, `NegocioProvider`, `PresenciaProvider`,
`PromocionesProvider`, `SedesProvider`.

**Tres inconsistencias concretas dentro del patrón:**

1. **`Operacion` no se usa como base en 2 de 9 providers.**
   `mobile/lib/core/presentation/operacion.dart` define `class Operacion extends ChangeNotifier`
   y la usan **7** providers: `ClientesProvider`, `ConfiguracionProvider`, `EmpleadosProvider`,
   `NegocioProvider`, `PromocionesProvider`, `SedesProvider` y `AgendaProvider`.
   En cambio `mobile/lib/features/acceso/presentation/acceso_provider.dart`
   (`class AccesoProvider extends ChangeNotifier`) y
   `mobile/lib/features/presencia/presentation/presencia_provider.dart`
   (`class PresenciaProvider extends ChangeNotifier implements PresenciaControl`)
   extienden `ChangeNotifier` directamente, sin herencia de `Operacion`.
   → el andamiaje compartido de carga/error (§3.3) **no está disponible** para acceso ni presencia.

2. **La capa de dominio existe solo en un tercio de los módulos.** Los modelos de `clientes`,
   `empleados`, `sedes`, `promociones` y `configuracion` viven **dentro del repositorio** o se
   transportan como `Map<String,dynamic>` crudo (`Registro` en `core/domain/formatos.dart`).
   `mobile/lib/features/empleados/data/empleados_repository.dart` declara
   `class AltaEmpleado` — un tipo de entrada de negocio en la **capa de datos**.

3. **Conviven una capa clásica abandonada y la feature-first.**
   `mobile/lib/data/repositories/`, `mobile/lib/domain/models/`, `mobile/lib/services/`,
   `mobile/lib/core/{config,services,theme,widgets}/` existen **vacías**.
   Y `features/auth/` duplica el dominio de `features/acceso/` (confirmado por el dueño: `acceso`
   es el canónico, `auth` es residuo de la hoja de ruta).

### 3.2 Resultado como tipo de error explícito — **consistente**

`mobile/lib/core/domain/resultado.dart`: `sealed class Resultado<T>` con `Ok<T>` y `Fallo<T>`.
Lo usan los repositorios mediante el helper `Servicios.guardando<T>()` de
`mobile/lib/core/data/servicios.dart:33-39`, que captura cualquier excepción y la traduce con
`mensajeError()` (`servicios.dart:63-90`, un `switch` sobre ~15 códigos de `FirebaseException`
traducidos al español). La jerarquía `sealed` obliga a que **todo el consumidor haga `switch`**
sobre los dos casos: no hay excepciones de dominio cruzando capas.

### 3.3 Estado por módulo con `Operacion` — **consistente en su diseño, ausente en el acceso**

`mobile/lib/core/presentation/operacion.dart` (42 líneas) centraliza carga / error / datos y notifica
con `ChangeNotifier`. Los providers más simples (`SedesProvider` 13 líneas,
`ConfiguracionProvider` 23, `PromocionesProvider` 10) solo componen `Operacion` con su repositorio.
La pantalla los escucha con `ListenableBuilder` (`main.dart:128-132`, para `acceso`).

### 3.4 Navegación: máquina de estados, sin router — **consistente y explícito**

`mobile/lib/features/acceso/domain/sesion.dart` declara `enum EstadoSesion` y `class Sesion`.
`main.dart:150-182` resuelve **toda** la navegación con un `switch` sobre ese enum:
`cargando → sinSesion → noVerificado → sinConfiguracion → preparar → vinculado → desactivado/noVinculado`.
No hay `Navigator` con rutas nombradas para el flujo principal; el cambio de pantalla es un `switch`
en el `build`. Los subflujos (agenda, sedes, clientes…) sí usan `Navigator` implícito.

### 3.5 Inyección de dependencias manual por constructor — **consistente pero frágil**

`main.dart:34-99` construye el grafo a mano: 3 instancias de Firebase, una instancia secundaria
de Auth (`authSecundaria()`, `servicios.dart:44-51`, para no cerrar la sesión del administrador al
crear un empleado) y un objeto `Servicios` que actúa como **contenedor de dependencias** con 4
clientes inyectados. Los **9 providers** se instancian repartidos en **tres** `State`, no en uno:

| Provider | Dónde se instancia | Disposición |
|---|---|---|
| `AccesoProvider` | `_GrassAppState`, `main.dart:110` (`late final acceso = AccesoProvider(AccesoRepository(widget.servicios))`) | `dispose()` en 112-115 |
| `NegocioProvider` | `_PrepararState`, `main.dart:223-225` (se crea solo en el estado `EstadoSesion.preparar`) | `dispose()` en 227-230 |
| `AgendaProvider` | `_PanelState`, `main.dart:257-259` | `dispose()` en 282-291 |
| `SedesProvider` | `_PanelState`, `main.dart:260` | ídem |
| `ClientesProvider` | `_PanelState`, `main.dart:261-263` | ídem |
| `EmpleadosProvider` | `_PanelState`, `main.dart:264-270` | ídem |
| `PromocionesProvider` | `_PanelState`, `main.dart:271-273` | ídem |
| `ConfiguracionProvider` | `_PanelState`, `main.dart:274-276` | ídem |
| `PresenciaProvider` | `_PanelState`, `main.dart:277-279` | ídem |

**Precisión sobre las cifras:** `_PanelState` instancia **7** providers (líneas 255-279), no 8.
El octavo que se ve en ese rango de líneas pertenece a otro `State`: `NegocioProvider` se crea en
`_PrepararState` (223-225) y el noveno, `AccesoProvider`, en `_GrassAppState` (110). Sumando los
tres puntos de instanciación: **9 providers, 3 lugares de construcción**. No hay ninguno "fuera"
del patrón; lo que hay es **división de responsabilidad por estado de sesión**: `acceso` existe
siempre, `negocio` solo mientras se coordina la configuración inicial, y los otros 7 solo cuando la
sesión está `vinculada`. Cada provider se construye con `late final` en el `State` y se libera a
mano: no hay registro, resolución por tipo ni gestión de ciclo de vida.

### 3.6 Sin capa de servidor: reglas como autoridad — **decisión deliberada**

No hay Cloud Functions (`functions/` vacío, 0 archivos en todo el historial git; decisión del
dueño: plan Spark). `firebase-functions@7.4.0` está instalado en `functions/node_modules`, junto con
`firebase-admin` y 205 paquetes más; **el origen de `playwright@1.63.0`, presente en ese mismo
árbol, queda como NO CONFIRMADO**. La consecuencia estructural es que `mobile/firestore.rules`
(740 líneas, 17 funciones de validación) hace de motor de reglas de negocio.

### 3.7 Web pública: lógica de dominio replicada, sin compartir código — **duplicación**

`web/public/disponibilidad.js` reimplementa lo que `mobile/lib/core/domain/negocio.dart` y
`mobile/lib/core/domain/formatos.dart` ya resuelven: mismo cálculo de día operativo, mismos turnos,
misma validación de inicio. **No hay ninguna forma de compartir ese código** entre Dart y el módulo
ES del navegador: son lenguajes distintos y no hay paso de generación. La defensa contra la
divergencia está en los comentarios de `disponibilidad.js:19-21` ("valida exactamente las mismas
reglas que el servidor y el panel") y en la suite `tools/firebase/test/prototypes/`, no en una
abstracción.

### 3.8 Veredicto sobre el patrón

El patrón dominante es **feature-first por capas con Provider propio y `Resultado<T>`**, y se
aplica razonablemente bien en 7 de 9 providers (los que heredan de `Operacion` y tienen
`data` + `presentation`). **No es un patrón uniforme**: la capa `domain` existe solo en 3 de 10
módulos, la capa `application` solo en 1, `features/auth/` y la capa clásica de `mobile/lib` son
restos, dos providers se saltan `Operacion`, y varios repositorios declaran tipos de negocio
propios dentro de la capa de datos. El detalle por módulo corresponde a la Fase 2.

---

## 4. Árbol de carpetas comentado (primeros niveles)

```
canchas-cliente/
├── firebase.json / .firebaserc      Config canónica: 2 hostings, 3 reglas, 4 emuladores
├── .gitignore                        node_modules, *.log, .env*, .production-audit/, capturas PNG
│
├── mobile/                           ── PANEL INTERNO (Flutter) ──
│                                      5 439 líneas de Dart = 34 % del código de producto (~16 200)
│                                      el resto: reglas 786, tools 5 261, web 800, tests Dart ~3 900
│   ├── pubspec.yaml                  SDK ^3.12.2; 4 SDKs de Firebase; sin librería de estado ni router
│   ├── firebase.json                 configuración de flutterfire (projectId glass-sintetico)
│   ├── firestore.rules          740 L ─┐ ÚNICA autoridad de integridad de todo el sistema
│   ├── database.rules.json      46 L ─┘ Autoridad de presencia y ACL en RTDB
│   ├── firestore.indexes.json
│   ├── lib/
│   │   ├── main.dart            291 L   Bootstrap: Firebase + emulador + DI manual + 9 providers
│   │   ├── firebase_options.dart 44 L   Opciones por plataforma (windows reutiliza web)
│   │   ├── core/                       ── NÚCLEO COMPARTIDO (7 archivos, 631 L) ──
│   │   │   ├── data/servicios.dart     Contenedor de DI (db, auth, authAltas, realtime) + errores
│   │   │   ├── domain/resultado.dart   sealed Resultado<T> / Ok / Fallo
│   │   │   ├── domain/negocio.dart     HorarioNegocio, ConfiguracionNegocio, sede y minuto válidos
│   │   │   ├── domain/formatos.dart    Registro (envoltura de DocumentSnapshot) y formateadores
│   │   │   └── presentation/           Operacion (base de providers), componentes, pantallas comunes
│   │   ├── data/  domain/  services/   ── VACÍAS: capa clásica abandonada ──
│   │   └── features/                    ── 10 módulos con código + 11 carpetas vacías (hoja de ruta) ──
│   │       acceso · reservas · sedes · clientes · empleados
│   │       promociones · configuracion · presencia · negocio · dashboard
│   │       (vacías: auth, caja, colaboradores, encuestas, home, marketing, pedidos,
│   │        planes, productos, quejas, stock)
│   ├── test/ · integration_test/ · test_driver/   10 .dart con fake_cloud_firestore + mocktail
│   │   └── firestore_rules/            SIN CÓDIGO: solo node_modules huérfano + log de 657 KB
│   └── android/ ios/ linux/ macos/ windows/ web/   scaffolds de plataforma
│
├── web/                              ── WEB PÚBLICA (17 archivos, ~800 L) ──
│   ├── public/                       index.html + 5 .js + styles.css + galeria/ + moldes/
│   ├── test/                         4 .test.js con node:test, sin dependencias
│   └── scripts/probar-navegador.mjs  285 L, Playwright
│
├── tools/firebase/                   ── OPERACIONES Y TESTS DE REGLAS (5 261 L) ──
│   ├── scripts/                      6 .mjs con firebase-admin (configurar-admin, sincronizar-*, seed)
│   └── test/                         firestore.rules.test.mjs (1 783 L) + database.rules.test.mjs
│       └── prototypes/               3 juegos de reglas ALTERNATIVAS, no las desplegadas
│
├── docs/                             8 informes de cambio y estado (684 L)
├── .opencode/agent/                  8 prompts del agente, versionados
├── .production-audit/                144 archivos LOCALES, ignorados por git
└── functions/                        SIN CÓDIGO (decisión: plan Spark). node_modules huérfano
```

---

## 5. Contraste: `docs/ARQUITECTURA_SPARK.md` frente al código

Documento de 229 líneas. Contrastado afirmación por afirmación contra el código.
**Resultado: 20 afirmaciones coinciden, 5 difieren (D1, D2, D3, D6, D7), 2 quedan NO CONFIRMADAS
(D4, D5), 3 más NO CONFIRMADAS por no depender del código (N1-N3).**

### 5.1 Coinciden (verificadas)

| # | Afirmación del documento | Verificado en |
|---|---|---|
| 1 | El comando de Firebase se ejecuta desde la raíz `canchas-cliente/` | `firebase.json` está en la raíz y referencia `mobile/firestore.rules` |
| 2 | `firebase.json` es la configuración canónica de Hosting, Firestore y RTDB | `firebase.json:2-97` |
| 3 | Firestore carga `mobile/firestore.rules` + `mobile/firestore.indexes.json` | `firebase.json:2-5` |
| 4 | RTDB carga `mobile/database.rules.json` | `firebase.json:6-8` |
| 5 | El proyecto real es `glass-sintetico` | `.firebaserc`, `mobile/firebase.json:6`, `firebase_options.dart:5` |
| 6 | Las pruebas usan `demo-grass-local` con emuladores | `main.dart:37,44-48`, `firebase-config.js:11`, `.firebaserc` declara el proyecto demo |
| 7 | Puertos 9099 / 8081 / 9000 / 5000 | `firebase.json:98-115`, `main.dart:71-74`, `web/public/app.js:14-15` |
| 8 | La autoridad es el UID en `sistema/grass.administradorUid` | `core/domain/negocio.dart:4` (`documentoConfiguracion='sistema/grass'`), `:219` `administradorUid`; `acceso_repository.dart:38,54` |
| 9 | Un UID sin ficha de empleado queda en "cuenta no vinculada" | `acceso_repository.dart:38-54`, `main.dart:177-181` `EstadoSesion.noVinculado` → `NoVinculadoScreen` |
| 10 | La URL de RTDB está en todas las plataformas de `firebase_options.dart` | `firebase_options.dart:25` (web), `:33` (android), `:41` (ios) |
| 11 | Presencia en `presencia/{negocio}/{cancha}/{dia}/{minuto}/{uid}/{sesion}` | `presencia_repository.dart:128` |
| 12 | `onDisconnect().remove()`, 14 minutos de expiración, se borra al cancelar o guardar | `presencia_repository.dart:152,157,121,177` |
| 13 | RTDB no puede leer Firestore → réplica `acceso/{negocio}/{uid}` con rol, activo y nombre | `database.rules.json`, bloque `acceso`: `.validate` exige `hasChildren(['rol','activo','nombre'])` |
| 14 | Presencia exige administrador o `empleado_control` activo; la web pública no puede leer | `database.rules.json`: `.read` y `.write` de `presencia/…` exigen `sign_in_provider !== 'anonymous'` + rol; `.read: false` en la raíz |
| 15 | Un usuario solo escribe su propia actividad de su UID | `database.rules.json`: `auth.uid === $uid` en `.write` |
| 16 | Rutas `negocios/{n}/agenda/{cancha}/dias/{dia}` y `agenda_publica/{n}/canchas/{cancha}/dias/{dia}` | `firestore.rules:162,166`; `web/public/reserva.js:2-9` |
| 17 | El mapa `ocupados` con claves de 30 minutos; los minutos posteriores a medianoche siguen en el mismo día operativo | `firestore.rules:511-512` (`d.ocupados.size() <= 36`, `values().hasOnly([true])`), `:468` (`minutos[0] >= 420 && < 1500`), `:489`; regex de minutos en `database.rules.json` hasta `1470` |
| 18 | La web usa identidad anónima y no lee la colección privada | `web/public/app.js:7-8,14`; lee solo colecciones `*_publicas` y `agenda_publica` |
| 19 | Hasta 3 horas se confirman; más queda pendiente sin ocupar | `web/public/reserva.js:34` (`const confirmada = datos.duracion <= 180`), `:56`; `firestore.rules:355,359-361,526-530` |
| 20 | La web solo lee `negocios_publicos/`, `canchas_publicas/`, `promociones_publicas/`, `agenda_publica` | `web/public/app.js:150,180,181,54` |
| 21 | El modelo público reserva `galeria` y su `orden`; no hay `firebase_storage` | `web/public/app.js:157`; `mobile/pubspec.yaml` sin `firebase_storage` |
| 22 | `schemaVersion` canónico es 5; el 4 nunca existió | `firestore.rules:276,400,430,518` (`schemaVersion == 5`) |

### 5.2 Difieren — el documento describe un estado anterior

| # | Afirmación del documento | Lo que dice el código | Veredicto |
|---|---|---|---|
| D1 | Línea 167: "`web/public/firebase-config.js` mantiene `GRASS_RESERVAS_HABILITADAS = false`" y "mientras siga abierto el bloqueo" (líneas 165-176) | Texto **literal** de `web/public/firebase-config.js:17-20`:<br>`const origenLocal = ['localhost', '127.0.0.1'].includes(location.hostname);`<br>`const reservasProduccionHabilitadas = true;`<br>`window.GRASS_RESERVAS_HABILITADAS = (!origenLocal && reservasProduccionHabilitadas)`<br>`  \|\| (origenLocal && new URLSearchParams(location.search).get('reservas') === '1');`<br>Con ese texto, en un origen que no sea `localhost` el flag resulta `true`. | **DIFERE entre el documento y el código fuente.** El documento describe el estado anterior a la activación. **Aclaración: esto es lo que dice el código del repositorio, no lo que hay desplegado** — no puedo verificar el bundle publicado en Hosting sin descargarlo. Lo único comprobable del despliegue es que existe una caché de despliegue de `web\public` (`.firebase/hosting.d2ViXHB1YmxpYw.cache`). `docs/VALIDACION_PRODUCCION_2026-09-29.md` y `docs/PLANILLAS_EFECTIVO_2026-09-30.md` describen una activación, pero no son verificables desde el código. |
| D2 | Línea 169: "solo se publicó `hosting:publica`. No se desplegaron reglas ni datos de ejemplo" | Existen cachés de despliegue para **ambos** sites: `.firebase/hosting.d2ViXHB1YmxpYw.cache` (origen `web\public`) **y** `.firebase/hosting.bW9iaWxlXGJ1aWxkXHdlYg.cache` (origen `mobile\build\web`), más `mobile/.firebase/hosting.YnVpbGRcd2Vi.cache` (origen `build\web`) | **DIFERE.** El site `personal` (Flutter web) también se ha desplegado. Nombres decodificados en base64. |
| D3 | Línea 225: "`montoCentimos`, `adelantoCentimos`, `saldoCentimos` y `historialPagos` viajan **siempre en cero y vacío** desde el cliente… **no existe ninguna vía —ni pública ni de panel— para registrar un adelanto o un saldo**" | `firestore.rules:397 function efectivoValido(n)`, `:415 eventoEfectivoValido(a,r)`, y `:704 allow update: if transicionValida(n, id, 'reservas') \|\| efectivoValido(n);` con `metodoPago == 'efectivo_manual'`, saldo derivado `r.saldoCentimos == r.montoCentimos - r.adelantoCentimos` e historial append-only versionado | **DIFERE, y es la más importante.** El panel **sí** registra efectivo manual. La mitad pública de la afirmación **sigue siendo cierta** (`firestore.rules:292-295,313,377-378` exigen cero y `metodoPago == ''` en altas públicas). **Contradicción interna del propio documento**: la sección "Etapa operativa autorizada" (líneas 13-16, 29-sep-2026) sí describe el registro de efectivo manual con historial inmutable y saldo. Las líneas 178 y 223-225 son el "corte previo" que el propio documento declara histórico (líneas 22-23), pero **la sección de pagos quedó sin marcar como histórica**. |
| D4 | Línea 163: "Las **71 pruebas** de reglas activas" | En `tools/firebase/test/firestore.rules.test.mjs` hay **51 declaraciones `test(`**, 0 `test.each`, 0 `describe`, 0 `it`, 21 funciones auxiliares y 14 bucles `for`. Dos de esas declaraciones están dentro del bucle de la línea 828, que itera **14 duraciones** (30 a 600) y produce **28 casos de ejecución**. Cálculo estático: 49 declaraciones fuera del bucle + 28 generadas = **77 casos en ejecución**. Ninguna de las tres cifras (51, 77, 71) la puedo dar por buena sin ejecutar. | **NO CONFIRMADO.** Reconciliar 71 con 51/77 requiere ejecutar la suite. **No la ejecuté**: falta el emulador de Firestore (firebase.json declara el puerto 8081) y no lo arranco desde un análisis de arquitectura. Ver también N4. |
| D5 | Línea 163: "y las **20 pruebas** del prototipo" | Los 3 prototipos suman **35 declaraciones `test(`** (`daily-occupancy` 12, `private-index-daily` 13, `private-mirror-daily` 10), con 23 bucles `for` en total que pueden generar casos adicionales; ninguno usa `test.each` ni `it`. | **NO CONFIRMADO** por la misma razón: sin ejecutar, el conteo real de casos es desconocido y 35 no es 20. A esto se suma que `database.rules.test.mjs` **no usa el runner de `node:test`**: tiene 0 `test(` y 28 llamadas a `assert`, con un runner propio, de modo que la métrica "pruebas" no es homogénea entre suites y comparar cifras entre ellas no es válido. |
| D6 | Línea 190: "`d.ocupados.size() <= 36`" **en la línea 475** | La condición está en `mobile/firestore.rules:511` y `:556`. La línea 475 es `cantidad < 7 \|\| int(minutos[6]) == int(minutos[0]) + 180` | **DIFERE: número de línea desfasado.** |
| D7 | Líneas 206-221: 20 mutaciones, cada una con su número de línea | Contrasté **una por una** las 20 referencias contra `mobile/firestore.rules`. Resultado: **18 de 20 apuntan a una línea distinta** del archivo actual; solo `:93` (`autenticado() && exists(config)` en `puedeResolverCancha`) y `:50` (`!exists(rutaConfiguracion())` en `reclamoValido`) siguen siendo exactas, y `:55` acierta la línea pero no el valor (el documento dice `negocioId.size() <= 200`; el código tiene `>= 3` y `<= 64` en las líneas 54-55). Correspondencia real: 488→**524**, 483→**519**, 475→**511**, 485→**521**, 497→**533**, 499→**535**, 501→**537**, 494→**530**, 490→**526**, 404→**439**, 406→**329**, 332→**335**, 432→**468**, 453→**489**, 429→**465**, 213→**216**, 221→**224**. | **DIFERE, y solo en los números de línea.** Corrección importante: **las expresiones con `+ 1500`, `>= 0` o `hasAny` que aparecen en el documento NO son errores de transcripción** — el propio documento las introduce como mutación ("al cambiarlo por `hasAny`", línea 210; "ampliar 1440 a 1500", línea 217). Por eso **no afirmo que el documento se haya equivocado al copiarlas**. Lo único verificable es que el archivo de reglas creció o se reordenó desde que se escribió ese análisis de mutaciones y las referencias quedaron desfasadas. |
| D8 | — | — | **ELIMINADA.** Mi observación original era errónea: `r.minuto + r.duracion <= h.cierreMinuto + 1500` (documento, línea 217) es la **variante mutada**, y el documento lo dice explícitamente ("ampliar 1440 a 1500"). La base real en `mobile/firestore.rules:216` es `+ 1440`, tal como el propio documento reconoce. No hay error de transcripción que reportar; el desfase de esa referencia ya está cubierto en D7 (213 → 216). |

**Lectura de conjunto:** `ARQUITECTURA_SPARK.md` es un documento **acumulativo y no mantenido**: las
secciones iniciales reflejan el estado vigente (configuración, rutas, Auth, RTDB, presencia,
límites de abuso), mientras que las secciones finales (`Corte de datos existente`, `Pagos en cero`,
análisis de mutaciones) reflejan un **estado anterior del árbol de reglas**. Tomarlo como
especificación sin contrastarlo produce tres errores operables: creer que las reservas públicas están
deshabilitadas (D1), creer que el panel web no se ha desplegado (D2) y creer que no se puede cobrar
efectivo (D3).

### 5.3 NO CONFIRMADAS

| # | Afirmación | Qué falta |
|---|---|---|
| N1 | Línea 18: "el corte de producción inventariado contiene 13 documentos, dos clientes y un empleado" | El inventario está en `.production-audit/` (local, ignorado) y en `docs/VALIDACION_PRODUCCION_2026-09-29.md`. No se puede leer **el estado actual** de `glass-sintetico` desde el código. |
| N2 | Línea 200: "20 de 45 mutaciones las detecta la suite y 19 sobreviven" | Requiere ejecutar `mutar-prioritarias.mjs` contra el emulador. Los logs existen en `.production-audit/` pero no son verificables sin el emulador. **No lo ejecuté.** |
| N3 | Línea 192: "el escenario más pesado consume 8 accesos: 4 + 3 + 1" | Requiere ejecutar `tools/firebase/test/sonda-presupuesto.mjs` con emulador. El script existe (133 líneas) pero **no lo ejecuté**. |
| N4 | Línea 163: los conteos "71 pruebas" y "20 pruebas del prototipo" (ver D4, D5) | Requiere ejecutar `npm run reglas` y los 3 prototipos contra el emulador. **No ejecuté ninguna suite de pruebas en este análisis**; todas las cifras de conteo son estáticas, obtenidas contando construcciones en el código. |

> **Nota de alcance sobre D1 y D2:** ambas diferencias son entre el documento y **el código del
> repositorio**. El contenido realmente publicado en Firebase Hosting no se puede verificar desde
> el árbol local: solo existen las cachés de despliegue
> (`.firebase/hosting.d2ViXHB1YmxpYw.cache` → `web\public` y
> `.firebase/hosting.bW9iaWxlXGJ1aWxkXHdlYg.cache` → `mobile\build\web`, nombres decodificados de
> base64), que prueban que ambos sites se han desplegado en algún momento, no qué contienen hoy.

---

_Fase 1 completada. Documentos relacionados: `00_PROGRESO.md`, `02` (pendiente), `modulos/` (pendiente)._

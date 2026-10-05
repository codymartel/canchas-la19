# Informe técnico: checkpoint 1.4 (`version-sana-1.4`)

Fecha del corte: 2026-10-05
Alcance: estado del repositorio `canchas-cliente` en el commit `f3a1cac`, tag `version-sana-1.4`.
Naturaleza de este documento: informe de traspaso. Describe lo que existe, cómo se protege y qué se hizo. No introduce cambios de código.

---

## 1. Identidad actual del proyecto

| Elemento | Valor |
| --- | --- |
| Nombre del repositorio | `canchas-la19` |
| Ruta local | `C:\Users\User\Downloads\reservas_cancha\canchas-cliente` |
| Rama actual | `checkpoint/agenda-diaria-schema5` |
| HEAD corto | `f3a1cac` |
| HEAD completo | `f3a1cac1c0c733dcc51d432203226f9f0788f72f` |
| Tag actual | `version-sana-1.4` (anotado) |
| Remoto | `origin` → `https://github.com/codymartel/canchas-la19.git` |
| Sincronización | Al día con `origin/checkpoint/agenda-diaria-schema5`, divergencia `0 0` |
| Working tree | Limpio |
| Último commit | `f3a1cac Restore complete local Firebase emulator environment` |

### Confirmaciones explícitas

- Rama `checkpoint/agenda-diaria-schema5`: **confirmado**
- Commit `f3a1cac`: **confirmado**
- Tag `version-sana-1.4`: **confirmado**, resuelve a `f3a1cac1c0c733dcc51d432203226f9f0788f72f`
- Working tree limpio: **confirmado**
- Rama sincronizada con origin: **confirmado**
- Firebase producción **NO** desplegado durante este checkpoint: **confirmado**. Durante todo el trabajo de los pasos 3 y 4 los únicos comandos de `firebase deploy` ejecutados fueron `--dry-run`. `publicar-publica.mjs` y `publicar-personal.mjs` nunca llegaron a invocar `firebase deploy`.

### Historial reciente

```
f3a1cac Restore complete local Firebase emulator environment
09410f4 Harden Firebase Hosting deployments and isolate panel publishing
f79b208 Keep a per-version copy of the approved panel bundle outside Git
a8c5973 Add a guard test that inspects the web bundle for the RTDB plugin
fac5bc6 Fix panel live connection: rebuild lost the Realtime Database web plugin
092566c Add public registration rules, access tests and architecture docs
249ce11 Keep public form closed after panel connection regression and record rollback
8b3dc4b Require Google access and persist private registered clients with reservation limits
```

### Tags de versiones sanas

| Tag | Commit | Asunto del commit |
| --- | --- | --- |
| `version-sana-1.0` | `fac5bc6` | Fix panel live connection: rebuild lost the Realtime Database web plugin |
| `version-sana-1.1` | `a8c5973` | Add a guard test that inspects the web bundle for the RTDB plugin |
| `version-sana-1.2` | `f79b208` | Keep a per-version copy of the approved panel bundle outside Git |
| `version-sana-1.3` | `09410f4` | Harden Firebase Hosting deployments and isolate panel publishing |
| `version-sana-1.4` | `f3a1cac` | Restore complete local Firebase emulator environment |

Todos anotados. Los hashes de objeto de tag difieren del commit porque son objetos anotados; para resolver al commit hay que usar `git rev-list -n 1 <tag>`.

---

## 2. Historial de cambios (checkpoints 1.1 a 1.4)

### version-sana-1.1 — `a8c5973fe4cccd6458bd45e169b86e7357ffae90`

**Objetivo:** cubrir con una prueba el fallo por el que el panel había perdido la conexión en vivo a Realtime Database. `flutter test` corre en la VM, donde el plugin web real está presente, así que las pruebas unitarias pasaban aunque el shim de JavaScript no se hubiera compilado. La guarda mira el artefacto.

| Acción | Archivo | Función |
| --- | --- | --- |
| Creado | `mobile/test/bundle_web_test.dart` | 4 pruebas que leen `build/web/main.dart.js` y `build/web/index.html` |
| Creado | `mobile/dart_test.yaml` | Declara la etiqueta `bundle`, que permite saltarse esas pruebas sin compilar |
| Modificado | `docs/PANEL_CONEXION_RTDB_2026-10-05.md` | Documenta el análisis, la causa raíz y la guarda |

Las 4 pruebas comprueban: enlace de `.firebase_database` (el discriminante que faltaba), enlaces de `.firebase_core`, `.firebase_auth` y `.firebase_firestore`, ausencia de `demo-grass-local` y `demo-key` en release junto a presencia de `glass-sintetico-default-rtdb`, y que `index.html` no referencie `flutter_service_worker.js`.

**Validaciones:** `flutter test` dio 56 de 56. Comprobado que la guarda sirve: sustituyendo el bundle sano por el roto, la prueba 1 falla mientras las otras tres siguen pasando.

**Deploy:** no realizable desde este commit sin un bundle reconstruido. La evidencia histórica de publicaciones está en `docs/PANEL_CONEXION_RTDB_2026-10-05.md` y en la carpeta ignorada `.production-audit/`. Las versiones concretas publicadas en cada momento no son comprobables desde el estado actual de Git.

**Quedó protegido:** el bundle del panel pasó a estar verificado por pruebas antes de cualquier publicación.

### version-sana-1.2 — `f79b208a7f36da9be579cba7128637051ead28e4`

**Objetivo:** el bundle del panel no vive en Git (`mobile/.gitignore` excluye `/build/`) y `flutter clean` lo borra. Un artefacto roto sería irrecuperable: habría que recompilar y confiar. Este checkpoint crea el archivado por versión.

| Acción | Archivo | Función |
| --- | --- | --- |
| Creado | `tools/guardar-bundle.mjs` | Guarda, verifica y archiva copias por commit en `bundles/` |
| Modificado | `.gitignore` | Añade `bundles/` con el motivo por escrito |
| Modificado | `docs/PANEL_CONEXION_RTDB_2026-10-05.md` | Documenta el mecanismo y el manifiesto |

**Validaciones:** con el bundle sano el script guardó 38 archivos y 40,97 MB. Con el bundle roto se niega a guardar y sale con código 1, comprobado sustituyendo el bundle.

**Deploy:** no hubo publicación nueva como parte de este commit.

**Quedó protegido:** existe una copia aprobada del bundle por versión, fuera de Git, con manifiesto de SHA-256 por archivo.

### version-sana-1.3 — `09410f41822d58c98925b922e7f0294517d77a4e`

**Objetivo:** que modificar o desplegar la web pública no obligue a recompilar el panel ni arriesgara la conexión RTDB. El `firebase.json` de la raíz contenía los dos sites de Hosting, de modo que un `firebase deploy` a secas podía republicar cualquier web y las reglas.

| Acción | Archivo | Función |
| --- | --- | --- |
| Modificado | `firebase.json` | Elimina el array `hosting` completo, 89 líneas. Conserva `firestore`, `database` y `emulators` |
| Creado | `firebase.publica.json` | Solo `hosting:publica` |
| Creado | `firebase.personal.json` | Solo `hosting:personal` |
| Creado | `tools/publicar-publica.mjs` | Publica la web pública con validaciones previas |
| Creado | `tools/publicar-personal.mjs` | Publica el panel, exige copia verificada del bundle |
| Modificado | `docs/ARQUITECTURA_SPARK.md` | Añade la sección "Despliegues separados" |
| Modificado | `docs/PANEL_CONEXION_RTDB_2026-10-05.md` | Sustituye el comando de deploy por el script |
| Modificado | `docs/arquitectura/00_PROGRESO.md` | Actualiza inventario de archivos |
| Modificado | `docs/arquitectura/01_vision_global.md` | Actualiza inventario de archivos |

No se eliminó ningún archivo del repositorio. `.firebaserc` no se tocó.

**Validaciones realizadas en este checkpoint:**

- `firebase deploy --project glass-sintetico --dry-run` → `deploying database, firestore`. Sin `hosting`. Es la comprobación clave: un deploy normal ya no publica ninguna web.
- `firebase deploy --config firebase.publica.json --dry-run` → `deploying hosting`, `glass-sintetico-tienda.web.app`. Sin `database` ni `firestore`.
- `firebase deploy --config firebase.personal.json --dry-run` → `deploying hosting`, `glass-sintetico.web.app`. Sin `database` ni `firestore`.
- `flutter analyze` → `No issues found!`
- `flutter test` → 56 de 56
- `flutter test --tags=bundle` → 4 de 4
- `npm test` en `web/` → 22 de 22
- `node --check` en los dos scripts nuevos → 0
- `git diff --exit-code` sobre `.firebaserc`, `mobile/`, `web/`, `tools/guardar-bundle.mjs`, `mobile/test/bundle_web_test.dart` → 0

**Corrección aplicada durante el trabajo:** los scripts se escribieron inicialmente con `--only hosting:glass-sintetico-tienda` y `--only hosting:glass-sintetico`. El CLI los rechazó con `Hosting site or target ... not detected in firebase.json`, porque `--only` se resuelve contra nombres de `target`, no contra site IDs. Se corrigieron a `hosting:publica` y `hosting:personal`, y se añadió la validación explícita del site en `.firebaserc`.

**Prueba controlada del flujo completo:** `flutter build web --release` (67,0 s) → `flutter test` (56/56) → `guardar-bundle.mjs` (crea `bundles/f79b208`) → `--verificar` (0) → dry-run del deploy de Hosting (0). Antes de eso se comprobó el rechazo correcto de `publicar-personal.mjs` por falta de copia para `f79b208`.

**Deploy:** no se hizo ningún deploy real. Solo `--dry-run`.

**Quedó protegido:** los tres archivos de configuración Firebase son independientes. Ninguna singly-tarea puede publicar reglas por accidente, y cada publicación tiene un script con validaciones que abortan.

### version-sana-1.4 — `f3a1cac1c0c733dcc51d432203226f9f0788f72f`

**Objetivo:** recuperar un entorno local completo de emuladores. Al separar los Hosting, `firebase emulators:start` levantaba Auth, Firestore y RTDB pero ya no servía `web/public`, y `web/scripts/probar-navegador.mjs` esperaba el puerto 5000.

| Acción | Archivo | Función |
| --- | --- | --- |
| Creado | `firebase.emuladores.json` | Reglas + `hosting` de `web/public` + los cuatro emuladores |
| Creado | `tools/emuladores.mjs` | Lanza el entorno local con un solo comando |
| Modificado | `firebase.json` | Elimina el bloque `emulators.hosting` huérfano, 3 líneas |
| Modificado | `docs/ARQUITECTURA_SPARK.md` | Añade la sección "Desarrollo local" con tabla de puertos |
| Modificado | `docs/arquitectura/00_PROGRESO.md` | Actualiza inventario |
| Modificado | `docs/arquitectura/01_vision_global.md` | Actualiza inventario y la referencia obsoleta `firebase.json:98-115` |

Decisiones tomadas antes de implementar: `firebase.emuladores.json` declara `"site": "demo-grass-local-publica"` en vez de un `target`, para no depender de la resolución de targets de `.firebaserc` ni de que el proyecto ficticio exista en el servidor. Y se eliminó el puerto 5000 de `firebase.json` porque, sin sección `hosting` que servir, era una declaración inerte.

**Validaciones realizadas en este checkpoint:**

- `node --check tools/emuladores.mjs` → 0
- `npm test` en `web/` → 22 de 22, `npm run check` → 0
- `node tools/emuladores.mjs` → `All emulators ready! It is now safe to connect your app.` con los cuatro servicios escuchando. No hubo fallo por el proyecto ficticio `demo-grass-local`.
- Comprobaciones HTTP contra el servidor ya en marcha: `GET /` → 200 con 4762 bytes; `/firebase-config.js` → 200 con 1049; `/app.js` → 200 con 16958; `/acceso.js` → 200 con 5557; `/styles.css` → 200 con 5599; `/canchas/inexistente` → 200, reescritura SPA.
- Puertos liberados tras detener los procesos: 5000, 8081, 9000 y 9099 quedaron libres.
- `flutter test` → 56 de 56; `flutter test --tags=bundle` → 4 de 4
- `git diff --check` → 0
- `node tools/guardar-bundle.mjs` y `--verificar` para `f3a1cac` → ambos 0

**Deploy:** ninguno. `firebase.emuladores.json` no participa en ninguna publicación.

**Quedó protegido:** el entorno local completo se levanta con un comando, y los archivos de producción no se ven afectados.

---

## 3. Arquitectura actual

```
canchas-cliente/
├── firebase.json                  Reglas (Firestore, RTDB) + emuladores parciales. SIN hosting
├── firebase.publica.json          Producción: solo hosting:publica
├── firebase.personal.json         Producción: solo hosting:personal
├── firebase.emuladores.json       Solo local: reglas + hosting de web/public + 4 emuladores
├── .firebaserc                    Proyecto por defecto y targets de Hosting
├── .gitignore                     node_modules, *.log, .firebase/, .env*, .production-audit/, bundles/
│
├── mobile/                        PANEL INTERNO — Flutter
│   ├── lib/                       45 archivos .dart
│   │   ├── main.dart              Bootstrap, selección emulador/producción, 9 providers a mano
│   │   ├── firebase_options.dart  DefaultFirebaseOptions por plataforma
│   │   ├── core/                  config, data, domain, presentation, services, theme, widgets
│   │   ├── data/                  repositorios
│   │   ├── domain/                modelos
│   │   ├── services/              (vacío en su versión actual)
│   │   └── features/              21 módulos: acceso, auth, caja, clientes, colaboradores,
│   │                              configuracion, dashboard, empleados, encuestas, home,
│   │                              marketing, negocio, pedidos, planes, presencia, productos,
│   │                              promociones, quejas, reservas, sedes, stock
│   ├── test/                      10 archivos de pruebas unitarias
│   ├── integration_test/          flujo_navegador_test.dart, panel_test.dart
│   ├── web/                       index.html, manifest.json, favicon.png, icons/
│   ├── firestore.rules            46.070 bytes
│   ├── firestore.registro.rules   44.168 bytes  ← la que carga firebase.json
│   ├── firestore.indexes.json     719 bytes
│   ├── database.rules.json        4.325 bytes
│   ├── firebase.json              Config de flutterfire, no de Hosting
│   ├── dart_test.yaml             Declara la etiqueta `bundle`
│   └── build/web/                 Artefacto de `flutter build web`. IGNORADO por Git
│
├── web/                           WEB PÚBLICA — HTML y JS a mano, sin compilar
│   ├── public/                    14 archivos, 45.826 bytes en total. Se publica tal cual
│   │   ├── index.html             Marcado y carga de Firebase por CDN
│   │   ├── app.js                 Lógica principal de la página
│   │   ├── acceso.js              Acceso con Google y ficha de cliente
│   │   ├── reserva.js             Envío de la solicitud de reserva
│   │   ├── disponibilidad.js      Horarios y turnos
│   │   ├── precios.js             Reconstrucción de precios por versión
│   │   ├── lectura.js             Timeout de lecturas
│   │   ├── firebase-config.js     Config del proyecto y banderas
│   │   ├── styles.css
│   │   └── galeria/               3 SVG
│   ├── test/                      5 pruebas unitarias con node:test
│   ├── scripts/                   probar-navegador.mjs
│   ├── package.json               test y check. Sin build
│   └── .gitignore
│
├── tools/                         SCRIPTS DE SEGURIDAD Y PUBLICACIÓN (raíz)
│   ├── guardar-bundle.mjs         Archivo y verifica el bundle del panel
│   ├── publicar-publica.mjs       Publica la web pública
│   ├── publicar-personal.mjs      Publica el panel
│   ├── emuladores.mjs             Levanta el entorno local
│   └── firebase/                  Utilidades de operador y suites de reglas
│       ├── scripts/               configurar-admin, configurar-auth-publica,
│       │                          sincronizar-acceso-rtdb, sincronizar-datos-publicos,
│       │                          seed-emulator, verificar-web-publica
│       └── test/                  firestore.rules, database.rules, registro-publico,
│                                  web-flow, provisionamiento-rtdb, precios, sondas, prototipos
│
├── docs/                          15 documentos .md
│   ├── ARQUITECTURA_SPARK.md      Documento canónico de configuración y flujos
│   ├── PANEL_CONEXION_RTDB_2026-10-05.md   Análisis del fallo RTDB y sus guardias
│   └── (13 más)                   Informes de etapas anteriores
│   └── arquitectura/              00_PROGRESO.md, 01_vision_global.md
│
├── functions/                     SIN CÓDIGO. 0 archivos trackeados. Decisión del plan Spark
│                                  node_modules/ presente en disco pero ignorado
│
├── bundles/                       IGNORADO. Copias del bundle del panel por commit
│   ├── a8c5973/
│   ├── f79b208/
│   ├── 09410f4/
│   └── f3a1cac/
│
├── .production-audit/             IGNORADO. 239 archivos de evidencia privada
├── .firebase/                     Caché de despliegue. IGNORADO
└── *.log                          IGNORADO por *.log
```

### Responsabilidad por área

**`mobile/`** contiene el panel para el personal. Es el único código Dart del repositorio, 45 archivos en `lib/` con 21 módulos de funcionalidad en `features/` y una capa `core/`. Es un proyecto Flutter completo con plataformas móviles, web, desktop y `linux`. Su artefacto es `mobile/build/web`, que se genera con `flutter build web --release` y no está en Git.

**`web/`** contiene la web pública. No se compila: `package.json` solo declara `test` y `check`. Los archivos de `public/` se publican literalmente. Usa la API `compat` de Firebase 10.14.1 por CDN desde `index.html`, no paquetes. No usa Realtime Database en ningún archivo. Sus 5 pruebas son unitarias puras con `node:test`: inyectan un `document` falso y leen `app.js` como texto, no levantan nada.

**`tools/`** en la raíz contiene los cuatro scripts que sostienen las garantías de despliegue. Son Node sin dependencias externas, con `node:fs`, `node:path`, `node:child_process` y `node:crypto` únicamente. En `tools/firebase/` hay utilidades de operador con `firebase-admin` y las suites de pruebas de reglas, que sí necesitan `node_modules`.

**`docs/`** tiene 15 documentos. `ARQUITECTURA_SPARK.md` es el canónico de configuración y contiene las secciones "Configuración canónica", "Despliegues separados" y "Desarrollo local". Los demás son informes de etapas. `docs/arquitectura/` contiene el inventario del repositorio.

**`functions/`** está vacía de código, con 0 archivos trackeados en todo el historial. Es una decisión del plan Spark, sin Cloud Functions.

**`bundles/`** y **`.production-audit/`** están fuera de Git por diseño, no por descuido. La razón está escrita en `.gitignore`.

---

## 4. Firebase

### Proyecto de producción

`glass-sintetico`. Declarado en `.firebaserc` como `default`, en `mobile/firebase.json` y en `mobile/lib/firebase_options.dart`.

### Targets y sitios de Hosting

| Target | Sitio | Config | Uso |
| --- | --- | --- | --- |
| `publica` | `glass-sintetico-tienda` | `firebase.publica.json` | Producción, web pública |
| `personal` | `glass-sintetico` | `firebase.personal.json` | Producción, panel Flutter |

`.firebaserc` declara además `demo-grass-local` con `publica → demo-grass-local-publica` y `personal → demo-grass-local`. Ese mapeo no lo usa ningún flujo actual: el emulador local usa `"site"` directamente en `firebase.emuladores.json` para evitar depender de él.

### Los cinco archivos de configuración

#### `firebase.json`

```json
{
  "firestore": { "rules": "mobile/firestore.registro.rules",
                 "indexes": "mobile/firestore.indexes.json" },
  "database": { "rules": "mobile/database.rules.json" },
  "emulators": { "auth": {"port": 9099}, "firestore": {"port": 8081},
                 "database": {"port": 9000},
                 "ui": {"enabled": false}, "singleProjectMode": false }
}
```

Contiene las reglas de Firestore, las de Realtime Database y tres de los cuatro emuladores. **No contiene `hosting`**, ni raíz ni dentro de `emulators`.

#### `firebase.publica.json`

Solo `hosting`, con `target: "publica"`, `public: "web/public"`, reescritura `** → /index.html` y cabeceras de no-cache más `X-Content-Type-Options: nosniff` y `Referrer-Policy`.

#### `firebase.personal.json`

Solo `hosting`, con `target: "personal"`, `public: "mobile/build/web"`, misma reescritura y cabeceras de no-cache.

#### `firebase.emuladores.json`

Reglas de Firestore y RTDB, más `hosting` con `"site": "demo-grass-local-publica"` y `public: "web/public"`, más los cuatro emuladores. Exclusivamente desarrollo local.

#### `mobile/firebase.json`

Config de `flutterfire`, no de Hosting. Solo declara projectId y appIds para regenerar `firebase_options.dart`.

### Por qué un `firebase deploy` desde la raíz ya no publica ninguna web

Antes del checkpoint 1.3, `firebase.json` traía un array `hosting` con los dos sites. Un `firebase deploy` a secas desde la raíz publicaba **las dos webs, las reglas de Firestore, los índices y las reglas de RTDB**. Era el único vector capaz de pisar la conexión RTDB del panel, y el que ya había causado el incidente documentado en `docs/PANEL_CONEXION_RTDB_2026-10-05.md`.

El checkpoint 1.3 eliminó el array `hosting` de la raíz. El archivo ya no declara ningún site, así que el CLI no tiene nada que publicar. Verificado con dry-run:

```
$ firebase deploy --project glass-sintetico --dry-run
i  deploying database, firestore
```

Sin `hosting`. Ese es el cambio de fondo: la protección ya no depende de que alguien recuerde escribir `--only`, sino de que el archivo no contiene la sección.

### Firestore

- Autoridad definitiva de reservas y agenda.
- Reglas activas: `mobile/firestore.registro.rules`, 44.168 bytes.
- Índices: `mobile/firestore.indexes.json`.
- Existe también `mobile/firestore.rules`, 46.070 bytes, que **no** carga la configuración actual. Las referencias documentales a `mobile/firestore.rules` en `docs/ARQUITECTURA_SPARK.md` son anteriores a esta separación.

### Realtime Database

- Reglas: `mobile/database.rules.json`, 4.325 bytes.
- Presencia en vivo bajo `presencia/{negocio}/{cancha}/{dia}/{minuto}/{uid}/{sesion}`.
- Réplica de ACL en `acceso/{negocio}/{uid}` con rol, estado y nombre.
- Instancia: `https://glass-sintetico-default-rtdb.firebaseio.com`.
- Solo el panel la usa. La web pública no la referencia en ningún archivo.

### Authentication

- Correo y contraseña para administrador y empleados.
- Acceso con Google para clientes registrados en la web pública.
- Identidad anónima para solicitudes de reserva.
- Administrado por `mobile/lib/firebase_options.dart` en el panel y `web/public/firebase-config.js` en la web.

### Emuladores y puertos

| Servicio | Puerto | Config |
| --- | --- | --- |
| Auth | 9099 | `firebase.json` y `firebase.emuladores.json` |
| Firestore | 8081 | ambos |
| Realtime Database | 9000 | ambos |
| Hosting `web/public` | 5000 | solo `firebase.emuladores.json` |

El 5000 se quitó de `firebase.json` en el checkpoint 1.4 porque, sin sección `hosting`, era una declaración inerte.

### Comandos de publicación y entorno local

| Objetivo | Comando | Equivalente manual |
| --- | --- | --- |
| Publicar web pública | `node tools/publicar-publica.mjs` | `firebase deploy --project glass-sintetico --only hosting:publica --config firebase.publica.json` |
| Publicar panel Flutter | `node tools/publicar-personal.mjs` | `firebase deploy --project glass-sintetico --only hosting:personal --config firebase.personal.json` |
| Levantar emuladores | `node tools/emuladores.mjs` | `firebase emulators:start --config firebase.emuladores.json --project demo-grass-local` |

---

## 5. Scripts de seguridad y publicación

Los cuatro viven en la raíz de `tools/`. Todos resuelven la raíz del repositorio con `new URL('..', import.meta.url)`, así que funcionan desde cualquier directorio. En Windows usan `shell: true` para invocar `firebase`.

### `tools/guardar-bundle.mjs` (144 líneas)

**Propósito:** archivar el bundle del panel por commit, porque `mobile/build/web` no vive en Git y `flutter clean` lo borra.

**Modos:** sin argumentos guarda, `--verificar` compara, `--forzar` reemplaza.

**Inspecciona:** `mobile/build/web`, `git rev-parse HEAD`, `git describe --tags --exact-match`.

**Cómo calcula el destino:** la copia va a `bundles/<commit-corto>/`, y el commit se decide antes de copiar. Guardar dos veces el mismo commit falla sin `--forzar`.

**Manifiesto:** `MANIFIESTO.json` con commit completo, commit corto, etiqueta si el HEAD está etiquetado, fecha, y por cada archivo su ruta, tamaño y SHA-256. El campo `resumen` es el SHA-256 de la lista de hashes, así que cambia si cambia un solo byte de cualquier archivo, independientemente de los nombres.

**Aborta si:**
- No existe `mobile/build/web`.
- `main.dart.js` no contiene la cadena `.firebase_database`. Este es el discriminante del fallo de RTDB: el enlace de interoperabilidad con JavaScript. Si falta, la presencia deja de funcionar y el panel muestra «Sin conexión».

**Comandos externos:** ninguno. Solo `git`.

**Qué evita:** guardar un bundle roto como si fuera aprobado.

**Qué NO hace:** no compila, no despliega, no toca Git más allá de leer, no valida nada del bundle distinto del marcador RTDB.

### `tools/publicar-publica.mjs` (73 líneas)

**Propósito:** publicar solo la web pública en `glass-sintetico-tienda`.

**Constantes:** `firebase.publica.json`, proyecto `glass-sintetico`, target `publica`, sitio `glass-sintetico-tienda`.

**Validaciones, en orden, y todas abortan con código 1:**

1. `firebase.publica.json` debe tener **exactamente una** clave de nivel raíz, y debe ser `hosting`. Si alguien añade `database` o `firestore` al archivo, el script se niega.
2. Debe declarar un único site con `target: "publica"`.
3. `.firebaserc` debe resolver `publica` de `glass-sintetico` a `glass-sintetico-tienda`. Si el target apunta a otro sitio, aborta.
4. `web/public/index.html` debe existir.

**Comando externo:**

```
firebase deploy --project glass-sintetico --only hosting:publica --config firebase.publica.json
```

**Qué evita:** publicar reglas de RTDB o de Firestore desde el camino de la web pública; publicar en un sitio distinto del esperado; publicar el panel por accidente.

**Qué NO hace:** no compila nada, no verifica el bundle del panel, no tiene `--dry-run`.

**Riesgo residual:** no valida que las reglas de Firestore desplegadas en producción coincidan con las locales. La validación de datos y reglas queda en las suites de `tools/firebase/test/`.

### `tools/publicar-personal.mjs` (92 líneas)

**Propósito:** publicar solo el panel, y solo si hay copia aprobada del bundle.

**Constantes:** `firebase.personal.json`, proyecto `glass-sintetico`, target `personal`, sitio `glass-sintetico`.

**Validaciones, en orden, y todas abortan con código 1:**

1. `firebase.personal.json` debe tener exactamente una clave de nivel raíz, `hosting`.
2. Un único site con `target: "personal"`.
3. `.firebaserc` debe resolver `personal` a `glass-sintetico`.
4. `node tools/guardar-bundle.mjs --verificar` debe salir con código 0. Si falla, imprime que la copia no coincide y que no se publica, y sugiere guardar el bundle.

**Comando externo (solo si pasa la guarda):**

```
firebase deploy --project glass-sintetico --only hosting:personal --config firebase.personal.json
```

**Qué evita:** republicar `mobile/build/web` sin copia verificada. Como ese directorio no está en Git y `flutter clean` lo borra, republicarlo sin comprobación es la forma de perder un artefacto irrecuperable.

**Qué NO hace:** no compila, no guarda el bundle (solo lo verifica), no publica la web pública, no publica reglas, no tiene `--dry-run`.

**Nota operativa:** la guarda indexa por commit. Crear un commit nuevo invalida la copia anterior, porque la verificación busca `bundles/<commit-actual>/`. Tras cualquier commit hay que correr `node tools/guardar-bundle.mjs` otra vez antes de publicar.

### `tools/emuladores.mjs` (62 líneas)

**Propósito:** levantar el entorno local completo con un comando.

**Constantes:** `firebase.emuladores.json`, proyecto `demo-grass-local`.

**Validaciones:** ninguna. Es un envoltorio de arranque.

**Comando externo:**

```
firebase emulators:start --config firebase.emuladores.json --project demo-grass-local
```

Imprime la tabla de puertos y la URL `http://127.0.0.1:5000/?reservas=1` antes de delegar.

**Qué evita:** tener que recordar laFlags y el `--project`, y arrancar un entorno incompleto por error.

**Qué NO hace:** no despliega nada, no toca producción, no escribe datos.

### Resumen de protecciones

| Riesgo | Protección | Dónde |
| --- | --- | --- |
| Deploy accidental de cualquier web | `firebase.json` sin sección `hosting` | commit `09410f4` |
| Deploy al proyecto incorrecto | `--project glass-sintetico` hardcodeado en los dos scripts | `09410f4` |
| Hosting target incorrecto | Se valida `.firebaserc` contra el sitio esperado | `09410f4` |
| Config Firebase equivocada | Se exige una única clave `hosting` en cada config | `09410f4` |
| Publicar la web pública sin que exista | Se comprueba `web/public/index.html` | `09410f4` |
| Bundle Flutter incorrecto | Se comprueba el marcador `.firebase_database` | `a8c5973` |
| Bundle perteneciente a otro commit | `guardar-bundle.mjs --verificar` compara con `bundles/<HEAD>/` | `f79b208` y `09410f4` |
| Bundle sin copia aprobada | `publicar-personal.mjs` aborta antes de invocar Firebase | `09410f4` |
| RTDB roto tras compilar | `mobile/test/bundle_web_test.dart` | `a8c5973` |

---

## 6. Bundles del panel Flutter

`bundles/` está en `.gitignore:14`. El motivo está escrito en el propio archivo: `mobile/build/` lo borra `flutter clean`, y un artefacto de 41 MB no cabe razonablemente en el repositorio. Precedente: `.production-audit/`.

Cada copia vive en `bundles/<commit-corto>/` e incluye `MANIFIESTO.json`.

| Commit | Tag | Archivos | Bytes | MB | `main.dart.js` SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `a8c5973` | `version-sana-1.1` | 38 | 42.961.261 | 40,97 | `211c4069e7b840a0b7de3bbfcf134ffadbd9b2512375d002745d1d404e4c1a46` |
| `f79b208` | `version-sana-1.2` | 38 | 42.961.262 | 40,97 | `211c4069e7b840a0b7de3bbfcf134ffadbd9b2512375d002745d1d404e4c1a46` |
| `09410f4` | `version-sana-1.3` | 38 | 42.961.262 | 40,97 | `211c4069e7b840a0b7de3bbfcf134ffadbd9b2512375d002745d1d404e4c1a46` |
| `f3a1cac` | `version-sana-1.4` | 38 | 42.961.262 | 40,97 | `211c4069e7b840a0b7de3bbfcf134ffadbd9b2512375d002745d1d404e4c1a46` |

| Copia | `resumen` del manifiesto |
| --- | --- |
| `a8c5973` | `7d219f66fdbcd7c765e9500d8ebe33f9a363aa1effdfb80f9bc03c1b88b9c3f3` |
| `f79b208` | `9e354b64e9b2fb0799423fb97239b7f4f033d0293b562b3df6bffb99b145f963` |
| `09410f4` | `9e354b64e9b2fb0799423fb97239b7f4f033d0293b562b3df6bffb99b145f963` |
| `f3a1cac` | `9e354b64e9b2fb0799423fb97239b7f4f033d0293b562b3df6bffb99b145f963` |

### Estado de `f3a1cac`

```
ruta       bundles/f3a1cac
commit     f3a1cac1c0c733dcc51d432203226f9f0788f72f
tag        version-sana-1.4
archivos   38
bytes      42.961.262   (40,97 MB)
resumen    9e354b64e9b2fb0799423fb97239b7f4f033d0293b562b3df6bffb99b145f963
main.dart.js  211c4069e7b840a0b7de3bbfcf134ffadbd9b2512375d002745d1d404e4c1a46
```

### Sobre el resumen idéntico

Los resúmenes de `f79b208`, `09410f4` y `f3a1cac` son idénticos. Al comparar `a8c5973` contra `f79b208` se comprobó que 37 de los 38 archivos tienen SHA-256 igual y el único distinto es `flutter_bootstrap.js`, que varía entre compilaciones. `main.dart.js`, el código realmente compilado, es byte a byte el mismo en las cuatro copias. Es decir: los checkpoints 1.3 y 1.4 no movieron un byte del bundle. El bundle es el mismo artefacto aprobado en la versión sana 1.0.

El resumen de `a8c5973` difiere porque ese build produjo un `flutter_bootstrap.js` distinto.

---

## 7. Tests y validaciones

### Flutter

| Comando | Resultado | Qué protege |
| --- | --- | --- |
| `flutter analyze` | `No issues found!` | Análisis estático |
| `flutter test` | 56 de 56 | 10 archivos de pruebas unitarias: `agenda_test.dart`, `bundle_web_test.dart`, `efectivo_test.dart`, `flujo_test.dart`, `formatos_test.dart`, `horario_test.dart`, `parametros_test.dart`, `presencia_provider_test.dart`, `principales_test.dart`, `whatsapp_empleado_test.dart` |
| `flutter test --tags=bundle` | 4 de 4 | El artefacto compilado, no el código Dart |
| `flutter test --exclude-tags=bundle` | 52 de 52 | Solo las unitarias, sin exigir compilación previa |

`mobile/test/bundle_web_test.dart` es la guarda crítica. Sus 4 pruebas leen `build/web/main.dart.js` y `build/web/index.html`:

1. El bundle enlaza `.firebase_database`, la librería de interoperabilidad con JavaScript. Sin ella, la presencia en RTDB deja de funcionar y el panel muestra «Sin conexión». El enlace real es `v.G.firebase_database` seguido de `getDatabase(p, s)`.
2. Enlaza también `.firebase_core`, `.firebase_auth` y `.firebase_firestore`.
3. El bundle de release no menciona `demo-grass-local` ni `demo-key`, y sí menciona `glass-sintetico-default-rtdb`.
4. `index.html` no referencia `flutter_service_worker.js`.

Las pruebas están etiquetadas con `bundle` mediante `mobile/dart_test.yaml`, porque necesitan el bundle compilado. `flutter test` corre en la VM, donde el plugin real está presente, así que sin estas pruebas el fallo de RTDB pasaría inadvertido.

### Web pública

| Comando | Resultado | Qué protege |
| --- | --- | --- |
| `npm test` en `web/` | 22 de 22, 0 fail | `acceso.test.js`, `app.test.js`, `disponibilidad.test.js`, `lectura.test.js`, `seleccion.test.js` |
| `npm run check` en `web/` | 0 | Sintaxis de `app.js` y `reserva.js` |

Las 22 pruebas son unitarias puras con `node:test`. Leen los módulos ES de `public/` y ejecutan `app.js` como texto con un `document` falso inyectado. No necesitan emuladores ni red.

### Git

| Comando | Resultado | Qué protege |
| --- | --- | --- |
| `git diff --check` | 0 | Espacios finales y conflictos de whitespace |

### Firebase

Comprobaciones realizadas en el checkpoint 1.3, todas en modo `--dry-run`, sin publicar:

| Comando | Resultado |
| --- | --- |
| `firebase deploy --project glass-sintetico --dry-run` | `deploying database, firestore`. Sin hosting |
| `firebase deploy --config firebase.publica.json --dry-run` | `deploying hosting` → `glass-sintetico-tienda.web.app` |
| `firebase deploy --config firebase.personal.json --dry-run` | `deploying hosting` → `glass-sintetico.web.app` |
| `firebase deploy --config firebase.publica.json --dry-run` sin `--only` | Igual: solo hosting, porque el archivo no menciona reglas |
| `firebase deploy --config firebase.personal.json --dry-run` sin `--only` | Igual: solo hosting |

### Emuladores

`node tools/emuladores.mjs` en el checkpoint 1.4:

```
✔ All emulators ready! It is now safe to connect your app.

Authentication      127.0.0.1:9099
Firestore           127.0.0.1:8081
Database            127.0.0.1:9000
Hosting             127.0.0.1:5000
```

Comprobaciones HTTP contra el servidor en marcha, todas respondieron correctamente:

| Ruta | Respuesta | Bytes |
| --- | --- | --- |
| `/` | 200 | 4762 |
| `/firebase-config.js` | 200 | 1049 |
| `/app.js` | 200 | 16958 |
| `/acceso.js` | 200 | 5557 |
| `/styles.css` | 200 | 5599 |
| `/canchas/inexistente` | 200 | reescritura SPA a `index.html` |

Los tamaños coinciden exactamente con los archivos de `web/public`. Tras detener los procesos, los cuatro puertos quedaron libres.

Detalle a tener en cuenta: `GET /` no contiene la cadena `GRASS_FIREBASE_CONFIG`, porque ese script se carga aparte en `index.html:26`. Por eso se comprobó `/firebase-config.js` por separado.

### Nota sobre pruebas de reglas

Las suites de `tools/firebase/test/` (firestore, database, registro público, web-flow, aprovisionamiento) necesitan emuladores y se ejecutan con `firebase emulators:exec --project demo-grass-local`. **No se ejecutaron durante este checkpoint.** Sus últimos resultados registrados constan en los documentos de etapas anteriores. La cifra de pruebas aprobadas varía entre documentos porque `database.rules.test.mjs` no usa el runner de `node:test`, sino 28 llamadas a `assert` con un runner propio, lo que hace la métrica no homogénea entre suites.

`web/scripts/probar-navegador.mjs` requiere un chromedriver escuchando en `127.0.0.1:4444`, que este repositorio no instala. **No se ejecutó.**

---

## 8. Web pública

### Estructura

```
web/
├── public/              14 archivos, 45.826 bytes en total
│   ├── index.html       4.762 bytes
│   ├── app.js           16.958 bytes
│   ├── acceso.js        5.557 bytes
│   ├── styles.css       5.599 bytes
│   ├── firebase-config.js  1.049 bytes
│   ├── reserva.js       4.648 bytes
│   ├── disponibilidad.js 2.595 bytes
│   ├── precios.js       1.031 bytes
│   ├── lectura.js       510 bytes
│   └── galeria/         3 SVG
├── test/                5 archivos de pruebas
├── scripts/             probar-navegador.mjs (14.853 bytes)
├── package.json         name: grass-web-publica, type: module
└── .gitignore
```

Los tamaños verificados por HTTP coinciden con los de disco.

### Archivos principales

**`index.html`** (26 líneas, muy compacto). Carga la API `compat` de Firebase 10.14.1 por CDN desde `www.gstatic.com`: `firebase-app-compat.js`, `firebase-auth-compat.js` y `firebase-firestore-compat.js`. Después carga `firebase-config.js` y `app.js` como módulo ES. Contiene el marcado de la página: selector de día operativo, rejilla de canchas, aviso de reservas deshabilitadas, bloque de registro con Google, formulario de reserva y pie de promociones.

**`firebase-config.js`** (20 líneas). Define `window.GRASS_FIREBASE_CONFIG` con el proyecto `glass-sintetico`. En `localhost` o `127.0.0.1` fuerza `projectId: 'demo-grass-local'` y `apiKey: 'demo-key'`. Calcula `window.GRASS_RESERVAS_HABILITADAS`: en local exige `?reservas=1` en la consulta; en producción depende de `const reservasProduccionHabilitadas`, que **actualmente es `false`**. Es decir, el formulario está cerrado en producción por diseño.

**`app.js`** (16.958 bytes, 258 líneas). Importa los cinco módulos hermanos. Inicializa Firebase, y en `localhost` o `127.0.0.1` engancha los emuladores:

```js
if (['localhost','127.0.0.1'].includes(location.hostname)) {
  auth.useEmulator('http://127.0.0.1:9099');
  db.useEmulator('127.0.0.1',8081);
}
```

Funciones principales: `aplicarEstadoReservas`, `mensaje`, `errorMensaje`, `opcion`, `telefonoNormalizado`, `rutaDia`, `libresCancha`, `tarjetasCanchas`, `tarjetasPromociones`, `seleccionarHora`, `actualizarHoras`, `actualizarPrecio`, `observarPrecios`, `cargarConfiguracion`, `cargar`. Importa `configurarAcceso` de `acceso.js`, `reconstruirPrecios` y `calcularPrecio` de `precios.js`, `conTiempoLimite` de `lectura.js`, nueve utilidades de `disponibilidad.js` y `solicitarReserva` de `reserva.js`.

**`acceso.js`** (4 exports). `registrarCliente` crea la ficha en `negocios/{negocio}/clientesRegistrados/{uid}` con transacción. `normalizarTelefonoRegistro` normaliza a formato internacional con prefijo `51` para los casos de 9 dígitos. `guardarFichaCliente` exige que el proveedor de Google esté presente y valida nombre y teléfono. `configurarAcceso` gestiona `onAuthStateChanged`, el límite de solicitudes activas y la suscripción a la reserva pendiente.

**`reserva.js`** (1 export). `solicitarReserva`.

**`disponibilidad.js`** (9 exports). `hora`, `soles`, `hoyLima`, `diaOperativoLima`, `iniciosDeTurno`, `siguienteDia`, `leerHorario`, `intervaloSeleccionado`.

**`precios.js`** (2 exports). `reconstruirPrecios` y `calcularPrecio`, que reconstruyen por versión y suman precios y adelantos por hora elegida.

**`lectura.js`** (1 export). `conTiempoLimite`, que corta una lectura que no responde a los 15 segundos.

**`styles.css`**. Minificado en una línea por regla. Usa variables CSS, y las casillas de hora ocupada son `<strong>✕ Ocupado</strong>` sin casilla seleccionable.

### Integración con Firebase

La web pública **no usa Realtime Database**. Una búsqueda de `firebase_database`, `database(` y `realtime` en todo `web/` no devuelve resultados. Solo usa Firestore y Auth. Esta separación es la base de que el bundle del panel y su plugin RTDB no puedan alcanzarla.

### Ejecución local

```
node tools/emuladores.mjs
```

Y abrir `http://127.0.0.1:5000/?reservas=1`.

El parámetro `?reservas=1` es obligatorio: sin él, `firebase-config.js` deja el formulario oculto y todos sus controles inutiles, porque en local `GRASS_RESERVAS_HABILITADAS` solo es `true` cuando la consulta lo pide.

Sin emuladores, `web/` se puede probar en parte con `npm test`, que no necesita red ni puertos.

### Comprobaciones del checkpoint 1.4

Detalladas en la sección 7: las cinco rutas respondieron 200 con los tamaños esperados y una ruta inexistente devolvió 200 por la reescritura SPA.

---

## 9. Panel Flutter

### Estructura

```
mobile/
├── lib/                    45 archivos .dart
│   ├── main.dart           Bootstrap
│   ├── firebase_options.dart
│   ├── core/               config, data, domain, presentation, services, theme, widgets
│   │   ├── data/servicios.dart
│   │   ├── domain/formatos.dart, negocio.dart, resultado.dart
│   ├── data/repositories/
│   ├── domain/models/
│   ├── features/           21 módulos
│   └── services/           vacío
├── test/                   10 archivos
├── integration_test/       flujo_navegador_test.dart, panel_test.dart
├── web/                    index.html, manifest.json, favicon.png, icons/
├── build/web/              artefacto, ignorado
├── firestore.rules, firestore.registro.rules, firestore.indexes.json
├── database.rules.json
├── firebase.json           flutterfire
└── dart_test.yaml          etiqueta `bundle`
```

### Dependencias Firebase

De `mobile/pubspec.yaml`: `firebase_core ^3.6.0`, `firebase_auth ^5.3.1`, `firebase_database ^11.1.4`, y `cloud_firestore` (declarada en el mismo bloque). SDK de Dart `^3.12.2`.

`firebase_database` se importa en tres archivos: `lib/main.dart`, `lib/core/data/servicios.dart` (solo `FirebaseDatabase`) y `lib/features/presencia/data/presencia_repository.dart`.

### Firebase en el panel

**`firebase_options.dart`** declara `DefaultFirebaseOptions.currentPlatform` con opciones para web, Android e iOS. En `TargetPlatform.windows` devuelve las opciones web; en Linux y macOS lanza `UnsupportedError`. La URL de RTDB es la misma en las tres plataformas: `https://glass-sintetico-default-rtdb.firebaseio.com`.

**`main.dart`** decide entre producción y emulador con una constante de compilación:

```dart
const host = String.fromEnvironment('EMULATOR_HOST');
```

Si está vacía, usa `DefaultFirebaseOptions.currentPlatform`. Si no, construye `FirebaseOptions` con `apiKey: 'demo-key'`, `projectId: 'demo-grass-local'` y `databaseURL: 'https://demo-grass-local-default-rtdb.firebaseio.com'`, y entonces engancha los tres emuladores:

```dart
if (host.isNotEmpty) {
  db.useFirestoreEmulator(host, 8081);
  await auth.useAuthEmulator(host, 9099);
  await authAltas.useAuthEmulator(host, 9099);
  realtime.useDatabaseEmulator(host, 9000);
}
```

Hay una instancia secundaria de Auth, `authAltas`, creada por `authSecundaria`. Firestore usa `Settings(persistenceEnabled: false)`. Los 9 providers se construyen a mano, sin contenedor de inyección de dependencias.

**Realtime Database:** presencia en vivo. `presencia_provider.dart` convierte cualquier error de lectura en `EstadoConexionPresencia.sinConexion`, que es exactamente por lo que un bundle sin el plugin web se manifestaba como «Sin conexión» con la agenda visible. `presencia_repository.dart` escribe la actividad del propio UID, instala `onDisconnect().remove()`, renueva el anuncio y aplica una expiración de catorce minutos.

### Configuración web del panel

`mobile/web/` contiene `index.html`, `manifest.json`, `favicon.png` e iconos. El `index.html` de `mobile/build/web` no referencia `flutter_service_worker.js`, con estrategia PWA `none`, y una de las pruebas lo verifica para que no se reactiva por descuido: un service worker activo podría servir un bundle antiguo.

### Mecanismo del bundle

`flutter build web --release` produce `mobile/build/web`. Está en `.gitignore` de `mobile/` como `/build/`. `flutter clean` lo borra.

El riesgo documentado: una compilación concreta perdió la implementación web de RTDB durante el tree shaking de dart2js. El bundle salió con el programa de Firestore pero sin el de RTDB. Sin plugin registrado, el paquete cae a su canal de método antiguo y sale `MissingPluginException` en `Query#observe`. De cuatro builds cacheados en `.dart_tool/flutter_build`, tres incluían el plugin y solo uno lo perdió. `.last_build_id` no sirve para distinguirlos, porque deriva de la configuración y no del contenido: el build roto y el sano dieron el mismo id.

Por eso existen las dos barreras: la guarda de pruebas (`mobile/test/bundle_web_test.dart`) y el archivado (`tools/guardar-bundle.mjs`).

### Guardias relacionadas con el bundle

| Guardia | Qué detecta |
| --- | --- |
| `mobile/test/bundle_web_test.dart` prueba 1 | Falta el enlace `.firebase_database` en el bundle |
| `mobile/test/bundle_web_test.dart` prueba 2 | Falta `.firebase_core`, `.firebase_auth` o `.firebase_firestore` |
| `mobile/test/bundle_web_test.dart` prueba 3 | Bundle de release que apunta a emuladores o que no apunta a producción |
| `mobile/test/bundle_web_test.dart` prueba 4 | `index.html` que reactivó el service worker |
| `mobile/dart_test.yaml` | Permite saltar las pruebas de `bundle` sin compilar |
| `tools/guardar-bundle.mjs` | Bundle sin el marcador RTDB, o que no coincide con la copia aprobada |
| `tools/publicar-personal.mjs` | Bundle sin copia verificada para el commit actual |
| `firebase.personal.json` | Que la publicación del panel arrastre reglas o la web pública |

### Lo que el panel no tiene

No hay verificación de pagos, ni pasarela Culqi, ni WhatsApp, ni Cloudinary, ni correo saliente, ni webhooks. `whatsappReservas` es un campo de la ficha del empleado, no una integración. No hay Cloud Functions: `functions/` tiene 0 archivos trackeados en todo el historial.

---

## 10. Archivos protegidos

### Protección crítica

Estos archivos sostienen las garantías de despliegue. Modificarlos sin intención puede permitir un deploy accidental, publicar en el sitio equivocado, o republicar un bundle no verificado.

| Archivo | Por qué importa |
| --- | --- |
| `firebase.json` | Su ausencia de `hosting` es lo que impide que un `firebase deploy` normal publique una web. Si alguien reintroduce un array `hosting`, se pierde la protección principal |
| `firebase.publica.json` | Config del sitio de la web pública. Debe contener solo `hosting` |
| `firebase.personal.json` | Config del sitio del panel. Debe contener solo `hosting` |
| `firebase.emuladores.json` | Único lugar con `hosting` local. Si se mezcla con los de producción, se rompe el aislamiento |
| `.firebaserc` | Define a qué sitio apunta cada target. Los dos scripts de publicación lo leen y abortan si el mapeo cambia |
| `tools/guardar-bundle.mjs` | Único mecanismo de archivado. El marcador `.firebase_database` que comprueba es el discriminante del fallo de RTDB |
| `tools/publicar-personal.mjs` | Puerta de entrada a la publicación del panel. Encadena config, target, sitio y copia verificada |
| `tools/publicar-publica.mjs` | Puerta de entrada a la publicación de la web. Aporta la comprobación de `index.html` |
| `tools/emuladores.mjs` | Único punto de arranque del entorno local |
| `.gitignore` | Define qué queda fuera de Git: `bundles/` y `.production-audit/`. Quitar `bundles/` metería artefactos de 41 MB en el repositorio |
| `bundles/f3a1cac/` | Copia aprobada del bundle del panel para el HEAD actual. **Fuera de Git.** Sin ella, el panel no se puede publicar |

### Protección importante

Tests y configuración cuya modificación cambia el comportamiento verificado.

| Archivo | Por qué importa |
| --- | --- |
| `mobile/test/bundle_web_test.dart` | La única prueba que mira el artefacto compilado. Si se relaja, el fallo de RTDB vuelve a pasar inadvertido |
| `mobile/dart_test.yaml` | Declara la etiqueta `bundle`. Sin ella no se puede correr solo las unitarias sin compilar |
| `mobile/firestore.registro.rules` | Reglas de Firestore que se despliegan. 44.168 bytes |
| `mobile/database.rules.json` | Reglas de RTDB. Lo que gobierna la presencia en vivo y la ACL |
| `mobile/firestore.indexes.json` | Índices de Firestore |
| `mobile/firebase.json` | Config de flutterfire. Modificarla cambia qué se genera en `firebase_options.dart` |
| `mobile/lib/firebase_options.dart` | Config del panel por plataforma. Un cambio aquí altera a qué proyecto y a qué RTDB apunta el panel |
| `web/public/firebase-config.js` | Contiene la bandera `GRASS_RESERVAS_HABILITADAS`. Está en `false` para producción; pasarla a `true` abre el formulario público y eso exige una deliberación aparte |
| `web/test/*.test.js` | 22 pruebas de la web pública |
| `docs/ARQUITECTURA_SPARK.md` | Documento canónico. Las secciones "Configuración canónica", "Despliegues separados" y "Desarrollo local" son la referencia operativa |

### Archivos normales

Pueden evolucionar con normalidad durante el desarrollo, con sus pruebas.

| Ruta | Nota |
| --- | --- |
| `mobile/lib/**` | 45 archivos Dart, 21 módulos de funcionalidad |
| `mobile/test/*.dart` | 10 pruebas unitarias |
| `mobile/integration_test/**` | 2 pruebas de integración |
| `mobile/web/**` | Configuración web del panel |
| `web/public/**` | La web pública. Con `npm test` y `npm run check` como red |
| `web/scripts/**` | Utilidades de navegador |
| `docs/**` | Informes. Excepto `ARQUITECTURA_SPARK.md` |
| `tools/firebase/scripts/**` | Utilidades de operador |
| `tools/firebase/test/**` | Suites de reglas |

---

## 11. Flujo seguro de trabajo

### Procedimiento general

1. **Inspeccionar.** `git status` y `git log --oneline -5`. Confirmar HEAD y que el árbol está limpio.
2. **Modificar.** Solo en el área afectada. No tocar archivos protegidos sin motivo explícito.
3. **Ejecutar tests.** Según el área: `flutter analyze` y `flutter test` para el panel; `npm test` y `npm run check` en `web/` para la web pública.
4. **Verificar el diff.** `git diff` para leerlo, `git diff --check` para whitespace, `git diff --exit-code <protegidos>` para confirmar que nada protegido se movió.
5. **Commit.** Añadir solo los archivos previstos. Revisar `git status` después del `add` para confirmar el conjunto.
6. **Tag, si corresponde.** `git tag -a version-sana-x.y -m "..."`. Solo en checkpoints cerrados y verificados.
7. **Bundle, si se tocó el panel.** `node tools/guardar-bundle.mjs`.
8. **Verificar el bundle.** `node tools/guardar-bundle.mjs --verificar`.
9. **Push.** `git push origin <rama>` y `git push origin <tag>` por separado. Verificar con `git ls-remote`.
10. **Deploy, solo cuando se solicite.** Nunca como parte del desarrollo.

### Antes de publicar el panel Flutter

Obligatorios, en este orden:

```
flutter build web --release
flutter test                              # incluye la guarda del bundle
node tools/guardar-bundle.mjs             # archiva para el commit actual
node tools/guardar-bundle.mjs --verificar # confirma la copia
node tools/publicar-personal.mjs          # valida y publica
```

Detalle importante: `guardar-bundle.mjs` indexa por commit, así que debe correr **después** del commit. Si se corre antes, guarda bajo el commit anterior y `publicar-personal.mjs` abortará por falta de copia para el HEAD actual. Este punto se verificó en la práctica durante estos pasos: se observó el rechazo correcto de `publicar-personal.mjs` por falta de copia.

### Antes de publicar la web pública

```
npm test                                   # en web/
npm run check                              # en web/
node tools/publicar-publica.mjs
```

No hace falta `flutter build web`, ni `flutter test`, ni archivar bundle. La web no se compila. Esta es la ganancia concreta del checkpoint 1.3: un cambio en la web pública no toca el panel.

### Antes de tocar emuladores

```
node tools/emuladores.mjs
```

Y abrir `http://127.0.0.1:5000/?reservas=1`. Para el panel con emuladores: `EMULATOR_HOST=127.0.0.1 flutter run -d chrome`.

### Prohibiciones permanentes

- No ejecutar `firebase deploy` sin `--only` desde la raíz esperando que sea inocuo. Ya es inocuo para las webs, pero publicaría las reglas.
- No publicar el panel sin `guardar-bundle.mjs --verificar` en verde.
- No compilar en release con `EMULATOR_HOST` definido. La guarda lo detecta, pero es mejor no hacerlo.
- No tocar `web/public/firebase-config.js` para abrir el formulario en producción sin una deliberación explícita.
- No añadir dependencias a `tools/` raíz. Los cuatro scripts son Node puro a propósito.

---

## 12. ESTADO ACTUAL DEL CHECKPOINT 1.4

| Elemento | Estado |
| --- | --- |
| Rama | `checkpoint/agenda-diaria-schema5`, sincronizada con origin, divergencia 0 0 |
| HEAD | `f3a1cac1c0c733dcc51d432203226f9f0788f72f` |
| Tag | `version-sana-1.4`, anotado, resuelve al mismo commit |
| GitHub | Rama y tag subidos a `https://github.com/codymartel/canchas-la19.git` |
| Working tree | Limpio |
| Bundle | `bundles/f3a1cac/` verificado, fuera de Git |
| Digest | `9e354b64e9b2fb0799423fb97239b7f4f033d0293b562b3df6bffb99b145f963` |
| main.dart.js SHA | `211c4069e7b840a0b7de3bbfcf134ffadbd9b2512375d002745d1d404e4c1a46` |
| Firebase producción | **No desplegado.** Ningún deploy en los checkpoints 1.3 ni 1.4 |
| Deploy público | No realizado. El panel publicado sigue siendo el de la versión sana anterior |
| Deploy panel | No realizado |
| Tests | `flutter test` 56/56, `flutter test --tags=bundle` 4/4, `npm test` 22/22, `npm run check` 0, `flutter analyze` limpio, `git diff --check` 0 |
| Emuladores | Verificados en 1.4 con los cuatro servicios y comprobaciones HTTP correctas |
| Suites de reglas | No ejecutadas en estos checkpoints |

---

## 13. Cambios pendientes y riesgos

### Pendientes conocidos

**`publicar-personal.mjs` y `publicar-publica.mjs` no aceptan `--dry-run`.** Para verificar un deploy hoy hay que copiar el comando a mano y añadir `--dry-run`. Eso es exactamente el tipo de paso que en el futuro se olvida, y es el mismo patrón que causó el incidente original: disciplina escrita en un documento en vez de una barrera en el código. El arreglo son unas líneas por script. **No está hecho.**

**`probar-navegador.mjs` no es ejecutable tal cual.** Necesita un chromedriver escuchando en `127.0.0.1:4444`, que este repositorio no instala. Ahora que el emulador de Hosting sirve `web/public` correctamente, es el siguiente eslabón natural para cerrar el ciclo de pruebas de navegador. **No está hecho.**

**`emulators:start` sin `--config` ya no sirve la web.** `firebase emulators:start` desde la raíz levanta Auth, Firestore y RTDB, pero no hay sección `hosting` que servir. El puerto 5000 se quitó de `firebase.json` en el 1.4 precisamente para que no sugiere lo contrario. El comando completo es `node tools/emuladores.mjs`. Esto está documentado, pero es un cambio de comportamiento respecto a antes del checkpoint 1.3.

**Las copias de `bundles/` tienen un índice por commit.** Cada commit nuevo requiere `node tools/guardar-bundle.mjs` antes de publicar. No es un fallo, es el diseño, pero es una fricción recurrente y conviene tenerla presente.

### Riesgos técnicos

**`firebase.json` y `firebase.emuladores.json` comparten las rutas de reglas.** Ambos apuntan a `mobile/firestore.registro.rules` y `mobile/database.rules.json`. Si cambian esas rutas, hay que actualizar los dos archivos. No hay ninguna prueba que detecte la desincronización.

**`mobile/firestore.rules` existe pero no se despliega.** La configuración carga `mobile/firestore.registro.rules`. El otro archivo, de 46.070 bytes, queda como residuo. Peligro concreto: alguien edita `mobile/firestore.rules` creyendo que es la activa y el cambio no tiene efecto. Las referencias documentales a `mobile/firestore.rules` en `docs/ARQUITECTURA_SPARK.md` son anteriores a esta separación y contributes a la confusión.

**`bundles/` es local y no está respaldado.** Cuatro copias de 41 MB en un solo disco. Si se pierde la carpeta, el bundle aprobado hay que reconstruirlo compilando. Firebase Hosting conserva las versiones publicadas y se podría recuperar con `firebase hosting:clone`, pero el CLI no expone el identificador de versión y habría que leerlo en la consola. **No hay segunda red efectiva.**

**Los hashes de bundle sensibles no están respaldados fuera de la máquina.** `211c4069…` y `9e354b64…` viven en este informe y en los manifiestos locales. Si se pierde `bundles/`, no hay forma de verificar una reconstrucción contra el artefacto aprobado.

**Las versiones publicadas en producción no son verificables desde el repositorio.** Los documentos de etapas citan hashes de versión de Hosting concretos, pero desde el código no se puede confirmar qué versión está sirviendo cada sitio sin descargar los bundles. La verificación real requiere `curl` con cache-buster contra `glass-sintetico.web.app` y `glass-sintetico-tienda.web.app`.

**La métrica de "pruebas" no es homogénea.** `database.rules.test.mjs` no usa `node:test` sino 28 llamadas a `assert` con un runner propio. Comparar su recuento con el de `firestore.rules.test.mjs` es inválido, y los documentos existentes lo hacen en varios puntos.

**`docs/arquitectura/01_vision_global.md` contiene referencias por número de línea.** Algunas quedaron obsoletas ya por el paso de los pasos 3 y 4. El documento es una auditoría de un estado pasado, no una descripción viva, y su tabla de discrepancias lo reconoce. No es un defecto, pero leerlo como描述 actual puede confundir.

**`web/public/firebase-config.js` tiene `reservasProduccionHabilitadas = false`.** El formulario público está cerrado. Cambiarlo abre reservas en producción y exige verificación previa de reglas, panel y datos. No es un cambio de los pasos 3 ni 4, pero es el flag más sensible del repositorio.

### Dependencias entre archivos

```
.firebaserc  ──────────────►  publicar-publica.mjs, publicar-personal.mjs
                                (leen targets; abortan si el mapeo cambia)

firebase.publica.json  ────►  publicar-publica.mjs
firebase.personal.json ────►  publicar-personal.mjs
firebase.emuladores.json ──►  emuladores.mjs
firebase.json  ────────────►  firebase deploy (reglas), emulators:start (parcial)

bundles/<commit>/  ◄────────  guardar-bundle.mjs (escribe)
                            publicar-personal.mjs (lee y compara)

mobile/build/web/  ◄──────── flutter build web (produce)
                            guardar-bundle.mjs (lee)
                            publicar-personal.mjs (publica)
                            bundle_web_test.dart (lee)

mobile/firestore.registro.rules  ──┬──►  firebase.json
                                   └──►  firebase.emuladores.json

mobile/database.rules.json        ──┬──►  firebase.json
                                   └──►  firebase.emuladores.json

web/public/  ──────►  firebase.publica.json (publica)
              └──►  firebase.emuladores.json (sirve en local)

mobile/test/bundle_web_test.dart  ──►  mobile/build/web (leído)
mobile/dart_test.yaml             ──►  mobile/test/bundle_web_test.dart (etiqueta)
```

### Lo que no debe tocarse todavía

- Los cuatro scripts de `tools/`. Funcionan y están verificados.
- Los cinco archivos de configuración Firebase de la raíz. Son la base del aislamiento.
- `mobile/test/bundle_web_test.dart`. Es la única defensa que ve el artefacto.
- `.gitignore`. `bundles/` y `.production-audit/` deben seguir fuera de Git.
- `bundles/f3a1cac/`. Es la copia que permite publicar el panel desde el HEAD actual.

---

## 14. Archivos modificados por cada checkpoint

Cambios comprobables mediante Git en el rango `a8c5973..f3a1cac`, más el propio `a8c5973`.

| Commit | Archivo | Acción | Propósito |
| --- | --- | --- | --- |
| `a8c5973` | `mobile/test/bundle_web_test.dart` | Creado | 4 pruebas que verifican el bundle compilado, en especial el enlace `.firebase_database` |
| `a8c5973` | `mobile/dart_test.yaml` | Creado | Declara la etiqueta `bundle` para correr unitarias sin compilar |
| `a8c5973` | `docs/PANEL_CONEXION_RTDB_2026-10-05.md` | Modificado | Documenta el análisis del fallo y la guarda nueva |
| `f79b208` | `tools/guardar-bundle.mjs` | Creado | Archiva y verifica copias del bundle por commit en `bundles/` |
| `f79b208` | `.gitignore` | Modificado | Añade `bundles/` con el motivo por escrito |
| `f79b208` | `docs/PANEL_CONEXION_RTDB_2026-10-05.md` | Modificado | Documenta el mecanismo del manifiesto y el resumen |
| `09410f4` | `firebase.json` | Modificado | Elimina el array `hosting` de 89 líneas; conserva reglas y emuladores |
| `09410f4` | `firebase.publica.json` | Creado | Solo `hosting:publica` |
| `09410f4` | `firebase.personal.json` | Creado | Solo `hosting:personal` |
| `09410f4` | `tools/publicar-publica.mjs` | Creado | Publica la web pública con validación de config, target, sitio y existencia |
| `09410f4` | `tools/publicar-personal.mjs` | Creado | Publica el panel exigiendo copia verificada del bundle |
| `09410f4` | `docs/ARQUITECTURA_SPARK.md` | Modificado | Añade "Despliegues separados" |
| `09410f4` | `docs/PANEL_CONEXION_RTDB_2026-10-05.md` | Modificado | Sustituye el comando de deploy por el script |
| `09410f4` | `docs/arquitectura/00_PROGRESO.md` | Modificado | Actualiza inventario de archivos |
| `09410f4` | `docs/arquitectura/01_vision_global.md` | Modificado | Actualiza inventario de archivos |
| `f3a1cac` | `firebase.emuladores.json` | Creado | Reglas + hosting local + los cuatro emuladores |
| `f3a1cac` | `tools/emuladores.mjs` | Creado | Levanta el entorno local con un comando |
| `f3a1cac` | `firebase.json` | Modificado | Elimina el bloque `emulators.hosting` huérfano |
| `f3a1cac` | `docs/ARQUITECTURA_SPARK.md` | Modificado | Añade "Desarrollo local" con puertos y comandos |
| `f3a1cac` | `docs/arquitectura/00_PROGRESO.md` | Modificado | Actualiza inventario |
| `f3a1cac` | `docs/arquitectura/01_vision_global.md` | Modificado | Actualiza inventario y la referencia `firebase.json:98-115` |

Ningún archivo del repositorio fue eliminado en este rango.

---

## 15. Nota sobre este documento

Este informe se creó para el traspaso y **no está commiteado**. Aparece como archivo nuevo sin seguimiento en `git status`. Si se decide incluirlo, conviene hacerlo en un commit propio, con su mensaje, y no mezclado con cambios de código.

Las fuentes de todo lo afirmado aquí son: el estado de Git en el momento de redactarlo, la lectura directa de los archivos de configuración y de los cuatro scripts, los manifiestos de `bundles/`, y la salida de los comandos de validación ejecutados durante los pasos 3 y 4. Donde no había forma de comprobar algo desde el estado actual, se ha indicado explícitamente como no comprobable.

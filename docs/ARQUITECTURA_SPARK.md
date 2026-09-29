# Grass Sintetico en Firebase Spark

## Configuracion canonica

- El comando de Firebase debe ejecutarse desde la raiz `canchas-cliente/`.
- `firebase.json` es la configuracion canonica de Hosting, Firestore y Realtime Database.
- Firestore carga `mobile/firestore.rules` y `mobile/firestore.indexes.json`.
- Realtime Database carga `mobile/database.rules.json`.
- El proyecto real es `glass-sintetico`. Las pruebas usan exclusivamente `demo-grass-local` con emuladores.
- Puertos locales: Auth `9099`, Firestore `8081`, Realtime Database `9000`, Hosting `5000`.

No ejecutar `firebase deploy` como parte de desarrollo o pruebas. El codigo actual no reemplaza por si solo ningun bundle publicado ni elimina una Function que ya estuviera desplegada.

## Administrador inicial

La autoridad no es el correo sino el UID: `sistema/grass.administradorUid` debe contener el `localId` de la cuenta de Firebase Authentication. El correo solo sirve para iniciar sesion.

Administrador vigente del proyecto real `glass-sintetico`:

```text
correo: andymartel222@gmail.com
UID:    OkzFyx72AcWbaY3PiFaiCIfVERi2
```

1. Crear manualmente la cuenta del administrador en Firebase Authentication Console.
2. Marcar o completar la verificacion de su correo. Las reglas exigen `request.auth.token.email_verified == true` para el administrador; sin verificar, el panel se detiene en la pantalla de verificacion.
3. Instalar credenciales de aplicacion para el operador fuera del repositorio:

   ```text
   gcloud auth application-default login
   ```

4. Desde `tools/firebase/`, registrar una sola vez la cuenta. Acepta correo o UID, y se niega a actuar si el correo no esta verificado o si ya existe otro administrador:

   ```text
   npm run configurar-admin -- --project glass-sintetico --email andymartel222@gmail.com
   npm run configurar-admin -- --project glass-sintetico --uid OkzFyx72AcWbaY3PiFaiCIfVERi2
   ```

5. Aprovisionar el acceso inicial de Realtime Database desde esa configuracion protegida:

   ```text
   npm run sincronizar-acceso -- --project glass-sintetico
   ```

   Solo lectura, sin escribir nada:

   ```text
   npm run configurar-admin -- --project glass-sintetico --inspect
   ```

El script escribe `sistema/grass`. Las reglas permiten leerlo a usuarios autenticados, pero niegan toda creacion, modificacion o eliminacion desde aplicaciones cliente. El script se niega a reemplazar un administrador distinto.

## Authentication

Habilitar en Console:

- Correo/contrasena para administrador y empleados.
- Autenticacion anonima para la solicitud de reserva publica.

La app no contiene registro publico, solicitudes de acceso ni invitaciones. Un UID de correo/contrasena sin ficha protegida de empleado queda en `cuenta no vinculada` y no puede leer datos privados.

Limitacion de Spark: `createUserWithEmailAndPassword` ejecutado desde una instancia secundaria conserva la sesion del administrador, pero Firebase Auth cliente no convierte esa llamada en una operacion privilegiada. Si el proveedor permite crear cuentas, un tercero tambien puede crear una cuenta Auth no vinculada. Firestore impide que esa cuenta se asigne rol o acceso. Para impedir incluso cuentas Auth huerfanas haria falta una API administrativa confiable o funciones de bloqueo no disponibles en esta arquitectura Spark.

## Realtime Database

1. Crear la instancia Realtime Database del proyecto si todavia no existe.
2. La instancia configurada es `https://glass-sintetico-default-rtdb.firebaseio.com`. Esa misma URL esta en todas las plataformas de `mobile/lib/firebase_options.dart` y en la herramienta de aprovisionamiento.
3. En un despliegue futuro, publicar `mobile/database.rules.json` desde la raiz.

La presencia vive bajo `presencia/{negocio}/{cancha}/{dia}/{minuto}/{uid}/{sesion}`. La sesion combina un identificador aleatorio de la instancia de la app (pestana o dispositivo) con el del formulario. Cada usuario escribe solo esa actividad de su UID: una pestana no conoce ni elimina la ruta de otra. El cliente instala `onDisconnect().remove()` antes de anunciarse, elimina al cancelar o guardar, renueva el anuncio abierto y agrega una expiracion de catorce minutos. La presencia no bloquea horarios ni confirma reservas.

Realtime Database Rules no puede consultar fichas de Firestore. La replica minima `acceso/{negocio}/{uid}` resuelve esa separacion y solo contiene rol, estado activo y nombre visible para el equipo. Tanto lectura como escritura de presencia exigen una entrada activa de administrador o `empleado_control`; una cuenta ajena, anonima o revocada queda bloqueada aunque llame al SDK directamente. La web publica no tiene permiso de lectura sobre `acceso` ni `presencia`.

El administrador inicial de RTDB nunca se declara desde el cliente. `sincronizar-acceso-rtdb.mjs`, ejecutado con credenciales de operador, lee su UID de `sistema/grass.administradorUid`, verifica la cuenta en Authentication y reemplaza la ACL con el administrador y los empleados activos de Firestore. `--inspect` permite auditar sin escribir. Las reglas no permiten crear ni modificar una entrada con rol `administrador`, tampoco al administrador actual.

Para operaciones normales, el administrador ya aprovisionado puede crear o revocar solo entradas `empleado_control`. Al activar, la app guarda primero la ficha de Firestore y despues concede RTDB. Al desactivar, revoca RTDB antes de guardar la baja, por lo que un fallo parcial queda del lado seguro. Tras un corte entre pasos, o como auditoria periodica, ejecutar:

```text
npm run sincronizar-acceso -- --project glass-sintetico --inspect
npm run sincronizar-acceso -- --project glass-sintetico
```

El modo predeterminado usa Application Default Credentials. En una estacion de
operador que ya tiene una sesion vigente de Firebase CLI, se puede reutilizar
ese token solo en memoria, sin crear ni guardar una clave de servicio:

```text
npm run sincronizar-acceso -- --project glass-sintetico --firebase-cli --inspect
npm run sincronizar-acceso -- --project glass-sintetico --firebase-cli
```

En emuladores se exigen las tres variables `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` y `FIREBASE_DATABASE_EMULATOR_HOST`; el seed tambien crea la ACL de prueba. Las pruebas de Database Rules cubren administrador, empleados activos, baja, cuenta ajena, anonimo, propiedad de sesion y prohibicion de autoasignarse permisos.

## Reservas y exclusividad

Firestore es la autoridad definitiva. Panel y web compiten por un documento diario privado y su proyeccion publica:

```text
negocios/{negocio}/agenda/{cancha}/dias/{dia}
agenda_publica/{negocio}/canchas/{cancha}/dias/{dia}
```

Cada documento diario contiene un mapa `ocupados` con claves de treinta minutos. Los minutos posteriores a medianoche continúan en el mismo dia operativo como `1440`, `1470`, etc. Crear o cancelar una reserva confirmada cambia atomicamente la reserva, la agenda privada y la proyeccion publica.

La web usa identidad anonima y no lee la coleccion privada. Hasta tres horas se confirman y ocupan directamente; una solicitud mayor queda pendiente sin ocupar hasta que el empleado asignado la aprueba. La proyeccion publica contiene unicamente el mapa `ocupados`; nunca IDs de reserva, nombres, telefonos, pagos o UIDs.

## Limites de abuso publico

Las reglas validan forma, identidad, rango de fechas, cancha activa, horario, duracion, reintento y exclusividad. No sustituyen un backend antiabuso:

- no hay limite confiable por IP;
- una persona puede renovar identidades anonimas;
- App Check reduce clientes casuales, pero no es una garantia anti-bot;
- una solicitud pendiente no ocupa agenda hasta que el personal asignado la aprueba;
- deben monitorearse cuotas y solicitudes abusivas desde Console.

No presentar estas reglas como proteccion equivalente a un backend con rate limiting y deteccion de fraude.

## Datos publicos

La web solo lee:

- `negocios_publicos/grass-sintetico`;
- `canchas_publicas/*` activas;
- `promociones_publicas/*` activas;
- `agenda_publica/{negocio}/canchas/{cancha}/dias/{dia}`.

La ficha privada, clientes, telefonos, pagos, empleados y reservas completas no son enumerables por una identidad publica.

## Fotos

El modelo publico reserva `galeria` y su orden. La interfaz muestra la capacidad deshabilitada. No hay `firebase_storage`, credenciales Cloudinary, preset publico ni subida simulada.

Para habilitarla se necesita un mecanismo de firma confiable que entregue parametros Cloudinary de corta duracion. No guardar `api_secret` ni secretos equivalentes en Flutter, JavaScript publico o Firestore.

## Reserva publica

La web publicada mantiene el formulario deshabilitado hasta una activacion deliberada. El limite de mil expresiones es un limite oficial de Firestore Security Rules por request, no una particularidad del emulador.

La agenda diaria espejada evita una lectura por franja y no publica identificadores privados. Las 55 pruebas de reglas activas y las 20 pruebas del prototipo cubren duraciones de 30 a 600 minutos, cruce de medianoche, tres canchas, concurrencia, privacidad, ataques, aprobacion y cancelacion sin agotar mil expresiones.

Mientras siga abierto el bloqueo:

- `web/public/firebase-config.js` mantiene `GRASS_RESERVAS_HABILITADAS = false`;
- la web oculta el formulario, deshabilita todos sus controles y rechaza el envio incluso si se dispara a mano, aunque existan canchas publicas;
- solo se publico `hosting:publica`. No se desplegaron reglas ni datos de ejemplo.
- la agenda privada no debe usarse como fuente publica porque `ultimaOperacion` contiene el ID de reserva.

Para desactivar el bloqueo, en este orden:

1. verificar datos y reglas reales con herramientas de solo lectura;
2. comprobar web y panel contra emuladores y luego en un entorno controlado;
3. activar deliberadamente `GRASS_RESERVAS_HABILITADAS`.

## Corte de datos existente

El esquema canonico es `schemaVersion: 5`. Antes de un despliegue real se debe hacer una operacion separada y revisada para inventariar y migrar reservas antiguas y sus agendas por franja, detectar conflictos y respaldar datos. Este trabajo no lee ni modifica datos de produccion.

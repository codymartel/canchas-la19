# Grass Sintetico en Firebase Spark

## Etapa operativa autorizada (29 de septiembre de 2026)

La configuracion real usa apertura 420 (07:00), cierre 60 (01:00 del dia siguiente),
unidades internas de 30 minutos y America/Lima. Las tablas y reservas normales van
de hora en hora (18 filas por cancha). Solo el personal puede activar casos especiales
de 30 minutos; las reglas rechazan altas publicas con inicio o duracion a media hora.
La ocupacion conserva 36 unidades para no perder reservas parciales existentes, incluidas
1440 y 1470 de la madrugada siguiente. El selector de hoy conserva el dia operativo
anterior antes de las 07:00. Direccion y tarifa pueden quedar pendientes; solo la
habilitacion de la cancha determina su reservabilidad, sin relajar privacidad ni
solapamientos. Las reservas nacen sin importes. El personal autorizado puede fijar el monto acordado y registrar efectivo manual, con historial inmutable, versionado y saldo; no hay verificacion de Culqi ni WhatsApp. El campo adelantoCentimos conserva el acumulado registrado; la planilla distingue el primer adelanto del total usando el historial. Una solicitud mayor
de 180 minutos ocupa solo al aprobarla un empleado activo asignado a la cancha,
revalidando disponibilidad. El gerente conserva creacion y cancelacion, pero no
aprueba solicitudes largas sin una ficha de empleado asignado.

El corte de produccion inventariado contiene 13 documentos, dos clientes y un
empleado; no se encontraron reservas, bloqueos ni rutas antiguas de agenda.
Los respaldos privados y resultados completos permanecen en .production-audit/,
excluida de Git. No se borran campos heredados ni se modifica clientes o empleados.
Los apartados historicos siguientes describen el corte previo; el informe de
validacion de esta etapa detalla sus resultados y publicaciones.

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

La agenda diaria espejada evita una lectura por franja y no publica identificadores privados. Las 71 pruebas de reglas activas y las 20 pruebas del prototipo cubren duraciones de 30 a 600 minutos, cruce de medianoche, tres canchas, concurrencia, privacidad, ataques, aprobacion y cancelacion sin agotar mil expresiones.

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

### Por que 5 y no 3

La rama parte de `schemaVersion: 3`, que guardaba cada reserva con una lista `dias` de segmentos y un documento por franja en `slots`. Ese modelo obligaba a enumerar todas las franjas del turno dentro de cada documento y multiplicaba las escrituras, y su agenda publica era un documento por franja. El salto a 5 sustituye eso por una agenda diaria unica por cancha y dia operativo, con un mapa `ocupados` de minuto a booleano, y por un unico documento publico que se deriva de ella.

El 4 nunca se versiono: no existe ninguna regla, prueba, script ni documento en el repositorio que lo defina, y el unico estado versionado antes de este trabajo era 3. El trabajo actual se etiqueta 5 por ser el primer estado coherente y verificable, no por haber superado un 4 existente. Queda como decision pendiente renumerar a 4 o confirmar el 5, porque renumerar obliga a migrar cualquier dato ya escrito con la marca 5.

### Limites de tamano de un lote

La operacion mas grande que las reglas admiten es la aprobacion de una reserva de 600 minutos: son 20 minutos operados sobre un dia que ya puede llevar 16 ocupados, hasta el tope de 36 entradas que fija `d.ocupados.size() <= 36`. Ese tope coincide con los 36 mediosfos del dia operativo (420 a 1470), de modo que no se puede superar sin salirse del dia.

Sobre el presupuesto de accesos a documentos, el limite oficial es de 10 llamadas a `exists()`, `get()` y `getAfter()` por escritura, y de 20 por lote o transaccion, y ese limite de 10 se aplica tambien a cada escritura del lote. Medido con `tools/firebase/test/sonda-presupuesto.mjs`, que inyecta accesos sinteticos sobre una copia de las reglas y encuentra por busqueda binaria el umbral exacto de denegacion, el escenario mas pesado consume 8 accesos en total: 4 al transicionar la reserva, 3 al escribir la agenda privada y 1 al escribir el espejo publico. Quedan 6, 7 y 9 de margen por escritura, y 12 de los 20 del lote.

El contraste con el conteo estatico es la parte importante: contar los puntos donde aparecen `get` y `exists` da hasta 12 por documento y 29 en el lote, muy por encima de ambos limites. Ese numero no es el real. El cortocircuito de `&&` y `||` evita la mayoria de las llamadas, y las llamadas repetidas sobre el mismo documento se cachean. La sonda confirma ademas que el emulador si aplica los dos limites, porque deniega exactamente al cruzarlos y acepta un acceso menos, de modo que aqui no hay margen oculto del que depender.

Los limites de 1000 expresiones y los de accesos son dos cosas distintas y ambos se respetan: el tope de expresiones nunca aparecio en la suite, y el presupuesto de accesos quedo medido, no supuesto.

### Que expresion cubre a cual

Al mutar por separado las condiciones de las reglas que sostienen horarios, solapamientos, ocupacion y permisos, 20 de 45 mutaciones las detecta la suite y 19 sobreviven. Ninguna supervivencia abre una escritura indebida: en todas hay otra linea que impone lo mismo. Se conservan como defensa legible, no como unica red.

Del primer conjunto (`cambio.hasOnly(op.minutos)` y `!antes.keys().hasAny(op.minutos)` en `agendaDiaValida`) ya se habia hecho el analisis detalle antes: la igualdad `op.minutos == r.minutos` sobrevive porque `cambioOcupaAgenda` construye `op` a partir de `r.minutos`, de modo que es una verdad de construccion.

La tanda priorizada que si se ejecuto cambio una condicion a la vez sobre una copia temporal, corrio la suite completa y restauro la copia, con `tools/firebase/test/mutar-prioritarias.mjs`. Las supervivencias que quedan, y por que no abren nada:

- `d.ocupados.keys().hasAll(op.minutos)` en `mobile/firestore.rules:488`: la pareja `cambio.hasAll(op.minutos)` en 483 exige que todos los minutos de la operacion cambien, asi que un subconjunto no llega a ser ocupacion valida.
- `d.ocupados.size() <= 36` en 475: 36 es el tope del dia operativo (420 a 1470) y `cabe` ya impide salirse, asi que un mapa mayor solo podria contener minutos fuera del dia, que otra regla rechaza.
- `op.tipo == 'ocupar'` en 485: la rama de liberar exige `r.estado == 'cancelada'` y `op.minutos == r.minutos`, de modo que cualquier tipo distinto sigue atado a la reserva correcta.
- `r.estado == 'cancelada'` en 497 y `get(ruta).data.estado == 'confirmada'` en 499: liberar exige ademas `antes.keys().hasAll(op.minutos)` y que la reserva exista, asi que solo una reserva confirmada puede liberar sus propios minutos.
- `antes.keys().hasAll(op.minutos)` en 501 al cambiarlo por `hasAny`: la rama de liberar ya exige que la operacion libere exactamente los minutos de la reserva.
- `r.duracion > 180` en 494 y `r.duracion <= 180` en 490: la regla de version (`get(ruta).data.version + 1 == r.version`, detectada si se cambia) y el estado `pendiente` ya separan el alta de una reserva larga de la confirmacion de una corta.
- `antes.duracion > 180` en `transicionValida` 404: una reserva corta nunca esta en `pendiente` porque el alta la crea confirmada, asi que la condicion no cambia nada alcanzable.
- `cambioOcupaAgenda(n, id, coleccion, antes)` en 406: el `antes` solo cambia la referencia de minutos, pero la comprobacion real es `op.minutos == r.minutos` y la suite detecta esa linea si se invierte.
- `despues.ultimaOperacion.tipo == 'ocupar'` en 332: la rama de la agenda exige a su vez `op.tipo in ['ocupar', 'liberar']` y el estado de la reserva.
- `int(minutos[0]) >= 0` en 432: `cabe` y `dentroHorario` ya exigen `r.minuto >= h.aperturaMinuto`.
- `int(minutos[cantidad - 1]) < 1500` en 453, `cantidad <= 21` en 429 y `cantidad >= 0` en 429: la duracion maxima de 600 minutos y `cabe` acotan el rango; un minuto fuera de 420 a 1440 lo rechaza el horario.
- `r.minuto + r.duracion <= h.cierreMinuto + 1500` en `cabe` 213: ampliar 1440 a 1500 solo permitiria cruzar medianoche unas horas mas alla del cierre, pero la suite detecta cualquier reserva normal que se pase del cierre, y `minutosOperacionValidos` exige que el ultimo minuto siga bajo 1500.
- `r.duracion % h.duracionTurnoMinutos >= 0` en `dentroHorario` 221: `duracionValida` ya exige que la duracion sea multiplo de 30 y el turno del negocio sembrado es 30.
- `autenticado() && exists(config)` en `puedeResolverCancha` 93: `verificado()` y `existeConfiguracion()` se comprueban mas abajo, en las ramas de admin y de empleado.
- `!exists(rutaConfiguracion())` en `reclamoValido` 50: solo aplica a `create` de `sistema/grass`, y ese camino exige `verificado()` y que el ancla no exista, luego no hay nada que lo vuelva alcanzable.
- `negocioId.size() <= 200` en 55: solo se muta el techo de longitud de un identificador, no un permiso.

### Pagos en cero, de punta a punta

Hasta que exista un backend de pagos, los importes no se gestionan: `montoCentimos`, `adelantoCentimos`, `saldoCentimos` y `historialPagos` viajan siempre en cero y vacio desde el cliente, y las reglas los exigen asi de forma explicita. El alta publica rechazada con `montoCentimos` o `adelantoCentimos` distintos de cero, igual que un `metodoPago` no vacio, y la UI no muestra ni reclama pagos. La consecuencia practica es que no existe ninguna via — ni publica ni de panel — para registrar un adelanto o un saldo: cuando se implemente el backend habra que anadir la regla que los permita y retirar esta restriccion de forma conjunta.

### Debilidad conocida

El documento publico admite una reescritura identica: si el mapa enviado coincide byte a byte con el de la agenda privada, los dos diffs quedan vacios y la regla los da por iguales. No fabrica ocupacion, no altera estado y no filtra informacion, porque ese documento ya es legible por cualquiera. Se deja constancia en vez de ocultarlo.

### Empleado principal por cancha

El administrador puede designar un empleado activo, con permiso de reservas y la cancha incluida en sus sedes, en `negocios/{negocio}/responsablesCanchas/{cancha}`. Este documento privado guarda `empleadoUid`, `actualizadoPor`, `actualizadoEn` y `eventoId`. Cada cambio crea un evento inmutable en `historial/{eventoId}` con empleado anterior y nuevo. Responsable y evento se escriben en la misma transacción y se validan con `getAfter`; no hay asignaciones automáticas ni migración de reservas. La designación prepara el enrutamiento futuro; no cambia los permisos operativos existentes ni activa WhatsApp o pagos.

### Parámetros privados por día y cancha

`parametrosCanchas/{cancha}/dias/{dia}` guarda el último bloque ajustado, plazoMinutos, versión y evento de auditoría. Historial inmutable ordenado por versión permite reconstruir precios y adelantos de cada hora. Solo administrador o principal activo con reservas y cancha asignada puede escribir; personal de agenda consulta y público anónimo no lee. Cada cambio es transaccional con versión esperada y fecha de servidor; se conserva historial antes/después. Este diseño valida un bloque sin repetir 18 comprobaciones monetarias, evitando el límite de expresiones observado durante la prueba. Los parámetros no se integran todavía al formulario público ni al vencimiento de reservas.

# Corrección de horarios y recarga — 29 de septiembre de 2026

Publicado en el proyecto real `glass-sintetico`. Sin push y sin escrituras de datos de producción en esta corrección.

## Comportamiento

- Panel y web muestran 18 filas por cancha, de 07:00–08:00 a 00:00–01:00 del día siguiente, America/Lima.
- Reservas normales: inicio en hora completa y duración de 1, 2, 3 horas, etc. Hasta tres horas confirma; más de tres permanece pendiente.
- Solo el personal tiene el selector **Caso especial: permitir 30 minutos**. Las reglas rechazan nuevas reservas públicas con duración o inicio a media hora.
- Las unidades internas de ocupación siguen siendo de 30 minutos para conservar casos especiales y reservas existentes. Una hora pública aparece Ocupado si cualquiera de sus mitades está ocupada. El panel muestra todos los registros que intersectan la hora, con sus horas exactas; no oculta una reserva en la segunda mitad.
- Actualizar disponibilidad hace lecturas explícitas del servidor, sin esperar indefinidamente la primera respuesta de un listener. Cada lectura tiene límite de 15 segundos y permite reintentar. Los listeners continúan actualizando en tiempo real.
- La recarga funciona después de enviar una solicitud y conserva su identificador, resultado y campos. No crea otra reserva ni altera una solicitud cuyo resultado pueda estar pendiente.

## Validación

| Comprobación | Resultado |
|---|---|
| Flutter analyze | Sin incidencias |
| Suite Flutter completa | 37 aprobadas |
| Agenda después de ampliar aserciones | 6 aprobadas: 18 filas, selector especial y reserva de 10:30 visible |
| Suite web | 15 aprobadas; recarga tras confirmación, sin respuesta inicial de listeners y reintento tras timeout |
| Reglas Firestore | 73 aprobadas; incluye rechazo público de 30 minutos y cancelación de reserva pública antigua a las 21:30 |
| Integración demo-grass-local | Tres listeners públicos/privados, dos sesiones en conflicto, 00:00–01:00, cinco horas, aprobación asignada, revalidación y cancelación: OK |
| Límite de 1.000 expresiones | Sin ocurrencias en los registros de estas suites; las duraciones máximas siguen aprobadas |
| Navegador de producción | Tres tablas de 18 filas, duraciones 1–10 horas; dos recargas consecutivas completan y conservan selección; cambio de día ofrece 07:00, 08:00…00:00 |
| Archivos publicados | Hashes de main.dart.js, app.js y lectura.js coinciden exactamente con los locales |

Se verificó el bundle publicado del panel. La sesión privada autenticada de producción requiere que el usuario entre; las tablas y el selector se verificaron con widgets e integración local, sin inventar credenciales.

## Datos conservados

Antes de publicar se comprobaron las versiones activas y se respaldaron los dos documentos de reservas existentes junto con las reglas y releases en `.production-audit/hours-before.json` (privado, ignorado por Git).

- `r_0580e9b4-11f1-454d-bc07-0b03df99551c`: confirmada, 21:30–22:30, sin cambios de updateTime.
- `r_d36a10cb-b345-44f5-bf60-42ea7eb4187b`: prueba de la etapa anterior, cancelada, sin cambios de updateTime.

No se creó ni canceló ninguna reserva de producción en esta corrección. Clientes y empleado conservan sus updateTime originales. No se transformaron documentos, direcciones, tarifas ni campos de pagos.

## Publicación

El formulario se cerró durante la publicación de ambos sitios y las reglas. Tras comprobar hashes y datos se habilitó con una publicación exclusiva de `hosting:publica`. Todos los despliegues usaron `--only`.

| Target | URL | Versión final |
|---|---|---|
| personal | https://glass-sintetico.web.app/ | `dfe6a7503c3133b5` |
| publica | https://glass-sintetico-tienda.web.app/ | `a9bf2d010c191b94` |

Reglas: `projects/glass-sintetico/rulesets/65e1fb74-a840-4bee-adce-9e74fa92cbe2`.

Commit de implementación local: `0008bb14e032d7468acf4eeec49b0dd6dad84078`. Se conservaron los commits anteriores.

Archivos modificados: `mobile/firestore.rules`, `mobile/lib/features/reservas/presentation/agenda_screen.dart`, `mobile/lib/features/reservas/presentation/reserva_dialog.dart`, `mobile/test/agenda_test.dart`, `tools/firebase/test/firestore.rules.test.mjs`, `tools/firebase/test/web-flow.test.mjs`, `web/public/app.js`, `web/public/lectura.js`, `web/test/app.test.js`, `web/test/lectura.test.js`, `docs/ARQUITECTURA_SPARK.md` y este informe.

Los resultados de la etapa anterior, métricas agregadas y auditoría de mutaciones permanecen en [VALIDACION_PRODUCCION_2026-09-29.md](VALIDACION_PRODUCCION_2026-09-29.md). Sus versiones y tablas de 30 minutos describen aquel corte; este documento registra la corrección posterior.

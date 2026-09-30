# Selector unificado del panel — 29 de septiembre de 2026

El formulario privado reemplaza los selectores independientes Inicio y Duración por casillas de franjas libres. El personal marca horas consecutivas de una cancha; inicio y duración se calculan y aparecen en un resumen único. Ocupadas: ✕ Ocupado, casilla deshabilitada. Más de tres horas conserva la solicitud pendiente. El modo especial del personal permite medias horas. Mantenimiento mantiene máximo de tres horas.

Una selección no consecutiva comienza un rango nuevo. Quitar un extremo acorta el rango; quitar una casilla interior limpia la selección para impedir huecos. Cambiar cancha o modo limpia la selección. Si llega ocupación nueva sobre lo seleccionado, se retira la selección. La validación y transacción del repositorio permanecen intactas.

La coordinación temporal ahora conserva el día operativo y los minutos 1440/1470 al pasar medianoche, usando las reglas RTDB ya publicadas en la corrección anterior. No se modifica el esquema ni las reglas en esta etapa.

## Comprobaciones

flutter analyze: sin incidencias. flutter test: 39 aprobadas. La prueba nueva cubre cinco horas consecutivas y aviso pendiente, conflicto de media hora que deshabilita la hora completa y limpia selección, 00:00–01:00 y modo especial 00:30–01:00. Se mantienen pruebas de formulario en 390/1440 px.

Build release sin EMULATOR_HOST y con pwa-strategy none aprobado. Se mantienen los avisos no bloqueantes de fuente Cupertino y opción PWA deprecada. No se repitieron suites de reglas ni la integración de transacciones porque no cambiaron reglas o repositorios de reservas.

En la sesión autenticada publicada se verificaron casillas, ocupadas no seleccionables, resumen La 19 · 00:00 (+1 dia) a 01:00 (+1 dia) · 60 minutos y estado Conectado en vivo. Se publicó únicamente una actividad temporal de preparación; se limpió al cerrar el formulario. No se pulsó Guardar, no se creó ni canceló ninguna reserva.

## Publicación y conservación

Comando: firebase deploy --project glass-sintetico --only hosting:personal.
Panel https://glass-sintetico.web.app/ — versión b906a89c8776517c; anterior b1934cd1f55cd5bd.
Web https://glass-sintetico-tienda.web.app/ — versión 865246f4ea76a459, sin cambios.
Firestore ruleset 65e1fb74-a840-4bee-adce-9e74fa92cbe2, sin cambios. RTDB sin redeploy.
Hash publicado main.dart.js: 9b3ddab61b62e95c0678f21116ad60fd514950ee564cb227541714ae7fbdf643.

Las tres reservas existentes conservan updateTime: dos confirmadas y una prueba previa cancelada. Clientes y empleado conservan updateTime. Sin migraciones, datos inventados ni pagos verificados. Sin push.

Archivos modificados: mobile/lib/features/reservas/presentation/reserva_dialog.dart, mobile/test/agenda_test.dart y este informe.

Evidencia privada ignorada por Git: .production-audit/unificar-before.json, unificar-analyze.log, unificar-full-tests.log, unificar-deploy.log, unificar-verification-active.json y panel-franjas-unificadas.png. La captura no contiene contactos de clientes.

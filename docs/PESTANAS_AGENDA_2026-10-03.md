# Pestañas y planilla visible — 3 de octubre de 2026

Se retomó el trabajo interrumpido por el límite de uso. La agenda abre automáticamente La 19 y muestra una sola planilla dentro de la pantalla, sin botones Abrir ni diálogo de planilla. Las pestañas La 19, La 23 y La 24 cambian la tabla inmediatamente. Conserva las columnas privadas, efectivo manual, detalle, solicitudes y canceladas.

Las tres pestañas muestran En preparación cuando existe una actividad vigente en esa cancha. Las filas libres muestran nombre y estado temporal de quien prepara o guarda ese horario. Los avisos no ocupan franjas ni reemplazan una reserva confirmada. Todas las canchas conservan sus escuchas en vivo; el cambio de pestaña no modifica datos.

Validación: flutter analyze sin incidencias; 42 pruebas Flutter aprobadas, incluyendo tres pestañas sin diálogo, avisos que aparecen y desaparecen, pantallas de 390 y 1440 px, reservas que llegan por stream, selección de dos reservas especiales en una hora y efectivo. No se cambiaron repositorios, reglas, esquema ni web pública; las suites de reglas e integración de la etapa anterior no se repitieron para esta corrección visual.

Antes de publicar: preflight de reglas y versiones compatible; cuatro reservas respaldadas conservan updateTime e importes. No se crea ni modifica ninguna reserva, cliente, empleado o cobro para esta prueba. Los documentos ajenos no versionados del repositorio se conservan sin incluirlos en el commit de esta corrección.

Publicación y comprobación final completadas; evidencia abajo.

Publicación final: `firebase deploy --project glass-sintetico --only hosting:personal`. Build release sin EMULATOR_HOST y con pwa-strategy none aprobado; advertencias no bloqueantes de Cupertino y opción PWA deprecada.

Panel https://glass-sintetico.web.app/ — versión 378981b20e87d105; anterior 0fd4ddd11ccff60d. SHA256 main.dart.js: 12f342c295b560338da81044788ba07384b3189f123b5d71b09b8c3c59d72266. Coincide con el archivo servido.

Web pública 865246f4ea76a459 y reglas 09a1751d-01c3-4a48-9cf6-7f00f09905c0 intactas. Después de publicar se verificaron cuatro reservas, clientes y empleado con updateTime sin cambios. No se modificaron datos ni se generaron reservas o cobros. Sin push.

Comprobación visual autenticada: panel conectado en vivo; tabla La 19 visible al cargar; clic La 23 cambia selección y título; clic La 24 cambia selección y título, sin diálogo de planilla. Captura privada sin contactos: .production-audit/pestanas-publicadas.png. El aviso de preparación se comprobó mediante pruebas de widgets, sin inventar actividad del personal en producción.

Archivos de esta corrección: mobile/lib/features/reservas/presentation/agenda_screen.dart, mobile/test/agenda_test.dart y este informe. Logs privados: pestanas-tests-final.log (42 aprobadas), pestanas-build.log, pestanas-deploy.log y planilla-verification-active.json.

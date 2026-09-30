# Corrección del panel privado — 29 de septiembre de 2026

El panel publicado se comprobó en la sesión autenticada del usuario: «Conectado en vivo», tres tablas simultáneas a 985 px y dos reservas confirmadas en La 19. La última reserva pública no tiene atendidoPor; ahora muestra «Por atender» tanto en la tabla como en el detalle. No se asignó un empleado sin intervención del personal ni se modificó esa reserva.

## Cambios

- Coordinación: exige conexión de transporte y primera lectura de las tres canchas. Expone errores de lectura, reintenta tras recuperar conexión y ofrece «Reconectar coordinación» con renovación de token y reconexión RTDB.
- Tablas: tres columnas desde 700 px; tarjetas resumen más compactas. Horario visible 07:00–01:00 del día siguiente, filas de una hora.
- Medianoche: el repositorio de presencia usa minutos del día operativo; las reglas RTDB admiten 1440 y 1470. No se amplían roles, lectura pública ni permisos sobre reservas.
- Hosting personal: cabeceras no-cache/no-store para todas las rutas. Build release sin emuladores, estrategia PWA none.

El aviso anterior de desconexión no exponía sus errores y no reabría una lectura fallida del mismo día. Una prueba externa de transporte RTDB funcionó. Tras publicar y recargar el panel, la sesión del usuario confirma transporte y lectura de las tres canchas. No se capturó el error original preciso, por lo que no se atribuye a una causa de red concreta.

## Verificación

- flutter analyze: sin incidencias.
- flutter test: 38 aprobadas, incluida nueva prueba de pérdida de lectura y reconexión.
- Suite de reglas Realtime Database en demo-grass-local: aprobada. Personal puede publicar y limpiar 1440/1470; anónimo no puede leer; 1500 rechazado; se mantienen pruebas de ACL, suplantación y baja.
- Build release aprobado. Avisos no bloqueantes sobre fuente Cupertino no incluida y deprecación de pwa-strategy.
- Firestore no cambió: se conserva la suite anterior de 73 pruebas; esta corrección no volvió a ejecutar esa suite ni representa una medición nueva del límite de expresiones.
- Reglas RTDB activas respaldadas antes y verificadas contra archivo local después.
- Hash del main.dart.js publicado coincide: 679f9c2df4e602bf5eda1a4fba929ff55102036c1da0d213e6f45096c8e32f30.
- Las tres reservas conservan updateTime: dos confirmadas, una prueba previa cancelada. Clientes y empleado también mantienen updateTime. No se crearon ni cancelaron reservas en esta corrección.

## Publicación

Comando utilizado: firebase deploy --project glass-sintetico --only database,hosting:personal.

Panel: https://glass-sintetico.web.app/ — versión b1934cd1f55cd5bd (anterior dfe6a7503c3133b5).
Web: https://glass-sintetico-tienda.web.app/ — versión 865246f4ea76a459, sin redeploy.
Firestore: ruleset 65e1fb74-a840-4bee-adce-9e74fa92cbe2, sin redeploy.
RTDB: reglas publicadas y contenido verificado; evidencia privada panel-rtdb-rules-after.json.

Evidencia privada excluida de Git en .production-audit/: panel-before.json, panel-rtdb-rules-before.json, panel-rtdb-rules-after.json, panel-analyze.log, panel-flutter-tests.log, panel-database-tests.log, panel-deploy.log, panel-verification-active.json y panel-conectado.png. La captura del estado conectado no incluye nombres ni teléfonos de clientes.

Archivos modificados: firebase.json; mobile/database.rules.json; mobile/lib/features/presencia/data/presencia_repository.dart; mobile/lib/features/presencia/domain/presencia_control.dart; mobile/lib/features/presencia/presentation/presencia_provider.dart; mobile/lib/features/reservas/presentation/agenda_screen.dart; mobile/test/agenda_test.dart; mobile/test/presencia_provider_test.dart; tools/firebase/test/database.rules.test.mjs; este informe.

No hubo push. No se verificaron pagos. Esta corrección no realizó una nueva reserva de prueba ni una nueva comparación de métricas. Firebase Console → Firestore Database → Uso muestra métricas agregadas; Reglas permite revisar las denegaciones. Las métricas no equivalen al costo exacto de una reserva individual.

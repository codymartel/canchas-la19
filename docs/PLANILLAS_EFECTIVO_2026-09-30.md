# Planillas por cancha y efectivo manual — 30 de septiembre de 2026

Trabajo iniciado el 29 y terminado el 30, America/Lima. Cada día operativo mantiene 07:00–01:00 del día siguiente.

## Comportamiento

La vista principal conserva las tres canchas en tarjetas compactas con Abrir La 19, Abrir La 23 y Abrir La 24. Cada botón abre una planilla amplia, en vivo, con filas de una hora y columnas Hora, Nombre/estado, Monto a pagar, Teléfono, Adelanto, Resta, Total registrado y Quién atiende. Filas de 40 px; desplazamiento vertical y horizontal cuando hace falta. Para dos reservas de media hora en la misma fila, tocarla permite elegir cuál consultar.

Los importes se muestran solo en la primera fila de cada reserva; el total diario cuenta cada reserva una vez. Una tarifa aún no acordada se indica Pendiente. Total registrado significa el acumulado de efectivo anotado por el personal, no verificación de un proveedor. Adelanto muestra el primer cobro parcial; si el primer cobro cubre todo el monto, no se presenta como adelanto parcial. El campo existente adelantoCentimos mantiene el acumulado; el primer adelanto se deriva del historial.

Ruta del personal: Abrir cancha → tocar reserva confirmada → Registrar monto / efectivo. Monto acordado es el precio total de esa reserva. Efectivo recibido ahora es un nuevo cobro; 0 permite fijar o ajustar el precio antes de recibir dinero. No se cambia el precio después de cobrar. Se admite centavos y se rechaza cobrar más del saldo. Los errores de entrada se corrigen antes del envío; tras enviar, el reintento conserva la misma operación.

Las fechas de creación y movimientos se muestran en formato legible de America/Lima. Cada registro agrega empleado, fecha, operación, monto acordado y efectivo recibido al historial privado. Una transacción controla la versión y evita duplicar reintentos. Máximo 100 movimientos. El historial anterior no se reescribe y el registro de efectivo no cambia ocupación, nombre, teléfono, estado o responsable de la reserva. Solo personal autorizado para resolver esa cancha puede escribirlo; nunca la web anónima. Solo reservas confirmadas, sin mantenimiento.

Cancelaciones y solicitudes se pueden consultar desde la planilla. Cancelar libera la cancha y conserva cobros e historial; no crea una devolución ficticia. El acumulado diario incluye efectivo de canceladas. No se implementaron devoluciones, Culqi, WhatsApp ni pagos verificados por terceros.

No se crean campos nuevos en documentos existentes ni se migra producción. Se conservan schemaVersion 5 y los campos privados ya presentes. Las reservas nuevas siguen naciendo con importes cero y sin historial.

## Validación

- flutter analyze: sin incidencias.
- flutter test: 42 aprobadas. Incluye efectivo Dart (monto sin cobro, adelanto, saldo completo, reintento, exceso, versión obsoleta y precio bloqueado), entrada de efectivo corregible, filas especiales compartidas y las pruebas existentes de horarios y conexión.
- Firestore: 77 pruebas aprobadas en demo-grass-local, sin omitidas. Las cuatro nuevas cubren monto sin cobro, adelanto y saldo completo, privacidad, permisos, suplantación, exceso, historial alterado, dos sesiones y reintento idempotente, cancelación conservando cobros y el máximo de 100 movimientos sin agotar expresiones.
- Integración Auth/Firestore con SDK real en demo-grass-local: aprobada. Tres canchas en vivo, dos sesiones, medianoche, cinco horas, aprobación asignada, revalidación, cancelación y privacidad.
- No se detectó el error de 1.000 expresiones. Esta etapa no repitió la matriz de mutaciones histórica ni modifica sus resultados informados.
- Build release sin emuladores, pwa-strategy none aprobado. Avisos no bloqueantes de fuente Cupertino no incluida y opción PWA deprecada.

La conservación del historial usa concatenación y comparación de listas según la [referencia oficial de reglas de Firebase](https://firebase.google.com/docs/reference/rules).

## Producción

Antes de publicar se comprobaron versiones y reglas activas y se respaldaron cuatro reservas. Una fue creada por el usuario durante el trabajo; no la creó el agente. Las cuatro mantienen updateTime: tres confirmadas y una prueba previa cancelada. Clientes y empleado mantienen updateTime. No se creó, canceló, transformó ni cobró ninguna reserva real en esta etapa.

Se publicó con firebase deploy --project glass-sintetico --only firestore:rules,hosting:personal. Reglas antes del sitio. La mejora visual final se publicó exclusivamente con --only hosting:personal.

Panel: https://glass-sintetico.web.app/ — versión final 0fd4ddd11ccff60d. Intermedias e71590df7d98bbe6 y a6591fd521aa93b3; previa b906a89c8776517c.
Web pública: https://glass-sintetico-tienda.web.app/ — 865246f4ea76a459, sin redeploy, formulario mantiene su estado habilitado.
Firestore: ruleset 09a1751d-01c3-4a48-9cf6-7f00f09905c0; anterior 65e1fb74-a840-4bee-adce-9e74fa92cbe2.
RTDB no se modificó.
Hash publicado main.dart.js: 80ffca69abb90ecd6fb0b15c1de99e772432c9a3b510a61c9a34b1315c72e3cc.

Se verificaron en la sesión autenticada los tres botones, apertura de planilla, columnas de importes pendientes, formulario manual y estado conectado. Se abrió y cerró el registro sin introducir ni guardar importes. No se simuló efectivo en producción.

Las comprobaciones privadas están en .production-audit/planilla-before.json, planilla-preflight.mjs, planilla-verification-active.json, planilla-deploy.log, planilla-ui-deploy.log, planilla-final-ui-deploy.log, efectivo-analyze.log, efectivo-flutter-tests.log, efectivo-rules-tests.log y planilla-integration.log. Capturas sin contactos: panel-botones-planilla.png, panel-planilla-final.png y panel-efectivo-formulario.png. Todo .production-audit/ queda fuera de Git.

No hubo push. Esta etapa no hizo una prueba nueva de reservas ni medición nueva de métricas de producción. Firestore Database → Uso muestra métricas agregadas; Reglas muestra evaluaciones y denegaciones. No representan el costo exacto de una reserva individual.

Archivos modificados: docs/ARQUITECTURA_SPARK.md; mobile/firestore.rules; mobile/lib/core/domain/formatos.dart; mobile/test/formatos_test.dart; mobile/lib/features/reservas/data/reservas_repository.dart; mobile/lib/features/reservas/domain/reserva.dart; mobile/lib/features/reservas/presentation/agenda_provider.dart; mobile/lib/features/reservas/presentation/agenda_screen.dart; mobile/test/agenda_test.dart; mobile/test/efectivo_test.dart; tools/firebase/test/firestore.rules.test.mjs; este informe.

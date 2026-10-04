# Empleado principal y cuadrícula de agenda — 3 de octubre de 2026

El administrador dispone de Empleados → Empleado principal por cancha → Asignar. Se eligen empleados existentes, activos, con permiso de reservas y la cancha incluida en sus asignaciones. Hay un documento privado por cancha; no se asigna nadie automáticamente. Puede ser el mismo empleado en varias canchas si ya tiene esos permisos.

Cada cambio guarda uid anterior, uid nuevo, administrador y fecha del servidor en historial inmutable. La transacción escribe el responsable y el evento juntos; repetir la misma selección no duplica historial. Las reglas rechazan asignar sin auditoría, empleados no elegibles, escritores no administradores y cambios o borrado del historial. La web pública no puede leer estos documentos. El administrador conserva sus facultades; este cambio no retira permisos ni altera reservas anteriores. WhatsApp, precios por bloque, pagos Yape/Culqi y vencimiento siguen pendientes: designar al principal prepara esa configuración, no activa dichos flujos.

La agenda mantiene pestañas y actualizaciones en vivo, ahora dentro de una sección con marco redondeado, encabezado diferenciado y bordes de cuadrícula entre filas y columnas. Conserva todas las columnas privadas, efectivo manual y 18 horas operativas de 07:00 a 01:00(+1), America/Lima, con filas normales de una hora y soporte de casos especiales de 30 minutos.

Pruebas: flutter analyze sin incidencias; 43 pruebas Flutter aprobadas (incluye cambio de principal, historial, reintento sin duplicados y rechazos del repositorio). Suite completa Firestore en demo-grass-local: 78 aprobadas, incluida privacidad y auditoría de principal. Sin fallo de 1.000 expresiones. La integración histórica no se repitió: disponibilidad, repositorios de reservas y reglas existentes no se modificaron.

Inventario de producción: nueva colección responsablesCanchas vacía; sin migración necesaria. Versiones y cuatro reservas respaldadas compatibles. No se modifican canchas, clientes, empleados, reservas ni cobros durante la prueba. No hay asignaciones reales hechas por el agente.

Publicación y verificación completadas; evidencia abajo.

Publicación compatible: reglas primero, panel target personal. Ruleset b590a8d1-05bc-465c-bb21-2702030f4324 (anterior 09a1751d-01c3-4a48-9cf6-7f00f09905c0). Panel final 7edd1fd7f90ed0e4 (intermedia 107dd4a0ab5dbef5; previa 378981b20e87d105), https://glass-sintetico.web.app/. SHA256 main.dart.js 527c0e80ddbf5d0b8b3341c362d1216b813f983b9a9356192dac342559d14f58, coincide con el servido. Web pública 865246f4ea76a459 sin redeploy. RTDB sin cambios.

Se compactó la cabecera tras comprobar una ventana baja: las pestañas son el selector de cancha, se evita un filtro duplicado y se abrevia la información del pie. Se repitieron análisis y 43 pruebas tras esa corrección, ambas aprobadas. Build release sin emuladores aprobado; avisos no bloqueantes de Cupertino y opción PWA deprecada.

Comprobación autenticada: Empleados muestra las tres canchas sin principal; Asignar abre el selector y ofrece el empleado real elegible. Se cerró sin seleccionar ni guardar. Después de publicar, las cuatro reservas respaldadas, clientes y empleado conservan updateTime; responsablesCanchas sigue vacía. Capturas sin contactos en .production-audit/principales-selector.png y principales-cuadricula.png. Sin reservas ni cobros de prueba nuevos.

Archivos: mobile/firestore.rules; empleados_repository.dart, empleados_provider.dart y empleados_screen.dart; agenda_screen.dart; mobile/test/principales_test.dart; tools/firebase/test/firestore.rules.test.mjs; docs/ARQUITECTURA_SPARK.md y este informe. Logs privados: principales-reglas.log, principales-flutter-final.log, principales-build-final.log, principales-deploy.log, principales-deploy-final.log y planilla-verification-active.json. No se incluyeron respaldos, secretos ni archivos ajenos en Git. No se hace un nuevo push en esta etapa.

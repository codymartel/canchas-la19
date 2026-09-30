# Selección directa de horas — 29 de septiembre de 2026

Interfaz publicada en el negocio real, sin push ni escrituras de datos de producción.

- Se retiraron los selectores separados de inicio, duración y cancha. El usuario elige fecha y marca horas libres en una de las tres tablas; la cancha, el inicio y la duración se calculan automáticamente.
- Ocupadas: **✕ Ocupado**, sin casilla seleccionable. Horas pasadas: **Libre · ya pasó**, sin permitir reservarlas.
- Las horas de una solicitud deben ser consecutivas y pertenecer a una misma cancha. Hasta diez horas; más de tres muestra que requiere aprobación del personal. Cambiar de cancha reemplaza la selección anterior.
- Resumen explícito: **La 19 · 08:00 a 10:00 · 2 horas**. Nombre y teléfono siguen siendo obligatorios. No se verifican pagos.
- Si cambia la ocupación en tiempo real, se retira la selección afectada. Actualizar disponibilidad conserva una selección válida y una solicitud ya enviada.
- La URL principal y los estilos ahora llevan Cache-Control no-cache/no-store. Se versionó la URL de estilos para evitar mezclar HTML nuevo con CSS antiguo.

## Validación

20 pruebas web aprobadas. Cubren selección vacía, continuidad, medianoche, máximo de diez horas, ausencia de casillas ocupadas, cambios en tiempo real, payload de dos horas y recarga después de confirmar.

Integración completa en demo-grass-local aprobada: listeners públicos/privados de las tres canchas, dos sesiones en conflicto, medianoche, solicitud de cinco horas, aprobación por el empleado asignado, revalidación y cancelación. El esquema, las reglas y el código de transacciones permanecieron iguales; no hubo cambios en el panel Flutter.

En la web publicada se comprobaron casillas de 24×24 px, ausencia de los selectores anteriores, horas ocupadas sin casilla, selección 23:00–01:00, cambio de cancha, recarga conservando dos horas y selección 08:00–13:00 con aviso de solicitud pendiente. No se pulsó Solicitar reserva en producción durante estas comprobaciones.

## Producción

Solo se desplegó `hosting:publica`, siempre con `--only`. Formulario habilitado. Versión final: `865246f4ea76a459`. URL: https://glass-sintetico-tienda.web.app/.

Panel sin redeploy: `dfe6a7503c3133b5`. Reglas sin redeploy: `65e1fb74-a840-4bee-adce-9e74fa92cbe2`.

Se respaldó el corte anterior en `.production-audit/selection-before.json`, ignorado por Git. Las tres reservas existentes mantienen sus updateTime: dos confirmadas y una prueba previa cancelada. Clientes y empleado conservan sus updateTime originales. No se crearon, cancelaron ni transformaron reservas reales.

Los hashes publicados de HTML, CSS, app.js, disponibilidad.js y lectura.js coinciden con los locales. Evidencia privada de comprobación en `.production-audit/selection-verification-active.json` y captura `.production-audit/casillas-selector-final.png` (sin contactos).

Commit local de implementación: `be7f6dfd17055627ee3a7daa7fdde820514180a7`. Se conservan los commits anteriores y no hubo push.

Archivos modificados: `firebase.json`, `web/public/index.html`, `web/public/app.js`, `web/public/disponibilidad.js`, `web/public/styles.css`, `web/test/app.test.js`, `web/test/seleccion.test.js` y este informe.

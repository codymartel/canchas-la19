# Acceso con Google y clientes registrados — 4 de octubre de 2026

Estado: implementado y probado localmente. No desplegado; Google está deshabilitado en Firebase Authentication del proyecto real.

## Comportamiento

- La disponibilidad pública sigue mostrando solo Libre/Ocupado y precios públicos.
- Para enviar una reserva se exige una sesión de Google, nombre y teléfono. No hay registro por contraseña ni una verificación adicional de correo.
- Al entrar por primera vez se crea una ficha privada en negocios/grass-sintetico/clientesRegistrados/{uid}. Conserva UID, correo proporcionado por Google, nombre, teléfono y fechas del servidor. El teléfono queda vacío hasta completar una reserva y no se afirma que esté verificado.
- Las siguientes entradas conservan la ficha; una reserva actualiza nombre y teléfono atómicamente. La repetición de la misma solicitud conserva el identificador sin duplicar escrituras.
- El panel muestra las fichas de Google en Clientes, exclusivamente al personal con ese permiso, con lectura limitada a 50 documentos. Las fichas antiguas del personal se conservan separadas, sin fusiones automáticas.
- limitesPublicos/{uid} exige una sola reserva o solicitud activa en las tres canchas y 60 segundos entre solicitudes. El reloj del servidor decide. Dos sesiones de la misma cuenta compiten por ese documento; un lote tampoco puede reservar dos canchas.
- Cancelar, rechazar, marcar no asistencia o finalizar el horario permite otra solicitud después de la espera. El cliente no puede borrar ni editar libremente su control.
- No se implementa caducidad de pago a los diez minutos, envío de WhatsApp, Culqi ni verificación de pagos. Los límites son por cuenta y no detienen la creación de muchas cuentas independientes.

## Validación

Todo se ejecutó exclusivamente en demo-grass-local:

| Comprobación | Resultado |
| --- | --- |
| Reglas Firestore | 88 aprobadas, ninguna omitida |
| Ataque repetido con una cuenta | 1.000 intentos adicionales rechazados; una única reserva inicial |
| Error de 1.000 expresiones | Ninguna aparición en el registro final de reglas e integración |
| Integración real SDK Auth/Firestore | Google, ficha persistente, privacidad, idempotencia, tres canchas con listeners, colisión, medianoche, solicitud de cinco horas, empleado autorizado, revalidación y cancelación: aprobado |
| Web | 20 tests aprobados |
| Precios | 3 tests aprobados |
| Flutter | analyze sin incidencias; 52 tests aprobados; build web release aprobado sin dart-define de emuladores |
| Diff | Sin errores de espacios ni marcadores de conflicto |

Las ejecuciones iniciales mostraron el límite de expresiones en rechazos maliciosos. Se corrigió la evaluación de las reglas para resolver primero autorización y límite, y evaluar el resto solo cuando corresponda. Se repitió íntegramente la suite con el resultado indicado. No se debilitó la validación de campos, privacidad ni ocupación.

Los registros completos y respaldos quedan en .production-audit/, excluidos de Git; incluyen información privada y no deben publicarse.

## Producción y bloqueo

Inventario de solo lectura: las rutas clientesRegistrados y limitesPublicos contienen cero documentos. No se necesita transformar clientes ni reservas. Las cuatro reservas respaldadas siguen intactas y las versiones publicadas coinciden con el inventario anterior.

La consulta administrativa defaultSupportedIdpConfigs/google.com devuelve 404: no hay proveedor Google configurado ni cliente OAuth existente. El navegador de Firebase Console pide iniciar sesión. Hace falta que el propietario habilite Google en Authentication → Método de acceso y guarde el correo de asistencia del negocio. No se inventaron credenciales OAuth.

No se escribió ningún documento en producción, no se creó una reserva de prueba, no se desplegó y no se hizo push.

Versiones vigentes, sin cambios en esta etapa:

| Recurso | Versión |
| --- | --- |
| Reglas Firestore | fa811305-185d-472b-9557-5681481df557 |
| Hosting personal | 683c539ee01f668f |
| Hosting publica | 9cce7afc28c3a63f |

Panel: https://glass-sintetico.web.app/

Web pública: https://glass-sintetico-tienda.web.app/

Una vez habilitado Google, repetir la comparación de producción y publicar únicamente los targets y reglas necesarios en orden compatible. No publicar reglas que exijan Google mientras ese proveedor no funcione.

Firebase Console → Firestore Database → Uso muestra lecturas y escrituras agregadas; Reglas muestra actividad y denegaciones. Esta etapa no tuvo una reserva en producción y esas métricas no equivalen al coste exacto de una reserva individual.

## Archivos de esta etapa

- mobile/firestore.rules
- mobile/lib/features/clientes/data/clientes_repository.dart
- mobile/lib/features/clientes/presentation/clientes_screen.dart
- tools/firebase/test/firestore.rules.test.mjs
- tools/firebase/test/web-flow.test.mjs
- web/public/acceso.js
- web/public/app.js
- web/public/index.html
- web/public/reserva.js
- web/public/styles.css
- web/test/app.test.js
- docs/VALIDACION_GOOGLE_CLIENTES_2026-10-04.md

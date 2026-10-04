# Acceso con Google y clientes registrados — 4 de octubre de 2026

Estado actual: registro público con Google, nombre y teléfono publicado; reservas públicas cerradas en interfaz y reglas. Panel privado conservado en su versión anterior y conectado. El fallo del nuevo build privado sigue pendiente de diagnóstico.

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

## Inventario y bloqueo inicial, antes de habilitar Google

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

## Intento de publicación y restauración — 4 de octubre, 06:37 UTC

El propietario habilitó Google. Se verificó el proveedor habilitado con cliente OAuth existente. Se añadió exclusivamente glass-sintetico-tienda.web.app a authorizedDomains conservando todos los dominios anteriores. No se cambiaron credenciales ni el login privado, que continúa con correo y contraseña.

La web pública se publicó primero cerrada: versión c05145746c64e113. Después se publicaron reglas f70820d8-13ce-4f11-8812-95227b4fcf1b y panel 38d0c45d5abb398e, con comandos limitados a hosting:publica y firestore:rules,hosting:personal. Se verificaron los hashes publicados y las cuatro reservas, dos clientes y un empleado intactos.

La prueba visual real del nuevo panel mostró «Sin conexión» y «Coordinación en vivo: No se pudo completar la operacion. Reintenta. [minified:Dd]». El intento de reconexión volvió al mismo estado. Las pruebas de emulador anteriores pasan, pero no detectaron este fallo del build publicado. La causa exacta está pendiente de diagnóstico.

Se ejecutó la restauración autorizada. Al recargar la versión anterior, el panel volvió a mostrar «Conectado en vivo». La publicación permanece detenida y no se abrió el formulario público.

| Recurso final | Versión |
| --- | --- |
| Reglas Firestore restauradas | fa811305-185d-472b-9557-5681481df557 |
| Panel personal restaurado | 683c539ee01f668f |
| Web publica anterior con formulario cerrado | fde6808b8dc90e48 |

La última versión pública contiene los archivos del commit ea674b6, con el único cambio operativo de cerrar el formulario. El código nuevo de Google se conserva localmente en 8b3dc4b4d7e8a285200277c56d6b7d3facb8f71b. Se deja también cerrado el indicador local de producción para evitar una apertura accidental en el próximo intento.

La verificación posterior compara hashes del panel y la web restaurados, reglas activas, contenido de clientes y empleados, fichas registradas, controles públicos y updateTime de las cuatro reservas originales. Todo permanece intacto. No se creó ninguna reserva de prueba ni se hizo push. Google y el dominio público quedan configurados para el siguiente intento; la app privada y el panel conservan su acceso original.

La prueba con una cuenta Google real y las métricas agregadas antes/después de una reserva en producción quedan pendientes porque el formulario no se habilitó. Los respaldos, versiones y captura del panel restaurado están en .production-audit/, excluidos de Git.

## Etapa de registro únicamente — 4 de octubre, 06:57 UTC

El usuario autorizó continuar únicamente con el registro público y pidió informar cada paso, mantener cerradas las reservas y detenerse si reaparecía el fallo. No se desplegó Hosting personal ni se recompiló el panel.

El acceso Google muestra un formulario separado para nombre y teléfono. El cliente guarda explícitamente su ficha privada; no se crea una ficha incompleta al iniciar sesión en esta etapa. Se normaliza el teléfono y se puede actualizar la ficha conservando creadoEn. No se solicita verificación adicional de correo ni se afirma que el teléfono esté verificado por SMS.

firebase.json apunta en esta etapa a mobile/firestore.registro.rules: deriva de las reglas anteriores que funcionaban, añade únicamente clientesRegistrados y hace que altaPublica devuelva false. Se rechazan tanto reservas directas como solicitudes largas de clientes públicos, incluso si fuerzan el SDK. Los permisos y las reservas del personal conservan su lógica anterior. mobile/firestore.rules conserva el flujo futuro de reservas y límites, probado antes pero sin publicar en esta etapa; no sustituir la ruta de firebase.json hasta que se autorice y valide la reapertura.

Validación actual: 22 pruebas web aprobadas y prueba de integración Auth/Firestore SDK en demo-grass-local aprobada. Se comprueban Google sin requisito email_verified adicional, nombre y teléfono obligatorios, formato internacional, persistencia, actualización sin alterar la fecha de alta, privacidad entre cuentas, suplantación denegada, correo confiable, eliminación denegada, lectura del personal con permiso Clientes y límite 50. Se deniegan reservas públicas directas y largas con Google y anónimo; la reserva válida del personal con su login original se acepta. No apareció el límite de 1.000 expresiones en esta ejecución.

La primera compilación local de las reglas detectó un error de sintaxis al generar el archivo; se corrigió y se repitió satisfactoriamente la integración antes de cualquier publicación.

Publicación limitada y ordenada: primero firestore:rules, comprobación del panel conectado y hashes; después hosting:publica. Versiones actuales:

| Recurso | Versión |
| --- | --- |
| Reglas de registro | 69ae0177-cfa6-4a1b-b973-3649afe86455 |
| Publica | 7e7292acd386d865 |
| Personal, conservado | 683c539ee01f668f |

Se compararon hashes publicados de app.js, acceso.js, index.html, styles.css, reserva.js y firebase-config.js con los locales; coinciden. El indicador de reservas sigue en false. La revisión visual confirma Registra tu cuenta y el aviso de reservas cerradas; el panel sigue mostrando Conectado en vivo con su acceso original.

Un intento de abrir Google desde el navegador automatizado terminó con el mensaje Acceso cancelado, sin crear ninguna ficha; no se completó una sesión Google real ni se afirma haberla comprobado. El usuario puede probar su cuenta en https://glass-sintetico-tienda.web.app/ → Continuar con Google → nombre y teléfono → Guardar mis datos. El guardado completo ya fue probado con Auth y Firestore emulados.

Las cuatro reservas existentes, los dos clientes anteriores y el empleado conservan sus datos. No se crearon clientes ficticios ni reservas en producción. Sin push. Los resultados, verificaciones y capturas están en .production-audit/ y no se publican.

Archivos de esta etapa: firebase.json; mobile/firestore.registro.rules; web/public/acceso.js; web/public/app.js; web/public/index.html; web/test/acceso.test.js; tools/firebase/test/registro-publico.test.mjs; este informe.

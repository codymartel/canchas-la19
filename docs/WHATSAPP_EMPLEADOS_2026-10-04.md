# WhatsApp privado de empleados — 4 de octubre de 2026

Alta y edición de empleados incorporan WhatsApp para recibir reservas. Se normaliza a formato internacional: el móvil peruano de nueve dígitos recibe +51; se eliminan espacios, paréntesis, puntos y guiones. Otros países requieren código internacional. Se acepta vacío para conservar compatibilidad y marcar configuración pendiente. No se comprueba que el número tenga una cuenta WhatsApp ni se envían mensajes.

El campo whatsappReservas queda en negocios/{negocio}/empleados/{uid}; solo el administrador modifica la ficha, el empleado conserva lectura de su propia ficha y la web pública no puede leerla. Las reglas validan cadena vacía o + seguido de 8–15 dígitos con primer dígito distinto de cero. La lista Empleado principal por cancha muestra el WhatsApp del empleado designado o Pendiente de configurar. No se cambian las asignaciones al ingresar el número; al cambiar de encargado, la tarjeta consulta el número de la nueva ficha.

El alta valida el WhatsApp antes de crear una cuenta en Firebase Auth. Las ediciones que no envían el nuevo campo conservan el dato existente; la UI permite vaciarlo de forma explícita. No se publican números del personal ni se implementa enrutamiento automático al cliente en esta etapa.

Inventario: una ficha real compatible, respaldada en .production-audit/whatsapp-empleados-antes.json. No requiere migración. No se ingresaron números ficticios ni se editaron fichas reales durante las pruebas.

Validación: flutter analyze sin incidencias; 52 pruebas Flutter aprobadas (incluye normalización, vacío y rechazo de números inválidos); 82 pruebas de reglas aprobadas, sin el límite de 1.000 expresiones. Build release completado sin emuladores. Se publicaron únicamente firestore:rules y hosting:personal. Panel https://glass-sintetico.web.app/, versión 683c539ee01f668f; reglas fa811305-185d-472b-9557-5681481df557. La web pública conserva versión 9cce7afc28c3a63f. SHA-256 main.dart.js c1e9ebcec37d1e892637e1babfab503f36f7c0cec916e933a83551e112782fc7.

Verificación posterior: fuentes servidas y reglas iguales a las locales; cuatro reservas, clientes y ficha del empleado originales intactos. Se abrió el formulario publicado, se comprobó el nuevo campo vacío y se cerró sin guardar. No se crearon cuentas ni se cambiaron asignaciones. Evidencia privada .production-audit/whatsapp-empleado-formulario.png; logs whatsapp-empleado-flutter.log, whatsapp-empleado-reglas.log, whatsapp-empleado-build.log y whatsapp-empleado-deploy.log. Sin push.

Archivos: mobile/firestore.rules; mobile/lib/features/empleados/data/empleados_repository.dart; mobile/lib/features/empleados/presentation/empleados_provider.dart; mobile/lib/features/empleados/presentation/empleados_screen.dart; mobile/test/whatsapp_empleado_test.dart; tools/firebase/test/firestore.rules.test.mjs; docs/ARQUITECTURA_SPARK.md y este informe.

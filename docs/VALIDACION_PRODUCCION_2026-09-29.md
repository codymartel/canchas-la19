# Validacion de produccion — 29 de septiembre de 2026

Actualización posterior: [corrección de horas y recarga](CORRECCION_HORAS_Y_RECARGA_2026-09-29.md). Las versiones y filas de 30 minutos de este informe corresponden al corte anterior.

Proyecto real: glass-sintetico. Negocio existente: grass-sintetico. No hubo push. No se creo otro negocio ni canchas ficticias. Formulario publico habilitado.

## Inventario y preservacion

Inventario recursivo de todas las colecciones y subcolecciones de Firestore, incluidos documentos padres ausentes: 13 documentos existentes, 2 clientes, 1 empleado y las tres canchas reales. No se encontraron reservas, bloqueos, slots ni agendas antiguas. Cuenta gerente verificada y habilitada. Negocio ya preparado: el acceso lleva al panel; no necesita ejecutar de nuevo Vamos a coordinar.

Respaldos completos anteriores de Firestore, RTDB, reglas, Auth y versiones de Hosting en .production-audit/, excluida de Git. Esa carpeta contiene datos privados; no debe publicarse. No se modificaron clientes ni empleado: se compararon sus updateTime antes y despues. Se conservaron sedes, users, sistema/grass y todos los campos heredados de las canchas.

## Cambios y datos preparados

- Horario global privado y publico: aperturaMinuto=420, cierreMinuto=60, duracionTurnoMinutos=30, America/Lima. Los 36 intervalos del dia operativo terminan a la 01:00 del dia siguiente. Minutos 1440 y 1470 pertenecen al dia operativo anterior.
- Las tres tablas del panel se muestran juntas a ancho de escritorio y se apilan en pantallas pequenas. Incluyen nombre, telefono, estado y responsable. Pendientes no ocupan; aprobar exige empleado activo asignado y revalida disponibilidad. El gerente puede crear y cancelar, pero no aprobar largas sin asignacion de empleado.
- La web escucha tres proyecciones publicas con onSnapshot. Solo muestra Libre/Ocupado. Direccion vacia y tarifa null no impiden reservar. No se inventaron precios, direcciones, fotos ni credenciales.
- Se prepararon 8 documentos en una sola escritura atomica con precondiciones de updateTime/existencia: negocios/grass-sintetico, negocios_publicos/grass-sintetico, negocios/grass-sintetico/canchas/la-19, la-23, la-24 y canchas_publicas/la-19, la-23, la-24. Las tres canchas quedaron activas. Los campos antiguos permanecen intactos; no son fuente del nuevo horario.
- Importe, adelanto y saldo permanecen en cero; historialPagos vacio. No se integro Culqi, WhatsApp automatico ni pago real.

## Comprobaciones

| Comprobacion | Resultado |
|---|---|
| Flutter analyze | Sin incidencias |
| Flutter suite completa | 37 pruebas aprobadas |
| Flutter afectados tras ajustes finales | 19 aprobadas; prueba visual final de tablas: 6 aprobadas |
| Tres tablas vacias | 108 franjas Libre y tres filas de 00:30 a 01:00 del dia siguiente |
| Web JavaScript | Sintaxis valida; 12 pruebas aprobadas |
| Firestore Rules | 71/71 aprobadas, repetidas tras cerrar cobertura de asignacion |
| RTDB Rules y aprovisionamiento | Aprobados; reglas y ACL reales ya compatibles, no redeploy de RTDB |
| Integracion demo-grass-local | Dos sesiones, listeners publicos y privados de tres canchas, un ganador, cinco horas pendientes, rechazo ajeno, conflicto al aprobar, cancelacion y madrugada operativa aprobados |
| Limites | Reserva maxima de 600 minutos y sonda base aceptadas; ningun mensaje de limite de 1.000 expresiones en suites aprobadas |
| Build de produccion | flutter build web --release aprobado, sin EMULATOR_HOST; hashes del panel y app publica publicados iguales a los locales |

El compilador de reglas publico advertencias de funciones antiguas sin uso y referencias en una funcion sin uso; no hubo error de compilacion ni fallo en las suites. El build Flutter incluyo advertencias informativas de fuentes/wasm.

### Mutaciones y discrepancia anterior

El informe anterior 20 detectadas + 19 supervivientes + 0 rotas solo explicaba 39 de 45. Los archivos originales del commit contienen 45 objetivos localizables; no es correcto atribuir sin evidencia las seis faltantes a no-encontrado. El registro previo disponible no permite reconstruirlas. Ese recuento anterior no se uso como prueba de cobertura.

La nueva corrida completa ejecuto 45/45: 23 detectadas, 22 supervivientes, 0 rotas, 0 omitidas. El ejecutor ahora busca condiciones dentro de la funcion, en vez de depender de numeros de linea, e informa ejecutadas y omitidas. Al inspeccionar supervivencias se amplio la prueba de asignacion con altas cortas y largas en una cancha ajena. Corrida complementaria de ese objetivo: detectado, 0 supervivientes. La suite completa siguio aprobando 71/71. Los dos informes se conservan separados, sin fingir que la corrida complementaria es otra corrida de 45.

Cuatro mutaciones exigidas:
- get(ruta).data.activo == true: detectado; detectada por un empleado desactivado tampoco puede escribir.
- get(ruta).data.rol == 'empleado_control': detectado; detectada por un rol que no sea de control no escribe, y sin sesion tampoco.
- getAfter(rutaConfiguracion()).data.administradorUid == request.auth.uid: detectado; detectada por reclamar la configuracion exige correo verificado y ancla sin dono.
- verificado(): detectado; detectada por reclamar la configuracion exige correo verificado y ancla sin dono.

## Despliegue

Orden ejecutado: firestore:rules; lote de datos reales; hosting:personal y hosting:publica con formulario cerrado; verificacion de hashes/datos; hosting:publica con formulario abierto. Todos los comandos usaron --only y --project glass-sintetico. No se publicaron indices, RTDB ni Functions. No se necesito rollback.

| Target | URL | Version final |
|---|---|---|
| personal | [https://glass-sintetico.web.app](https://glass-sintetico.web.app) | 8dc90478254f29df |
| publica | [https://glass-sintetico-tienda.web.app](https://glass-sintetico-tienda.web.app) | d76119a182ea5eef |

Firestore ruleset: projects/glass-sintetico/rulesets/68dac873-c51e-4875-9570-8be3bdcdd95e. SHA-256 del contenido publicado: 653619bd3e684d0855d9ff5fe82788946497715648aa9287aa719ccfd9556584.

## Prueba real y estado final

Una reserva creada desde el formulario web publicado con los datos de prueba autorizados (no reproducidos aqui): r_d36a10cb-b345-44f5-bf60-42ea7eb4187b. La 19, dia operativo 2026-09-29, minuto 1440, duracion 60: 30 de septiembre de 00:00 a 01:00 America/Lima. Estado final cancelada; ambas franjas libres. No se borro el documento de reserva.

Otra sesion vio las franjas ocupadas; el mismo horario fue rechazado. Tres lecturas privadas de esa otra sesion (reserva, clientes y empleados) devolvieron permission-denied. Los importes y el historial de pagos se comprobaron en cero/vacio.

La cancelacion de produccion se realizo con credenciales de operador por REST y precondiciones, preservando atendidoPor; no se atribuyo a un empleado ni se presento como prueba de una sesion de empleado. La cancelacion mediante un empleado autorizado se comprobo en emuladores. El panel publicado se verifico hasta su pantalla de acceso y su bundle; queda la prueba manual de iniciar sesion con las credenciales reales del gerente/empleado. No se solicitaron ni inventaron credenciales.

Comprobacion visual final publicada: 3 tablas, 108 celdas Libre, 0 Ocupado y disponibilidad confirmada por servidor. Captura local en .production-audit/publica-final.png.

## Metricas agregadas

| Captura (UTC) | Lecturas | Escrituras | DENY | ERROR |
|---|---:|---:|---:|---:|
| Antes: 2026-09-30T01:45:00.739Z | 81 | 0 | 6 | 3 |
| Despues: 2026-09-30T02:22:41.677Z | 165 | 14 | 9 | 3 |

Ventanas moviles de 24 horas. Lecturas incluyen LOOKUP, QUERY y NOT_FOUND. Para reglas se usa solo la serie version=__unknown__, evitando sumar dos representaciones de la misma metrica. La captura inicial no devolvio serie de escrituras (suma observada 0). Se conservaron JSON de cada serie y una captura inmediata posterior adicional.

Estas cifras incluyen inventario, preparacion, comprobaciones y cualquier actividad del proyecto. Hay retraso de muestreo y cambian los eventos que entran/salen de la ventana; no representan el costo exacto de una reserva individual.

[Firebase Console](https://console.firebase.google.com/project/glass-sintetico/firestore): Firestore Database > Uso para lecturas/escrituras y evaluaciones de reglas; Reglas para el contenido activo y monitor de evaluaciones/denegaciones cuando se muestre. [Documentacion oficial de monitorizacion](https://firebase.google.com/docs/firestore/monitor-usage).

## Commits locales y archivos

Implementacion: dcbf1281121fc5a0ec4288604d3c165da83d2dff. Activacion publica: a648f7b15e20af9fd10c8a59efaebb89b56564be. Base conservada: 8e11289e52c013b4f86215720c90222cc7760761. El commit del presente informe se entrega aparte para evitar una referencia circular. No hubo push.

- [.gitignore](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/.gitignore)
- [docs/ARQUITECTURA_SPARK.md](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/docs/ARQUITECTURA_SPARK.md)
- [firebase.json](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/firebase.json)
- [mobile/firestore.rules](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/mobile/firestore.rules)
- [mobile/lib/core/domain/formatos.dart](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/mobile/lib/core/domain/formatos.dart)
- [mobile/lib/core/domain/negocio.dart](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/mobile/lib/core/domain/negocio.dart)
- [mobile/lib/features/reservas/data/reservas_repository.dart](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/mobile/lib/features/reservas/data/reservas_repository.dart)
- [mobile/lib/features/reservas/presentation/agenda_provider.dart](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/mobile/lib/features/reservas/presentation/agenda_provider.dart)
- [mobile/lib/features/reservas/presentation/agenda_screen.dart](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/mobile/lib/features/reservas/presentation/agenda_screen.dart)
- [mobile/lib/features/reservas/presentation/reserva_dialog.dart](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/mobile/lib/features/reservas/presentation/reserva_dialog.dart)
- [mobile/lib/features/sedes/data/sedes_repository.dart](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/mobile/lib/features/sedes/data/sedes_repository.dart)
- [mobile/lib/features/sedes/presentation/sedes_screen.dart](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/mobile/lib/features/sedes/presentation/sedes_screen.dart)
- [mobile/test/agenda_test.dart](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/mobile/test/agenda_test.dart)
- [mobile/test/horario_test.dart](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/mobile/test/horario_test.dart)
- [tools/firebase/scripts/sincronizar-datos-publicos.mjs](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/tools/firebase/scripts/sincronizar-datos-publicos.mjs)
- [tools/firebase/test/firestore.rules.test.mjs](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/tools/firebase/test/firestore.rules.test.mjs)
- [tools/firebase/test/mutar-prioritarias.mjs](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/tools/firebase/test/mutar-prioritarias.mjs)
- [tools/firebase/test/web-flow.test.mjs](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/tools/firebase/test/web-flow.test.mjs)
- [web/public/app.js](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/web/public/app.js)
- [web/public/disponibilidad.js](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/web/public/disponibilidad.js)
- [web/public/firebase-config.js](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/web/public/firebase-config.js)
- [web/public/styles.css](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/web/public/styles.css)
- [web/test/disponibilidad.test.js](C:/Users/User/Downloads/reservas_cancha/canchas-cliente/web/test/disponibilidad.test.js)

Adicional: este informe de validacion. Los respaldos privados y scripts operativos temporales permanecen excluidos de Git.

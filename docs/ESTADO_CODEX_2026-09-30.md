# Estado: reglas de Firestore y pagos con Culqi

Fecha: 2026-09-30. Rama: `checkpoint/agenda-diaria-schema5`.

Este documento cubre unicamente el trabajo propio sobre reglas y la investigacion
de pagos. El trabajo de Codex sobre reservas y despliegue esta en otros commits
y no se describe aqui.

## Pagos: no implementado

No hay pagos en el codigo. Todo lo de Culqi es investigacion previa, sin
implementacion. La web publica sigue con el formulario deshabilitado y los
importes viajan en cero.

## Reglas: limites de accesos medidos

La afirmacion anterior de que el emulador no reporta limites de accesos era falsa.
Los limites oficiales son 10 llamadas a `exists()`, `get()` y `getAfter()` por
escritura, y 20 por lote, y el limite de 10 aplica tambien a cada escritura del
lote.

`tools/firebase/test/sonda-presupuesto.mjs` inyecta accesos sinteticos a
documentos distintos sobre una copia de las reglas y localiza por busqueda
binaria el umbral exacto de denegacion. Resultado del escenario mas pesado
(aprobar una reserva de 600 minutos, lote de tres escrituras):

| escritura | accesos | limite | margen |
| --- | --- | --- | --- |
| transicionar la reserva | 4 | 10 | 6 |
| escribir la agenda privada | 3 | 10 | 7 |
| escribir el espejo publico | 1 | 10 | 9 |
| total del lote | 8 | 20 | 12 |

El contraste con el conteo estatico es lo importante: contar los puntos donde
aparecen `get` y `exists` da hasta 12 por documento y 29 en el lote, muy por
encima de ambos limites. Ese numero no es el real. El cortocircuito de `&&` y
`||` evita la mayoria de las llamadas, y las repetidas sobre el mismo documento
se cachean.

La sonda confirma que el emulador si aplica los dos limites: con 8 reales y 12
inyectados acepta (20 exactos), y con 13 inyectados deniega (21). La frontera
queda acotada al numero.

## Reglas: mutaciones priorizadas

`tools/firebase/test/mutar-prioritarias.mjs` cambia una condicion a la vez sobre
una copia temporal, corre la suite completa y restaura la copia antes de la
siguiente. Cubre las ocho funciones que sostienen horarios, solapamientos,
ocupacion y permisos.

De 45 mutaciones: **20 detectadas, 19 sobreviven, 0 rotas**.

`mutar-operadores.mjs` esta disponible para una corrida exhaustiva (1214
mutaciones) pero no se completo. Hay que trocearla con `MUTAR_ENTRE_A` y
`MUTAR_ENTRE_B` porque no entra en una sola ventana de ejecucion.

## Reglas: cuatro huecos cerrados

Las cuatro supervivencia que eran huecos reales de cobertura se cerraron anadiendo
pruebas. **No se modifico ninguna regla activa**: el fallo estaba en la
cobertura, no en las reglas.

| hueco | por que sobrevivia a la mutacion | prueba anadida |
| --- | --- | --- |
| `activo == true` (`firestore.rules:98`) | el test de aislamiento solo probaba lecturas | `un empleado desactivado tampoco puede escribir` |
| `rol == 'empleado_control'` (`:99`) | no existia ningun empleado con otro rol | `un rol que no sea de control no escribe, y sin sesion tampoco` |
| `verificado()` (`:49`) | nadie probaba reclamar sin verificar | `reclamar la configuracion exige correo verificado y ancla sin dono` |
| `administradorUid == request.auth.uid` (`:52`) | el `setDoc` sobre ancla existente evalua `update`, nunca `create` | la misma prueba anterior |

Las 19 supervivientes restantes son redundancia estructural: otra linea impone lo
mismo. estan documentadas una a una en `docs/ARQUITECTURA_SPARK.md`, seccion
`### Que expresion cubre a cual`, con linea y motivo.

Suite de reglas: **68 a 71 pruebas**, todas verdes. `employeeRecord` ahora acepta
`rol` para poder sembrar un rol que no sea de control.

## Culqi: decisiones abiertas

Flujo recomendado: Culqi Checkout (los datos de tarjeta nunca pasan por tu
servidor, mantiene SAQ-A) mas ordenes cuando el medio es asincrono, porque la
documentacion dice que el webhook es obligatorio para ordenes. El saldo se
descuenta solo desde el webhook, re-consultando el recurso en la API.

El dato relevante: el **token de Culqi dura 5 minutos y es de un solo uso**. Es
la primera barrera contra el doble cobro, no la unica.

Lo que la documentacion oficial **no** publica, y que hay que confirmar con
soporte Culqi antes de construir:

- **No hay clave de idempotencia documentada** para cargos ni ordenes. Ese
  patron es estandar en otras pasarelas, pero no aparece en Culqi. La
  idempotencia tiene que construirse del lado propio: registrar el
  `charge.id` o `order.id` y rechazar un segundo webhook con el mismo id, con
  una escritura de Firestore que solo funcione una vez.
- **No se documenta firma ni esquema de verificacion de webhook.** La pagina de
  webhooks es deliberadamente escueta. La estrategia de verificacion es diseno
  propio: consultar el recurso por su id y comparar `amount` y `currency_code`
  contra lo esperado para esa reserva, usando `metadata` para atar el cargo.

Consecuencia practica: **el backend no debe reintentar automaticamente "crear
cargo" ante un error de red**, porque sin clave de idempotencia un reintento
puede generar un segundo cobro. La proteccion vive en el almacenamiento propio.

Decisiones pendientes:

1. Checkout o API directa. La API directa exige presentar el formulario SAQ-D a
   Culqi y te hace responsable de la norma.
2. Donde vive el backend: externo o Cloud Functions en Blaze. Blaze exige tarjeta
   de credito y activa facturacion por uso en todo el proyecto.
3. Medios de pago: solo tarjeta, o tambien PagoEfectivo y billeteras. Decide si
   las ordenes son obligatorias o una opcion.
4. Confirmar con Culqi si existe idempotencia del API.
5. Que hacer con un pago expirado o devuelto, y quien queda notificado.
6. Cuando relaxar las reglas: hoy `montoCentimos`, `adelantoCentimos` y
   `saldoCentimos` se exigen en cero y `metodoPago` vacio. Permitir el registro
   de pagos debe ser un cambio unico y consciente.

Sobre privacidad: la proyeccion publica debe seguir exponiendo solo `ocupados`.
Nombre, telefono e importes viven en la ficha privada de la reserva. El `email`
es obligatorio en la API de cargos, asi que viaja a Culqi; lo que no debe hacer
es volver a la web publica.

## Fuentes oficiales de Culqi

- Cargos unicos, resumen del flujo: https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/resumen
- Crear un cargo: https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/cargos
- Tokens, cinco minutos y un solo uso: https://docs.culqi.com/es/documentacion/pagos-online/cargo-unico/tokens
- Ordenes de pago, webhook obligatorio: https://docs.culqi.com/es/documentacion/pagos-online/ordenes-de-pago/resumen
- Webhooks: https://docs.culqi.com/es/documentacion/pagos-online/webhooks/
- Seguridad y PCI DSS: https://docs.culqi.com/es/documentacion/pagos-online/fraude/seguridad
- Llaves de integracion pk y sk: https://docs.culqi.com/es/documentacion/pagos-online/llaves
- API de cargos, eventos y campo `paid`: https://apidocs.culqi.com/
- Devoluciones: https://docs.culqi.com/es/documentacion/pagos-online/operaciones/devoluciones

## Commits

- `43a12f9` test(reglas): cerrar los huecos que dejaron vivas las mutaciones
- `8e11289` test(reglas): medir el presupuesto de accesos y cerrar cuatro huecos
  de cobertura

Ninguno ha sido enviado al remoto. `mobile/firestore.rules` no se modifico en
ninguno de los dos.

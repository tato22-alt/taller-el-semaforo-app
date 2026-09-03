# Constitución — El Semáforo

Principios no negociables de El Semáforo App, el sistema de gestión del Taller El Semáforo.

Este documento manda sobre cualquier spec, plan o implementación. Cuando una decisión de diseño lo
contradiga, se cambia la decisión — o se enmienda la constitución explícitamente, con su justificación.

**Versión:** 1.0.0 · **Ratificada:** 2026-09-03 · **Última enmienda:** 2026-09-03

---

## Origen

Estos principios no son preferencias técnicas. Cada uno responde a un problema medido durante el
relevamiento del taller (`negocio.md`, `REQUISITOS.md`) o a un defecto encontrado auditando el modelo
SQL previo. La referencia entre paréntesis dice de dónde sale.

---

## I. Un solo campo de estado

El único estado almacenado del sistema es el **estado operativo del trabajo**: dónde está el auto.

Prohibido agregar columnas de estado financiero, documental o de siniestro. Si aparece la necesidad de
un campo llamado `estado_cobro`, `documentacion_ok`, `estado_siniestro` o similar, la respuesta correcta
es una función de lectura, no una columna.

> *Por qué:* el modelo anterior colapsaba tres ejes en `Casos.estado`, y por eso no se podía consultar
> ninguno. Un trabajo entregado, facturado y esperando pago es un estado real de la realidad y era una
> imposibilidad del esquema.

## II. Lo que se puede derivar, no se almacena

Saldo, deuda vencida, documentación faltante, repuestos pendientes, listo para turno, listo para
facturar, días de espera, estado financiero, estado del siniestro y el semáforo mismo **se calculan al
leer**, a partir de datos que hay que guardar de todos modos.

Un dato derivado que se almacena es un dato que en algún momento nadie va a actualizar.

> *Por qué:* un sistema de cobranza que miente es peor que no tener sistema. La única defensa estructural
> es que el número no se pueda desactualizar porque no existe hasta que se lo pide.

## III. El sistema avisa, nunca bloquea

Ninguna validación impide registrar un hecho que ya ocurrió en la realidad.

Falta la orden firmada y hay que facturar igual: se factura, y el trabajo queda en rojo. Falta el
teléfono del cliente: se da de alta igual. El semáforo informa qué falta; no es un guardia.

> *Por qué:* un sistema que impide registrar la realidad se saltea, y a partir de ese día refleja una
> realidad que no existe. Se abandona en semanas.

## IV. Cada dato se carga una sola vez

Si un dato ya vive en el sistema, ningún formulario lo vuelve a pedir. Cliente, vehículo, patente,
compañía y montos se leen de donde ya están.

Al proponer un campo nuevo, hay que poder contestar: qué decisión habilita, y qué pasa si no está. Si
la respuesta es "podría servir algún día", el campo no entra.

> *Por qué:* la aplicación no debe convertir a las personas en cargadores de datos. El costo de carga es
> el que decide si el sistema se usa, y ningún beneficio compensa que se abandone.

## V. Ningún automatismo escribe estados financieros

Ni un trigger, ni un procedimiento, ni un job programado, ni un modelo de lenguaje marca algo como
cobrado, cierra un trabajo o decide un monto.

Sólo un cobro registrado por una persona baja un saldo.

> *Por qué:* no es hipotético. En el modelo anterior, `sp_RegistrarCobro` marcaba el caso como cobrado
> ante cualquier cobro sin factura, sin comparar montos: una seña cerraba un trabajo entero. El
> automatismo producía activamente el dato equivocado sobre la prioridad número uno del negocio.

## VI. Toda deuda tiene un deudor explícito

Quién debe es un dato propio, nunca una inferencia a partir del origen del trabajo.

Un trabajo puede deberle a más de una parte: franquicia a cargo del asegurado, o un arreglo particular
sumado a un siniestro. Y el deudor puede cambiar en el camino, cuando la compañía indemniza al asegurado
y el cliente decide reparar igual.

> *Por qué:* confirmado por el negocio. Con un solo deudor derivado del origen, esos casos obligan a
> falsear datos para poder cobrar.

## VII. El saldo tiene que poder llegar a cero

Todo lo que cancela deuda se imputa a la deuda, incluso cuando no entra a la cuenta.

Las retenciones bancarias varían por banco y por operación: si se registra sólo lo acreditado, ningún
trabajo queda saldado nunca y el tablero de deuda se llena de residuos de dos o tres por ciento.

> *Por qué:* un tablero de cobranza con deudas fantasma deja de mirarse, y con eso se pierde exactamente
> la función que justifica el proyecto.

## VIII. La App es la fuente de verdad

WhatsApp y el email son canales de entrada y evidencia, no archivos. Las plataformas de las compañías
son la verdad de la autorización y del pago; la App guarda copia y referencia.

Un modelo de lenguaje interpreta, extrae y propone. Nunca escribe sin confirmación de una persona, y
nunca toca nada que involucre dinero.

Toda regla de negocio vive en la API de El Semáforo. Una regla duplicada en un flujo de automatización
son dos versiones que en seis meses difieren y nadie sabe cuál rige.

## IX. El alcance se defiende activamente

Fuera del MVP, y no entran sin enmienda a esta constitución: cuenta corriente y pagos a proveedores,
conciliación bancaria, stock e inventario, RRHH y productividad, planificación de capacidad, integración
con plataformas de aseguradoras, portal de clientes, agentes autónomos.

Tampoco entran sub-etapas de la reparación (chapa, pintura, pulido, lavado), asignación de tareas por
operario, ni registro manual de comunicaciones.

> *Por qué:* el problema del taller es administrativo. El taller ya funciona. Cada módulo que modela la
> operación agrega carga sin resolver ninguna de las cuatro dolencias críticas.

## X. La spec precede al código

Ninguna implementación arranca sin una spec aprobada. El orden es spec → plan → tasks → implement, y las
dos primeras las confirma el dueño del negocio antes de escribir código.

Una spec describe qué y por qué, sin tecnología. El plan elige el cómo. Cuando la implementación
descubre que la spec estaba equivocada, se corrige la spec — no se deja el código como única verdad.

---

## Restricciones heredadas

El repositorio `gestion-taller-sql-server` es un modelo académico previo. Se conserva lo que representa
correctamente el negocio y se rediseña lo que no. No es autoridad: cuando el modelo previo y el negocio
real se contradicen, gana el negocio.

Quedan derogados de ese modelo, por violar los principios I y V: el enum de nueve estados de `Casos`,
el estado `cobrada` en `Facturas`, y los dos triggers y el `UPDATE` de estado de `sp_RegistrarCobro`.

---

## Gobierno

Esta constitución prevalece sobre toda otra práctica del proyecto.

**Enmiendas.** Se proponen por escrito, con el problema concreto que las motiva, y las aprueba el dueño
del negocio. Una enmienda que agregue alcance debe nombrar la dolencia que resuelve.

**Versionado.** MAJOR: se quita o se redefine un principio. MINOR: se agrega un principio o una
restricción. PATCH: aclaraciones que no cambian el significado.

**Cumplimiento.** Toda spec y todo plan se revisan contra estos principios antes de aprobarse. Una
complejidad que los contradiga tiene que justificarse explícitamente en el plan, o se simplifica.

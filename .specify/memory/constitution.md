# Constitución — Modelo de datos de El Semáforo

Principios no negociables del modelo de datos que sostiene a El Semáforo, el sistema de gestión del
Taller El Semáforo.

Este documento manda sobre cualquier spec, plan o migración de este repositorio. Cuando una decisión de
diseño lo contradiga, se cambia la decisión — o se enmienda la constitución explícitamente, con su
justificación.

**Versión:** 3.0.0 · **Ratificada:** 2026-09-03 · **Última enmienda:** 2026-09-05

---

## Alcance de este repositorio

Acá vive **la base de datos**: esquema, restricciones de integridad, vistas de derivación, y el
diccionario que las explica. La aplicación se construye por separado y consume esta base.

Motor: **PostgreSQL sobre Supabase**.

Este repositorio es responsable de:

- las entidades, sus relaciones y sus restricciones de integridad;
- las vistas que derivan magnitudes de negocio a partir de los hechos registrados;
- las políticas de acceso a los datos (RLS) y los permisos sobre tablas y vistas;
- la documentación del modelo.

No es responsable de: reglas de proceso, interfaz, orquestación ni presentación. Todo eso vive en la
aplicación.

**Por qué Postgres y no SQL Server.** El modelo anterior de este repositorio era SQL Server, y la v2.0.0
de esta constitución lo declaraba como motor. Se cambió porque SQL Server obligaba a decidir dónde
correrlo y a escribir a mano la API que la aplicación necesita, y eso bloqueaba conectar el presupuesto
por semanas. Supabase expone el esquema como API sin código intermedio. El modelo conceptual no cambió;
cambió su implementación.

**Consecuencia sobre el alcance.** Como la API se genera desde el esquema, quién puede leer y escribir
cada fila también se define acá. Por eso las políticas de acceso entran al alcance de este repositorio,
y por eso esta enmienda es MAJOR: en la v2.0.0 los permisos estaban explícitamente fuera.

---

## Origen

Estos principios no son preferencias técnicas. Cada uno responde a un problema medido durante el
relevamiento del taller (`negocio.md`, `REQUISITOS.md`) o a un defecto encontrado auditando el modelo
académico previo de este mismo repositorio.

---

## I. Un solo campo de estado

El único estado almacenado del modelo es el **estado operativo del trabajo**: dónde está el auto.

Prohibido agregar columnas de estado financiero, documental o de siniestro. Si aparece la necesidad de
una columna llamada `estado_cobro`, `documentacion_ok`, `estado_siniestro` o similar, la respuesta
correcta es una vista, no una columna.

> *Por qué:* el modelo anterior colapsaba tres ejes en `Casos.estado`, y por eso no se podía consultar
> ninguno. Un trabajo entregado, facturado y esperando pago es un estado real de la realidad y era una
> imposibilidad del esquema.

## II. Lo que se puede derivar, no se almacena

Saldo, deuda vencida, documentación faltante, repuestos pendientes, listo para turno, listo para
facturar, días de espera, estado financiero y estado del siniestro **se calculan al leer**, a partir de
datos que hay que guardar de todos modos.

Un dato derivado que se almacena es un dato que en algún momento nadie va a actualizar.

> *Por qué:* un sistema de cobranza que miente es peor que no tener sistema. La única defensa estructural
> es que el número no se pueda desactualizar porque no existe hasta que se lo pide.

## III. La base entrega magnitudes; la aplicación interpreta

La frontera entre este repositorio y la aplicación es explícita.

**La base deriva y expone** hechos y magnitudes deterministas: saldo, importe cobrado, retenciones
imputadas, días transcurridos desde el envío de una factura, días de vencimiento, documentos faltantes,
repuestos pendientes, estado financiero y estado del siniestro. Cualquier consumidor —la aplicación, una
automatización, la capa de IA— obtiene de acá los mismos números.

**La aplicación decide** qué hacer con eso: el color del semáforo, la prioridad de una lista, el texto
de un aviso, a quién se le muestra qué y cuándo.

> *Por qué:* si la derivación viviera en cada consumidor, en seis meses habría dos definiciones de saldo
> que no coinciden y ninguna forma de saber cuál rige. Y si la base decidiera el color, cada cambio de
> criterio de producto sería una migración.

Con Supabase esta frontera deja de ser una convención y pasa a ser física: las vistas de derivación
**son** la API que consumen la aplicación y las automatizaciones. Lo que no está en una vista o una
tabla expuesta, no existe para ningún consumidor.

## IV. El esquema no impide registrar la realidad

Ninguna restricción del modelo bloquea el registro de un hecho que ya ocurrió.

En la práctica: los campos que describen etapas posteriores nacen nulos y se sellan cuando el hecho
ocurre; no existen restricciones que exijan completitud documental para facturar o cobrar; los `CHECK`
se reservan para dominios cerrados y valores imposibles, nunca para forzar un orden del proceso.

Falta la orden firmada y hay que facturar igual: la base lo acepta, y la vista de faltantes lo reporta.

> *Por qué:* un sistema que impide registrar la realidad se saltea, y a partir de ese día refleja una
> realidad que no existe. Se abandona en semanas.

## V. Cada hecho se registra en un solo lugar

Sin columnas duplicadas ni denormalización por conveniencia. Si un dato se puede alcanzar por una
relación, no se copia.

Al proponer una columna nueva hay que poder contestar: qué decisión habilita, y qué pasa si no está. Si
la respuesta es "podría servir algún día", la columna no entra.

> *Por qué:* cada copia es una oportunidad de divergencia, y cada columna de más es carga que alguien
> tiene que completar. El costo de carga es el que decide si el sistema se usa.

## VI. Ningún automatismo escribe estados financieros

Ni un trigger, ni un procedimiento, ni un job programado marca algo como cobrado, cierra un trabajo o
decide un monto.

Sólo un cobro registrado explícitamente baja un saldo, y el saldo se lee de una vista.

> *Por qué:* no es hipotético. En el modelo anterior de este repositorio, `sp_RegistrarCobro` marcaba el
> caso como cobrado ante cualquier cobro sin factura, sin comparar montos: una seña cerraba un trabajo
> entero. El automatismo producía activamente el dato equivocado sobre la prioridad número uno del
> negocio.

## VII. Toda deuda tiene un deudor explícito

Quién debe es un dato propio, nunca una inferencia a partir del origen del trabajo.

Un trabajo puede deberle a más de una parte: franquicia a cargo del asegurado, o un arreglo particular
sumado a un siniestro. Y el deudor puede cambiar en el camino, cuando la compañía indemniza al asegurado
y el cliente decide reparar igual.

> *Por qué:* confirmado por el negocio. Con un solo deudor derivado del origen, esos casos obligan a
> falsear datos para poder cobrar.

## VIII. El saldo tiene que poder llegar a cero

Todo lo que cancela deuda se imputa a la deuda, incluso cuando no entra a la cuenta.

Las retenciones bancarias varían por banco y por operación: si se registra sólo lo acreditado, ningún
trabajo queda saldado nunca.

> *Por qué:* un tablero de cobranza con deudas residuales de dos o tres por ciento deja de mirarse, y con
> eso se pierde exactamente la función que justifica el proyecto.

## IX. El alcance se defiende activamente

No se crean, y no entran sin enmienda a esta constitución, las estructuras de: cuenta corriente y pagos a
proveedores, conciliación bancaria, stock e inventario, RRHH y productividad, planificación de capacidad,
portal de clientes.

Tampoco: sub-etapas de la reparación (chapa, pintura, pulido, lavado), asignación de tareas por operario,
ni registro manual de comunicaciones.

> *Por qué:* el problema del taller es administrativo. El taller ya funciona. Cada tabla que modela la
> operación agrega carga sin resolver ninguna de las cuatro dolencias críticas.

## X. La spec precede a la migración

Ninguna migración se escribe sin una spec aprobada. El orden es spec → plan → tasks → implement, y las
dos primeras las confirma el dueño del negocio antes de que se toque el esquema.

Una spec describe qué información hay que poder registrar y responder, sin sintaxis. El plan elige el
cómo: tablas, tipos, índices, vistas. Cuando la implementación descubre que la spec estaba equivocada, se
corrige la spec — no se deja el DDL como única verdad.

---

## Restricciones heredadas

El estado previo de este repositorio es un modelo académico. Se conserva lo que representa correctamente
el negocio y se rediseña lo que no. No es autoridad: cuando el modelo previo y el negocio real se
contradicen, gana el negocio.

Ese modelo era SQL Server; el actual es PostgreSQL. Lo que se rescata de él es el modelado, no el DDL.

Quedan derogados, por violar los principios I y VI:

- el enum de nueve estados de `Casos`;
- el estado `cobrada` en `Facturas`;
- `trg_Casos_ActualizarFecha` y `trg_Cobros_ActualizarFactura`;
- el `UPDATE` de estado dentro de `sp_RegistrarCobro`.

---

## Gobierno

Esta constitución prevalece sobre toda otra práctica del repositorio.

**Enmiendas.** Se proponen por escrito, con el problema concreto que las motiva, y las aprueba el dueño
del negocio. Una enmienda que agregue alcance debe nombrar la dolencia que resuelve.

**Versionado.** MAJOR: se quita o se redefine un principio, o cambia el alcance del repositorio. MINOR:
se agrega un principio o una restricción. PATCH: aclaraciones que no cambian el significado.

**Historial.** v1.0.0 constitución del sistema completo · v2.0.0 acotada al modelo de datos, motor SQL
Server · v3.0.0 motor PostgreSQL sobre Supabase, las políticas de acceso entran al alcance.

**Cumplimiento.** Toda spec y todo plan se revisan contra estos principios antes de aprobarse. Una
complejidad que los contradiga tiene que justificarse explícitamente en el plan, o se simplifica.

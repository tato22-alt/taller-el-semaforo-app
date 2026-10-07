# Plan 001 — Presupuesto

**Estado:** borrador, pendiente de aprobación
**Spec:** `specs/001-presupuesto/spec.md`
**Constitución aplicable:** v2.0.0
**Motor:** PostgreSQL sobre Supabase

---

## Decisiones de diseño

Cada una con su alternativa descartada, porque son las que después no se pueden revisar barato.

### D1 — Clave subrogada, número de presupuesto único

`trabajos` lleva `id_trabajo` (identidad generada) como clave primaria y `numero_presupuesto INTEGER`
con índice único parcial sobre los no nulos.

La spec (RF-002) pide que el número del talonario sea el identificador del sistema, y lo es: es único,
es por el que se busca, y es el que se dicta por teléfono. Pero hacerlo clave primaria impediría
registrar un trabajo que llegue sin presupuesto previo — un auto de compañía que entra con la orden ya
emitida, por ejemplo — y el principio IV prohíbe que el esquema impida registrar la realidad. La clave
subrogada cuesta una columna y no cierra ninguna puerta.

Confirmado por Luciano: el número sigue siendo por el que se identifica un arreglo, pero no es la
clave primaria.

### D2 — El total no se almacena

`monto_total` y `subtotal_repuestos` no son columnas: salen de una vista que suma los conceptos y le
agrega la mano de obra. El CSV los trae, pero como valores informativos que se recalculan al importar,
igual que hace la propia herramienta al restaurar.

Principio II. Un total almacenado se desincroniza de sus renglones el día que alguien corrija un
importe por fuera del camino previsto.

### D3 — La patente se normaliza en la base, no se confía en quien la manda

`vehiculos.patente` guarda lo que llegó, y una columna generada almacenada mantiene `patente_norm` en
mayúsculas sin espacios, guiones ni puntos. El índice único va sobre la derivada.

La herramienta ya normaliza, pero es un consumidor entre varios y el dato importado del pasado viene
sucio. Una columna derivada mantenida por el motor no contradice el principio II: no la actualiza una
persona, y no se puede desincronizar.

**Formatos vigentes en Argentina**, ambos en circulación:

| Formato | Patrón | Largo | Ejemplo |
|---|---|---|---|
| Anterior a 2016 | 3 letras + 3 dígitos | 6 | `AAR222` |
| Mercosur | 2 letras + 3 dígitos + 2 letras | 7 | `AA000AA` |

`patente_norm` se dimensiona en 10 caracteres: sobra para los dos y deja lugar para motos e importados.

**La validación no bloquea.** Una función auxiliar dice si una patente encaja en alguno de los dos
patrones, y la aplicación la usa para advertir mientras se tipea. El esquema no la exige: por el
principio IV, un auto con patente rara, provisoria o mal cargada tiene que poder registrarse igual. Lo
que sí se exige es que sea única, porque de eso depende no duplicar vehículos.

**La validación normaliza antes de comparar** (enmienda H3, RF-022). Recibe la patente como la
escribió la persona y la normaliza ella misma, porque se la llama mientras se tipea. La normalización
vive en `fn_normalizar_patente`, una sola definición que usan la validación y quien la necesite.

### D4 — El snapshot de lo impreso vive en el trabajo

`trabajos` guarda `txt_cliente`, `txt_direccion`, `txt_telefono`, `txt_vehiculo` y `txt_patente`, además
de las referencias a `clientes` y `vehiculos`.

No viola el principio V. Lo que decía el papel y el dato maestro de hoy son hechos distintos: corregir un
nombre mal escrito en la ficha de un cliente no puede cambiar lo que dice un presupuesto ya entregado.
Y el texto impreso no es alcanzable por ninguna relación, porque el maestro pudo haber cambiado.

### D5 — Cliente y vehículo se resuelven al importar, con las colisiones que haya

El vehículo se busca por patente normalizada y se crea si no existe. El cliente se busca por nombre
normalizado —recortado, en mayúsculas, con espacios colapsados— y se crea si no existe.

Esto va a generar clientes duplicados cuando el mismo nombre esté escrito de dos maneras. Es
deliberado: RF-019 dice que la importación acepta el pasado como está y no es tarea de la migración
limpiarlo. Fusionar clientes es una operación posterior y manual, y hay que preverla como trabajo real.

Un presupuesto sin nombre de cliente entra con `id_cliente` nulo. Sin patente, con `id_vehiculo` nulo.

Confirmado por Luciano: la importación **no** intenta unificar por teléfono. Unificar por teléfono
fusionaría a dos personas que comparten una línea —hermanos, matrimonio, el teléfono del taller
anotado por comodidad— y una fusión equivocada no se desarma. Duplicar y unir a mano de a uno es
reversible; fusionar de más, no. La consulta de T015 lista los parecidos para esa revisión.

### D6 — Fechas: una es local, las otras son UTC

`fecha_presupuesto` es `DATE`: es la fecha que se escribe en el papel, sin hora ni zona.
`creado_en` y `modificado_en` son `TIMESTAMPTZ`, y la herramienta ya los emite en UTC.

`TIMESTAMPTZ` en vez de `TIMESTAMP` porque Postgres lo normaliza a UTC al guardar y lo devuelve en la
zona del cliente, que es exactamente lo que hace falta cuando la app y la base no están en la misma
máquina. Se documenta en el diccionario para que nadie compare `fecha_presupuesto` con ellos.

### D7 — El esquema es la API

Supabase expone cada tabla y cada vista como endpoint REST sin escribir código. Eso convierte al
principio III en algo físico: las vistas de derivación son el contrato, y lo que no está expuesto no
existe para ningún consumidor.

Consecuencia práctica: el diseño de las vistas no es una comodidad interna, es diseño de API. Se nombran
y se estabilizan como tales, y cambiarles una columna rompe consumidores.

### D8 — RLS desde la primera migración, con login

La página del presupuesto está publicada en un repositorio público, así que la clave anónima de Supabase
va a ser visible para cualquiera. Eso es correcto por diseño **sólo si** las políticas de acceso están
puestas: sin RLS, esa clave alcanza para leer toda la cobranza del taller y para escribir presupuestos
falsos.

Por lo tanto: RLS habilitado en todas las tablas desde la migración inicial, y el rol anónimo sin ningún
permiso. Leer y escribir exige sesión iniciada. Las personas que cargan son tres, así que alcanza con
usuarios de Supabase Auth y una política única de «usuario autenticado»; no hacen falta roles por ahora.

No se difiere para después. Una tabla que nace sin RLS queda expuesta desde el minuto uno, y el momento
en que alguien se acuerda suele ser tarde.

### D9 — Los trabajos no se borran, y eso es lo que garantiza RF-020

`authenticated` no tiene privilegio de `DELETE` sobre `trabajos`. Un presupuesto registrado es un
registro histórico: si está mal se corrige (RF-016), y si no se concretó se marca (RF-015).

Confirmado por Luciano: "no debería por qué borrar los presupuestos, son un registro histórico".

Con esto RF-020 —un número emitido no se reutiliza nunca— deja de necesitar una estructura propia. El
índice único impide dos filas con el mismo número, y como ninguna fila desaparece, ningún número
vuelve a quedar libre. La alternativa que se descartó era una tabla de números emitidos: una
estructura más que mantener para garantizar lo mismo que garantiza no borrar.

No contradice el principio IV. Ese principio prohíbe que el esquema impida **registrar** un hecho que
ocurrió; acá se impide **borrar** uno que ya se registró, que es lo contrario.

`trabajo_items` sí se puede borrar: corregir la lista de conceptos es parte de RF-016, y la
importación los reemplaza por completo. Y el `ON DELETE CASCADE` se conserva, porque quien tenga
acceso al panel sigue pudiendo borrar un trabajo, y en ese caso sus conceptos no deben quedar sueltos.

---

## Esquema

### `clientes`

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `id_cliente` | `INT GEN. IDENTITY` | no | PK |
| `nombre` | `TEXT` | no | único dato exigido (RF-013) |
| `nombre_norm` | `GENERATED ... STORED` | no | `fn_normalizar_nombre`: mayúsculas, recortado, **sin acentos** (H1) |
| `telefono` | `TEXT` | sí | |
| `direccion` | `TEXT` | sí | |
| `email` | `TEXT` | sí | no lo captura el presupuesto; queda para la app |
| `cuit` | `TEXT` | sí | ídem |
| `creado_en` | `TIMESTAMPTZ` | no | `now()` |

Sin restricción única sobre el nombre: dos clientes pueden llamarse igual. Índice no único sobre
`nombre_norm` para búsqueda por parte del nombre.

`unaccent` no es inmutable de por sí, así que no se puede usar directo en una columna generada. Se
envuelve en `fn_unaccent_inmutable`, y sobre eso se apoya `fn_normalizar_nombre`, que es la única
definición de "normalizar un nombre" del modelo: la usa la columna generada **y** quien busque, para
que el término buscado se normalice igual que lo guardado (enmienda H1, y con eso queda resuelto H6:
la consulta y el índice pasan a hablar de la misma columna).

### `vehiculos`

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `id_vehiculo` | `INT GEN. IDENTITY` | no | PK |
| `patente` | `TEXT` | no | como llegó |
| `patente_norm` | `GENERATED ... STORED` | no | **UNIQUE** |
| `descripcion` | `TEXT` | sí | «Ford Ranger», sin separar marca ni modelo (RF-011) |
| `id_cliente_ultimo` | `INTEGER` | sí | FK, sólo para proponer (RF-012) |
| `creado_en` | `TIMESTAMPTZ` | no | |

### `trabajos`

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `id_trabajo` | `INT GEN. IDENTITY` | no | PK |
| `numero_presupuesto` | `INTEGER` | sí | **único filtrado**, ≥ 16000, `CHECK` de rango |
| `id_cliente` | `INTEGER` | sí | FK |
| `id_vehiculo` | `INTEGER` | sí | FK |
| `fecha_presupuesto` | `DATE` | sí | RF-008: puede faltar |
| `txt_cliente` | `TEXT` | sí | snapshot |
| `txt_direccion` | `TEXT` | sí | snapshot |
| `txt_telefono` | `TEXT` | sí | snapshot |
| `txt_vehiculo` | `TEXT` | sí | snapshot |
| `txt_patente` | `TEXT` | sí | snapshot |
| `monto_mano_obra` | `NUMERIC(12,2)` | no | default 0 |
| `no_concretado` | `BOOLEAN` | no | default 0 (RF-015) |
| `origen` | `TEXT` | sí | `particular` / `siniestro`; **nulo al nacer** (RF-014) |
| `creado_en` | `TIMESTAMPTZ` | no | UTC, viene del origen si se importa |
| `modificado_en` | `TIMESTAMPTZ` | no | UTC, ídem |
| `origen_carga` | `TEXT` | no | `presupuesto_web` / `manual` / `importacion` |

`origen` se declara acá, nulo, aunque su uso llegue en otro feature: es el único campo que la spec
nombra explícitamente como parte del ciclo de vida (RF-014), y agregarlo después obliga a una migración
sobre una tabla ya poblada.

Sin `estado_operativo` todavía: no lo pide esta spec. Cuando llegue, es una columna más, no un rediseño.

### `trabajo_items`

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `id_item` | `INT GEN. IDENTITY` | no | PK |
| `id_trabajo` | `INTEGER` | no | FK, `ON DELETE CASCADE` |
| `orden` | `SMALLINT` | no | preserva el orden de carga |
| `detalle` | `TEXT` | sí | puede venir vacío con importe cargado |
| `importe` | `NUMERIC(12,2)` | no | default 0 |

Sin columna `tipo`: la spec (RF-006) dice que no se clasifican. Los campos de seguimiento de repuesto
—pedido, recibido, costo, proveedor— son de otro feature y se agregan acá cuando llegue.

### Índices

- `vehiculos(patente_norm)` único — es la búsqueda número uno del sistema.
- `trabajos(numero_presupuesto)` único parcial sobre no nulos.
- `trabajos(id_vehiculo, fecha_presupuesto DESC)` — historial de un auto.
- `trabajos(id_cliente)` — presupuestos de un cliente.
- `trabajo_items(id_trabajo, orden)` — traer los conceptos en orden.
- `clientes(nombre_norm)` — búsqueda por parte del nombre.

---

## Vistas

`vw_presupuestos` — una fila por trabajo, con los totales derivados:

```
id_trabajo, numero_presupuesto, fecha_presupuesto,
cliente (maestro), txt_cliente (impreso), patente_norm, txt_vehiculo,
subtotal_conceptos  = SUM(items.importe)
monto_mano_obra
monto_total         = subtotal_conceptos + monto_mano_obra
cantidad_conceptos, no_concretado, origen, creado_en, modificado_en
```

Responde las preguntas 1, 2, 3, 5, 6 y 7 de la spec. La 4 —último número y próximo— sale de
`MAX(numero_presupuesto)`, pero **no como el próximo a emitir**: RF-020 prohíbe reutilizar y la serie
puede tener huecos, así que la asignación se resuelve en el feature que conecte la herramienta, no acá.

`vw_presupuestos_incompletos` — una fila por presupuesto al que le falta algo de lo que RF-024
exige al cargar: fecha, cliente con nombre, dirección y teléfono, mano de obra mayor a cero. Los
repuestos no cuentan (un trabajo puede ser sólo mano de obra) y el vehículo tampoco. Devuelve
`faltantes`, la lista de qué falta.

Es la respuesta correcta a la regla de RF-024 según el principio I: lo que se puede derivar es una
vista, nunca una columna de estado. Y según el principio III entrega el hecho —a este presupuesto
le falta el teléfono— sin decidir qué hacer con él: si eso se avisa, se bloquea o se ignora lo
resuelve la aplicación.

No se crea ninguna vista de color, prioridad ni alerta: principio III, eso lo decide la aplicación.

---

## Importación del CSV

Tres pasos, sin lógica de negocio escondida en un trigger.

1. **Staging.** `stg_presupuesto_csv` con las catorce columnas como texto, más `linea` y `lote`. Se carga
   crudo, sin convertir ni validar. Un import fallido no deja nada a medias en las tablas reales.
2. **Validación.** Un procedimiento revisa el lote y reporta lo que no pasa —número no entero, importes
   no numéricos, un detalle sin importe— sin escribir en las tablas reales. Lo que falla se informa por
   número de línea, como hace la herramienta.
3. **Consolidación.** Por cada número del lote: se resuelven vehículo y cliente (D5), se hace un upsert
   sobre `Trabajos` por `numero_presupuesto`, y los conceptos se reemplazan por completo — se borran los
   del trabajo y se insertan los del archivo, en orden.

**Idempotencia (RF-018, decisión H13).** Reimportar el mismo archivo no crea nada nuevo: se empareja
por número. Si el número **ya existe en la base, no se toca** — y si el archivo traía algo distinto, se
informa por número de línea para que alguien lo mire. Como el CSV trae `modificado_en`, ese informe
puede además decir cuál de las dos versiones es más nueva.

Se descarta la regla original de actualizar cuando el archivo es más nuevo. Es implementable —
`modificado_en` está en el CSV— pero cualquier actualización automática puede pisar una corrección
hecha en la base, y no hay forma de distinguir una corrección deliberada de un dato viejo. Es también
lo que hace la propia herramienta al restaurar: se queda con los números que no tenía y saltea el
resto.

**Lo que la importación nunca toca:** `no_concretado` y `origen`. No vienen en el archivo, y sobrescribir
con un valor por defecto lo que alguien cargó en la base sería pérdida silenciosa de datos.

**Los totales del archivo se ignoran.** Se recalculan desde los renglones, igual que hace la herramienta.

**La fila «Mano de obra»** (regla tomada de la herramienta, H15). Ni la columna sola ni el texto solo
alcanzan: `monto_mano_obra` se repite en **todas** las filas del presupuesto, y un repuesto puede
llamarse "Mano de obra" — si además lleva el mismo importe, las dos filas salen idénticas.

La regla correcta es la que la propia herramienta usa al leer su CSV, y se adopta igual para no tener
dos lecturas distintas del mismo archivo:

> Si `monto_mano_obra` no es cero, recorrer las filas del presupuesto **de atrás hacia adelante** y
> descartar **una sola**: la primera cuyo `detalle` sea exactamente `Mano de obra` **y** cuyo
> `importe` sea igual a `monto_mano_obra`. Si `monto_mano_obra` es cero, no se descarta ninguna.

Después se descartan los renglones sin detalle y sin importe, igual que hace la herramienta. Exige que
el staging conserve el orden del archivo — para eso está `linea`.

Como control, la suma de los renglones que quedan tiene que dar `subtotal_repuestos`. Si no da, se
reporta por número de línea.

---

## Qué se elimina del modelo académico

Aplicando las derogaciones que la constitución ya declaró, en este feature se van:

- `Casos` y su enum de nueve estados, reemplazada por `Trabajos`.
- `CasoItems.tipo`, por RF-006.
- `trg_Casos_ActualizarFecha`: la marca de tiempo la sella quien escribe.
- `sp_CambiarEstadoCaso`: duplicaba la lista de estados del `CHECK`.

`Facturas`, `Cobros`, `Documentos`, `Comunicaciones`, `Peritos` y `CompaniasSeguro` no se tocan en este
feature. Quedan como están hasta que su feature las rediseñe o las elimine.

---

## Verificación contra la constitución

| Principio | Cómo se cumple |
|---|---|
| I — un solo campo de estado | No se crea ninguno. `no_concretado` es un hecho binario, no un ciclo. |
| II — lo derivable no se almacena | Totales en vista. Las columnas `PERSISTED` las mantiene el motor. |
| III — magnitudes, no interpretación | Las vistas devuelven montos y cantidades. Ningún color ni prioridad. |
| IV — el esquema no impide registrar | Todo nulo salvo el nombre del cliente y la patente del vehículo. |
| V — cada hecho en un solo lugar | El snapshot es la excepción justificada de D4. |
| VI — ningún automatismo financiero | Cero triggers. La importación es una función que alguien invoca. |
| VII, VIII — deuda y saldo | No aplican: este feature no toca dinero adeudado. |
| IX — alcance | No se crea ninguna tabla de la lista prohibida. |
| Alcance v3.0.0 — políticas de acceso | D8: RLS en todas las tablas desde la migración inicial. D9: sin `DELETE` sobre `trabajos`. |
| X — la spec precede | Este plan deriva de la spec y no agrega requisitos nuevos. |

---

## Riesgos

- **Clientes duplicados por la importación** (D5). Es aceptado y hay que preverlo como trabajo manual
  posterior. Conviene una consulta que liste nombres parecidos para revisarlos.
- **La numeración sigue viviendo en el navegador** hasta que exista el feature que la conecte. Este plan
  no lo resuelve, y mientras tanto el riesgo de duplicados entre equipos sigue en pie.
- **Reimportar reemplaza los conceptos**, así que sus `id_item` cambian. Nada depende todavía de esos
  ids; cuando el seguimiento de repuestos cuelgue de ellos, esta decisión hay que revisarla.

- **La clave anónima queda pública** en el repositorio del presupuesto. Mitigado por D8, pero depende de
  que ninguna tabla futura nazca sin RLS. Conviene verificarlo en cada migración.

## Proyecto de Supabase

| Dato | Valor |
|---|---|
| URL | `https://osslhkvdclrbukjqwpnt.supabase.co` |
| Identificador | `osslhkvdclrbukjqwpnt` |
| Clave publishable | `sb_publishable_MV1IZ770uuRM2bUmZqmuWA_mdicKzXw` |
| Registro público | desactivado |
| Usuarios | dados de alta a mano |

La clave publishable es la que Supabase llamaba `anon`. Es pública por diseño y va en el
repositorio de la página; lo que protege los datos es RLS, no el secreto de la clave (D8).
La clave `secret` no existe en este proyecto y no debe crearse para la página.

El registro público está desactivado a propósito: con la clave publicada, cualquiera podría
crearse una cuenta y quedar como usuario autenticado. Los usuarios se dan de alta a mano.

**Las migraciones no se pueden correr desde este repositorio.** No hay salida de red hacia
Supabase, así que cada migración se ejecuta pegándola en el editor SQL del panel y el
resultado se reporta a mano. El criterio de terminación de cada tarea sigue siendo que corra,
no que esté escrita.

## Pendiente antes de implementar

- Confirmar cómo entra el login en la página del presupuesto, que hoy no tiene ninguno.

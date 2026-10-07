# Diccionario de datos — El Semáforo

**Motor:** PostgreSQL sobre Supabase · **Constitución:** v3.0.0 · **Feature:** 001 Presupuesto

Qué guarda la base, qué deriva al leer, y qué decisiones hay detrás. Cuando este documento y el
esquema se contradigan, gana el esquema — y hay que corregir este documento.

Lo que está acá es el feature 001. Deuda, cobranza, facturación, documentos, seguro, siniestro y
estado operativo **no existen todavía**: son features posteriores.

---

## Cómo leer este modelo

Tres reglas explican casi todas las decisiones raras:

1. **Lo que se puede derivar, no se almacena** (principio II). No busques una columna `monto_total`:
   no existe, y es a propósito. Los totales salen de `vw_presupuestos`, calculados al leer.
2. **El esquema no impide registrar la realidad** (principio IV). Casi todo es nulo. Si algo te
   parece que debería ser obligatorio, probablemente la regla existe, pero vive en la aplicación.
3. **Cada hecho en un solo lugar** (principio V), con una excepción declarada: el snapshot de lo
   impreso (`txt_*`), explicada abajo.

---

## Zonas horarias — leer antes de comparar fechas

Hay dos clases de tiempo en este modelo y **no se comparan entre sí**:

| Columna | Tipo | Qué es |
|---|---|---|
| `trabajos.fecha_presupuesto` | `DATE` | La fecha que se escribe en el papel. Sin hora, sin zona. |
| `trabajos.creado_en`, `trabajos.modificado_en`, `clientes.creado_en`, `vehiculos.creado_en` | `TIMESTAMPTZ` | Instantes reales. Postgres los normaliza a **UTC** al guardar y los devuelve en la zona del cliente. |

**Por qué `TIMESTAMPTZ` y no `TIMESTAMP`:** la aplicación y la base no corren en la misma máquina.
`TIMESTAMPTZ` guarda el instante sin ambigüedad; `TIMESTAMP` guardaría un número sin zona, que a los
seis meses nadie sabe interpretar.

**Por qué `fecha_presupuesto` es `DATE`:** es una fecha de calendario, no un instante. Un presupuesto
del 7 de septiembre es del 7 de septiembre en cualquier zona. Convertirla a `TIMESTAMPTZ` la haría
saltar de día según quién la mire.

**Trampa conocida:** `date_trunc('month', fecha_presupuesto)` devuelve `timestamptz`, no `date`,
porque Postgres prefiere ese tipo al resolver la función. Cerrar siempre con `::date` — como hace la
consulta de la pregunta 7.

**Quién sella `modificado_en`:** quien escribe. **No hay ningún trigger que lo toque.** Existe una
función `fn_set_modificado_en()` pensada para eso, pero está deliberadamente sin enganchar: si
sellara automáticamente, una importación no podría escribir el `modificado_en` que trae el archivo,
y la regla de idempotencia dejaría de funcionar.

---

## Campos derivados — los mantiene el motor, nadie los escribe

Son columnas `GENERATED ALWAYS AS ... STORED`. No se pueden escribir a mano y no se pueden
desincronizar: si cambia el origen, cambian solas.

| Columna | Se calcula como | Para qué |
|---|---|---|
| `clientes.nombre_norm` | `fn_normalizar_nombre(nombre)` — mayúsculas, sin acentos, recortado, espacios colapsados | Buscar por parte del nombre, y cotejar clientes al importar |
| `vehiculos.patente_norm` | `upper(regexp_replace(patente, '[\s.\-]', '', 'g'))` — mayúsculas, sin espacios, guiones ni puntos | Que `aa 123-bb` y `AA123BB` sean el mismo vehículo. **Es única.** |

**Sobre los acentos.** `nombre_norm` ignora tildes *y la eñe*: `PEÑA` y `PENA` quedan iguales.
Decisión consciente de Luciano — buscar "perez" tiene que encontrar "Pérez", y ese caso es mucho más
frecuente que dos apellidos que sólo difieren en la eñe. Se acepta que la importación los unifique.

**Para buscar hay que normalizar lo buscado igual que lo guardado.** Por eso `fn_normalizar_nombre`
es pública, y la vista expone `cliente_norm`:

```sql
select * from vw_presupuestos
where cliente_norm like '%' || fn_normalizar_nombre('perez') || '%';
```

---

## Tablas

### `clientes`

El dueño o responsable. Lo único exigido es el nombre (RF-013).

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `id_cliente` | `integer identity` | no | PK |
| `nombre` | `text` | no | No puede ser vacío ni sólo espacios |
| `nombre_norm` | `text` generada | no | Ver campos derivados |
| `telefono` | `text` | sí | |
| `direccion` | `text` | sí | |
| `email` | `text` | sí | No lo captura el presupuesto; queda para la app |
| `cuit` | `text` | sí | Ídem |
| `creado_en` | `timestamptz` | no | `now()` |

**Sin unicidad sobre el nombre**: dos clientes pueden llamarse igual, y es correcto. Duplicar es
reversible; fusionar mal, no.

### `vehiculos`

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `id_vehiculo` | `integer identity` | no | PK |
| `patente` | `text` | no | Como llegó, sin normalizar |
| `patente_norm` | `text` generada | no | **ÚNICA** — de esto depende no duplicar vehículos |
| `descripcion` | `text` | sí | Texto libre: "Ford Ranger". No se separa marca, modelo, año ni color |
| `id_cliente_ultimo` | `integer` | sí | FK. Sólo para proponer: el cliente de un presupuesto es el de ese presupuesto |
| `creado_en` | `timestamptz` | no | |

**La patente no se valida al guardar.** `fn_es_formato_patente_valido()` dice si encaja en alguno de
los dos formatos vigentes —`AAR222` (anterior a 2016) y `AA000AA` (Mercosur)— pero no está enganchada
como restricción: un auto con patente provisoria, importada o mal cargada tiene que poder entrar
igual. La función normaliza sola, así que acepta la patente como la escribió la persona.

### `trabajos`

El expediente. Nace del presupuesto: presupuestar **es** crear el trabajo, no hay conversión posterior.

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `id_trabajo` | `integer identity` | no | PK |
| `numero_presupuesto` | `integer` | sí | El número del talonario. **Único entre los no nulos**, ≥ 16000 |
| `id_cliente` | `integer` | sí | FK |
| `id_vehiculo` | `integer` | sí | FK |
| `fecha_presupuesto` | `date` | sí | Ver zonas horarias |
| `txt_cliente`, `txt_direccion`, `txt_telefono`, `txt_vehiculo`, `txt_patente` | `text` | sí | Snapshot de lo impreso — ver abajo |
| `monto_mano_obra` | `numeric(12,2)` | no | Default 0, no negativo. Monto único del presupuesto, **nunca un renglón** |
| `no_concretado` | `boolean` | no | Default false. El presupuesto que no se concretó |
| `origen` | `text` | sí | `particular` / `siniestro`. **Nulo al nacer**: no siempre se sabe |
| `creado_en`, `modificado_en` | `timestamptz` | no | Ver zonas horarias |
| `origen_carga` | `text` | no | `presupuesto_web` / `manual` / `importacion`. Trazabilidad técnica |
| `txt_chasis` | `text` | sí | Snapshot: número de chasis tal como se imprimió (D4, feature 004) |
| `observaciones` | `text` | sí | Texto libre del presupuesto. Vacío es lo normal (feature 004) |
| `detalle_mano_obra` | `text` | sí | Snapshot: qué mano de obra se cotizó, al lado de su importe. No interviene en ningún cálculo (feature 005) |

**Por qué el número no es la clave primaria.** Es el identificador de negocio —es el que se dicta por
teléfono y por el que se busca— pero hacerlo PK impediría registrar un trabajo que llegue sin
presupuesto previo. La clave subrogada cuesta una columna y no cierra ninguna puerta.

**Un trabajo no se borra.** `authenticated` no tiene `DELETE` sobre esta tabla. Un presupuesto es un
registro histórico: si está mal se corrige, y si no se concretó se marca. De eso depende que un
número emitido no se reutilice nunca: el índice único impide dos filas con el mismo número, y como
ninguna fila desaparece, ningún número vuelve a quedar libre.

**El snapshot `txt_*`** es la única duplicación deliberada del modelo. Lo que decía el papel y el dato
maestro de hoy son hechos distintos: corregir el nombre mal escrito de un cliente no puede cambiar lo
que dice un presupuesto ya entregado. Y el texto impreso no es alcanzable por ninguna relación,
porque el maestro pudo haber cambiado.

### `trabajo_items`

Los conceptos presupuestados.

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `id_item` | `integer identity` | no | PK |
| `id_trabajo` | `integer` | no | FK, `ON DELETE CASCADE` |
| `orden` | `smallint` | no | Orden de carga, no ranking |
| `detalle` | `text` | sí | Texto libre. **Sin columna `tipo`**: no se clasifican |
| `importe` | `numeric(12,2)` | no | Default 0 |

**Los conceptos sí se pueden borrar**, aunque el trabajo no: corregir una lista es parte de corregir
un presupuesto. Puede haber un renglón con importe y sin detalle; al revés no, porque la herramienta
descarta el que no tiene ninguno de los dos.

---

## Vistas — son la API

Supabase expone cada vista como endpoint REST. **Lo que no está en una vista o tabla expuesta, no
existe para ningún consumidor.** Por eso cambiarle una columna a una vista rompe consumidores:
agregar al final es seguro, quitar o renombrar no.

Las dos usan `security_invoker = true`: las políticas de RLS se evalúan contra quien consulta, no
contra quien creó la vista.

### `vw_presupuestos`

Una fila por trabajo, con los totales derivados.

| Columna | Qué es |
|---|---|
| `id_trabajo`, `numero_presupuesto`, `fecha_presupuesto` | Del trabajo |
| `id_cliente`, `cliente_actual` | El nombre del cliente **de hoy**, del maestro |
| `cliente_norm` | `cliente_actual` normalizado. Para buscar usando el índice |
| `txt_cliente`, `txt_vehiculo` | Lo que decía el papel. Puede diferir de `cliente_actual` |
| `id_vehiculo`, `patente_norm` | Del vehículo |
| `subtotal_conceptos` | `SUM(trabajo_items.importe)`, 0 si no tiene |
| `monto_mano_obra` | Del trabajo |
| `monto_total` | `subtotal_conceptos + monto_mano_obra`. **El total final que paga el cliente** |
| `cantidad_conceptos` | Cuántos renglones tiene |
| `no_concretado`, `origen`, `creado_en`, `modificado_en` | Del trabajo |

### `vw_presupuestos_incompletos`

Los presupuestos a los que les falta algo de lo que la carga exige: fecha, cliente con nombre,
dirección y teléfono, y mano de obra mayor a cero. **Los repuestos no cuentan** —hay trabajos que son
sólo mano de obra— y el vehículo tampoco.

Devuelve `faltantes`, la lista de qué falta: `fecha`, `cliente`, `direccion`, `telefono`,
`mano_obra`. Si no falta nada, la fila no aparece.

**La base no impide guardar un presupuesto incompleto**, sólo lo reporta. Esa regla la aplica la
aplicación. Si la base bloqueara, alguien escribiría "xx" en la dirección con tal de guardar, y un
"xx" miente y no se puede detectar.

Un dato con el que contar: lo importado casi siempre va a aparecer acá. Filtrar por
`origen_carga <> 'importacion'` para ver sólo lo que se cargó a mano.

---

## Funciones

| Función | Qué hace |
|---|---|
| `fn_normalizar_nombre(text)` | La única definición de "normalizar un nombre". La usan la columna generada y quien busque |
| `fn_unaccent_inmutable(text)` | Envoltura `IMMUTABLE` de `unaccent`, para poder usarla en una columna generada |
| `fn_normalizar_patente(text)` | Mayúsculas, sin espacios, guiones ni puntos |
| `fn_es_formato_patente_valido(text)` | Si encaja en alguno de los dos formatos vigentes. **Advierte, no bloquea** |
| `fn_set_modificado_en()` | Trigger genérico, **deliberadamente sin usar**. Ver zonas horarias |
| `fn_qa_001_presupuesto()` | El QA: 49 verificaciones en una consulta. Sólo la puede ejecutar el dueño de la base |

---

## Acceso

RLS habilitado y forzado en las cuatro tablas. Una política por tabla, para el rol `authenticated`,
sin restricción por fila: son tres personas de confianza.

**El rol `anon` no tiene absolutamente nada** — ni políticas ni privilegios de tabla. Esto no es
opcional: la clave publicable de Supabase va a estar visible en el repositorio de la página, y sin
esto alcanzaría para leer toda la base y escribir presupuestos falsos.

Cada objeto nuevo —tabla o vista— tiene que revocarle los privilegios a `anon` en su propia
migración. Supabase se los otorga por defecto al crearlos. El QA lo verifica.

**Excepción a los permisos de `authenticated`:** no tiene `DELETE` sobre `trabajos`.

---

## Qué NO toca la importación

*(Aplica cuando el bloque D se construya. Hoy está en pausa: no hay histórico que importar.)*

- **`no_concretado` y `origen`** no vienen en el archivo. Sobrescribirlos con un valor por defecto
  sería pérdida silenciosa de lo que alguien cargó en la base. Todo lo importado entra con
  `no_concretado = false` y `origen` nulo, y no se vuelve a tocar.
- **Los totales del archivo se ignoran.** `subtotal_repuestos`, `monto_mano_obra` y `monto_total`
  vienen en el CSV pero son informativos: se recalculan desde los renglones, igual que hace la propia
  herramienta al restaurar.
- **Un número que ya existe en la base no se toca.** La importación agrega lo que falta y nunca pisa.
  Si el archivo traía algo distinto, se informa por número de línea para que alguien lo mire.
- **La fila de mano de obra** se identifica recorriendo las filas del presupuesto de atrás hacia
  adelante y descartando **una sola**: la primera cuyo detalle sea exactamente "Mano de obra" y cuyo
  importe coincida con `monto_mano_obra`. Es la regla que usa la propia herramienta al leer su CSV.
- **La patente y el nombre entran como vinieron.** La normalización la hace la base. Los datos del
  pasado pueden estar sucios y eso se acepta: no es tarea de la migración limpiar el pasado.

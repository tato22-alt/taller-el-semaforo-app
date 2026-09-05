# Especificación 001 — MVP de gestión

| | |
|---|---|
| **Estado** | Borrador para revisión de Tato |
| **Fecha** | 2026-09-05 |
| **Rama** | `claude/presupuesto-app-limits-dea467` |
| **Constitución** | `.specify/memory/constitution.md` v1.0.0 |
| **Reemplaza a** | `NEXT_STEPS_CODEX.md`, sección "Funcionalidades previstas" del README |

> **Qué es este documento.** Define **el QUÉ y el PORQUÉ**: qué tiene que lograr
> el sistema y —sobre todo— **dónde termina**. No dice cómo se implementa; eso va
> en `plan.md`, que se escribe después de que esta spec esté aprobada.
>
> La sección más importante es la **§4 Fuera de alcance**. Un proyecto no se
> define por lo que hace: se define por lo que decidió no hacer.

---

## 1. El problema

Hoy la información del taller vive dispersa: talonarios de presupuesto en papel,
una herramienta web de presupuestos que guarda todo en el navegador de una sola
máquina, chats de WhatsApp, mails, y la memoria de quien atendió.

Eso hace que preguntas simples no tengan respuesta rápida:

- ¿Cuánto ganamos este mes?
- ¿Qué facturas están sin cobrar?
- ¿Qué autos hay adentro del taller ahora?
- ¿En qué quedó el caso de la Amarok blanca?

Y arrastra un riesgo concreto y caro: **emitir dos presupuestos con el mismo
número**, porque la numeración vive en el `localStorage` de un navegador y dos
equipos no se ven entre sí (documentado por la propia herramienta actual en su
README).

### Pregunta núcleo

> **¿Dónde se va la plata, caso por caso?**

Todo lo que sigue existe para contestarla. Lo que no aporta a eso, no está.

---

## 2. Quiénes lo usan

| Usuario | Qué hace | Desde dónde | Frecuencia |
|---|---|---|---|
| **Administrativa** | Carga casos, presupuestos, facturas y cobros | **Celular**, a veces PC del taller | Todos los días |
| **Tato** | Consulta reportes, carga ocasional, análisis | PC y celular | Semanal |

**Usuario principal = la administrativa desde el celular.** Cada decisión de UX
se juzga desde ahí, no desde una pantalla de 27 pulgadas.

No hay más usuarios en esta fase. Chapistas, pintores y dueño quedan para Fase 2+.

---

## 3. Alcance de la Fase 1 — lo que la app SÍ va a hacer

La Fase 1 se entrega en **cinco cortes**. Cada corte es útil por sí solo: si el
proyecto se frenara ahí, lo entregado sigue sirviendo.

> **Nota honesta sobre el tamaño.** Con la decisión de absorber el presupuesto y
> de incluir login desde el arranque, esta Fase 1 es más grande que la del plan
> original. Está bien —las dos decisiones eliminan riesgos reales— pero **hay que
> respetar el orden de los cortes**. El error a evitar es empezar los cinco a la
> vez y no terminar ninguno (Constitución, Art. X).

### Corte 0 — Cimientos

Sin pantallas nuevas visibles. Es la base sobre la que se apoya todo.

| ID | Requisito | Cómo se verifica |
|---|---|---|
| RF-001 | Existe la base de datos en Supabase con el esquema de §6 | Las tablas existen y se pueden consultar |
| RF-002 | Toda tabla con datos de personas tiene RLS activa y políticas explícitas | Con la `anon key` y sin sesión, una consulta a `cliente` devuelve **cero filas** |
| RF-003 | Hay login con usuario y contraseña | Sin sesión, cualquier ruta redirige al login |
| RF-004 | Existen dos roles: `admin` y `operador` | Un usuario `operador` no puede borrar registros |
| RF-005 | Ninguna credencial está en el repositorio | `git grep` de las keys no devuelve nada; `.env.local` está ignorado |

**Por qué el login está acá y no en Fase 2:** la app va a estar publicada en
internet con nombres, teléfonos y patentes de clientes reales. La `anon key` de
Supabase es pública por diseño —viaja en el JavaScript que baja el navegador— así
que una tabla sin RLS es una tabla que lee cualquiera que abra la URL. Login y RLS
no son una funcionalidad: son la condición para poder cargar el primer dato real
(Constitución, Art. VI).

### Corte 1 — El presupuesto pasa a la base

Reemplaza a la herramienta de `localStorage`. Es el corte que elimina el riesgo
más caro del sistema actual.

| ID | Requisito | Cómo se verifica |
|---|---|---|
| RF-010 | El número de presupuesto lo asigna el servidor, de forma atómica | Dos guardados simultáneos desde dos dispositivos obtienen números distintos |
| RF-011 | El número nunca retrocede y un número borrado no se reusa | Se borra el último presupuesto; el siguiente sigue de largo |
| RF-012 | Se carga un presupuesto con cliente, dirección, teléfono, vehículo, patente, renglones libres (detalle + importe) y un monto de mano de obra | El total = suma de renglones + mano de obra |
| RF-013 | Se imprime / exporta a PDF con el mismo formato visual que el actual | Sale igual que el papel que ya usa el taller |
| RF-014 | Se importa el historial existente desde el CSV de la herramienta actual | Los presupuestos viejos aparecen en el listado con su número original |
| RF-015 | El total se muestra también en letras | "Son pesos ..." |

**Compatibilidad de la importación:** el CSV actual tiene las columnas
`numero_presupuesto, fecha_consulta, nombre_cliente, direccion, telefono,
vehiculo, patente, detalle, importe, subtotal_repuestos, monto_mano_obra,
monto_total, creado_en, modificado_en`. La importación **recalcula los totales
sumando los renglones**, no lee las columnas de totales (misma regla que ya tiene
la herramienta: mandan los renglones).

### Corte 2 — El caso

| ID | Requisito | Cómo se verifica |
|---|---|---|
| RF-020 | Un presupuesto se convierte en caso sin recargar los datos | El caso hereda cliente, vehículo, renglones y número |
| RF-021 | El caso tiene un `tipo_caso`: `seguro`, `particular_factura` o `efectivo` | Los campos visibles cambian según el tipo (§5, RN-02) |
| RF-022 | El caso tiene un estado dentro del flujo definido en §5 RN-05 | Se puede avanzar el estado desde la pantalla del caso |
| RF-023 | Hay un listado de casos con búsqueda por patente, cliente o número | Buscar "AB123CD" trae el caso |
| RF-024 | Hay filtro por estado y por tipo de caso | Filtrar "en_taller" muestra solo los que están adentro |
| RF-025 | Cargar un caso completo desde cero toma menos de 90 segundos en celular | Se cronometra con la administrativa, no con nosotros |

### Corte 3 — Factura y cobro

| ID | Requisito | Cómo se verifica |
|---|---|---|
| RF-030 | Se registra una factura asociada a un caso, con número, fecha, monto y destinatario (compañía o cliente) | La factura aparece en el caso |
| RF-031 | Se registra un cobro asociado a un caso, con monto, fecha y tipo (`facturado` / `efectivo`) | El cobro aparece en el caso |
| RF-032 | Un caso admite **varios cobros parciales** | Dos cobros de $50.000 sobre un caso de $100.000 lo dejan saldado |
| RF-033 | Un cobro en efectivo se registra sin factura | El campo de factura queda vacío y el sistema no protesta |
| RF-034 | El caso muestra cuánto se presupuestó, cuánto se facturó y cuánto se cobró | Los tres números están juntos, visibles de un vistazo |

### Corte 4 — Dashboard con datos reales

Reemplaza las tarjetas en cero que hay hoy. Estas son **las seis preguntas** que
ya estaban planteadas en el modelo SQL (`04_queries_reportes.sql`) y que ahora se
vuelven pantallas:

| ID | Requisito | Pregunta que contesta |
|---|---|---|
| RF-040 | Casos activos, por estado | ¿Qué autos hay adentro y en qué etapa? |
| RF-041 | Facturas emitidas y pendientes de cobro, con monto total | ¿Quién me debe plata? |
| RF-042 | Cobrado en el mes, separando facturado y efectivo | ¿Cuánto entró este mes? |
| RF-043 | Presupuestado vs. cobrado por caso | ¿Qué casos quedaron a medio cobrar? |
| RF-044 | Casos por tipo (seguro / particular / efectivo) | ¿De dónde viene el trabajo? |
| RF-045 | Casos de seguro con su compañía y perito | ¿A quién le reclamo este? |

---

## 4. FUERA de alcance — lo que la app NO va a hacer

Esta es la sección que le da sentido al documento. Cada línea es una decisión
tomada a propósito, con su razón y su destino.

### 4.1 Nunca — no entra en ninguna fase

| No se hace | Por qué |
|---|---|
| **Emitir comprobantes fiscales (facturas AFIP)** | No somos un sistema fiscal. Se factura por AFIP o por el contador y acá solo se **registra** el dato. Meterse ahí es asumir responsabilidad legal y mantenimiento normativo eterno. (Art. V y VIII) |
| **Mensajería propia (chat interno)** | Ya existe WhatsApp y el taller lo usa. Se integra con deep links `wa.me`. (Art. VIII) |
| **Guardar fotos dentro de la base de datos** | Se guarda la URL al archivo en Storage o Drive. Una DB con blobs se vuelve cara, lenta y difícil de respaldar. |
| **Reimplementar Calendar, Drive o Gmail** | Se integra vía API cuando haga falta. (Art. VIII) |
| **Contabilidad, libro IVA, balance** | Es trabajo del contador. El sistema le da los datos, no lo reemplaza. |
| **Liquidación de sueldos** | Fuera del dominio. |
| **Campos "por si acaso"** | Se agregan cuando duelan, con un caso real que lo justifique. (Art. II) |

### 4.2 Fase 2 — después del MVP, no ahora

| No entra en Fase 1 | Por qué se posterga | Qué se pierde mientras tanto |
|---|---|---|
| **Costos reales por caso** (compra de repuestos, sublet, mano de obra propia) | Decisión explícita de Tato. Sumar carga de gastos antes de que la administrativa use el sistema es el camino directo al anti-patrón de la planilla abandonada. (Art. II) | **La pregunta núcleo se contesta a medias.** La Fase 1 dice *cuánto entró y qué falta cobrar*; **no dice el margen real por caso**. Es la limitación más importante del MVP y hay que tenerla presente. |
| **Timeline / historial de cambios de estado** | Primero hay que ver si alguien lo mira. Guardar el estado actual alcanza para operar. | No se sabe *cuándo* pasó a cada estado, solo en cuál está. |
| **Subida de fotos y documentos** | Depende de tener Storage configurado y de que se use el sistema a diario primero. | Las fotos siguen en el celular y en WhatsApp. |
| **Reportes financieros por período con exportación** | El dashboard del Corte 4 alcanza para empezar. | Hay que mirar los números en pantalla, no se bajan a Excel. |
| **Auditoría de quién cambió qué** | Con dos usuarios que se conocen, todavía no duele. | Sin rastro de autoría. |
| **Gestión de proveedores y compras** | Va atado a costos por caso. | — |
| **Prioridad y responsable interno del caso** | Se coordina hablando; son dos personas. | — |

### 4.3 Fase 3 y 4 — el horizonte lejano

Están anotadas para que no se cuelen antes de tiempo: gestión de mails de peritos
vía Gmail API, generador de mensajes de WhatsApp, tabla de comunicaciones poblada,
generación de presupuestos desde fotos o audio con la API de Claude, recordatorios
automáticos, backup automatizado.

**Ninguna de estas se toca hasta que la Fase 1 esté completa y en uso real.**

### 4.4 Límites de producto que conviene decir en voz alta

- **No es un sistema multi-taller.** Un solo taller, sin arquitectura de inquilinos.
- **No funciona sin internet.** Si se cae la conexión en el taller, no se carga.
  (Es el precio de tener una sola fuente de verdad; el modo offline es un problema
  de sincronización serio y no entra ni en Fase 2.)
- **No hay app nativa.** Es una web responsive que se usa desde el navegador del
  celular. Se puede agregar al escritorio como acceso directo y alcanza.
- **No reemplaza al talonario de golpe.** Durante la transición conviene seguir
  imprimiendo el PDF; el sistema es el registro, el papel sigue siendo el
  comprobante que se le da al cliente.

---

## 5. Reglas de negocio

| ID | Regla |
|---|---|
| **RN-01** | Un caso siempre tiene un vehículo. Un vehículo siempre tiene un cliente. No se crean vehículos huérfanos. |
| **RN-02** | El `tipo_caso` decide qué se muestra: `seguro` → compañía, perito, N° de siniestro · `particular_factura` → CUIT del cliente · `efectivo` → lo mínimo, sin factura. |
| **RN-03** | **El teléfono identifica al cliente.** Se normaliza al guardar: solo dígitos y un `+` inicial opcional. `"2255 41-2737"` y `"+542255412737"` **no** pueden crear dos clientes. |
| **RN-04** | **La patente identifica al vehículo.** Se normaliza a mayúsculas, sin espacios, puntos ni guiones. |
| **RN-05** | Flujo de estados del caso: `presupuestado` → `enviado` → `aprobado` → `en_taller` → `en_trabajo` → `terminado` → `entregado` → `facturado` → `cobrado`. Un caso puede además quedar `rechazado` desde cualquier punto previo a `en_taller`. |
| **RN-06** | Para pasar a `facturado` tiene que existir una factura asociada. Para pasar a `cobrado`, la suma de los cobros tiene que cubrir el monto. |
| **RN-07** | Los cobros `efectivo` no llevan factura. Los `facturado`, sí. |
| **RN-08** | El número de presupuesto lo asigna el servidor, nunca retrocede, y borrar un presupuesto **no libera** su número. |
| **RN-09** | El efectivo se registra siempre, aunque no se facture. El sistema es la verdad operativa; lo fiscal va por afuera. |
| **RN-10** | Una misma compañía de seguro paga casos de clientes distintos. La factura apunta a la compañía, no al dueño del auto. |

---

## 6. Modelo de datos — ajustes respecto del diseño original

El modelo de 10 tablas del `CLAUDE.md` y del repo SQL sigue en pie. Estos son los
cambios que salen de las decisiones tomadas, y **hay que confirmarlos**:

### 6.1 `caso_item` se simplifica (decisión tomada)

**Antes:** `descripcion`, `tipo` (6 valores), `cantidad`, `precio_unitario`,
`subtotal` calculado.

**Ahora:** `descripcion`, `importe`, `orden`.

**Por qué:** el presupuesto que el taller usa todos los días tiene renglones
libres —detalle y un importe— y nada más. Pedir cantidad, precio unitario y tipo
en el celular triplica el tecleo por renglón para obtener una analítica que hoy
nadie pide. Se agregan cuando duelan (Art. II).

**Qué se pierde:** no se puede reportar "cuánto se fue en pintura vs. repuestos".
Cuando eso haga falta de verdad, se agrega el campo `tipo` y se completan los
renglones nuevos de ahí en adelante.

### 6.2 Mano de obra es un monto del caso, no un renglón

El presupuesto actual tiene un único campo "Mano de obra" al pie, separado de los
renglones. Se modela igual: `caso.monto_mano_obra`.

`total = suma(caso_item.importe) + caso.monto_mano_obra`

### 6.3 Campos que hay que agregar (derivados, **confirmar**)

| Tabla | Campo | Por qué |
|---|---|---|
| `cliente` | `direccion` | El presupuesto en papel lo pide y hoy se completa. |
| `vehiculo` | `descripcion` (texto libre) | En el papel el vehículo es un campo libre ("Amarok blanca 2019"). `marca`, `modelo`, `anio` y `color` quedan **opcionales**, para completar solo si sirven. |
| `caso` | `monto_mano_obra` | Ver §6.2. |
| `caso` | `estado` incluye `rechazado` | Un presupuesto que no se aprueba es el caso más común y el flujo lineal no lo contemplaba. |

### 6.4 Numeración

Tabla o secuencia dedicada en Postgres, con asignación atómica del lado del
servidor. **El primer número disponible arranca donde termine el historial
importado** (la herramienta actual arrancó en 16000). El detalle técnico va en
`plan.md`; acá solo queda fijado el requisito (RN-08).

---

## 7. Criterios de aceptación de la Fase 1

La Fase 1 está terminada cuando **todo** esto es cierto:

1. La administrativa cargó **un caso real de punta a punta** —presupuesto, caso,
   factura, cobro— desde su celular, sin ayuda y sin manual.
2. Cronometrado: cargar un caso completo lleva **menos de 90 segundos**.
3. El dashboard muestra números reales que **coinciden** con lo que Tato calcularía
   a mano para ese mes.
4. Con la `anon key` y sin iniciar sesión, una consulta a cualquier tabla con datos
   de personas devuelve **cero filas**.
5. El historial de presupuestos viejos está importado y los números **siguen la
   secuencia correcta**.
6. Se emitieron presupuestos desde dos dispositivos distintos y **ningún número se
   repitió**.
7. Existe un backup exportado de la base, guardado fuera de Supabase.
8. `git grep` no encuentra ninguna credencial en el repositorio.

---

## 8. Decisiones tomadas en esta spec

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| D-1 | **Supabase reemplaza a Insforge** | Seguir con Insforge | RLS maduro, documentación grande, no depender de un BaaS chico. Implica reescribir `lib/insforge.ts` y limpiar el `CLAUDE.md`. |
| D-2 | **La app absorbe el presupuesto en Fase 1** | Convivir con la herramienta de `localStorage` | Elimina el riesgo de número duplicado y la doble carga. Es el Art. IV aplicado. |
| D-3 | **Login + RLS entran al MVP** | Auth en Fase 2 | Va a haber datos reales en una URL pública. No es negociable (Art. VI). |
| D-4 | **Costos por caso quedan afuera** | Tabla de gastos en el MVP | Evita inflar la carga diaria antes de que el sistema esté en uso. Se asume el límite: no hay margen real en Fase 1. |
| D-5 | **Renglones como el papel** | `tipo` + `cantidad` + `precio_unitario` | Coincide con lo que ya se usa. Menos tecleo en el celular. |

---

## 9. Riesgos y decisiones abiertas

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **La Fase 1 es grande.** Cinco cortes con auth, migración y dashboard. | Se empieza todo y no se termina nada. | Cortes en orden estricto. Cada uno se entrega funcionando antes de tocar el siguiente (Art. X). |
| **La migración del CSV puede tener datos sucios** (patentes mal escritas, teléfonos duplicados). | Clientes duplicados en la base nueva. | La importación normaliza teléfono y patente (RN-03, RN-04) y reporta cuántas filas entraron y cuántas se saltearon, como ya hace la herramienta actual. |
| **La administrativa puede rechazar el cambio** si el sistema le da más trabajo que el papel. | El proyecto muere en la práctica aunque funcione. | El criterio de los 90 segundos y la prueba con ella, no con nosotros. |
| **Sin costos, la pregunta núcleo queda a medias.** | Se puede creer que un caso fue rentable cuando no lo fue. | Está declarado como límite conocido. Es lo primero de la Fase 2. |

**Decisiones abiertas (a resolver antes del `plan.md`):**

- [ ] ¿Se confirman los campos derivados de §6.3?
- [ ] ¿Se migra el proyecto de Insforge o se arranca de cero en Supabase? (afecta a
      si hay datos que rescatar; por lo que se ve, la base de Insforge está vacía)
- [ ] ¿Se elimina el proyecto de Insforge y se rotan sus keys? Están publicadas en
      el `CLAUDE.md` de un repositorio público.
- [ ] ¿El nombre del taller, dirección y teléfono del encabezado del presupuesto se
      guardan como configuración o van fijos en el código?

---

## 10. Trazabilidad

| Documento | Qué aporta | Estado |
|---|---|---|
| `.specify/memory/constitution.md` | Principios no negociables | Vigente v1.0.0 |
| `CLAUDE.md` | Contexto persistente del proyecto | A actualizar: stack Supabase, auth en Fase 1 |
| `tato22-alt/gestion-taller-sql-server` | Modelo relacional y las 6 consultas de reporte | Fuente del modelo; se adapta a Postgres con los ajustes de §6 |
| `tato22-alt/semaforo-presupuesto` | Herramienta actual de presupuestos | Fuente del formato, del CSV y de las reglas de numeración. Queda como respaldo de solo lectura hasta completar el Corte 1 |
| `NEXT_STEPS_CODEX.md` | Plan anterior de próximos pasos | **Reemplazado por esta spec** |

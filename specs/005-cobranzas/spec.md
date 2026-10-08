# Especificación 005 — Cobranzas: automatizaciones sobre evidencia

| | |
|---|---|
| **Estado** | Borrador. **Los cuatro choques de §8 se resolvieron el 2026-10-07** (P1 a P4 en §9). El cómo está en un plan (decisiones D1 a D10, preguntas N1 a N10) y en una auditoría (hallazgos H1 a H17), los dos del 2026-10-07. **Quedan fuera del repo hasta contestar N3** —el repo es público y traen datos de facturación—; cuando entren, van en esta carpeta como `plan.md`. **Esta spec y ese plan son los únicos del bloque:** no se duplican en `base/specs/` |
| **Fecha** | 2026-10-01 |
| **Origen de los datos** | Conciliación manual de **470 comprobantes** (ene-2025 → sep-2026, ~20 deudores), hecha a mano contra ARCA, Gmail y los PDF de las compañías |
| **Constitución vinculante** | `base/.specify/memory/constitution.md` (v3.0.1) |
| **Relación con la 004** | La contesta: esta app **sí tiene contenido propio**, y no es el que la 004 proponía |

> **Qué contesta este documento.** Cómo la aplicación llega a contestar en diez segundos
> **"¿cuánto me deben, quién, desde cuándo, y qué tengo que hacer hoy para cobrarlo?"**,
> sin que nadie cargue a mano lo que ya está escrito en un mail.

---

## 1. Por qué esto cambia el proyecto entero

La spec 002 §4 puso el cobro como **hecho #3**, detrás de marcar no concretado y de las fechas
de ingreso y entrega, con el argumento de que era el más caro de construir. Sigue siendo el más
caro. Pero la conciliación manual cambió dos cosas que invierten la prioridad:

**Primero, hay un número.** $152 M sin comprobar, de los cuales **$124 M tienen más de 60
días**. Ninguna otra parte de este sistema tiene un número así al lado. El tablero de
presupuestos mejora una decisión; esto recupera plata que ya se facturó y no entró.

**Segundo, y es lo que lo hace posible: los datos ya existen y no los carga nadie.** Están en
ARCA, en Gmail y en los PDF adjuntos. La regla madre del `CLAUDE.md` dice que la app no debe
convertir a las personas en cargadores de datos; acá no hace falta, porque **el dato ya está
escrito, sólo que en 470 lugares distintos**. Es el caso más puro de "no se pregunta, se
deriva" de todo el proyecto.

### El detalle que reordena el modelo

La cadena que describís —presupuesto → trabajo → factura → cobro— es la del futuro. **Las 470
facturas históricas no tienen presupuesto en la base**: la base está vacía y el talonario de
papel cerró en el 15999. Son dos numeraciones independientes que hoy no se tocan: el talonario
propio (16000 en adelante, lo asigna la base) y los comprobantes de ARCA (Factura A 0002-3103
en adelante, los asigna AFIP).

Consecuencia de diseño, y es importante: **un comprobante tiene que poder existir sin trabajo
asociado.** `trabajo_id` nullable, no por comodidad, sino por el principio IV — el esquema
nunca bloquea registrar la realidad. Si el esquema exige el trabajo, los 470 comprobantes no
entran, y sin ellos no hay cobranza que conciliar.

El enganche con la cadena arranca sólo para lo nuevo, y es un `trabajo_id` que se completa
cuando existe, no un requisito.

---

## 2. Las seis reglas que no se negocian

Entran al documento como reglas del sistema, no como preferencias. Cada una tiene un
requisito verificable al lado.

| # | Regla | Requisito verificable |
|---|---|---|
| R1 | **Gmail es sólo lectura.** La app nunca manda un mail sola. Arma borradores; siempre los manda una persona | **RF-501.** No existe en el código ninguna llamada a un método de envío. Se verifica con un test que lee los archivos, igual que la regla de las capas |
| R2 | **Nunca se guarda una contraseña de portal.** Sí URL, usuario y canal | **RF-502.** No hay columna que pueda contener una contraseña, y un test busca por nombre (`pass`, `clave`, `password`, `token`) en el esquema y en el repo |
| R3 | **"Aprobada" no es "pagada", y un acuse no es un pago** | **RF-503.** Acuses y aprobaciones se guardan en una tabla **distinta** de las imputaciones. Por construcción, un acuse no puede sumar al cobrado |
| R4 | **Escalera de evidencia.** Cada imputación guarda su nivel: N1 portal dice pagado · N2 aviso u orden de pago que nombra la factura · N3 certificado de retención que nombra la factura · N4 confirmación escrita de una persona · N5 coincidencia de importe | **RF-504.** `nivel_evidencia` es obligatorio y no tiene default. **N5 nace sin confirmar** y no entra en ningún total hasta que una persona la confirma |
| R5 | **El estado de una factura se deriva, no se guarda.** Sale de sus imputaciones, notas de crédito y envíos | **RF-505.** No existe la columna `estado` en comprobantes. El estado es una **vista** en `base/supabase/migrations/`. Es el principio II, y el III: la base deriva, la app interpreta |
| R6 | **Retenciones desde el día uno.** `saldo = facturado − acreditado − retenido`. Entre ~14% y ~20% del bruto según compañía, cada una con su certificado y su impuesto (IVA, Ganancias, IIBB, SUSS) | **RF-506.** No hay imputación sin su desglose. Una imputación cuyo bruto no cierre contra neto + retenciones queda marcada como incompleta, no se descarta |

**Una regla más, que sale de tener doce parsers:** ningún parser falla en silencio
(**RF-507**). Todo aviso que llegó y no se pudo imputar aparece en una bandeja de revisión. Un
parser que se rompe cuando la compañía cambia la plantilla del mail es cuestión de tiempo; lo
que no puede pasar es que se rompa y nadie se entere, porque entonces la plata deja de
aparecer y el sistema se sigue viendo prolijo.

Y el corolario operativo (**RF-508**): se guarda el **texto extraído** de cada mail y cada PDF.
Así un parser corregido se puede volver a correr sobre los 21 meses de historia sin volver a
Gmail. Sin esto, cada arreglo de parser cuesta un barrido completo del correo.

---

## 3. Dónde corre lo que no es la app

**Este es el choque más grande con lo que ya está escrito**, y lo dejo acá arriba porque
condiciona todas las fases: la spec 002 §6.2 declara que **no hay backend propio**, y el
`CLAUDE.md` que la base *es* la API.

Leer Gmail no se puede hacer desde el navegador. Un token de Google no puede vivir en una
variable `VITE_`, porque todo lo que empieza con `VITE_` se hornea en el bundle y queda
público. Así que algo tiene que correr afuera, periódicamente, y no es la app.

Dos caminos, y tengo preferencia:

| | **Google Apps Script** (recomendado) | **Supabase Edge Function + `pg_cron`** |
|---|---|---|
| Qué es | Un script que corre dentro de tu cuenta de Google | Una función en el servidor de Supabase |
| OAuth de Gmail | **No hace falta.** Corre como vos: `GmailApp` ya tiene acceso | Hay que guardar y renovar un refresh token |
| Secretos a guardar | Sólo la credencial para escribir en Supabase | El refresh token de Google **y** la credencial de Supabase |
| Texto del PDF | Vía Drive (convertir el PDF con OCR) | Hay que meter una librería de PDF |
| Ya existe | **Sí: la prueba de concepto que baja los PDF a Drive funciona** | No |
| Lo que se pierde | Queda atado a tu cuenta personal de Google | Nada técnico; cuesta más de arranque |

**Mi recomendación: Apps Script**, y no por pereza. El argumento fuerte es el de R2 llevado al
extremo: el camino que **no requiere guardar un token de Google en ninguna parte** es
estructuralmente más seguro que el que sí, y además es el único de los dos que ya está probado
contra tus mails reales. El costo —queda atado a tu cuenta— es real y hay que decirlo.

**Con qué identidad escribe el robot en la base:** un usuario de Supabase Auth dedicado
(`robot@…`), con políticas de RLS propias que lo dejen **insertar evidencia y nada más**.
Nunca la `service_role`: esa clave saltea la RLS entera, y un script que la tenga es un script
que puede borrar la base. Es la pregunta P6 de §9.

**Y donde viven los PDF:** en Drive, con la base guardando la URL y el texto extraído. La spec
002 §6.2 ya decidió que documentos **nunca dentro de la base**; esto lo respeta, no lo
contradice.

---

## 4. El modelo de datos que esto necesita

Todo lo que sigue es **tabla o vista de la base**, y su migración va en
`base/supabase/migrations/`, no en `src/`. Principio X: la spec precede a la migración. Esta sección es el pedido, no el DDL.

### 4.1 Datos maestros — fase 1

**`compania`** · la ficha de cada compañía. Es la tabla que convierte doce reglas de negocio
en veinte filas de datos.

| Columna | Por qué |
|---|---|
| `nombre`, `cuit` | **Una fila por entidad fiscal, no por marca.** La Caja (30-66320562-1) y Experta (30-71459054-1) son dos filas. Zurich (30-50004977-0) y Zurich ex QBE (30-50003639-3) también. Es el error de A5, resuelto en el esquema |
| `alias[]` | Cómo aparece en los mails y en el extracto del banco, que no es cómo la llamás vos |
| `plazo_declarado_dias` | Para derivar el vencimiento (A8) |
| `canal`, `portal_url`, `portal_usuario` | **Nunca contraseña** (R2). Zurich: Z-Track desde jun-2026, la casilla de mail se dio de baja. La Segunda: portal Vendors. San Cristóbal: portal de prestadores |
| `mail_facturacion`, `remitentes_aviso[]` | A dónde se manda (A6) y de quién se espera (A2) |
| `retencion_esperada_pct` | El rango real de esa compañía, para la ventana de A9 |

**`compania_requisito`** · el checklist de documentación por compañía (conformidad firmada,
orden de compra, fotos). Una fila por requisito, no un campo de texto libre: si es texto
libre, no se puede validar antes de emitir.

**`regla_facturacion`** · la excepción que no es un dato de la ficha: *si un siniestro de
Allianz no supera la franquicia, se factura a Utrace*. Compañía origen, condición, compañía
destino. Una fila, no un `if` escondido en el código.

**`tipo_comprobante`** · A, B, FCE MiPyME A, NC A, ND A. Tabla y no enum, porque va a crecer.

### 4.2 El libro de ARCA — fase 1

**`comprobante`**

| Columna | Nota |
|---|---|
| `cuit_emisor`, `tipo_id`, `punto_venta`, `numero` | **`UNIQUE (cuit_emisor, tipo, punto_venta, numero)`.** Es la clave que hace que reimportar no duplique. **`cuit_emisor` entra por N1 (2026-10-08):** de ene-2025 a hoy factura un solo CUIT, el del taller, y está previsto pasar a otro. Cada CUIT tiene su propia numeración en ARCA, así que sin el emisor en la clave la primera factura del CUIT nuevo chocaría con una vieja. Es una columna con `CHECK` de formato, no una tabla: son dos emisores. El libro de retenciones (A10) pasa a ser por emisor |
| `fecha_emision`, `cuit_receptor`, `compania_id` | `compania_id` nullable: las Factura B 0002-738 en adelante son particulares |
| `neto`, `iva`, `total` | `NUMERIC`. Llega como string a la app y **no se hace aritmética en el navegador** |
| `trabajo_id` | **Nullable.** Las 470 históricas no tienen trabajo (§1) |
| `siniestro_nro` | Nullable para las B; obligatorio y validado para las de compañía (A5) |
| `importacion_id` | De qué corrida salió. Sin esto no se puede auditar un import que salió mal |

**`comprobante_vinculo`** · el único lugar donde vive la relación entre una NC o ND y la
factura que toca. Origen, destino, motivo (`anula`, `duplicado`, `ajuste`, `revierte_nc`), y
quién lo confirmó. Cubre los dos casos reales: la NC por mismo CUIT y mismo importe, y la
**ND 001 que revivió la factura 3285** revirtiendo una NC.

**`importacion`** · fuente (`arca`, `banco`, `gmail`), hash del archivo, filas leídas, filas
nuevas, cuándo. Es lo que hace que "de forma periódica y sin duplicar" sea verificable.

### 4.3 La evidencia — fase 2

**`aviso_pago`** · el mail o el PDF **como llegó**, antes de interpretarlo.
`gmail_message_id` **UNIQUE** —es lo que hace idempotente barrer 21 meses de correo—, más
remitente, asunto, fecha, `numero_op`, URL del PDF en Drive, **texto extraído** (RF-508), qué
parser lo leyó y si pudo.

> ⚠️ **Lo que sigue sobre `imputacion` lo reemplaza el plan, D4 (decidido el 2026-10-07).** El
> robot **nunca** escribe una imputación: escribe `aviso_linea`, lo que dijo el mail renglón por
> renglón. Una vista (`vw_imputaciones`) cruza las líneas cuyo número coincide exacto con un
> comprobante y les suma las imputaciones que carga una persona. Así reprocesar un parser no
> borra nada que alguien haya confirmado, y la aclaración del principio VI se sostiene sin
> interpretación. Las cardinalidades de abajo siguen valiendo.

**`imputacion`** · el cobro aplicado a un comprobante. `comprobante_id`, `aviso_pago_id`
(nullable: puede venir de un portal), `fecha_pago`, `bruto`, `neto`, `numero_op`,
`nivel_evidencia` (N1–N5, **sin default**), `fuente` (`mail`, `pdf`, `portal`, `banco`,
`persona`), `creado_por` (robot o persona), `confirmado_por` + `confirmado_en` (**nulos = es
una sugerencia y no suma**).

Dos cardinalidades que el modelo tiene que soportar y que salen de casos reales:

- **Una OP cancela varias facturas** → varias imputaciones apuntando al mismo
  `aviso_pago_id`. Fed. Patronal agrupa; Galicia agrupa.
- **Una factura recibe pagos parciales o residuales** → varias imputaciones sobre el mismo
  comprobante. Fed. Patronal pagó **$84,49 contra una factura de $84,50**. Si el modelo asume
  un pago por factura, ese centavo deja la factura abierta para siempre o la cierra mintiendo.

**`retencion`** · una fila por impuesto por imputación: `imputacion_id`, `impuesto`
(IVA, Ganancias, IIBB, SUSS), `importe`, `numero_certificado`, `periodo_fiscal`, URL del
certificado. `UNIQUE (impuesto, numero_certificado)`, porque el mismo certificado no se
computa dos veces como crédito fiscal.

**`acuse`** · tabla separada por R3. `gmail_message_id` UNIQUE, `tipo` (`acuse`,
`aprobacion`, `fecha_prometida`, `autorespuesta`), `fecha_prometida` nullable. Acá entran el
"Ingreso de Factura N° X" de Nación, el "la fecha de pago es el dd/mm" de Allianz y las
aprobaciones de Mercantil. **Nada de esto puede sumar al cobrado**, y al estar en otra tabla
no es cuestión de disciplina sino de esquema.

### 4.4 Envíos, autorizaciones y tareas — fases 3 y 4

**`envio`** · `comprobante_id`, canal, destinatario, cuándo, quién, si es reenvío y de cuál,
id del borrador de Gmail, adjuntos. Es la mitad que falta del estado derivado: una factura sin
`envio` no es deuda, es un olvido nuestro.

**`autorizacion`** · la orden de reparación: compañía, siniestro, `monto_autorizado`, fecha,
documento. Es lo que evita Mercantil 3385 (**$2,6 M facturados contra $1,29 M autorizados**) y
el caso Rivadavia al revés ($157.000 facturados contra una orden de $284.500 — plata dejada
sobre la mesa).

**`tarea`** · origen (mail, regla, persona), `gmail_message_id` nullable, compañía,
comprobante, el pedido, cuándo vence, cuándo y quién la resolvió. De acá sale "días sin
respuesta nuestra".

### 4.5 Banco y libro fiscal — fase 5

**`movimiento_banco`** · fecha, importe, ordenante, CUIT del ordenante, referencia, tipo
(transferencia, eCheq, cheque), `hash` UNIQUE del renglón del extracto. `imputacion` gana un
`movimiento_banco_id` nullable.

**`vw_libro_retenciones`** · no es tabla: es una vista de `retencion` por período e impuesto.

### 4.6 Las vistas que derivan el estado — fase 3

El estado **nunca se guarda** (R5). Sale de una vista de la base:

| Estado | Cómo se deriva |
|---|---|
| **Cobrado** | Suma de imputaciones confirmadas (N1–N4) + retenciones ≥ total, descontadas las NC |
| **Aprobado sin prueba** | Hay `acuse` de tipo aprobación o fecha prometida, y no hay imputación |
| **En curso** | Enviada, sin vencer según `plazo_declarado_dias` |
| **A reclamar** | Enviada, vencida, sin imputación |
| **Anulado** | Tiene NC vigente que lo cubre, sin ND que la revierta |
| **Sin evidencia** | No hay `envio`, o hay envío sin acuse ni imputación |

**Son excluyentes y la suma tiene que cerrar contra ARCA al peso.** Ese es el criterio de
aceptación duro de todo el bloque, y va en §7.

Y la distinción que pediste, que es la que vuelve creíble el número: **"sin evidencia" no es
deuda.** Un total que mezcla las dos cosas es un total que no se puede reclamar.

---

## 5. Las automatizaciones, ubicadas

### 5.1 La tabla de fases y dependencias

| | Automatización | Fase | Depende de | Tablas que estrena | Tipo |
|---|---|---|---|---|---|
| **A1** | Importar ARCA | **1** | — | `comprobante`, `comprobante_vinculo`, `tipo_comprobante`, `importacion` | Genérica |
| **A5** | Validar antes de emitir | **1** (los datos) · **4** (la pantalla) | A1 | `compania`, `compania_requisito`, `regla_facturacion`, `autorizacion` | **Datos maestros** |
| **A2** | Leer avisos desde Gmail | **0** (PoC) · **2** | A1, §3 resuelto | `aviso_pago`, `acuse` | **Parser por compañía** ×12 |
| **A3** | Imputar pagos | **2** | A1, A2 | `imputacion`, `retencion` | Genérica + 2 parsers |
| **A8** | Vencimientos y semáforo | **3** | A1, A2, A3 | ninguna: **vistas** | Genérica |
| **A7** | Vigilar mails que piden algo | **3** | A2 | `tarea` | Parser por compañía (liviano) |
| **A4** | Detectar duplicados | **4** | A1 | ninguna: consulta | Genérica |
| **A6** | Registrar envíos y borradores | **4** | A1, A5 | `envio` | Datos maestros + genérica |
| **A9** | Conciliar contra el banco | **5** | A3, **y enmienda (P2)** | `movimiento_banco` | Genérica |
| **A10** | Libro de retenciones | **5** | A3 | ninguna: **vista** | Genérica |

### 5.2 Por qué A8 y A7 van antes que A4, A5 y A6

Es la única decisión de orden que me aparté de tu lista, y la quiero justificar porque la
prioridad que diste es por valor y la mía es por secuencia.

**A4, A5 y A6 previenen problemas futuros. A8 y A7 recuperan los $152 M que ya están
afuera**, de los cuales $124 M pasaron los 60 días. Prevenir un duplicado ahorra el costo de
una NC; cobrar una factura de hace ocho meses trae plata. Y A8 no estrena una sola tabla: una
vez que A1, A2 y A3 cargaron la evidencia, el semáforo es **vistas y pantalla**, lo más barato
de toda la lista.

A7 va pegado a A8 porque la pregunta de los diez segundos tiene dos mitades. "¿Cuánto me
deben, quién, desde cuándo?" la contesta A8. **"¿Qué tengo que hacer hoy para cobrarlo?" la
contesta A7**, y mayormente la respuesta es un mail de hace tres meses que pide el número de
siniestro y nadie contestó. Sin A7, el semáforo dice "a reclamar" y no dice por qué está
trabado.

A4 y A5 pasan a fase 4, con A6, porque los tres son el mismo momento del proceso: **antes de
emitir**. Van juntos o se cruzan.

### 5.3 Las tres categorías, que no son dos

Pediste separar "parser por compañía" de "regla genérica". Hay una tercera que conviene no
confundir, porque es la que decide cuánto código hay que mantener:

**Parser por compañía — código, uno por formato.** Doce, y es el núcleo de A2:

| Compañía | Dónde está el número de factura | Dificultad |
|---|---|---|
| La Segunda | **En el asunto** | La más fácil: no hace falta abrir el PDF |
| Fed. Patronal | **En el cuerpo** (`Fac 2-XXXX`), agrupa varias | Fácil, pero una OP → varias facturas |
| Galicia | Cuerpo o PDF, agrupa | Media |
| Sancor | En el PDF (`Factura A N°: 0002-0000XXXX`) | Media. **Puede traer NC descontadas** |
| LPS | En el PDF (`FS A/0002/0000XXXX`) | Media. Dos remitentes distintos |
| Nación | En el PDF. **También manda "Ingreso de Factura N° X", que es acuse, no pago** | Media, con trampa de R3 |
| RUS | En el PDF (`Factura: XXXX`) | Media |
| Cooperación | En el PDF (`Orden de Pago Nro X`) | Media |
| Provincia | En el PDF, con los certificados | Media |
| **San Cristóbal** | A veces `Factura 00002A0000XXXX`; **otras veces sólo el nº de siniestro**, y se atribuye por base + IVA = total de la factura | **La más difícil. Es una heurística, no un parseo** |
| Allianz | Respuesta al mail de la factura. **Fecha prometida, N4 débil** | Va a `acuse`, no a `imputacion` |
| Mercantil | Aprobación con fecha estimada | Va a `acuse` |

Nota para los diez que leen PDF: **Google no siempre marca los adjuntos como
`application/pdf`** — filtrar por extensión `.pdf`, nunca por tipo MIME. Ese es exactamente el
tipo de detalle que hace que un parser funcione contra seis mails de prueba y falle contra el
séptimo.

Y San Cristóbal merece su propia regla: cuando sólo viene el siniestro, la atribución por
`base + IVA = total` es una **sugerencia N5**, no una imputación. Es el mismo criterio que el
match del banco: coincidencia de importe sin más no es prueba.

**Datos maestros por compañía — filas, no código.** A5 y A6 completos, y
`plazo_declarado_dias` de A8. Esto es lo que más conviene mover de código a datos: el día que
Zurich cambia de canal otra vez, se edita una fila desde la pantalla; no se toca el repo, no
se despliega nada. Es el motivo por el que `regla_facturacion` y `compania_requisito` son
tablas y no `if`.

**Reglas genéricas — código, una sola vez para todas.** A1, la aritmética de A3, A4, A8, A9 y
A10. Toda la plata se calcula acá, una vez, y como vistas en la base: si "cobrado" se define
en el JavaScript, en seis meses hay dos definiciones y ninguna manera de saber cuál rige. Es
el principio III y es tu propio pedido —que el número lo defina la base— aplicado a cobranzas.

### 5.4 La fase 0, que ya existe

El Apps Script que baja los PDF de esas búsquedas a Drive **ya funciona**, y es la fase 0
entera. Lo único que le falta para ser la base de A2 es guardar, al lado de cada PDF: el
`gmail_message_id`, el remitente, el asunto, la fecha, y **el texto extraído**.

Con eso solo, antes de escribir una línea de la app, se puede: medir contra cuántos mails
reales acierta cada parser, y tener el juego de datos de prueba de los doce formatos. Hoy los
parsers se escribirían contra los ejemplos de esta tabla, que son una muestra; con fase 0 se
escriben contra 21 meses.

### 5.5 El orden interno de A1, que tiene un ciclo

La regla *"la nota de crédito va siempre sobre la factura que **no** se cobró"* depende del
estado, y el estado depende de las imputaciones (R5). Pero las imputaciones llegan en la fase
2 y las NC en la fase 1: durante la fase 1 esa regla **no se puede evaluar**.

Cómo lo resolvería, y es la pregunta P9: en fase 1 se vinculan sólo las NC con **un único
candidato** por CUIT e importe. Las ambiguas quedan en la bandeja. En fase 2, cuando ya hay
imputaciones, se vuelve a correr la vinculación y la regla desempata sola. Las que sigan
ambiguas las desempata una persona, siempre; nunca el sistema eligiendo la primera.

---

## 6. Las pantallas que esto agrega

Cinco, y acá está el segundo choque con lo escrito: el `CLAUDE.md` dice **"tres pantallas.
Nada más"**. No lo cambio por mi cuenta (P3).

| Pantalla | Qué contesta | Fase |
|---|---|---|
| **Cobranzas** | Cuánto me deben, quién, desde cuándo. Por compañía, por tramo de antigüedad (<60 · 61–120 · 4–12 meses · >1 año), separando deuda de "sin evidencia" | 3 |
| **Ficha de factura** | La cadena completa de un número: envíos, acuses, imputaciones, retenciones, NC, **hasta el PDF que lo respalda** | 3 |
| **Revisar** | Lo que el robot no pudo cerrar: avisos sin parsear, sugerencias N5, NC ambiguas, imputaciones que no cierran. Es la pantalla que hace que RF-507 sea verdad | 2 |
| **Ficha de compañía** | Los datos maestros: CUIT, canal, plazo, checklist, requisitos | 1 |
| **Antes de emitir** | Duplicados, CUIT correcto, siniestro válido, canal, monto autorizado, checklist | 4 |

**Qué pasa con las tres de antes:** el Tablero y la Ficha de la spec 002 no se tocan en este
documento. Y el **resumen del mes** de la spec 004 pasa a ser un subproducto: cuando exista la
vista mensual, es una pantalla chica; ya no es lo único que esta app tiene para hacer.

**El requisito que ordena las cinco (RF-509):** cada número del semáforo se puede abrir hasta
el comprobante que lo respalda. Un total que no se puede abrir no se puede reclamar, y un
número que no se puede verificar a mano deja de usarse en tres semanas — es el mismo motivo
por el que la spec 002 prohibió los gráficos antes de tener seis meses de datos.

---

## 7. Criterios de aceptación

Medibles. El bloque está cumplido cuando **todo** esto es cierto:

1. **El arqueo cierra al peso.** Para el período ene-2025 → sep-2026: facturado = cobrado +
   aprobado sin prueba + en curso + a reclamar + anulado + sin evidencia, contra el total de
   ARCA, **sin diferencia de un peso**.
2. **Reproduce tu conciliación manual.** El sistema llega a los **$171 M cobrados con prueba**
   y los **$152 M sin comprobar**, y toda diferencia queda explicada fila por fila. Tu
   planilla es el juego de datos de prueba (P12).
3. **Reimportar no duplica.** El mismo CSV de ARCA dos veces no agrega una fila. El mismo mail
   dos veces tampoco.
4. **Ningún "cobrado" sin evidencia.** Es imposible por construcción llegar a cobrado sin al
   menos una imputación confirmada N1–N4.
5. **Ningún aviso invisible.** Todo mail de un remitente conocido que no terminó en imputación
   o acuse aparece en Revisar. Se verifica a propósito con un mail de formato roto.
6. **La app no manda mails.** Test que lee el código, igual que `arquitectura.test.ts`.
7. **Ninguna contraseña**, ni en el esquema ni en el repo. Test.
8. **Tres toques** desde el total de una compañía hasta el PDF que respalda un cobro.
9. **El residuo de $84,49 contra $84,50** se imputa y deja la factura cerrada, no abierta por
   un centavo ni cerrada mintiendo.
10. **La ND 001 revive la factura 3285**: el estado derivado cambia de anulado a lo que
    corresponda, sin que nadie edite nada a mano.

---

## 8. Lo que choca con decisiones ya escritas

**No cambié ninguna.** Están acá, con la decisión original, para que las resuelvas. Cuatro son
choques de verdad; las otras dos son correcciones que este documento implica.

| # | Qué está escrito | Dónde | Con qué choca | Mi lectura |
|---|---|---|---|---|
| **C1** | **"Ninguna automatización escribe estado financiero"** — principio VI del modelo | Constitución v3.0.0 | A2, A3 y A9 son exactamente automatizaciones que escriben plata | **Se puede respetar sin enmendar**, y creo que es la lectura correcta: el robot escribe **evidencia** (aviso, acuse, imputación con su nivel y su fuente), nunca **estado** — el estado es una vista (R5). Pero es una interpretación y la tenés que confirmar vos: P1 |
| **C2** | **"Conciliación bancaria"** está fuera de alcance, heredado del principio IX | spec 002 §6.1 | **A9 es literalmente eso** | Acá no hay interpretación posible: **necesita enmienda escrita** en la constitución del modelo. Por eso A9 está en la fase 5 y no antes: es la única que está bloqueada por un trámite, no por código |
| **C3** | **"Alcance: tres pantallas. Nada más. Si algo no entra en esas tres, no entra"** | `CLAUDE.md` | §6 agrega cinco | Hay que enmendarlo. Y conviene hacerlo bien: no "ahora son ocho", sino **un segundo módulo declarado** con su propia frontera, porque si el alcance se abre sin redefinirlo, el principio IX deja de poder decir no a nada |
| **C4** | **RF-601: "esta aplicación es de sólo lectura"** y **RF-602: "no muestra listas de presupuestos"** | spec 004 §5 | Cobranzas es el módulo más escritor del sistema | RF-601 **se retira**, y se reemplaza por algo más preciso, que es lo que en realidad protegía: *esta app no escribe lo que la herramienta posee* (`trabajos`, `trabajo_items`, las `txt_*`). Las tablas de cobranza son suyas. El test cambia de "no escribe" a "no escribe esas tablas". **RF-602 se mantiene**: las listas de presupuestos siguen siendo de la herramienta |
| **C5** | *"Lo que NO se hace todavía: facturas y cobros"* | `ESTADO.md` | Pasa a ser el MVP | Esto lo decidiste vos al pedir este bloque. Lo actualizo en `ESTADO.md` y lo marco como decisión tuya, con fecha |
| **C6** | **Hecho #3, detrás de no concretado y de ingreso/entrega** | spec 002 §4 | Cobranzas primero | También es tuyo, y §1 da el argumento: los otros dos hechos piden carga nueva, éste **no pide ninguna**. El dato ya está escrito |

---

## 9. Lo que necesito que me contestes antes de cerrar el modelo

Ordenadas: las primeras cuatro bloquean, las demás se pueden contestar mientras avanza la
fase 1.

### Bloquean

| # | Pregunta | Mi recomendación | Decisión |
|---|---|---|---|
| **P1** | **C1**: ¿aceptás la lectura de que el robot escribe evidencia y no estado, o hay que enmendar el principio VI? | Aceptarla y **dejarla escrita en la constitución como aclaración**, no como enmienda. Una interpretación que no está escrita se vuelve a discutir en marzo | ✅ **Aceptada (2026-10-07).** Escrita en la constitución v3.0.1, principio VI |
| **P2** | **C2**: ¿se enmienda el principio IX para que entre la conciliación bancaria (A9)? | Sí, pero **recién en la fase 5**. No bloquea nada hasta entonces, y para entonces vas a saber si hace falta | ✅ **Todavía no (2026-10-07).** Se decide al llegar a la fase 5 |
| **P3** | **C3**: ¿se abre el alcance de tres pantallas, como **módulo de cobranzas declarado** con su propia frontera? | Sí, como módulo. Si se abre sin frontera nueva, el alcance deja de defenderse | ✅ **Sí (2026-10-07).** Escrito en el `CLAUDE.md`, "Alcance: dos módulos" |
| **P4** | **C4**: ¿se retira RF-601 y se reemplaza por "no escribe las tablas de la herramienta"? | Sí | ✅ **Sí (2026-10-07).** Reemplazado en la spec 004 §5. El test cambia en el commit de la primera escritura |

### El robot

| # | Pregunta | Mi recomendación |
|---|---|---|
| **P5** | ¿**Apps Script** o Edge Function? (§3) | Apps Script: ya funciona y **no hay que guardar ningún token de Google** |
| **P6** | ¿El robot escribe con un usuario `robot@` dedicado y RLS propia? | Sí. **La `service_role` no sale nunca de Supabase** |
| **P7** | Los PDF: ¿Drive, carpeta por compañía y año, y la base guarda URL + texto? ¿De quién es la carpeta? | Drive, consistente con "documentos nunca dentro de la base". El dueño importa: si es una cuenta personal y mañana no está, la evidencia no está |

### El modelo

| # | Pregunta | Mi recomendación |
|---|---|---|
| **P8** | **Retenciones.** ¿El rango 14–20% y la ventana 80–86% del banco son sobre el total **con IVA**? ¿Las FCE MiPyME retienen distinto? ¿Hay compañías que no retienen? | Guardar `retencion_esperada_pct` **por compañía** y no una constante global: la ventana del banco es la que más falsos positivos puede dar |
| **P9** | **NC ambiguas** (§5.5): ¿se acepta vincular sólo las de candidato único en fase 1 y reintentar en fase 2? | Sí, y las que queden ambiguas las desempata una persona, siempre |
| **P10** | **¿Se persiguen las Factura B (particulares)?** ¿Los ~20 deudores son todos compañías? | Importar todo (el arqueo tiene que cerrar contra ARCA entero), pero que el semáforo arranque **sólo con compañías**: un particular no tiene portal, ni OP, ni retención, y las diez automatizaciones no le aplican |
| **P11** | **¿Desde cuándo se importa ARCA?** ¿Sólo ene-2025, o todo el histórico? | Desde ene-2025, que es hasta donde llega tu conciliación. Sin conciliación con qué comparar, importar más viejo agrega filas y no agrega verdad |
| **P12** | **¿La conciliación manual existe como planilla?** | Es lo más valioso que podés pasarme: es el **juego de datos de prueba del criterio 2**. Sin ella, el sistema no se puede verificar contra nada |
| **P13** | **Plazos por compañía**: ¿los tenés declarados, o se infieren del histórico? | Inferir del histórico (sale gratis de A3) y dejar el declarado como override manual. Lo que importa para reclamar es el plazo real |
| **P14** | **¿Quién usa la pantalla de cobranzas**: vos o la administrativa? | Cambia A6: si el que arma el borrador no es el que lo manda, hace falta un paso de "listo para enviar" |
| **P16** | **¿Una imputación que escribe el robot suma al cobrado sin que nadie la confirme?** §4.3 dice que `confirmado_por` nulo es "una sugerencia y no suma", pero R4 dice que **N5** nace sin confirmar, lo que sugiere que N1–N4 no. Las dos lecturas no pueden ser verdad a la vez. *(Agregada el 2026-10-07, al escribir la aclaración del principio VI)* | ✅ **Resuelta el 2026-10-07 por el plan, D4 (N2):** el robot no escribe imputaciones. Lo que dice un aviso que nombra la factura con número exacto suma por una vista, sin confirmación; todo lo demás (N1, N4, N5 y los desempates) lo carga una persona en `imputacion`. La recomendación original —que el robot escribiera N2/N3 que sumaran solas— se descartó: obligaba a que el robot borrara imputaciones al reprocesar |
| **P15** | **El monto autorizado de A5** es el único dato de todo el bloque que hay que **cargar a mano**. ¿Se carga para los nuevos, o también hacia atrás? | Sólo de acá en adelante, y por excepción: es la única carga nueva que este módulo pide, y conviene que se note |

---

## 10. Lo que este documento NO propone

Para que el principio IX siga pudiendo decir no:

- **Emitir comprobantes fiscales.** Se factura por ARCA o el contador. Acá se importa, se
  valida y se registra. Sin cambios respecto de la spec 002 §6.2.
- **Mandar mails.** R1, y es un test.
- **Guardar contraseñas ni entrar a los portales automáticamente.** R2. Lo que dice el portal
  entra como N1 cargado por una persona.
- **Pagos a proveedores, cuenta corriente, stock.** Siguen fuera (spec 002 §6.1). Esto es
  cobranza: plata que entra.
- **Gráficos de tendencia.** El mismo límite de la spec 002: números con su período al lado,
  verificables a mano. Acá hay 21 meses de datos reales, así que la discusión se puede
  reabrir —pero no en este documento.
- **IA sobre los mails.** Los doce formatos son doce formatos conocidos y estables. Un parser
  se puede testear contra 21 meses y da el mismo resultado siempre; un modelo no. El día que
  aparezca la compañía trece se escribe el parser trece.

# Plan 005 — Cobranzas: fase 1

| | |
|---|---|
| **Estado** | **Fase 1 aprobada por Luciano el 2026-10-08.** Las fases 2 a 5 están en el plan completo, que queda fuera del repo hasta contestar N3 (repo público) |
| **Spec** | [`spec.md`](./spec.md) |
| **Constitución** | `base/.specify/memory/constitution.md` v3.0.1 |

> Este archivo es la parte del plan que ya se puede construir. No tiene montos, CUIT ni datos de
> personas: el repo es público.

---

## Qué entrega la fase 1

El libro de ARCA adentro de la base, y las fichas de compañía. Es lo que no depende de nada: sin
comprobantes no hay a qué imputar un pago, y el arqueo contra ARCA es el total contra el que se
mide todo lo que viene después.

**Terminado cuando:**

- Reimportar el mismo CSV de ARCA da **0 nuevas** (criterio 3 de la spec).
- `vw_arqueo_arca` coincide **al peso** con el total de ARCA, mes por mes.
- La ND 001 queda vinculada a la NC que revierte.

---

## Decisiones

### D2. Roles: persona y robot

El rol va en `app_metadata` del usuario, que el usuario no puede editar. Políticas **restrictivas**
—se suman con AND a las que ya hay— sobre las cuatro tablas del presupuesto: sin rol `persona`, no
se entra.

| | Tablas de presupuesto | Evidencia (fase 2) | Decisiones de una persona | Vistas de saldo |
|---|---|---|---|---|
| **persona** | todo, como hoy | leer | todo | leer |
| **robot** | **nada** | insertar | **nada** | **nada** |
| **sin rol** | nada | nada | nada | nada |

Resuelve H6: el robot no hereda acceso total. Es además la segunda capa detrás del registro
cerrado (H1): una cuenta sin rol no ve nada.

### D3. La clave del comprobante incluye el CUIT emisor

`unique (cuit_emisor, tipo_id, punto_venta, numero)`. Decidido por N1: hoy emite un solo CUIT y
está previsto un cambio de emisor, y cada CUIT numera por separado.

**La compañía sale del CUIT del receptor**, por un join con su ficha; no se guarda aparte. Guardar
`compania_id` además de `cuit_receptor` sería una copia (principio V). Un comprobante cuyo CUIT no
tiene ficha aparece como "compañía sin ficha".

### D8. Que ninguna tabla nueva nazca abierta

Supabase le da privilegios a `anon` sobre toda tabla nueva, y Postgres le da `EXECUTE` a `PUBLIC`
sobre toda función nueva (H9). Desde M2 entra **`src/migraciones.test.ts`**: lee
`base/supabase/migrations/` y falla si un `create table` no tiene en el mismo archivo su
`enable row level security`, su `force row level security` y su `revoke … from anon`, o si un
`create function` no tiene su `revoke execute … from public, anon`.

### D9. Cómo se aplican las migraciones (N10)

**Se siguen pegando en el SQL Editor**, una por vez (decidido el 2026-10-08). La CLI de Supabase no
corre en la máquina de Luciano, y arreglarla es un desvío. Lo que se pierde —el registro automático
de qué se aplicó— lo cubre una **verificación por migración**: un archivo `qa-…sql` en esta carpeta
que devuelve una sola tabla con `ok` o `FALLA` por chequeo. Cada migración se prueba antes contra
una base local con las anteriores aplicadas, incluida una corrida de la verificación **sin** la
migración, que tiene que dar `FALLA`: así se sabe que la verificación detecta lo que dice detectar.

### Preguntas de la spec que entran contestadas

| | Decisión |
|---|---|
| **P9** — NC ambiguas | En fase 1 se vinculan solas sólo las NC con **un único candidato** por CUIT e importe. Las demás quedan para que las resuelva una persona |
| **P10** — Factura B | Se importan **todas**: el arqueo tiene que cerrar contra ARCA entero. El semáforo arranca sólo con compañías |
| **P11** — Desde cuándo | Desde **enero de 2025**, hasta donde llega la conciliación manual |

---

## Las migraciones

| | Contenido | Estado |
|---|---|---|
| **M1** `roles` | `fn_rol()` y `solo_personas` restrictiva en las 4 tablas (D2). Aborta si algún usuario no tiene rol | ✅ **Aplicada y verificada el 2026-10-08:** [`qa-m1-roles.sql`](./qa-m1-roles.sql) dio 12 de 12 ok contra la base real. Prerrequisito: los tres usuarios con `rol: persona` |
| **M2** `maestros` | `tipo_comprobante` (código de ARCA como clave, 9 tipos cargados), `compania` (CUIT como clave; alias, remitentes de aviso, plazo declarado, canal, URL y usuario de portal, **nunca contraseña**), `compania_requisito`, `regla_facturacion`. Sólo personas. **Sin `retencion_esperada_pct`**: sirve a A9 (fase 5, bloqueada) y depende de P8; entra cuando haya una decisión que la use (principio V) | ✅ **Aplicada y verificada el 2026-10-08:** [`qa-m2-maestros.sql`](./qa-m2-maestros.sql) dio 12 de 12 ok contra la base real. Entra con ella `src/migraciones.test.ts` (D8) |
| **M3** `comprobantes` | `importacion` (las nuevas se cuentan, no se guardan), `comprobante` (clave D3; CUIT del receptor sólo si ARCA lo da como CUIT; moneda y tipo de cambio para que el arqueo no sume dólares como pesos), `comprobante_vinculo` (sólo decisiones de una persona). **Sin `siniestro_nro` ni `trabajo_id`**: nadie los llena en la fase 1; entran con la fase 2 | ✅ **Aplicada y verificada el 2026-10-08:** [`qa-m3-comprobantes.sql`](./qa-m3-comprobantes.sql) dio 15 de 15 ok contra la base real |
| **M4** `vistas_arca` | `vw_arqueo_arca` (por emisor, mes y tipo; `total_con_signo` resta las NC), `vw_nc_candidatas` (cada NC con su factura: `confirmada`, `unica`, `ambigua` o `sin_candidata`; dos NC con la misma única factura son ambiguas). Ninguna escribe nada (P9) | ✅ **Aplicada y verificada el 2026-10-08:** [`qa-m4-vistas-arca.sql`](./qa-m4-vistas-arca.sql) dio 13 de 13 ok contra la base real |

## La app

| | Detalle |
|---|---|
| `dominio/arca.ts` | Lector **puro** del CSV de Mis Comprobantes → filas tipadas, o un error por renglón. Con tests sobre CSV sintéticos. **Hecho**, probado además contra renglones reales fuera del repo |
| `datos/comprobantes.ts` | Crea la `importacion`, inserta de a 500 sin duplicar (`ON CONFLICT DO NOTHING`) y le pregunta a la base cuántas quedaron nuevas. No es una transacción: si se corta a mitad, reimportar completa lo que faltó. **Hecho** |
| Pantalla **Importar** | Se sube el CSV y se ve "N para importar, M con problemas" y la lista de los que no entran; al importar, "N nuevas · M ya estaban". Pide el CUIT emisor (validado con su dígito verificador) y desde la segunda vez lo propone, sacándolo de la última importación. **Hecha y usada con datos reales el 2026-10-08:** dos archivos de ARCA (ene-2025 → oct-2026), 528 comprobantes, ninguno con problemas; reimportar uno dio **0 nuevas** (criterio 3) |
| Pantalla **Ficha de compañía** | **En espera (2026-10-08).** Las fichas las carga Luciano con un SQL que arma otra IA a partir de la lista de receptores; con las fichas cargadas así, la pantalla sólo serviría para corregir alguna. Vuelve cuando haga falta editarlas seguido |
| `arquitectura.test.ts` | **Cambiado en el commit de la primera escritura**: la app escribe sólo `importacion` y `comprobante`, cada escritura pegada a su tabla, y sólo desde `datos/` |

---

## Fase 0 — el corpus (escrita el 2026-10-08)

Lo que el plan completo llama fase 0, ya construido en [`robot/`](../../robot/README.md). **No toca la
base**: escribe en una planilla de la cuenta de Google del taller.

| | Detalle |
|---|---|
| `robot/barrido.js` | Busca en Gmail los mails de los remitentes de la pestaña *remitentes* y los *Enviados* con asunto `factura n°…`. Cada mail se guarda una vez (lo que ya está en la planilla se saltea), con el texto de sus PDF (Drive los convierte; el documento temporal se borra). Corta a los 4 minutos y medio y la corrida siguiente sigue. `releer` vuelve a leer todo sin ir a Gmail (RF-508) |
| `robot/lectores/` | Funciones puras, una por compañía, con versión. Leen el cuerpo del mail (**Federación Patronal**), el asunto (**La Segunda**) o el texto del PDF (**LPS, Río Uruguay, Nación, San Cristóbal** en sus dos formatos, **Sancor**). **Galicia/SURA** y **La Caja** (por el aviso de cobranzas.com, que sólo dice que hubo un pago) se sumaron después, a partir del relevamiento de plataformas de Luciano. Cada línea dice la factura o el siniestro, su bruto y su neto; cada retención, su impuesto, importe y certificado |
| `robot/lectores.test.ts` | Los lectores contra mails y PDF **inventados** con la forma de los reales, y tres reglas estructurales: el manifiesto pide exactamente cuatro permisos, ningún archivo llama a nada que mande, borre o modifique un mail (R1), y `robot.gs` —lo que se pega en Apps Script— es exactamente lo que se testeó |

**Decisiones que tomé al escribirlo, para que las discutas:**

- **Gmail por el servicio avanzado, no por `GmailApp`.** `GmailApp` pide el permiso total de Gmail
  —incluido mandar—, aunque el script sólo lea. El servicio avanzado funciona con `gmail.readonly`.
  Es lo que el plan pedía verificar en la fase 0 (D7), resuelto sin verificar: ni se intenta.
- **Los remitentes son una pestaña, no código.** Agregar una casilla es un renglón. En la fase 2
  pasan a ser `compania.remitentes_aviso`, que ya existe (M2).
- **Si un pago cubre varias facturas y el mail no dice cuánto de cada una, la línea queda sin
  importe.** El lector no reparte el total: lo que el mail no dice, no se inventa (D4).
- **Las retenciones se clasifican por nombre, y ante la duda quedan como `otro`.** "RG. 1784" se
  toma como SUSS.
- **Cada lector se controla solo: bruto = neto + retenciones, al centavo.** Si el aviso trae el
  bruto y no cierra, queda `no_cierra`, a la vista, en vez de pasar como un pago. Es la única cuenta
  que hace el robot y no la guarda: la usa para desconfiar de su propia lectura (R6, RF-506). Ya
  sirvió: en Río Uruguay, el número de una resolución ("RG 2854") quedaba pegado a un total y el
  lector lo tomaba por el importe; el control lo marcó antes de que llegara a ninguna parte.
- **Los enlaces que inician sesión en un portal no se guardan.** El aviso de cobranzas.com trae uno
  que entra sin clave durante días. El barrido reemplaza toda URL con un token antes de escribir
  (R2), y un test lo verifica.
- **Del PDF se lee la orden, no los certificados**, salvo cuando la orden no desglosa las
  retenciones (Río Uruguay, San Cristóbal). Los certificados repiten lo mismo: leer los dos
  contaría dos veces.

**Lo que se vio al mirar los mails reales (sin copiar datos):**

- Hay compañías que mandan el PDF como `application/octet-stream`: el barrido reconoce los PDF por
  la extensión, como pedía la spec §5.3.
- Federación Patronal escribe el mismo importe de dos formas según cómo se lea el mail
  (`1,234,567.89` o `1234567.89`), y en Latin-1. El lector acepta las dos; el barrido respeta la
  codificación de cada mail.
- **La Segunda a veces manda el mismo aviso dos veces**, con dos `message_id` distintos. Para la
  fase 2: la vista que cruza líneas con comprobantes no puede contar dos veces la misma factura del
  mismo pago. Hoy no hace daño, porque nada suma.
- Hay un aviso de La Segunda que nombra una factura de dos cifras: no es de la serie A de cuatro cifras.
  Un número sin punto de venta ni tipo no alcanza para atribuirlo solo: en la fase 2 se cruza por
  compañía y número, y si hay dos candidatos, va a Revisar.

**Medido contra PDF reales (2026-10-08), fuera del repo:** 10 PDF de 5 compañías bajados por la
prueba de concepto. 8 cierran al centavo; 1 de San Cristóbal se lee entero pero su formato no trae
el bruto; 1 de Sancor trae sólo constancias, sin orden, y queda `no_entendido` como corresponde.
Cooperación, Provincia y el PDF de La Segunda no estaban en esa carpeta: sus lectores se escriben
contra el corpus. **Ojo:** el texto se sacó con la lectura de Drive, no con la conversión que usa el
barrido; si las dos difieren, se va a ver en el corpus como `no_entendido` o `no_cierra`.

**Terminado cuando:** está instalado en la cuenta del taller, el barrido llegó a "Al día" con los 21
meses, y hay una tabla de cuántos avisos hay por remitente y cuántos entendió cada lector. Esa tabla
ordena los lectores que siguen.


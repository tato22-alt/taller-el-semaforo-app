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
| **M4** `vistas_arca` | `vw_arqueo_arca` (totales por emisor, tipo y mes), `vw_nc_candidatas` (P9) | Pendiente |

## La app

| | Detalle |
|---|---|
| `dominio/arca.ts` | Lector **puro** del CSV de Mis Comprobantes → filas tipadas, o un error por renglón. Con tests sobre CSV sintéticos. **Hecho**, probado además contra renglones reales fuera del repo |
| `datos/comprobantes.ts` | Crea la `importacion`, inserta de a 500 sin duplicar (`ON CONFLICT DO NOTHING`) y le pregunta a la base cuántas quedaron nuevas. No es una transacción: si se corta a mitad, reimportar completa lo que faltó. **Hecho** |
| Pantalla **Importar** | Se sube el CSV y se ve "N para importar, M con problemas" y la lista de los que no entran; al importar, "N nuevas · M ya estaban". Pide el CUIT emisor (validado con su dígito verificador) y desde la segunda vez lo propone, sacándolo de la última importación. **Hecha el 2026-10-08**, vista funcionando en Chromium contra una base simulada; falta verla con el archivo y la base reales |
| Pantalla **Ficha de compañía** | Ver y editar la ficha |
| `arquitectura.test.ts` | **Cambiado en el commit de la primera escritura**: la app escribe sólo `importacion` y `comprobante`, cada escritura pegada a su tabla, y sólo desde `datos/` |

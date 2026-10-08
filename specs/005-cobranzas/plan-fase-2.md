# Plan 005 — Cobranzas: fase 2 (propuesta, SIN aprobar)

| | |
|---|---|
| **Estado** | **Borrador para que Luciano lo revise.** Principio X: ninguna migración se escribe hasta que esto esté aprobado |
| **Spec** | [`spec.md`](./spec.md) §4.3, §5.3, §6 (Revisar), §7 criterios 3, 4, 5, 9 |
| **Viene de** | La fase 0 (`robot/`): el corpus en una planilla y los lectores de nueve compañías |

> Sin montos, CUIT ni datos de personas: el repo es público.

---

## Qué entrega la fase 2

Lo que hoy el robot escribe en una planilla pasa a la base, y aparece la pantalla **Revisar**.
Con eso, por primera vez, la base sabe **qué facturas se cobraron y con qué prueba**, sin que nadie
cargue un pago a mano cuando el aviso nombra la factura.

**Terminado cuando:**

- Los 21 meses de avisos están en la base, y reprocesarlos no duplica nada (criterio 3).
- Toda factura que un aviso nombra con número exacto aparece cobrada **por una vista**, con el
  aviso que la respalda (D4). Ninguna sin evidencia (criterio 4).
- Un mail con formato roto a propósito aparece en Revisar (criterio 5).
- El residuo de centavos se ve como residuo, no como deuda abierta ni como cobro mentido (criterio 9).

---

## Las migraciones

| | Contenido |
|---|---|
| **M5** `evidencia` | `aviso` (el mail como llegó: `gmail_message_id` clave, remitente, asunto, fecha, cuerpo y texto de los PDF **ya sin claves ni enlaces de acceso**, ids de los PDF en Drive, qué lector y versión lo leyó, estado, motivo, control). `aviso_linea` (factura como la dice el aviso, punto de venta, número, siniestro, bruto, neto, OP, fecha de pago). `aviso_retencion` (impuesto, importe, certificado). `acuse` (tipo, factura, monto, fecha prometida, referencia: **otra tabla**, R3). `envio` (las facturas mandadas, desde *Enviados*) |
| **M6** `vistas_evidencia` | `vw_imputaciones` (D4: cada línea cuyo número coincide **exacto** con un comprobante de esa compañía, una sola vez aunque el aviso haya llegado dos veces) y `vw_revisar` (avisos `no_entendido` o `no_cierra`, líneas sin comprobante o con más de uno, NC ambiguas, compañías sin ficha) |
| **M7** `imputacion` | Lo que decide una persona en Revisar: vincular una línea con su factura, confirmar una sugerencia, descartar. **Sólo personas.** Entra con la pantalla, no antes (principio V) |

### Quién puede qué (D2)

| | `aviso`, `aviso_linea`, `aviso_retencion`, `acuse`, `envio` | `imputacion` | vistas |
|---|---|---|---|
| **robot** | insertar; y, para reprocesar, **borrar y reinsertar sus propias líneas** de un aviso y actualizar las columnas del lector (`lector`, `version`, `estado`, `motivo`, `control`) | **nada** | **nada** |
| **persona** | leer | todo | leer |

Reprocesar no viola el principio VI: el robot rehace **lo que dijo un mail**, nunca una decisión de
una persona, que vive en otra tabla (D4).

---

## El robot

- **Escribe en la base con su propio usuario, `robot@…`**, con `rol: robot` en `app_metadata`
  (P6). Nunca con la `service_role`. Su clave va en las *propiedades del script*, que sólo ve la
  cuenta del taller: es la única credencial que el robot guarda, y no abre nada más que lo de la
  tabla de arriba.
- **El corpus de la fase 0 se sube una vez** desde la planilla, con `releer` apuntando a la base.
- **La planilla deja de escribirse** cuando la base funcione. Dos lugares con lo mismo terminan
  diciendo cosas distintas (principio V).

---

## Lo que necesito de vos antes de aprobarlo

| # | Qué | Por qué bloquea |
|---|---|---|
| 1 | **El robot instalado y el corpus "al día"**, con la cuenta de cuántos avisos quedaron en cada estado | Sin eso no sé si los lectores funcionan con el texto que saca tu Google, y la fase 2 cargaría basura |
| 2 | **N6: en qué plan está el proyecto de Supabase**, y si hacemos un backup semanal a Drive | La fase 2 es la primera que carga cientos de filas que no están en otro lado |
| 3 | **Las fichas de compañía cargadas, con `remitentes_aviso`** | `vw_imputaciones` sabe de qué compañía es un aviso por quién lo mandó. Sin remitentes en la ficha, ningún aviso se puede cruzar con su factura. **Pedile al otro chat que los complete** (están en la pestaña *remitentes* del robot) |
| 4 | **N3: datos reales y repo público** | El código no lleva datos reales, pero la fase 2 sube cuerpos de mails a la base: conviene cerrar la regla antes |
| 5 | **Crear el usuario `robot@`** en Supabase, con `rol: robot` | Te paso los pasos cuando apruebes |

## Lo que este plan NO hace

- No lee los portales (N1): lo que dice un portal lo carga una persona en Revisar.
- No reparte un pago entre varias facturas cuando el aviso no lo reparte: eso queda en Revisar.
- No toca las tablas del presupuesto.
- No agrega la conciliación bancaria (A9): sigue bloqueada por el principio IX.

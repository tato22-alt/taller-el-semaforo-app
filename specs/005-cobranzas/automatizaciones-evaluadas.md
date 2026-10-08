# Automatizaciones evaluadas contra el negocio real (2026-10-08)

| | |
|---|---|
| **Qué es** | Investigación, **no una spec aprobada**. Lo que se midió en el Gmail y el Drive del taller para decidir qué automatizar después del robot de pagos |
| **De dónde salen los números** | Lectura (sólo lectura) de 21 meses de correo, ene-2025 → oct-2026: 733 hilos con compañías, 1.027 mensajes de ellas, 270 facturas enviadas, 254 órdenes de trabajo, 143 avisos de pago por mail y 50 PDF de órdenes de pago |
| **Qué no tiene** | Ningún monto, CUIT, siniestro, patente ni nombre: el repo es público. Los detalles quedaron fuera |

---

## El resumen, en una tabla

Ordenadas por lo que recuperan o ahorran, con la evidencia al lado.

| # | Automatización | Evidencia | ¿Entra en el alcance? | Recomendación |
|---|---|---|---|---|
| 1 | **Autos reparados y no facturados** (orden de trabajo sin factura) | 206 siniestros con orden de trabajo; 94 tienen una factura enviada por mail. Entre las compañías que reciben la factura por mail, **28 órdenes de más de 45 días no tienen ninguna factura ni aprobación** | **No está en la spec.** Es cobranza en su primer eslabón: lo que no se facturó no se puede cobrar. No choca con el principio IX | **La más valiosa.** Antes de especificarla, revisar a mano esos 28 casos: si varios son plata sin facturar, entra como A11 |
| 2 | **Lo que las compañías piden, en una lista** (A7 de la spec) | 93 pedidos de factura, 25 de documentación y 17 observaciones a facturas. **41 siguen sin respuesta visible; 39 tienen más de 30 días.** La mayoría, Rivadavia, Mercantil, Provincia y Zurich | Sí: A7, fase 3 | Empezar **sólo por los mails automáticos**, que se reconocen casi sin error: el "¡Ya podés cargar tu factura!" de Mercantil, el "¿La unidad fue reparada?" de Rivadavia, el "siniestro habilitado" de Zurich. Los mails escritos por personas van a Revisar: las reglas por palabras acertaron 1 de cada 3 |
| 3 | **Libro de retenciones** (A10, pregunta N8) | Cada orden de pago trae de 2 a 4 retenciones con su número de certificado, y los lectores ya las leen todas: 48 de 50 PDF cierran al centavo | Sí: es una vista, y no necesita la enmienda que frena a la conciliación bancaria | **Adelantarlo a la fase 3**, como recomendaba el plan. Es crédito fiscal que hoy depende de que alguien junte los PDF |
| 4 | **Observaciones y rechazos de facturas** | 17 observaciones (monto distinto al autorizado, factura a otro CUIT, orden equivocada); LPS rechaza por su portal y avisa por mail | Casi: la spec tiene 4 tipos de acuse y ninguno es "rechazo" | Agregar el tipo **`observacion`** al acuse. Es un cambio chico en la spec, y es lo más urgente de reclamar: una factura observada no se paga nunca |
| 5 | **Plazos reales de pago por compañía** (P13) | Cada aviso trae la fecha de pago, y los comprobantes la de emisión | Sí: una vista, en la fase 3 | Hacerla cuando los avisos estén en la base. Le gana al plazo declarado, que nadie sabe de memoria |
| 6 | **La planilla de Allianz** (A6) | Desde agosto de 2026, Allianz sólo paga si se le manda un Excel con los datos de cada factura; casi todos están en el comprobante de ARCA | Sí: preparar un envío, sin mandarlo (R1) | Baja prioridad por volumen: unas 10 facturas a Allianz en 21 meses |

## Lo que se evaluó y no conviene

| Idea | Por qué no |
|---|---|
| Que el robot entre a los portales | Guardaría contraseñas (R2), los portales piden códigos por mail y captcha, Apps Script no maneja un navegador, y varias condiciones de uso lo prohíben. Lo que dice un portal lo carga una persona, o se importa un Excel bajado a mano |
| Bajar los comprobantes de ARCA solo, por su servicio web | Pide un certificado digital y un servidor que firme los pedidos. Importar el CSV a mano lleva dos minutos por mes |
| Leer los avisos de transferencia del banco | Es conciliación bancaria (A9): bloqueada por el principio IX hasta una enmienda |
| Pedidos de cotización de municipios, avisos de servicios, débitos propios | No es cobranza: son pagos a proveedores o ventas nuevas, fuera del módulo (principio IX) |
| Detectar pedidos en los mails escritos por personas con palabras clave | Medido: 37 % de precisión. Se equivoca más de lo que acierta. Esos mails van a una persona |

---

## El detalle de la #1: autos reparados y no facturados

**Cómo se mide:** una orden de trabajo (de Orión, de Mercantil, de Cooperación, de Zurich/Grant…) dice que el taller tiene un siniestro adjudicado. Una factura enviada con el asunto estándar (`factura n°… siniestro n°…`) o una aprobación de la compañía dicen que se facturó. Se cruzan por número de siniestro.

**Lo que dio:**

- 206 siniestros con orden de trabajo desde ene-2025 (116 de Orión, que empezó en dic-2025).
- 94 (46 %) cruzan con una factura enviada por mail. De la orden a la factura pasan **25 días de mediana** (entre 12 y 48).
- 72 órdenes de más de 45 días no tienen factura visible. **44 de esas son de compañías que reciben la factura por portal o formulario** (San Cristóbal, Rivadavia, La Segunda desde mediados de 2025, Provincia): el mail no puede mostrar la factura, así que ahí la alarma sería falsa.
- **Quedan 28** de compañías que reciben la factura por mail: Sancor, La Caja, Cooperación, Mercantil, Zurich, Allianz, Galicia, LPS, Río Uruguay, Segurcoop. Ésas son las que valen una mirada.

**Por qué no se puede automatizar del todo todavía:** el libro de ARCA no tiene el número de siniestro. La única unión confiable entre una orden de trabajo y una factura es el **asunto del mail de la factura**, que sí lo lleva, o la aprobación de la compañía. Para las compañías de portal, haría falta su exportación de facturas.

**Lo que haría:**

1. Que el robot sume un lector de **órdenes de trabajo** (Orión, Mercantil, Cooperación, Grant). Los formatos ya están relevados: en Orión el siniestro viene pegado a la marca del auto en el asunto, con un largo distinto por compañía, así que el lector va por compañía.
2. Con los envíos de la fase 2 (`envio`, que ya guarda el siniestro del asunto), una vista "orden de trabajo sin factura después de N días", **sólo para las compañías que reciben la factura por mail**.
3. Las de portal, cuando haya exportaciones de sus portales.

## El detalle de la #2: lo que piden las compañías

| Pedido | Mensajes | Respuesta del taller (mediana) | Sin respuesta visible |
|---|---|---|---|
| Que cargue o mande la factura | 93 (51 son el aviso automático de Mercantil) | En el día | 22 sin factura ni aprobación posterior |
| Documentación (orden firmada, CLEAS, fotos, constancias) | 25 | En el día, pero el 25 % tarda más de 6 días | 10 |
| Observación a una factura | 17 | 1 día | 9 |

**Lo que muestra:** cuando el taller contesta, contesta rápido. El problema no es la velocidad, es lo que **se pierde**. Rivadavia tiene un mismo pedido de documentación reclamado cuatro veces en cuatro meses, y hay pedidos de "cargá la factura en el portal" de hace más de un año sin rastro de respuesta.

**Cómo se cierra un pedido:** no por una respuesta en el hilo de mails, porque la respuesta real suele ser una carga en el portal, un WhatsApp o una llamada. Se cierra **por evidencia**: una factura, una aprobación o un pago del mismo siniestro. Eso es lo que la spec llama "días sin respuesta nuestra" (A7), con esta precisión.

---

## Lo que necesito que decidas

1. **¿Mirás los 28 casos de "reparado y no facturado"?** Si son plata sin facturar, la #1 pasa a la spec como A11 y va primera. La lista no está en el repo: te la pasé aparte, como archivo en la conversación.
2. **¿Agregamos el tipo `observacion` a los acuses** (#4)? Es un cambio de una línea en la spec 005, §4.3.
3. **¿Adelantamos el libro de retenciones a la fase 3** (N8)?

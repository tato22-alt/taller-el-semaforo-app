// @ts-check
/* La Segunda · el número de factura está en el asunto.
 *
 * "Envío de Retenciones Factura/s Nro. 1234". Es el mail de los certificados de retención que se
 * generan al pagar: nombra la factura (nivel N3), pero los importes están en el PDF adjunto, cuyo
 * formato todavía no vimos. Hasta tener su lector, las líneas salen sin importe. El número viene
 * sin punto de venta ni tipo. */

const VERSION_LA_SEGUNDA = 2

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerLaSegunda(mail) {
  const lector = 'la-segunda'
  const v = VERSION_LA_SEGUNDA
  const m = /Factura\/?s?\s+Nro\.?\s*([\d\s,;/y-]+)/i.exec(mail.asunto)
  if (!m) return noEntendido(lector, v, 'El asunto no tiene la forma "Envío de Retenciones Factura/s Nro. 1234".')

  const numeros = [...(m[1] ?? '').matchAll(/\d+/g)].map((n) => n[0])
  if (numeros.length === 0) return noEntendido(lector, v, 'El asunto no trae ningún número de factura.')

  return conControl({
    lector,
    version: v,
    tipo: 'retencion',
    op: null,
    fechaPago: null,
    neto: null,
    lineas: numeros.map((n) => ({ factura: { texto: n, puntoVenta: null, numero: Number(n) }, siniestro: null, bruto: null, neto: null })),
    retenciones: [],
  }, null)
}

// @ts-check
/* Río Uruguay Seguros (RUS) · el detalle está en el PDF "OrdenesDePago".
 *
 * De la orden: "Total a Pagar: $80.000,00" (lo transferido), "Factura: 1234" (sin punto de
 * venta), las fechas de emisión y de pago, y el siniestro "4:1234567". De cada certificado: su
 * título "CONSTANCIA DE RETENCIÓN: 'RETENCIÓN IVA …'", su "Nro de Certificado: 0000123456",
 * su "Total retenido 16800.00", y el importe de la factura, "FACTURA A 03/02/2026 100000.0".
 *
 * El texto del PDF sale desordenado (el total de un certificado puede aparecer antes que su
 * título), así que títulos, números y totales se juntan por orden de aparición. Si ese orden
 * fallara, el control de cierre lo detecta: bruto = neto + retenciones. (Ya pasó: el número de la
 * resolución, "RG 2854", queda pegado antes de "Total retenido"; por eso un total escrito antes
 * de esas palabras tiene que tener decimales.)
 *
 * Un PDF con más de una orden todavía no se lee: no vimos ninguno. */

const VERSION_RIO_URUGUAY = 1

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerRioUruguay(mail) {
  const lector = 'rio-uruguay'
  const v = VERSION_RIO_URUGUAY
  const t = enUnRenglon(mail.textoPdf)
  if (t === '') return noEntendido(lector, v, 'El mail no trae el PDF de la orden de pago, o no se le pudo sacar el texto.')

  const aPagar = [...t.matchAll(/Total a Pagar:? \$? ?(\d[\d.]*,\d{2})/gi)]
  if (aPagar.length === 0) return noEntendido(lector, v, 'No encontré el "Total a Pagar" de la orden.')
  if (aPagar.length > 1) return noEntendido(lector, v, `El PDF trae ${aPagar.length} órdenes de pago: todavía no sé separarlas.`)

  const factura = /Factura: ?(\d+)/.exec(t)
  if (!factura) return noEntendido(lector, v, 'La orden no nombra la factura ("Factura: 1234").')
  const bruto = /FACTURA ([A-C]) \d{2}\/\d{2}\/\d{4} (\d+(?:\.\d{1,2})?)\b/.exec(t)

  const titulos = [...t.matchAll(/CONSTANCIA DE RETENCI[OÓ]N: ?'([^']+)'/gi)].map((m) => m[1] ?? '')
  const totales = [...t.matchAll(/Total retenido (\d+(?:\.\d{1,2})?)\b|(\d+\.\d{1,2}) Total retenido/gi)].map((m) => m[1] ?? m[2] ?? '')
  const certificados = [...t.matchAll(/Nro de Certificado: ?(\d+)/gi)].map((m) => m[1] ?? '')
  if (titulos.length !== totales.length || titulos.length !== certificados.length) {
    return noEntendido(lector, v, `Encontré ${titulos.length} certificados, ${totales.length} totales retenidos y ${certificados.length} números de certificado: no sé cuál va con cuál.`)
  }

  /** @type {Retencion[]} */
  const retenciones = []
  for (let i = 0; i < titulos.length; i++) {
    const importe = aImporteConPunto(totales[i] ?? '')
    if (importe === null) return noEntendido(lector, v, `No entiendo el total retenido "${totales[i]}".`)
    const concepto = (titulos[i] ?? '').replace(/^RETENCI[OÓ]N /i, '')
    retenciones.push({ certificado: certificados[i] ?? null, concepto, impuesto: impuestoDe(concepto), importe })
  }

  const op = /PAGO (\d{5,})/.exec(t)
  const fechas = /Fecha Emisi[oó]n Fecha Pago .*?\d{2}\/\d{2}\/\d{4} (\d{2}\/\d{2}\/\d{4})/.exec(t)
  const siniestro = /Siniestro .*?(\d+:\d+) \d{2}\/\d{2}\/\d{4}/.exec(t)
  const neto = aImporte(aPagar[0]?.[1] ?? '')
  const brutoFactura = bruto ? aImporteConPunto(bruto[2] ?? '') : null

  return conControl({
    lector,
    version: v,
    tipo: 'pago',
    op: op ? (op[1] ?? null) : null,
    fechaPago: fechas ? aFecha(fechas[1] ?? '') : null,
    neto,
    lineas: [{
      factura: { texto: `${bruto ? `${bruto[1]} ` : ''}${factura[1]}`, puntoVenta: null, numero: Number(factura[1]) },
      siniestro: siniestro ? (siniestro[1] ?? null) : null,
      bruto: brutoFactura,
      neto,
    }],
    retenciones: sinRepetir(retenciones),
  }, brutoFactura)
}

// @ts-check
/* Cooperación Seguros · el detalle está en el PDF de la orden de pago. Escrito el 2026-10-23: sus órdenes
 * de pago estaban sin lector.
 *
 * El mail ("Orden de Pago Nro 123456") trae dos PDF: el comprobante de retención de Ganancias y la orden.
 * De la orden se leen:
 *   "FACT.A 0002-00001234 01/08/2026 01/09/2026 100.000,00 Sin: 123 Liq: 456"   una fila por factura
 *   "Total 100.000,00 RET.GCIAS. 2.000,00 TRF BANCO … 0000123456 01/09/2026 98.000,00"
 * El primer Total es el bruto, después las retenciones, y la transferencia con su fecha es lo neto.
 * Del comprobante de retención sale su número ("… 171482 / 2026 COMPROBANTE QUE ORIGINA"). */

const VERSION_COOPERACION = 1

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerCooperacion(mail) {
  const lector = 'cooperacion'
  const v = VERSION_COOPERACION
  const t = enUnRenglon(mail.textoPdf)
  if (t === '') return noEntendido(lector, v, 'El mail no trae el PDF de la orden de pago, o no se le pudo sacar el texto.')

  const NUM = String.raw`\d[\d.]*,\d{2}`
  const filas = [...t.matchAll(new RegExp(String.raw`([A-Z][A-Z.]*?)\.?([A-C]) (\d{4})-(\d{8}) \d{2}\/\d{2}\/\d{4} \d{2}\/\d{2}\/\d{4} (${NUM})`, 'g'))]
  if (filas.length === 0) return noEntendido(lector, v, 'No encontré las facturas de la orden de pago.')
  const otroTipo = filas.find((f) => !/^FACT/.test(f[1] ?? ''))
  if (otroTipo) return noEntendido(lector, v, `Paga un comprobante "${otroTipo[1]}": todavía no sé si suma o resta.`)

  const cierre = new RegExp(String.raw`Total (${NUM}) (.*?)(?:TRF|TRANSF\w*|CHEQUE) .*? (\d{2}\/\d{2}\/\d{4}) (${NUM})`).exec(t)
  if (!cierre) return noEntendido(lector, v, 'No encontré el total y la transferencia de la orden.')

  const certificado = /C\.U\.I\.T\. ?: ?\d{11} (\d+ ?\/ ?\d{4}) COMPROBANTE QUE ORIGINA/.exec(t)
  /** @type {Retencion[]} */
  const retenciones = []
  for (const r of (cierre[2] ?? '').matchAll(new RegExp(String.raw`RET\.\s?([A-Z][A-Z.]*?)\.? (${NUM})`, 'g'))) {
    const importe = aImporte(r[2] ?? '')
    if (importe === null || centavos(importe) === 0) continue
    const nombre = r[1] ?? ''
    retenciones.push({ certificado: null, concepto: `RET.${nombre}`, impuesto: impuestoDe(nombre), importe })
  }
  // El comprobante de retención que viene en el mail es el de Ganancias: si hay una sola, es suyo.
  const deGanancias = retenciones.filter((r) => r.impuesto === 'ganancias')
  if (certificado && deGanancias.length === 1 && deGanancias[0]) deGanancias[0].certificado = (certificado[1] ?? '').replace(/\s/g, '')

  const op = /Nro\.?\s*0*(\d+)/i.exec(mail.asunto)
  return conControl({
    lector,
    version: v,
    tipo: 'pago',
    op: op ? (op[1] ?? null) : null,
    fechaPago: aFecha(cierre[3] ?? ''),
    neto: aImporte(cierre[4] ?? ''),
    lineas: filas.map((f) => ({
      factura: { texto: `${f[1]}${f[2]} ${f[3]}-${f[4]}`, puntoVenta: Number(f[3]), numero: Number(f[4]) },
      siniestro: null,
      bruto: aImporte(f[5] ?? ''),
      neto: filas.length === 1 ? aImporte(cierre[4] ?? '') : null,
    })),
    retenciones,
  }, aImporte(cierre[1] ?? ''))
}

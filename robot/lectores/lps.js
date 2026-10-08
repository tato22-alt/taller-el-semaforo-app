// @ts-check
/* La Perseverancia Seguros (LPS) · el detalle está en el PDF de la orden de pago.
 *
 * El PDF trae la orden y, a continuación, un certificado por impuesto. De la orden se leen:
 *   "Fecha Tipo y Nro.Comprobante Imp.Cancelado Cotiz. …
 *    01/01/2026 FS - A / 00002 / 1234 100.000,00 1,0000 $"     una fila por factura, con su bruto
 *   "SUBTOTAL 100.000,00 RET.GANANCIAS 2.000,00 RET.I.V.A. … TOTAL 80.000,00"
 * SUBTOTAL es el bruto, TOTAL lo transferido, y en el medio las retenciones. Los certificados
 * repiten lo mismo con más detalle; no se leen, para no contar dos veces. */

const VERSION_LPS = 1

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerLps(mail) {
  const lector = 'lps'
  const v = VERSION_LPS
  const t = enUnRenglon(mail.textoPdf)
  if (t === '') return noEntendido(lector, v, 'El mail no trae el PDF de la orden de pago, o no se le pudo sacar el texto.')

  const filas = [...t.matchAll(/(\d{2}\/\d{2}\/\d{4}) ([A-Z]{1,3}) - ([A-C]) \/ (\d+) \/ (\d+) (\d[\d.]*,\d{2}) 1,0000/g)]
  if (filas.length === 0) return noEntendido(lector, v, 'No encontré la tabla de comprobantes cancelados.')
  const otroTipo = filas.find((f) => !(f[2] ?? '').startsWith('F'))
  if (otroTipo) return noEntendido(lector, v, `Cancela un comprobante de tipo "${otroTipo[2]}": todavía no sé si suma o resta.`)

  const cierre = /SUBTOTAL (\d[\d.]*,\d{2}) (.*?)(?<![A-Z.])TOTAL (\d[\d.]*,\d{2})/.exec(t)
  if (!cierre) return noEntendido(lector, v, 'No encontré el SUBTOTAL y el TOTAL de la orden.')

  /** @type {Retencion[]} */
  const retenciones = []
  for (const r of (cierre[2] ?? '').matchAll(/RET\.\s?([A-Z][A-Z. ]*?) (\d[\d.]*,\d{2})/g)) {
    const importe = aImporte(r[2] ?? '')
    if (importe === null || centavos(importe) === 0) continue
    const nombre = (r[1] ?? '').trim()
    retenciones.push({ certificado: null, concepto: `RET.${nombre}`, impuesto: impuestoDe(nombre), importe })
  }

  // Un número de orden todo en ceros no es un número: se busca en el PDF.
  const op = /N[uú]mero:?\s*0*([1-9]\d*)/i.exec(mail.asunto) ?? /Afectado a la OP:?\s*0*(\d+)/i.exec(t)
  const fecha = /Fecha ?: ?(\d{2}\/\d{2}\/\d{4})/.exec(t)

  return conControl({
    lector,
    version: v,
    tipo: 'pago',
    op: op ? (op[1] ?? null) : null,
    fechaPago: fecha ? aFecha(fecha[1] ?? '') : null,
    neto: aImporte(cierre[3] ?? ''),
    lineas: filas.map((f) => ({
      factura: { texto: `${f[2]} ${f[3]} ${f[4]}-${f[5]}`, puntoVenta: Number(f[4]), numero: Number(f[5]) },
      siniestro: null,
      bruto: aImporte(f[6] ?? ''),
      neto: filas.length === 1 ? aImporte(cierre[3] ?? '') : null,
    })),
    retenciones,
  }, aImporte(cierre[1] ?? ''))
}

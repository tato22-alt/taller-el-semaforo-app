// @ts-check
/* La Perseverancia Seguros (LPS) · el detalle está en el PDF de la orden de pago.
 *
 * El PDF trae la orden y, a continuación, un certificado por impuesto. De la orden se leen:
 *   "Fecha Tipo y Nro.Comprobante Imp.Cancelado Cotiz. …
 *    01/01/2026 FS - A / 00002 / 1234 100.000,00 1,0000 $"     una fila por factura, con su bruto
 *   "SUBTOTAL 100.000,00 RET.GANANCIAS 2.000,00 RET.I.V.A. … TOTAL 80.000,00"
 * SUBTOTAL es el bruto, TOTAL lo transferido, y en el medio las retenciones. Los certificados
 * repiten lo mismo con más detalle; no se leen, para no contar dos veces.
 *
 * Versión 2 (2026-10-23): desde mayo de 2026 el PDF trae la tabla de otra forma, y la versión 1 no la
 * encontraba: esas órdenes quedaban sin entender. Los espacios del comprobante cambiaron
 * ("FS -A / 00002/ 3553") y el cierre trae primero los nombres y después los importes:
 *   "SUBTOTAL RET.GANANCIAS RET.I.V.A. … RET. MEDICOS 100.000,00 2.000,00 16.800,00 … 0,00
 *    RET.TASA LOCAL 0,00 TOTAL 80.000,00"
 * Se leen las dos formas. */

const VERSION_LPS = 2

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerLps(mail) {
  const lector = 'lps'
  const v = VERSION_LPS
  const t = enUnRenglon(mail.textoPdf)
  if (t === '') return noEntendido(lector, v, 'El mail no trae el PDF de la orden de pago, o no se le pudo sacar el texto.')

  const filas = [...t.matchAll(/(\d{2}\/\d{2}\/\d{4}) ([A-Z]{1,3}) ?- ?([A-C]) ?\/ ?(\d+) ?\/ ?(\d+) (\d[\d.]*,\d{2}) 1,0000/g)]
  if (filas.length === 0) return noEntendido(lector, v, 'No encontré la tabla de comprobantes cancelados.')
  const otroTipo = filas.find((f) => !(f[2] ?? '').startsWith('F'))
  if (otroTipo) return noEntendido(lector, v, `Cancela un comprobante de tipo "${otroTipo[2]}": todavía no sé si suma o resta.`)

  const cierre = cierreLps(t)
  if (cierre === null) return noEntendido(lector, v, 'No encontré el SUBTOTAL y el TOTAL de la orden.')

  /** @type {Retencion[]} */
  const retenciones = []
  for (const [nombre, texto] of cierre.retenciones) {
    const importe = aImporte(texto)
    if (importe === null || centavos(importe) === 0) continue
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
    neto: aImporte(cierre.total),
    lineas: filas.map((f) => ({
      factura: { texto: `${f[2]} ${f[3]} ${f[4]}-${f[5]}`, puntoVenta: Number(f[4]), numero: Number(f[5]) },
      siniestro: null,
      bruto: aImporte(f[6] ?? ''),
      neto: filas.length === 1 ? aImporte(cierre.total) : null,
    })),
    retenciones,
  }, aImporte(cierre.subtotal))
}

/**
 * El cierre de la orden: el bruto (SUBTOTAL), cada retención con su nombre, y lo transferido (TOTAL).
 * Lee la forma vieja, con cada importe después de su nombre, y la nueva, con todos los nombres primero.
 * @param {string} t el PDF en un renglón
 * @returns {{ subtotal: string, retenciones: [string, string][], total: string } | null}
 */
function cierreLps(t) {
  const NUM = String.raw`\d[\d.]*,\d{2}`
  const nueva = new RegExp(String.raw`SUBTOTAL ((?:RET\.\s?[A-Z][A-Z.]* )+)((?:${NUM} ?)+)(.*?)(?<![A-Z.])TOTAL (${NUM})`).exec(t)
  if (nueva) {
    const nombres = [...(nueva[1] ?? '').matchAll(/RET\.\s?([A-Z][A-Z.]*)/g)].map((m) => m[1] ?? '')
    const importes = (nueva[2] ?? '').trim().split(' ')
    if (importes.length === nombres.length + 1) {
      /** @type {[string, string][]} */
      const retenciones = nombres.map((n, i) => [n, importes[i + 1] ?? ''])
      for (const r of (nueva[3] ?? '').matchAll(new RegExp(String.raw`RET\.\s?([A-Z][A-Z. ]*?) (${NUM})`, 'g'))) retenciones.push([(r[1] ?? '').trim(), r[2] ?? ''])
      return { subtotal: importes[0] ?? '', retenciones, total: nueva[4] ?? '' }
    }
  }
  const vieja = new RegExp(String.raw`SUBTOTAL (${NUM}) (.*?)(?<![A-Z.])TOTAL (${NUM})`).exec(t)
  if (!vieja) return null
  /** @type {[string, string][]} */
  const retenciones = [...(vieja[2] ?? '').matchAll(new RegExp(String.raw`RET\.\s?([A-Z][A-Z. ]*?) (${NUM})`, 'g'))].map((r) => [(r[1] ?? '').trim(), r[2] ?? ''])
  return { subtotal: vieja[1] ?? '', retenciones, total: vieja[3] ?? '' }
}

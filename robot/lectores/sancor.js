// @ts-check
/* Sancor Seguros · el detalle está en el PDF "Orden de Pago General".
 *
 * El mail trae la orden y, aparte, una constancia por impuesto. La orden ya tiene todo:
 *   "Factura A N°: 0002-00001234 de 01.02.2026 Us: XXX N°Stro:2001234567 60.000,00"   una por factura
 *   "Ret. IIBB Buenos Aires (Pcia.) 3.000,00- Ganancias 2 2.000,00- IVA 1 14.000,00-"  las retenciones
 *   "IMPORTE TOTAL: 80.000,00"                                                         lo transferido
 * Las constancias repiten las retenciones; no se leen, para no contar dos veces. Un mail que trae
 * sólo constancias, sin la orden, todavía no se lee. La spec avisa que Sancor puede descontar
 * notas de crédito en la orden: si aparece una, el lector no adivina el signo y lo dice. */

const VERSION_SANCOR = 1

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerSancor(mail) {
  const lector = 'sancor'
  const v = VERSION_SANCOR
  const t = enUnRenglon(mail.textoPdf)
  if (t === '') return noEntendido(lector, v, 'El mail no trae PDF, o no se les pudo sacar el texto.')

  const total = /IMPORTE TOTAL: ?(\d[\d.]*,\d{2})/.exec(t)
  if (!total) return noEntendido(lector, v, 'No encontré la "Orden de Pago General" (sólo constancias de retención, o un formato nuevo).')

  const filas = [...t.matchAll(/(Factura|Nota de Cr[eé]dito|Nota de D[eé]bito) ([A-C]) N°: ?(\d{4})-(\d{8}) de (\d{2}\.\d{2}\.\d{4}) Us: \S+ N°Stro: ?(\S+) (\d[\d.]*,\d{2})(-?)/g)]
  if (filas.length === 0) return noEntendido(lector, v, 'La orden no nombra ningún comprobante con el formato "Factura A N°: 0002-00001234".')
  const otra = filas.find((f) => f[1] !== 'Factura')
  if (otra) return noEntendido(lector, v, `La orden incluye una ${otra[1]}: todavía no sé leer cómo la descuenta.`)

  // Las retenciones van entre la última factura y el IMPORTE TOTAL, cada una terminada en "-".
  const ultima = filas[filas.length - 1]
  const desde = (ultima?.index ?? 0) + (ultima?.[0].length ?? 0)
  const tramo = t.slice(desde, total.index)
  /** @type {Retencion[]} */
  const retenciones = []
  for (const r of tramo.matchAll(/(.+?) (\d{1,3}(?:\.\d{3})*,\d{2})-/g)) {
    const concepto = (r[1] ?? '').trim()
    retenciones.push({ certificado: null, concepto, impuesto: impuestoDe(concepto), importe: aImporte(r[2] ?? '') ?? '' })
  }

  /** @type {LineaAviso[]} */
  const lineas = filas.map((f) => ({
    factura: { texto: `${f[1]} ${f[2]} ${f[3]}-${f[4]}`, puntoVenta: Number(f[3]), numero: Number(f[4]) },
    siniestro: f[6] ?? null,
    bruto: aImporte(f[7] ?? ''),
    neto: null,
  }))
  const neto = aImporte(total[1] ?? '')
  if (lineas.length === 1 && lineas[0]) lineas[0].neto = neto

  const op = /N[uú]mero: ?(\d+)/.exec(t)
  const fecha = /COMPROBANTE DE PAGO .*?Fecha: ?(\d{2}\.\d{2}\.\d{4})/.exec(t) ?? /Fecha: ?(\d{2}\.\d{2}\.\d{4})/.exec(t)

  return conControl({
    lector,
    version: v,
    tipo: 'pago',
    op: op ? (op[1] ?? null) : null,
    fechaPago: fecha ? aFecha(fecha[1] ?? '') : null,
    neto,
    lineas,
    retenciones,
  }, brutoDeLasLineas(lineas))
}

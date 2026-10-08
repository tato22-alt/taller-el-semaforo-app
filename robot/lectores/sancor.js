// @ts-check
/* Sancor Seguros · el detalle está en el PDF "Orden de Pago General".
 *
 * El mail trae la orden y, aparte, una constancia por impuesto. La orden ya tiene todo:
 *   "Factura A N°: 0002-00001234 de 01.02.2026 Us: XXX N°Stro:2001234567 60.000,00"   una por factura
 *   "Ret. IIBB Buenos Aires (Pcia.) 3.000,00- Ganancias 2 2.000,00- IVA 1 14.000,00-"  las retenciones
 *   "IMPORTE TOTAL: 80.000,00"                                                         lo transferido
 * Las constancias repiten las retenciones; no se leen, para no contar dos veces. Un mail que trae
 * sólo constancias, sin la orden, todavía no se lee. La spec avisa que Sancor puede descontar
 * notas de crédito en la orden: si aparece una, el lector no adivina el signo y lo dice.
 *
 * Versión 2, por lo que mostraron 40 PDF reales: el punto de venta viene con 4 o con 5 dígitos
 * ("0002-" o "00002-"), a veces mezclados en la misma orden; la nota de crédito se escribe "Nota
 * de crédito" y su importe puede quedar lejos de su renglón. Por eso las retenciones se reconocen
 * por su nombre, y si queda un importe con "-" sin nombre conocido, o un comprobante que no se
 * pudo leer, el lector lo dice en vez de cerrar de casualidad. */

const VERSION_SANCOR = 2

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

  const orden = t.slice(0, total.index)
  if (/Nota de (cr[eé]dito|d[eé]bito)/i.test(orden)) {
    return noEntendido(lector, v, 'La orden incluye una nota de crédito o débito: todavía no sé leer cómo la descuenta.')
  }
  const filas = [...orden.matchAll(/Factura ([A-C]) N°: ?(\d{4,5})-(\d{8}) de (\d{2}\.\d{2}\.\d{4}) Us: \S+ N°Stro: ?(\S+) (\d[\d.]*,\d{2})/g)]
  const nombradas = [...orden.matchAll(/N°: ?\d{4,5}-\d{8}/g)].length
  if (filas.length === 0) return noEntendido(lector, v, 'La orden no nombra ningún comprobante con el formato "Factura A N°: 0002-00001234".')
  if (filas.length !== nombradas) return noEntendido(lector, v, `La orden nombra ${nombradas} comprobantes y pude leer ${filas.length}.`)

  // Las retenciones van entre la última factura y el IMPORTE TOTAL, cada una terminada en "-", y se
  // reconocen por su nombre. Un importe con "-" que no sea de una retención conocida no se adivina.
  const ultima = filas[filas.length - 1]
  const tramo = orden.slice((ultima?.index ?? 0) + (ultima?.[0].length ?? 0))
  /** @type {Retencion[]} */
  const retenciones = []
  for (const r of tramo.matchAll(/(Ret\. [^\d-]+?|Ganancias(?: \d)?|IVA(?: \d)?|Seguridad Social[^\d-]*?) (\d{1,3}(?:\.\d{3})*,\d{2})-/g)) {
    const concepto = (r[1] ?? '').trim()
    retenciones.push({ certificado: null, concepto, impuesto: impuestoDe(concepto), importe: aImporte(r[2] ?? '') ?? '' })
  }
  const descuentos = [...tramo.matchAll(/\d,\d{2}-/g)].length
  if (descuentos !== retenciones.length) {
    return noEntendido(lector, v, `La orden descuenta ${descuentos} importes y reconozco ${retenciones.length} retenciones: hay algo más que no sé qué es.`)
  }

  /** @type {LineaAviso[]} */
  const lineas = filas.map((f) => ({
    factura: { texto: `Factura ${f[1]} ${f[2]}-${f[3]}`, puntoVenta: Number(f[2]), numero: Number(f[3]) },
    siniestro: f[5] ?? null,
    bruto: aImporte(f[6] ?? ''),
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

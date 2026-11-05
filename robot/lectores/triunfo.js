// @ts-check
/* Triunfo Cooperativa de Seguros · "Notificación de Pago", con dos PDF: la orden de pago y el
 * certificado de retención de Ganancias. El cuerpo del mail no dice nada: todo está en los PDF.
 *
 * De la orden de pago:
 *   "Orden de Pago Número Fecha Documento 0001-00012345 30.10.2026"
 *   una línea por factura: "7100000001 0002A00003285Factura siniestros 20.10.2026 121.000,00 1,0000 ARS 121.000,00"
 *     (el número interno del documento; el punto de venta, la letra y el número pegados; el importe
 *     en la moneda local es el último)
 *   "Total Comprobantes: 121.000,00": el bruto
 *   los conceptos: "RET. IMP. A LAS GCIAS. 7100000001 30.10.2026 ARS2.420,00" (una por retención) y
 *     "TRANSF/DEBITO BANCO … CBU:****12345 30.10.2026 ARS118.580,00": lo transferido
 *   abajo, de cada factura: "7100000001/0002A00003285 <denuncia> <siniestro> <asegurado>". Ahí el número de
 *     factura a veces se corta y sus últimas cifras pasan al renglón de abajo, pegadas a la denuncia: por
 *     eso el siniestro se busca por el número interno del documento, que llega entero.
 * Del certificado: "Nº de certificado: 0001-00000123" y "pagado el 30.10.2026".
 *
 * Visto en los cuatro avisos que llegaron, de abril de 2025 a octubre de 2026. Siempre una retención
 * de Ganancias y una sola factura; el lector lee varias, y si no cierra, el control lo dice. */

const VERSION_TRIUNFO = 1

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerTriunfo(mail) {
  const lector = 'triunfo'
  const v = VERSION_TRIUNFO
  const t = enUnRenglon(mail.textoPdf)
  if (t === '') return noEntendido(lector, v, 'El mail no trae los PDF de la orden de pago, o no se les pudo sacar el texto.')

  const orden = /Orden de Pago N[uú]mero Fecha Documento (\d{4}-\d{8}) (\d{2}\.\d{2}\.\d{4})/i.exec(t)
  if (!orden) return noEntendido(lector, v, 'No encontré el número de la orden de pago ("Orden de Pago Número …").')
  if ([...t.matchAll(/Orden de Pago N[uú]mero/gi)].length > 1) return noEntendido(lector, v, 'El PDF trae más de una orden de pago: todavía no sé separarlas.')

  const facturas = [...t.matchAll(/(\d{10}) (\d{4})([A-C])(\d{8}) ?Factura siniestros (\d{2}\.\d{2}\.\d{4}) [\d.]+,\d{2} [\d.,]+ ARS (\d[\d.]*,\d{2})/gi)]
  if (facturas.length === 0) return noEntendido(lector, v, 'La orden no trae ninguna línea "Factura siniestros": puede ser otro comprobante, y lo mira una persona.')
  const comprobantes = /Total Comprobantes: ?(\d[\d.]*,\d{2})/i.exec(t)

  // El siniestro de cada documento, en el cuadro de abajo: "<doc>/<factura> <denuncia> <siniestro>".
  /** @type {Map<string, string>} */
  const siniestros = new Map()
  for (const s of t.matchAll(/(\d{10})\/\d{4}[A-C]\d+ (\d+) (\d+)/g)) siniestros.set(s[1] ?? '', s[3] ?? '')

  const transferencias = [...t.matchAll(/TRANSF\/DEBITO.*?\d{2}\.\d{2}\.\d{4} ARS ?(\d[\d.]*,\d{2})/gi)]
  if (transferencias.length !== 1) return noEntendido(lector, v, `Encontré ${transferencias.length} transferencias en la orden: no sé cuál es lo pagado.`)
  const neto = aImporte(transferencias[0]?.[1] ?? '')

  const certificados = [...t.matchAll(/N[º°o] de certificado: ?(\d{4}-\d{8})/gi)].map((m) => m[1] ?? '')
  /** @type {Retencion[]} */
  const retenciones = []
  for (const r of t.matchAll(/(RET\. [^\d]+?) ?\d{6,} \d{2}\.\d{2}\.\d{4} ARS ?(\d[\d.]*,\d{2})/gi)) {
    const concepto = (r[1] ?? '').trim()
    retenciones.push({ certificado: null, concepto, impuesto: impuestoDe(concepto), importe: aImporte(r[2] ?? '') ?? '' })
  }
  // Un certificado por retención, en el mismo orden. Si no son tantos como las retenciones, no se adivina.
  const conCertificado = certificados.length === retenciones.length
    ? retenciones.map((r, i) => ({ ...r, certificado: certificados[i] ?? null }))
    : retenciones

  /** @type {LineaAviso[]} */
  const lineas = facturas.map((f) => ({
    factura: { texto: `${f[3]} ${f[2]}-${f[4]}`, puntoVenta: Number(f[2]), numero: Number(f[4]) },
    siniestro: siniestros.get(f[1] ?? '') ?? null,
    bruto: aImporte(f[6] ?? ''),
    neto: null,
  }))
  const primera = lineas[0]
  if (lineas.length === 1 && primera) primera.neto = neto

  const pagado = /pagado el (\d{2}\.\d{2}\.\d{4})/i.exec(t)
  return conControl({
    lector,
    version: v,
    tipo: 'pago',
    op: orden[1] ?? null,
    fechaPago: aFecha((pagado ?? orden)[pagado ? 1 : 2] ?? ''),
    neto,
    lineas,
    retenciones: conCertificado,
  }, comprobantes ? aImporte(comprobantes[1] ?? '') : brutoDeLasLineas(lineas))
}

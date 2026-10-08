// @ts-check
/* Nación Seguros · el detalle está en el PDF de la orden de pago.
 *
 * La orden tiene una tabla con una fila por comprobante, y cada fila trae todo junto:
 *   "Factura A 0002-00001234 01000000/1 01/02/2026 10,000.00                         bruto
 *    Retención Impto a las Gcias-LOCAC-NAC Cert: 0000-2026-000001 - 200.00           una por impuesto
 *    Retención IVA-GRAL-NAC Cert: 0000-2026-000003 - 1,600.00
 *    8,000.00"                                                                       neto de esa factura
 * Los certificados que vienen después repiten lo mismo; no se leen, para no contar dos veces.
 *
 * Ojo: Nación también manda "Ingreso de Factura N° X", que es un acuse y no un pago (R3). Ese
 * mail no pasa por acá: este lector sólo lee los avisos de pago (ver indice.js). */

const VERSION_NACION = 1

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerNacion(mail) {
  const lector = 'nacion'
  const v = VERSION_NACION
  const t = enUnRenglon(mail.textoPdf)
  if (t === '') return noEntendido(lector, v, 'El mail no trae el PDF de la orden de pago, o no se le pudo sacar el texto.')

  const tabla = /Bruto Neto (.*?) Total ARS/.exec(t)
  if (!tabla) return noEntendido(lector, v, 'No encontré la tabla de comprobantes de la orden.')

  const filas = (tabla[1] ?? '').split(/ (?=(?:Factura|Nota de Cr[eé]dito|Nota de D[eé]bito) [A-C] \d{4}-\d{8})/)
  /** @type {LineaAviso[]} */
  const lineas = []
  /** @type {Retencion[]} */
  const retenciones = []
  for (const fila of filas) {
    const f = /^(Factura|Nota de Cr[eé]dito|Nota de D[eé]bito) ([A-C]) (\d{4})-(\d{8}) \S+ \d{2}\/\d{2}\/\d{4} (\d[\d,]*\.\d{2})/.exec(fila)
    if (!f) return noEntendido(lector, v, `No entiendo esta fila de la orden: "${fila.slice(0, 80)}".`)
    if (f[1] !== 'Factura') return noEntendido(lector, v, `La orden incluye una ${f[1]}: todavía no sé si suma o resta.`)
    for (const r of fila.matchAll(/Retenci[oó]n (.+?) Cert: ?([\d-]+) - (\d[\d,]*\.\d{2})/g)) {
      const concepto = r[1] ?? ''
      retenciones.push({ certificado: r[2] ?? null, concepto, impuesto: impuestoDe(concepto), importe: aImporte(r[3] ?? '') ?? '' })
    }
    const montos = [...fila.matchAll(/(\d[\d,]*\.\d{2})/g)]
    lineas.push({
      factura: { texto: `${f[1]} ${f[2]} ${f[3]}-${f[4]}`, puntoVenta: Number(f[3]), numero: Number(f[4]) },
      siniestro: null,
      bruto: aImporte(f[5] ?? ''),
      neto: aImporte(montos[montos.length - 1]?.[1] ?? ''),
    })
  }
  if (retenciones.some((r) => r.importe === '')) return noEntendido(lector, v, 'No entiendo el importe de alguna retención.')

  const neto = /Importe Moneda Pago ?: ?(\d[\d,]*\.\d{2})/.exec(t)
  const op = /Orden de Pago Nro\.? ?: ?(\d+)/.exec(t)
  const fecha = /Datos del Pago .*?(\d{2}\/\d{2}\/\d{4})/.exec(t)

  return conControl({
    lector,
    version: v,
    tipo: 'pago',
    op: op ? (op[1] ?? null) : null,
    fechaPago: fecha ? aFecha(fecha[1] ?? '') : null,
    neto: neto ? aImporte(neto[1] ?? '') : null,
    lineas,
    retenciones,
  }, brutoDeLasLineas(lineas))
}

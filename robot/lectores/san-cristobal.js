// @ts-check
/* San Cristóbal · el detalle está en el PDF, que imprime cada cosa dos veces (original y copia).
 *
 * Tiene dos formatos de recibo, y en los dos los certificados de retención son iguales:
 *
 *  · El de indemnización (el más nuevo): "O.Pago: 1020260203", "Certificado Stro. … Importe Neto
 *    05-01-12345678 5012345678 … (00000001) 80 000,00" (póliza, siniestro y neto, con los miles
 *    separados por espacio). No trae factura ni bruto: es la regla propia de San Cristóbal (spec
 *    §5.3). La línea sale con el siniestro y sin factura; atribuirla por importe (base + IVA =
 *    total de la factura) es una SUGERENCIA N5 que decide una persona, no el lector.
 *
 *  · El "Recibo de Pago" a proveedor: "O.P: 1020260203 … Detalle de Facturas … Factura
 *    00002A00001234 100 000,00 … Total 80 000,00 … Importe Bruto 100 000,00". Trae la factura y
 *    el bruto, así que se controla el cierre.
 *
 * Los certificados: los de AFIP (SICORE), "Certificado Nro.: 0000 - 2026 - 00001 … Concepto:
 * Ganancias Regimen: 094 … Monto de la Retención: **2 000,00", y la constancia de Ingresos
 * Brutos, "Total Retenido-Percibido". Como todo sale dos veces, se cuentan una vez por número. */

const VERSION_SAN_CRISTOBAL = 1
const IMPORTE_SC = '(\\d{1,3}(?: \\d{3})*,\\d{2})'

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerSanCristobal(mail) {
  const lector = 'san-cristobal'
  const v = VERSION_SAN_CRISTOBAL
  const t = enUnRenglon(mail.textoPdf)
  if (t === '') return noEntendido(lector, v, 'El mail no trae el PDF del recibo, o no se le pudo sacar el texto.')

  const retenciones = retencionesSanCristobal(t)
  if (retenciones === null) return noEntendido(lector, v, 'No entiendo el importe de alguna retención.')
  const op = /O\.\s?P(?:ago)?: ?(\d+)/.exec(t)
  const fecha = /Pago: ?(\d{2}\/\d{2}\/\d{4})/.exec(t) ?? /Fecha: ?(\d{2}\/\d{2}\/\d{4})/.exec(t)
  const comun = { lector, version: v, tipo: /** @type {const} */ ('pago'), op: op ? (op[1] ?? null) : null, fechaPago: fecha ? aFecha(fecha[1] ?? '') : null, retenciones }

  // "Recibo de Pago" a proveedor: con facturas y bruto.
  if (/Detalle de Facturas/.test(t)) {
    const vistas = new Map()
    for (const f of t.matchAll(new RegExp(`Factura (\\d{4,5}) ?([A-C]) ?(\\d{8}) ${IMPORTE_SC}`, 'g'))) vistas.set(f[0], f)
    if (vistas.size === 0) return noEntendido(lector, v, 'El recibo tiene "Detalle de Facturas" pero no encontré ninguna factura.')
    const total = new RegExp(`\\bTotal ${IMPORTE_SC}`).exec(t)
    const bruto = new RegExp(`Importe Bruto ${IMPORTE_SC}`).exec(t)
    if (!total || !bruto) return noEntendido(lector, v, 'No encontré el Total o el Importe Bruto del recibo.')
    const neto = aImporte(total[1] ?? '')
    const facturas = [...vistas.values()]
    return conControl({
      ...comun,
      neto,
      lineas: facturas.map((f) => ({
        factura: { texto: `Factura ${f[1]}${f[2]}${f[3]}`, puntoVenta: Number(f[1]), numero: Number(f[3]) },
        siniestro: null,
        bruto: aImporte(f[4] ?? ''),
        neto: facturas.length === 1 ? neto : null,
      })),
    }, aImporte(bruto[1] ?? ''))
  }

  // Recibo de indemnización: siniestro y neto, sin bruto.
  const recibos = [...t.matchAll(new RegExp(`Importe Neto (\\S+) (\\d+) .*?\\(\\d+\\) ${IMPORTE_SC}`, 'g'))]
  if (recibos.length === 0) return noEntendido(lector, v, 'No encontré ni el detalle de facturas ni el siniestro con su importe neto.')
  const distintos = new Set(recibos.map((r) => `${r[2]}|${r[3]}`))
  if (distintos.size > 1) return noEntendido(lector, v, `El PDF trae ${distintos.size} recibos distintos: todavía no sé separarlos.`)
  const recibo = recibos[0]
  const factura = /Factura:? ?(\d{4,5}) ?([A-C]) ?(\d{8})/i.exec(t)
  const neto = aImporte(recibo?.[3] ?? '')
  return conControl({
    ...comun,
    neto,
    lineas: [{
      factura: factura ? { texto: factura[0], puntoVenta: Number(factura[1]), numero: Number(factura[3]) } : null,
      siniestro: recibo?.[2] ?? null,
      bruto: null,
      neto,
    }],
  }, null)
}

/**
 * Los certificados de San Cristóbal, contados una vez cada uno.
 * @param {string} t el texto del PDF en un renglón
 * @returns {Retencion[] | null} null si algún importe no se entiende
 */
function retencionesSanCristobal(t) {
  /** @type {Retencion[]} */
  const retenciones = []
  for (const r of t.matchAll(new RegExp(`Certificado Nro\\.: (\\d+ - \\d+ - \\d+)(?: Certificado Nro\\.: [\\d -]+?)? Fecha: .*?Concepto: ([^:]+?) Regimen: (\\d+).*?Monto de la Retenci[oó]n: \\**${IMPORTE_SC}`, 'g'))) {
    const concepto = `${r[2] ?? ''} (régimen ${r[3] ?? ''})`
    retenciones.push({ certificado: (r[1] ?? '').replace(/ /g, ''), concepto, impuesto: impuestoDe(concepto), importe: aImporte(r[4] ?? '') ?? '' })
  }
  const iibb = new RegExp(`Total Retenido-Percibido ${IMPORTE_SC}`).exec(t)
  if (iibb) {
    const constancia = /N[uú]mero Constancia .*?(\d{6,} - \d+ - \d+)/.exec(t)
    retenciones.push({
      certificado: constancia ? (constancia[1] ?? '').replace(/ /g, '') : null,
      concepto: 'Ingresos Brutos',
      impuesto: 'iibb',
      importe: aImporte(iibb[1] ?? '') ?? '',
    })
  }
  return retenciones.some((r) => r.importe === '') ? null : sinRepetir(retenciones)
}

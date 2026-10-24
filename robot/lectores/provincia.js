// @ts-check
/* Provincia Seguros · el detalle está en el PDF de la orden de pago. Escrito el 2026-10-23: sus órdenes
 * de pago estaban sin lector.
 *
 * El mail ("Ordenes de pagos y certificados de retencion") trae un PDF con la orden y un certificado por
 * impuesto. Los importes van con coma de miles y punto decimal ("2,315,842.00"). De la orden se leen:
 *   "Informacion del Pago 13-OCT-2026" y "Número de Orden 3728707"
 *   por factura: "E0002-00001234 FC A 26-SEP-2026 … 100,000.00 100,000.00 GCIAS_SERVICIOS
 *                 IB_BSAS_PG_SERV IVA_RG_4569_80 SUSS_RG 1784 (1,600.00) (2,900.00) (13,900.00) (800.00) …"
 *   y al final "Importe Total Pagado: 80,800.00".
 * Cada importe sale dos veces (la columna de la factura y la del pago): se toma el primero. El bruto de
 * cada factura es su primer importe sin paréntesis; las retenciones, los primeros importes entre
 * paréntesis, uno por cada nombre de impuesto. Si dos facturas van en la misma orden, las retenciones
 * del mismo impuesto se juntan en una, que es la que tiene certificado:
 *   "Certificado de Retencion Ingresos Brutos Buenos Aires Numero de Certificado 645194". */

const VERSION_PROVINCIA = 1

const MESES_PROVINCIA = { ENE: '01', FEB: '02', MAR: '03', ABR: '04', MAY: '05', JUN: '06', JUL: '07', AGO: '08', SEP: '09', OCT: '10', NOV: '11', DIC: '12' }

/**
 * "13-OCT-2026" → "2026-10-13".
 * @param {string} texto
 * @returns {string | null}
 */
function fechaProvincia(texto) {
  const m = /^(\d{2})-([A-Z]{3})-(\d{4})$/.exec(texto)
  const mes = m ? MESES_PROVINCIA[/** @type {keyof typeof MESES_PROVINCIA} */ (m[2] ?? '')] : undefined
  return m && mes ? `${m[3]}-${mes}-${m[1]}` : null
}

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerProvincia(mail) {
  const lector = 'provincia'
  const v = VERSION_PROVINCIA
  const t = enUnRenglon(mail.textoPdf)
  if (t === '') return noEntendido(lector, v, 'El mail no trae el PDF de la orden de pago, o no se le pudo sacar el texto.')

  const desde = t.indexOf('Número de Factura')
  const hasta = t.indexOf('Importe Total Pagado:')
  if (desde < 0 || hasta < desde) return noEntendido(lector, v, 'No encontré la tabla de facturas de la orden de pago.')
  const tabla = t.slice(desde, hasta)
  const neto = /Importe Total Pagado: (\d{1,3}(?:,\d{3})*\.\d{2})/.exec(t)

  const marcas = [...tabla.matchAll(/E?(\d{4,5})-(\d{8}) ([A-Z]{2}) ([A-C])/g)]
  if (marcas.length === 0) return noEntendido(lector, v, 'No encontré ninguna factura en la orden de pago.')
  const otroTipo = marcas.find((m) => m[3] !== 'FC')
  if (otroTipo) return noEntendido(lector, v, `Paga un comprobante "${otroTipo[3]}": todavía no sé si suma o resta.`)

  const IMPORTE = /\d{1,3}(?:,\d{3})*\.\d{2}/
  /** @type {LineaAviso[]} */
  const lineas = []
  /** @type {Map<Impuesto, { concepto: string, centavos: number }>} */
  const porImpuesto = new Map()
  for (const [i, m] of marcas.entries()) {
    const tramo = tabla.slice((m.index ?? 0) + m[0].length, marcas[i + 1]?.index ?? tabla.length)
    const bruto = new RegExp(String.raw`(?<!\()\b(${IMPORTE.source})\b(?!\))`).exec(tramo)
    if (!bruto) return noEntendido(lector, v, `No encontré el importe de la factura ${m[1]}-${m[2]}.`)
    lineas.push({
      factura: { texto: `${m[3]} ${m[4]} ${m[1]}-${m[2]}`, puntoVenta: Number(m[1]), numero: Number(m[2]) },
      siniestro: null,
      bruto: aImporteConComa(bruto[1] ?? ''),
      neto: null,
    })
    const nombres = [...tramo.matchAll(/\b(GCIAS\w*|IB_\w+|IVA_\w+|SUSS_RG \d+)/g)].map((n) => n[1] ?? '')
    const retenidos = [...tramo.matchAll(new RegExp(String.raw`\((${IMPORTE.source})\)`, 'g'))].map((r) => r[1] ?? '')
    if (retenidos.length < nombres.length) return noEntendido(lector, v, `Las retenciones de la factura ${m[1]}-${m[2]} no tienen su importe.`)
    for (const [j, nombre] of nombres.entries()) {
      const importe = aImporteConComa(retenidos[j] ?? '')
      if (importe === null) continue
      const impuesto = impuestoProvincia(nombre)
      const antes = porImpuesto.get(impuesto)
      porImpuesto.set(impuesto, { concepto: antes?.concepto ?? nombre, centavos: (antes?.centavos ?? 0) + centavos(importe) })
    }
  }

  /** @type {Map<Impuesto, string>} */
  const certificados = new Map([...t.matchAll(/(Ingresos Brutos|SUSS|IVA|Ganancias)\b.{0,60}?Numero de Certificado (\d+)/g)]
    .map((c) => /** @type {[Impuesto, string]} */ ([impuestoDe(c[1] ?? ''), c[2] ?? ''])))
  /** @type {Retencion[]} */
  const retenciones = [...porImpuesto.entries()]
    .filter(([, r]) => r.centavos > 0)
    .map(([impuesto, r]) => ({ certificado: certificados.get(impuesto) ?? null, concepto: r.concepto, impuesto, importe: (r.centavos / 100).toFixed(2) }))

  const netoTexto = neto ? aImporteConComa(neto[1] ?? '') : null
  if (lineas.length === 1 && lineas[0]) lineas[0] = { ...lineas[0], neto: netoTexto }
  const op = /Número de Orden (\d+)/.exec(t)
  const fecha = /Informacion del Pago (\d{2}-[A-Z]{3}-\d{4})/.exec(t)
  return conControl({
    lector,
    version: v,
    tipo: 'pago',
    op: op ? (op[1] ?? null) : null,
    fechaPago: fecha ? fechaProvincia(fecha[1] ?? '') : null,
    neto: netoTexto,
    lineas,
    retenciones,
  }, brutoDeLasLineas(lineas))
}

/**
 * Cómo nombra Provincia cada impuesto en la tabla: GCIAS_SERVICIOS, IB_BSAS_PG_SERV, IVA_RG_4569_80, SUSS_RG 1784.
 * @param {string} nombre
 * @returns {Impuesto}
 */
function impuestoProvincia(nombre) {
  if (/^IB_/.test(nombre)) return 'iibb'
  return impuestoDe(nombre.replace(/_/g, ' '))
}

/**
 * "2,315,842.00" → "2315842.00": coma de miles, punto decimal.
 * @param {string} texto
 * @returns {string | null}
 */
function aImporteConComa(texto) {
  return /^\d{1,3}(?:,\d{3})*\.\d{2}$/.test(texto) ? aImporteConPunto(texto.replace(/,/g, '')) : null
}

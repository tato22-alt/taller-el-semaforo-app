// @ts-check
/* La factura de ARCA, para armar el mail con que se manda (spec 016 de semaforo-base).
 *
 * El PDF es el de "Comprobantes en línea", pasado a texto por el mismo camino que los avisos (Drive).
 * Trae la factura tres veces (ORIGINAL, DUPLICADO, TRIPLICADO) y, en cada una:
 *   "COD. 01" (01 es Factura A; 06, Factura B; 201, Factura de Crédito Electrónica MiPyME A)
 *   "Punto de Venta: 00002 Comp. Nro: 00003285"
 *   "CUIT: 30111111111" dos veces: primero el del taller, después el de la compañía
 *   el detalle, con "SINIESTRO N° …" escrito por el taller
 *   "Importe Neto Gravado: $ 100000,00" e "Importe Total: $ 121000,00"
 *
 * Acá no se decide nada: se lee. Qué CUIT es el de la compañía, si el siniestro es el de la orden y
 * si la factura cierra, lo decide la base (fn_robot_controla_factura). Lo que no se encuentra va nulo. */

/** El código de ARCA de cada tipo de factura, y la letra con que el taller la nombra en el mail. */
const LETRA_DEL_CODIGO = { 1: 'A', 6: 'B', 11: 'C', 201: 'A', 206: 'B', 211: 'C' }

/**
 * @typedef {{ puntoVenta: number | null, numero: number | null, cuits: string[], neto: string | null,
 *             total: string | null, letra: string | null, siniestros: string[] }} FacturaLeida
 */

/**
 * @param {string} texto el texto del PDF
 * @returns {FacturaLeida}
 */
function leerFacturaArca(texto) {
  const t = enUnRenglon(texto)
  const comprobante = /Punto de Venta:?\s*(\d{1,5})\s*Comp\.?\s*Nro:?\s*(\d{1,8})/i.exec(t)
  const codigo = /\bCOD\.?\s*(\d{1,3})\b/.exec(t)
  const letra = codigo ? /** @type {Record<string, string>} */ (LETRA_DEL_CODIGO)[String(Number(codigo[1]))] ?? null : null
  const neto = /Importe Neto Gravado:?\s*\$?\s*(\d[\d.,]*)/i.exec(t)
  const total = /Importe Total:?\s*\$?\s*(\d[\d.,]*)/i.exec(t)
  return {
    puntoVenta: comprobante ? Number(comprobante[1]) : null,
    numero: comprobante ? Number(comprobante[2]) : null,
    // Con o sin guiones ("30-11111111-1"), y cada uno una vez, en el orden en que aparecen.
    cuits: sinRepetidos([...t.matchAll(/CUIT:?\s*(\d{2})-?(\d{8})-?(\d)\b/gi)].map((m) => `${m[1]}${m[2]}${m[3]}`)),
    neto: neto ? aImporte(neto[1] ?? '') : null,
    total: total ? aImporte(total[1] ?? '') : null,
    letra,
    // Lo que el taller escribió después de "siniestro": "SINIESTRO N° 900000001", "Siniestro: 12345/26".
    siniestros: sinRepetidos([...t.matchAll(/siniestro\s*(?:n(?:ro)?\s*[°º.]?|[°º])?\s*:?\s*([A-Za-z0-9][A-Za-z0-9/-]*)/gi)]
      .map((m) => (m[1] ?? '').replace(/[-/]+$/, ''))
      .filter((s) => /\d/.test(s))),
  }
}

/**
 * @param {string[]} lista
 * @returns {string[]}
 */
function sinRepetidos(lista) {
  return lista.filter((x, i) => lista.indexOf(x) === i)
}

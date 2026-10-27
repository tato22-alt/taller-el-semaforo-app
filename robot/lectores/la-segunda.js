// @ts-check
/* La Segunda · el número de factura está en el asunto, y las retenciones en el PDF.
 *
 * "Envío de Retenciones Factura/s Nro. 1234". Es el mail de los certificados de retención que se
 * generan al pagar: nombra la factura (nivel N3). El número viene sin punto de venta ni tipo.
 *
 * Versión 3 (spec 014): lee las retenciones del PDF. Trae un certificado por impuesto, separados por
 * una raya de guiones, y el nombre de cada uno va ANTES de su raya, al final del certificado anterior:
 *   RETENCION I.V.A.
 *   -----------------------------
 *   00-0001-123456            el número de certificado
 *   15/10/2026                la fecha
 *   … la compañía, el taller, sus domicilios y CUIT …
 *   FACTURA 1234
 *   500000.00                 la base: el total de la factura
 *   69421.49                  lo retenido
 *   OP. Nº 1234567
 *   RETENCION GANANCIAS       el nombre del certificado que sigue
 * Los importes van con punto decimal y sin miles. El PDF no dice lo que se transfirió: el bruto y el
 * neto de los renglones quedan nulos, como en la versión 2. Sin texto de PDF, se lee sólo el asunto;
 * con texto que no tiene esa forma, el lector lo dice. */

const VERSION_LA_SEGUNDA = 3

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerLaSegunda(mail) {
  const lector = 'la-segunda'
  const v = VERSION_LA_SEGUNDA
  const m = /Factura\/?s?\s+Nro\.?\s*([\d\s,;/y-]+)/i.exec(mail.asunto)
  if (!m) return noEntendido(lector, v, 'El asunto no tiene la forma "Envío de Retenciones Factura/s Nro. 1234".')

  const numeros = [...(m[1] ?? '').matchAll(/\d+/g)].map((n) => n[0])
  if (numeros.length === 0) return noEntendido(lector, v, 'El asunto no trae ningún número de factura.')

  const certificados = certificadosLaSegunda(mail.textoPdf)
  if (typeof certificados === 'string') return noEntendido(lector, v, certificados)

  const ops = [...new Set(certificados.map((c) => c.op))]
  return conControl({
    lector,
    version: v,
    tipo: 'retencion',
    op: ops.length === 1 ? (ops[0] ?? null) : null,
    fechaPago: certificados[0]?.fecha ?? null,
    neto: null,
    lineas: numeros.map((n) => ({ factura: { texto: n, puntoVenta: null, numero: Number(n) }, siniestro: null, bruto: null, neto: null })),
    retenciones: sinRepetir(certificados.map((c) => c.retencion)),
  }, null)
}

/**
 * Los certificados del PDF, o por qué no se pudieron leer. Sin texto de PDF, ninguno.
 * @param {string} textoPdf
 * @returns {{ retencion: Retencion, fecha: string | null, op: string }[] | string}
 */
function certificadosLaSegunda(textoPdf) {
  if (textoPdf.trim() === '') return []
  const partes = textoPdf.split(/-{10,}/)
  if (partes.length < 2) return 'El PDF no tiene la forma de los certificados de La Segunda (no hay rayas entre certificados).'
  /** @type {{ retencion: Retencion, fecha: string | null, op: string }[]} */
  const certificados = []
  for (let i = 1; i < partes.length; i++) {
    // El nombre es lo que queda después del renglón "OP. Nº" del certificado anterior (sin la marca con
    // que el robot junta dos PDF del mismo mail).
    const anterior = (partes[i - 1] ?? '').replace(/-+\s*siguiente PDF\s*-+/gi, ' ')
    const fin = [...anterior.matchAll(/OP\.?\s*N[º°o]?\.?\s*\d+/gi)].pop()
    const concepto = enUnRenglon(fin === undefined ? anterior : anterior.slice((fin.index ?? 0) + fin[0].length))
    const bloque = partes[i] ?? ''
    // El número de certificado es el primer renglón después de la raya: si no está ahí, no se busca más
    // abajo, donde hay CUIT con la misma forma.
    const primero = bloque.split(/\r?\n/).map((r) => r.trim()).find((r) => r !== '') ?? ''
    const certificado = /^(\d+-\d+-\d+)$/.exec(primero)
    const fecha = /\b(\d{2}\/\d{2}\/\d{4})\b/.exec(bloque)
    const factura = /FACTURA\s+(\d+)\s+(\d+(?:\.\d{1,2})?)\s+(\d+(?:\.\d{1,2})?)\s+OP\.?\s*N[º°o]?\.?\s*(\d+)/i.exec(enUnRenglon(bloque))
    if (concepto === '' || !certificado || !factura) {
      return `No pude leer el certificado ${i} del PDF: le falta el nombre, el número o el renglón "FACTURA … OP. Nº …".`
    }
    if ((bloque.match(/FACTURA\s+\d+/gi) ?? []).length > 1) {
      return `El certificado ${i} nombra más de una factura: todavía no sé leer cómo reparte lo retenido.`
    }
    const importe = aImporteConPunto(factura[3] ?? '')
    if (importe === null) return `No entiendo el importe retenido del certificado ${i}.`
    certificados.push({
      retencion: { certificado: certificado[1] ?? null, concepto, impuesto: impuestoDe(concepto), importe },
      fecha: fecha ? aFecha(fecha[1] ?? '') : null,
      op: factura[4] ?? '',
    })
  }
  return certificados
}

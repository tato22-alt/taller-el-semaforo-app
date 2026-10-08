// @ts-check
/* Federación Patronal · todo está en el cuerpo del mail, no hay PDF.
 *
 * "…con fecha 03-02-2026 hemos cursado una transferencia … por un importe de $ 1,234,567.89
 *  correspondiente al pago del egreso nro. 1000001 de la/s factura/s: Fac 2-1234 y que…"
 * y después, si hubo, una tabla de retenciones: "100001 Ret. Ganancias 20,000.10".
 *
 * El importe es lo transferido, ya descontadas las retenciones. El mail no trae el bruto, así que
 * no hay control de cierre. Un egreso puede pagar varias facturas, y entonces no dice cuánto de
 * cada una: las líneas quedan sin importe. */

const VERSION_FED_PATRONAL = 2

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerFedPatronal(mail) {
  const lector = 'fed-patronal'
  const v = VERSION_FED_PATRONAL
  const cuerpo = mail.cuerpo.replace(/\s+/g, ' ')

  const fecha = /con fecha (\d{2}-\d{2}-\d{4})/i.exec(cuerpo)
  const importe = /importe de \$\s*([\d.,]+\d)/i.exec(cuerpo)
  const egreso = /egreso nro\.?\s*(\d+)/i.exec(cuerpo)
  const tramo = /factura\/?s?:(.*?)(?: y que |$)/i.exec(cuerpo)
  if (!fecha || !importe || !tramo) return noEntendido(lector, v, 'No encontré la fecha, el importe o la lista de facturas.')

  const facturas = [...(tramo[1] ?? '').matchAll(/Fac\.?\s*(\d+)\s*-\s*(\d+)/gi)].map((m) => ({
    texto: m[0].trim(),
    puntoVenta: Number(m[1]),
    numero: Number(m[2]),
  }))
  if (facturas.length === 0) return noEntendido(lector, v, 'El mail no nombra ninguna factura con el formato "Fac 2-1234".')

  const neto = aImporte(importe[1] ?? '')
  if (neto === null) return noEntendido(lector, v, `No entiendo el importe "${importe[1]}".`)

  // La tabla de retenciones: los renglones que siguen al encabezado "… MONTO RETENIDO", hasta el
  // primero que no tenga la forma "certificado concepto importe".
  /** @type {Retencion[]} */
  const retenciones = []
  const renglones = mail.cuerpo.split(/\r?\n/)
  const encabezado = renglones.findIndex((r) => /monto retenido/i.test(r))
  for (const renglon of encabezado < 0 ? [] : renglones.slice(encabezado + 1)) {
    const r = /^\s*(\d+)\s+(.*?)\s+([\d.,]+\d)\s*$/.exec(renglon)
    if (!r) break
    const monto = aImporte(r[3] ?? '')
    if (monto === null) return noEntendido(lector, v, `No entiendo el importe de la retención "${renglon.trim()}".`)
    const concepto = (r[2] ?? '').trim()
    retenciones.push({ certificado: r[1] ?? null, concepto, impuesto: impuestoDe(concepto), importe: monto })
  }

  return conControl({
    lector,
    version: v,
    tipo: 'pago',
    op: egreso ? (egreso[1] ?? null) : null,
    fechaPago: aFecha(fecha[1] ?? ''),
    neto,
    // Con una sola factura, lo transferido es de ella. Con varias, el mail no lo reparte y acá
    // tampoco.
    lineas: facturas.map((factura) => ({ factura, siniestro: null, bruto: null, neto: facturas.length === 1 ? neto : null })),
    retenciones,
  }, null)
}

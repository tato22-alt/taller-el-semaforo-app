// @ts-check
/* Galicia Seguros (y SURA, que es la misma compañía) · el aviso está en el cuerpo del mail.
 *
 * Asunto: "Seguros Galicia – Información de Pago OP 170001234" (o "SURA – … OP 1700001234 …").
 * Cuerpo: "Se acredita dentro de las 48Hs en su cuenta: $ 125.000,00
 *          Correspondientes a las facturas detalladas a continuación:
 *          00002A00001234 del 05/06/2026"                              una por factura
 * o, en vez de las facturas, "Correspondientes a la siguiente Orden de Pago: 1700001234", y el
 * detalle en el PDF adjunto, cuyo formato todavía no vimos. Ese caso queda `no_entendido`, con el
 * importe a la vista en el cuerpo guardado. El mail no trae el bruto ni las retenciones. */

const VERSION_GALICIA = 1

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerGalicia(mail) {
  const lector = 'galicia'
  const v = VERSION_GALICIA
  const cuerpo = mail.cuerpo.replace(/\s+/g, ' ')
  const importe = /en su cuenta: ?\$ ?(\d[\d.,]*\d)/i.exec(cuerpo)
  if (!importe) return noEntendido(lector, v, 'No encontré el importe ("en su cuenta: $ …").')
  const neto = aImporte(importe[1] ?? '')
  if (neto === null) return noEntendido(lector, v, `No entiendo el importe "${importe[1]}".`)

  const facturas = [...cuerpo.matchAll(/(\d{4,5}) ?([A-C]) ?(\d{8}) del (\d{2}\/\d{2}\/\d{4})/g)]
  if (facturas.length === 0) {
    return noEntendido(lector, v, 'El mail no nombra las facturas: están en el PDF adjunto, que todavía no sé leer.')
  }
  const op = /OP:? ?(\d+)/i.exec(mail.asunto)
  const generado = /Generaci[oó]n autom[aá]tica del (\d{1,2}) (\w+) de (\d{4})/i.exec(cuerpo)

  return conControl({
    lector,
    version: v,
    tipo: 'pago',
    op: op ? (op[1] ?? null) : null,
    // El mail dice cuándo se generó el aviso, no el día exacto de la acreditación: no se inventa.
    fechaPago: generado ? fechaConMes(generado[1] ?? '', generado[2] ?? '', generado[3] ?? '') : null,
    neto,
    lineas: facturas.map((f) => ({
      factura: { texto: `${f[1]}${f[2]}${f[3]}`, puntoVenta: Number(f[1]), numero: Number(f[3]) },
      siniestro: null,
      bruto: null,
      neto: facturas.length === 1 ? neto : null,
    })),
    retenciones: [],
  }, null)
}

/**
 * "8", "Junio", "2026" → "2026-06-08".
 * @param {string} dia
 * @param {string} mes
 * @param {string} anio
 * @returns {string | null}
 */
function fechaConMes(dia, mes, anio) {
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const m = meses.indexOf(mes.toLowerCase().replace('setiembre', 'septiembre')) + 1
  if (m === 0) return null
  return `${anio}-${String(m).padStart(2, '0')}-${dia.padStart(2, '0')}`
}

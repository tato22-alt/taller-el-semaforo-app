// @ts-check
/* Lo que el robot le manda a la base por cada aviso: el mail como está en la planilla y lo que dice
 * su lector. Fase 2 de cobranzas (plan-fase-2.md en semaforo-base).
 *
 * Es una función pura, como los lectores: se testea sin Google. La base (fn_robot_guarda_aviso)
 * recibe esto entero y decide qué hacer; acá sólo se vuelve a leer el mail con los lectores de hoy y
 * se deja todo con la forma que la base entiende: fechas aaaa-mm-dd, importes como texto con punto
 * decimal, y vacíos como null. Lo que no tiene esa forma no se manda roto: el aviso va como
 * no_entendido, con el motivo, y una persona lo ve en Revisar. */

/** Las columnas de la pestaña "avisos", en su orden (barrido.js, COLUMNAS.avisos). */
const COL_AVISO = { id: 0, fecha: 1, remitente: 2, asunto: 3, cuerpo: 4, pdfs: 5, textoPdf: 6, pdfsDrive: 12, base: 13 }

/**
 * @typedef {{
 *   id: string, fecha: string, remitente: string, asunto: string, cuerpo: string, textoPdf: string,
 *   pdfs: string[], pdfsDrive: string[], leido: AvisoLeido | AcuseLeido | AvisoNoLeido
 * }} AvisoParaLaBase
 */

/**
 * Un renglón de la pestaña "avisos" → lo que se le manda a fn_robot_guarda_aviso.
 * @param {readonly unknown[]} fila
 * @returns {AvisoParaLaBase}
 */
function avisoParaLaBase(fila) {
  const texto = (/** @type {number} */ i) => {
    const v = fila[i]
    return v === null || v === undefined ? '' : String(v)
  }
  const lista = (/** @type {number} */ i) => texto(i).split('\n').map((x) => x.trim()).filter((x) => x !== '')
  const mail = { remitente: texto(COL_AVISO.remitente), asunto: texto(COL_AVISO.asunto), cuerpo: texto(COL_AVISO.cuerpo),
    textoPdf: texto(COL_AVISO.textoPdf), adjuntos: lista(COL_AVISO.pdfs), copia: '' }
  return {
    id: texto(COL_AVISO.id),
    fecha: texto(COL_AVISO.fecha),
    remitente: mail.remitente,
    asunto: mail.asunto,
    // Otra vez sin claves: una fila vieja de la planilla puede traer una que la regla de antes no tapó.
    cuerpo: paraGuardar(mail.cuerpo),
    textoPdf: paraGuardar(mail.textoPdf),
    pdfs: mail.adjuntos,
    pdfsDrive: lista(COL_AVISO.pdfsDrive),
    leido: conFormaDeLaBase(leerAviso(mail)),
  }
}

/**
 * Lo leído, con fechas e importes revisados. Si algo no tiene la forma que guarda la base, el aviso
 * pasa a no_entendido: mejor a la vista que perdido en un error de la subida.
 * @param {AvisoLeido | AcuseLeido | AvisoNoLeido} leido
 * @returns {AvisoLeido | AcuseLeido | AvisoNoLeido}
 */
function conFormaDeLaBase(leido) {
  /** @type {string[]} */
  const problemas = []
  const fecha = (/** @type {string | null} */ f, /** @type {string} */ que) => {
    if (f === null || f === '') return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(f)) return f
    problemas.push(`${que} "${f}" no es una fecha`)
    return null
  }
  const importe = (/** @type {string | null} */ i, /** @type {string} */ que) => {
    if (i === null || i === '') return null
    if (/^\d+(\.\d{1,2})?$/.test(i)) return i
    problemas.push(`${que} "${i}" no es un importe`)
    return null
  }

  if (leido.estado === 'acuse') {
    const a = { ...leido, monto: importe(leido.monto, 'el monto'), fechaPrometida: fecha(leido.fechaPrometida, 'la fecha prometida') }
    return problemas.length === 0 ? a : noEntendido(leido.lector, leido.version, `Acuse con ${problemas.join('; ')}.`)
  }
  if (leido.estado !== 'leido' && leido.estado !== 'no_cierra') return leido

  const lineas = leido.lineas.map((l) => ({ ...l, bruto: importe(l.bruto, 'el bruto'), neto: importe(l.neto, 'el neto') }))
  const retenciones = leido.retenciones.map((r) => {
    if (r.importe === '') problemas.push(`la retención "${r.concepto}" no tiene un importe legible`)
    return { ...r, importe: importe(r.importe, `la retención "${r.concepto}"`) ?? '' }
  })
  const a = { ...leido, fechaPago: fecha(leido.fechaPago, 'la fecha de pago'), neto: importe(leido.neto, 'el neto'), lineas, retenciones }
  return problemas.length === 0 ? a : noEntendido(leido.lector, leido.version, `El lector leyó ${problemas.join('; ')}.`)
}

/**
 * ¿Hay que subir (o volver a subir) este renglón? Sí si nunca entró, o si la vez anterior la base
 * contestó con un error: se reintenta en la próxima corrida.
 * @param {readonly unknown[]} fila
 * @returns {boolean}
 */
function avisoPendienteDeSubir(fila) {
  const base = fila[COL_AVISO.base]
  const texto = base === null || base === undefined ? '' : String(base)
  return String(fila[COL_AVISO.id] ?? '') !== '' && (texto === '' || texto.startsWith('error'))
}

/**
 * Lo que contestó la base, en una celda: "guardado", "releído · vinculó 1 orden".
 * @param {{ resultado: string, vinculadas: number }} r
 * @returns {string}
 */
function respuestaDeLaBase(r) {
  const que = r.resultado === 'releido' ? 'releído' : r.resultado
  if (!r.vinculadas) return que
  return `${que} · vinculó ${r.vinculadas} ${r.vinculadas === 1 ? 'orden' : 'órdenes'}`
}

// @ts-check
/* Lectores de avisos de pago. Spec 005 §5.3 · Plan 005, fase 0.
 *
 * Funciones puras: reciben el texto de un mail y devuelven lo que el mail dice, o por qué no se
 * entendió. No usan nada de Google, así que vitest las corre igual que a src/dominio/, y Apps
 * Script las corre tal cual: en Apps Script todos los archivos comparten el ámbito global, por
 * eso acá no hay import ni export.
 *
 * Tres reglas que vienen de la spec:
 *  · Se guarda lo que el mail DICE, no una conclusión (D4). Si el mail no desglosa cuánto se pagó
 *    de cada factura, la línea queda sin importe: no se reparte el total.
 *  · Ningún lector falla en silencio (RF-507). Lo que no se entiende vuelve con su motivo, y queda
 *    a la vista en la hoja.
 *  · La plata viaja como texto ("1234567.89"), nunca como float, igual que en la app.
 *
 * Cada lector tiene su versión. Cuando se corrige uno, se sube su número: así se sabe qué filas
 * leyó la versión vieja y hay que volver a leer (RF-508). */

/**
 * @typedef {{ texto: string, puntoVenta: number | null, numero: number }} FacturaCitada
 * @typedef {{ factura: FacturaCitada, neto: string | null }} LineaAviso
 * @typedef {'ganancias' | 'iva' | 'iibb' | 'suss' | 'otro'} Impuesto
 * @typedef {{ certificado: string | null, concepto: string, impuesto: Impuesto, importe: string }} Retencion
 * @typedef {{
 *   estado: 'leido', lector: string, version: number,
 *   tipo: 'pago' | 'retencion',
 *   op: string | null, fechaPago: string | null, importeTransferido: string | null,
 *   lineas: LineaAviso[], retenciones: Retencion[]
 * }} AvisoLeido
 * @typedef {{ estado: 'sin_lector' | 'no_entendido', lector: string | null, version: number | null, motivo: string }} AvisoNoLeido
 * @typedef {{ remitente: string, asunto: string, cuerpo: string, textoPdf: string }} Mail
 */

/* ------------------------------------------------------------------------------------------- */
/* Piezas comunes                                                                               */
/* ------------------------------------------------------------------------------------------- */

/**
 * La dirección de un encabezado From: "Fulano <a@b.com>" → "a@b.com", en minúsculas.
 * @param {string} from
 * @returns {string}
 */
function direccionDe(from) {
  const m = /<([^>]+)>/.exec(from)
  return (m ? (m[1] ?? '') : from).trim().toLowerCase()
}

/**
 * Un importe como lo escriba la compañía → texto con punto decimal, sin separador de miles.
 * Acepta "1,234,567.89", "1234567.89", "1.234.567,89" y "12,34". Devuelve null si no es un importe.
 * Regla: si hay comas y puntos, el último que aparece es el decimal. Si hay un solo tipo de
 * separador, es decimal sólo si aparece una vez y lo siguen exactamente dos dígitos.
 * @param {string} texto
 * @returns {string | null}
 */
function aImporte(texto) {
  const t = texto.trim()
  if (!/^\d[\d.,]*$/.test(t)) return null
  const ultimaComa = t.lastIndexOf(',')
  const ultimoPunto = t.lastIndexOf('.')
  let entero = t
  let decimales = ''
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    const sep = ultimaComa > ultimoPunto ? ultimaComa : ultimoPunto
    entero = t.slice(0, sep)
    decimales = t.slice(sep + 1)
  } else if (ultimaComa >= 0 || ultimoPunto >= 0) {
    const sep = ultimaComa >= 0 ? ',' : '.'
    const partes = t.split(sep)
    const ultima = partes[partes.length - 1] ?? ''
    if (partes.length === 2 && ultima.length === 2) {
      entero = partes[0] ?? ''
      decimales = ultima
    }
  }
  entero = entero.replace(/[.,]/g, '')
  if (!/^\d+$/.test(entero) || !/^\d{0,2}$/.test(decimales)) return null
  entero = entero.replace(/^0+(?=\d)/, '')
  return decimales === '' ? entero : entero + '.' + decimales.padEnd(2, '0')
}

/**
 * "03-02-2026" o "27/08/2026" → "2026-08-27". Las fechas son de calendario: se tratan como texto.
 * @param {string} texto
 * @returns {string | null}
 */
function aFecha(texto) {
  const m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(texto.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/**
 * El impuesto de una retención, por cómo la nombra la compañía. Ante la duda, 'otro': mejor una
 * retención sin clasificar que una clasificada mal.
 * @param {string} concepto
 * @returns {Impuesto}
 */
function impuestoDe(concepto) {
  if (/ganancias/i.test(concepto)) return 'ganancias'
  if (/brutos|iibb/i.test(concepto)) return 'iibb'
  if (/\biva\b/i.test(concepto)) return 'iva'
  if (/suss|1784/i.test(concepto)) return 'suss'
  return 'otro'
}

/**
 * @param {string} lector
 * @param {number} version
 * @param {string} motivo
 * @returns {AvisoNoLeido}
 */
function noEntendido(lector, version, motivo) {
  return { estado: 'no_entendido', lector, version, motivo }
}

/* ------------------------------------------------------------------------------------------- */
/* Federación Patronal · todo está en el cuerpo del mail                                        */
/* ------------------------------------------------------------------------------------------- */
/* "…con fecha 03-02-2026 hemos cursado una transferencia … por un importe de $ 1,234,567.89
 *  correspondiente al pago del egreso nro. 1000001 de la/s factura/s: Fac 2-1234 y que…"
 * y después, si hubo, una tabla de retenciones: "222526 Ret. Ganancias 57,570.67".
 * El importe es lo transferido, ya descontadas las retenciones. Puede pagar varias facturas con
 * un solo egreso, y entonces no dice cuánto de cada una. */

const VERSION_FED_PATRONAL = 1

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

  const transferido = aImporte(importe[1] ?? '')
  if (transferido === null) return noEntendido(lector, v, `No entiendo el importe "${importe[1]}".`)

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

  return {
    estado: 'leido',
    lector,
    version: v,
    tipo: 'pago',
    op: egreso ? (egreso[1] ?? null) : null,
    fechaPago: aFecha(fecha[1] ?? ''),
    importeTransferido: transferido,
    // Con una sola factura, lo transferido es de ella. Con varias, el mail no lo reparte y acá
    // tampoco: la línea queda sin importe y lo decide la base o una persona.
    lineas: facturas.map((factura) => ({ factura, neto: facturas.length === 1 ? transferido : null })),
    retenciones,
  }
}

/* ------------------------------------------------------------------------------------------- */
/* La Segunda · el número de factura está en el asunto                                          */
/* ------------------------------------------------------------------------------------------- */
/* "Envío de Retenciones Factura/s Nro. 1234". Es el mail de los certificados de retención que se
 * generan al pagar: nombra la factura (nivel N3), pero los importes están en el PDF adjunto, que
 * todavía no se lee. Por eso las líneas salen sin importe. El número viene sin punto de venta. */

const VERSION_LA_SEGUNDA = 1

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

  return {
    estado: 'leido',
    lector,
    version: v,
    tipo: 'retencion',
    op: null,
    fechaPago: null,
    importeTransferido: null,
    lineas: numeros.map((n) => ({ factura: { texto: n, puntoVenta: null, numero: Number(n) }, neto: null })),
    retenciones: [],
  }
}

/* ------------------------------------------------------------------------------------------- */
/* A qué lector va cada mail                                                                    */
/* ------------------------------------------------------------------------------------------- */

/** @type {readonly { readonly dominio: string, readonly asunto: RegExp | null, readonly leer: (mail: Mail) => AvisoLeido | AvisoNoLeido }[]} */
const LECTORES = [
  { dominio: 'fedpat.com.ar', asunto: /dep[oó]sito de transferencia/i, leer: leerFedPatronal },
  { dominio: 'lasegunda.com.ar', asunto: /retenciones factura/i, leer: leerLaSegunda },
]

/**
 * Lee un mail con el lector de su compañía. Si no hay lector, lo dice: el aviso queda guardado
 * igual, y se vuelve a leer el día que su lector exista.
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerAviso(mail) {
  const direccion = direccionDe(mail.remitente)
  const dominio = direccion.slice(direccion.indexOf('@') + 1)
  for (const l of LECTORES) {
    const deEseDominio = dominio === l.dominio || dominio.endsWith('.' + l.dominio)
    if (deEseDominio && (l.asunto === null || l.asunto.test(mail.asunto))) return l.leer(mail)
  }
  return { estado: 'sin_lector', lector: null, version: null, motivo: `Todavía no hay lector para ${direccion}.` }
}

/* ------------------------------------------------------------------------------------------- */
/* Facturas enviadas · el asunto estándar del taller                                            */
/* ------------------------------------------------------------------------------------------- */
/* "factura n°3567 siniestro n°2004085048", u "orden de compra n°…" en vez de siniestro. Una
 * respuesta o un reenvío ("Re:", "RV:", "Fwd:") no es un envío nuevo. */

/**
 * @typedef {{ tipo: 'envio' | 'respuesta', factura: number, siniestro: string | null, ordenCompra: string | null }} AsuntoEnvio
 */

/**
 * @param {string} asunto
 * @returns {AsuntoEnvio | null}
 */
function leerAsuntoEnvio(asunto) {
  const factura = /factura\s*n\s*[°º.]?\s*(\d+)/i.exec(asunto)
  if (!factura) return null
  const siniestro = /siniestro\s*n\s*[°º.]?\s*(\S+)/i.exec(asunto)
  const orden = /orden de compra\s*n\s*[°º.]?\s*(\S+)/i.exec(asunto)
  return {
    tipo: /^\s*(re|rv|fw|fwd|reenv\w*)\s*:/i.test(asunto) || /^\s*\[[^\]]*\]\s*(re|rv)\s*:/i.test(asunto) ? 'respuesta' : 'envio',
    factura: Number(factura[1]),
    siniestro: siniestro ? (siniestro[1] ?? null) : null,
    ordenCompra: orden ? (orden[1] ?? null) : null,
  }
}

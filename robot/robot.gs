// El robot de cobranzas. ARCHIVO ARMADO: no se edita acá. Se edita en robot/ del repo y se
// vuelve a armar con `node robot/armar.mjs`. Se pega entero en el editor de Apps Script.

// ===== lectores/comun.js =====

/* Lo que comparten los lectores de avisos de pago. Spec 005 §5.3 · Plan 005, fase 0.
 *
 * Un lector por compañía, en esta carpeta, cada uno en su archivo. Todos son funciones puras:
 * reciben el mail (asunto, cuerpo y el texto de sus PDF) y devuelven lo que el aviso dice, o por
 * qué no se entendió. No usan nada de Google: vitest los corre igual que a src/dominio/, y Apps
 * Script los corre tal cual. En Apps Script todos los archivos comparten el ámbito global, por eso
 * no hay import ni export: cada archivo usa lo de éste por su nombre.
 *
 * Las reglas, que vienen de la spec:
 *  · Se guarda lo que el aviso DICE, no una conclusión (D4). Lo que no dice, queda vacío.
 *  · Ningún lector falla en silencio (RF-507): lo que no entiende vuelve con su motivo.
 *  · La plata viaja como texto ("2797934.54"), nunca como float.
 *  · Cada lector se controla solo: si el aviso trae el bruto, bruto = neto + retenciones al
 *    centavo (R6, RF-506). Si no cierra, lo leído no se da por bueno: queda como `no_cierra`, a la
 *    vista. Es la única cuenta que hace el robot, y no la guarda: sólo la usa para desconfiar.
 *
 * Cada lector tiene su versión. Cuando se corrige uno, se sube su número: así se sabe qué filas
 * leyó la versión vieja y hay que volver a leer (RF-508). */

/**
 * @typedef {{ texto: string, puntoVenta: number | null, numero: number }} FacturaCitada
 * @typedef {{
 *   factura: FacturaCitada | null, siniestro: string | null,
 *   bruto: string | null, neto: string | null
 * }} LineaAviso
 * @typedef {'ganancias' | 'iva' | 'iibb' | 'suss' | 'otro'} Impuesto
 * @typedef {{ certificado: string | null, concepto: string, impuesto: Impuesto, importe: string }} Retencion
 * @typedef {{ resultado: 'cierra' | 'no_cierra' | 'sin_bruto', detalle: string }} Control
 * @typedef {{
 *   estado: 'leido' | 'no_cierra', lector: string, version: number,
 *   tipo: 'pago' | 'retencion',
 *   op: string | null, fechaPago: string | null, neto: string | null,
 *   lineas: LineaAviso[], retenciones: Retencion[], control: Control
 * }} AvisoLeido
 * @typedef {{ estado: 'sin_lector' | 'no_entendido', lector: string | null, version: number | null, motivo: string }} AvisoNoLeido
 * @typedef {{ remitente: string, asunto: string, cuerpo: string, textoPdf: string }} Mail
 */

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
 * Acepta "2,797,934.54", "2797934.54", "1.234.567,89", "84,49" y "123 456,78" (miles con
 * espacio). Devuelve null si no es un importe.
 * Regla: si hay dos tipos de separador, el último es el decimal. Si hay uno solo, es decimal sólo
 * si aparece una vez y lo siguen exactamente dos dígitos.
 * @param {string} texto
 * @returns {string | null}
 */
function aImporte(texto) {
  const t = texto.trim().replace(/^\$\s*/, '').replace(/(\d) (?=\d{3}\b)/g, '$1')
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
    const partes = t.split(ultimaComa >= 0 ? ',' : '.')
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
 * Un importe que la compañía escribe siempre con punto decimal y sin miles, aunque traiga un solo
 * decimal: "123456.0", "1234.45". aImporte leería "123456.0" como miles; éste no.
 * @param {string} texto
 * @returns {string | null}
 */
function aImporteConPunto(texto) {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(texto.trim())
  if (!m) return null
  return `${(m[1] ?? '').replace(/^0+(?=\d)/, '')}.${(m[2] ?? '').padEnd(2, '0')}`
}

/**
 * "27-08-2026", "27/08/2026" o "27.08.2026" → "2026-08-27". Las fechas de calendario son texto.
 * @param {string} texto
 * @returns {string | null}
 */
function aFecha(texto) {
  const m = /^(\d{2})[-/.](\d{2})[-/.](\d{4})$/.exec(texto.trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/**
 * El texto de un PDF en un solo renglón, con los espacios normalizados. Saca también las barras
 * con que algunos extractores escapan asteriscos y guiones ("\*\*123 456,78").
 * @param {string} texto
 * @returns {string}
 */
function enUnRenglon(texto) {
  return texto.replace(/\\([*\-_])/g, '$1').replace(/\s+/g, ' ').trim()
}

/**
 * El impuesto de una retención, por cómo la nombra la compañía. Ante la duda, 'otro': mejor una
 * retención sin clasificar que una clasificada mal.
 * @param {string} concepto
 * @returns {Impuesto}
 */
function impuestoDe(concepto) {
  const c = concepto.replace(/\./g, '')
  if (/ganancias|gcias/i.test(c)) return 'ganancias'
  if (/brutos|iibb/i.test(c)) return 'iibb'
  if (/\biva\b/i.test(c)) return 'iva'
  if (/suss|1784|seguridad social|patron/i.test(c)) return 'suss'
  return 'otro'
}

/**
 * Un importe en centavos, como entero. Sólo para el control de cierre: nunca se guarda.
 * @param {string} importe con punto decimal, como lo devuelve aImporte
 * @returns {number}
 */
function centavos(importe) {
  const [entero, dec] = importe.split('.')
  return Number(entero) * 100 + Number((dec ?? '').padEnd(2, '0'))
}

/**
 * ¿El bruto que dice el aviso es lo neto más lo retenido, al centavo?
 * @param {string | null} bruto
 * @param {string | null} neto
 * @param {readonly Retencion[]} retenciones
 * @returns {Control}
 */
function controlar(bruto, neto, retenciones) {
  if (bruto === null || neto === null) return { resultado: 'sin_bruto', detalle: 'El aviso no trae el bruto: no hay contra qué controlar.' }
  const retenido = retenciones.reduce((s, r) => s + centavos(r.importe), 0)
  const diferencia = centavos(bruto) - centavos(neto) - retenido
  if (diferencia === 0) return { resultado: 'cierra', detalle: '' }
  return {
    resultado: 'no_cierra',
    detalle: `Bruto ${bruto} ≠ neto ${neto} + retenciones ${(retenido / 100).toFixed(2)}: faltan ${(diferencia / 100).toFixed(2)}.`,
  }
}

/**
 * Arma el resultado de un lector, con su control. Si no cierra, el estado lo dice.
 * @param {Omit<AvisoLeido, 'estado' | 'control'>} leido
 * @param {string | null} bruto el bruto total que dice el aviso, si lo dice
 * @returns {AvisoLeido}
 */
function conControl(leido, bruto) {
  const control = controlar(bruto, leido.neto, leido.retenciones)
  return { ...leido, estado: control.resultado === 'no_cierra' ? 'no_cierra' : 'leido', control }
}

/**
 * La suma de los brutos de las líneas, para controlar un aviso que paga varias facturas.
 * @param {readonly LineaAviso[]} lineas
 * @returns {string | null} null si alguna línea no trae bruto
 */
function brutoDeLasLineas(lineas) {
  if (lineas.length === 0 || lineas.some((l) => l.bruto === null)) return null
  const total = lineas.reduce((s, l) => s + centavos(l.bruto ?? '0'), 0)
  return (total / 100).toFixed(2)
}

/**
 * Las retenciones sin repetir: hay PDF que imprimen cada certificado dos veces (original y copia).
 * @param {readonly Retencion[]} retenciones
 * @returns {Retencion[]}
 */
function sinRepetir(retenciones) {
  const vistas = new Set()
  return retenciones.filter((r) => {
    const clave = r.certificado ?? `${r.concepto}|${r.importe}`
    if (vistas.has(clave)) return false
    vistas.add(clave)
    return true
  })
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

// ===== lectores/fed-patronal.js =====

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

// ===== lectores/indice.js =====

/* A qué lector va cada mail, y el asunto de las facturas enviadas.
 *
 * Cada lector se elige por el dominio del remitente y, cuando la compañía manda más de un tipo de
 * mail desde el mismo dominio, por el asunto: así un acuse ("Ingreso de Factura") nunca pasa por
 * un lector de pagos (R3). Lo que no tiene lector se guarda igual, como `sin_lector`, y se lee el
 * día que lo tenga. La lista se arma dentro de una función, no al cargar el archivo: en Apps
 * Script los archivos se cargan en orden y los lectores están en otros archivos. */

/**
 * @returns {readonly { readonly dominio: string, readonly asunto: RegExp, readonly leer: (mail: Mail) => AvisoLeido | AvisoNoLeido }[]}
 */
function lectores() {
  return [
    { dominio: 'fedpat.com.ar', asunto: /dep[oó]sito de transferencia/i, leer: leerFedPatronal },
    { dominio: 'lasegunda.com.ar', asunto: /retenciones factura/i, leer: leerLaSegunda },
    { dominio: 'lps.com.ar', asunto: /orden de pago/i, leer: leerLps },
    { dominio: 'riouruguay.com.ar', asunto: /pago/i, leer: leerRioUruguay },
    { dominio: 'nacion-seguros.com.ar', asunto: /aviso de pago/i, leer: leerNacion },
    { dominio: 'sancristobal.com.ar', asunto: /aviso de pago/i, leer: leerSanCristobal },
    { dominio: 'sancorseguros.com', asunto: /comprobante de pago/i, leer: leerSancor },
  ]
}

/**
 * Lee un mail con el lector de su compañía. Si no hay lector, lo dice.
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerAviso(mail) {
  const direccion = direccionDe(mail.remitente)
  const dominio = direccion.slice(direccion.indexOf('@') + 1)
  for (const l of lectores()) {
    const deEseDominio = dominio === l.dominio || dominio.endsWith('.' + l.dominio)
    if (deEseDominio && l.asunto.test(mail.asunto)) return l.leer(mail)
  }
  return { estado: 'sin_lector', lector: null, version: null, motivo: `Todavía no hay lector para ${direccion} con ese asunto.` }
}

/* Facturas enviadas · el asunto estándar del taller: "factura n°3567 siniestro n°2004085048", u
 * "orden de compra n°…" en vez de siniestro. Una respuesta o un reenvío ("Re:", "RV:", "Fwd:")
 * no es un envío nuevo. */

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

// ===== lectores/la-segunda.js =====

/* La Segunda · el número de factura está en el asunto.
 *
 * "Envío de Retenciones Factura/s Nro. 1234". Es el mail de los certificados de retención que se
 * generan al pagar: nombra la factura (nivel N3), pero los importes están en el PDF adjunto, cuyo
 * formato todavía no vimos. Hasta tener su lector, las líneas salen sin importe. El número viene
 * sin punto de venta ni tipo. */

const VERSION_LA_SEGUNDA = 2

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

  return conControl({
    lector,
    version: v,
    tipo: 'retencion',
    op: null,
    fechaPago: null,
    neto: null,
    lineas: numeros.map((n) => ({ factura: { texto: n, puntoVenta: null, numero: Number(n) }, siniestro: null, bruto: null, neto: null })),
    retenciones: [],
  }, null)
}

// ===== lectores/lps.js =====

/* La Perseverancia Seguros (LPS) · el detalle está en el PDF de la orden de pago.
 *
 * El PDF trae la orden y, a continuación, un certificado por impuesto. De la orden se leen:
 *   "Fecha Tipo y Nro.Comprobante Imp.Cancelado Cotiz. …
 *    01/01/2026 FS - A / 00002 / 1234 100.000,00 1,0000 $"     una fila por factura, con su bruto
 *   "SUBTOTAL 100.000,00 RET.GANANCIAS 2.000,00 RET.I.V.A. … TOTAL 80.000,00"
 * SUBTOTAL es el bruto, TOTAL lo transferido, y en el medio las retenciones. Los certificados
 * repiten lo mismo con más detalle; no se leen, para no contar dos veces. */

const VERSION_LPS = 1

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerLps(mail) {
  const lector = 'lps'
  const v = VERSION_LPS
  const t = enUnRenglon(mail.textoPdf)
  if (t === '') return noEntendido(lector, v, 'El mail no trae el PDF de la orden de pago, o no se le pudo sacar el texto.')

  const filas = [...t.matchAll(/(\d{2}\/\d{2}\/\d{4}) ([A-Z]{1,3}) - ([A-C]) \/ (\d+) \/ (\d+) (\d[\d.]*,\d{2}) 1,0000/g)]
  if (filas.length === 0) return noEntendido(lector, v, 'No encontré la tabla de comprobantes cancelados.')
  const otroTipo = filas.find((f) => !(f[2] ?? '').startsWith('F'))
  if (otroTipo) return noEntendido(lector, v, `Cancela un comprobante de tipo "${otroTipo[2]}": todavía no sé si suma o resta.`)

  const cierre = /SUBTOTAL (\d[\d.]*,\d{2}) (.*?)(?<![A-Z.])TOTAL (\d[\d.]*,\d{2})/.exec(t)
  if (!cierre) return noEntendido(lector, v, 'No encontré el SUBTOTAL y el TOTAL de la orden.')

  /** @type {Retencion[]} */
  const retenciones = []
  for (const r of (cierre[2] ?? '').matchAll(/RET\.\s?([A-Z][A-Z. ]*?) (\d[\d.]*,\d{2})/g)) {
    const importe = aImporte(r[2] ?? '')
    if (importe === null || centavos(importe) === 0) continue
    const nombre = (r[1] ?? '').trim()
    retenciones.push({ certificado: null, concepto: `RET.${nombre}`, impuesto: impuestoDe(nombre), importe })
  }

  const op = /N[uú]mero:?\s*0*(\d+)/i.exec(mail.asunto) ?? /Afectado a la OP:?\s*0*(\d+)/i.exec(t)
  const fecha = /Fecha ?: ?(\d{2}\/\d{2}\/\d{4})/.exec(t)

  return conControl({
    lector,
    version: v,
    tipo: 'pago',
    op: op ? (op[1] ?? null) : null,
    fechaPago: fecha ? aFecha(fecha[1] ?? '') : null,
    neto: aImporte(cierre[3] ?? ''),
    lineas: filas.map((f) => ({
      factura: { texto: `${f[2]} ${f[3]} ${f[4]}-${f[5]}`, puntoVenta: Number(f[4]), numero: Number(f[5]) },
      siniestro: null,
      bruto: aImporte(f[6] ?? ''),
      neto: filas.length === 1 ? aImporte(cierre[3] ?? '') : null,
    })),
    retenciones,
  }, aImporte(cierre[1] ?? ''))
}

// ===== lectores/nacion.js =====

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

// ===== lectores/rio-uruguay.js =====

/* Río Uruguay Seguros (RUS) · el detalle está en el PDF "OrdenesDePago".
 *
 * De la orden: "Total a Pagar: $80.000,00" (lo transferido), "Factura: 1234" (sin punto de
 * venta), las fechas de emisión y de pago, y el siniestro "4:1234567". De cada certificado: su
 * título "CONSTANCIA DE RETENCIÓN: 'RETENCIÓN IVA …'", su "Nro de Certificado: 0000123456",
 * su "Total retenido 16800.00", y el importe de la factura, "FACTURA A 03/02/2026 100000.0".
 *
 * El texto del PDF sale desordenado (el total de un certificado puede aparecer antes que su
 * título), así que títulos, números y totales se juntan por orden de aparición. Si ese orden
 * fallara, el control de cierre lo detecta: bruto = neto + retenciones. (Ya pasó: el número de la
 * resolución, "RG 2854", queda pegado antes de "Total retenido"; por eso un total escrito antes
 * de esas palabras tiene que tener decimales.)
 *
 * Un PDF con más de una orden todavía no se lee: no vimos ninguno. */

const VERSION_RIO_URUGUAY = 1

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerRioUruguay(mail) {
  const lector = 'rio-uruguay'
  const v = VERSION_RIO_URUGUAY
  const t = enUnRenglon(mail.textoPdf)
  if (t === '') return noEntendido(lector, v, 'El mail no trae el PDF de la orden de pago, o no se le pudo sacar el texto.')

  const aPagar = [...t.matchAll(/Total a Pagar:? \$? ?(\d[\d.]*,\d{2})/gi)]
  if (aPagar.length === 0) return noEntendido(lector, v, 'No encontré el "Total a Pagar" de la orden.')
  if (aPagar.length > 1) return noEntendido(lector, v, `El PDF trae ${aPagar.length} órdenes de pago: todavía no sé separarlas.`)

  const factura = /Factura: ?(\d+)/.exec(t)
  if (!factura) return noEntendido(lector, v, 'La orden no nombra la factura ("Factura: 1234").')
  const bruto = /FACTURA ([A-C]) \d{2}\/\d{2}\/\d{4} (\d+(?:\.\d{1,2})?)\b/.exec(t)

  const titulos = [...t.matchAll(/CONSTANCIA DE RETENCI[OÓ]N: ?'([^']+)'/gi)].map((m) => m[1] ?? '')
  const totales = [...t.matchAll(/Total retenido (\d+(?:\.\d{1,2})?)\b|(\d+\.\d{1,2}) Total retenido/gi)].map((m) => m[1] ?? m[2] ?? '')
  const certificados = [...t.matchAll(/Nro de Certificado: ?(\d+)/gi)].map((m) => m[1] ?? '')
  if (titulos.length !== totales.length || titulos.length !== certificados.length) {
    return noEntendido(lector, v, `Encontré ${titulos.length} certificados, ${totales.length} totales retenidos y ${certificados.length} números de certificado: no sé cuál va con cuál.`)
  }

  /** @type {Retencion[]} */
  const retenciones = []
  for (let i = 0; i < titulos.length; i++) {
    const importe = aImporteConPunto(totales[i] ?? '')
    if (importe === null) return noEntendido(lector, v, `No entiendo el total retenido "${totales[i]}".`)
    const concepto = (titulos[i] ?? '').replace(/^RETENCI[OÓ]N /i, '')
    retenciones.push({ certificado: certificados[i] ?? null, concepto, impuesto: impuestoDe(concepto), importe })
  }

  const op = /PAGO (\d{5,})/.exec(t)
  const fechas = /Fecha Emisi[oó]n Fecha Pago .*?\d{2}\/\d{2}\/\d{4} (\d{2}\/\d{2}\/\d{4})/.exec(t)
  const siniestro = /Siniestro .*?(\d+:\d+) \d{2}\/\d{2}\/\d{4}/.exec(t)
  const neto = aImporte(aPagar[0]?.[1] ?? '')
  const brutoFactura = bruto ? aImporteConPunto(bruto[2] ?? '') : null

  return conControl({
    lector,
    version: v,
    tipo: 'pago',
    op: op ? (op[1] ?? null) : null,
    fechaPago: fechas ? aFecha(fechas[1] ?? '') : null,
    neto,
    lineas: [{
      factura: { texto: `${bruto ? `${bruto[1]} ` : ''}${factura[1]}`, puntoVenta: null, numero: Number(factura[1]) },
      siniestro: siniestro ? (siniestro[1] ?? null) : null,
      bruto: brutoFactura,
      neto,
    }],
    retenciones: sinRepetir(retenciones),
  }, brutoFactura)
}

// ===== lectores/san-cristobal.js =====

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

// ===== lectores/sancor.js =====

/* Sancor Seguros · el detalle está en el PDF "Orden de Pago General".
 *
 * El mail trae la orden y, aparte, una constancia por impuesto. La orden ya tiene todo:
 *   "Factura A N°: 0002-00001234 de 01.02.2026 Us: XXX N°Stro:2001234567 60.000,00"   una por factura
 *   "Ret. IIBB Buenos Aires (Pcia.) 3.000,00- Ganancias 2 2.000,00- IVA 1 14.000,00-"  las retenciones
 *   "IMPORTE TOTAL: 80.000,00"                                                         lo transferido
 * Las constancias repiten las retenciones; no se leen, para no contar dos veces. Un mail que trae
 * sólo constancias, sin la orden, todavía no se lee. La spec avisa que Sancor puede descontar
 * notas de crédito en la orden: si aparece una, el lector no adivina el signo y lo dice. */

const VERSION_SANCOR = 1

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerSancor(mail) {
  const lector = 'sancor'
  const v = VERSION_SANCOR
  const t = enUnRenglon(mail.textoPdf)
  if (t === '') return noEntendido(lector, v, 'El mail no trae PDF, o no se les pudo sacar el texto.')

  const total = /IMPORTE TOTAL: ?(\d[\d.]*,\d{2})/.exec(t)
  if (!total) return noEntendido(lector, v, 'No encontré la "Orden de Pago General" (sólo constancias de retención, o un formato nuevo).')

  const filas = [...t.matchAll(/(Factura|Nota de Cr[eé]dito|Nota de D[eé]bito) ([A-C]) N°: ?(\d{4})-(\d{8}) de (\d{2}\.\d{2}\.\d{4}) Us: \S+ N°Stro: ?(\S+) (\d[\d.]*,\d{2})(-?)/g)]
  if (filas.length === 0) return noEntendido(lector, v, 'La orden no nombra ningún comprobante con el formato "Factura A N°: 0002-00001234".')
  const otra = filas.find((f) => f[1] !== 'Factura')
  if (otra) return noEntendido(lector, v, `La orden incluye una ${otra[1]}: todavía no sé leer cómo la descuenta.`)

  // Las retenciones van entre la última factura y el IMPORTE TOTAL, cada una terminada en "-".
  const ultima = filas[filas.length - 1]
  const desde = (ultima?.index ?? 0) + (ultima?.[0].length ?? 0)
  const tramo = t.slice(desde, total.index)
  /** @type {Retencion[]} */
  const retenciones = []
  for (const r of tramo.matchAll(/(.+?) (\d{1,3}(?:\.\d{3})*,\d{2})-/g)) {
    const concepto = (r[1] ?? '').trim()
    retenciones.push({ certificado: null, concepto, impuesto: impuestoDe(concepto), importe: aImporte(r[2] ?? '') ?? '' })
  }

  /** @type {LineaAviso[]} */
  const lineas = filas.map((f) => ({
    factura: { texto: `${f[1]} ${f[2]} ${f[3]}-${f[4]}`, puntoVenta: Number(f[3]), numero: Number(f[4]) },
    siniestro: f[6] ?? null,
    bruto: aImporte(f[7] ?? ''),
    neto: null,
  }))
  const neto = aImporte(total[1] ?? '')
  if (lineas.length === 1 && lineas[0]) lineas[0].neto = neto

  const op = /N[uú]mero: ?(\d+)/.exec(t)
  const fecha = /COMPROBANTE DE PAGO .*?Fecha: ?(\d{2}\.\d{2}\.\d{4})/.exec(t) ?? /Fecha: ?(\d{2}\.\d{2}\.\d{4})/.exec(t)

  return conControl({
    lector,
    version: v,
    tipo: 'pago',
    op: op ? (op[1] ?? null) : null,
    fechaPago: fecha ? aFecha(fecha[1] ?? '') : null,
    neto,
    lineas,
    retenciones,
  }, brutoDeLasLineas(lineas))
}

// ===== barrido.js =====

/* El barrido de Gmail. Plan 005, fase 0: el corpus, sin tocar la base.
 *
 * Es lo único que habla con Google. Corre dentro de la cuenta del taller, ligado a una planilla,
 * y escribe ahí, en pestañas:
 *   remitentes   de quién se esperan avisos de pago (se edita a mano; es un dato, no código)
 *   avisos       cada mail de esos remitentes, una vez, con su cuerpo y el texto de sus PDF
 *   lineas       qué factura (o siniestro) nombra cada aviso, bruto y neto, y si el aviso cierra
 *   retenciones  las retenciones que informa cada aviso
 *   enviados     las facturas que mandó el taller, con el asunto estándar
 *
 * Permisos (appsscript.json): leer Gmail, crear archivos propios en Drive, escribir en esta
 * planilla, y llamar a la API de Drive para sacar el texto de los PDF. Ninguno deja mandar,
 * borrar ni modificar un mail (R1): no es una promesa, es lo que Google le autoriza.
 *
 * Se puede correr todas las veces que se quiera: un mail que ya está en la planilla se saltea.
 * Cada corrida para a los 4 minutos y medio (Apps Script corta a los 6) y la siguiente sigue
 * donde quedó. */

const DESDE = '2025/01/01'
const ZONA = 'America/Argentina/Buenos_Aires'
const LIMITE_MS = 4.5 * 60 * 1000
/** Una celda de Sheets admite 50.000 caracteres. */
const MAX_CELDA = 49000

const COLUMNAS = {
  remitentes: ['remitente', 'compañía'],
  avisos: ['message_id', 'fecha', 'remitente', 'asunto', 'cuerpo', 'pdfs', 'texto_pdf', 'lector', 'version', 'estado', 'motivo', 'control'],
  lineas: ['message_id', 'fecha_aviso', 'remitente', 'tipo', 'op', 'fecha_pago', 'factura_como_dice', 'punto_venta', 'numero', 'siniestro', 'bruto', 'neto', 'neto_del_aviso', 'control', 'lector', 'version'],
  retenciones: ['message_id', 'certificado', 'concepto', 'impuesto', 'importe'],
  enviados: ['message_id', 'fecha', 'para', 'asunto', 'tipo', 'factura', 'siniestro', 'orden_de_compra'],
}

/* Los remitentes conocidos el 2026-10-08. Se cargan en la pestaña sólo si está vacía; de ahí en
 * más manda la pestaña. Son casillas automáticas de las compañías, no de personas. */
const REMITENTES_INICIALES = [
  ['no_responder@fedpat.com.ar', 'Federación Patronal'],
  ['enviosautomaticos@lasegunda.com.ar', 'La Segunda'],
  ['pagossc@sancristobal.com.ar', 'San Cristóbal'],
  ['noresponder@lps.com.ar', 'LPS'],
  ['no-responder@lps.com.ar', 'LPS'],
  ['nacion-seguros@nacion-seguros.com.ar', 'Nación'],
  ['noresponder@cooperacionseguros.com.ar', 'Cooperación'],
  ['retenciones.rus@riouruguay.com.ar', 'Río Uruguay'],
  ['infoproveedores@sancorseguros.com', 'Sancor'],
  ['applebsp@pseguros.com.ar', 'Provincia'],
  ['proveedoresmdp@allianz.com.ar', 'Allianz'],
  ['help@allianz.com.ar', 'Allianz'],
  ['no-responder@mail.lamercantil.flowable-managed.com', 'Mercantil Andina'],
]

/* ------------------------------------------------------------------------------------------- */
/* Lo que se corre                                                                              */
/* ------------------------------------------------------------------------------------------- */

/** Trae de Gmail lo nuevo. Es la función del disparador horario. */
function barrer() {
  const inicio = Date.now()
  const hojas = prepararHojas()
  const remitentes = leerRemitentes(hojas.remitentes)
  if (remitentes.length === 0) throw new Error('La pestaña "remitentes" está vacía.')

  const nuevosAvisos = barrerConsulta(
    `from:(${remitentes.join(' OR ')}) after:${DESDE}`,
    idsGuardados(hojas.avisos),
    (id) => guardarAviso(id, hojas),
    inicio,
  )
  const nuevosEnvios = barrerConsulta(
    `in:sent subject:"factura n" after:${DESDE}`,
    idsGuardados(hojas.enviados),
    (id) => guardarEnvio(id, hojas),
    inicio,
  )
  console.log(`Avisos nuevos: ${nuevosAvisos.guardados}. Envíos nuevos: ${nuevosEnvios.guardados}.` +
    (nuevosAvisos.cortado || nuevosEnvios.cortado ? ' Quedan más: la próxima corrida sigue.' : ' Al día.'))
}

/**
 * Vuelve a leer todos los avisos de la planilla con los lectores de hoy, sin ir a Gmail (RF-508).
 * Se corre a mano después de corregir o agregar un lector. Rehace "lineas" y "retenciones".
 */
function releer() {
  const hojas = prepararHojas()
  vaciar(hojas.lineas)
  vaciar(hojas.retenciones)
  const filas = hojas.avisos.getDataRange().getValues().slice(1)
  const lineas = []
  const retenciones = []
  filas.forEach((f, i) => {
    const aviso = { id: String(f[0]), fecha: String(f[1]), remitente: String(f[2]) }
    const leido = leerAviso({ remitente: aviso.remitente, asunto: String(f[3]), cuerpo: String(f[4]), textoPdf: String(f[6]) })
    hojas.avisos.getRange(i + 2, 8, 1, 5).setValues([estadoDe(leido)])
    lineas.push(...filasDeLineas(aviso, leido))
    retenciones.push(...filasDeRetenciones(aviso.id, leido))
  })
  agregar(hojas.lineas, lineas)
  agregar(hojas.retenciones, retenciones)
  console.log(`Releídos ${filas.length} avisos: ${lineas.length} líneas, ${retenciones.length} retenciones.`)
}

/* ------------------------------------------------------------------------------------------- */
/* Gmail                                                                                        */
/* ------------------------------------------------------------------------------------------- */

function barrerConsulta(consulta, vistos, guardar, inicio) {
  let pagina
  let guardados = 0
  do {
    const r = Gmail.Users.Messages.list('me', { q: consulta, maxResults: 100, pageToken: pagina })
    for (const m of r.messages || []) {
      if (vistos.has(m.id)) continue
      if (Date.now() - inicio > LIMITE_MS) return { guardados, cortado: true }
      guardar(m.id)
      vistos.add(m.id)
      guardados++
    }
    pagina = r.nextPageToken
  } while (pagina)
  return { guardados, cortado: false }
}

function guardarAviso(id, hojas) {
  const msg = Gmail.Users.Messages.get('me', id, { format: 'full' })
  const partes = aplanar(msg.payload)
  const aviso = { id, fecha: fechaDe(msg), remitente: encabezado(msg, 'From') }
  const asunto = encabezado(msg, 'Subject')
  const cuerpo = cuerpoDe(partes)

  // Los PDF van a Drive, y se les saca el texto. Se reconocen por la extensión, nunca por el tipo
  // MIME: hay compañías que los mandan como application/octet-stream (spec 005 §5.3).
  const nombres = []
  const textos = []
  for (const p of partes.filter((p) => p.filename && /\.pdf$/i.test(p.filename))) {
    const blob = Utilities.newBlob(bytesDe(id, p), 'application/pdf', p.filename)
    Drive.Files.create({ name: `${aviso.fecha.slice(0, 10)} ${p.filename}`, parents: [carpetaDeLosPdf()] }, blob)
    nombres.push(p.filename)
    textos.push(textoDePdf(blob))
  }
  const textoPdf = textos.join('\n\n----- siguiente PDF -----\n\n')

  const leido = leerAviso({ remitente: aviso.remitente, asunto, cuerpo, textoPdf })
  agregar(hojas.avisos, [[id, aviso.fecha, aviso.remitente, asunto, cortar(cuerpo), nombres.join('\n'), cortar(textoPdf), ...estadoDe(leido)]])
  agregar(hojas.lineas, filasDeLineas(aviso, leido))
  agregar(hojas.retenciones, filasDeRetenciones(id, leido))
}

function guardarEnvio(id, hojas) {
  const msg = Gmail.Users.Messages.get('me', id, { format: 'metadata', metadataHeaders: ['Subject', 'To'] })
  const asunto = encabezado(msg, 'Subject')
  const e = leerAsuntoEnvio(asunto)
  agregar(hojas.enviados, [[id, fechaDe(msg), encabezado(msg, 'To'), asunto,
    e ? e.tipo : 'otro', e ? e.factura : '', e && e.siniestro ? e.siniestro : '', e && e.ordenCompra ? e.ordenCompra : '']])
}

function encabezado(msg, nombre) {
  const h = (msg.payload.headers || []).find((x) => x.name.toLowerCase() === nombre.toLowerCase())
  return h ? h.value : ''
}

function fechaDe(msg) {
  return Utilities.formatDate(new Date(Number(msg.internalDate)), ZONA, 'yyyy-MM-dd HH:mm')
}

function aplanar(parte) {
  return [parte, ...(parte.parts || []).flatMap(aplanar)]
}

/** El servicio de Gmail devuelve los datos en base64 "web-safe"; según la versión, ya decodificados. */
function aBytes(data) {
  return typeof data === 'string' ? Utilities.base64DecodeWebSafe(data) : data
}

function bytesDe(id, parte) {
  if (parte.body.data) return aBytes(parte.body.data)
  return aBytes(Gmail.Users.Messages.Attachments.get('me', id, parte.body.attachmentId).data)
}

/** El texto plano del mail, en su codificación (hay compañías que mandan Latin-1). Si sólo hay HTML, sin etiquetas. */
function cuerpoDe(partes) {
  const texto = partes.find((p) => p.mimeType === 'text/plain' && p.body && p.body.data && !p.filename)
  if (texto) return decodificar(texto)
  const html = partes.find((p) => p.mimeType === 'text/html' && p.body && p.body.data && !p.filename)
  if (!html) return ''
  return decodificar(html)
    .replace(/<(br|\/p|\/div|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
}

function decodificar(parte) {
  const tipo = ((parte.headers || []).find((h) => h.name.toLowerCase() === 'content-type') || { value: '' }).value
  const charset = (/charset="?([\w-]+)/i.exec(tipo) || [])[1] || 'UTF-8'
  return Utilities.newBlob(aBytes(parte.body.data)).getDataAsString(charset)
}

/* ------------------------------------------------------------------------------------------- */
/* Drive                                                                                        */
/* ------------------------------------------------------------------------------------------- */

/** La carpeta de los PDF. La crea la primera vez y guarda su id en las propiedades del script. */
function carpetaDeLosPdf() {
  const props = PropertiesService.getScriptProperties()
  let id = props.getProperty('carpeta_pdf')
  if (!id) {
    id = Drive.Files.create({ name: 'Cobranzas · avisos de pago (robot)', mimeType: 'application/vnd.google-apps.folder' }).id
    props.setProperty('carpeta_pdf', id)
  }
  return id
}

/**
 * El texto de un PDF: Drive lo convierte en un documento de Google (con OCR si es una imagen), se
 * exporta como texto y el documento temporal se borra. Si falla, el aviso se guarda igual, con el
 * error en lugar del texto: un PDF ilegible no puede frenar el barrido.
 */
function textoDePdf(blob) {
  let doc
  try {
    doc = Drive.Files.create({ name: 'temporal-ocr', mimeType: 'application/vnd.google-apps.document' }, blob, { ocrLanguage: 'es' })
    const r = UrlFetchApp.fetch(`https://www.googleapis.com/drive/v3/files/${doc.id}/export?mimeType=text/plain`, {
      headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
      muteHttpExceptions: true,
    })
    return r.getResponseCode() === 200 ? r.getContentText('UTF-8') : `[no se pudo leer el PDF: HTTP ${r.getResponseCode()}]`
  } catch (e) {
    return `[no se pudo leer el PDF: ${e.message}]`
  } finally {
    if (doc) Drive.Files.remove(doc.id)
  }
}

/* ------------------------------------------------------------------------------------------- */
/* La planilla                                                                                  */
/* ------------------------------------------------------------------------------------------- */

function prepararHojas() {
  const libro = SpreadsheetApp.getActive()
  const hojas = {}
  for (const [nombre, columnas] of Object.entries(COLUMNAS)) {
    let hoja = libro.getSheetByName(nombre)
    if (!hoja) {
      hoja = libro.insertSheet(nombre)
      hoja.appendRow(columnas)
      hoja.setFrozenRows(1)
      // Todo como texto: que Sheets no convierta "0002" en 2 ni "1234567.89" en otra cosa.
      hoja.getRange('A:Z').setNumberFormat('@')
    }
    hojas[nombre] = hoja
  }
  if (hojas.remitentes.getLastRow() < 2) agregar(hojas.remitentes, REMITENTES_INICIALES)
  return hojas
}

function leerRemitentes(hoja) {
  return hoja.getDataRange().getValues().slice(1).map((f) => String(f[0]).trim()).filter((r) => r.includes('@'))
}

function idsGuardados(hoja) {
  return new Set(hoja.getDataRange().getValues().slice(1).map((f) => String(f[0])))
}

function agregar(hoja, filas) {
  if (filas.length === 0) return
  hoja.getRange(hoja.getLastRow() + 1, 1, filas.length, filas[0].length).setValues(filas)
}

function vaciar(hoja) {
  if (hoja.getLastRow() > 1) hoja.getRange(2, 1, hoja.getLastRow() - 1, hoja.getLastColumn()).clearContent()
}

function cortar(texto) {
  return texto.length > MAX_CELDA ? texto.slice(0, MAX_CELDA) + '\n[… cortado: no entra en una celda]' : texto
}

/** lector, version, estado, motivo, control: las columnas H a L de "avisos". */
function estadoDe(leido) {
  if (leido.estado === 'leido' || leido.estado === 'no_cierra') {
    return [leido.lector, leido.version, leido.estado, leido.estado === 'no_cierra' ? leido.control.detalle : '', leido.control.resultado]
  }
  return [leido.lector || '', leido.version || '', leido.estado, leido.motivo, '']
}

function filasDeLineas(aviso, leido) {
  if (leido.estado !== 'leido' && leido.estado !== 'no_cierra') return []
  return leido.lineas.map((l) => [aviso.id, aviso.fecha, aviso.remitente, leido.tipo, leido.op || '', leido.fechaPago || '',
    l.factura ? l.factura.texto : '', l.factura && l.factura.puntoVenta !== null ? l.factura.puntoVenta : '', l.factura ? l.factura.numero : '',
    l.siniestro || '', l.bruto || '', l.neto || '', leido.neto || '', leido.control.resultado, leido.lector, leido.version])
}

function filasDeRetenciones(id, leido) {
  if (leido.estado !== 'leido' && leido.estado !== 'no_cierra') return []
  return leido.retenciones.map((r) => [id, r.certificado || '', r.concepto, r.impuesto, r.importe])
}

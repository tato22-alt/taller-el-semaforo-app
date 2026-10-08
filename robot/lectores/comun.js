// @ts-check
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

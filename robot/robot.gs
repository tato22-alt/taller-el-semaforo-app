// El robot de cobranzas. ARCHIVO ARMADO: no se edita acá. Se edita en robot/ del repo y se
// vuelve a armar con `node robot/armar.mjs`. Se pega entero en el editor de Apps Script.

// ===== lectores/acuses.js =====

/* Acuses: los mails que dicen algo de una factura pero NO son un pago (R3).
 *
 * "Recibimos tu factura", "tu factura fue aprobada", "la fecha de pago es el …". Sirven para
 * saber en qué anda cada factura y qué reclamar, pero nunca suman al cobrado. Por eso no salen
 * como un pago: salen como `acuse`, y el barrido los escribe en su propia pestaña, separada de las
 * líneas de pago. En la base van a ir a la tabla `acuse` (spec §4.3), que no es la de los pagos.
 *
 * Tipos, los de la spec: acuse (la recibieron), aprobacion (la aprobaron), fecha_prometida
 * (dicen cuándo pagan) y autorespuesta (un "recibimos su mail" que no nombra ninguna factura). */

/**
 * @typedef {'acuse' | 'aprobacion' | 'fecha_prometida' | 'autorespuesta'} TipoAcuse
 * @typedef {{
 *   estado: 'acuse', lector: string, version: number, tipo: TipoAcuse,
 *   factura: FacturaCitada | null, siniestro: string | null, monto: string | null,
 *   fechaPrometida: string | null, referencia: string | null
 * }} AcuseLeido
 */

const VERSION_ACUSES = 2

/**
 * @param {string} lector
 * @param {TipoAcuse} tipo
 * @param {Partial<Omit<AcuseLeido, 'estado' | 'lector' | 'version' | 'tipo'>>} datos
 * @returns {AcuseLeido}
 */
function acuse(lector, tipo, datos) {
  return { estado: 'acuse', lector, version: VERSION_ACUSES, tipo, factura: null, siniestro: null, monto: null, fechaPrometida: null, referencia: null, ...datos }
}

/**
 * La factura del asunto estándar del taller, cuando el acuse es una respuesta a ese mail.
 * @param {string} asunto
 * @returns {FacturaCitada | null}
 */
function facturaDelAsunto(asunto) {
  const e = leerAsuntoEnvio(asunto)
  return e ? { texto: `factura n°${e.factura}`, puntoVenta: null, numero: e.factura } : null
}

/**
 * Nación: "Ingreso de Factura N° 0002-00001234 … bajo el Nro de Trámite 00700000".
 * @param {Mail} mail
 * @returns {AcuseLeido | AvisoNoLeido}
 */
function leerAcuseNacion(mail) {
  const f = /Ingreso de Factura N\S* ?(\d{4})-(\d{8})/i.exec(mail.asunto)
  if (!f) return noEntendido('acuse-nacion', VERSION_ACUSES, 'El asunto no tiene la forma "Ingreso de Factura N° 0002-00001234".')
  const tramite = /Tr\S*mite:? ?(\d+)/i.exec(mail.cuerpo)
  return acuse('acuse-nacion', 'acuse', {
    factura: { texto: `${f[1]}-${f[2]}`, puntoVenta: Number(f[1]), numero: Number(f[2]) },
    referencia: tramite ? `trámite ${tramite[1]}` : null,
  })
}

/**
 * Mercantil Andina: "Tu Factura A0002-00001234 ha sido aprobada", con monto, siniestro y la fecha
 * estimada de pago ("2026-10-14").
 * @param {Mail} mail
 * @returns {AcuseLeido | AvisoNoLeido}
 */
function leerAcuseMercantil(mail) {
  const f = /Factura ([A-C])(\d{4})-(\d{8}) ha sido aprobada/i.exec(mail.asunto)
  if (!f) return noEntendido('acuse-mercantil', VERSION_ACUSES, 'El asunto no tiene la forma "Tu Factura A0002-00001234 ha sido aprobada".')
  const cuerpo = mail.cuerpo.replace(/\s+/g, ' ')
  const monto = /monto \$ ?(\d[\d.,]*\d)/i.exec(cuerpo)
  const siniestro = /siniestro Nro\.? ?(\d+)/i.exec(cuerpo)
  const fecha = /fecha estimada de pago es (\d{4}-\d{2}-\d{2})/i.exec(cuerpo)
  return acuse('acuse-mercantil', 'aprobacion', {
    factura: { texto: `${f[1]}${f[2]}-${f[3]}`, puntoVenta: Number(f[2]), numero: Number(f[3]) },
    siniestro: siniestro ? (siniestro[1] ?? null) : null,
    monto: monto ? aImporte(monto[1] ?? '') : null,
    fechaPrometida: fecha ? (fecha[1] ?? null) : null,
  })
}

/**
 * Allianz: la respuesta automática ("Respuesta Automatica") y la que da la fecha de pago, que
 * responde al mail de la factura: "Les informamos que la fecha de pago es el 20-08-2026".
 * @param {Mail} mail
 * @returns {AcuseLeido | AvisoNoLeido}
 */
function leerAcuseAllianz(mail) {
  if (/respuesta autom/i.test(mail.asunto)) return acuse('acuse-allianz', 'autorespuesta', {})
  // Un "RV:" es un reenvío interno de Allianz que nos copió: no es una respuesta al taller.
  if (/^\s*RV\s*:/i.test(mail.asunto)) return { estado: 'sin_lector', lector: null, version: null, motivo: 'Reenvío interno de Allianz.' }
  // Escriben la fecha con guiones o con barras: "20-08-2026", "20/11/2025".
  const fecha = /fecha de pago es el (\d{2}[-/.]\d{2}[-/.]\d{4})/i.exec(mail.cuerpo)
  if (!fecha) return noEntendido('acuse-allianz', VERSION_ACUSES, 'No dice una fecha de pago ("la fecha de pago es el dd/mm/aaaa"): puede ser un pedido o una observación, y lo mira una persona.')
  return acuse('acuse-allianz', 'fecha_prometida', { factura: facturaDelAsunto(mail.asunto), fechaPrometida: aFecha(fecha[1] ?? '') })
}

/**
 * Zurich, por Grant: "Recibimos tu factura … para su proceso de pago", como respuesta al mail de
 * la factura. Los demás mails de esa casilla (habilitaciones de siniestro, accesos) no son acuses.
 * @param {Mail} mail
 * @returns {AcuseLeido | AvisoNoLeido}
 */
function leerAcuseGrant(mail) {
  if (!/recibimos tu factura/i.test(mail.cuerpo)) {
    return { estado: 'sin_lector', lector: null, version: null, motivo: 'Mail de Grant que no es un acuse de factura.' }
  }
  return acuse('acuse-grant', 'acuse', { factura: facturaDelAsunto(mail.asunto) })
}

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
 *  · La plata viaja como texto ("2345678.90"), nunca como float.
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
 * @typedef {{
 *   remitente: string, asunto: string, cuerpo: string, textoPdf: string,
 *   adjuntos: string[], copia: string
 * }} Mail
 */

/* Del Mail, `adjuntos` son los nombres de los archivos, sin bajarlos: alcanzan para saber si un mail
 * trae una orden antes de gastar en Drive (spec 010, RF-1014). `copia` es el encabezado Cc tal cual
 * llega. Los lectores de avisos de pago no usan ninguno de los dos. */

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
 * Acepta "2,345,678.90", "2345678.90", "1.234.567,89", "12,34" y "123 456,78" (miles con
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

// ===== lectores/galicia.js =====

/* Galicia Seguros (y SURA, que es la misma compañía) · el aviso está en el cuerpo del mail.
 *
 * Asunto: "Seguros Galicia – Información de Pago OP 170001234" (o "SURA – … OP 1700001234 …").
 * Cuerpo: "Se acredita dentro de las 48Hs en su cuenta: $ 125.000,00
 *          Correspondientes a las facturas detalladas a continuación:
 *          00002A00001234 del 05/06/2026"                              una por factura
 * o, en vez de las facturas, "Correspondientes a la siguiente Orden de Pago: 1700001234", y el
 * detalle en el PDF adjunto, cuyo formato todavía no vimos. Ese caso se lee igual, como La Caja:
 * hubo un pago, por tanto, con esa orden; las líneas las va a dar el PDF cuando tenga lector.
 * El mail no trae el bruto ni las retenciones.
 *
 * Ojo: el asunto de "Seguros Galicia" corta el número de orden (9 dígitos de 10). Manda el del
 * cuerpo; el del asunto se usa sólo si el cuerpo no lo trae. */

const VERSION_GALICIA = 2

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
  const op = /Orden de Pago:? ?(\d+)/i.exec(cuerpo) ?? /OP:? ?(\d+)/i.exec(mail.asunto)
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

// ===== lectores/indice.js =====

/* A qué lector va cada mail, y el asunto de las facturas enviadas.
 *
 * Cada lector se elige por el dominio del remitente y, cuando la compañía manda más de un tipo de
 * mail desde el mismo dominio, por el asunto: así un acuse ("Ingreso de Factura") nunca pasa por
 * un lector de pagos (R3). Lo que no tiene lector se guarda igual, como `sin_lector`, y se lee el
 * día que lo tenga. La lista se arma dentro de una función, no al cargar el archivo: en Apps
 * Script los archivos se cargan en orden y los lectores están en otros archivos. */

/**
 * @returns {readonly { readonly dominio: string, readonly asunto: RegExp, readonly leer: (mail: Mail) => AvisoLeido | AcuseLeido | AvisoNoLeido }[]}
 */
function lectores() {
  return [
    // Acuses primero: un acuse nunca tiene que caer en un lector de pagos (R3).
    { dominio: 'nacion-seguros.com.ar', asunto: /ingreso de factura/i, leer: leerAcuseNacion },
    { dominio: 'flowable-managed.com', asunto: /ha sido aprobada/i, leer: leerAcuseMercantil },
    { dominio: 'allianz.com.ar', asunto: /respuesta autom|factura\s*(n|:)/i, leer: leerAcuseAllianz },
    { dominio: 'grant.com.ar', asunto: /factura n/i, leer: leerAcuseGrant },
    { dominio: 'fedpat.com.ar', asunto: /dep[oó]sito de transferencia/i, leer: leerFedPatronal },
    { dominio: 'lasegunda.com.ar', asunto: /retenciones factura/i, leer: leerLaSegunda },
    { dominio: 'lps.com.ar', asunto: /orden de pago/i, leer: leerLps },
    { dominio: 'riouruguay.com.ar', asunto: /pago/i, leer: leerRioUruguay },
    { dominio: 'nacion-seguros.com.ar', asunto: /aviso de pago/i, leer: leerNacion },
    { dominio: 'sancristobal.com.ar', asunto: /aviso de pago/i, leer: leerSanCristobal },
    { dominio: 'sancorseguros.com', asunto: /comprobante de pago/i, leer: leerSancor },
    { dominio: 'galiciaseguros.com.ar', asunto: /informaci[oó]n de pago/i, leer: leerGalicia },
    // "Acceso a Caja de Ahorro…" es un cambio de clave, no un pago.
    { dominio: 'cobranzas.com', asunto: /novedad de caja de ahorro/i, leer: leerLaCaja },
  ]
}

/**
 * Lee un mail con el lector de su compañía. Si no hay lector, lo dice.
 * @param {Mail} mail
 * @returns {AvisoLeido | AcuseLeido | AvisoNoLeido}
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

/* Facturas enviadas · el asunto estándar del taller: "factura n°3567 siniestro n°900000000001", u
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
  // "factura n°3567", y también "Factura: 3567", como lo escribe Allianz al responder.
  const factura = /factura\s*(?:n\s*[°º.]?|:)\s*(\d+)/i.exec(asunto)
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

// ===== lectores/la-caja.js =====

/* La Caja (Caja de Ahorro y Seguro S.A.) · avisa por cobranzas.com, y el aviso casi no dice nada.
 *
 * "Usted tiene una novedad en un pago de Caja de Ahorro y Seguro S.A.
 *  Número de Liquidación | 100000000000001
 *  Fecha de Disponibilidad | 24/08/2026"
 * No trae importe ni facturas: eso está en el portal de cobranzas.com, y lo que dice un portal lo
 * carga una persona (N1). El lector anota que hubo un pago, con su número y su fecha, para que
 * nadie tenga que acordarse de entrar a mirar. Experta, que tiene otro CUIT, puede usar el mismo
 * portal: el aviso no dice de cuál de las dos es, salvo por el nombre del asunto. */

const VERSION_LA_CAJA = 1

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerLaCaja(mail) {
  const lector = 'la-caja'
  const v = VERSION_LA_CAJA
  const cuerpo = mail.cuerpo.replace(/[|\s]+/g, ' ')
  const liquidacion = /N[uú]mero de Liquidaci[oó]n (\d+)/i.exec(cuerpo)
  if (!liquidacion) return noEntendido(lector, v, 'No encontré el número de liquidación.')
  const disponible = /Fecha de Disponibilidad (\d{2}\/\d{2}\/\d{4})/i.exec(cuerpo)

  return conControl({
    lector,
    version: v,
    tipo: 'pago',
    op: liquidacion[1] ?? null,
    fechaPago: disponible ? aFecha(disponible[1] ?? '') : null,
    neto: null,
    lineas: [],
    retenciones: [],
  }, null)
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

  // Un número de orden todo en ceros no es un número: se busca en el PDF.
  const op = /N[uú]mero:?\s*0*([1-9]\d*)/i.exec(mail.asunto) ?? /Afectado a la OP:?\s*0*(\d+)/i.exec(t)
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

// ===== lectores/ordenes-para-confirmar.js =====

/* Las órdenes que manda una persona: entran para confirmar. Spec 010 de semaforo-base, RF-1014.
 *
 * Un perito, un analista o un estudio mandan la orden desde su casilla, sin formato fijo. El robot no
 * puede leerlas como a las de Orion, pero sí reconocer las que *parecen* una orden: el remitente o
 * alguien en copia es de una aseguradora o de un estudio conocido, y el mail trae un PDF con nombre de
 * orden ("ord rep", "orden de trabajo", "informe orden trabajo", "OT_…"). Ésas suben a la base
 * marcadas para confirmar: una persona dice con un toque si es una orden o no, y hasta entonces no
 * cuentan para los avisos. Así llegó la orden que nadie vio vencer (auditoría del 2026-10-19).
 *
 * Los dominios no se escriben acá: viven en la pestaña dominios_ordenes de la planilla. En el código
 * están sólo los de las compañías a las que el taller factura, que el robot suma solo a la pestaña. Los
 * estudios y los peritos se agregan allá: son datos del negocio, y este repo es público. */

/* Los dominios de las compañías a las que el taller les facturó desde el 1/1/2025, con el nombre EXACTO
 * de su ficha en la base: la base busca la compañía por ese nombre. El robot suma a la pestaña los que
 * todavía no ofreció, una sola vez: uno que se borra de la pestaña no vuelve (barrido.js). */
/** @type {readonly (readonly [string, string])[]} */
const DOMINIOS_ORDENES_INICIALES = [
  ['lps.com.ar', 'LPS'],
  ['mapfre.com.ar', 'Mapfre'],
  ['pseguros.com.ar', 'Provincia'],
  ['victoria.com.ar', 'Victoria'],
  ['cooperacionseguros.com.ar', 'Cooperación'],
  ['nacion-seguros.com.ar', 'Nación'],
  ['sancorseguros.com', 'Sancor'],
  ['sancristobal.com.ar', 'San Cristóbal'],
  ['riouruguay.com.ar', 'Río Uruguay'],
  ['lasegunda.com.ar', 'La Segunda'],
  ['allianz.com.ar', 'Allianz'],
  ['fedpat.com.ar', 'Federación Patronal'],
  ['lamercantil.com.ar', 'Mercantil Andina'],
  ['triunfoseguros.com', 'Triunfo'],
  // Los que faltaban, al cruzar con las facturas emitidas desde el 1/1/2025 (2026-10-21).
  ['segurosrivadavia.com', 'Rivadavia'],
  ['lacaja.com.ar', 'La Caja'],
  ['zurich.com', 'Zurich'],
  ['experta.com.ar', 'Experta'],
  ['galiciaseguros.com.ar', 'Galicia'],
  ['sanjorge-sa.com.ar', 'San Jorge (concesionaria)'],
]

/* Los correos que usa cualquiera. Si alguien los agregara a la pestaña, el robot traería los PDF de
 * medio mundo, y los del propio taller: se ignoran. Un perito con casilla de Gmail no entra por acá. */
const DOMINIOS_DE_TODOS = ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.ar', 'outlook.com', 'outlook.com.ar',
  'live.com', 'live.com.ar', 'yahoo.com', 'yahoo.com.ar', 'icloud.com', 'fibertel.com.ar', 'speedy.com.ar']

/* Un PDF con nombre de orden. Los que se vieron en el último año: "ord rep.pdf", "Ord. Rep. 123.pdf",
 * "orden_trabajo.pdf", "Orden de reparación.pdf", "informeOrdenTrabajo.pdf", "OT_123_456.pdf",
 * "OT 123.pdf", "O.T. 123.pdf", "04-07330 ORDEN.pdf" (así los nombran los peritos de Victoria),
 * "Orden actualizada.pdf", "Orden 123.pdf". */
const ADJUNTO_DE_ORDEN = /ord(?:en)?[ _.-]*(?:de[ _-]?)?(?:rep|trabajo|mano)|informe ?orden ?trabajo|^OT_|^o\.?\s?t\.?[\s_-]*\d|(?:^|[\s_-])orden(?:[\s_-]+actualizada)?(?:[\s_-]+\d+)?\.pdf$/i

/* Una orden de pago, de compra o un certificado tampoco es una orden de trabajo, aunque diga "orden". */
const ADJUNTO_QUE_NO_ES_ORDEN = /pago|compra|certificado|retenci/i

/* El PDF de una orden de La Mercantil hecha a mano trae la TASACIÓN en el nombre, no el siniestro:
 * "Orden_Reparacion_540194.pdf", "Orden_Mano_Obra_480093.pdf". */
const ADJUNTO_CON_TASACION = /^orden_(?:reparacion|mano_obra)_(\d+)/i

/**
 * La pestaña dominios_ordenes (o la lista inicial) como mapa dominio → compañía. Acepta un "@"
 * delante, o un mail entero ("perito@estudio.example" vale por "estudio.example"). La compañía
 * vacía queda null: un estudio que trabaja para varias; la persona la elige al confirmar.
 * @param {readonly (readonly unknown[])[]} filas
 * @returns {Map<string, string | null>}
 */
function dominiosDeOrdenes(filas) {
  /** @type {Map<string, string | null>} */
  const dominios = new Map()
  for (const f of filas) {
    // Lo que se copia de Gmail viene como "Nombre <perito@estudio.example>": vale la dirección.
    const escrito = String(f[0] ?? '').trim().toLowerCase()
    const entre = /<([^<>]+)>/.exec(escrito)
    const direccion = entre ? (entre[1] ?? '').trim() : escrito
    const dominio = direccion.slice(direccion.lastIndexOf('@') + 1)
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(dominio) || DOMINIOS_DE_TODOS.includes(dominio)) {
      if (escrito !== '') console.log(`dominios_ordenes: se ignora "${escrito}" (no es un dominio, o es de un correo de todos).`)
      continue
    }
    const compania = String(f[1] ?? '').trim()
    dominios.set(dominio, compania === '' ? null : compania)
  }
  return dominios
}

/**
 * ¿Parece una orden mandada por una persona? Si sí, vuelve para confirmar (aConfirmar: true).
 * @param {Mail} mail
 * @param {ReadonlyMap<string, string | null>} dominios
 * @returns {OrdenLeida | null}
 */
function leerOrdenParaConfirmar(mail, dominios) {
  const deOrden = mail.adjuntos.filter((n) => /\.pdf$/i.test(n) && ADJUNTO_DE_ORDEN.test(n) && !ADJUNTO_QUE_NO_ES_ORDEN.test(n))
  const adjunto = deOrden[0]
  if (adjunto === undefined) return null

  // El remitente primero, después la copia. Un dominio conocido sin compañía (un estudio) cuenta
  // para reconocer la orden; la compañía la da el primero que la sepa.
  /** @type {(string | null)[]} */
  const companias = []
  for (const direccion of [...direccionesDe(mail.remitente), ...direccionesDe(mail.copia)]) {
    const compania = companiaDelDominio(direccion, dominios)
    if (compania !== undefined) companias.push(compania)
  }
  if (companias.length === 0) return null

  const tasacion = ADJUNTO_CON_TASACION.exec(adjunto)
  // Un mail con varias órdenes (un PDF por siniestro) entra una vez, con el primer número; quien la
  // confirma tiene que saber que hay más.
  const numeros = [...new Set(deOrden.map(numeroDelAdjunto).filter((n) => n !== null))]
  return {
    tipo: 'orden',
    plataforma: 'otra',
    compania: companias.find((c) => c !== null) ?? null,
    siniestro: siniestroDeUnaPersona(mail, adjunto),
    patente: patenteDe(mail.asunto),
    vehiculo: null,
    perito: null,
    peritoMail: null,
    // El PDF de una persona no tiene un formato conocido: el monto queda vacío antes que equivocado.
    monto: null,
    ...franquiciaYRepuestos(mail.cuerpo),
    referencia: tasacion ? `Tasación ${tasacion[1] ?? ''}` : null,
    nota: numeros.length > 1 ? `El mail trae ${deOrden.length} órdenes: ${deOrden.join(', ')}` : null,
    aConfirmar: true,
    lector: `ordenes v${VERSION_ORDENES}`,
  }
}

/**
 * El siniestro de una orden mandada por una persona, de lo más seguro a lo menos:
 *  1. rotulado en el asunto ("Siniestro 123", "Stro. N° 12/3", "Siniestro/Carpeta: 123/1");
 *  2. el número que abre el asunto, como lo escribe Provincia ("RE: 1234567 PEREZ INVENTADO");
 *  3. un tramo de 8 o más dígitos entre guiones, como el asunto viejo de La Mercantil reenviado;
 *  4. rotulado en el texto del PDF;
 *  5. un número del nombre del PDF, separado por bordes (nunca un pedazo de un código largo), salvo
 *     el de los PDF de La Mercantil, que es la tasación.
 * Si nada, null: la orden entra igual para confirmar, y la persona completa el número.
 * @param {Mail} mail
 * @param {string} adjunto
 * @returns {string | null}
 */
function siniestroDeUnaPersona(mail, adjunto) {
  const asunto = mail.asunto
  const rotulado = siniestroRotulado(asunto)
  if (rotulado !== null) return rotulado
  const abre = /^(?:(?:re|rv|fwd?|reenv\w*)\s*:\s*)*(\d{6,})\b/i.exec(asunto)
  if (abre?.[1]) return abre[1]
  const tramo = /(?:^|\s[–—-]\s)(\d{8,})(?=\s[–—-]\s|\s*$)/.exec(asunto)
  if (tramo?.[1]) return tramo[1]
  const enElPdf = siniestroRotulado(mail.textoPdf)
  if (enElPdf !== null) return enElPdf
  return ADJUNTO_CON_TASACION.test(adjunto) ? null : numeroDelAdjunto(adjunto)
}

/**
 * Un número de 6 o más dígitos del nombre de un PDF, separado por bordes: "ord rep 123456.pdf" da
 * 123456; "3f2a…-123456789abc-77-informe.pdf" no da nada (es un código, no un siniestro).
 * @param {string} nombre
 * @returns {string | null}
 */
function numeroDelAdjunto(nombre) {
  const m = /(?:^|[\s_-])(\d{6,})(?=[\s_.-]|$)/.exec(nombre.replace(/\.pdf$/i, ''))
  return m ? (m[1] ?? null) : null
}

/**
 * Las direcciones de un encabezado From o Cc, en minúsculas. Por las direcciones y no por las comas:
 * un nombre puede llevar una ("Perez, Juan" <jp@ejemplo.com>). El nombre visible no cuenta, aunque
 * parezca un mail: '"analista@lps.com.ar" <alguien@gmail.com>' es de gmail.com, no de lps.com.ar.
 * @param {string} encabezado
 * @returns {string[]}
 */
function direccionesDe(encabezado) {
  const sinNombres = encabezado.replace(/"(?:[^"\\]|\\.)*"/g, '')
  const entre = [...sinNombres.matchAll(/<([^<>]+)>/g)].map((m) => m[1] ?? '')
  const sueltas = sinNombres.replace(/<[^<>]*>/g, ' ').match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []
  return [...entre, ...sueltas].map((d) => d.trim().toLowerCase()).filter((d) => d.includes('@'))
}

/**
 * La compañía del dominio de una dirección, si el dominio (o uno del que es subdominio) está en la
 * lista. undefined si no está; null si está, pero sin compañía.
 * @param {string} direccion
 * @param {ReadonlyMap<string, string | null>} dominios
 * @returns {string | null | undefined}
 */
function companiaDelDominio(direccion, dominios) {
  const dominio = direccion.slice(direccion.lastIndexOf('@') + 1)
  for (const [d, compania] of dominios) {
    if (dominio === d || dominio.endsWith(`.${d}`)) return compania
  }
  return undefined
}

// ===== lectores/ordenes.js =====

/* Las órdenes de trabajo que llegan por mail. Spec 010 de semaforo-base.
 *
 * Las casillas automáticas, cuyas órdenes entran solas (RF-1005, RF-1015):
 *
 *  · Orion, que usan varias compañías. Hoy manda desde sistemas@mg.sistema-orion.com; antes, desde
 *    sistema.orion@cesvi.com.ar y sistemas@mg.cesvi.com.ar, a veces con "[EXTERNO]" delante del
 *    asunto. El asunto lo dice casi todo:
 *      "Orden De Trabajo <COMPAÑÍA-CON-GUIONES>-<SINIESTRO><VEHÍCULO>-<PATENTE>-<PERITO>"
 *    El número de siniestro va pegado al vehículo, sin separador: se corta donde empieza la marca.
 *    El monto viene en el PDF adjunto. Una anulación llega con el mismo asunto, y el cuerpo dice
 *    "dejar sin efecto" o "no dar curso".
 *  · La Mercantil, en dos formatos de asunto:
 *      hoy (…flowable-managed.com):
 *        "Orden de reparación – Siniestro N – Tasación N – Dominio X"
 *        "Anulación de Orden de reparación – Siniestro: N – Tasación N – Dominio: X"
 *      antes (no-responder@lamercantil.com.ar), sin rótulos:
 *        "Orden de reparación – <ASEGURADO> – <SINIESTRO> – <PATENTE>"
 *    El perito y su mail vienen en el cuerpo; el monto queda en su portal.
 *  · Nación, por el sistema Valua (avisos@sistemavalua.info), con plantilla fija:
 *      "ORDEN DE TRABAJO - NACION SEGUROS *STRO Nro N". El monto, en el PDF.
 *  · Cooperación, desde la casilla de su inspector (…@cooperacionseguros.com.ar):
 *      "ORDEN DE TRABAJO - STRO N/N …"
 *
 * Lo que manda una persona (un perito, un estudio) no tiene formato fijo: lo reconoce
 * ordenes-para-confirmar.js, y entra para confirmar (RF-1014).
 *
 * Se parecen y no son órdenes (auditoría del 2026-10-19): las órdenes de pago, las de compra de
 * repuestos ("Orden de compra"; en Cooperación, "ORDEN - Siniestro"), y la "Actualización de estado"
 * y el "Aviso de Conformidad" de La Mercantil.
 *
 * Lo que lee entra solo a la base (RF-1005, enmendado el 2026-10-18: nadie las carga a mano). Por
 * eso, ante la duda, deja el campo vacío antes que adivinar: un monto vacío se completa, uno
 * equivocado pasa desapercibido. */

/* El tipo Mail está en comun.js: en Apps Script todos los archivos comparten el ámbito. */

/**
 * @typedef {{
 *   readonly tipo: 'orden' | 'anulacion',
 *   readonly plataforma: 'orion' | 'mercantil' | 'nacion' | 'cooperacion' | 'grant' | 'otra',
 *   readonly compania: string | null,
 *   readonly siniestro: string | null,
 *   readonly patente: string | null,
 *   readonly vehiculo: string | null,
 *   readonly perito: string | null,
 *   readonly peritoMail: string | null,
 *   readonly monto: string | null,
 *   readonly franquicia: string | null,
 *   readonly repuestos: string | null,
 *   readonly referencia: string | null,
 *   readonly nota: string | null,
 *   readonly aConfirmar: boolean,
 *   readonly lector: string,
 * }} OrdenLeida
 */

/* `aConfirmar` es true sólo en las que el robot adivinó (RF-1014): hasta que una persona dice que es
 * una orden, no cuenta para los avisos ni para lo autorizado. `nota` es lo que tiene que saber quien la
 * confirma y no entra en otro campo (por ejemplo, que el mail trae más de una orden). */

const VERSION_ORDENES = 7

/* Las casillas de Orion: la de hoy y las dos que usó hasta fines de 2025. */
const REMITENTES_ORION = ['sistemas@mg.sistema-orion.com', 'sistema.orion@cesvi.com.ar', 'sistemas@mg.cesvi.com.ar']

/* La casilla de Grant, el gestor de siniestros de Zurich: manda la "orden de adjudicación". */
const REMITENTE_GRANT_ZURICH = 'zurich@grant.com.ar'

/* Lo que se parece a una orden y no es, por el asunto. Vale para las casillas automáticas, que
 * deciden por el asunto. En el mail de una persona manda el adjunto: si trae un PDF con nombre de
 * orden, entra para confirmar aunque el asunto diga otra cosa (un falso positivo cuesta un toque; un
 * falso negativo se pierde). */
const NO_ES_ORDEN = /[oó]rden(?:es)? de (?:pago|compra)|actualizaci[oó]n de estado|aviso de conformidad/i

/* Cooperación pide repuestos con el asunto "ORDEN - Siniestro …" (a veces detrás de un "RE:"): es una
 * compra, no una orden de trabajo. Sólo en Cooperación: en otra compañía ese asunto puede ser una orden. */
const COMPRA_COOPERACION = /(?:^|:\s*)orden\s*[-–—]\s*siniestro/i

/* El comienzo del asunto de Orion, por compañía, y el nombre de su ficha en la base (tiene que ser
 * idéntico: la base busca la compañía por ese nombre). Una compañía que no está acá queda en la
 * planilla sin cargar, con "sin_compania": hay que sumarla a esta lista. */
const COMPANIAS_ORION = [
  ['SANCOR-COOPERATIVA-DE-SEGUROS-LTDA---CASA-CENTRAL', 'Sancor'],
  ['LA-SEGUNDA-COOP-LTDA-DE-SEGUROS-GRALES', 'La Segunda'],
  ['RÍO-URUGUAY-COOP-DE-SEGUROS-LTDA---CASA-CENTRAL', 'Río Uruguay'],
  ['RIO-URUGUAY-COOP-DE-SEGUROS-LTDA---CASA-CENTRAL', 'Río Uruguay'],
  ['SAN-CRISTÓBAL-SMSG---CASA-CENTRAL', 'San Cristóbal'],
  ['SAN-CRISTOBAL-SMSG---CASA-CENTRAL', 'San Cristóbal'],
  ['SEGUROS-BERNARDINO-RIVADAVIA-COOP-LTDA', 'Rivadavia'],
  ['PROVINCIA-SEGUROS', 'Provincia'],
  ['ALLIANZ-ARGENTINA---CÍA-DE-SEGUROS-GRALES-SA', 'Allianz'],
  ['ALLIANZ-ARGENTINA---CIA-DE-SEGUROS-GRALES-SA', 'Allianz'],
  // Zurich Aseguradora Argentina S.A.: la que antes era QBE, no Zurich Argentina.
  ['ZAASA', 'Zurich ex QBE'],
  // Las que faltaban y se encontraron al cruzar con las facturas desde el 1/1/2025 (2026-10-21).
  ['ZURICH-COMPAÑÍA-DE-SEGUROS', 'Zurich'],
  ['ZURICH-COMPANIA-DE-SEGUROS', 'Zurich'],
  ['SEGUROS-GALICIA-SA', 'Galicia'],
  // SURA pasó a ser Seguros Galicia, con el mismo CUIT: sus órdenes viejas se facturan a Galicia.
  ['SEGUROS-SURA-SA', 'Galicia'],
  ['SEGURCOOP-COOP-DE-SEGUROS-LTDA', 'Segurcoop'],
]

/* Las marcas con las que empieza el vehículo: es donde termina el número de siniestro. */
const MARCAS = ['ALFA-ROMEO', 'AUDI', 'BAIC', 'BMW', 'CHERY', 'CHEVROLET', 'CHRYSLER', 'CITROEN', 'DODGE', 'DS', 'FIAT', 'FORD',
  'HONDA', 'HYUNDAI', 'IVECO', 'JEEP', 'KIA', 'MERCEDES-BENZ', 'MERCEDES', 'MITSUBISHI', 'NISSAN', 'PEUGEOT', 'RAM',
  'RENAULT', 'SUZUKI', 'TOYOTA', 'VOLKSWAGEN', 'VW']

const PATENTE_Y_PERITO = /-([A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d{3})-([A-ZÁÉÍÓÚÑ-]+)$/

/**
 * Lee una orden de trabajo. Devuelve null si el mail no es una orden (un recordatorio, un acuse, una
 * orden de pago o de compra).
 * @param {Mail} mail
 * @param {ReadonlyMap<string, string | null>} [dominios] de qué dominios se esperan órdenes de
 *   personas, con su compañía: la pestaña dominios_ordenes. Sin ella, la lista inicial.
 * @returns {OrdenLeida | null}
 */
function leerOrden(mail, dominios = dominiosDeOrdenes(DOMINIOS_ORDENES_INICIALES)) {
  // Las casillas viejas de Orion le agregan "[EXTERNO]" al asunto.
  const m = { ...mail, asunto: mail.asunto.replace(/^\s*\[externo\]\s*/i, '').trim() }
  const direccion = direccionDe(m.remitente)
  // Una casilla automática decide sola, por el asunto: lo que no entiende es un recordatorio.
  if (esCasillaDeOrdenes(direccion)) {
    if (NO_ES_ORDEN.test(m.asunto)) return null
    if (REMITENTES_ORION.includes(direccion)) return leerOrdenOrion(m)
    if (direccion === 'avisos@sistemavalua.info') return leerOrdenNacion(m)
    if (direccion === REMITENTE_GRANT_ZURICH) return leerOrdenGrant(m)
    return leerOrdenMercantil(m)
  }
  // Cooperación manda desde la casilla de su inspector, que también escribe otras cosas: si el asunto
  // no tiene la forma de siempre, el mail todavía puede ser una orden para confirmar.
  if (/@(?:[\w-]+\.)*cooperacionseguros\.com\.ar$/.test(direccion)) {
    if (COMPRA_COOPERACION.test(m.asunto)) return null
    const cooperacion = NO_ES_ORDEN.test(m.asunto) ? null : leerOrdenCooperacion(m)
    if (cooperacion) return cooperacion
  }
  return leerOrdenParaConfirmar(m, dominios)
}

/**
 * ¿Es una de las casillas automáticas que sólo mandan órdenes con plantilla fija (Orion, La Mercantil,
 * Valua, Grant)? Ésas deciden solas; lo que no entienden no pasa a la regla de las personas.
 * @param {string} direccion
 */
function esCasillaDeOrdenes(direccion) {
  return REMITENTES_ORION.includes(direccion) || direccion.endsWith('flowable-managed.com') ||
    direccion === 'no-responder@lamercantil.com.ar' || direccion === 'avisos@sistemavalua.info' ||
    direccion === REMITENTE_GRANT_ZURICH
}

/** @param {Mail} mail @returns {OrdenLeida | null} */
function leerOrdenOrion(mail) {
  const asunto = mail.asunto.trim()
  if (!/^orden de trabajo /i.test(asunto)) return null
  const resto = asunto.replace(/^orden de trabajo /i, '').trim()

  const final = PATENTE_Y_PERITO.exec(resto)
  const patente = final ? (final[1] ?? null) : null
  const perito = final ? enPalabras(final[2] ?? '') : null
  const antes = final ? resto.slice(0, final.index) : resto

  const conocida = COMPANIAS_ORION.find(([prefijo]) => antes.startsWith(`${prefijo}-`))
  const compania = conocida ? (conocida[1] ?? null) : null
  const sinCompania = conocida ? antes.slice((conocida[0] ?? '').length + 1) : antes

  // El siniestro va pegado al vehículo: se corta donde aparece la marca.
  // La marca tiene que ir seguida de un guion, para no confundirla con letras del número de siniestro.
  const marca = MARCAS.map((m) => ({ m, i: sinCompania.indexOf(`${m}-`) }))
    .filter((x) => x.i > 0)
    .sort((a, b) => a.i - b.i)[0]
  // Una marca que no está en la lista: el siniestro son las cifras del principio (con la letra que
  // a veces las encabeza, como en Allianz), sólo si el vehículo empieza pegado a ellas. Si no, queda
  // sin siniestro: un número cortado por la mitad cargaría la orden con un siniestro equivocado.
  const cifras = /^[A-Z]?\d+(?=[A-Z])/.exec(sinCompania)
  const corte = marca ? marca.i : cifras ? cifras[0].length : 0
  const siniestro = conocida && corte > 0 ? sinCompania.slice(0, corte) : null
  const vehiculo = corte > 0 ? enPalabras(sinCompania.slice(corte)) : null

  return {
    tipo: esAnulacionOrion(mail.cuerpo) ? 'anulacion' : 'orden',
    plataforma: 'orion',
    compania,
    siniestro,
    patente,
    vehiculo,
    perito,
    peritoMail: null,
    monto: montoDelPdf(mail.textoPdf),
    ...franquiciaYRepuestos(mail.cuerpo),
    referencia: null,
    nota: null,
    aConfirmar: false,
    lector: `ordenes v${VERSION_ORDENES}`,
  }
}

/**
 * Orion manda la anulación con el mismo asunto que la orden: lo dice el cuerpo ("dejar sin efecto
 * esta orden", "no dar curso a esta orden"). Si el cuerpo sólo deja sin efecto la orden ANTERIOR, el
 * mail es la orden nueva que la reemplaza: se lee como orden, para que no se pierda.
 * @param {string} cuerpo
 */
function esAnulacionOrion(cuerpo) {
  if (!/dejar sin efecto|no dar curso|anulad/i.test(cuerpo)) return false
  return !/(orden|la) anterior/i.test(cuerpo) || /esta orden/i.test(cuerpo)
}

/** @param {Mail} mail @returns {OrdenLeida | null} */
function leerOrdenMercantil(mail) {
  const asunto = mail.asunto
  const esAnulacion = /anulaci[oó]n\s+(?:de\s+)?(?:la\s+)?orden de reparaci[oó]n/i.test(asunto)
  if (!esAnulacion && !/^orden de reparaci[oó]n/i.test(asunto.trim())) return null
  // El formato de hoy rotula cada dato ("Siniestro N"); el viejo no rotula ninguno.
  const { siniestro, patente } = /siniestro/i.test(asunto) ? rotulosMercantil(asunto) : tramosMercantil(asunto)
  const perito = /perito interviniente,?\s*\*?([^*\n]+?)\*?,/i.exec(mail.cuerpo)
  const mailPerito = /email:\s*([^\s<>]+@[^\s<>]+)/i.exec(mail.cuerpo)
  // La tasación distingue una orden de otra del mismo siniestro (una ampliación trae otra).
  const tasacion = /tasaci[oó]n:?\s*(\d+)/i.exec(asunto)
  return {
    tipo: esAnulacion ? 'anulacion' : 'orden',
    plataforma: 'mercantil',
    compania: 'Mercantil Andina',
    siniestro,
    patente,
    vehiculo: null,
    perito: perito ? (perito[1] ?? '').trim() : null,
    peritoMail: mailPerito ? (mailPerito[1] ?? '').toLowerCase() : null,
    monto: null,
    franquicia: null,
    repuestos: null,
    referencia: tasacion ? `Tasación ${tasacion[1] ?? ''}` : null,
    nota: null,
    aConfirmar: false,
    lector: `ordenes v${VERSION_ORDENES}`,
  }
}

/**
 * El asunto rotulado de La Mercantil: el de hoy, "… – Siniestro N – Tasación N – Dominio X", y el de
 * sus anulaciones viejas, "… – Siniestro/Carpeta: N/1 – Patente: X" (el siniestro es lo de antes de la
 * barra; lo de después es la carpeta).
 * @param {string} asunto
 * @returns {{ siniestro: string | null, patente: string | null }}
 */
function rotulosMercantil(asunto) {
  const siniestro = /siniestro(?:\s*\/\s*carpeta)?:?\s*(\d+)/i.exec(asunto)
  const patente = /(?:dominio|patente):?\s*([A-Z]{2}\s?\d{3}\s?[A-Z]{2}|[A-Z]{3}\s?\d{3})(?![A-Z0-9])/i.exec(asunto)
  return {
    siniestro: siniestro ? (siniestro[1] ?? null) : null,
    patente: patente ? (patente[1] ?? '').replace(/\s/g, '').toUpperCase() : null,
  }
}

/**
 * El asunto viejo de La Mercantil no rotula nada: "Orden de reparación – <ASEGURADO> – <SINIESTRO> –
 * <PATENTE>". El siniestro es el tramo que es todo dígitos (doce, en los que se vieron); la patente,
 * el último tramo. El asegurado no se guarda: es el nombre de una persona y la orden no lo necesita.
 * @param {string} asunto
 * @returns {{ siniestro: string | null, patente: string | null }}
 */
function tramosMercantil(asunto) {
  const tramos = asunto.split(/\s+[–—-]\s+/).map((t) => t.trim())
  const siniestro = tramos.slice(1).find((t) => /^\d{8,}$/.test(t)) ?? null
  const ultimo = (tramos[tramos.length - 1] ?? '').replace(/\s/g, '').toUpperCase()
  return { siniestro, patente: /^(?:[A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d{3})$/.test(ultimo) ? ultimo : null }
}

/** @param {Mail} mail @returns {OrdenLeida | null} */
function leerOrdenNacion(mail) {
  const asunto = mail.asunto
  if (!/^orden de trabajo\b/i.test(asunto)) return null
  // Valua es un sistema que usan otras compañías (se vieron Paraná y Galeno). Es Nación sólo si el
  // asunto lo dice; si es Paraná, también se sabe. Cualquier otra entra para confirmar, sin compañía:
  // si entrara como segura sin compañía, la base no la aceptaría y nadie la vería.
  const compania = /naci[oó]n seguros/i.test(asunto) ? 'Nación' : /paran[aá] seguros/i.test(asunto) ? 'Paraná' : null
  return {
    tipo: 'orden',
    plataforma: 'nacion',
    compania,
    siniestro: siniestroRotulado(asunto),
    patente: patenteDe(asunto) ?? patenteRotulada(mail.textoPdf),
    vehiculo: null,
    perito: null,
    peritoMail: null,
    monto: montoDelPdf(mail.textoPdf),
    ...franquiciaYRepuestos(mail.cuerpo),
    referencia: null,
    nota: null,
    aConfirmar: compania === null,
    lector: `ordenes v${VERSION_ORDENES}`,
  }
}

/**
 * Zurich, por Grant: "Zurich Seguros: Orden 123 - Siniestro 0001-AUT1-60-1". Es la "orden de
 * adjudicación" con la que se factura: sin PDF, sin patente y sin monto. Muchas veces el mismo trabajo
 * ya llegó por Orion, con el siniestro escrito de otra forma ("12345678" acá, "123456781" allá): por
 * eso entra para confirmar, para no contarlo dos veces. Lo demás que manda Grant (el cambio de
 * contraseña, las respuestas automáticas) no es una orden.
 * @param {Mail} mail
 * @returns {OrdenLeida | null}
 */
function leerOrdenGrant(mail) {
  const a = /^zurich seguros:\s*orden\s+(\d+)\s*[-–—]\s*siniestro\s+(\S+)/i.exec(mail.asunto)
  if (!a) return null
  return {
    tipo: 'orden',
    plataforma: 'grant',
    compania: 'Zurich',
    siniestro: a[2] ?? null,
    patente: null,
    vehiculo: null,
    perito: null,
    peritoMail: null,
    monto: null,
    ...franquiciaYRepuestos(mail.cuerpo),
    referencia: `Grant ${a[1] ?? ''}`,
    nota: 'Adjudicación de Grant: si ya está la orden de Orion de este siniestro, es la misma.',
    aConfirmar: true,
    lector: `ordenes v${VERSION_ORDENES}`,
  }
}

/**
 * Cooperación: "ORDEN DE TRABAJO - STRO N/N", "ORDEN DE TRABAJO SINIESTRO N/N" o, sin rótulo,
 * "ORDEN DE TRABAJO - N/N …". Sin el número con barra, no es la forma de siempre.
 * Una respuesta o un reenvío del hilo tampoco: si trae la orden adjunta, la ve la regla de las de
 * personas, para confirmar.
 * @param {Mail} mail
 * @returns {OrdenLeida | null}
 */
function leerOrdenCooperacion(mail) {
  const asunto = mail.asunto
  if (/^(?:re|rv|fwd?|reenv\w*)\s*:/i.test(asunto) || !/orden de trabajo/i.test(asunto)) return null
  const stro = /\b(?:stro|siniestro)\b\.?\s*(?:n(?:ro|[°º])?\.?\s*)?:?\s*(\d+\/\d+)/i.exec(asunto) ??
    /orden de trabajo\s*[-–—]?\s*(\d+\/\d+)/i.exec(asunto)
  if (!stro) return null
  return {
    tipo: 'orden',
    plataforma: 'cooperacion',
    compania: 'Cooperación',
    siniestro: stro[1] ?? null,
    patente: patenteDe(asunto),
    vehiculo: null,
    perito: null,
    peritoMail: null,
    // Todavía no se vio un PDF de Cooperación: hasta leerlo contra uno real, el monto queda vacío.
    monto: null,
    ...franquiciaYRepuestos(mail.cuerpo),
    referencia: null,
    nota: null,
    aConfirmar: false,
    lector: `ordenes v${VERSION_ORDENES}`,
  }
}

/**
 * El total de la orden en el PDF, si se encuentra uno solo y claro. Si no, null: la orden entra
 * sin monto. Mejor vacío que un monto equivocado.
 * @param {string} texto
 * @returns {string | null}
 */
function montoDelPdf(texto) {
  const totales = [...texto.matchAll(/total(?:\s+(?:general|orden|autorizado|a pagar))?\s*:?\s*\$?\s*([\d.,]+\d)/gi)]
    .map((m) => aImporte(m[1] ?? ''))
    .filter((m) => m !== null)
  return totales.length > 0 ? (totales[totales.length - 1] ?? null) : null
}

/**
 * El número de siniestro rotulado: "Siniestro 123456", "Stro. N° 123/4", "STRO Nro 99-1". Con barra
 * o guion, como lo escriba la compañía. null si no hay rótulo: un número suelto puede ser cualquier cosa.
 * @param {string} texto
 * @returns {string | null}
 */
function siniestroRotulado(texto) {
  // "Siniestro/Carpeta: N/1" (La Mercantil): el siniestro es lo de antes de la barra.
  const carpeta = /\bsiniestro\s*\/\s*carpeta:?\s*(\d+)/i.exec(texto)
  if (carpeta) return carpeta[1] ?? null
  const m = /\b(?:siniestro|stro)\b\.?\s*(?:n(?:ro|[°º]|[uú]mero)?\.?\s*)?:?\s*(\d+(?:[/-]\d+)*)/i.exec(texto)
  return m ? (m[1] ?? null) : null
}

/**
 * La patente rotulada: "Dominio: AB123CD", "Patente AB 123 CD".
 * @param {string} texto
 * @returns {string | null}
 */
function patenteRotulada(texto) {
  const m = /(?:dominio|patente)\s*:?\s*([A-Z]{2}\s?\d{3}\s?[A-Z]{2}|[A-Z]{3}\s?\d{3})(?![A-Z0-9])/i.exec(texto)
  return m ? (m[1] ?? '').replace(/\s/g, '').toUpperCase() : null
}

/**
 * La patente de un asunto: la rotulada y, si no hay, una suelta en mayúsculas ("… - AB123CD").
 * Sólo en el asunto: en el texto de un PDF, una tira así puede ser un código cualquiera.
 * @param {string} asunto
 * @returns {string | null}
 */
function patenteDe(asunto) {
  const suelta = /(?<![A-Za-z0-9])([A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d{3})(?![A-Za-z0-9])/.exec(asunto)
  return patenteRotulada(asunto) ?? (suelta ? (suelta[1] ?? null) : null)
}

/**
 * Lo que dice el cuerpo de la franquicia y de los repuestos, tal cual. Una frase va de coma a coma (o
 * renglón). Un punto seguido de un dígito es de miles ($340.000), no el final de la frase.
 * @param {string} cuerpo
 * @returns {{ franquicia: string | null, repuestos: string | null }}
 */
function franquiciaYRepuestos(cuerpo) {
  return {
    franquicia: frase(cuerpo, /[^,\n.]*franquicia(?:[^,\n.]|\.(?=\d))*/i),
    repuestos: frase(cuerpo, /[^,\n.]*repuesto(?:[^,\n.]|\.(?=\d))*/i),
  }
}

/** "PERITO-INVENTADO" → "PERITO INVENTADO". @param {string} texto */
function enPalabras(texto) {
  return texto.replace(/-+/g, ' ').trim()
}

/** La primera oración que cumple el patrón, en un renglón. @param {string} texto @param {RegExp} patron */
function frase(texto, patron) {
  const m = patron.exec(texto)
  return m ? enUnRenglon(m[0]).trim() : null
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
 *  · El de indemnización (el más nuevo; a veces dos recibos en un PDF): "O.Pago: 1020260203", "Certificado Stro. … Importe Neto
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

const VERSION_SAN_CRISTOBAL = 2
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

  // Recibo de indemnización: siniestro y neto. Puede haber más de uno en el mismo PDF, bajo la misma
  // orden y con un solo juego de certificados: una línea por recibo, y las retenciones del total.
  const recibos = [...t.matchAll(new RegExp(`Importe Neto (\\S+) (\\d+) .*?\\(\\d+\\) ${IMPORTE_SC}`, 'g'))]
  if (recibos.length === 0) return noEntendido(lector, v, 'No encontré ni el detalle de facturas ni el siniestro con su importe neto.')
  const distintos = new Map(recibos.map((r) => [`${r[2]}|${r[3]}`, r]))
  /** @type {LineaAviso[]} */
  const lineas = [...distintos.values()].map((r) => ({ factura: null, siniestro: r[2] ?? null, bruto: null, neto: aImporte(r[3] ?? '') }))
  const factura = distintos.size === 1 ? /Factura:? ?(\d{4,5}) ?([A-C]) ?(\d{8})/i.exec(t) : null
  if (factura && lineas[0]) lineas[0].factura = { texto: factura[0], puntoVenta: Number(factura[1]), numero: Number(factura[3]) }
  const neto = distintos.size === 1 ? (lineas[0]?.neto ?? null) : null

  // El recibo no dice el bruto, pero los certificados sí dicen sus bases: la de Ganancias (régimen
  // 094) es el neto gravado y la de IVA (régimen 212) el IVA. Su suma es el total de la factura, y
  // alcanza para controlar el cierre. Se usa sólo para eso: no se guarda como bruto de nada.
  const bruto = brutoPorBases(t)
  const leido = { ...comun, neto, lineas }
  if (distintos.size === 1) return conControl(leido, bruto)
  const control = controlar(bruto, sumar(lineas.map((l) => l.neto ?? '0')), retenciones)
  return { ...leido, estado: control.resultado === 'no_cierra' ? 'no_cierra' : 'leido', control }
}

/**
 * Base de Ganancias + base de IVA de los certificados SICORE, o null si falta alguna.
 * @param {string} t
 * @returns {string | null}
 */
function brutoPorBases(t) {
  /** @type {Map<string, string>} */
  const bases = new Map()
  for (const b of t.matchAll(new RegExp(`Regimen: (094|212) (?:(?!Regimen:).)*?Monto Cmpte\\. que origina Retenci[oó]n: \\**${IMPORTE_SC}`, 'g'))) {
    const importe = aImporte(b[2] ?? '')
    if (importe !== null && !bases.has(b[1] ?? '')) bases.set(b[1] ?? '', importe)
  }
  const ganancias = bases.get('094')
  const iva = bases.get('212')
  return ganancias && iva ? sumar([ganancias, iva]) : null
}

/**
 * Suma importes en centavos. Sólo para controlar: el resultado nunca se guarda.
 * @param {readonly string[]} importes
 * @returns {string}
 */
function sumar(importes) {
  return (importes.reduce((s, i) => s + centavos(i), 0) / 100).toFixed(2)
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
 * notas de crédito en la orden: si aparece una, el lector no adivina el signo y lo dice.
 *
 * Versión 2, por lo que mostraron 40 PDF reales: el punto de venta viene con 4 o con 5 dígitos
 * ("0002-" o "00002-"), a veces mezclados en la misma orden; la nota de crédito se escribe "Nota
 * de crédito" y su importe puede quedar lejos de su renglón. Por eso las retenciones se reconocen
 * por su nombre, y si queda un importe con "-" sin nombre conocido, o un comprobante que no se
 * pudo leer, el lector lo dice en vez de cerrar de casualidad. */

const VERSION_SANCOR = 2

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

  const orden = t.slice(0, total.index)
  if (/Nota de (cr[eé]dito|d[eé]bito)/i.test(orden)) {
    return noEntendido(lector, v, 'La orden incluye una nota de crédito o débito: todavía no sé leer cómo la descuenta.')
  }
  const filas = [...orden.matchAll(/Factura ([A-C]) N°: ?(\d{4,5})-(\d{8}) de (\d{2}\.\d{2}\.\d{4}) Us: \S+ N°Stro: ?(\S+) (\d[\d.]*,\d{2})/g)]
  const nombradas = [...orden.matchAll(/N°: ?\d{4,5}-\d{8}/g)].length
  if (filas.length === 0) return noEntendido(lector, v, 'La orden no nombra ningún comprobante con el formato "Factura A N°: 0002-00001234".')
  if (filas.length !== nombradas) return noEntendido(lector, v, `La orden nombra ${nombradas} comprobantes y pude leer ${filas.length}.`)

  // Las retenciones van entre la última factura y el IMPORTE TOTAL, cada una terminada en "-", y se
  // reconocen por su nombre. Un importe con "-" que no sea de una retención conocida no se adivina.
  const ultima = filas[filas.length - 1]
  const tramo = orden.slice((ultima?.index ?? 0) + (ultima?.[0].length ?? 0))
  /** @type {Retencion[]} */
  const retenciones = []
  for (const r of tramo.matchAll(/(Ret\. [^\d-]+?|Ganancias(?: \d)?|IVA(?: \d)?|Seguridad Social[^\d-]*?) (\d{1,3}(?:\.\d{3})*,\d{2})-/g)) {
    const concepto = (r[1] ?? '').trim()
    retenciones.push({ certificado: null, concepto, impuesto: impuestoDe(concepto), importe: aImporte(r[2] ?? '') ?? '' })
  }
  const descuentos = [...tramo.matchAll(/\d,\d{2}-/g)].length
  if (descuentos !== retenciones.length) {
    return noEntendido(lector, v, `La orden descuenta ${descuentos} importes y reconozco ${retenciones.length} retenciones: hay algo más que no sé qué es.`)
  }

  /** @type {LineaAviso[]} */
  const lineas = filas.map((f) => ({
    factura: { texto: `Factura ${f[1]} ${f[2]}-${f[3]}`, puntoVenta: Number(f[2]), numero: Number(f[3]) },
    siniestro: f[5] ?? null,
    bruto: aImporte(f[6] ?? ''),
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
 *   acuses       "recibimos / aprobamos tu factura", "la fecha de pago es…": NO son pagos (R3)
 *   enviados     las facturas que mandó el taller, con el asunto estándar
 *   ordenes      las órdenes de trabajo (spec 010). Éstas además se suben solas a la base: la
 *                columna "base" dice qué contestó (cargada, a_confirmar, ya_estaba, sin_compania…)
 *   dominios_ordenes  de qué dominios se esperan órdenes mandadas por una persona, con su compañía
 *                (las compañías las suma el robot; los estudios y peritos se agregan acá a mano)
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
  avisos: ['message_id', 'fecha', 'remitente', 'asunto', 'cuerpo', 'pdfs', 'texto_pdf', 'lector', 'version', 'estado', 'motivo', 'control', 'pdfs_drive'],
  lineas: ['message_id', 'fecha_aviso', 'remitente', 'tipo', 'op', 'fecha_pago', 'factura_como_dice', 'punto_venta', 'numero', 'siniestro', 'bruto', 'neto', 'neto_del_aviso', 'control', 'lector', 'version'],
  retenciones: ['message_id', 'certificado', 'concepto', 'impuesto', 'importe'],
  acuses: ['message_id', 'fecha', 'remitente', 'tipo', 'factura_como_dice', 'punto_venta', 'numero', 'siniestro', 'monto', 'fecha_prometida', 'referencia', 'lector'],
  enviados: ['message_id', 'fecha', 'para', 'asunto', 'tipo', 'factura', 'siniestro', 'orden_de_compra'],
  ordenes: ['message_id', 'fecha', 'plataforma', 'tipo', 'compania', 'siniestro', 'patente', 'vehiculo', 'perito', 'perito_mail', 'monto', 'franquicia', 'repuestos', 'pdfs_drive', 'lector', 'base', 'referencia', 'a_confirmar', 'remitente', 'asunto', 'adjuntos', 'nota'],
  dominios_ordenes: ['dominio', 'compañía'],
}

/* Las casillas automáticas que mandan órdenes de trabajo (spec 010, RF-1015): Orion (la de hoy y las
 * dos viejas), La Mercantil (la de hoy y la vieja), Nación por Valua, Zurich por Grant, y cualquiera de
 * Cooperación. Se barren aparte de los avisos de pago. Las de personas las trae otra búsqueda, por
 * dominio (RF-1014). */
const REMITENTES_ORDENES = ['sistemas@mg.sistema-orion.com', 'sistema.orion@cesvi.com.ar', 'sistemas@mg.cesvi.com.ar',
  'no-responder@mail.lamercantil.flowable-managed.com', 'no-responder@lamercantil.com.ar', 'avisos@sistemavalua.info',
  'zurich@grant.com.ar', 'cooperacionseguros.com.ar']

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
  ['ar-sap@galiciaseguros.com.ar', 'Galicia / SURA'],
  ['no-reply@cobranzas.com', 'La Caja (portal cobranzas.com)'],
  ['facturacion.zurich@grant.com.ar', 'Zurich (Grant): acuses de factura'],
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
  // Las dos búsquedas de órdenes comparten la lista de vistos: un mail que traen las dos se lee una vez.
  const dominios = dominiosDeOrdenes(hojas.dominios_ordenes.getDataRange().getValues().slice(1))
  const ordenesVistas = idsGuardados(hojas.ordenes)
  const nuevasOrdenes = barrerConsulta(
    `from:(${REMITENTES_ORDENES.join(' OR ')}) subject:(orden) after:${DESDE}`,
    ordenesVistas,
    (id) => guardarOrden(id, hojas, dominios),
    inicio,
  )
  // Las que manda una persona (RF-1014): de un dominio de la pestaña, como remitente o en copia, con
  // algún PDF. Trae también avisos y pólizas de esas compañías: guardarOrden los descarta por el
  // nombre del adjunto, sin bajarlos. Lo que manda el taller mismo no se mira.
  const deDominios = [...dominios.keys()].join(' OR ')
  const paraConfirmar = dominios.size === 0 ? { guardados: 0, cortado: false } : barrerConsulta(
    `(from:(${deDominios}) OR cc:(${deDominios})) has:attachment filename:pdf -from:me after:${DESDE}`,
    ordenesVistas,
    (id) => guardarOrden(id, hojas, dominios),
    inicio,
  )
  const subidas = subirOrdenes(hojas.ordenes, inicio)
  console.log(`Avisos nuevos: ${nuevosAvisos.guardados}. Envíos nuevos: ${nuevosEnvios.guardados}. ` +
    `Mails de órdenes nuevos: ${nuevasOrdenes.guardados + paraConfirmar.guardados}. ${subidas}` +
    (nuevosAvisos.cortado || nuevosEnvios.cortado || nuevasOrdenes.cortado || paraConfirmar.cortado ? ' Quedan más: la próxima corrida sigue.' : ' Al día.'))
}

/**
 * Vuelve a leer todos los avisos de la planilla con los lectores de hoy, sin ir a Gmail (RF-508).
 * Se corre a mano después de corregir o agregar un lector. Rehace "lineas" y "retenciones".
 */
function releer() {
  const hojas = prepararHojas()
  vaciar(hojas.lineas)
  vaciar(hojas.retenciones)
  vaciar(hojas.acuses)
  const filas = hojas.avisos.getDataRange().getValues().slice(1)
  const lineas = []
  const retenciones = []
  const acuses = []
  filas.forEach((f, i) => {
    const aviso = { id: String(f[0]), fecha: String(f[1]), remitente: String(f[2]) }
    const leido = leerAviso({ remitente: aviso.remitente, asunto: String(f[3]), cuerpo: String(f[4]), textoPdf: String(f[6]),
      adjuntos: String(f[5]).split('\n').filter((n) => n !== ''), copia: '' })
    hojas.avisos.getRange(i + 2, 8, 1, 5).setValues([estadoDe(leido)])
    lineas.push(...filasDeLineas(aviso, leido))
    retenciones.push(...filasDeRetenciones(aviso.id, leido))
    acuses.push(...filasDeAcuses(aviso, leido))
  })
  agregar(hojas.lineas, lineas)
  agregar(hojas.retenciones, retenciones)
  agregar(hojas.acuses, acuses)
  console.log(`Releídos ${filas.length} avisos: ${lineas.length} líneas, ${retenciones.length} retenciones, ${acuses.length} acuses.`)
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
  const cuerpo = sinClaves(sinEnlacesDeSesion(cuerpoDe(partes)))

  const { nombres, idsDrive, textoPdf } = guardarPdfs(id, partes, aviso.fecha)

  const leido = leerAviso({ remitente: aviso.remitente, asunto, cuerpo, textoPdf, adjuntos: adjuntosDe(partes), copia: encabezado(msg, 'Cc') })
  agregar(hojas.avisos, [[id, aviso.fecha, aviso.remitente, asunto, cortar(cuerpo), nombres.join('\n'), cortar(textoPdf), ...estadoDe(leido), idsDrive.join('\n')]])
  agregar(hojas.lineas, filasDeLineas(aviso, leido))
  agregar(hojas.retenciones, filasDeRetenciones(id, leido))
  agregar(hojas.acuses, filasDeAcuses(aviso, leido))
}

/**
 * Una orden de trabajo, a su pestaña. A la base la sube después subirOrdenes (RF-1005).
 * Lo que no es una orden (un recordatorio, un aviso de pago) se guarda igual, con tipo "otro", para no
 * volver a leerlo.
 *
 * Primero se decide sin bajar nada: alcanzan el remitente, la copia, el asunto y los NOMBRES de los
 * adjuntos. Sólo si es una orden se suben sus PDF a Drive y se vuelve a leer con su texto (el monto
 * está ahí). La búsqueda de las órdenes de personas trae muchos mails de las compañías que no son
 * órdenes: bajar sus PDF sería llenar Drive y gastar el tiempo de la corrida en nada.
 */
function guardarOrden(id, hojas, dominios) {
  agregar(hojas.ordenes, [filaParaMail(id, dominios)])
}

/**
 * La fila de "ordenes" de un mail. Una que no es orden ('otro') guarda igual de quién es, el asunto,
 * los adjuntos y con qué versión del lector se leyó: si el lector se equivocó, se encuentra y se
 * relee con releerOrdenesOtro (nada se pierde). Los PDF de las casillas automáticas se suben a Drive
 * aunque el mail no sea una orden; los de la búsqueda por dominio, no (son avisos y pólizas).
 */
function filaParaMail(id, dominios, yaEnDrive = []) {
  const msg = Gmail.Users.Messages.get('me', id, { format: 'full' })
  const partes = aplanar(msg.payload)
  const fecha = fechaDe(msg)
  const mail = {
    remitente: encabezado(msg, 'From'),
    asunto: encabezado(msg, 'Subject'),
    cuerpo: sinClaves(sinEnlacesDeSesion(cuerpoDe(partes))),
    textoPdf: '',
    adjuntos: adjuntosDe(partes),
    copia: encabezado(msg, 'Cc'),
  }
  if (leerOrden(mail, dominios) === null) {
    const idsDrive = esCasillaDeOrdenes(direccionDe(mail.remitente)) ? guardarPdfs(id, partes, fecha, yaEnDrive).idsDrive : []
    return filaDeOrden(id, fecha, null, idsDrive, mail)
  }
  const { idsDrive, textoPdf } = guardarPdfs(id, partes, fecha, yaEnDrive)
  return filaDeOrden(id, fecha, leerOrden({ ...mail, textoPdf }, dominios), idsDrive, mail)
}

/**
 * Vuelve a leer, con el lector de hoy, los mails de "ordenes" que no pueden entrar a la base: los que
 * quedaron como 'otro', y las órdenes que la base no acepta porque el lector no supo la compañía o el
 * siniestro (una compañía de Orion que no conocía, una marca que no estaba en la lista). Los trae de
 * Gmail por su id y reemplaza la fila, sin agregar otra. Los PDF que ya están en Drive no se vuelven a
 * subir. Se corre a mano después de mejorar el lector o de sumar un dominio a dominios_ordenes.
 * Comparte el límite de tiempo del barrido: si se corta, se vuelve a correr y sigue.
 */
function releerOrdenesOtro() {
  const inicio = Date.now()
  const hojas = prepararHojas()
  const dominios = dominiosDeOrdenes(hojas.dominios_ordenes.getDataRange().getValues().slice(1))
  const filas = hojas.ordenes.getDataRange().getValues().slice(1)
  let releidas = 0
  let ahoraEntran = 0
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i] ?? []
    if (!hayQueReleer(f)) continue
    if (Date.now() - inicio > LIMITE_MS) break
    const nueva = filaParaMail(String(f[0]), dominios, String(f[13] ?? '').split('\n').filter((d) => d !== ''))
    hojas.ordenes.getRange(i + 2, 1, 1, nueva.length).setValues([nueva])
    releidas++
    if (!hayQueReleer(nueva)) ahoraEntran++
  }
  console.log(`Releídos ${releidas} mails: ${ahoraEntran} ahora pueden entrar a la base.`)
}

/**
 * ¿La fila no puede entrar a la base así como está? Una 'otro', o una orden sin compañía o sin siniestro
 * que no es para confirmar (la base la rechaza). Lo que la base ya cargó no se toca.
 * @param {readonly unknown[]} f
 */
function hayQueReleer(f) {
  if (String(f[3]) === 'otro') return true
  if (SUBIDA_TERMINADA.includes(String(f[15] ?? '')) || String(f[17] ?? '') === 'sí') return false
  return String(f[4] ?? '') === '' || String(f[5] ?? '') === ''
}

/** Las columnas de "ordenes", en su orden. a_confirmar dice "sí" en las que el robot adivinó (RF-1014). */
function filaDeOrden(id, fecha, o, idsDrive, mail) {
  const drive = idsDrive.join('\n')
  const deDonde = [mail.remitente, mail.asunto, mail.adjuntos.join('\n')]
  if (o === null) return [id, fecha, '', 'otro', '', '', '', '', '', '', '', '', '', drive, `ordenes v${VERSION_ORDENES}`, '', '', '', ...deDonde, '']
  return [id, fecha, o.plataforma, o.tipo, o.compania || '', o.siniestro || '', o.patente || '', o.vehiculo || '', o.perito || '',
    o.peritoMail || '', o.monto || '', o.franquicia || '', o.repuestos || '', drive, o.lector, '', o.referencia || '',
    o.aConfirmar ? 'sí' : '', ...deDonde, o.nota || '']
}

/* ------------------------------------------------------------------------------------------- */
/* La base (spec 010: las órdenes se cargan solas)                                              */
/* ------------------------------------------------------------------------------------------- */

/* Lo que contesta la base y ya no hace falta volver a mandar. Cualquier otra cosa (sin_compania,
 * sin_siniestro, un error de red) se reintenta en la próxima corrida: así, sumar una compañía a la
 * lista del lector y correr releerOrdenesOtro, o completar a mano el siniestro en la planilla, alcanza
 * para que la orden entre. */
const SUBIDA_TERMINADA = ['cargada', 'a_confirmar', 'ya_estaba', 'reenvio', 'anulada']

/** Hasta cuándo puede subir órdenes una corrida: un margen antes de los 6 minutos de Apps Script. */
const LIMITE_SUBIDA_MS = 5.25 * 60 * 1000

/**
 * Sube a la base las órdenes de la pestaña que todavía no entraron, de la más vieja a la más nueva:
 * una anulación tiene que llegar después de su orden. El robot entra con su propio usuario (rol
 * robot) y sólo puede llamar a fn_robot_guarda_orden: no lee ni borra nada.
 *
 * Necesita cuatro propiedades del script: SUPABASE_URL, SUPABASE_CLAVE_PUBLICA, ROBOT_MAIL y
 * ROBOT_CLAVE. Si faltan, no sube nada y lo dice: la planilla se sigue llenando igual.
 * Comparte el reloj con el barrido: si se acaba el tiempo, corta y la próxima corrida sigue.
 * @returns {string} una línea para el registro
 */
function subirOrdenes(hoja, inicio = Date.now()) {
  const props = PropertiesService.getScriptProperties()
  const url = props.getProperty('SUPABASE_URL')
  const clave = props.getProperty('SUPABASE_CLAVE_PUBLICA')
  const mail = props.getProperty('ROBOT_MAIL')
  const contrasenia = props.getProperty('ROBOT_CLAVE')
  if (!url || !clave || !mail || !contrasenia) return 'Órdenes sin subir: faltan las propiedades del robot.'

  const pendientes = hoja.getDataRange().getValues().slice(1)
    .map((f, i) => ({ f, fila: i + 2 }))
    .filter(({ f }) => (f[3] === 'orden' || f[3] === 'anulacion') && !SUBIDA_TERMINADA.includes(String(f[15])))
    .sort((a, b) => String(a.f[1]).localeCompare(String(b.f[1])))
  if (pendientes.length === 0) return 'Órdenes en la base: al día.'

  const sesion = UrlFetchApp.fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'post', contentType: 'application/json', headers: { apikey: clave },
    payload: JSON.stringify({ email: mail, password: contrasenia }), muteHttpExceptions: true,
  })
  if (sesion.getResponseCode() !== 200) return `Órdenes sin subir: el robot no pudo entrar a la base (HTTP ${sesion.getResponseCode()}).`
  const token = JSON.parse(sesion.getContentText()).access_token

  let cargadas = 0
  let hechas = 0
  for (const { f, fila } of pendientes) {
    if (Date.now() - inicio > LIMITE_SUBIDA_MS) return `Órdenes a la base: ${cargadas} de ${hechas}; quedan ${pendientes.length - hechas}, siguen en la próxima corrida.`
    const r = UrlFetchApp.fetch(`${url}/rest/v1/rpc/fn_robot_guarda_orden`, {
      method: 'post', contentType: 'application/json', headers: { apikey: clave, Authorization: `Bearer ${token}` },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        p_gmail_message_id: String(f[0]), p_tipo: f[3], p_compania: String(f[4]) || null, p_siniestro: String(f[5]),
        p_patente: String(f[6]) || null, p_fecha: String(f[1]).slice(0, 10),
        // El monto viaja como texto, igual que lo guarda la planilla: no pasa por un float.
        p_monto: String(f[10]) || null, p_perito: String(f[8]) || null, p_perito_mail: String(f[9]) || null,
        p_vehiculo: String(f[7]) || null, p_referencia: String(f[16] ?? '') || null,
        // Lo que dice el mail de la franquicia y los repuestos: va a la base tal cual, para no perderlo.
        // La nota (por ejemplo, que el mail trae varias órdenes) también, para quien la confirma.
        p_observaciones: [f[11], f[12], f[21]].map((x) => String(x ?? '')).filter((x) => x !== '' && x !== 'undefined').join(' · ') || null,
        // Las que el robot adivinó (RF-1014): entran aunque no sepa la compañía, y no cuentan hasta que
        // una persona las confirma. Las filas de antes de esta columna no la tienen: no son a confirmar.
        p_a_confirmar: String(f[17] ?? '') === 'sí',
      }),
    })
    const respuesta = r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : `error HTTP ${r.getResponseCode()}: ${r.getContentText().slice(0, 200)}`
    hoja.getRange(fila, 16).setValue(respuesta)
    if (respuesta === 'cargada' || respuesta === 'a_confirmar' || respuesta === 'anulada') cargadas++
    hechas++
  }
  return `Órdenes a la base: ${cargadas} de ${pendientes.length} pendientes.`
}

/**
 * Los PDF de un mail van a Drive, y se les saca el texto. Se reconocen por la extensión, nunca por
 * el tipo MIME: hay compañías que los mandan como application/octet-stream (spec 005 §5.3). Se
 * guarda el id de Drive de cada uno, en el mismo orden que los nombres: es lo único que distingue
 * dos PDF del mismo día con el mismo nombre, y lo que deja llegar al archivo desde la app.
 */
function guardarPdfs(id, partes, fecha, yaEnDrive = []) {
  const nombres = []
  const idsDrive = []
  const textos = []
  for (const p of partes.filter((p) => p.filename && /\.pdf$/i.test(p.filename))) {
    const blob = Utilities.newBlob(bytesDe(id, p), 'application/pdf', p.filename)
    // Al releer un mail cuyos PDF ya se subieron, sólo hace falta el texto: subirlos otra vez los duplica.
    if (yaEnDrive.length === 0) {
      idsDrive.push(Drive.Files.create({ name: `${fecha.slice(0, 10)} ${p.filename}`, parents: [carpetaDeLosPdf()] }, blob).id)
    }
    nombres.push(p.filename)
    textos.push(textoDePdf(blob))
  }
  return { nombres, idsDrive: yaEnDrive.length > 0 ? yaEnDrive : idsDrive, textoPdf: textos.join('\n\n----- siguiente PDF -----\n\n') }
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

/** Los nombres de los archivos adjuntos, sin bajarlos. */
function adjuntosDe(partes) {
  return partes.filter((p) => p.filename).map((p) => p.filename)
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

/**
 * Algunos avisos traen un enlace que inicia sesión en el portal de la compañía sin pedir clave
 * (cobranzas.com lo hace, con un token que dura días). Es una credencial: no se guarda (R2). Se
 * reemplaza cualquier URL que lleve un token, una sesión o una clave en sus parámetros.
 */
function sinEnlacesDeSesion(texto) {
  return texto.replace(/https?:\/\/[^\s)\]"'<>]*[?&](token|session|sesion|auth|key|clave|pass\w*)=[^\s)\]"'<>]*/gi, '[enlace de acceso quitado por el robot]')
}

/**
 * Hay compañías que mandan el usuario y la clave de su portal por mail, en texto plano. El robot no
 * los guarda (R2): lo que sigue a "contraseña" o "clave" (o su versión en inglés) se reemplaza antes de
 * escribir la planilla.
 */
function sinClaves(texto) {
  return texto.replace(/\b(contrase(?:ñ|n|\uFFFD)a|clave|pass(?:word)?)\b(\s*(?:provisoria|temporal|de acceso)?\s*[:=]?\s*)\S+/gi, '$1$2[quitada por el robot]')
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
    } else if (hoja.getRange(1, columnas.length).getValue() === '') {
      // Una planilla armada con una versión anterior: le faltan las columnas nuevas, que van siempre
      // al final. Se completa el encabezado; las filas viejas quedan con esas celdas vacías.
      hoja.getRange(1, 1, 1, columnas.length).setValues([columnas])
    }
    hojas[nombre] = hoja
  }
  if (hojas.remitentes.getLastRow() < 2) agregar(hojas.remitentes, REMITENTES_INICIALES)
  sumarDominiosNuevos(hojas.dominios_ordenes)
  return hojas
}

/**
 * Suma a la pestaña dominios_ordenes las compañías de la lista inicial que el robot todavía no le
 * ofreció. La primera vez la llena; cuando una versión nueva del robot trae una compañía más, la
 * agrega sola, sin que nadie la tipee. Lo ofrecido queda anotado en las propiedades del script: un
 * dominio que alguien borró de la pestaña no vuelve.
 */
function sumarDominiosNuevos(hoja) {
  const props = PropertiesService.getScriptProperties()
  const ofrecidos = new Set(JSON.parse(props.getProperty('dominios_ofrecidos') || '[]'))
  const enLaPestania = dominiosDeOrdenes(hoja.getDataRange().getValues().slice(1))
  agregar(hoja, DOMINIOS_ORDENES_INICIALES.filter(([d]) => !ofrecidos.has(d) && !enLaPestania.has(d)).map(([d, c]) => [d, c]))
  props.setProperty('dominios_ofrecidos', JSON.stringify(DOMINIOS_ORDENES_INICIALES.map(([d]) => d)))
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
  if (leido.estado === 'acuse') return [leido.lector, leido.version, 'acuse', leido.tipo, '']
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

function filasDeAcuses(aviso, leido) {
  if (leido.estado !== 'acuse') return []
  const f = leido.factura
  return [[aviso.id, aviso.fecha, aviso.remitente, leido.tipo, f ? f.texto : '', f && f.puntoVenta !== null ? f.puntoVenta : '', f ? f.numero : '',
    leido.siniestro || '', leido.monto || '', leido.fechaPrometida || '', leido.referencia || '', leido.lector]]
}

function filasDeRetenciones(id, leido) {
  if (leido.estado !== 'leido' && leido.estado !== 'no_cierra') return []
  return leido.retenciones.map((r) => [id, r.certificado || '', r.concepto, r.impuesto, r.importe])
}

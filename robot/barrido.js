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
  acuses: ['message_id', 'fecha', 'remitente', 'tipo', 'factura_como_dice', 'punto_venta', 'numero', 'siniestro', 'monto', 'fecha_prometida', 'referencia', 'lector'],
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
  vaciar(hojas.acuses)
  const filas = hojas.avisos.getDataRange().getValues().slice(1)
  const lineas = []
  const retenciones = []
  const acuses = []
  filas.forEach((f, i) => {
    const aviso = { id: String(f[0]), fecha: String(f[1]), remitente: String(f[2]) }
    const leido = leerAviso({ remitente: aviso.remitente, asunto: String(f[3]), cuerpo: String(f[4]), textoPdf: String(f[6]) })
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
  agregar(hojas.acuses, filasDeAcuses(aviso, leido))
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

// @ts-check
/* El borrador con que se manda una factura (spec 016 de semaforo-base): el texto y el mail entero, con
 * sus adjuntos, tal como lo guarda Gmail. Lo puro: no habla con Gmail. Lo hace mandar.js.
 *
 * El texto es el que el taller usa hoy, tal cual (respuesta 3 de la spec): "Buenos días, adjunto factura
 * A y conformidad de trabajos realizados." Desde las 13, "Buenas tardes". Sin copia a nadie.
 *
 * El robot sólo arma el borrador: lo manda una persona (R1). */

/**
 * @typedef {{ nombre: string, tipo: string, base64: string }} Adjunto
 * @typedef {{ para: string, asunto: string, cuerpo: string, adjuntos: Adjunto[] }} Borrador
 * @typedef {{ clase: string, nombre: string, tipo: string, ruta: string }} ArchivoParaMandar
 */

/**
 * @param {number} hora de 0 a 23, en Argentina
 * @returns {string}
 */
function saludoDelTaller(hora) {
  return hora < 13 ? 'Buenos días' : 'Buenas tardes'
}

/**
 * @param {number} hora
 * @param {string | null} letra la de la factura, leída del PDF
 * @returns {string}
 */
function cuerpoDelBorrador(hora, letra) {
  return `${saludoDelTaller(hora)}, adjunto factura ${letra ?? 'A'} y conformidad de trabajos realizados.`
}

/**
 * Los archivos en el orden en que van: la factura, la orden firmada y lo demás. A la factura le pone el
 * nombre que pide la compañía, si pide uno (la ficha, para Allianz).
 * @param {readonly ArchivoParaMandar[]} archivos
 * @param {string | null} nombreDeLaFactura
 * @returns {ArchivoParaMandar[]}
 */
function adjuntosEnOrden(archivos, nombreDeLaFactura) {
  const orden = ['factura', 'orden_firmada', 'otro']
  return [...archivos]
    .sort((a, b) => orden.indexOf(a.clase) - orden.indexOf(b.clase))
    .map((a) => (a.clase === 'factura' && nombreDeLaFactura ? { ...a, nombre: nombreDeLaFactura } : a))
}

const LIMITE_DEL_MAIL = '=_El_Semaforo_016'

/**
 * El mail entero, en el formato que Gmail recibe para un borrador (RFC 2822, partes MIME). Sale todo en
 * ASCII: el cuerpo y los adjuntos van en base64, y el asunto y los nombres, codificados.
 * @param {Borrador} b
 * @returns {string}
 */
function mensajeDelBorrador(b) {
  const partes = [
    [
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      enRenglones(utf8EnBase64(b.cuerpo)),
    ].join('\r\n'),
    ...b.adjuntos.map((a) => [
      `Content-Type: ${a.tipo}; name="${nombreEnAscii(a.nombre)}"`,
      `Content-Disposition: attachment; filename="${nombreEnAscii(a.nombre)}"; filename*=UTF-8''${nombreCodificado(a.nombre)}`,
      'Content-Transfer-Encoding: base64',
      '',
      enRenglones(a.base64.replace(/\s+/g, '')),
    ].join('\r\n')),
  ]
  return [
    `To: ${b.para}`,
    `Subject: ${encabezadoCodificado(b.asunto)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${LIMITE_DEL_MAIL}"`,
    '',
    ...partes.flatMap((p) => [`--${LIMITE_DEL_MAIL}`, p]),
    `--${LIMITE_DEL_MAIL}--`,
    '',
  ].join('\r\n')
}

/**
 * Un encabezado con tildes o "°" va como palabras codificadas (RFC 2047), de a pedazos que no corten
 * una letra a la mitad. Uno en ASCII va tal cual.
 * @param {string} texto
 * @returns {string}
 */
function encabezadoCodificado(texto) {
  if (/^[\x20-\x7e]*$/.test(texto)) return texto
  /** @type {string[]} */
  const pedazos = []
  let actual = ''
  for (const letra of texto) {
    if (utf8(actual + letra).length > 45) {
      pedazos.push(actual)
      actual = ''
    }
    actual += letra
  }
  if (actual !== '') pedazos.push(actual)
  return pedazos.map((p) => `=?UTF-8?B?${utf8EnBase64(p)}?=`).join('\r\n ')
}

/**
 * @param {string} nombre
 * @returns {string}
 */
function nombreEnAscii(nombre) {
  return nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]|["\\]/g, '_')
}

/**
 * @param {string} nombre
 * @returns {string}
 */
function nombreCodificado(nombre) {
  return encodeURIComponent(nombre).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

/**
 * @param {string} base64
 * @returns {string}
 */
function enRenglones(base64) {
  return (base64.match(/.{1,76}/g) ?? ['']).join('\r\n')
}

/**
 * Los bytes UTF-8 de un texto. Apps Script no tiene TextEncoder.
 * @param {string} texto
 * @returns {number[]}
 */
function utf8(texto) {
  /** @type {number[]} */
  const bytes = []
  for (const letra of texto) {
    const c = letra.codePointAt(0) ?? 0
    if (c < 0x80) bytes.push(c)
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
  }
  return bytes
}

const ALFABETO_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * @param {string} texto
 * @returns {string}
 */
function utf8EnBase64(texto) {
  const b = utf8(texto)
  let salida = ''
  for (let i = 0; i < b.length; i += 3) {
    const n = ((b[i] ?? 0) << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0)
    salida += ALFABETO_BASE64[(n >> 18) & 63]
    salida += ALFABETO_BASE64[(n >> 12) & 63]
    salida += i + 1 < b.length ? ALFABETO_BASE64[(n >> 6) & 63] : '='
    salida += i + 2 < b.length ? ALFABETO_BASE64[n & 63] : '='
  }
  return salida
}

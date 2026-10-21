// @ts-check
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

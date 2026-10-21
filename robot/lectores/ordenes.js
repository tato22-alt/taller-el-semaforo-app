// @ts-check
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

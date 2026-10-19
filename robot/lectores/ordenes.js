// @ts-check
/* Las órdenes de trabajo que llegan por mail. Spec 010 de semaforo-base.
 *
 * Dos plataformas mandan casi todas:
 *
 *  · Orion (sistemas@mg.sistema-orion.com), que usan varias compañías. El asunto lo dice casi todo:
 *      "Orden De Trabajo <COMPAÑÍA-CON-GUIONES>-<SINIESTRO><VEHÍCULO>-<PATENTE>-<PERITO>"
 *    El número de siniestro va pegado al vehículo, sin separador: se corta donde empieza la marca.
 *    El monto viene en el PDF adjunto. Una anulación llega con el mismo asunto, y el cuerpo dice
 *    "dejar sin efecto" o "no dar curso".
 *  · La Mercantil (…flowable-managed.com):
 *      "Orden de reparación – Siniestro N – Tasación N – Dominio X"
 *      "Anulación de Orden de reparación – Siniestro: N – Tasación N – Dominio: X"
 *    El perito y su mail vienen en el cuerpo; el monto queda en su portal.
 *
 * Lo que lee entra solo a la base (RF-1005, enmendado el 2026-10-18: nadie las carga a mano). Por
 * eso, ante la duda, deja el campo vacío antes que adivinar: un monto vacío se completa, uno
 * equivocado pasa desapercibido. */

/* El tipo Mail está en comun.js: en Apps Script todos los archivos comparten el ámbito. */

/**
 * @typedef {{
 *   readonly tipo: 'orden' | 'anulacion',
 *   readonly plataforma: 'orion' | 'mercantil',
 *   readonly compania: string | null,
 *   readonly siniestro: string | null,
 *   readonly patente: string | null,
 *   readonly vehiculo: string | null,
 *   readonly perito: string | null,
 *   readonly peritoMail: string | null,
 *   readonly monto: string | null,
 *   readonly franquicia: string | null,
 *   readonly repuestos: string | null,
 *   readonly lector: string,
 * }} OrdenLeida
 */

const VERSION_ORDENES = 3

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
]

/* Las marcas con las que empieza el vehículo: es donde termina el número de siniestro. */
const MARCAS = ['ALFA-ROMEO', 'AUDI', 'BAIC', 'BMW', 'CHERY', 'CHEVROLET', 'CITROEN', 'DODGE', 'DS', 'FIAT', 'FORD',
  'HONDA', 'HYUNDAI', 'IVECO', 'JEEP', 'KIA', 'MERCEDES-BENZ', 'MERCEDES', 'MITSUBISHI', 'NISSAN', 'PEUGEOT', 'RAM',
  'RENAULT', 'SUZUKI', 'TOYOTA', 'VOLKSWAGEN', 'VW']

const PATENTE_Y_PERITO = /-([A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d{3})-([A-ZÁÉÍÓÚÑ-]+)$/

/**
 * Lee una orden de trabajo. Devuelve null si el mail no es una orden (un recordatorio, un acuse).
 * @param {Mail} mail
 * @returns {OrdenLeida | null}
 */
function leerOrden(mail) {
  const direccion = direccionDe(mail.remitente)
  if (direccion === 'sistemas@mg.sistema-orion.com') return leerOrdenOrion(mail)
  if (direccion.endsWith('flowable-managed.com')) return leerOrdenMercantil(mail)
  return null
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
  const siniestro = marca && conocida ? sinCompania.slice(0, marca.i) : null
  const vehiculo = marca ? enPalabras(sinCompania.slice(marca.i)) : null

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
    // Una frase va de coma a coma (o renglón). Un punto seguido de un dígito es de miles ($340.000),
    // no el final de la frase.
    franquicia: frase(mail.cuerpo, /[^,\n.]*franquicia(?:[^,\n.]|\.(?=\d))*/i),
    repuestos: frase(mail.cuerpo, /[^,\n.]*repuesto(?:[^,\n.]|\.(?=\d))*/i),
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
  const esAnulacion = /anulaci[oó]n de orden de reparaci[oó]n/i.test(asunto)
  if (!esAnulacion && !/^orden de reparaci[oó]n/i.test(asunto.trim())) return null
  const siniestro = /siniestro:?\s*(\d+)/i.exec(asunto)
  const patente = /dominio:?\s*([A-Z]{2}\d{3}[A-Z]{2}|[A-Z]{3}\d{3})/i.exec(asunto)
  const perito = /perito interviniente,?\s*\*?([^*\n]+?)\*?,/i.exec(mail.cuerpo)
  const mailPerito = /email:\s*([^\s<>]+@[^\s<>]+)/i.exec(mail.cuerpo)
  return {
    tipo: esAnulacion ? 'anulacion' : 'orden',
    plataforma: 'mercantil',
    compania: 'Mercantil Andina',
    siniestro: siniestro ? (siniestro[1] ?? null) : null,
    patente: patente ? (patente[1] ?? '').toUpperCase() : null,
    vehiculo: null,
    perito: perito ? (perito[1] ?? '').trim() : null,
    peritoMail: mailPerito ? (mailPerito[1] ?? '').toLowerCase() : null,
    monto: null,
    franquicia: null,
    repuestos: null,
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

/** "FERNANDO-ALFREDOANTIVERO" → "FERNANDO ALFREDOANTIVERO". @param {string} texto */
function enPalabras(texto) {
  return texto.replace(/-+/g, ' ').trim()
}

/** La primera oración que cumple el patrón, en un renglón. @param {string} texto @param {RegExp} patron */
function frase(texto, patron) {
  const m = patron.exec(texto)
  return m ? enUnRenglon(m[0]).trim() : null
}

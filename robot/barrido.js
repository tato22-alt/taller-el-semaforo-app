/* El barrido de Gmail. Plan 005, fase 0: el corpus, sin tocar la base.
 *
 * Es lo único que habla con Google. Corre dentro de la cuenta del taller, ligado a una planilla,
 * y escribe ahí, en pestañas:
 *   remitentes   de quién se esperan avisos de pago (se edita a mano; es un dato, no código)
 *   avisos       cada mail de esos remitentes, una vez, con su cuerpo y el texto de sus PDF
 *   lineas       qué factura (o siniestro) nombra cada aviso, bruto y neto, y si el aviso cierra
 *   retenciones  las retenciones que informa cada aviso
 *   acuses       "recibimos / aprobamos tu factura", "la fecha de pago es…": NO son pagos (R3)
 *   enviados     las facturas que mandó el taller, con el asunto estándar. Se suben a la base
 *                (spec 012): con ellas la base vincula sola cada factura a su orden
 *   ordenes      las órdenes de trabajo (spec 010). Éstas además se suben solas a la base: la
 *                columna "base" dice qué contestó (cargada, a_confirmar, ya_estaba, sin_compania…)
 *   dominios_ordenes  de qué dominios se esperan órdenes mandadas por una persona, con su compañía
 *                (las compañías las suma el robot; los estudios y peritos se agregan acá a mano)
 *
 * Permisos (appsscript.json): leer Gmail, crear archivos propios en Drive, escribir en esta
 * planilla, llamar a la API de Drive para sacar el texto de los PDF, y Google Calendar para el
 * calendario del taller (calendario.js, spec 015). Ninguno deja mandar, borrar ni modificar un mail
 * (R1): no es una promesa, es lo que Google le autoriza.
 *
 * Se puede correr todas las veces que se quiera: un mail que ya está en la planilla se saltea.
 * Cada corrida para a los 4 minutos y medio (Apps Script corta a los 6) y la siguiente sigue
 * donde quedó. */

const DESDE = '2025/01/01'
const ZONA = 'America/Argentina/Buenos_Aires'
const LIMITE_MS = 4.5 * 60 * 1000
/** Entre mail y mail al releer: Gmail corta si se le piden demasiados por minuto. */
const PAUSA_GMAIL_MS = 300
/** Una celda de Sheets admite 50.000 caracteres. */
const MAX_CELDA = 49000

const COLUMNAS = {
  remitentes: ['remitente', 'compañía'],
  avisos: ['message_id', 'fecha', 'remitente', 'asunto', 'cuerpo', 'pdfs', 'texto_pdf', 'lector', 'version', 'estado', 'motivo', 'control', 'pdfs_drive', 'base'],
  lineas: ['message_id', 'fecha_aviso', 'remitente', 'tipo', 'op', 'fecha_pago', 'factura_como_dice', 'punto_venta', 'numero', 'siniestro', 'bruto', 'neto', 'neto_del_aviso', 'control', 'lector', 'version'],
  retenciones: ['message_id', 'certificado', 'concepto', 'impuesto', 'importe'],
  acuses: ['message_id', 'fecha', 'remitente', 'tipo', 'factura_como_dice', 'punto_venta', 'numero', 'siniestro', 'monto', 'fecha_prometida', 'referencia', 'lector'],
  enviados: ['message_id', 'fecha', 'para', 'asunto', 'tipo', 'factura', 'siniestro', 'orden_de_compra', 'base'],
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
    // Cualquier asunto con "factura": el estándar, y los escritos a mano ("Factura: 3586",
    // "Siniestro … Factura 3308"). Lo que no es un envío queda como 'otro'.
    `in:sent subject:factura after:${DESDE}`,
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
  // Primero las órdenes, después los envíos y al final los avisos: la base vincula cada factura a una
  // orden que ya esté, y un pago a una factura que ya tenga su orden.
  const subidas = subirOrdenes(hojas.ordenes, inicio)
  const envios = subirEnvios(hojas.enviados, inicio)
  const avisos = subirAvisos(hojas.avisos, inicio)
  // Al final, el calendario (spec 015): con lo que la base ya sabe después de esta corrida.
  const calendario = sincronizarCalendarioSinCortar(inicio)
  console.log(`Avisos nuevos: ${nuevosAvisos.guardados}. Envíos nuevos: ${nuevosEnvios.guardados}. ` +
    `Mails de órdenes nuevos: ${nuevasOrdenes.guardados + paraConfirmar.guardados}. ${subidas} ${envios} ${avisos} ${calendario}` +
    (nuevosAvisos.cortado || nuevosEnvios.cortado || nuevasOrdenes.cortado || paraConfirmar.cortado ? ' Quedan más: la próxima corrida sigue.' : ' Al día.'))
}

/**
 * Vuelve a leer todos los avisos de la planilla con los lectores de hoy, sin ir a Gmail (RF-508).
 * Se corre a mano después de corregir o agregar un lector. Rehace "lineas" y "retenciones", y marca
 * para volver a subir a la base los avisos cuya lectura cambió (la base guarda la nueva y deja la
 * vieja: nada se borra).
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
    const estado = estadoDe(leido)
    // Si cambió el lector, la versión, el estado o el control, la base tiene que ver la lectura nueva.
    if ([0, 1, 2, 4].some((k) => String(f[7 + k] ?? '') !== String(estado[k] ?? ''))) hojas.avisos.getRange(i + 2, 14).setValue('')
    hojas.avisos.getRange(i + 2, 8, 1, 5).setValues([estado])
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
  const cuerpo = cuerpoDe(partes)

  const { nombres, idsDrive, textoPdf } = guardarPdfs(id, partes, aviso.fecha)

  const leido = leerAviso({ remitente: aviso.remitente, asunto, cuerpo, textoPdf, adjuntos: adjuntosDe(partes), copia: encabezado(msg, 'Cc') })
  // Se lee el texto tal cual y se guarda sin claves (lectores/claves.js).
  agregar(hojas.avisos, [[id, aviso.fecha, aviso.remitente, asunto, cortar(paraGuardar(cuerpo)), nombres.join('\n'), cortar(paraGuardar(textoPdf)), ...estadoDe(leido), idsDrive.join('\n')]])
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
    cuerpo: paraGuardar(cuerpoDe(partes)),
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
  // Por dónde iba la vuelta anterior, si se cortó: una 'otro' releída sigue siendo 'otro', y empezar
  // siempre de arriba haría que nunca se llegue al final.
  const props = PropertiesService.getScriptProperties()
  let i = Number(props.getProperty('releer_desde_fila') || 0)
  let releidas = 0
  let ahoraEntran = 0
  let corte = ''
  for (; i < filas.length; i++) {
    const f = filas[i] ?? []
    if (!hayQueReleer(f)) continue
    if (Date.now() - inicio > LIMITE_MS) { corte = 'se acabó el tiempo'; break }
    let nueva
    try {
      nueva = filaParaMail(String(f[0]), dominios, String(f[13] ?? '').split('\n').filter((d) => d !== ''))
    } catch (e) {
      // Gmail limita cuántos mails se piden por minuto: se frena acá y la próxima vez sigue.
      if (!/quota|rate ?limit/i.test(String(e.message))) throw e
      corte = 'Gmail pidió una pausa'
      break
    }
    hojas.ordenes.getRange(i + 2, 1, 1, nueva.length).setValues([nueva])
    releidas++
    if (!hayQueReleer(nueva)) ahoraEntran++
    Utilities.sleep(PAUSA_GMAIL_MS)
  }
  if (corte) props.setProperty('releer_desde_fila', String(i))
  else props.deleteProperty('releer_desde_fila')
  console.log(`Releídos ${releidas} mails: ${ahoraEntran} ahora pueden entrar a la base. ` +
    (corte ? `Quedan más (${corte}): esperá un minuto y ejecutá releerOrdenesOtro de nuevo, sigue desde la fila ${i + 2}.` : 'Terminó.'))
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
  if (!hayPropiedadesDelRobot()) return 'Órdenes sin subir: faltan las propiedades del robot.'

  const pendientes = hoja.getDataRange().getValues().slice(1)
    .map((f, i) => ({ f, fila: i + 2 }))
    .filter(({ f }) => (f[3] === 'orden' || f[3] === 'anulacion') && !SUBIDA_TERMINADA.includes(String(f[15])))
    .sort((a, b) => String(a.f[1]).localeCompare(String(b.f[1])))
  if (pendientes.length === 0) return 'Órdenes en la base: al día.'

  const sesion = entrarALaBase()
  if (typeof sesion === 'string') return `Órdenes sin subir: ${sesion}.`
  const { url, clave, token } = sesion

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

/** ¿Están las cuatro propiedades con que el robot entra a la base? */
function hayPropiedadesDelRobot() {
  const props = PropertiesService.getScriptProperties()
  return ['SUPABASE_URL', 'SUPABASE_CLAVE_PUBLICA', 'ROBOT_MAIL', 'ROBOT_CLAVE'].every((k) => !!props.getProperty(k))
}

/**
 * Entra a la base con el usuario del robot. Devuelve la URL, la clave pública y el token, o por qué
 * no pudo (para el registro).
 * @returns {{ url: string, clave: string, token: string } | string}
 */
function entrarALaBase() {
  const props = PropertiesService.getScriptProperties()
  const url = props.getProperty('SUPABASE_URL')
  const clave = props.getProperty('SUPABASE_CLAVE_PUBLICA')
  const r = UrlFetchApp.fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'post', contentType: 'application/json', headers: { apikey: clave },
    payload: JSON.stringify({ email: props.getProperty('ROBOT_MAIL'), password: props.getProperty('ROBOT_CLAVE') }),
    muteHttpExceptions: true,
  })
  if (r.getResponseCode() !== 200) return `el robot no pudo entrar a la base (HTTP ${r.getResponseCode()})`
  return { url: String(url), clave: String(clave), token: JSON.parse(r.getContentText()).access_token }
}

/* Lo que contesta la base por un envío de factura. Cualquiera de éstas quiere decir que la base ya lo
 * tiene: si todavía no vinculó (falta el CSV de ARCA, hay dos órdenes), lo vuelve a intentar ella
 * sola cuando se sube el CSV. Un error (de red, de permisos) se reintenta en la próxima corrida. */
const ENVIO_EN_LA_BASE = ['vinculada', 'ya_estaba', 'sin_factura_en_arca', 'factura_ambigua', 'sin_siniestro', 'sin_orden', 'varias_ordenes']

/**
 * Sube a la base los envíos de factura de la pestaña que todavía no entraron (spec 012, RF-1201): la
 * base busca la factura en ARCA y la orden de ese siniestro, y si no hay dudas las vincula.
 * @returns {string} una línea para el registro
 */
function subirEnvios(hoja, inicio = Date.now()) {
  if (!hayPropiedadesDelRobot()) return 'Envíos sin subir: faltan las propiedades del robot.'
  const pendientes = hoja.getDataRange().getValues().slice(1)
    .map((f, i) => ({ f, fila: i + 2 }))
    .filter(({ f }) => f[4] === 'envio' && Number(f[5]) > 0 && !ENVIO_EN_LA_BASE.includes(String(f[8] ?? '')))
    .sort((a, b) => String(a.f[1]).localeCompare(String(b.f[1])))
  if (pendientes.length === 0) return 'Envíos en la base: al día.'

  const sesion = entrarALaBase()
  if (typeof sesion === 'string') return `Envíos sin subir: ${sesion}.`
  const { url, clave, token } = sesion

  let vinculadas = 0
  let hechas = 0
  for (const { f, fila } of pendientes) {
    if (Date.now() - inicio > LIMITE_SUBIDA_MS) return `Envíos a la base: ${hechas}, con ${vinculadas} facturas vinculadas; quedan ${pendientes.length - hechas}, siguen en la próxima corrida.`
    const r = UrlFetchApp.fetch(`${url}/rest/v1/rpc/fn_robot_registra_envio`, {
      method: 'post', contentType: 'application/json', headers: { apikey: clave, Authorization: `Bearer ${token}` },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        p_gmail_message_id: String(f[0]), p_fecha: String(f[1]).slice(0, 10), p_numero: Number(f[5]),
        p_siniestro: String(f[6] ?? '') || null, p_para: String(f[2] ?? '') || null,
      }),
    })
    const respuesta = r.getResponseCode() === 200 ? JSON.parse(r.getContentText()) : `error HTTP ${r.getResponseCode()}: ${r.getContentText().slice(0, 200)}`
    hoja.getRange(fila, 9).setValue(respuesta)
    if (respuesta === 'vinculada') vinculadas++
    hechas++
  }
  return `Envíos a la base: ${hechas}, con ${vinculadas} facturas vinculadas a su orden.`
}

/**
 * Sube a la base los avisos de la pestaña que todavía no entraron (fase 2 de cobranzas): el mail como
 * está en la planilla y lo que dice su lector hoy, por fn_robot_guarda_aviso. La base guarda la
 * evidencia, vincula las órdenes que el aviso nombra con factura y siniestro, y deriva qué facturas
 * están pagadas. Lo que contesta queda en la columna "base"; un error se reintenta en la próxima
 * corrida. Comparte el reloj con el barrido.
 * @returns {string} una línea para el registro
 */
function subirAvisos(hoja, inicio = Date.now()) {
  if (!hayPropiedadesDelRobot()) return 'Avisos sin subir: faltan las propiedades del robot.'
  const pendientes = hoja.getDataRange().getValues().slice(1)
    .map((f, i) => ({ f, fila: i + 2 }))
    .filter(({ f }) => avisoPendienteDeSubir(f))
    .sort((a, b) => String(a.f[1]).localeCompare(String(b.f[1])))
  if (pendientes.length === 0) return 'Avisos en la base: al día.'

  const sesion = entrarALaBase()
  if (typeof sesion === 'string') return `Avisos sin subir: ${sesion}.`
  const { url, clave, token } = sesion

  let vinculadas = 0
  let hechas = 0
  for (const { f, fila } of pendientes) {
    if (Date.now() - inicio > LIMITE_SUBIDA_MS) return `Avisos a la base: ${hechas}, con ${vinculadas} órdenes vinculadas; quedan ${pendientes.length - hechas}, siguen en la próxima corrida.`
    const r = UrlFetchApp.fetch(`${url}/rest/v1/rpc/fn_robot_guarda_aviso`, {
      method: 'post', contentType: 'application/json', headers: { apikey: clave, Authorization: `Bearer ${token}` },
      muteHttpExceptions: true,
      payload: JSON.stringify({ p_aviso: avisoParaLaBase(f) }),
    })
    if (r.getResponseCode() === 200) {
      const respuesta = JSON.parse(r.getContentText())
      hoja.getRange(fila, 14).setValue(respuestaDeLaBase(respuesta))
      vinculadas += Number(respuesta.vinculadas) || 0
    } else {
      hoja.getRange(fila, 14).setValue(`error HTTP ${r.getResponseCode()}: ${r.getContentText().slice(0, 200)}`)
    }
    hechas++
  }
  return `Avisos a la base: ${hechas}, con ${vinculadas} órdenes vinculadas.`
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

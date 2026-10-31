/* La factura lista para mandar (spec 016 de semaforo-base). Es lo único del robot que escribe en Gmail,
 * y lo único que escribe es un BORRADOR: lo manda una persona (R1).
 *
 * En cada corrida, al final del barrido, le pide a la base dos listas (fn_robot_facturas_para_mandar):
 * - armar: las facturas con la factura y la orden firmada subidas desde la app. Baja los archivos del
 *   espacio "facturas-para-mandar", lee la factura (lectores/factura-arca.js), le pregunta a la base si
 *   cierra con la orden (fn_robot_controla_factura) y, si cierra, arma el borrador con los adjuntos
 *   (lectores/borrador.js) y lo anota con su conversación de Gmail.
 * - mirar: los borradores armados. Si en su conversación hay un mail enviado, lo anota como mandado (y
 *   la base registra el envío con el número del PDF); si el borrador ya no está, como borrado.
 *
 * Permiso (appsscript.json): el de Gmail para crear borradores (gmail.compose). Google no tiene uno que
 * deje crear borradores sin dejar mandar: lo que garantiza que no manda es el código, y un test lo
 * verifica (ninguna llamada a "send" en el robot). */

const ESPACIO_FACTURAS = 'facturas-para-mandar'

/**
 * Arma los borradores que estén listos y mira los que ya están. La llama barrer() al final de cada
 * corrida; la primera vez se corre a mano, para dar el permiso de Gmail.
 * @returns {string} una línea para el registro
 */
function armarFacturas(inicio = Date.now()) {
  if (!hayPropiedadesDelRobot()) return 'Facturas sin armar: faltan las propiedades del robot.'
  const sesion = entrarALaBase()
  if (typeof sesion === 'string') return `Facturas sin armar: ${sesion}.`
  const listas = llamarALaBase(sesion, 'fn_robot_facturas_para_mandar', {})
  if (typeof listas === 'string') return `Facturas sin armar: ${listas}`

  const hecho = { mandadas: 0, borradas: 0, armadas: 0, noCierran: 0, errores: /** @type {string[]} */ ([]) }
  for (const m of listas.mirar) {
    try {
      const visto = loQueSeVeDelBorrador(m)
      if (visto === null) continue
      const r = llamarALaBase(sesion, 'fn_robot_anota_lo_visto',
        { p_id: m.id, p_visto: visto.visto, p_message_id: visto.visto === 'mandado' ? visto.id : null, p_fecha: visto.visto === 'mandado' ? visto.fecha : null })
      if (typeof r === 'string' && /^error/.test(r)) hecho.errores.push(r)
      else if (visto.visto === 'mandado') hecho.mandadas++
      else hecho.borradas++
    } catch (e) {
      hecho.errores.push(`borrador ${m.borrador}: ${(e && e.message) || e}`)
    }
  }
  let quedan = 0
  for (const a of listas.armar) {
    if (Date.now() - inicio > LIMITE_SUBIDA_MS) {
      quedan++
      continue
    }
    try {
      const r = armarUnaFactura(sesion, a)
      if (r === 'armada') hecho.armadas++
      else if (r === 'no_cierra') hecho.noCierran++
      else hecho.errores.push(r)
    } catch (e) {
      hecho.errores.push(`orden ${a.orden}: ${(e && e.message) || e}`)
    }
  }

  const cuantos = (n, uno, varios) => (n === 0 ? '' : `${n} ${n === 1 ? uno : varios}`)
  const partes = [
    cuantos(hecho.armadas, 'borrador armado', 'borradores armados'),
    cuantos(hecho.noCierran, 'no cierra (lo dice la tarjeta)', 'no cierran (lo dice la tarjeta)'),
    cuantos(hecho.mandadas, 'mandada', 'mandadas'),
    cuantos(hecho.borradas, 'borrador borrado sin mandar', 'borradores borrados sin mandar'),
    quedan > 0 ? `quedan ${quedan}, siguen en la próxima corrida` : '',
    hecho.errores.length > 0 ? `${hecho.errores.length} con error (${hecho.errores[0]})` : '',
  ].filter((p) => p !== '')
  return partes.length === 0 ? 'Facturas para mandar: nada nuevo.' : `Facturas para mandar: ${partes.join(', ')}.`
}

/** Lo mismo, sin dejar que un error corte el barrido: queda en el registro. */
function armarFacturasSinCortar(inicio) {
  try {
    return armarFacturas(inicio)
  } catch (e) {
    return `Facturas sin armar: ${(e && e.message) || e}`
  }
}

/**
 * Baja los archivos, lee la factura, pregunta a la base y, si cierra, arma el borrador.
 * @returns {string} 'armada', 'no_cierra' o el error
 */
function armarUnaFactura(sesion, a) {
  const archivos = a.archivos.map((x) => ({ ...x, blob: bajarArchivo(sesion, x) }))
  const factura = archivos.find((x) => x.clase === 'factura')
  if (!factura) return `orden ${a.orden}: falta la factura`
  const leido = leerFacturaArca(textoDePdf(factura.blob))
  const control = llamarALaBase(sesion, 'fn_robot_controla_factura', { p_id: a.id, p_leido: leido })
  if (typeof control === 'string') return `orden ${a.orden}: ${control}`
  if (!control.armar) return 'no_cierra'

  const hora = Number(Utilities.formatDate(new Date(), ZONA, 'H'))
  const adjuntos = adjuntosEnOrden(archivos, control.archivo)
    .map((x) => ({ nombre: x.nombre, tipo: x.tipo, base64: Utilities.base64Encode(x.blob.getBytes()) }))
  const mensaje = mensajeDelBorrador({ para: control.para, asunto: control.asunto, cuerpo: cuerpoDelBorrador(hora, leido.letra), adjuntos })
  const borrador = Gmail.Users.Drafts.create({ message: { raw: Utilities.base64EncodeWebSafe(mensaje) } }, 'me')
  const anotado = llamarALaBase(sesion, 'fn_robot_anota_borrador', { p_id: a.id, p_borrador_id: borrador.id, p_hilo_id: borrador.message.threadId })
  return typeof anotado === 'string' && /^error/.test(anotado) ? `orden ${a.orden}: el borrador se armó pero no se anotó (${anotado})` : 'armada'
}

/**
 * ¿Se mandó el borrador, o se borró? Se mira la conversación, no el asunto: así se reconoce aunque una
 * persona lo cambie antes de mandar, o aunque no diga el número (Allianz).
 * @returns {{ visto: 'mandado', id: string, fecha: string } | { visto: 'borrado' } | null} null: sigue esperando
 */
function loQueSeVeDelBorrador(m) {
  const hilo = siExiste(() => Gmail.Users.Threads.get('me', m.hilo, { format: 'minimal' }))
  const enviado = hilo && (hilo.messages || [])
    .find((x) => (x.labelIds || []).includes('SENT') && !(x.labelIds || []).includes('DRAFT'))
  if (enviado) return { visto: 'mandado', id: enviado.id, fecha: Utilities.formatDate(new Date(Number(enviado.internalDate)), ZONA, 'yyyy-MM-dd') }
  if (siExiste(() => Gmail.Users.Drafts.get('me', m.borrador, { format: 'minimal' })) === null) return { visto: 'borrado' }
  return null
}

/** Lo que devuelve Gmail, o null si no existe. Cualquier otro error sigue de largo: no es "se borró". */
function siExiste(pedir) {
  try {
    return pedir()
  } catch (e) {
    if (/not found|no se encontr|404/i.test(String((e && e.message) || e))) return null
    throw e
  }
}

/** Un archivo del espacio de la base, con el token del robot (que sólo puede leer). */
function bajarArchivo({ url, clave, token }, archivo) {
  const ruta = archivo.ruta.split('/').map(encodeURIComponent).join('/')
  const r = UrlFetchApp.fetch(`${url}/storage/v1/object/authenticated/${ESPACIO_FACTURAS}/${ruta}`, {
    headers: { apikey: clave, Authorization: `Bearer ${token}` }, muteHttpExceptions: true,
  })
  if (r.getResponseCode() !== 200) throw new Error(`no se pudo bajar "${archivo.nombre}" (HTTP ${r.getResponseCode()})`)
  return r.getBlob().setName(archivo.nombre).setContentType(archivo.tipo)
}

/**
 * Una función de la base. Devuelve lo que contesta, o un texto que empieza con "error".
 * @returns {any}
 */
function llamarALaBase({ url, clave, token }, funcion, datos) {
  const r = UrlFetchApp.fetch(`${url}/rest/v1/rpc/${funcion}`, {
    method: 'post', contentType: 'application/json', headers: { apikey: clave, Authorization: `Bearer ${token}` },
    muteHttpExceptions: true, payload: JSON.stringify(datos),
  })
  if (r.getResponseCode() !== 200 && r.getResponseCode() !== 204) return `error HTTP ${r.getResponseCode()}: ${r.getContentText().slice(0, 200)}`
  const texto = r.getContentText()
  return texto === '' ? null : JSON.parse(texto)
}

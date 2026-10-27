/* El calendario del taller (spec 015 de semaforo-base). Es lo único del robot que habla con Google
 * Calendar.
 *
 * Una vez por hora, al final del barrido: le pide a la base las fechas de hoy en adelante
 * (fn_robot_fechas_calendario) y deja igual el calendario "El Semáforo" de la cuenta del taller. Qué
 * crear, cambiar o borrar lo decide planDelCalendario (lectores/calendario.js, con tests); acá sólo se
 * hace.
 *
 * - Sólo toca los eventos con su marca: una propiedad oculta del evento con la marca que dio la base.
 *   Lo que carga una persona en el mismo calendario no lo toca nunca (RF-1504).
 * - No toca nada de antes de hoy: lo que pasó queda como está.
 * - Nunca agrega invitados: a un invitado Google le manda un mail, y el robot no le manda nada a nadie
 *   (R1). Un test lo verifica.
 *
 * Permiso (appsscript.json): el de Google Calendar. Apps Script no tiene uno más chico que deje crear
 * un calendario. */

const NOMBRE_CALENDARIO = 'El Semáforo'
const DESCRIPCION_CALENDARIO = 'Turnos, vencimientos de órdenes y fechas de pago, puestos solos por el robot del taller ' +
  'desde la app. Se le pueden agregar eventos a mano (pagos a proveedores, la VTV): el robot no los toca.'
/** La propiedad oculta donde cada evento del robot guarda su marca. */
const PROPIEDAD_DEL_ROBOT = 'semaforo'
/** Hasta dónde mira: lo más lejano es el vencimiento de una orden, al año. */
const ANIOS_ADELANTE = 2

/**
 * Pone el calendario al día. La llama barrer() al final de cada corrida; la primera vez se corre a mano,
 * para dar el permiso de Calendar.
 * @returns {string} una línea para el registro
 */
function sincronizarCalendario(inicio = Date.now()) {
  if (!hayPropiedadesDelRobot()) return 'Calendario sin actualizar: faltan las propiedades del robot.'
  const sesion = entrarALaBase()
  if (typeof sesion === 'string') return `Calendario sin actualizar: ${sesion}.`
  const { url, clave, token } = sesion
  const r = UrlFetchApp.fetch(`${url}/rest/v1/rpc/fn_robot_fechas_calendario`, {
    method: 'post', contentType: 'application/json', headers: { apikey: clave, Authorization: `Bearer ${token}` },
    muteHttpExceptions: true, payload: '{}',
  })
  if (r.getResponseCode() !== 200) return `Calendario sin actualizar: error HTTP ${r.getResponseCode()}: ${r.getContentText().slice(0, 200)}`
  const fechas = JSON.parse(r.getContentText())

  const calendario = calendarioDelTaller()
  const hoy = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd')
  const desde = aDiaDelCalendario(hoy)
  const hasta = new Date(desde.getFullYear() + ANIOS_ADELANTE, desde.getMonth(), desde.getDate())
  const porId = new Map()
  const eventos = []
  for (const e of calendario.getEvents(desde, hasta)) {
    const marca = e.getTag(PROPIEDAD_DEL_ROBOT)
    if (!marca || !e.isAllDayEvent()) continue
    const fecha = Utilities.formatDate(e.getAllDayStartDate(), ZONA, 'yyyy-MM-dd')
    // Google devuelve también lo que termina justo hoy a las 0: eso es de ayer, y no se toca.
    if (fecha < hoy) continue
    porId.set(e.getId(), e)
    eventos.push({ id: e.getId(), marca, fecha, titulo: e.getTitle(), descripcion: e.getDescription() })
  }

  const plan = planDelCalendario(fechas, eventos)
  const hecho = { borrados: 0, cambiados: 0, creados: 0 }
  const pendientes = plan.borrar.length + plan.cambiar.length + plan.crear.length
  for (const id of plan.borrar) {
    if (Date.now() - inicio > LIMITE_SUBIDA_MS) break
    porId.get(id).deleteEvent()
    hecho.borrados++
  }
  for (const { id, fecha } of plan.cambiar) {
    if (Date.now() - inicio > LIMITE_SUBIDA_MS) break
    const e = porId.get(id)
    if (Utilities.formatDate(e.getAllDayStartDate(), ZONA, 'yyyy-MM-dd') !== fecha.fecha) e.setAllDayDate(aDiaDelCalendario(fecha.fecha))
    if (e.getTitle() !== fecha.titulo) e.setTitle(fecha.titulo)
    if (e.getDescription() !== fecha.descripcion) e.setDescription(fecha.descripcion)
    hecho.cambiados++
  }
  for (const fecha of plan.crear) {
    if (Date.now() - inicio > LIMITE_SUBIDA_MS) break
    calendario.createAllDayEvent(fecha.titulo, aDiaDelCalendario(fecha.fecha), { description: fecha.descripcion })
      .setTag(PROPIEDAD_DEL_ROBOT, fecha.marca)
    hecho.creados++
  }

  if (pendientes === 0) return `Calendario al día: ${fechas.length} fechas.`
  const hechos = hecho.borrados + hecho.cambiados + hecho.creados
  return `Calendario: ${hecho.creados} eventos nuevos, ${hecho.cambiados} cambiados y ${hecho.borrados} borrados` +
    (hechos < pendientes ? `; quedan ${pendientes - hechos}, siguen en la próxima corrida.` : '.')
}

/** Lo mismo, sin dejar que un error del calendario corte el barrido: queda en el registro. */
function sincronizarCalendarioSinCortar(inicio) {
  try {
    return sincronizarCalendario(inicio)
  } catch (e) {
    return `Calendario sin actualizar: ${(e && e.message) || e}`
  }
}

/** El calendario "El Semáforo" de la cuenta del taller. Si no está, lo crea, con la hora de Argentina. */
function calendarioDelTaller() {
  const propio = CalendarApp.getCalendarsByName(NOMBRE_CALENDARIO).find((c) => c.isOwnedByMe())
  return propio ?? CalendarApp.createCalendar(NOMBRE_CALENDARIO, { summary: DESCRIPCION_CALENDARIO, timeZone: ZONA })
}

/** "2026-10-27" → el día 27/10/2026 a las 0, en la zona del script (la de Argentina). */
function aDiaDelCalendario(fecha) {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return new Date(anio, mes - 1, dia)
}

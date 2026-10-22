/* Los mensajes al cliente: cuál corresponde y qué dice. Spec 011 de semaforo-base, RF-1109.
 *
 * Uno por momento, y sólo uno: nada de una lista de plantillas para elegir. Son de la app (principio
 * III): se cambian acá, sin tocar la base. Los arma la app; los manda una persona desde WhatsApp
 * (R1). */

/** Cada momento tiene su mensaje (RF-1109). */
export type Mensaje = 'dar_turno' | 'confirmar_turno' | 'recordar_turno' | 'reprogramar' | 'retirar' | 'recordar_retiro'

/** A los cuántos días de listo sin retirar, el mensaje pasa a ser un recordatorio. */
export const DIAS_PARA_RECORDAR_RETIRO = 3

/** Los días que entrega la base (vw_autos_en_taller). */
type Dias = { readonly diasListo: number | null; readonly diasParaTurno: number | null; readonly diasSinTurno: number | null }

/** Lo que el mensaje nombra. diaDelTurno va escrito ("miércoles 28/10"): lo arma dominio/fechas.ts. */
type DatosDelMensaje = {
  readonly cliente: string | null
  readonly vehiculo: string | null
  readonly patente: string | null
  readonly diaDelTurno: string
  readonly diasParaTurno: number | null
}

const TALLER = 'El Semáforo'

/** El mensaje que corresponde a cómo está el auto, o nulo si no hay ninguno que mandar. Lo listo va
 *  primero: un auto listo ya no espera repuestos ni turno. */
export function mensajeDe(a: Dias): Mensaje | null {
  if (a.diasListo !== null) return a.diasListo >= DIAS_PARA_RECORDAR_RETIRO ? 'recordar_retiro' : 'retirar'
  if (a.diasParaTurno !== null) {
    if (a.diasParaTurno <= 0) return 'reprogramar'
    if (a.diasParaTurno === 1) return 'recordar_turno'
    return 'confirmar_turno'
  }
  if (a.diasSinTurno !== null) return 'dar_turno'
  return null
}

/** Lo que dice el botón de cada mensaje. */
export function etiquetaDeMensaje(m: Mensaje): string {
  switch (m) {
    case 'dar_turno':
      return 'Mensaje para darle turno'
    case 'confirmar_turno':
      return 'Confirmarle el turno'
    case 'recordar_turno':
      return 'Recordarle el turno'
    case 'reprogramar':
      return 'No vino: mensaje para reprogramar'
    case 'retirar':
      return 'Avisarle que pase a retirarlo'
    case 'recordar_retiro':
      return 'Recordarle que pase a retirarlo'
  }
}

/** El texto del mensaje, con el nombre, el vehículo y la fecha de ese auto. */
export function textoDelMensaje(m: Mensaje, a: DatosDelMensaje): string {
  const hola = saludo(a.cliente)
  const auto = elAuto(a.vehiculo, a.patente)
  switch (m) {
    case 'dar_turno':
      return `${hola}, te escribimos de ${TALLER}. Ya llegaron los repuestos de ${auto}. ¿Qué día te queda bien traerlo? Así te damos turno.`
    case 'confirmar_turno':
      return `${hola}, te confirmamos el turno en ${TALLER} para el ${a.diaDelTurno}, para ${auto}. ¡Te esperamos!`
    case 'recordar_turno':
      return `${hola}, te recordamos que mañana, ${a.diaDelTurno}, tenés turno en ${TALLER} para ${auto}. ¡Te esperamos!`
    case 'reprogramar':
      return a.diasParaTurno === 0
        ? `${hola}, te escribimos de ${TALLER}: hoy tenías turno para ${auto}. ¿Venís igual, o te damos otro día?`
        : `${hola}, te escribimos de ${TALLER}: te esperábamos el ${a.diaDelTurno} con ${auto}. ¿Te damos otro turno?`
    case 'retirar':
      return `${hola}, ${auto} ya está listo. Podés pasar a retirarlo por ${TALLER} cuando quieras.`
    case 'recordar_retiro':
      return `${hola}, te recordamos que ${auto} ya está listo y te espera en ${TALLER}.`
  }
}

/** "Hola Juan Pérez". El nombre va como se cargó en el presupuesto; si se cargó todo en mayúsculas,
 *  se pasa a como se escribe un nombre, para que el mensaje no parezca un grito. */
export function saludo(cliente: string | null): string {
  const nombre = (cliente ?? '').trim().replace(/\s+/g, ' ')
  if (nombre === '') return 'Hola'
  if (nombre !== nombre.toUpperCase()) return `Hola ${nombre}`
  const escrito = nombre.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, antes: string, letra: string) => antes + letra.toUpperCase())
  return `Hola ${escrito}`
}

/** "tu Ford Ka (AB123CD)", "tu auto (AB123CD)" o "tu auto". */
function elAuto(vehiculo: string | null, patente: string | null): string {
  const que = vehiculo !== null && vehiculo.trim() !== '' ? vehiculo.trim() : 'auto'
  return patente !== null && patente.trim() !== '' ? `tu ${que} (${patente.trim()})` : `tu ${que}`
}

/* Los hitos del auto: qué hay que hacer hoy con cada uno. Spec 011 de semaforo-base.
 *
 * La base entrega fechas y días (vw_autos_en_taller): cuántos días lleva en el taller, cuántos hace
 * que llegaron los repuestos sin turno, cuántos faltan para el turno (negativo si pasó y no entró),
 * cuántos lleva listo sin que lo retiren. Acá se decide qué significa eso para una persona del
 * taller (principio III): qué pregunta le hace la app (RF-1108), qué botones se ven y en qué orden.
 * Qué mensaje corresponde y con qué texto (RF-1109) está en mensajes.ts. */

export type TipoHito = 'repuestos' | 'turno' | 'entro' | 'listo' | 'salio'

export const TIPOS_DE_HITO: readonly TipoHito[] = ['repuestos', 'turno', 'entro', 'listo', 'salio']

export type Auto = {
  readonly idTrabajo: number
  readonly numeroPresupuesto: number | null
  /** Tal como se imprimieron en el presupuesto. */
  readonly patente: string | null
  readonly vehiculo: string | null
  readonly cliente: string | null
  readonly telefono: string | null
  readonly repuestosLlegaron: string | null
  readonly turnoPara: string | null
  readonly entro: string | null
  readonly listo: string | null
  readonly salio: string | null
  readonly enTaller: boolean
  readonly diasEnTaller: number | null
  /** Llegaron los repuestos y nadie le dio turno: hace cuántos días. */
  readonly diasSinTurno: number | null
  /** Un turno que espera al auto. Negativo: pasó y no entró. */
  readonly diasParaTurno: number | null
  /** Listo y sin retirar: hace cuántos días. */
  readonly diasListo: number | null
  readonly ultimoHito: number | null
  readonly ultimoTipo: TipoHito | null
  /** Lo dice la base, con la misma regla que su política de borrado (una semana). */
  readonly ultimoSePuedeDeshacer: boolean
}

/** Lo que la app le pregunta a una persona sobre un auto, en orden de urgencia (RF-1108). */
export type Pregunta = 'recordar_turno' | 'vino_al_turno' | 'dar_turno' | 'retirar'

/** Cuánto tiempo se sigue preguntando "¿vino?" por un turno al que no vino. Después baja a "no
 *  volvieron", plegado: no se esconde, pero no tapa lo de hoy. */
export const DIAS_QUE_SE_PREGUNTA_SI_VINO = 30

/** Cuántos días para adelante se muestran los turnos que vienen. */
export const DIAS_DE_PROXIMOS_TURNOS = 7

const URGENCIA: readonly Pregunta[] = ['recordar_turno', 'vino_al_turno', 'dar_turno', 'retirar']

/** La pregunta que corresponde hoy, o nula si no hay nada que preguntar. Lo listo va primero porque
 *  un auto listo ya no espera repuestos ni turno. */
export function preguntaDe(a: Pick<Auto, 'diasListo' | 'diasParaTurno' | 'diasSinTurno'>): Pregunta | null {
  if (a.diasListo !== null) return 'retirar'
  if (a.diasParaTurno !== null) {
    if (a.diasParaTurno <= 0 && a.diasParaTurno >= -DIAS_QUE_SE_PREGUNTA_SI_VINO) return 'vino_al_turno'
    if (a.diasParaTurno === 1) return 'recordar_turno'
    return null
  }
  if (a.diasSinTurno !== null) return 'dar_turno'
  return null
}

/** Los botones de hito que tienen sentido ahora, el más probable primero. Los demás no se ofrecen:
 *  un auto en el taller no recibe "llegaron los repuestos" con un toque distraído. */
export function hitosQueSiguen(a: Pick<Auto, 'enTaller' | 'listo' | 'diasListo' | 'diasParaTurno' | 'diasSinTurno'> | null): readonly TipoHito[] {
  if (a === null) return ['repuestos', 'turno', 'entro']
  if (a.enTaller) return a.listo !== null ? ['salio'] : ['listo', 'salio']
  if (a.diasListo !== null) return ['salio']
  if (a.diasParaTurno !== null) return ['entro', 'turno']
  if (a.diasSinTurno !== null) return ['turno', 'entro']
  return ['repuestos', 'turno', 'entro']
}

export function etiquetaDeHito(tipo: TipoHito): string {
  switch (tipo) {
    case 'repuestos':
      return 'Llegaron los repuestos'
    case 'turno':
      return 'Dar turno'
    case 'entro':
      return 'Entró'
    case 'listo':
      return 'Listo'
    case 'salio':
      return 'Salió'
  }
}

export type Hoy = {
  /** Lo que hay que hacer hoy, lo más urgente primero. */
  readonly preguntas: readonly { readonly auto: Auto; readonly pregunta: Pregunta }[]
  /** Qué autos hay en el taller, de más días a menos (RF-1102). */
  readonly enTaller: readonly Auto[]
  /** Los turnos que vienen después de mañana, el más cercano primero. */
  readonly proximosTurnos: readonly Auto[]
  /** Tenían turno hace más de un mes y no vinieron. */
  readonly noVolvieron: readonly Auto[]
}

/** Reparte los autos en las secciones de la pantalla Hoy. Un auto en el taller puede estar también
 *  en las preguntas (listo, sin retirar): son dos preguntas distintas, qué hay y qué hacer. */
export function armarHoy(autos: readonly Auto[]): Hoy {
  const preguntas: { auto: Auto; pregunta: Pregunta }[] = []
  for (const auto of autos) {
    const pregunta = preguntaDe(auto)
    if (pregunta !== null) preguntas.push({ auto, pregunta })
  }
  preguntas.sort((x, y) => URGENCIA.indexOf(x.pregunta) - URGENCIA.indexOf(y.pregunta) || espera(y.auto) - espera(x.auto))

  const enTaller = autos.filter((a) => a.enTaller).sort((x, y) => (y.diasEnTaller ?? 0) - (x.diasEnTaller ?? 0))
  const proximosTurnos = autos
    .filter((a) => a.diasParaTurno !== null && a.diasParaTurno > 1 && a.diasParaTurno <= DIAS_DE_PROXIMOS_TURNOS)
    .sort((x, y) => (x.diasParaTurno ?? 0) - (y.diasParaTurno ?? 0))
  const noVolvieron = autos.filter((a) => a.diasParaTurno !== null && a.diasParaTurno < -DIAS_QUE_SE_PREGUNTA_SI_VINO)

  return { preguntas, enTaller, proximosTurnos, noVolvieron }
}

/** Hace cuántos días espera lo que se pregunta: para ordenar dentro de una misma urgencia. */
function espera(a: Auto): number {
  if (a.diasListo !== null) return a.diasListo
  if (a.diasParaTurno !== null) return -a.diasParaTurno
  return a.diasSinTurno ?? 0
}

/** La pregunta, como la diría una persona. */
export function preguntaEnPalabras(p: Pregunta, a: Pick<Auto, 'diasListo' | 'diasParaTurno' | 'diasSinTurno'>): string {
  switch (p) {
    case 'recordar_turno':
      return 'Mañana tiene turno: mandale el recordatorio'
    case 'vino_al_turno':
      if (a.diasParaTurno === 0) return 'Hoy tiene turno: ¿vino?'
      if (a.diasParaTurno === -1) return 'Tenía turno ayer: ¿vino?'
      return `Tenía turno hace ${-(a.diasParaTurno ?? 0)} días: ¿vino?`
    case 'dar_turno':
      return a.diasSinTurno === 0
        ? 'Llegaron los repuestos hoy: hay que darle turno'
        : `Llegaron los repuestos hace ${diasEnPalabras(a.diasSinTurno ?? 0)} y no tiene turno`
    case 'retirar':
      return a.diasListo === 0 ? 'Quedó listo hoy: avisale que pase a retirarlo' : `Listo hace ${diasEnPalabras(a.diasListo ?? 0)}: ¿lo retiró?`
  }
}

/** La línea de cada auto en la sección "En el taller". */
export function enTallerEnPalabras(a: Pick<Auto, 'diasEnTaller' | 'listo'>): string {
  const dias = a.diasEnTaller ?? 0
  const cuanto = dias === 0 ? 'entró hoy' : `hace ${diasEnPalabras(dias)}`
  return a.listo !== null ? `${cuanto} · listo` : cuanto
}

/** "1 día", "3 días". */
function diasEnPalabras(dias: number): string {
  return dias === 1 ? '1 día' : `${dias} días`
}

/** Para leer lo que manda la vista: un tipo que no es uno de los cinco no se inventa como hito. */
export function tipoDeHito(texto: string | null): TipoHito | null {
  return TIPOS_DE_HITO.find((t) => t === texto) ?? null
}

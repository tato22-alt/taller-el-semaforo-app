/* Fechas de calendario que llegan de la base.
 *
 * El gotcha: `fecha_presupuesto` es un DATE y llega como "2026-09-12".
 * `new Date("2026-09-12")` lo parsea como medianoche UTC, que en Argentina (UTC-3)
 * cae el día anterior a las 21:00. Un presupuesto de hoy se mostraría como de ayer.
 *
 * Por eso acá una fecha de calendario se trata como texto y se parsea a mano.
 * `creado_en` y `modificado_en` son TIMESTAMPTZ y vienen con offset: ésos sí son
 * seguros con `new Date()`, y no pasan por estas funciones. */

const ZONA_TALLER = 'America/Argentina/Buenos_Aires'
const FECHA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** Hoy en el taller, como "2026-09-12". No usa la zona del dispositivo. */
export function hoyEnElTaller(ahora: Date = new Date()): string {
  // en-CA da el formato ISO (aaaa-mm-dd) sin armarlo a mano.
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_TALLER }).format(ahora)
}

/** "2026-09-12" → "12/09/2026". Devuelve "—" si la fecha falta o no tiene forma. */
export function formatearFecha(fecha: string | null | undefined): string {
  const partes = partesDeFecha(fecha)
  if (partes === null) return '—'
  const [anio, mes, dia] = partes
  return `${pad(dia)}/${pad(mes)}/${anio}`
}

/** Días completos entre una fecha de calendario y hoy. null si la fecha falta.
 *  Negativo si la fecha es futura, que es un dato cargado mal y hay que poder verlo. */
export function diasDesde(fecha: string | null | undefined, hoy: string = hoyEnElTaller()): number | null {
  const desde = partesDeFecha(fecha)
  const hasta = partesDeFecha(hoy)
  if (desde === null || hasta === null) return null

  // Date.UTC sobre las partes ya parseadas: las dos fechas quedan en la misma
  // referencia, así que la resta no puede correrse por zona horaria ni por
  // horario de verano.
  const unDiaEnMs = 86_400_000
  const msDesde = Date.UTC(desde[0], desde[1] - 1, desde[2])
  const msHasta = Date.UTC(hasta[0], hasta[1] - 1, hasta[2])
  return Math.round((msHasta - msDesde) / unDiaEnMs)
}

/** "hoy", "ayer", "hace 3 días". Para el tablero, que se lee de un vistazo. */
export function antiguedadEnPalabras(dias: number | null): string {
  if (dias === null) return 'sin fecha'
  if (dias < 0) return 'fecha futura'
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

function partesDeFecha(fecha: string | null | undefined): readonly [number, number, number] | null {
  if (typeof fecha !== 'string') return null
  const coincide = FECHA_ISO.exec(fecha.trim())
  if (coincide === null) return null

  const anio = Number(coincide[1])
  const mes = Number(coincide[2])
  const dia = Number(coincide[3])
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) return null
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null

  return [anio, mes, dia]
}

const pad = (n: number): string => String(n).padStart(2, '0')

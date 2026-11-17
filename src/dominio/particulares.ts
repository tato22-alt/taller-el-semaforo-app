/* La plata de los particulares (spec 013 de semaforo-base, RF-1305 a RF-1309): lo que se cobra al
 * entregar el auto, lo que queda debiendo y lo que se paga después.
 *
 * La base entrega cada salida sin contestar, cada deuda con su saldo y sus días, y cada cobro. Acá se
 * decide qué se le pregunta a quien entrega el auto, cómo se lee un monto escrito a mano y qué se
 * dice de cada deuda. Los importes van como texto; se comparan en centavos enteros, nunca con float. */

/** Un auto que salió y todavía no tiene anotado qué pasó con la plata. */
export type Salida = {
  readonly idSalida: number
  readonly idTrabajo: number
  readonly salio: string
  readonly dias: number
  readonly numeroPresupuesto: number | null
  readonly patente: string | null
  readonly vehiculo: string | null
  readonly cliente: string | null
  readonly telefono: string | null
  /** El total del presupuesto: lo que se propone en "Pagó todo". */
  readonly totalPresupuesto: string | null
}

/** Lo que debe un particular. */
export type Deuda = {
  readonly idDeuda: number
  readonly deudor: string
  readonly telefono: string | null
  /** De qué auto es, cuando no tiene presupuesto digital. */
  readonly detalle: string | null
  readonly numeroPresupuesto: number | null
  readonly patente: string | null
  readonly vehiculo: string | null
  readonly monto: string
  readonly pagado: string
  readonly saldo: string
  readonly fecha: string
  readonly dias: number
  readonly pagos: number
  readonly ultimoPago: string | null
  readonly sePuedeDeshacer: boolean
}

/** Un cobro anotado. */
export type Cobro = {
  readonly idCobro: number
  readonly cuando: 'al_salir' | 'deuda'
  readonly monto: string
  readonly fecha: string
  readonly quien: string | null
  readonly patente: string | null
  readonly vehiculo: string | null
  readonly detalle: string | null
  readonly sePuedeDeshacer: boolean
}

/** Las cuatro respuestas de un toque a "¿qué pasó con la plata?" (RF-1305). */
export type Respuesta = 'pago_todo' | 'pago_otro' | 'quedo_debiendo' | 'seguro'

export const RESPUESTAS: readonly Respuesta[] = ['pago_todo', 'pago_otro', 'quedo_debiendo', 'seguro']

export function respuestaEnPalabras(r: Respuesta): string {
  switch (r) {
    case 'pago_todo':
      return 'Pagó todo'
    case 'pago_otro':
      return 'Pagó otro monto'
    case 'quedo_debiendo':
      return 'Quedó debiendo'
    case 'seguro':
      return 'Es de seguro, no pagó nada'
  }
}

/** Lo que escribe una persona, como importe para la base: "150.000" → "150000.00",
 *  "150.000,5" → "150000.50", "$ 1500" → "1500.00". Los puntos son de miles y la coma es decimal,
 *  como se escribe acá. Nulo si no se entiende: no se adivina un monto. */
export function leerMonto(texto: string): string | null {
  const limpio = texto.replace(/[$\s]/g, '')
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(limpio)
  if (!m) return null
  const enteros = (m[1] ?? '').replace(/\./g, '').replace(/^0+(?=\d)/, '')
  return `${enteros}.${(m[2] ?? '').padEnd(2, '0')}`
}

/** "150000.50" → 15000050n. Nulo si no tiene forma de importe. */
export function enCentavos(importe: string): bigint | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(importe.trim())
  if (!m) return null
  const centavos = BigInt(m[2] ?? '0') * 100n + BigInt((m[3] ?? '').padEnd(2, '0').slice(0, 2))
  return m[1] === '-' ? -centavos : centavos
}

export function esPositivo(importe: string): boolean {
  return (enCentavos(importe) ?? 0n) > 0n
}

/** Si un pago es más que lo que se debe: la app avisa antes de anotarlo (la base no lo rechaza). */
export function pagaDeMas(pago: string, saldo: string): boolean {
  const p = enCentavos(pago)
  const s = enCentavos(saldo)
  return p !== null && s !== null && p > s
}

/** "150000.50" → "150.000,50", para proponer un monto en un campo que se puede corregir. */
export function montoParaCorregir(importe: string | null): string {
  const m = importe === null ? null : /^(\d+)(?:\.(\d+))?$/.exec(importe.trim())
  if (!m) return ''
  const enteros = (m[1] ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const decimales = (m[2] ?? '').padEnd(2, '0').slice(0, 2)
  return decimales === '00' ? enteros : `${enteros},${decimales}`
}

/** Lo que hay que anotar por una respuesta: un cobro, una deuda, o las dos. O por qué no se puede. */
export type ParaAnotar =
  | { readonly ok: true; readonly cobro: string | null; readonly deuda: string | null }
  | { readonly ok: false; readonly motivo: string }

/** Traduce la respuesta y lo escrito a lo que se anota (RF-1305).
 *  - Pagó todo / pagó otro monto: un cobro por ese monto.
 *  - Quedó debiendo: una deuda, y un cobro si además pagó algo en el momento.
 *  - Es de seguro: un cobro de cero, que deja contestada la pregunta. */
export function paraAnotar(respuesta: Respuesta, escrito: { readonly monto: string; readonly pagoAhora: string }): ParaAnotar {
  if (respuesta === 'seguro') return { ok: true, cobro: '0.00', deuda: null }
  const monto = leerMonto(escrito.monto)
  if (monto === null || !esPositivo(monto)) return { ok: false, motivo: 'Escribí el monto, así: 150.000 o 150.000,50.' }
  if (respuesta !== 'quedo_debiendo') return { ok: true, cobro: monto, deuda: null }
  if (escrito.pagoAhora.trim() === '') return { ok: true, cobro: null, deuda: monto }
  const ahora = leerMonto(escrito.pagoAhora)
  if (ahora === null) return { ok: false, motivo: 'No se entiende lo que pagó ahora. Escribilo así: 150.000 o 150.000,50.' }
  return { ok: true, cobro: esPositivo(ahora) ? ahora : null, deuda: monto }
}

/** De qué auto es una deuda o un cobro: "Ford Ka (AB123CD)", la patente sola, o lo que se escribió. */
export function autoEnPalabras(a: { readonly vehiculo: string | null; readonly patente: string | null; readonly detalle: string | null }): string {
  const vehiculo = (a.vehiculo ?? '').trim()
  const patente = (a.patente ?? '').trim()
  if (vehiculo !== '' && patente !== '') return `${vehiculo} (${patente})`
  if (vehiculo !== '' || patente !== '') return vehiculo || patente
  return (a.detalle ?? '').trim() || 'auto sin datos'
}

/** "desde hoy", "desde ayer", "hace 12 días". */
export function desdeCuandoDebe(dias: number): string {
  if (dias <= 0) return 'desde hoy'
  if (dias === 1) return 'desde ayer'
  return `hace ${dias} días`
}

/** Las deudas con saldo, de más días a menos (RF-1308). */
export function deudasPorCobrar(deudas: readonly Deuda[]): readonly Deuda[] {
  return deudas.filter((d) => esPositivo(d.saldo)).sort((x, y) => y.dias - x.dias)
}

/** Qué datos faltan para anotar una deuda a mano. Nulo: está completa. */
export function faltaParaLaDeuda(d: { readonly deudor: string; readonly monto: string; readonly conPresupuesto: boolean; readonly detalle: string }): string | null {
  if (d.deudor.trim() === '') return 'Falta quién debe.'
  const monto = leerMonto(d.monto)
  if (monto === null || !esPositivo(monto)) return 'Escribí cuánto debe, así: 150.000 o 150.000,50.'
  if (!d.conPresupuesto && d.detalle.trim() === '') return 'Elegí el presupuesto, o escribí de qué auto es.'
  return null
}

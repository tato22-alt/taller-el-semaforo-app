/* Plata que llega de la base.
 *
 * PostgREST serializa NUMERIC como string —"15000.00"— a propósito, para no perder
 * precisión en el float de JavaScript. Así que acá no se hace aritmética: se
 * formatea el texto tal como viene, agrupando dígitos a mano. Si en algún momento
 * hace falta SUMAR del lado del cliente, es señal de que falta una vista en la base. */

const SOLO_NUMERO = /^-?\d+(\.\d+)?$/

/** "15000.00" → "$15.000" · "15000.50" → "$15.000,50" · null → "—" */
export function formatearPesos(importe: string | number | null | undefined): string {
  const agrupado = formatearNumero(importe)
  return agrupado === SIN_DATO ? SIN_DATO : '$' + agrupado
}

export const SIN_DATO = '—'

/** Igual que formatearPesos pero sin el signo, para cuando la columna ya dice "monto". */
export function formatearNumero(importe: string | number | null | undefined): string {
  if (importe === null || importe === undefined) return SIN_DATO

  const texto = String(importe).trim()
  if (!SOLO_NUMERO.test(texto)) return SIN_DATO

  const negativo = texto.startsWith('-')
  const [enteros = '0', decimales] = (negativo ? texto.slice(1) : texto).split('.')

  const conMiles = agruparDeTresEnTres(enteros)
  const coma = decimales && /[1-9]/.test(decimales) ? ',' + decimales.padEnd(2, '0').slice(0, 2) : ''

  return (negativo ? '-' : '') + conMiles + coma
}

/** 15000 → "15.000". El punto es el separador de miles en es-AR. */
function agruparDeTresEnTres(enteros: string): string {
  return enteros.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

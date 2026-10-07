/* Traducir lo que devuelve supabase-js a un Resultado que haya que mirar.
 *
 * Esto es una función pura a propósito: acá viven los cuatro gotchas de PostgREST,
 * y son justo lo que hay que poder probar sin una base del otro lado. El módulo que
 * hace la llamada queda fino; el que decide qué significa la respuesta, testeado.
 *
 * Vive en datos/ y no en dominio/ porque la forma { data, error } es de Supabase, y
 * dominio/ no conoce a Supabase ni de nombre. */

import { bien, mal, type Fallo, type Resultado } from '../dominio/resultado'

/** La forma de lo que devuelve supabase-js, descrita acá para no atarse a su tipo.
 *  Lo único que nos importa es que trae un dato o un error, nunca una excepción. */
export type RespuestaCruda<T> = {
  readonly data: T | null
  readonly error: ErrorCrudo | null
}

export type ErrorCrudo = {
  readonly message?: string
  readonly code?: string
  readonly status?: number
  readonly details?: string | null
}

/** Señales de que no llegamos al servidor. supabase-js envuelve el fetch fallado,
 *  así que el mensaje es lo único que lo distingue de un rechazo de la base. */
const PARECE_DE_RED = /failed to fetch|networkerror|network request failed|fetch failed|load failed|err_internet/i

/** Códigos con los que PostgREST dice que el JWT no sirve. */
const CODIGOS_SIN_SESION = new Set(['PGRST301', 'PGRST302', '42501'])

/** Interpreta una respuesta de supabase-js.
 *
 * `haySesion` no es un detalle: sin sesión, RLS no devuelve un error, devuelve `[]`
 * con HTTP 200. Si no se lo pasamos, una lista vacía es ambigua y la pantalla
 * termina diciendo "no hay trabajos" cuando lo que pasó es que venció el token.
 * Por eso el llamador tiene que haber mirado la sesión ANTES de consultar. */
export function interpretar<T>(
  respuesta: RespuestaCruda<T>,
  haySesion: boolean,
): Resultado<T> {
  if (!haySesion) return mal({ tipo: 'sin_sesion' })

  if (respuesta.error !== null && respuesta.error !== undefined) {
    return mal(clasificar(respuesta.error))
  }

  // Sin error y sin dato no debería pasar, pero si pasa es un null que revienta
  // más adelante y lejos de la causa. Mejor acá, con nombre.
  if (respuesta.data === null || respuesta.data === undefined) {
    return mal({ tipo: 'base', detalle: 'La base respondió sin datos y sin error.' })
  }

  return bien(respuesta.data)
}

export function clasificar(error: ErrorCrudo): Fallo {
  const mensaje = error.message ?? 'Sin detalle.'

  if (error.status === 401 || error.status === 403) return { tipo: 'sin_sesion' }
  if (error.code !== undefined && CODIGOS_SIN_SESION.has(error.code)) {
    return { tipo: 'sin_sesion' }
  }
  if (PARECE_DE_RED.test(mensaje)) return { tipo: 'red', detalle: mensaje }

  return { tipo: 'base', detalle: mensaje }
}

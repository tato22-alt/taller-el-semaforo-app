/* La sesión: entrar, salir, y saber si hay una.
 *
 * Nada de esto se escribe a mano. El cliente oficial guarda el token, lo renueva
 * antes de que venza y avisa cuando cambia. Un refresh casero es la forma clásica
 * de que a las dos horas el taller vea "no hay trabajos" sin entender por qué. */

import { bien, mal, type Resultado } from '../dominio/resultado'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import { clasificar } from './respuesta'

/** Lo mínimo que la pantalla necesita saber de quién está adentro.
 *  No se devuelve el token: la interfaz no tiene nada que hacer con él. */
export type Sesion = {
  readonly email: string
}

/** Quién está adentro, o null si no hay nadie.
 *
 * Esta es la llamada que desambigua el gotcha de RLS, así que va ANTES de
 * cualquier lectura, no después. */
export async function sesionActual(
  base: ClienteBase | null = null,
): Promise<Resultado<Sesion | null>> {
  const resuelto = resolver(base)
  if (!resuelto.ok) return resuelto

  const { data, error } = await resuelto.dato.auth.getSession()
  if (error !== null) return mal(clasificar(error))

  const usuario = data.session?.user
  if (usuario === undefined) return bien(null)

  return bien({ email: usuario.email ?? 'sin correo' })
}

export async function iniciarSesion(
  email: string,
  contrasena: string,
  base: ClienteBase | null = null,
): Promise<Resultado<Sesion>> {
  const resuelto = resolver(base)
  if (!resuelto.ok) return resuelto

  const { data, error } = await resuelto.dato.auth.signInWithPassword({
    email: email.trim(),
    password: contrasena,
  })
  if (error !== null) return mal(clasificar(error))

  const usuario = data.session?.user
  if (usuario === undefined) {
    return mal({ tipo: 'base', detalle: 'La base aceptó el ingreso pero no devolvió sesión.' })
  }

  return bien({ email: usuario.email ?? 'sin correo' })
}

export async function cerrarSesion(base: ClienteBase | null = null): Promise<Resultado<null>> {
  const resuelto = resolver(base)
  if (!resuelto.ok) return resuelto

  const { error } = await resuelto.dato.auth.signOut()
  if (error !== null) return mal(clasificar(error))
  return bien(null)
}

/** Avisa cuando la sesión cambia, incluida la vez que vence sola.
 *  Devuelve la función para dejar de escuchar. */
export function alCambiarLaSesion(
  avisar: (sesion: Sesion | null) => void,
  base: ClienteBase | null = null,
): () => void {
  const resuelto = resolver(base)
  if (!resuelto.ok) return () => undefined

  const { data } = resuelto.dato.auth.onAuthStateChange((_evento, sesion) => {
    const usuario = sesion?.user
    avisar(usuario === undefined ? null : { email: usuario.email ?? 'sin correo' })
  })
  return () => data.subscription.unsubscribe()
}

/** El cliente que se pasó, o el de verdad. El parámetro existe para los tests:
 *  son funciones que hablan con la red, y la red no entra en un test. */
function resolver(base: ClienteBase | null): Resultado<ClienteBase> {
  return base === null ? obtenerCliente() : bien(base)
}

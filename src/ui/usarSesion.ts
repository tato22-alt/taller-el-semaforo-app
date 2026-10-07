/* Quién está adentro, y enterarse cuando deja de estarlo.
 *
 * Escucha los cambios de sesión además de preguntar al arrancar: cuando el token
 * vence, la pantalla tiene que volver al login sola, no quedarse mostrando una
 * lista vacía que parece "no hay trabajos". */

import { useEffect, useState } from 'react'
import { alCambiarLaSesion, sesionActual, type Sesion } from '../datos/sesion'
import type { Fallo } from '../dominio/resultado'

export type EstadoDeSesion =
  | { readonly fase: 'cargando' }
  | { readonly fase: 'afuera' }
  | { readonly fase: 'adentro'; readonly sesion: Sesion }
  | { readonly fase: 'rota'; readonly fallo: Fallo }

export function usarSesion(): EstadoDeSesion {
  const [estado, setEstado] = useState<EstadoDeSesion>({ fase: 'cargando' })

  useEffect(() => {
    let vigente = true

    void sesionActual().then((r) => {
      if (!vigente) return
      if (!r.ok) setEstado({ fase: 'rota', fallo: r.fallo })
      else setEstado(r.dato === null ? { fase: 'afuera' } : { fase: 'adentro', sesion: r.dato })
    })

    const dejarDeEscuchar = alCambiarLaSesion((sesion) => {
      if (!vigente) return
      setEstado(sesion === null ? { fase: 'afuera' } : { fase: 'adentro', sesion })
    })

    return () => {
      vigente = false
      dejarDeEscuchar()
    }
  }, [])

  return estado
}

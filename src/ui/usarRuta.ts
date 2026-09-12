/* Escucha el hash y devuelve la ruta ya interpretada.
 *
 * La lógica de qué significa cada hash vive en dominio/ruta.ts y se testea sin
 * montar nada. Acá sólo está la parte que necesita el navegador. */

import { useEffect, useState } from 'react'
import { rutaDesdeHash, type Ruta } from '../dominio/ruta'

export function usarRuta(): Ruta {
  const [ruta, setRuta] = useState<Ruta>(() => rutaDesdeHash(window.location.hash))

  useEffect(() => {
    const alCambiar = (): void => setRuta(rutaDesdeHash(window.location.hash))
    window.addEventListener('hashchange', alCambiar)
    return () => window.removeEventListener('hashchange', alCambiar)
  }, [])

  return ruta
}

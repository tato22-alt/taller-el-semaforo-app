/* Ruteo por hash, sin dependencias.
 *
 * GitHub Pages sirve el sitio en un subpath y no sabe reescribir rutas: con un
 * router de history API, refrescar /ficha/12 da 404. El hash lo resuelve porque
 * nunca llega al servidor.
 *
 * Son tres pantallas: una librería de ruteo sería más código de configuración
 * que esto. La decisión de no agregar la dependencia está en el CLAUDE.md. */

export type Ruta =
  | { readonly pantalla: 'tablero' }
  | { readonly pantalla: 'ficha'; readonly idTrabajo: number }

export const RUTA_INICIAL: Ruta = { pantalla: 'tablero' }

/** "#/ficha/12" → { pantalla: 'ficha', idTrabajo: 12 }.
 *  Cualquier cosa que no se entienda cae al tablero: nunca una pantalla en blanco. */
export function rutaDesdeHash(hash: string): Ruta {
  const limpio = hash.replace(/^#\/?/, '')
  const partes = limpio.split('/').filter((p) => p !== '')

  if (partes[0] === 'ficha') {
    const id = Number(partes[1])
    if (Number.isInteger(id) && id > 0) return { pantalla: 'ficha', idTrabajo: id }
  }
  return RUTA_INICIAL
}

/** El camino inverso, para armar los links sin escribir strings a mano. */
export function hashDeRuta(ruta: Ruta): string {
  switch (ruta.pantalla) {
    case 'tablero':
      return '#/'
    case 'ficha':
      return `#/ficha/${ruta.idTrabajo}`
  }
}

/* Cómo viaja un error desde la capa de datos hasta la pantalla.
 *
 * supabase-js no lanza excepciones: devuelve { data, error }. Un error ignorado
 * es un data en null que revienta tres líneas más abajo, lejos de la causa. Esta
 * unión discriminada obliga a mirar el caso de error: TypeScript no deja leer
 * `dato` sin haber chequeado `ok` primero. */

export type Resultado<T> =
  | { readonly ok: true; readonly dato: T }
  | { readonly ok: false; readonly fallo: Fallo }

/** Los modos de fallar que la interfaz tiene que distinguir.
 *
 * `sin_sesion` existe por el gotcha más peligroso de RLS: sin sesión, una lectura
 * devuelve [] con HTTP 200, no un error. Si la app no separa "no hay sesión" de
 * "no hay trabajos", le va a decir "no hay trabajos" a alguien cuyo token venció. */
export type Fallo =
  | { readonly tipo: 'sin_sesion' }
  | { readonly tipo: 'sin_configurar'; readonly detalle: string }
  | { readonly tipo: 'red'; readonly detalle: string }
  | { readonly tipo: 'base'; readonly detalle: string }

export const bien = <T>(dato: T): Resultado<T> => ({ ok: true, dato })
export const mal = <T>(fallo: Fallo): Resultado<T> => ({ ok: false, fallo })

/** Texto para mostrarle a una persona del taller. Sin jerga de software. */
export function textoDeFallo(fallo: Fallo): string {
  switch (fallo.tipo) {
    case 'sin_sesion':
      return 'Se cerró la sesión. Volvé a entrar.'
    case 'sin_configurar':
      return 'Falta configurar la conexión con la base.'
    case 'red':
      return 'No se pudo conectar. Revisá internet y probá de nuevo.'
    case 'base':
      return 'La base rechazó la consulta. Avisá que pasó esto.'
  }
}

/* Las filas como llegan DE VERDAD, corrigiendo lo que el tipo generado dice mal.
 *
 * Vive aparte de `tipos-base.ts` a propósito: ese archivo lo pisa entero
 * `supabase gen types` cada vez que se corre, así que cualquier cosa escrita ahí
 * se pierde en la próxima regeneración. Acá no.
 *
 * ── Qué corrige ──────────────────────────────────────────────────────────────
 *
 * Supabase tipa `numeric` como `number`, y es mentira: PostgREST lo manda como
 * STRING, a propósito, para no perder precisión en el float de JavaScript.
 * Un presupuesto de $1.875.400,55 llega como "1875400.55", no como 1875400.55.
 *
 * No es un detalle cosmético. Con el tipo generado, esto compila:
 *
 *     const total = fila.monto_total.toFixed(2)   // 💥 en producción
 *
 * y revienta recién cuando alguien abre la pantalla con plata de verdad adentro.
 * Con el tipo de acá, no compila, que es cuándo hay que enterarse.
 *
 * Lo encontré construyendo el tablero: armé una fila de prueba con el string
 * real y el compilador la rechazó. El dato estaba bien; el tipo, mal.
 *
 * Que sean string tiene además una consecuencia buena: no se puede sumar sin
 * convertir, y convertir da fricción suficiente como para acordarse de que los
 * totales los deriva la base (principio III), no el navegador. */

import type { Database } from './tipos-base'

export type Tabla<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

type VistaCruda<V extends keyof Database['public']['Views']> =
  Database['public']['Views'][V]['Row']

/** Las columnas de plata de una fila, con el tipo que de verdad tienen. */
type ConPlataComoTexto<T, K extends keyof T> = Omit<T, K> & {
  readonly [P in K]: string | null
}

/** Una fila de `vw_presupuestos`, lista para mostrar.
 *
 * `cantidad_conceptos` queda como `number`: sale de un `count(*)`, que PostgREST
 * sí serializa como número. Sólo los `numeric` viajan como texto. */
export type FilaPresupuesto = ConPlataComoTexto<
  VistaCruda<'vw_presupuestos'>,
  'monto_total' | 'monto_mano_obra' | 'subtotal_conceptos'
>

export type FilaIncompleta = ConPlataComoTexto<
  VistaCruda<'vw_presupuestos_incompletos'>,
  'monto_mano_obra'
>

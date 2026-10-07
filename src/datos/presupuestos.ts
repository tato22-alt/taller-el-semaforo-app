/* Leer presupuestos de vw_presupuestos.
 *
 * Se lee de la vista, no de las tablas: los totales ya vienen sumados por la base
 * (principio III). Acá no se suma nada — ni siquiera se mira `subtotal_conceptos`
 * para comprobar que cierre, porque eso sería recalcular lo que la base derivó. */

import { mal, type Resultado } from '../dominio/resultado'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import { interpretar, type RespuestaCruda } from './respuesta'
import { sesionActual } from './sesion'
import type { FilaPresupuesto } from './filas'

/* Tope de filas. El taller hace unos 80 presupuestos por mes, así que 100 cubre
 * el mes corriente con aire. No es paginación: es un techo para que una pantalla
 * que se mira parado al lado de un auto no baje mil filas por el celular. */
export const TOPE_DE_FILAS = 100

/** Los presupuestos, del más nuevo al más viejo.
 *
 * Mira la sesión primero y recién después consulta. No es por prolijidad: sin
 * sesión, la consulta devuelve [] con HTTP 200, y entonces "no hay presupuestos"
 * y "se venció el token" se verían exactamente igual. */
export async function listarPresupuestos(
  base: ClienteBase | null = null,
): Promise<Resultado<readonly FilaPresupuesto[]>> {
  const cliente = base === null ? obtenerCliente() : { ok: true as const, dato: base }
  if (!cliente.ok) return mal(cliente.fallo)

  const sesion = await sesionActual(cliente.dato)
  if (!sesion.ok) return mal(sesion.fallo)
  const haySesion = sesion.dato !== null

  const respuesta = await cliente.dato
    .from('vw_presupuestos')
    .select('*')
    // nulls last: un presupuesto sin fecha es un dato incompleto, no uno reciente.
    .order('fecha_presupuesto', { ascending: false, nullsFirst: false })
    .order('numero_presupuesto', { ascending: false, nullsFirst: false })
    .limit(TOPE_DE_FILAS)

  // El único lugar del proyecto donde se corrige la mentira del tipo generado.
  // supabase-js describe la respuesta con los tipos de `tipos-base.ts`, que dicen
  // que los `numeric` son `number`; por la red llegan como string. Acá se afirma
  // lo que de verdad hay, una sola vez y a la vista, en vez de que cada pantalla
  // se encuentre con un número que es texto. El porqué está en `filas.ts`.
  const crudo = respuesta as unknown as RespuestaCruda<readonly FilaPresupuesto[]>
  return interpretar<readonly FilaPresupuesto[]>(crudo, haySesion)
}

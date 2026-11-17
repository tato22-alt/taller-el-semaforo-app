/* Una base de mentira para los tests de la spec 013: anota qué se le pide y devuelve lo que le digan.
 * Que la base responda bien de verdad lo prueba qa-013.sql de semaforo-base, contra un Postgres. */

import type { ClienteBase } from './cliente-supabase'

type Respuesta = { data?: unknown; error?: { code: string; message: string } | null; count?: number }

export function baseFalsa(o: {
  /** Lo que lleva app_metadata del usuario. Nulo: sin sesión. */
  meta?: Record<string, unknown> | null
  /** Qué devuelve cada tabla o vista al leerla. */
  filas?: Record<string, unknown>
  /** Qué devuelve una escritura que pide lo escrito de vuelta. */
  devuelve?: Record<string, Respuesta>
  /** Tablas o vistas que dan error. */
  errores?: Record<string, { code: string; message: string }>
} = {}) {
  const llamadas: string[] = []
  const cadena = (r: Respuesta, tabla: string): unknown =>
    Object.assign(Promise.resolve({ data: r.data ?? null, error: r.error ?? null, count: r.count ?? null }), {
      eq: (c: string, v: unknown) => { llamadas.push(`  where ${c} = ${String(v)}`); return cadena(r, tabla) },
      is: (c: string, v: unknown) => { llamadas.push(`  where ${c} is ${String(v)}`); return cadena(r, tabla) },
      or: (f: string) => { llamadas.push(`  or ${f}`); return cadena(r, tabla) },
      order: (c: string) => { llamadas.push(`  order ${c}`); return cadena(r, tabla) },
      select: (cols: string) => { llamadas.push(`  returning ${cols}`); return cadena(o.devuelve?.[tabla] ?? r, tabla) },
      single: () => cadena(r, tabla),
    })
  const error = (tabla: string) => o.errores?.[tabla] ?? null
  const from = (tabla: string) => ({
    select: (cols: string) => { llamadas.push(`select ${tabla} ${cols.split(',').length} columnas`); return cadena({ data: o.filas?.[tabla] ?? [], error: error(tabla), count: 0 }, tabla) },
    insert: (fila: unknown) => { llamadas.push(`insert ${tabla} ${JSON.stringify(fila)}`); return cadena({ error: error(tabla) }, tabla) },
    upsert: (filas: unknown, op: unknown) => { llamadas.push(`upsert ${tabla} ${JSON.stringify(filas)} ${JSON.stringify(op)}`); return cadena({ error: error(tabla) }, tabla) },
    update: (fila: unknown) => { llamadas.push(`update ${tabla} ${JSON.stringify(fila)}`); return cadena({ error: error(tabla) }, tabla) },
    delete: () => { llamadas.push(`delete ${tabla}`); return cadena({ error: error(tabla) }, tabla) },
  })
  const meta = o.meta === undefined ? { rol: 'persona', ve_plata: true } : o.meta
  const sesion = meta === null ? { session: null } : { session: { user: { email: 'taller@ejemplo.com', app_metadata: meta } } }
  return { cliente: { auth: { getSession: () => Promise.resolve({ data: sesion, error: null }) }, from } as unknown as ClienteBase, llamadas }
}

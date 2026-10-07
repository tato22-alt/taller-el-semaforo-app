/* La regla que este test protege: nunca mostrar "no hay presupuestos" cuando lo
 * que pasó es que se cayó la sesión. Se prueba con un cliente falso porque lo que
 * se está probando es la decisión, no la red. */

import { describe, expect, it } from 'vitest'
import { listarPresupuestos, TOPE_DE_FILAS } from './presupuestos'
import type { ClienteBase } from './cliente-supabase'

type Llamada = { limite: number | null }

/** Un cliente de mentira con la forma justa que usa listarPresupuestos.
 *  El cast es a ClienteBase y no a `any`: lo que se finge es la forma, no el tipo. */
function clienteFalso(opciones: {
  readonly conSesion: boolean
  readonly filas?: readonly unknown[]
  readonly error?: { message: string } | null
  readonly registro?: Llamada
}): ClienteBase {
  const consulta = {
    select: () => consulta,
    order: () => consulta,
    limit: (n: number) => {
      if (opciones.registro) opciones.registro.limite = n
      return Promise.resolve({
        data: opciones.error ? null : (opciones.filas ?? []),
        error: opciones.error ?? null,
      })
    },
  }

  const sesion = opciones.conSesion
    ? { session: { user: { email: 'taller@ejemplo.com' } } }
    : { session: null }

  return {
    auth: { getSession: () => Promise.resolve({ data: sesion, error: null }) },
    from: () => consulta,
  } as unknown as ClienteBase
}

describe('listarPresupuestos', () => {
  it('sin sesión falla como sin_sesion, aunque la base devuelva una lista vacía', async () => {
    const r = await listarPresupuestos(clienteFalso({ conSesion: false, filas: [] }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fallo.tipo).toBe('sin_sesion')
  })

  it('con sesión y sin filas devuelve una lista vacía, que es un éxito', async () => {
    // Hoy la base está vacía: éste es literalmente el caso real del taller.
    const r = await listarPresupuestos(clienteFalso({ conSesion: true, filas: [] }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.dato).toEqual([])
  })

  it('con sesión devuelve las filas tal cual vienen de la vista', async () => {
    const filas = [{ id_trabajo: 1, numero_presupuesto: 16000 }]
    const r = await listarPresupuestos(clienteFalso({ conSesion: true, filas }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.dato).toEqual(filas)
  })

  it('no baja más que el tope de filas', async () => {
    const registro: Llamada = { limite: null }
    await listarPresupuestos(clienteFalso({ conSesion: true, registro }))
    expect(registro.limite).toBe(TOPE_DE_FILAS)
  })

  it('un error de la base llega como fallo, no como lista vacía', async () => {
    const r = await listarPresupuestos(
      clienteFalso({ conSesion: true, error: { message: 'permission denied' } }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fallo.tipo).toBe('base')
  })
})

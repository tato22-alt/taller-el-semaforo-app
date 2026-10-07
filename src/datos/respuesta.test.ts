/* Los cuatro gotchas de PostgREST, probados sin base del otro lado. */

import { describe, expect, it } from 'vitest'
import { clasificar, interpretar } from './respuesta'

describe('interpretar', () => {
  it('sin sesión no mira el dato: una lista vacía NO es "no hay trabajos"', () => {
    // El gotcha más caro: RLS no rechaza, devuelve [] con HTTP 200.
    const r = interpretar({ data: [], error: null }, false)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fallo.tipo).toBe('sin_sesion')
  })

  it('con sesión, una lista vacía sí es "no hay trabajos"', () => {
    const r = interpretar({ data: [], error: null }, true)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.dato).toEqual([])
  })

  it('devuelve el dato cuando salió bien', () => {
    const filas = [{ id_trabajo: 1 }]
    const r = interpretar({ data: filas, error: null }, true)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.dato).toBe(filas)
  })

  it('un error no se ignora aunque venga con data en null', () => {
    const r = interpretar({ data: null, error: { message: 'columna inexistente' } }, true)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fallo.tipo).toBe('base')
  })

  it('sin error y sin dato falla con nombre, no con un null más adelante', () => {
    const r = interpretar({ data: null, error: null }, true)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fallo.tipo).toBe('base')
  })
})

describe('clasificar', () => {
  it('401 y 403 son sesión vencida, no un problema de la base', () => {
    expect(clasificar({ status: 401 }).tipo).toBe('sin_sesion')
    expect(clasificar({ status: 403 }).tipo).toBe('sin_sesion')
  })

  it('los códigos de JWT de PostgREST también', () => {
    expect(clasificar({ code: 'PGRST301', message: 'JWT expired' }).tipo).toBe('sin_sesion')
  })

  it('distingue no llegar al servidor de que el servidor rechace', () => {
    expect(clasificar({ message: 'TypeError: Failed to fetch' }).tipo).toBe('red')
    expect(clasificar({ message: 'NetworkError when attempting to fetch' }).tipo).toBe('red')
    expect(clasificar({ message: 'relation "vw_presupuestos" does not exist' }).tipo).toBe('base')
  })

  it('un error sin mensaje no rompe', () => {
    const fallo = clasificar({})
    expect(fallo.tipo).toBe('base')
    if (fallo.tipo === 'base') expect(fallo.detalle).toBe('Sin detalle.')
  })
})

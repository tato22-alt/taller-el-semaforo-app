/* La factura de la orden: qué se le pide a la base con cada toque. Con un cliente falso: que la base
 * vincule sola, no deje rehacer ni borrar y anote quién, lo prueba qa-012-verificacion.sql contra el
 * Postgres local. */

import { describe, expect, it } from 'vitest'
import type { ClienteBase } from './cliente-supabase'
import { desvincularFacturas, leerPropuestas, revincularEnvios, vincularFactura } from './orden-factura'

function clienteFalso(o: { conSesion?: boolean; propuestas?: readonly unknown[]; revinculadas?: number } = {}) {
  const llamadas: string[] = []
  const cadena = (datos: unknown): unknown =>
    Object.assign(Promise.resolve({ data: datos, error: null }), {
      eq: (c: string, v: unknown) => { llamadas.push(`  where ${c} = ${String(v)}`); return cadena(datos) },
      is: (c: string, v: unknown) => { llamadas.push(`  where ${c} is ${String(v)}`); return cadena(datos) },
      order: (c: string) => { llamadas.push(`  order ${c}`); return cadena(datos) },
      limit: (n: number) => { llamadas.push(`  limit ${n}`); return cadena(datos) },
    })
  const from = (tabla: string) => ({
    select: (cols: string) => { llamadas.push(`select ${tabla} ${cols}`); return cadena(o.propuestas ?? []) },
    insert: (fila: unknown) => { llamadas.push(`insert ${tabla} ${JSON.stringify(fila)}`); return cadena(null) },
    update: (cambios: Record<string, unknown>) => { llamadas.push(`update ${tabla} ${Object.keys(cambios).join(',')}`); return cadena(null) },
  })
  const rpc = (f: string) => { llamadas.push(`rpc ${f}`); return Promise.resolve({ data: o.revinculadas ?? 0, error: null }) }
  const sesion = (o.conSesion ?? true) ? { session: { user: { email: 'taller@ejemplo.com' } } } : { session: null }
  return { cliente: { auth: { getSession: () => Promise.resolve({ data: sesion, error: null }) }, from, rpc } as unknown as ClienteBase, llamadas }
}

describe('la factura de la orden', () => {
  it('pide las propuestas de esa orden, la más probable primero, y dice cuál mandó un mail', async () => {
    const { cliente, llamadas } = clienteFalso({ propuestas: [
      { id_comprobante: 9, punto_venta: 2, numero: 9001, fecha_emision: '2026-08-26', total: '121.00', motivo: 'mail' },
      { id_comprobante: 8, punto_venta: 2, numero: 9000, fecha_emision: '2026-08-20', total: '50.00', motivo: 'misma_compania' },
    ] })
    const r = await leerPropuestas(7, cliente)
    expect(r.ok && r.dato).toEqual([
      { idComprobante: 9, puntoVenta: 2, numero: 9001, fecha: '2026-08-26', total: '121.00', porMail: true },
      { idComprobante: 8, puntoVenta: 2, numero: 9000, fecha: '2026-08-20', total: '50.00', porMail: false },
    ])
    expect(llamadas).toContain('  where id_orden = 7')
    expect(llamadas).toContain('  order orden_propuesta')
  })

  it('"Sí, es ésta" vincula como persona', async () => {
    const { cliente, llamadas } = clienteFalso()
    expect(await vincularFactura(7, 9, cliente)).toEqual({ ok: true, dato: null })
    expect(llamadas).toEqual(['insert orden_factura {"id_orden":7,"id_comprobante":9,"origen":"persona"}'])
  })

  it('"No es ésta" no borra: anota que se deshizo, sólo en los vínculos vigentes de esa orden', async () => {
    const { cliente, llamadas } = clienteFalso()
    await desvincularFacturas(7, cliente)
    expect(llamadas).toEqual(['update orden_factura deshecho_en', '  where id_orden = 7', '  where deshecho_en is null'])
  })

  it('después de importar, pide a la base que vuelva a mirar los envíos', async () => {
    const { cliente, llamadas } = clienteFalso({ revinculadas: 3 })
    expect(await revincularEnvios(cliente)).toEqual({ ok: true, dato: 3 })
    expect(llamadas).toEqual(['rpc fn_revincular_envios'])
  })

  it('sin sesión no pide nada', async () => {
    const { cliente, llamadas } = clienteFalso({ conSesion: false })
    expect(await vincularFactura(7, 9, cliente)).toEqual({ ok: false, fallo: { tipo: 'sin_sesion' } })
    expect(llamadas).toEqual([])
  })
})

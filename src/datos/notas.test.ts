/* Revisar notas: qué se le pide a la base y qué se arma con lo que contesta. Con un cliente falso:
 * que la base derive bien las candidatas lo prueba qa-m4-vistas-arca.sql contra la real. */

import { describe, expect, it } from 'vitest'
import type { ClienteBase } from './cliente-supabase'
import { agruparPorNota, desvincular, leerNotas, vincular, type FilaCandidata } from './notas'

const nota = (id: number, estado: FilaCandidata['estado'], factura: number | null): FilaCandidata => ({
  id_nota: id, nota_punto_venta: 2, nota_numero: id, nota_fecha: '2026-02-01', cuit_receptor: '30000000007',
  receptor_nombre: 'COMPAÑIA INVENTADA', total: '1000.00', id_factura: factura,
  factura_punto_venta: factura === null ? null : 2, factura_numero: factura, factura_fecha: factura === null ? null : '2026-01-01', estado,
})

describe('agruparPorNota', () => {
  it('una nota por renglón de nota, con todas sus facturas posibles', () => {
    const r = agruparPorNota([nota(1, 'ambigua', 10), nota(1, 'ambigua', 11), nota(2, 'sin_candidata', null)], new Map())
    expect(r.map((n) => [n.id, n.estado, n.facturas.map((f) => f.id)])).toEqual([[1, 'ambigua', [10, 11]], [2, 'sin_candidata', []]])
  })

  it('la que vinculó una persona sabe con qué fila, para poder deshacerla; la que se resolvió sola, no', () => {
    const r = agruparPorNota([nota(1, 'confirmada', 10), nota(2, 'unica', 12)], new Map([[1, { id_vinculo: 99, id_origen: 1, id_destino: 10 }]]))
    expect(r.map((n) => n.idVinculo)).toEqual([99, null])
  })

  it('la plata sigue siendo texto', () => {
    expect(agruparPorNota([nota(1, 'unica', 10)], new Map())[0]?.total).toBe('1000.00')
  })
})

/* Un cliente falso que responde a la cadena de supabase-js que usa notas.ts. */
function clienteFalso(o: { conSesion?: boolean; errorEn?: string } = {}) {
  const llamadas: string[] = []
  const resultado = (tabla: string, data: unknown) => Promise.resolve({ data: o.errorEn === tabla ? null : data, error: o.errorEn === tabla ? { message: 'permission denied' } : null })
  const datos: Record<string, unknown> = {
    vw_nc_candidatas: [nota(1, 'ambigua', 10), nota(1, 'ambigua', 11)],
    comprobante_vinculo: [{ id_vinculo: 5, id_origen: 3, id_destino: 1 }],
    tipo_comprobante: [{ codigo: 2 }],
    comprobante: [{ id_comprobante: 3, punto_venta: 2, numero: 1, fecha_emision: '2026-03-01', cuit_receptor: '30000000007', receptor_nombre: 'X', total: '1000.00' }],
  }
  // Cada método devuelve la misma cadena, y la cadena se puede esperar (como el builder de supabase-js).
  const cadena = (tabla: string): unknown => {
    const p = resultado(tabla, datos[tabla])
    return Object.assign(p, {
      select: () => cadena(tabla), order: () => cadena(tabla), eq: () => cadena(tabla), in: () => cadena(tabla), limit: () => cadena(tabla),
    })
  }
  const from = (tabla: string) => ({
    select: (cols: string) => { llamadas.push(`select ${tabla} ${cols}`); return cadena(tabla) },
    insert: (fila: unknown) => { llamadas.push(`insert ${tabla} ${JSON.stringify(fila)}`); return resultado(tabla, null) },
    delete: () => { llamadas.push(`delete ${tabla}`); return { eq: (c: string, v: unknown) => { llamadas.push(`  where ${c} = ${String(v)}`); return resultado(tabla, null) } } },
  })
  const sesion = (o.conSesion ?? true) ? { session: { user: { email: 'taller@ejemplo.com' } } } : { session: null }
  return { cliente: { auth: { getSession: () => Promise.resolve({ data: sesion, error: null }) }, from } as unknown as ClienteBase, llamadas }
}

describe('leerNotas', () => {
  it('junta las notas de crédito de la vista y las de débito con su vínculo', async () => {
    const { cliente } = clienteFalso()
    const r = await leerNotas(cliente)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dato.creditos.map((n) => n.facturas.length)).toEqual([2])
    expect(r.dato.debitos).toEqual([{ id: 3, puntoVenta: 2, numero: 1, fecha: '2026-03-01', total: '1000.00', cuitReceptor: '30000000007', receptor: 'X', vinculo: { idVinculo: 5, idDestino: 1 } }])
  })

  it('sin sesión no pregunta nada: "no hay notas" y "se venció la sesión" no se confunden', async () => {
    const { cliente, llamadas } = clienteFalso({ conSesion: false })
    expect(await leerNotas(cliente)).toEqual({ ok: false, fallo: { tipo: 'sin_sesion' } })
    expect(llamadas).toEqual([])
  })

  it('si la base rechaza una consulta, lo dice', async () => {
    const { cliente } = clienteFalso({ errorEn: 'comprobante_vinculo' })
    expect((await leerNotas(cliente)).ok).toBe(false)
  })
})

describe('decidir', () => {
  it('vincular escribe una sola fila; quién y cuándo los pone la base', async () => {
    const { cliente, llamadas } = clienteFalso()
    expect(await vincular({ idOrigen: 1, idDestino: 10, motivo: 'anula' }, cliente)).toEqual({ ok: true, dato: null })
    expect(llamadas).toEqual(['insert comprobante_vinculo {"id_origen":1,"id_destino":10,"motivo":"anula"}'])
  })

  it('deshacer borra esa fila y nada más', async () => {
    const { cliente, llamadas } = clienteFalso()
    await desvincular(5, cliente)
    expect(llamadas).toEqual(['delete comprobante_vinculo', '  where id_vinculo = 5'])
  })
})

/* Órdenes: qué se le pide a la base con cada toque. Con un cliente falso: que la base acepte o
 * rechace cada cambio (los checks de compañía y siniestro, que nadie borre) lo prueban
 * qa-010-verificacion.sql y qa-010b-robot.sql contra el Postgres local. */

import { describe, expect, it } from 'vitest'
import type { ClienteBase } from './cliente-supabase'
import * as ordenes from './ordenes'
import {
  cerrarOrden, confirmarOrden, descartarOrden, deshacerCierre, deshacerDescarte, FILAS_POR_PAGINA, leerCompanias, leerOrdenes,
} from './ordenes'

const fila = {
  id_orden: 7, compania: null, siniestro: 'ZZ-123', patente: 'AA000AA', fecha_emision: '2026-01-02', vence: '2027-01-02',
  dias_para_vencer: 74, monto_autorizado: '150000.00', perito: null, vehiculo: null, observaciones: null,
  anulada: false, anulada_por_mail: null, facturas: null, facturada: false, por_mail: null,
  a_confirmar: true, descartada: false, cerrada: false, cerrada_motivo: null,
}

/** n filas distintas de la vista, con ids 1..n, en el orden en que las manda la base. */
const filas = (n: number) => Array.from({ length: n }, (_, i) => ({ ...fila, id_orden: i + 1 }))

/* Un cliente falso que responde a la cadena de supabase-js que usa ordenes.ts. range() corta como
 * PostgREST: los dos extremos incluidos. fallaEnPedido hace fallar el pedido de ese número de página. */
function clienteFalso(o: { conSesion?: boolean; vista?: readonly unknown[]; fallaEnPedido?: number } = {}) {
  const llamadas: string[] = []
  const criterios: string[] = []
  const datos: Record<string, readonly unknown[]> = {
    vw_ordenes_trabajo: o.vista ?? [fila],
    compania: [{ cuit: '30000000007', nombre: 'Compañía inventada' }],
  }
  let pedidos = 0
  const cadena = (tabla: string): unknown =>
    Object.assign(Promise.resolve({ data: datos[tabla] ?? null, error: null }), {
      order: (c: string) => { criterios.push(c); return cadena(tabla) },
      eq: (c: string, v: unknown) => { llamadas.push(`  where ${c} = ${String(v)}`); return cadena(tabla) },
      range: (desde: number, hasta: number) => {
        llamadas.push(`  range ${desde}-${hasta}`)
        pedidos++
        if (pedidos === o.fallaEnPedido) return Promise.resolve({ data: null, error: { message: 'canceling statement due to statement timeout', code: '57014' } })
        return Promise.resolve({ data: (datos[tabla] ?? []).slice(desde, hasta + 1), error: null })
      },
    })
  const from = (tabla: string) => ({
    select: (cols: string) => { llamadas.push(`select ${tabla} ${cols}`); return cadena(tabla) },
    update: (cambios: unknown) => { llamadas.push(`update ${tabla} ${JSON.stringify(cambios)}`); return cadena(tabla) },
  })
  const sesion = (o.conSesion ?? true) ? { session: { user: { email: 'taller@ejemplo.com' } } } : { session: null }
  return { cliente: { auth: { getSession: () => Promise.resolve({ data: sesion, error: null }) }, from } as unknown as ClienteBase, llamadas, criterios }
}

describe('leer órdenes', () => {
  it('trae lo nuevo de la vista: a confirmar, descartada, cerrada y su motivo, y la compañía puede faltar', async () => {
    const { cliente, llamadas } = clienteFalso()
    const r = await leerOrdenes(cliente)
    expect(r.ok && r.dato[0]).toMatchObject({ id: 7, compania: null, aConfirmar: true, descartada: false, cerrada: false, cerradaMotivo: null, montoAutorizado: '150000.00' })
    expect(llamadas[0]).toMatch(/a_confirmar, descartada, cerrada, cerrada_motivo, /)
  })

  it('trae el pago de la factura (fase 2) sólo cuando está facturada, con la plata como texto', async () => {
    const pagada = { ...fila, id_orden: 8, a_confirmar: false, facturada: true, facturas: '2-9101 del 2026-09-01', por_mail: false,
      por_evidencia: 'aviso', pago_facturas_sin_aviso: 0, pago_falta: '0.00', pago_sin_importe: false, pago_ultimo: '2026-09-14',
      pago_por_siniestro: false, pago_acuse: null, pago_fecha_prometida: null }
    const { cliente, llamadas } = clienteFalso({ vista: [pagada, fila] })
    const r = await leerOrdenes(cliente)
    expect(r.ok && r.dato[0]).toMatchObject({ facturaPorEvidencia: 'aviso',
      pago: { facturasSinAviso: 0, falta: '0.00', sinImporte: false, ultimoPago: '2026-09-14', porSiniestro: false, acuse: null } })
    expect(r.ok && r.dato[1]?.pago).toBeNull()
    expect(llamadas[0]).toMatch(/por_evidencia, pago_facturas_sin_aviso, pago_falta, pago_sin_importe, pago_ultimo, pago_por_siniestro, pago_acuse, pago_fecha_prometida, gmail_message_id$/)
  })

  it('trae el mail de la orden para llegar a él, y nulo si se cargó a mano (issue #9)', async () => {
    const { cliente } = clienteFalso({ vista: [{ ...fila, id_orden: 1, gmail_message_id: '19ab0000cd' }, { ...fila, id_orden: 2, gmail_message_id: null }] })
    const r = await leerOrdenes(cliente)
    expect(r.ok && r.dato.map((o) => o.mail)).toEqual(['19ab0000cd', null])
  })

  it('el siniestro puede faltar en una a confirmar que el robot no pudo leer (RF-1014)', async () => {
    const { cliente } = clienteFalso({ vista: [{ ...fila, siniestro: null }] })
    const r = await leerOrdenes(cliente)
    expect(r.ok && r.dato[0]?.siniestro).toBeNull()
  })

  it('lee por páginas hasta traer todo: PostgREST corta en 1000 sin avisar, y lo último son las a confirmar', async () => {
    const { cliente, llamadas, criterios } = clienteFalso({ vista: filas(FILAS_POR_PAGINA + 3) })
    const r = await leerOrdenes(cliente)
    expect(r.ok && r.dato.map((o) => o.id)).toEqual(filas(FILAS_POR_PAGINA + 3).map((f) => f.id_orden))
    expect(llamadas.filter((l) => l.includes('range'))).toEqual(['  range 0-999', '  range 1000-1999'])
    // El id desempata: sin un orden total, dos de igual monto y fecha podrían cambiar de página.
    expect(criterios).toEqual(['monto_autorizado', 'fecha_emision', 'id_orden', 'monto_autorizado', 'fecha_emision', 'id_orden'])
  })

  it('con justo una página llena pide otra, que vuelve vacía, y termina', async () => {
    const { cliente, llamadas } = clienteFalso({ vista: filas(FILAS_POR_PAGINA) })
    const r = await leerOrdenes(cliente)
    expect(r.ok && r.dato.length).toBe(FILAS_POR_PAGINA)
    expect(llamadas.filter((l) => l.includes('range'))).toEqual(['  range 0-999', '  range 1000-1999'])
  })

  it('si el robot sube una orden entre página y página, la que se corre no sale dos veces', async () => {
    const vista = [...filas(FILAS_POR_PAGINA), { ...fila, id_orden: FILAS_POR_PAGINA }, { ...fila, id_orden: FILAS_POR_PAGINA + 1 }]
    const { cliente } = clienteFalso({ vista })
    const r = await leerOrdenes(cliente)
    expect(r.ok && r.dato.map((o) => o.id)).toEqual(filas(FILAS_POR_PAGINA + 1).map((f) => f.id_orden))
  })

  it('si falla la segunda página, falla todo: una lista a medias se leería como completa', async () => {
    const { cliente } = clienteFalso({ vista: filas(FILAS_POR_PAGINA + 3), fallaEnPedido: 2 })
    const r = await leerOrdenes(cliente)
    expect(r.ok).toBe(false)
  })

  it('sin sesión no le pregunta nada a la base', async () => {
    const { cliente, llamadas } = clienteFalso({ conSesion: false })
    const r = await leerOrdenes(cliente)
    expect(r.ok ? null : r.fallo.tipo).toBe('sin_sesion')
    expect(llamadas).toEqual([])
  })

  it('las compañías, para elegir de quién es una orden que el robot no supo', async () => {
    const { cliente, llamadas } = clienteFalso()
    const r = await leerCompanias(cliente)
    expect(r.ok && r.dato).toEqual([{ cuit: '30000000007', nombre: 'Compañía inventada' }])
    expect(llamadas).toEqual(['select compania cuit, nombre'])
  })
})

describe('cada toque escribe sólo lo suyo en orden_trabajo', () => {
  it('"Es una orden": con la compañía elegida y el siniestro tipeado, o dejando los que puso el robot', async () => {
    const { cliente, llamadas } = clienteFalso()
    await confirmarOrden(7, '30000000007', null, cliente)
    await confirmarOrden(8, null, null, cliente)
    await confirmarOrden(9, null, '900000000001', cliente)
    await confirmarOrden(10, '30000000007', '900000000002', cliente)
    expect(llamadas).toEqual([
      'update orden_trabajo {"a_confirmar":false,"cuit_compania":"30000000007"}', '  where id_orden = 7',
      'update orden_trabajo {"a_confirmar":false}', '  where id_orden = 8',
      'update orden_trabajo {"a_confirmar":false,"siniestro":"900000000001"}', '  where id_orden = 9',
      'update orden_trabajo {"a_confirmar":false,"cuit_compania":"30000000007","siniestro":"900000000002"}', '  where id_orden = 10',
    ])
  })

  it('"No es una orden" y su deshacer', async () => {
    const { cliente, llamadas } = clienteFalso()
    await descartarOrden(7, '2026-10-20', cliente)
    await deshacerDescarte(7, cliente)
    expect(llamadas).toEqual([
      'update orden_trabajo {"descartada_en":"2026-10-20"}', '  where id_orden = 7',
      'update orden_trabajo {"descartada_en":null}', '  where id_orden = 7',
    ])
  })

  it('"No se hizo" y su deshacer: fecha y motivo van y vuelven juntos', async () => {
    const { cliente, llamadas } = clienteFalso()
    await cerrarOrden(7, '2026-10-20', 'No se hizo', cliente)
    await deshacerCierre(7, cliente)
    expect(llamadas).toEqual([
      'update orden_trabajo {"cerrada_en":"2026-10-20","cerrada_motivo":"No se hizo"}', '  where id_orden = 7',
      'update orden_trabajo {"cerrada_en":null,"cerrada_motivo":null}', '  where id_orden = 7',
    ])
  })

  it('no hay forma de pedir que se borre una orden (RF-1013)', () => {
    expect(Object.keys(ordenes).filter((n) => /borrar/i.test(n))).toEqual([])
  })
})

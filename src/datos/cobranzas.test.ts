/* Cobranzas: qué se le pide a la base. Con un cliente falso: que cada factura quede en su estado y que el
 * arqueo cierre contra ARCA, lo prueba qa-m8-cobranzas.sql de semaforo-base contra el Postgres local. */

import { describe, expect, it } from 'vitest'
import type { ClienteBase } from './cliente-supabase'
import { leerCobranzas, leerFacturasDe } from './cobranzas'

function clienteFalso(o: { conSesion?: boolean; filas?: readonly unknown[]; error?: { code: string; message: string } } = {}) {
  const llamadas: string[] = []
  const cadena = (datos: unknown): unknown =>
    Object.assign(Promise.resolve({ data: o.error ? null : datos, error: o.error ?? null }), {
      eq: (c: string, v: unknown) => { llamadas.push(`  where ${c} = ${String(v)}`); return cadena(datos) },
      order: (c: string) => { llamadas.push(`  order ${c}`); return cadena(datos) },
    })
  const from = (tabla: string) => ({
    select: (cols: string) => { llamadas.push(`select ${tabla} ${cols.split(',').length} columnas`); return cadena(o.filas ?? []) },
  })
  const sesion = (o.conSesion ?? true) ? { session: { user: { email: 'taller@ejemplo.com' } } } : { session: null }
  return { cliente: { auth: { getSession: () => Promise.resolve({ data: sesion, error: null }) }, from } as unknown as ClienteBase, llamadas }
}

const resumen = {
  fila: 'compania', cuit: '30000000001', compania: 'Compañía Uno', facturas: 3, facturado: '300.00', cobrado: '100.00', anulado: '0.00',
  deuda: '200.00', a_reclamar: '150.00', en_curso: '50.00', aprobada: '0.00', pagada_sin_importe: '0.00', pago_no_visible: '0.00',
  sin_evidencia: '0.00', deuda_hasta_60: '50.00', deuda_de_61_a_120: '150.00', deuda_de_4_a_12_meses: '0.00', deuda_mas_de_un_anio: '0.00',
  facturas_a_reclamar: 1, facturas_deuda: 2, facturas_pago_no_visible: 0, facturas_sin_evidencia: 0, avisa_pagos: true,
  a_reclamar_desde: '2026-07-01', plazo_dias: 32, plazo_origen: 'observado',
}
const factura = {
  id_comprobante: 7, punto_venta: 2, numero: 3285, fecha_emision: '2026-07-01', total: '150.00', cobrado: '0.00', anulado: '0.00',
  saldo: '150.00', estado: 'a_reclamar', dias: 119, tramo: 'de_61_a_120', envio_visto: true, mail_envio: 'm1', vence: '2026-08-02',
  dias_vencida: 87, fecha_prometida: null, ultimo_pago: null, siniestros: '900000001',
}

describe('cobranzas, en la base', () => {
  it('lee el resumen, con la plata como texto y la deuda por antigüedad', async () => {
    const { cliente } = clienteFalso({ filas: [resumen, { ...resumen, fila: 'total', cuit: null, compania: 'Total', avisa_pagos: null, plazo_origen: null }] })
    const r = await leerCobranzas(cliente)
    expect(r.ok && r.dato !== 'todavia_no' && r.dato.map((f) => [f.fila, f.aReclamar, f.deudaPorTramo.de_61_a_120, f.avisaPagos, f.plazoOrigen])).toEqual([
      ['compania', '150.00', '150.00', true, 'observado'],
      ['total', '150.00', '150.00', false, null],
    ])
  })

  it('antes de la migración de cobranzas (la vista no existe) no es un error: es que todavía no está', async () => {
    const { cliente } = clienteFalso({ error: { code: 'PGRST205', message: "Could not find the table 'public.vw_cobranzas'" } })
    expect(await leerCobranzas(cliente)).toEqual({ ok: true, dato: 'todavia_no' })
  })

  it('pide las facturas de una compañía por su CUIT, o las de quien no tiene ficha', async () => {
    const una = clienteFalso({ filas: [factura, { ...factura, id_comprobante: 8, estado: 'otro_estado' }] })
    const r = await leerFacturasDe('30000000001', una.cliente)
    expect(una.llamadas).toEqual(['select vw_cobranza_factura 18 columnas', '  where cuit_receptor = 30000000001', '  where con_ficha = true', '  order fecha_emision'])
    expect(r.ok && r.dato.map((f) => [f.id, f.estado, f.saldo])).toEqual([[7, 'a_reclamar', '150.00']])
    const sinFicha = clienteFalso()
    await leerFacturasDe(null, sinFicha.cliente)
    expect(sinFicha.llamadas).toContain('  where con_ficha = false')
  })

  it('sin sesión no pregunta nada: lo dice', async () => {
    const { cliente, llamadas } = clienteFalso({ conSesion: false })
    expect(await leerCobranzas(cliente)).toEqual({ ok: false, fallo: { tipo: 'sin_sesion' } })
    expect(llamadas).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { TODAVIA_NO, leerCompras, leerMeses, leerProveedoresSinRubro, leerTeDeben, leerVentasDelMes, ponerRubro } from './plata'
import { baseFalsa } from './plata-falsa'

describe('la plata del taller', () => {
  it('lee los meses con los importes como texto, el más reciente primero', async () => {
    const { cliente, llamadas } = baseFalsa({ filas: { vw_plata_mes: [{
      mes: '2026-10-01', facturado: 350900.5, cobrado_companias: '242000.00', pagado_sin_importe: '121000.00', cobrado_particulares: '0.00', comprado: '171242.00',
      iva_ventas: '60900.00', iva_compras: '18942.00', retenciones_iva: '30000.00', retenciones: '45000.00', iva_estimado: '11958.00', comprobantes_ventas: 3, comprobantes_compras: 5,
    }] } })
    const r = await leerMeses(cliente)
    expect(r.ok && r.dato !== TODAVIA_NO && r.dato[0]).toMatchObject({ mes: '2026-10-01', facturado: '350900.5', ivaEstimado: '11958.00', comprobantesCompras: 5 })
    expect(llamadas).toEqual(['select vw_plata_mes 13 columnas', '  order mes'])
  })

  it('si la base todavía no tiene la migración, lo dice en vez de dar error', async () => {
    const { cliente } = baseFalsa({ errores: { vw_plata_mes: { code: 'PGRST205', message: 'no existe' } } })
    expect(await leerMeses(cliente)).toEqual({ ok: true, dato: TODAVIA_NO })
    const otro = baseFalsa({ errores: { vw_plata_mes: { code: '500', message: 'se rompió' } } })
    expect((await leerMeses(otro.cliente)).ok).toBe(false)
  })

  it('pide las compras de un mes y traduce las filas', async () => {
    const { cliente, llamadas } = baseFalsa({ filas: { vw_compras_mes: [
      { fila: 'mes', rubro: null, cuit: null, proveedor: null, comprado: '100.00', comprobantes: 2, mes_anterior: '0.00', en_el_anio: '100.00' },
      { fila: 'proveedor', rubro: 'sin_rubro', cuit: '30000000002', proveedor: 'Repuestos', comprado: '100.00', comprobantes: 2, mes_anterior: '50.00', en_el_anio: '150.00' },
    ] } })
    const r = await leerCompras('2026-10-01', cliente)
    expect(r.ok && r.dato[1]).toEqual({ fila: 'proveedor', rubro: 'sin_rubro', cuit: '30000000002', proveedor: 'Repuestos', comprado: '100.00', comprobantes: 2, mesAnterior: '50.00', enElAnio: '150.00' })
    expect(llamadas).toContain('  where mes = 2026-10-01')
  })

  it('lee lo que deben las compañías y los particulares', async () => {
    const { cliente } = baseFalsa({ filas: { vw_te_deben: [{ quien: 'companias', monto: '40200000.00', cuantas: 52, desde: '2025-01-03' }, { quien: 'particulares', monto: '55000.00', cuantas: 2, desde: null }] } })
    const r = await leerTeDeben(cliente)
    expect(r.ok && r.dato).toEqual([{ quien: 'companias', monto: '40200000.00', cuantas: 52, desde: '2025-01-03' }, { quien: 'particulares', monto: '55000.00', cuantas: 2, desde: null }])
  })

  it('trae los proveedores sin rubro, y le pone el rubro a uno', async () => {
    const { cliente, llamadas } = baseFalsa({ filas: { proveedor: [{ cuit: '30000000002', nombre: 'Repuestos', rubro: null }] }, devuelve: { proveedor: { data: [{ cuit: '30000000002' }] } } })
    const r = await leerProveedoresSinRubro(cliente)
    expect(r.ok && r.dato).toEqual([{ cuit: '30000000002', nombre: 'Repuestos', rubro: null }])
    expect(llamadas).toContain('  where rubro is null')
    expect(await ponerRubro('30000000002', 'repuestos', cliente)).toEqual({ ok: true, dato: null })
    expect(llamadas).toContain('update proveedor {"rubro":"repuestos"}')
    expect(llamadas).toContain('  where cuit = 30000000002')
  })

  it('si la base no cambió el rubro, lo dice', async () => {
    const { cliente } = baseFalsa({ devuelve: { proveedor: { data: [] } } })
    const r = await ponerRubro('30000000002', 'repuestos', cliente)
    expect(!r.ok && r.fallo.tipo).toBe('regla')
  })

  it('el libro de ventas del mes sale de su vista, por fecha', async () => {
    const { cliente, llamadas } = baseFalsa({ filas: { vw_ventas: [{ fecha_emision: '2026-10-02', tipo: 'Factura A', punto_venta: 2, numero: 3285, cuit_receptor: '30000000001', receptor: 'Seguros', neto_gravado: '100.00', iva: '21.00', total: '121.00' }] } })
    const r = await leerVentasDelMes('2026-10-01', cliente)
    expect(r.ok && r.dato[0]).toEqual({ fecha: '2026-10-02', tipo: 'Factura A', puntoVenta: 2, numero: 3285, cuit: '30000000001', nombre: 'Seguros', rubro: null, netoGravado: '100.00', iva: '21.00', total: '121.00' })
    expect(llamadas.slice(0, 2)).toEqual(['select vw_ventas 9 columnas', '  where mes = 2026-10-01'])
  })

  it('sin sesión no lee nada', async () => {
    const { cliente, llamadas } = baseFalsa({ meta: null })
    expect(await leerMeses(cliente)).toEqual({ ok: false, fallo: { tipo: 'sin_sesion' } })
    expect(llamadas).toEqual([])
  })
})

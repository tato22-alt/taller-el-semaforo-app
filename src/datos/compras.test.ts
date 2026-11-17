import { describe, expect, it } from 'vitest'
import type { CompraArca } from '../dominio/arca'
import { importarCompras, SIN_PERMISO } from './compras'
import { baseFalsa } from './plata-falsa'
import { sesionActual } from './sesion'

const compra = (o: Partial<CompraArca> = {}): CompraArca => ({
  renglon: 2, fechaEmision: '2025-03-10', tipoCodigo: 1, puntoVenta: 5, numero: 77, cuitEmisor: '30000000002', emisorNombre: 'Repuestos',
  cuitReceptor: null, moneda: 'PES', tipoCambio: '1', netoGravado: '1000.00', iva: '210.00', total: '1210.00', ...o,
})
const entrada = (filas: readonly CompraArca[]) => ({ archivoNombre: 'recibidos.csv', archivoHash: 'a'.repeat(64), leidas: filas.length, filas })

describe('importar las compras', () => {
  it('guarda la importación, un proveedor por CUIT y las compras en su tabla, sin duplicar', async () => {
    const { cliente, llamadas } = baseFalsa({ devuelve: { importacion: { data: { id_importacion: 9 } } } })
    const r = await importarCompras(entrada([compra(), compra({ numero: 78, emisorNombre: 'Otro nombre' }), compra({ numero: 5, cuitEmisor: '20000000001', emisorNombre: 'Pintor' })]), cliente)
    expect(r).toEqual({ ok: true, dato: { idImportacion: 9, nuevas: 0, yaEstaban: 3 } })
    expect(llamadas[0]).toBe('insert importacion {"fuente":"arca_recibidos","archivo_nombre":"recibidos.csv","archivo_hash":"' + 'a'.repeat(64) + '","filas_leidas":3}')
    expect(llamadas).toContain('upsert proveedor [{"cuit":"30000000002","nombre":"Repuestos"},{"cuit":"20000000001","nombre":"Pintor"}] {"onConflict":"cuit","ignoreDuplicates":true}')
    const compras = llamadas.find((l) => l.startsWith('upsert compra ')) ?? ''
    expect(compras).toContain('"total":"1210.00"')
    expect(compras).toContain('"id_importacion":9')
    expect(compras).toContain('{"onConflict":"cuit_emisor,tipo_codigo,punto_venta,numero","ignoreDuplicates":true}')
    expect(llamadas.some((l) => l.includes('comprobante'))).toBe(false)
  })

  it('sin el permiso de ver la plata no escribe nada, y lo dice', async () => {
    const { cliente, llamadas } = baseFalsa({ meta: { rol: 'persona' } })
    expect(await importarCompras(entrada([compra()]), cliente)).toEqual({ ok: false, fallo: { tipo: 'regla', detalle: SIN_PERMISO } })
    expect(llamadas).toEqual([])
  })

  it('sin sesión no escribe nada', async () => {
    const { cliente, llamadas } = baseFalsa({ meta: null })
    expect(await importarCompras(entrada([compra()]), cliente)).toEqual({ ok: false, fallo: { tipo: 'sin_sesion' } })
    expect(llamadas).toEqual([])
  })

  it('si la base rechaza los proveedores, no sigue con las compras', async () => {
    const { cliente, llamadas } = baseFalsa({ devuelve: { importacion: { data: { id_importacion: 9 } } }, errores: { proveedor: { code: '23514', message: 'no' } } })
    expect((await importarCompras(entrada([compra()]), cliente)).ok).toBe(false)
    expect(llamadas.some((l) => l.startsWith('upsert compra '))).toBe(false)
  })
})

describe('el permiso de ver la plata', () => {
  it('sale de app_metadata, y sólo vale el verdadero exacto', async () => {
    const ve = async (meta: Record<string, unknown>) => { const r = await sesionActual(baseFalsa({ meta }).cliente); return r.ok && r.dato?.vePlata }
    expect(await ve({ rol: 'persona', ve_plata: true })).toBe(true)
    expect(await ve({ rol: 'persona' })).toBe(false)
    expect(await ve({ rol: 'persona', ve_plata: 'true' })).toBe(false)
  })
})

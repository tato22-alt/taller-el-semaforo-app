/* La importación con un cliente falso: lo que se prueba es qué se le pide a la base y en qué
 * orden, no la red. Que la base no duplique lo prueba qa-m3-comprobantes.sql contra la real. */

import { describe, expect, it } from 'vitest'
import type { ComprobanteArca } from '../dominio/arca'
import type { ClienteBase } from './cliente-supabase'
import { importarComprobantes, prepararImportacion } from './comprobantes'

type Llamada = { tabla: string; operacion: string; datos?: unknown; opciones?: unknown }

function clienteFalso(o: {
  readonly conSesion?: boolean
  readonly nuevas?: number
  readonly errorEn?: string
  readonly tipos?: readonly number[]
  readonly ultimoEmisor?: string | null
}) {
  const llamadas: Llamada[] = []
  const error = (op: string) => (o.errorEn === op ? { message: 'permission denied' } : null)

  const from = (tabla: string) => ({
    insert: (datos: unknown) => {
      llamadas.push({ tabla, operacion: 'insert', datos })
      return {
        select: () => ({
          single: () => Promise.resolve({ data: error('insert') ? null : { id_importacion: 7 }, error: error('insert') }),
        }),
      }
    },
    upsert: (datos: unknown, opciones: unknown) => {
      llamadas.push({ tabla, operacion: 'upsert', datos, opciones })
      return Promise.resolve({ data: null, error: error('upsert') })
    },
    select: (_columnas: string, opciones?: { head?: boolean }) => {
      if (opciones?.head) {
        return { eq: () => Promise.resolve({ count: o.nuevas ?? 0, error: error('conteo') }) }
      }
      if (tabla === 'tipo_comprobante') {
        return Promise.resolve({ data: (o.tipos ?? [1, 3]).map((codigo) => ({ codigo })), error: error('tipos') })
      }
      return {
        order: () => ({
          limit: () => Promise.resolve({
            data: o.ultimoEmisor ? [{ cuit_emisor: o.ultimoEmisor }] : [],
            error: null,
          }),
        }),
      }
    },
  })

  const sesion = (o.conSesion ?? true) ? { session: { user: { email: 'taller@ejemplo.com' } } } : { session: null }
  const cliente = {
    auth: { getSession: () => Promise.resolve({ data: sesion, error: null }) },
    from,
  } as unknown as ClienteBase
  return { cliente, llamadas }
}

function fila(numero: number): ComprobanteArca {
  return {
    renglon: numero, fechaEmision: '2025-01-15', tipoCodigo: 1, puntoVenta: 2, numero,
    cuitReceptor: '30000000007', receptorNombre: 'COMPAÑIA INVENTADA', moneda: 'PES',
    tipoCambio: '1.00', netoGravado: '1000.00', iva: '210.00', total: '1210.00',
  }
}

const ENTRADA = { archivoNombre: 'inventado.csv', archivoHash: 'a'.repeat(64), leidas: 3, cuitEmisor: '20000000001' }

describe('importarComprobantes', () => {
  it('crea la importación y manda los comprobantes colgados de ella, sin duplicar', async () => {
    const { cliente, llamadas } = clienteFalso({ nuevas: 2 })
    const r = await importarComprobantes({ ...ENTRADA, filas: [fila(1), fila(2), fila(3)] }, cliente)

    expect(r).toEqual({ ok: true, dato: { idImportacion: 7, nuevas: 2, yaEstaban: 1 } })
    expect(llamadas.map((l) => `${l.operacion} ${l.tabla}`)).toEqual(['insert importacion', 'upsert comprobante'])
    expect(llamadas[1]?.opciones).toEqual({ onConflict: 'cuit_emisor,tipo_codigo,punto_venta,numero', ignoreDuplicates: true })
  })

  it('manda la plata como texto y el CUIT emisor en cada comprobante', async () => {
    const { cliente, llamadas } = clienteFalso({ nuevas: 1 })
    await importarComprobantes({ ...ENTRADA, filas: [fila(1)] }, cliente)
    const enviados = llamadas[1]?.datos as readonly Record<string, unknown>[]
    expect(enviados[0]).toMatchObject({ cuit_emisor: '20000000001', total: '1210.00', id_importacion: 7 })
  })

  it('manda de a 500 para no armar un pedido gigante', async () => {
    const { cliente, llamadas } = clienteFalso({ nuevas: 1200 })
    const filas = Array.from({ length: 1200 }, (_, i) => fila(i + 1))
    await importarComprobantes({ ...ENTRADA, leidas: 1200, filas }, cliente)
    expect(llamadas.filter((l) => l.operacion === 'upsert').map((l) => (l.datos as unknown[]).length)).toEqual([500, 500, 200])
  })

  it('sin sesión no escribe nada', async () => {
    const { cliente, llamadas } = clienteFalso({ conSesion: false })
    const r = await importarComprobantes({ ...ENTRADA, filas: [fila(1)] }, cliente)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fallo.tipo).toBe('sin_sesion')
    expect(llamadas).toEqual([])
  })

  it('si la base rechaza un lote, lo dice en vez de informar un resultado', async () => {
    const { cliente } = clienteFalso({ errorEn: 'upsert' })
    const r = await importarComprobantes({ ...ENTRADA, filas: [fila(1)] }, cliente)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fallo.tipo).toBe('base')
  })
})

describe('prepararImportacion', () => {
  it('trae los tipos que la base conoce y el último CUIT emisor', async () => {
    const { cliente } = clienteFalso({ tipos: [1, 3, 201], ultimoEmisor: '20000000001' })
    const r = await prepararImportacion(cliente)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect([...r.dato.tiposConocidos]).toEqual([1, 3, 201])
    expect(r.dato.ultimoEmisor).toBe('20000000001')
  })

  it('la primera vez no hay emisor anterior', async () => {
    const { cliente } = clienteFalso({ ultimoEmisor: null })
    const r = await prepararImportacion(cliente)
    expect(r.ok && r.dato.ultimoEmisor).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { agruparOrdenes, estadoDeOrden, sePuedeBorrar, validarOrden, vencimientoEnPalabras, type Orden } from './ordenes'

const orden = (o: Partial<Orden>): Orden => ({
  id: 1, compania: 'Compañía inventada', siniestro: 'ZZ-1', patente: null, fechaEmision: '2026-01-01',
  vence: '2027-01-01', diasParaVencer: 100, montoAutorizado: null, perito: null, anulada: false, facturada: false,
  ...o,
})

describe('estado de una orden', () => {
  it('anulada y facturada mandan sobre el vencimiento', () => {
    expect(estadoDeOrden(orden({ anulada: true, diasParaVencer: -5 }))).toBe('anulada')
    expect(estadoDeOrden(orden({ facturada: true, diasParaVencer: -5 }))).toBe('facturada')
  })

  it('por vencer desde 30 días antes, y vencida desde el día siguiente al vencimiento', () => {
    expect(estadoDeOrden(orden({ diasParaVencer: 31 }))).toBe('vigente')
    expect(estadoDeOrden(orden({ diasParaVencer: 30 }))).toBe('por_vencer')
    expect(estadoDeOrden(orden({ diasParaVencer: 0 }))).toBe('por_vencer')
    expect(estadoDeOrden(orden({ diasParaVencer: -1 }))).toBe('vencida')
  })
})

describe('borrar una orden', () => {
  it('sólo una vencida sin factura (RF-1010)', () => {
    expect(sePuedeBorrar(orden({ diasParaVencer: -1 }))).toBe(true)
    expect(sePuedeBorrar(orden({ diasParaVencer: 0 }))).toBe(false)
    expect(sePuedeBorrar(orden({ diasParaVencer: -1, facturada: true }))).toBe(false)
  })
})

describe('agrupar para la pantalla', () => {
  it('reparte en para atender, vigentes y resueltas, sin cambiar el orden', () => {
    const g = agruparOrdenes([
      orden({ id: 1, diasParaVencer: 10 }),
      orden({ id: 2, diasParaVencer: 200 }),
      orden({ id: 3, diasParaVencer: -5 }),
      orden({ id: 4, facturada: true }),
      orden({ id: 5, anulada: true }),
    ])
    expect(g.paraAtender.map((o) => o.id)).toEqual([1, 3])
    expect(g.vigentes.map((o) => o.id)).toEqual([2])
    expect(g.resueltas.map((o) => o.id)).toEqual([4, 5])
  })

  it('una vencida hace más de 30 días ya no se muestra', () => {
    const g = agruparOrdenes([orden({ diasParaVencer: -30 }), orden({ id: 2, diasParaVencer: -31 })])
    expect(g.paraAtender.map((o) => o.id)).toEqual([1])
  })
})

describe('el vencimiento en palabras', () => {
  it('dice cuánto falta o cuánto pasó', () => {
    expect(vencimientoEnPalabras(0)).toBe('vence hoy')
    expect(vencimientoEnPalabras(1)).toBe('vence mañana')
    expect(vencimientoEnPalabras(12)).toBe('vence en 12 días')
    expect(vencimientoEnPalabras(-1)).toBe('venció ayer')
    expect(vencimientoEnPalabras(-3)).toBe('venció hace 3 días')
  })
})

describe('cargar una orden a mano', () => {
  const base = { cuitCompania: '30000000000', siniestro: ' ZZ-1 ', patente: ' ab123cd ', fechaEmision: '2026-10-01', monto: '', perito: '' }

  it('pide compañía, siniestro y fecha', () => {
    expect(validarOrden({ ...base, cuitCompania: '' })).toMatchObject({ ok: false })
    expect(validarOrden({ ...base, siniestro: '  ' })).toMatchObject({ ok: false })
    expect(validarOrden({ ...base, fechaEmision: '' })).toMatchObject({ ok: false })
  })

  it('limpia el siniestro y la patente, y deja vacío lo opcional', () => {
    expect(validarOrden(base)).toEqual({
      ok: true,
      orden: { cuitCompania: '30000000000', siniestro: 'ZZ-1', patente: 'AB123CD', fechaEmision: '2026-10-01', montoAutorizado: null, perito: null },
    })
  })

  it('entiende el monto como lo escribe una persona, sin pasar por float', () => {
    const monto = (m: string) => {
      const r = validarOrden({ ...base, monto: m })
      return r.ok ? r.orden.montoAutorizado : r.motivo
    }
    expect(monto('150000')).toBe('150000')
    expect(monto('150.000')).toBe('150000')
    expect(monto('$ 150.000,50')).toBe('150000.50')
    expect(monto('150000,5')).toBe('150000.50')
    expect(monto('150000.50')).toBe('150000.50')
    expect(monto('1.234.567,89')).toBe('1234567.89')
    expect(validarOrden({ ...base, monto: 'mucho' })).toMatchObject({ ok: false })
  })
})

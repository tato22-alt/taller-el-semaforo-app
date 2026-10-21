import { describe, expect, it } from 'vitest'
import {
  agruparOrdenes, estadoDeOrden, siniestroEnPalabras, siniestroTipeado, situacionEnPalabras, vencimientoEnPalabras, type Orden,
} from './ordenes'

const orden = (o: Partial<Orden>): Orden => ({
  id: 1, compania: 'Compañía inventada', siniestro: 'ZZ-1', patente: null, fechaEmision: '2026-01-01',
  vence: '2027-01-01', diasParaVencer: 100, montoAutorizado: null, perito: null, vehiculo: null, observaciones: null, anulada: false, anuladaPorMail: false, facturada: false,
  aConfirmar: false, descartada: false, cerrada: false, cerradaMotivo: null,
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

  it('a confirmar manda sobre todo: hasta que alguien la mire, no cuenta como orden (RF-1014)', () => {
    expect(estadoDeOrden(orden({ aConfirmar: true, diasParaVencer: -5 }))).toBe('a_confirmar')
    expect(estadoDeOrden(orden({ aConfirmar: true, anulada: true, facturada: true }))).toBe('a_confirmar')
  })

  it('descartada, después cerrada, y recién después anulada y facturada (RF-1013)', () => {
    expect(estadoDeOrden(orden({ descartada: true, cerrada: true, anulada: true }))).toBe('descartada')
    expect(estadoDeOrden(orden({ cerrada: true, anulada: true, facturada: true }))).toBe('cerrada')
    expect(estadoDeOrden(orden({ cerrada: true, diasParaVencer: 10 }))).toBe('cerrada')
  })
})

describe('agrupar para la pantalla', () => {
  it('reparte en los cinco grupos, sin cambiar el orden', () => {
    const g = agruparOrdenes([
      orden({ id: 1, diasParaVencer: 10 }),
      orden({ id: 2, diasParaVencer: 200 }),
      orden({ id: 3, diasParaVencer: -5 }),
      orden({ id: 4, facturada: true }),
      orden({ id: 5, anulada: true }),
      orden({ id: 6, aConfirmar: true, compania: null }),
      orden({ id: 7, cerrada: true, cerradaMotivo: 'No se hizo', diasParaVencer: 5 }),
      orden({ id: 8, descartada: true }),
      orden({ id: 9, diasParaVencer: -400 }),
      orden({ id: 10, aConfirmar: true }),
    ])
    expect(g.paraConfirmar.map((o) => o.id)).toEqual([6, 10])
    expect(g.paraAtender.map((o) => o.id)).toEqual([1, 3])
    expect(g.vigentes.map((o) => o.id)).toEqual([2])
    expect(g.vencidasViejas.map((o) => o.id)).toEqual([9])
    expect(g.resueltas.map((o) => o.id)).toEqual([4, 5, 7, 8])
  })

  it('una vencida hace más de 30 días no desaparece: baja a vencidas sin factura (RF-1013)', () => {
    const g = agruparOrdenes([orden({ diasParaVencer: -30 }), orden({ id: 2, diasParaVencer: -31 })])
    expect(g.paraAtender.map((o) => o.id)).toEqual([1])
    expect(g.vencidasViejas.map((o) => o.id)).toEqual([2])
  })

  it('una a confirmar sin siniestro (el robot no lo leyó) también va arriba, para confirmar (RF-1014)', () => {
    const g = agruparOrdenes([orden({ id: 1, aConfirmar: true, siniestro: null, compania: null, diasParaVencer: 3 })])
    expect(g.paraConfirmar.map((o) => o.id)).toEqual([1])
    expect(g.paraAtender).toEqual([])
  })

  it('una cerrada no avisa aunque esté por vencer, y una a confirmar tampoco', () => {
    const g = agruparOrdenes([
      orden({ id: 1, cerrada: true, diasParaVencer: 3 }),
      orden({ id: 2, aConfirmar: true, diasParaVencer: 3 }),
    ])
    expect(g.paraAtender).toEqual([])
    expect(g.vencidasViejas).toEqual([])
  })

  it('ninguna orden se queda afuera', () => {
    const ordenes = [-400, -31, -30, -1, 0, 30, 31, 365].flatMap((dias, i) => [
      orden({ id: i * 10 + 1, diasParaVencer: dias }),
      orden({ id: i * 10 + 2, diasParaVencer: dias, cerrada: true }),
      orden({ id: i * 10 + 3, diasParaVencer: dias, aConfirmar: true }),
      orden({ id: i * 10 + 4, diasParaVencer: dias, descartada: true }),
      orden({ id: i * 10 + 5, diasParaVencer: dias, facturada: true }),
    ])
    const g = agruparOrdenes(ordenes)
    const repartidas = g.paraConfirmar.length + g.paraAtender.length + g.vigentes.length + g.vencidasViejas.length + g.resueltas.length
    expect(repartidas).toBe(ordenes.length)
  })
})

describe('la situación en palabras', () => {
  it('dice cómo se resolvió, o nada si la orden sigue corriendo o está a confirmar', () => {
    expect(situacionEnPalabras(orden({ cerrada: true, cerradaMotivo: 'No se hizo' }))).toBe('No se hizo')
    expect(situacionEnPalabras(orden({ cerrada: true }))).toBe('No se hizo')
    expect(situacionEnPalabras(orden({ descartada: true }))).toBe('No era una orden')
    expect(situacionEnPalabras(orden({ anulada: true }))).toBe('Anulada por la compañía')
    expect(situacionEnPalabras(orden({ anulada: true, anuladaPorMail: true }))).toBe('Anulada por la compañía (lo leyó el robot del mail)')
    expect(situacionEnPalabras(orden({ facturada: true }))).toBe('Facturada')
    expect(situacionEnPalabras(orden({ aConfirmar: true }))).toBeNull()
    expect(situacionEnPalabras(orden({ diasParaVencer: -5 }))).toBeNull()
    expect(situacionEnPalabras(orden({ diasParaVencer: 5 }))).toBeNull()
  })
})

describe('el siniestro', () => {
  it('en palabras: el número, o que falta', () => {
    expect(siniestroEnPalabras('900000000001')).toBe('siniestro 900000000001')
    expect(siniestroEnPalabras(null)).toBe('sin número de siniestro')
  })

  it('lo que tipea la persona: sin los espacios de las puntas, como lo guarda el robot', () => {
    expect(siniestroTipeado(' 900000000001 ')).toBe('900000000001')
    expect(siniestroTipeado('ZZ-123/4')).toBe('ZZ-123/4')
  })

  it('en blanco no es un número: "Es una orden" no se habilita', () => {
    expect(siniestroTipeado('')).toBeNull()
    expect(siniestroTipeado('   ')).toBeNull()
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

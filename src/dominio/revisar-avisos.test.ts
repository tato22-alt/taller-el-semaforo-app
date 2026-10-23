import { describe, expect, it } from 'vitest'
import {
  agruparPorCompania,
  claveDe,
  enlaceAlPdf,
  esQueRevisar,
  estadoDeCandidata,
  importeEscrito,
  puedeVincular,
  queEnPalabras,
  type CosaPorRevisar,
} from './revisar-avisos'

const cosa = (o: Partial<CosaPorRevisar>): CosaPorRevisar => ({
  gmailMessageId: 'm1', lineaOrden: null, que: 'aviso_sin_lector', recibido: '2026-10-01', remitente: 'pagos@ejemplo.com',
  compania: 'Compañía Uno', cuitCompania: '30000000001', numero: null, siniestro: null, detalle: null, bruto: null,
  asunto: null, pdfsDrive: [], ...o,
})

describe('revisar avisos', () => {
  it('dice qué es cada cosa en palabras del taller, y reconoce sólo las que manda la base', () => {
    expect(queEnPalabras('siniestro_sin_factura')).toBe('Dice sólo el siniestro, y no sé qué factura paga')
    expect(esQueRevisar('aviso_no_entendido')).toBe(true)
    expect(esQueRevisar('otra_cosa')).toBe(false)
  })

  it('sin compañía no hay facturas para elegir', () => {
    expect(puedeVincular({ cuitCompania: null })).toBe(false)
    expect(puedeVincular({ cuitCompania: '30000000001' })).toBe(true)
  })

  it('agrupa por compañía, la que más tiene primero, y adentro lo más nuevo primero', () => {
    const grupos = agruparPorCompania([
      cosa({ gmailMessageId: 'a', compania: 'Chica', recibido: '2026-09-01' }),
      cosa({ gmailMessageId: 'b', compania: 'Grande', recibido: '2026-08-01' }),
      cosa({ gmailMessageId: 'c', compania: 'Grande', recibido: '2026-10-01' }),
      cosa({ gmailMessageId: 'd', compania: null, cuitCompania: null, remitente: 'nadie@ejemplo.com' }),
    ])
    expect(grupos.map((g) => [g.nombre, g.cosas.map((c) => c.gmailMessageId)])).toEqual([
      ['Grande', ['c', 'b']],
      ['Chica', ['a']],
      ['nadie@ejemplo.com', ['d']],
    ])
  })

  it('cada cosa tiene su clave: el aviso entero y cada renglón por separado', () => {
    expect(claveDe({ gmailMessageId: 'm1', lineaOrden: null })).toBe('m1#0')
    expect(claveDe({ gmailMessageId: 'm1', lineaOrden: 2 })).toBe('m1#2')
  })

  it('arma el enlace al PDF del Drive', () => {
    expect(enlaceAlPdf('abc_123')).toBe('https://drive.google.com/file/d/abc_123/view')
  })

  it('una candidata sin aviso, pagada (con residuo de centavos) o con algo que le falta', () => {
    expect(estadoDeCandidata({ falta: null }, 1)).toBe('sin_aviso')
    expect(estadoDeCandidata({ falta: '0.01' }, 1)).toBe('pagada')
    expect(estadoDeCandidata({ falta: '1500.00' }, 1)).toBe('le_falta')
  })

  it('entiende los importes como los escribe el taller, sin pasar por float', () => {
    expect(importeEscrito('1.234.567,89')).toBe('1234567.89')
    expect(importeEscrito('$ 1.250')).toBe('1250.00')
    expect(importeEscrito('1250,5')).toBe('1250.50')
    expect(importeEscrito('1250.5')).toBe('1250.50')
    expect(importeEscrito('0012')).toBe('12.00')
  })

  it('no inventa un importe de lo que no se entiende', () => {
    for (const malo of ['', 'mil', '1,2,3', '12.34.5', '-500', '1.234,567']) expect(importeEscrito(malo), malo).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { recordatorioDeDeuda } from './mensajes'
import {
  autoEnPalabras, desdeCuandoDebe, deudasPorCobrar, faltaParaLaDeuda, leerMonto, montoParaCorregir, pagaDeMas, paraAnotar, type Deuda,
} from './particulares'

describe('un monto escrito a mano', () => {
  it('entiende los puntos de miles y la coma decimal', () => {
    expect(leerMonto('150000')).toBe('150000.00')
    expect(leerMonto('150.000')).toBe('150000.00')
    expect(leerMonto('$ 1.500.000,5')).toBe('1500000.50')
    expect(leerMonto('0')).toBe('0.00')
    expect(leerMonto('007')).toBe('7.00')
  })

  it('no adivina lo que no se entiende', () => {
    for (const mal of ['', 'mil', '1500.5', '15.00', '1,2,3', '-100', '1.5000', '10,999']) expect(leerMonto(mal), mal).toBeNull()
  })

  it('propone un monto para corregir, y lo vuelve a leer igual', () => {
    expect(montoParaCorregir('1500000.50')).toBe('1.500.000,50')
    expect(montoParaCorregir('80000.00')).toBe('80.000')
    expect(montoParaCorregir(null)).toBe('')
    expect(leerMonto(montoParaCorregir('1500000.50'))).toBe('1500000.50')
  })

  it('avisa cuando un pago es más que el saldo', () => {
    expect(pagaDeMas('80000.01', '80000.00')).toBe(true)
    expect(pagaDeMas('80000.00', '80000.00')).toBe(false)
    expect(pagaDeMas('9000.00', '80000.00')).toBe(false)
  })
})

describe('qué se anota por cada respuesta', () => {
  it('pagó todo o pagó otro monto: un cobro', () => {
    expect(paraAnotar('pago_todo', { monto: '500.000', pagoAhora: '' })).toEqual({ ok: true, cobro: '500000.00', deuda: null })
    expect(paraAnotar('pago_otro', { monto: '120.000,50', pagoAhora: '999' })).toEqual({ ok: true, cobro: '120000.50', deuda: null })
  })

  it('quedó debiendo: una deuda, y un cobro sólo si pagó algo', () => {
    expect(paraAnotar('quedo_debiendo', { monto: '80.000', pagoAhora: '' })).toEqual({ ok: true, cobro: null, deuda: '80000.00' })
    expect(paraAnotar('quedo_debiendo', { monto: '80.000', pagoAhora: '20.000' })).toEqual({ ok: true, cobro: '20000.00', deuda: '80000.00' })
    expect(paraAnotar('quedo_debiendo', { monto: '80.000', pagoAhora: '0' })).toEqual({ ok: true, cobro: null, deuda: '80000.00' })
  })

  it('de seguro: un cobro de cero, sin pedir monto', () => {
    expect(paraAnotar('seguro', { monto: '', pagoAhora: '' })).toEqual({ ok: true, cobro: '0.00', deuda: null })
  })

  it('sin monto, con monto cero o con algo que no se entiende, no anota', () => {
    expect(paraAnotar('pago_todo', { monto: '', pagoAhora: '' }).ok).toBe(false)
    expect(paraAnotar('pago_otro', { monto: '0', pagoAhora: '' }).ok).toBe(false)
    expect(paraAnotar('quedo_debiendo', { monto: '80.000', pagoAhora: 'algo' }).ok).toBe(false)
  })
})

const deuda = (o: Partial<Deuda>): Deuda => ({
  idDeuda: 1, deudor: 'Juan', telefono: null, detalle: null, numeroPresupuesto: 16010, patente: 'AB123CD', vehiculo: 'Ford Ka',
  monto: '80000.00', pagado: '0.00', saldo: '80000.00', fecha: '2026-10-01', dias: 10, pagos: 0, ultimoPago: null, sePuedeDeshacer: false, ...o,
})

describe('quién debe', () => {
  it('muestra sólo las deudas con saldo, de más días a menos', () => {
    const r = deudasPorCobrar([deuda({ idDeuda: 1, dias: 3 }), deuda({ idDeuda: 2, dias: 40 }), deuda({ idDeuda: 3, saldo: '0.00', dias: 90 }), deuda({ idDeuda: 4, saldo: '-5.00' })])
    expect(r.map((d) => d.idDeuda)).toEqual([2, 1])
  })

  it('nombra el auto con lo que haya', () => {
    expect(autoEnPalabras({ vehiculo: 'Ford Ka', patente: 'AB123CD', detalle: null })).toBe('Ford Ka (AB123CD)')
    expect(autoEnPalabras({ vehiculo: null, patente: 'AB123CD', detalle: null })).toBe('AB123CD')
    expect(autoEnPalabras({ vehiculo: null, patente: null, detalle: 'Gol gris' })).toBe('Gol gris')
    expect(autoEnPalabras({ vehiculo: null, patente: null, detalle: null })).toBe('auto sin datos')
  })

  it('dice desde cuándo debe', () => {
    expect([0, 1, 12].map(desdeCuandoDebe)).toEqual(['desde hoy', 'desde ayer', 'hace 12 días'])
  })

  it('dice qué falta para anotar una deuda a mano', () => {
    const completa = { deudor: 'Juan', monto: '50.000', conPresupuesto: true, detalle: '' }
    expect(faltaParaLaDeuda(completa)).toBeNull()
    expect(faltaParaLaDeuda({ ...completa, deudor: ' ' })).toBe('Falta quién debe.')
    expect(faltaParaLaDeuda({ ...completa, monto: '0' })).toContain('cuánto debe')
    expect(faltaParaLaDeuda({ ...completa, conPresupuesto: false })).toContain('qué auto')
    expect(faltaParaLaDeuda({ ...completa, conPresupuesto: false, detalle: 'Gol gris' })).toBeNull()
  })

  it('arma el recordatorio con el nombre, el saldo y el auto', () => {
    expect(recordatorioDeDeuda({ deudor: 'JUAN PEREZ', auto: 'Ford Ka (AB123CD)', saldo: '$80.000' }))
      .toBe('Hola Juan Perez, te escribimos de El Semáforo. Te recordamos que quedó un saldo de $80.000 del arreglo de tu Ford Ka (AB123CD). ¿Cuándo podés pasar a cancelarlo? ¡Gracias!')
    expect(recordatorioDeDeuda({ deudor: null, auto: null, saldo: '$1.000' })).toContain('Hola, te escribimos')
  })
})

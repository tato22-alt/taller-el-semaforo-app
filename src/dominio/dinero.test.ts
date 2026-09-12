import { describe, expect, it } from 'vitest'
import { formatearNumero, formatearPesos, SIN_DATO } from './dinero'

describe('formatearPesos', () => {
  it('formatea el string que manda PostgREST, sin tocar el valor', () => {
    expect(formatearPesos('15000.00')).toBe('$15.000')
    expect(formatearPesos('999.00')).toBe('$999')
    expect(formatearPesos('1234567.00')).toBe('$1.234.567')
  })

  it('muestra los centavos sólo si no son cero', () => {
    expect(formatearPesos('15000.50')).toBe('$15.000,50')
    expect(formatearPesos('15000.5')).toBe('$15.000,50')
    expect(formatearPesos('15000.00')).toBe('$15.000')
  })

  it('no pierde precisión en montos que un float redondearía mal', () => {
    // 0.1 + 0.2 en float da 0.30000000000000004. Acá el texto pasa entero.
    expect(formatearPesos('8999999999.99')).toBe('$8.999.999.999,99')
  })

  it('acepta number por comodidad, aunque la base no lo mande así', () => {
    expect(formatearPesos(15000)).toBe('$15.000')
  })

  it('devuelve el guión cuando no hay dato, en vez de $0 o NaN', () => {
    expect(formatearPesos(null)).toBe(SIN_DATO)
    expect(formatearPesos(undefined)).toBe(SIN_DATO)
    expect(formatearPesos('')).toBe(SIN_DATO)
    expect(formatearPesos('no es un número')).toBe(SIN_DATO)
  })

  it('mantiene el signo de los negativos', () => {
    expect(formatearPesos('-500.00')).toBe('$-500')
  })
})

describe('formatearNumero', () => {
  it('agrupa sin el signo pesos', () => {
    expect(formatearNumero('15000.00')).toBe('15.000')
  })
})

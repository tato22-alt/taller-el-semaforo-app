import { describe, expect, it } from 'vitest'
import { normalizarPatente, tieneFormatoDePatente } from './patente'

describe('normalizarPatente', () => {
  it('deja la patente como la guarda la base', () => {
    expect(normalizarPatente('ab 123 cd')).toBe('AB123CD')
    expect(normalizarPatente('AB-123-CD')).toBe('AB123CD')
    expect(normalizarPatente('  abc.123  ')).toBe('ABC123')
  })

  it('no explota sin dato', () => {
    expect(normalizarPatente(null)).toBe('')
    expect(normalizarPatente(undefined)).toBe('')
  })
})

describe('tieneFormatoDePatente', () => {
  it('acepta los dos formatos argentinos', () => {
    expect(tieneFormatoDePatente('AB123CD')).toBe(true)  // Mercosur
    expect(tieneFormatoDePatente('ABC123')).toBe(true)   // hasta 2016
    expect(tieneFormatoDePatente('ab 123 cd')).toBe(true)
  })

  it('rechaza lo que no lo es', () => {
    expect(tieneFormatoDePatente('AB12CD')).toBe(false)
    expect(tieneFormatoDePatente('12345')).toBe(false)
    expect(tieneFormatoDePatente('')).toBe(false)
  })
})

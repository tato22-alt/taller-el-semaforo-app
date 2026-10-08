import { describe, expect, it } from 'vitest'
import { cuitValido, normalizarCuit } from './cuit'

/* CUIT inventados, armados para que su dígito verificador cierre. */

describe('cuitValido', () => {
  it('acepta un CUIT cuyo verificador cierra', () => {
    expect(cuitValido('20000000001')).toBe(true)
    expect(cuitValido('30000000007')).toBe(true)
  })

  it('acepta guiones y espacios, como se escribe a mano', () => {
    expect(cuitValido('30-00000000-7')).toBe(true)
    expect(cuitValido(' 30 00000000 7 ')).toBe(true)
  })

  it('rechaza un dígito mal tipeado', () => {
    expect(cuitValido('30000000008')).toBe(false)
    expect(cuitValido('20000000002')).toBe(false)
  })

  it('rechaza lo que no tiene once dígitos', () => {
    expect(cuitValido('3000000000')).toBe(false)
    expect(cuitValido('300000000071')).toBe(false)
    expect(cuitValido('')).toBe(false)
    expect(cuitValido('treinta')).toBe(false)
  })
})

describe('normalizarCuit', () => {
  it('saca guiones y espacios', () => {
    expect(normalizarCuit('30-00000000-7')).toBe('30000000007')
  })

  it('devuelve null si no quedan once dígitos', () => {
    expect(normalizarCuit('30-0000-7')).toBeNull()
  })
})

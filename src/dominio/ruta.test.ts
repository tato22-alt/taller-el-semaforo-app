import { describe, expect, it } from 'vitest'
import { hashDeRuta, rutaDesdeHash } from './ruta'

describe('rutaDesdeHash', () => {
  it('entiende el tablero y la ficha', () => {
    expect(rutaDesdeHash('#/')).toEqual({ pantalla: 'tablero' })
    expect(rutaDesdeHash('')).toEqual({ pantalla: 'tablero' })
    expect(rutaDesdeHash('#/ficha/12')).toEqual({ pantalla: 'ficha', idTrabajo: 12 })
  })

  it('cae al tablero ante cualquier hash raro, nunca a una pantalla en blanco', () => {
    expect(rutaDesdeHash('#/ficha/abc')).toEqual({ pantalla: 'tablero' })
    expect(rutaDesdeHash('#/ficha/0')).toEqual({ pantalla: 'tablero' })
    expect(rutaDesdeHash('#/ficha/-3')).toEqual({ pantalla: 'tablero' })
    expect(rutaDesdeHash('#/lo-que-sea')).toEqual({ pantalla: 'tablero' })
  })
})

describe('hashDeRuta', () => {
  it('es la vuelta de rutaDesdeHash', () => {
    const ficha = { pantalla: 'ficha', idTrabajo: 7 } as const
    expect(rutaDesdeHash(hashDeRuta(ficha))).toEqual(ficha)
    expect(rutaDesdeHash(hashDeRuta({ pantalla: 'tablero' }))).toEqual({ pantalla: 'tablero' })
  })
})

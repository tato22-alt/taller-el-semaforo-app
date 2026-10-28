import { describe, expect, it } from 'vitest'
import { hashDeRuta, rutaDesdeHash } from './ruta'

describe('rutaDesdeHash', () => {
  it('entiende el tablero y la ficha', () => {
    expect(rutaDesdeHash('#/')).toEqual({ pantalla: 'tablero' })
    expect(rutaDesdeHash('')).toEqual({ pantalla: 'tablero' })
    expect(rutaDesdeHash('#/ficha/12')).toEqual({ pantalla: 'ficha', idTrabajo: 12 })
    expect(rutaDesdeHash('#/importar')).toEqual({ pantalla: 'importar' })
    expect(rutaDesdeHash('#/revisar')).toEqual({ pantalla: 'revisar' })
    expect(rutaDesdeHash('#/ordenes')).toEqual({ pantalla: 'ordenes' })
    expect(rutaDesdeHash('#/hoy')).toEqual({ pantalla: 'hoy' })
    expect(rutaDesdeHash('#/retenciones')).toEqual({ pantalla: 'retenciones' })
    expect(rutaDesdeHash('#/cobranzas')).toEqual({ pantalla: 'cobranzas' })
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
    expect(rutaDesdeHash(hashDeRuta({ pantalla: 'importar' }))).toEqual({ pantalla: 'importar' })
    expect(rutaDesdeHash(hashDeRuta({ pantalla: 'revisar' }))).toEqual({ pantalla: 'revisar' })
    expect(rutaDesdeHash(hashDeRuta({ pantalla: 'ordenes' }))).toEqual({ pantalla: 'ordenes' })
    expect(rutaDesdeHash(hashDeRuta({ pantalla: 'hoy' }))).toEqual({ pantalla: 'hoy' })
    expect(rutaDesdeHash(hashDeRuta({ pantalla: 'retenciones' }))).toEqual({ pantalla: 'retenciones' })
    expect(rutaDesdeHash(hashDeRuta({ pantalla: 'cobranzas' }))).toEqual({ pantalla: 'cobranzas' })
  })
})

import { describe, expect, it } from 'vitest'
import { linkDeWhatsApp, numeroDeWhatsApp } from './telefono'

describe('numeroDeWhatsApp', () => {
  it('pasa característica y número al formato de WhatsApp, con el 9 de los celulares', () => {
    // Es la forma en que se cargan casi todos en la herramienta de presupuestos.
    expect(numeroDeWhatsApp('2255123456')).toBe('5492255123456')
    expect(numeroDeWhatsApp('2255-123456')).toBe('5492255123456')
    expect(numeroDeWhatsApp('(02255) 12-3456')).toBe('5492255123456')
  })

  it('saca el 15 de los celulares escritos a la antigua', () => {
    expect(numeroDeWhatsApp('02255 15 123456')).toBe('5492255123456')
    expect(numeroDeWhatsApp('011 15 1234 5678')).toBe('5491112345678')
    expect(numeroDeWhatsApp('221 15 1234567')).toBe('5492211234567')
  })

  it('respeta un número que ya viene en formato internacional', () => {
    expect(numeroDeWhatsApp('+54 9 2255 123456')).toBe('5492255123456')
    expect(numeroDeWhatsApp('+54 2255 123456')).toBe('5492255123456')
  })

  it('no adivina: sin característica, o con una forma rara, no hay número', () => {
    expect(numeroDeWhatsApp('123456')).toBeNull()
    expect(numeroDeWhatsApp('15 1234 5678')).toBeNull()
    expect(numeroDeWhatsApp('')).toBeNull()
    expect(numeroDeWhatsApp(null)).toBeNull()
  })
})

describe('linkDeWhatsApp', () => {
  it('abre el chat de ese número con el mensaje escrito', () => {
    expect(linkDeWhatsApp('2255123456', 'Hola, ¿cómo va?')).toBe('https://wa.me/5492255123456?text=Hola%2C%20%C2%BFc%C3%B3mo%20va%3F')
  })

  it('sin número, abre WhatsApp con el mensaje y la persona elige el contacto', () => {
    expect(linkDeWhatsApp(null, 'Hola')).toBe('https://wa.me/?text=Hola')
  })
})

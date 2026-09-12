import { describe, expect, it } from 'vitest'
import { antiguedadEnPalabras, diasDesde, formatearFecha, hoyEnElTaller } from './fechas'

describe('formatearFecha', () => {
  it('no corre la fecha un día para atrás', () => {
    // El bug que esto evita: new Date('2026-09-12') es medianoche UTC, que en
    // Argentina es el 11 a las 21:00. toLocaleDateString mostraría 11/09.
    expect(formatearFecha('2026-09-12')).toBe('12/09/2026')
    expect(formatearFecha('2026-01-01')).toBe('01/01/2026')
  })

  it('devuelve guión si la fecha falta o no tiene forma de fecha', () => {
    expect(formatearFecha(null)).toBe('—')
    expect(formatearFecha('12/09/2026')).toBe('—')
    expect(formatearFecha('2026-13-01')).toBe('—')
  })
})

describe('diasDesde', () => {
  it('cuenta días completos entre dos fechas de calendario', () => {
    expect(diasDesde('2026-09-12', '2026-09-12')).toBe(0)
    expect(diasDesde('2026-09-11', '2026-09-12')).toBe(1)
    expect(diasDesde('2026-08-13', '2026-09-12')).toBe(30)
  })

  it('cruza fin de mes y fin de año sin errores de uno', () => {
    expect(diasDesde('2026-08-31', '2026-09-01')).toBe(1)
    expect(diasDesde('2025-12-31', '2026-01-01')).toBe(1)
  })

  it('no se corre por el horario de verano del hemisferio norte', () => {
    // Marzo y noviembre son donde un cálculo con hora local se va por una hora
    // y redondea mal a los días.
    expect(diasDesde('2026-03-01', '2026-03-31')).toBe(30)
    expect(diasDesde('2026-10-25', '2026-11-05')).toBe(11)
  })

  it('devuelve negativo si la fecha es futura, para que se pueda ver el error de carga', () => {
    expect(diasDesde('2026-09-20', '2026-09-12')).toBe(-8)
  })

  it('devuelve null si no hay fecha', () => {
    expect(diasDesde(null, '2026-09-12')).toBeNull()
  })
})

describe('hoyEnElTaller', () => {
  it('usa la zona del taller y no la del dispositivo', () => {
    // 2026-09-13 a las 01:00 UTC es todavía el 12 en Argentina (UTC-3).
    expect(hoyEnElTaller(new Date('2026-09-13T01:00:00Z'))).toBe('2026-09-12')
    expect(hoyEnElTaller(new Date('2026-09-13T04:00:00Z'))).toBe('2026-09-13')
  })
})

describe('antiguedadEnPalabras', () => {
  it('dice lo que una persona diría', () => {
    expect(antiguedadEnPalabras(0)).toBe('hoy')
    expect(antiguedadEnPalabras(1)).toBe('ayer')
    expect(antiguedadEnPalabras(40)).toBe('hace 40 días')
    expect(antiguedadEnPalabras(null)).toBe('sin fecha')
  })
})

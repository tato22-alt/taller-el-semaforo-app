import { describe, expect, it } from 'vitest'
import { mensajeDe, saludo, textoDelMensaje } from './mensajes'

const dias = (d: Partial<{ diasListo: number; diasParaTurno: number; diasSinTurno: number }>) => ({
  diasListo: null, diasParaTurno: null, diasSinTurno: null, ...d,
})

describe('mensajeDe', () => {
  it('un mensaje por momento del auto', () => {
    expect(mensajeDe(dias({ diasSinTurno: 2 }))).toBe('dar_turno')
    expect(mensajeDe(dias({ diasParaTurno: 6 }))).toBe('confirmar_turno')
    expect(mensajeDe(dias({ diasParaTurno: 1 }))).toBe('recordar_turno')
    expect(mensajeDe(dias({ diasParaTurno: 0 }))).toBe('reprogramar')
    expect(mensajeDe(dias({ diasParaTurno: -3 }))).toBe('reprogramar')
    expect(mensajeDe(dias({ diasListo: 0 }))).toBe('retirar')
    expect(mensajeDe(dias({ diasListo: 3 }))).toBe('recordar_retiro')
  })

  it('sin nada pendiente, no hay mensaje', () => {
    expect(mensajeDe(dias({}))).toBeNull()
  })
})

describe('textoDelMensaje', () => {
  const datos = { cliente: 'Juan Pérez', vehiculo: 'Ford Ka', patente: 'AB123CD', diaDelTurno: 'miércoles 28/10', diasParaTurno: 1 }

  it('nombra al cliente, el auto con su patente y la fecha del turno', () => {
    expect(textoDelMensaje('dar_turno', datos)).toBe(
      'Hola Juan Pérez, te escribimos de El Semáforo. Ya llegaron los repuestos de tu Ford Ka (AB123CD). ¿Qué día te queda bien traerlo? Así te damos turno.',
    )
    expect(textoDelMensaje('recordar_turno', datos)).toBe(
      'Hola Juan Pérez, te recordamos que mañana, miércoles 28/10, tenés turno en El Semáforo para tu Ford Ka (AB123CD). ¡Te esperamos!',
    )
    expect(textoDelMensaje('retirar', datos)).toBe('Hola Juan Pérez, tu Ford Ka (AB123CD) ya está listo. Podés pasar a retirarlo por El Semáforo cuando quieras.')
  })

  it('reprogramar: distinto si el turno era hoy o ya pasó', () => {
    expect(textoDelMensaje('reprogramar', { ...datos, diasParaTurno: 0 })).toContain('hoy tenías turno')
    expect(textoDelMensaje('reprogramar', { ...datos, diasParaTurno: -2 })).toContain('te esperábamos el miércoles 28/10')
  })

  it('sin vehículo ni patente, no deja huecos', () => {
    expect(textoDelMensaje('retirar', { ...datos, vehiculo: null, patente: null })).toBe(
      'Hola Juan Pérez, tu auto ya está listo. Podés pasar a retirarlo por El Semáforo cuando quieras.',
    )
  })
})

describe('saludo', () => {
  it('un nombre en mayúsculas se escribe como un nombre; uno bien escrito no se toca', () => {
    expect(saludo('PÉREZ JUAN')).toBe('Hola Pérez Juan')
    expect(saludo("O'CONNOR ANA-MARÍA")).toBe("Hola O'Connor Ana-María")
    expect(saludo('Juan de la Cruz')).toBe('Hola Juan de la Cruz')
  })

  it('sin nombre, sólo "Hola"', () => {
    expect(saludo(null)).toBe('Hola')
    expect(saludo('  ')).toBe('Hola')
  })
})

import { describe, expect, it } from 'vitest'
import { armarHoy, enTallerEnPalabras, hitosQueSiguen, preguntaDe, preguntaEnPalabras, tipoDeHito, type Auto } from './hitos'

function auto(cambios: Partial<Auto> = {}): Auto {
  return {
    idTrabajo: 1, numeroPresupuesto: 16001, patente: 'AB123CD', vehiculo: 'Ford Ka', cliente: 'Juan Pérez', telefono: '2255123456',
    repuestosLlegaron: null, turnoPara: null, entro: null, listo: null, salio: null,
    enTaller: false, diasEnTaller: null, diasSinTurno: null, diasParaTurno: null, diasListo: null,
    ultimoHito: null, ultimoTipo: null, ultimoSePuedeDeshacer: false,
    ...cambios,
  }
}

describe('preguntaDe', () => {
  it('llegaron los repuestos y no tiene turno: hay que darle turno', () => {
    expect(preguntaDe(auto({ diasSinTurno: 2 }))).toBe('dar_turno')
  })

  it('turno mañana: recordatorio; hoy o pasado sin entrar: ¿vino?', () => {
    expect(preguntaDe(auto({ diasParaTurno: 1 }))).toBe('recordar_turno')
    expect(preguntaDe(auto({ diasParaTurno: 0 }))).toBe('vino_al_turno')
    expect(preguntaDe(auto({ diasParaTurno: -4 }))).toBe('vino_al_turno')
  })

  it('un turno lejano no se pregunta todavía, y uno de hace más de un mes ya no', () => {
    expect(preguntaDe(auto({ diasParaTurno: 5 }))).toBeNull()
    expect(preguntaDe(auto({ diasParaTurno: -31 }))).toBeNull()
  })

  it('listo y sin retirar va antes que todo', () => {
    expect(preguntaDe(auto({ diasListo: 0, diasParaTurno: -2 }))).toBe('retirar')
  })

  it('un auto en el taller, sin nada pendiente, no tiene pregunta', () => {
    expect(preguntaDe(auto({ enTaller: true, diasEnTaller: 4 }))).toBeNull()
  })
})

describe('preguntaEnPalabras', () => {
  it('dice lo que hay que hacer, como lo diría una persona', () => {
    expect(preguntaEnPalabras('dar_turno', auto({ diasSinTurno: 3 }))).toBe('Llegaron los repuestos hace 3 días y no tiene turno')
    expect(preguntaEnPalabras('dar_turno', auto({ diasSinTurno: 0 }))).toBe('Llegaron los repuestos hoy: hay que darle turno')
    expect(preguntaEnPalabras('vino_al_turno', auto({ diasParaTurno: 0 }))).toBe('Hoy tiene turno: ¿vino?')
    expect(preguntaEnPalabras('vino_al_turno', auto({ diasParaTurno: -1 }))).toBe('Tenía turno ayer: ¿vino?')
    expect(preguntaEnPalabras('vino_al_turno', auto({ diasParaTurno: -5 }))).toBe('Tenía turno hace 5 días: ¿vino?')
    expect(preguntaEnPalabras('retirar', auto({ diasListo: 1 }))).toBe('Listo hace 1 día: ¿lo retiró?')
  })
})

describe('hitosQueSiguen', () => {
  it('a un auto sin hitos se le ofrecen los tres primeros', () => {
    expect(hitosQueSiguen(null)).toEqual(['repuestos', 'turno', 'entro'])
  })

  it('en el taller: listo y salió; ya listo, sólo salió', () => {
    expect(hitosQueSiguen(auto({ enTaller: true }))).toEqual(['listo', 'salio'])
    expect(hitosQueSiguen(auto({ enTaller: true, listo: '2026-10-20' }))).toEqual(['salio'])
  })

  it('con turno esperando: entró primero, y se puede dar otro turno', () => {
    expect(hitosQueSiguen(auto({ diasParaTurno: 0 }))).toEqual(['entro', 'turno'])
  })

  it('con repuestos sin turno: dar turno primero', () => {
    expect(hitosQueSiguen(auto({ diasSinTurno: 1 }))).toEqual(['turno', 'entro'])
  })
})

describe('armarHoy', () => {
  const recordar = auto({ idTrabajo: 1, diasParaTurno: 1 })
  const noVino = auto({ idTrabajo: 2, diasParaTurno: -2 })
  const repuestosViejo = auto({ idTrabajo: 3, diasSinTurno: 9 })
  const repuestosNuevo = auto({ idTrabajo: 4, diasSinTurno: 1 })
  const listo = auto({ idTrabajo: 5, enTaller: true, diasEnTaller: 6, listo: '2026-10-20', diasListo: 2 })
  const adentro = auto({ idTrabajo: 6, enTaller: true, diasEnTaller: 12 })
  const viene = auto({ idTrabajo: 7, diasParaTurno: 4 })
  const lejos = auto({ idTrabajo: 8, diasParaTurno: 20 })
  const perdido = auto({ idTrabajo: 9, diasParaTurno: -45 })
  const hoy = armarHoy([listo, repuestosNuevo, adentro, viene, noVino, recordar, lejos, repuestosViejo, perdido])

  it('las preguntas, lo más urgente primero y, dentro de lo mismo, lo que más espera', () => {
    expect(hoy.preguntas.map((p) => p.auto.idTrabajo)).toEqual([1, 2, 3, 4, 5])
  })

  it('en el taller, de más días a menos, incluido el que está listo', () => {
    expect(hoy.enTaller.map((a) => a.idTrabajo)).toEqual([6, 5])
  })

  it('los turnos de esta semana (el de mañana está en las preguntas) y los que no volvieron', () => {
    expect(hoy.proximosTurnos.map((a) => a.idTrabajo)).toEqual([7])
    expect(hoy.noVolvieron.map((a) => a.idTrabajo)).toEqual([9])
  })
})

describe('enTallerEnPalabras', () => {
  it('cuántos días lleva, y si ya está listo', () => {
    expect(enTallerEnPalabras(auto({ diasEnTaller: 0 }))).toBe('entró hoy')
    expect(enTallerEnPalabras(auto({ diasEnTaller: 6, listo: '2026-10-20' }))).toBe('hace 6 días · listo')
  })
})

describe('tipoDeHito', () => {
  it('sólo los cinco hitos; cualquier otra cosa es nula', () => {
    expect(tipoDeHito('listo')).toBe('listo')
    expect(tipoDeHito('pintura')).toBeNull()
    expect(tipoDeHito(null)).toBeNull()
  })
})

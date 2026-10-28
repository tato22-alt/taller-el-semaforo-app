/* El calendario del taller (spec 015 de semaforo-base). Que la base dé las fechas correctas lo prueba
 * qa-calendario.sql de semaforo-base contra el Postgres local; acá, que el robot deje el calendario
 * igual a esas fechas sin tocar lo que no es suyo. Todo inventado: no hay ningún Google de verdad. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const CARPETA = import.meta.dirname

type Fecha = { marca: string; fecha: string; titulo: string; descripcion: string }
type Plan = { crear: Fecha[]; cambiar: { id: string; fecha: Fecha }[]; borrar: string[] }

const { planDelCalendario } = runInNewContext(
  readFileSync(join(CARPETA, 'lectores', 'calendario.js'), 'utf8') + '\n;({ planDelCalendario })',
  {},
) as { planDelCalendario: (fechas: Fecha[], eventos: (Fecha & { id: string })[]) => Plan }

/* El resultado sale de otro contexto de vm: se pasa por JSON para compararlo con objetos de acá. */
const plan = (fechas: Fecha[], eventos: (Fecha & { id: string })[]) => JSON.parse(JSON.stringify(planDelCalendario(fechas, eventos))) as Plan

const turno: Fecha = { marca: 'turno-12', fecha: '2026-11-03', titulo: 'Turno · Ford Ka AA000AA · Juan', descripcion: 'Tel. 1' }
const vence: Fecha = { marca: 'vence-40', fecha: '2027-01-15', titulo: 'Vence la orden · Compañía · siniestro 1', descripcion: 'd' }

describe('qué hacer para que el calendario diga lo que dice la base', () => {
  it('crea lo que falta y no toca lo que ya está igual', () => {
    expect(plan([turno, vence], [{ ...turno, id: 'e1' }])).toEqual({ crear: [vence], cambiar: [], borrar: [] })
  })

  it('un turno que pasó a otro día se cambia, no se borra y se crea', () => {
    const otroDia = { ...turno, fecha: '2026-11-05' }
    expect(plan([otroDia], [{ ...turno, id: 'e1' }])).toEqual({ crear: [], cambiar: [{ id: 'e1', fecha: otroDia }], borrar: [] })
  })

  it('lo que la base ya no da se borra: un turno deshecho, una orden que se facturó', () => {
    expect(plan([vence], [{ ...turno, id: 'e1' }, { ...vence, id: 'e2' }])).toEqual({ crear: [], cambiar: [], borrar: ['e1'] })
  })

  it('si quedó un evento repetido, se borra el segundo; si la base repite una marca, se crea uno', () => {
    expect(plan([turno], [{ ...turno, id: 'e1' }, { ...turno, id: 'e2' }])).toEqual({ crear: [], cambiar: [], borrar: ['e2'] })
    expect(plan([turno, { ...turno, titulo: 'otro' }], [])).toEqual({ crear: [turno], cambiar: [], borrar: [] })
  })

  it('sin fechas en la base, borra los suyos (y sólo los suyos: los demás ni le llegan)', () => {
    expect(plan([], [{ ...turno, id: 'e1' }])).toEqual({ crear: [], cambiar: [], borrar: ['e1'] })
  })
})

/* ------------------------------------------------------------------------------------------- */

/** "2026-10-27" del día de hoy más n días, con la hora local (la del script, en Apps Script). */
const dia = (n: number) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Evento = {
  id: string; titulo: string; fecha: string; descripcion: string; marca: string | null; borrado: boolean; todoElDia: boolean
}

/** Un Google Calendar falso: guarda los eventos en una lista y anota lo que se le pide. */
function googleFalso(o: { fechas: Fecha[]; eventos?: Evento[]; calendarioExiste?: boolean; respuesta?: number }) {
  const eventos = o.eventos ?? []
  const llamadas: string[] = []
  let creados = 0
  const aTexto = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // Sin addGuest ni nada que invite: si el robot lo llamara, el test reventaría.
  const comoGoogle = (e: Evento) => ({
    getId: () => e.id,
    getTag: (k: string) => (k === 'semaforo' ? e.marca : null),
    setTag: (k: string, v: string) => { llamadas.push(`marca ${e.id} ${k}=${v}`); e.marca = v },
    isAllDayEvent: () => e.todoElDia,
    getAllDayStartDate: () => new Date(`${e.fecha}T00:00:00`),
    getTitle: () => e.titulo,
    getDescription: () => e.descripcion,
    setAllDayDate: (d: Date) => { llamadas.push(`mueve ${e.id} ${aTexto(d)}`); e.fecha = aTexto(d) },
    setTitle: (t: string) => { llamadas.push(`titulo ${e.id}`); e.titulo = t },
    setDescription: (t: string) => { llamadas.push(`descripcion ${e.id}`); e.descripcion = t },
    deleteEvent: () => { llamadas.push(`borra ${e.id}`); e.borrado = true },
  })
  const calendario = {
    isOwnedByMe: () => true,
    getEvents: (desde: Date, hasta: Date) =>
      eventos.filter((e) => !e.borrado && e.fecha >= aTexto(new Date(desde.getTime() - 86400000)) && e.fecha < aTexto(hasta)).map(comoGoogle),
    createAllDayEvent: (titulo: string, d: Date, opciones: { description: string }) => {
      const e: Evento = { id: `nuevo-${++creados}`, titulo, fecha: aTexto(d), descripcion: opciones.description, marca: null, borrado: false, todoElDia: true }
      eventos.push(e)
      llamadas.push(`crea ${e.id} ${e.fecha}`)
      return comoGoogle(e)
    },
  }
  const contexto = {
    CalendarApp: {
      getCalendarsByName: (n: string) => (o.calendarioExiste === false ? [] : n === 'El Semáforo' ? [calendario] : []),
      createCalendar: (n: string, opciones: { timeZone: string }) => { llamadas.push(`crea el calendario ${n} ${opciones.timeZone}`); return calendario },
    },
    UrlFetchApp: {
      fetch: (url: string) => {
        if (url.includes('/auth/v1/token')) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: 'falso' }) }
        llamadas.push(`pide ${url.replace(/^.*\/rpc\//, '')}`)
        return { getResponseCode: () => o.respuesta ?? 200, getContentText: () => JSON.stringify(o.fechas) }
      },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => (k === 'SUPABASE_URL' ? 'https://base.example' : 'x') }) },
    Utilities: { formatDate: (d: Date) => aTexto(d) },
  }
  const { sincronizarCalendario, sincronizarCalendarioSinCortar } = runInNewContext(
    readFileSync(join(CARPETA, 'robot.gs'), 'utf8') + '\n;({ sincronizarCalendario, sincronizarCalendarioSinCortar })',
    contexto,
  ) as { sincronizarCalendario: () => string; sincronizarCalendarioSinCortar: (inicio: number) => string }
  return { sincronizarCalendario, sincronizarCalendarioSinCortar, eventos, llamadas }
}

const evento = (id: string, f: Partial<Evento>): Evento =>
  ({ id, titulo: 't', fecha: dia(1), descripcion: 'd', marca: null, borrado: false, todoElDia: true, ...f })

describe('el robot deja el calendario igual a la base', () => {
  it('crea el calendario si no está, y cada evento con su marca', () => {
    const g = googleFalso({ calendarioExiste: false, fechas: [{ ...turno, fecha: dia(3) }] })
    expect(g.sincronizarCalendario()).toBe('Calendario: 1 eventos nuevos, 0 cambiados y 0 borrados.')
    expect(g.llamadas).toEqual([
      'pide fn_robot_fechas_calendario',
      'crea el calendario El Semáforo America/Argentina/Buenos_Aires',
      `crea nuevo-1 ${dia(3)}`,
      'marca nuevo-1 semaforo=turno-12',
    ])
  })

  it('mueve, cambia y borra sólo los suyos; lo de una persona y lo de antes de hoy no lo toca', () => {
    const g = googleFalso({
      fechas: [{ ...turno, fecha: dia(5) }, { ...vence, fecha: dia(60) }],
      eventos: [
        evento('suyo-movido', { ...turno, fecha: dia(3) }),
        evento('suyo-igual', { ...vence, fecha: dia(60) }),
        evento('suyo-deshecho', { marca: 'turno-99', fecha: dia(2) }),
        evento('suyo-de-ayer', { marca: 'turno-98', fecha: dia(-1) }),
        evento('de-una-persona', { titulo: 'Pagar a Roberto', fecha: dia(2) }),
      ],
    })
    expect(g.sincronizarCalendario()).toBe('Calendario: 0 eventos nuevos, 1 cambiados y 1 borrados.')
    expect(g.llamadas).toEqual(['pide fn_robot_fechas_calendario', 'borra suyo-deshecho', `mueve suyo-movido ${dia(5)}`])
    expect(g.eventos.filter((e) => e.borrado).map((e) => e.id)).toEqual(['suyo-deshecho'])
  })

  it('correrlo dos veces seguidas no duplica nada (criterio 5)', () => {
    const g = googleFalso({ fechas: [{ ...turno, fecha: dia(3) }, { ...vence, fecha: dia(60) }] })
    g.sincronizarCalendario()
    expect(g.sincronizarCalendario()).toBe('Calendario al día: 2 fechas.')
    expect(g.eventos.filter((e) => !e.borrado)).toHaveLength(2)
  })

  it('si la base no contesta, no toca nada; y un error del calendario no corta el barrido', () => {
    const g = googleFalso({ fechas: [], respuesta: 500, eventos: [evento('suyo', { marca: 'turno-1' })] })
    expect(g.sincronizarCalendario()).toMatch(/^Calendario sin actualizar: error HTTP 500/)
    expect(g.eventos[0]?.borrado).toBe(false)
    const roto = googleFalso({ fechas: [] })
    const sinPermiso = runInNewContext(
      readFileSync(join(CARPETA, 'robot.gs'), 'utf8') + '\n;({ sincronizarCalendarioSinCortar })',
      { PropertiesService: { getScriptProperties: () => { throw new Error('Se necesita autorización para CalendarApp') } } },
    ) as { sincronizarCalendarioSinCortar: (inicio: number) => string }
    expect(sinPermiso.sincronizarCalendarioSinCortar(Date.now())).toBe('Calendario sin actualizar: Se necesita autorización para CalendarApp')
    expect(roto.llamadas).toEqual([])
  })

  it('nunca invita a nadie: en el código no hay invitados (R1)', () => {
    const codigo = readFileSync(join(CARPETA, 'calendario.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(codigo).not.toMatch(/addGuest|removeGuest|guests|sendInvites|inviteGuests|addEmailReminder/i)
  })
})

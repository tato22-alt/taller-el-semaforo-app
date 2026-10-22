/* Los hitos: qué se le pide a la base con cada toque. Con un cliente falso: que la base derive bien
 * los días, rechace un hito que no es uno de los cinco y no deje borrar uno de hace más de una
 * semana, lo prueba qa-011-verificacion.sql contra el Postgres local. */

import { describe, expect, it } from 'vitest'
import type { ClienteBase } from './cliente-supabase'
import { anotarHito, buscarPorPatente, deshacerHito, leerAutos } from './hitos'

function clienteFalso(o: { conSesion?: boolean; filas?: readonly unknown[]; borradas?: readonly unknown[] } = {}) {
  const llamadas: string[] = []
  const cadena = (datos: unknown): unknown =>
    Object.assign(Promise.resolve({ data: datos, error: null }), {
      eq: (c: string, v: unknown) => { llamadas.push(`  where ${c} = ${String(v)}`); return cadena(datos) },
      or: (f: string) => { llamadas.push(`  or ${f}`); return cadena(datos) },
      ilike: (c: string, v: string) => { llamadas.push(`  where ${c} ilike ${v}`); return cadena(datos) },
      order: (c: string) => { llamadas.push(`  order ${c}`); return cadena(datos) },
      range: (d: number, h: number) => { llamadas.push(`  range ${d}-${h}`); return cadena(datos) },
      limit: (n: number) => { llamadas.push(`  limit ${n}`); return cadena(datos) },
      select: (cols: string) => { llamadas.push(`  returning ${cols}`); return cadena(o.borradas ?? []) },
    })
  const from = (tabla: string) => ({
    select: (cols: string) => { llamadas.push(`select ${tabla} ${cols.split(',').length} columnas`); return cadena(o.filas ?? []) },
    insert: (fila: unknown) => { llamadas.push(`insert ${tabla} ${JSON.stringify(fila)}`); return cadena(null) },
    delete: () => { llamadas.push(`delete ${tabla}`); return cadena(null) },
  })
  const sesion = (o.conSesion ?? true) ? { session: { user: { email: 'taller@ejemplo.com' } } } : { session: null }
  return { cliente: { auth: { getSession: () => Promise.resolve({ data: sesion, error: null }) }, from } as unknown as ClienteBase, llamadas }
}

const fila = {
  id_trabajo: 3, numero_presupuesto: 16010, patente: 'AB123CD', vehiculo: 'Ford Ka', cliente: 'Juan', telefono: '2255123456',
  repuestos_llegaron: '2026-10-20', turno_para: null, entro: null, listo: null, salio: null, en_taller: false,
  dias_en_taller: null, dias_sin_turno: 2, dias_para_turno: null, dias_listo: null,
  ultimo_hito: 41, ultimo_tipo: 'repuestos', ultimo_se_puede_deshacer: true,
}

describe('los hitos', () => {
  it('lee de la vista sólo los autos con algo pendiente, y traduce los nombres', async () => {
    const { cliente, llamadas } = clienteFalso({ filas: [fila] })
    const r = await leerAutos(cliente)
    expect(r.ok && r.dato[0]).toMatchObject({ idTrabajo: 3, diasSinTurno: 2, ultimoTipo: 'repuestos', ultimoSePuedeDeshacer: true })
    expect(llamadas[0]).toBe('select vw_autos_en_taller 19 columnas')
    expect(llamadas).toContain('  or en_taller.is.true,dias_sin_turno.not.is.null,dias_para_turno.not.is.null,dias_listo.not.is.null')
  })

  it('anota el toque con la fecha que le pasan; el turno, con para cuándo', async () => {
    const { cliente, llamadas } = clienteFalso()
    await anotarHito(3, 'entro', '2026-10-22', null, cliente)
    await anotarHito(3, 'turno', '2026-10-22', '2026-10-28', cliente)
    expect(llamadas).toEqual([
      'insert hito_trabajo {"id_trabajo":3,"tipo":"entro","fecha":"2026-10-22"}',
      'insert hito_trabajo {"id_trabajo":3,"tipo":"turno","fecha":"2026-10-22","fecha_turno":"2026-10-28"}',
    ])
  })

  it('deshacer borra ese hito y confirma que se borró', async () => {
    const { cliente, llamadas } = clienteFalso({ borradas: [{ id_hito: 41 }] })
    expect(await deshacerHito(41, cliente)).toEqual({ ok: true, dato: null })
    expect(llamadas).toEqual(['delete hito_trabajo', '  where id_hito = 41', '  returning id_hito'])
  })

  it('si la base no borró nada (pasó la semana), no dice que se deshizo', async () => {
    const { cliente } = clienteFalso({ borradas: [] })
    const r = await deshacerHito(41, cliente)
    expect(r.ok).toBe(false)
  })

  it('busca por patente normalizada, y no busca con menos de tres caracteres', async () => {
    const { cliente, llamadas } = clienteFalso({ filas: [] })
    await buscarPorPatente('ab 123', cliente)
    expect(llamadas).toContain('  where patente_norm ilike %AB123%')
    const corto = clienteFalso()
    expect(await buscarPorPatente('a', corto.cliente)).toEqual({ ok: true, dato: [] })
    expect(corto.llamadas).toEqual([])
  })

  it('sin sesión no pide nada', async () => {
    const { cliente, llamadas } = clienteFalso({ conSesion: false })
    expect(await anotarHito(3, 'entro', '2026-10-22', null, cliente)).toEqual({ ok: false, fallo: { tipo: 'sin_sesion' } })
    expect(llamadas).toEqual([])
  })
})

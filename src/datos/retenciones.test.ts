/* El libro de retenciones: qué se le pide a la base. Con un cliente falso: que el libro no cuente dos
 * veces un certificado, que valga la última lectura y que el robot no lo lea, lo prueba qa-libro.sql de
 * semaforo-base contra el Postgres local. */

import { describe, expect, it } from 'vitest'
import type { ClienteBase } from './cliente-supabase'
import { leerLibro, leerMeses } from './retenciones'

function clienteFalso(o: { conSesion?: boolean; filas?: readonly unknown[]; error?: { code: string; message: string } } = {}) {
  const llamadas: string[] = []
  const cadena = (datos: unknown): unknown =>
    Object.assign(Promise.resolve({ data: o.error ? null : datos, error: o.error ?? null }), {
      eq: (c: string, v: unknown) => { llamadas.push(`  where ${c} = ${String(v)}`); return cadena(datos) },
      order: (c: string, opciones?: { ascending: boolean }) => { llamadas.push(`  order ${c}${opciones?.ascending === false ? ' desc' : ''}`); return cadena(datos) },
    })
  const from = (tabla: string) => ({
    select: (cols: string) => { llamadas.push(`select ${tabla} ${cols}`); return cadena(o.filas ?? []) },
  })
  const sesion = (o.conSesion ?? true) ? { session: { user: { email: 'taller@ejemplo.com' } } } : { session: null }
  return { cliente: { auth: { getSession: () => Promise.resolve({ data: sesion, error: null }) }, from } as unknown as ClienteBase, llamadas }
}

const mes = {
  mes: '2026-10-01', total: '603281.05', iva: '426793.73', ganancias: '49465.38', iibb: '101617.56', suss: '25404.38', otro: '0',
  retenciones: 8, sin_certificado: 0, companias: 1,
}
const fila = {
  id_retencion: 1, gmail_message_id: 'm1', cuit: '30000000001', compania: 'Compañía Uno', fecha: '2026-10-15', mes: '2026-10-01',
  impuesto: 'iva', concepto: 'IVA', certificado: null, importe: '69421.49', op: null, facturas: null, siniestros: ['S-1'],
}

describe('el libro de retenciones, en la base', () => {
  it('lee los meses, el más reciente primero, con la plata como texto', async () => {
    const { cliente, llamadas } = clienteFalso({ filas: [mes] })
    const r = await leerMeses(cliente)
    expect(llamadas).toContain('  order mes desc')
    expect(r.ok && r.dato).toEqual([{
      mes: '2026-10-01', total: '603281.05',
      porImpuesto: { iva: '426793.73', ganancias: '49465.38', iibb: '101617.56', suss: '25404.38', otro: '0' },
      retenciones: 8, sinCertificado: 0, companias: 1,
    }])
  })

  it('antes de la migración del libro (la vista no existe) no es un error: es que todavía no está', async () => {
    const { cliente } = clienteFalso({ error: { code: 'PGRST205', message: "Could not find the table 'public.vw_retenciones_mes'" } })
    expect(await leerMeses(cliente)).toEqual({ ok: true, dato: 'todavia_no' })
    const otro = clienteFalso({ error: { code: '57014', message: 'canceling statement due to statement timeout' } })
    expect((await leerMeses(otro.cliente)).ok).toBe(false)
  })

  it('lee las retenciones de un mes, y un impuesto que la app no conoce queda como "otro"', async () => {
    const { cliente, llamadas } = clienteFalso({ filas: [fila, { ...fila, id_retencion: 2, impuesto: 'nuevo' }] })
    const r = await leerLibro('2026-10-01', cliente)
    expect(llamadas).toContain('  where mes = 2026-10-01')
    expect(r.ok && r.dato.map((x) => [x.impuesto, x.facturas, x.siniestros])).toEqual([['iva', [], ['S-1']], ['otro', [], ['S-1']]])
  })

  it('sin sesión no pregunta nada: lo dice', async () => {
    const { cliente, llamadas } = clienteFalso({ conSesion: false })
    expect(await leerMeses(cliente)).toEqual({ ok: false, fallo: { tipo: 'sin_sesion' } })
    expect(llamadas).toEqual([])
  })
})

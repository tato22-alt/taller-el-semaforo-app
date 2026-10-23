/* Revisar avisos: qué se le pide a la base. Con un cliente falso: que la base saque de Revisar lo
 * decidido, ordene las candidatas, no deje decidir al robot ni rehacer lo deshecho, lo prueba
 * qa-m7-imputacion.sql de semaforo-base contra el Postgres local. */

import { describe, expect, it } from 'vitest'
import type { ClienteBase } from './cliente-supabase'
import { descartar, deshacerDecision, leerCandidatas, leerDecisiones, leerPorRevisar, vincularConFactura } from './avisos'

function clienteFalso(o: { conSesion?: boolean; filas?: readonly unknown[] } = {}) {
  const llamadas: string[] = []
  const cadena = (datos: unknown): unknown =>
    Object.assign(Promise.resolve({ data: datos, error: null }), {
      eq: (c: string, v: unknown) => { llamadas.push(`  where ${c} = ${String(v)}`); return cadena(datos) },
      is: (c: string, v: unknown) => { llamadas.push(`  where ${c} is ${String(v)}`); return cadena(datos) },
      order: (c: string) => { llamadas.push(`  order ${c}`); return cadena(datos) },
      limit: (n: number) => { llamadas.push(`  limit ${n}`); return cadena(datos) },
    })
  const from = (tabla: string) => ({
    select: (cols: string) => { llamadas.push(`select ${tabla} ${cols}`); return cadena(o.filas ?? []) },
    insert: (fila: unknown) => { llamadas.push(`insert ${tabla} ${JSON.stringify(fila)}`); return cadena(null) },
    update: (fila: Record<string, unknown>) => { llamadas.push(`update ${tabla} ${Object.keys(fila).join(',')}`); return cadena(null) },
  })
  const sesion = (o.conSesion ?? true) ? { session: { user: { email: 'taller@ejemplo.com' } } } : { session: null }
  return { cliente: { auth: { getSession: () => Promise.resolve({ data: sesion, error: null }) }, from } as unknown as ClienteBase, llamadas }
}

const fila = {
  que: 'aviso_sin_lector', gmail_message_id: 'm1', linea_orden: null, recibido_en: '2026-10-01', remitente: 'pagos@ejemplo.com',
  compania: 'Compañía Uno', cuit_compania: '30000000001', numero: null, siniestro: null, detalle: 'Ningún lector.',
  bruto: '1500.00', asunto: 'Orden de pago', pdfs_drive: ['id1'],
}

describe('revisar avisos, en la base', () => {
  it('lee lo que espera a una persona, y deja afuera lo que la app no sabe nombrar', async () => {
    const { cliente } = clienteFalso({ filas: [fila, { ...fila, que: 'algo_nuevo', gmail_message_id: 'm2' }] })
    const r = await leerPorRevisar(cliente)
    expect(r.ok && r.dato).toEqual([expect.objectContaining({ gmailMessageId: 'm1', que: 'aviso_sin_lector', bruto: '1500.00', pdfsDrive: ['id1'] })])
  })

  it('pide las candidatas del aviso entero con linea_orden nula, y las de un renglón con su número', async () => {
    const entero = clienteFalso()
    await leerCandidatas({ gmailMessageId: 'm1', lineaOrden: null }, entero.cliente)
    expect(entero.llamadas).toContain('  where linea_orden is null')
    expect(entero.llamadas).toContain('  order orden')
    const renglon = clienteFalso()
    await leerCandidatas({ gmailMessageId: 'm1', lineaOrden: 2 }, renglon.cliente)
    expect(renglon.llamadas).toContain('  where linea_orden = 2')
  })

  it('vincular escribe una decisión con el importe como texto; descartar, sin factura', async () => {
    const { cliente, llamadas } = clienteFalso()
    await vincularConFactura({ gmailMessageId: 'm1', lineaOrden: null }, 7, '1500.00', cliente)
    await descartar({ gmailMessageId: 'm1', lineaOrden: 3 }, '  Es un pedido de documentación. ', cliente)
    expect(llamadas).toEqual([
      'insert imputacion {"gmail_message_id":"m1","linea_orden":null,"decision":"vincula","id_comprobante":7,"bruto":"1500.00"}',
      'insert imputacion {"gmail_message_id":"m1","linea_orden":3,"decision":"descarta","nota":"Es un pedido de documentación."}',
    ])
  })

  it('las decisiones vigentes traen el aviso y la factura, para decir qué se deshace', async () => {
    const { cliente, llamadas } = clienteFalso({ filas: [{
      id_imputacion: 9, decision: 'vincula', decidido_en: '2026-10-23T12:00:00Z', bruto: null, nota: null,
      aviso: { asunto: 'Orden de pago', remitente: 'pagos@ejemplo.com' }, comprobante: { punto_venta: 2, numero: 3281 },
    }] })
    const r = await leerDecisiones(cliente)
    expect(r.ok && r.dato[0]).toMatchObject({ idImputacion: 9, decision: 'vincula', factura: { puntoVenta: 2, numero: 3281 } })
    expect(llamadas).toContain('  where deshecho_en is null')
  })

  it('deshacer anota cuándo, sólo en una decisión vigente; no borra', async () => {
    const { cliente, llamadas } = clienteFalso()
    await deshacerDecision(9, cliente)
    expect(llamadas).toEqual(['update imputacion deshecho_en', '  where id_imputacion = 9', '  where deshecho_en is null'])
  })

  it('sin sesión no pide nada', async () => {
    const { cliente, llamadas } = clienteFalso({ conSesion: false })
    expect(await leerPorRevisar(cliente)).toEqual({ ok: false, fallo: { tipo: 'sin_sesion' } })
    expect(llamadas).toEqual([])
  })
})

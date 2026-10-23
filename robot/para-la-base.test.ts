/* Lo que el robot le manda a la base por cada aviso (fase 2). Plan 005 de semaforo-base.
 *
 * Los mails son INVENTADOS, con la forma de los reales (H3: el repo es público). Que la base guarde y
 * vincule bien lo prueba qa-m5-m6-evidencia.sql de semaforo-base, contra el Postgres local y la base. */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const DIR = join(import.meta.dirname, 'lectores')
const fuentes = readdirSync(DIR).filter((n) => n.endsWith('.js')).sort()
const L = runInNewContext(
  fuentes.map((n) => readFileSync(join(DIR, n), 'utf8')).join('\n') +
    '\n;({ avisoParaLaBase, avisoPendienteDeSubir, respuestaDeLaBase, conFormaDeLaBase })',
  {},
) as {
  avisoParaLaBase: (fila: readonly unknown[]) => Record<string, unknown> & { leido: Record<string, unknown> }
  avisoPendienteDeSubir: (fila: readonly unknown[]) => boolean
  respuestaDeLaBase: (r: { resultado: string; vinculadas: number }) => string
  conFormaDeLaBase: (leido: unknown) => Record<string, unknown>
}

/** Un renglón de la pestaña "avisos": message_id, fecha, remitente, asunto, cuerpo, pdfs, texto_pdf,
 *  lector, version, estado, motivo, control, pdfs_drive, base. */
function fila(m: { id?: string; remitente: string; asunto: string; cuerpo?: string; pdfs?: string; textoPdf?: string; drive?: string; base?: string }) {
  return [m.id ?? 'mail-1', '2026-10-14 09:30', m.remitente, m.asunto, m.cuerpo ?? '', m.pdfs ?? '', m.textoPdf ?? '',
    'lector-viejo', 1, 'leido', '', 'cierra', m.drive ?? '', m.base ?? '']
}

const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

describe('avisoParaLaBase', () => {
  it('manda el mail como está en la planilla y lo vuelve a leer con los lectores de hoy', () => {
    const a = copia(L.avisoParaLaBase(fila({
      remitente: 'La Segunda <enviosautomaticos@lasegunda.com.ar>', asunto: 'Envío de Retenciones Factura/s Nro. 1234 y 1235',
      pdfs: 'cert1.pdf\ncert2.pdf', drive: 'drive-a\ndrive-b',
    })))
    expect(a).toMatchObject({ id: 'mail-1', fecha: '2026-10-14 09:30', remitente: 'La Segunda <enviosautomaticos@lasegunda.com.ar>',
      pdfs: ['cert1.pdf', 'cert2.pdf'], pdfsDrive: ['drive-a', 'drive-b'] })
    // Lo leído no es lo que dice la planilla ("lector-viejo"): es la lectura de hoy.
    expect(a.leido).toMatchObject({ estado: 'leido', lector: 'la-segunda', tipo: 'retencion',
      lineas: [{ factura: { numero: 1234 } }, { factura: { numero: 1235 } }] })
  })

  it('un acuse de Mercantil va con la factura y el siniestro: con eso la base vincula la orden', () => {
    const a = copia(L.avisoParaLaBase(fila({
      remitente: 'no-responder@mail.lamercantil.flowable-managed.com', asunto: 'Tu Factura A0002-00001234 ha sido aprobada',
      cuerpo: 'Te informamos que tu factura A0002-00001234, de monto $ 100.000,00 , correspondiente al siniestro Nro. 500000000001, fue aprobada y la fecha estimada de pago es 2026-10-14.',
    })))
    expect(a.leido).toMatchObject({ estado: 'acuse', tipo: 'aprobacion', factura: { puntoVenta: 2, numero: 1234 },
      siniestro: '500000000001', monto: '100000.00', fechaPrometida: '2026-10-14' })
  })

  it('lo que no tiene lector va igual, con su motivo: la base lo pone en Revisar', () => {
    const a = copia(L.avisoParaLaBase(fila({ remitente: 'pagos@desconocida.example', asunto: 'Pago' })))
    expect(a.leido).toMatchObject({ estado: 'sin_lector' })
  })

  it('las celdas vacías no se mandan como listas con un elemento vacío', () => {
    const a = copia(L.avisoParaLaBase(fila({ remitente: 'pagos@desconocida.example', asunto: 'Pago' })))
    expect(a.pdfs).toEqual([])
    expect(a.pdfsDrive).toEqual([])
  })
})

describe('conFormaDeLaBase', () => {
  const pago = {
    estado: 'leido', lector: 'qa', version: 1, tipo: 'pago', op: '1', fechaPago: '2026-10-01', neto: '100.00',
    lineas: [{ factura: { texto: 'F 1', puntoVenta: 2, numero: 1 }, siniestro: null, bruto: '121.00', neto: '100.00' }],
    retenciones: [{ certificado: null, concepto: 'IIBB', impuesto: 'iibb', importe: '21.00' }],
    control: { resultado: 'cierra', detalle: '' },
  }

  it('lo que ya tiene la forma de la base pasa igual', () => {
    expect(copia(L.conFormaDeLaBase(pago))).toEqual(pago)
  })

  it('una fecha que no es aaaa-mm-dd no se manda rota: el aviso queda no_entendido, con el motivo', () => {
    const r = copia(L.conFormaDeLaBase({ ...pago, fechaPago: '01/10/2026' }))
    expect(r).toMatchObject({ estado: 'no_entendido', lector: 'qa' })
    expect(String(r.motivo)).toContain('01/10/2026')
  })

  it('una retención sin importe legible tampoco', () => {
    const r = copia(L.conFormaDeLaBase({ ...pago, retenciones: [{ certificado: null, concepto: 'Ganancias', impuesto: 'ganancias', importe: '' }] }))
    expect(r).toMatchObject({ estado: 'no_entendido' })
    expect(String(r.motivo)).toContain('Ganancias')
  })

  it('un acuse con una fecha prometida rara, también', () => {
    const r = copia(L.conFormaDeLaBase({ estado: 'acuse', lector: 'acuse-x', version: 1, tipo: 'fecha_prometida', factura: null,
      siniestro: null, monto: null, fechaPrometida: 'el lunes', referencia: null }))
    expect(r).toMatchObject({ estado: 'no_entendido', lector: 'acuse-x' })
  })

  it('vacíos como null, nunca como texto vacío', () => {
    const r = copia(L.conFormaDeLaBase({ ...pago, neto: '', fechaPago: '' }))
    expect(r).toMatchObject({ estado: 'leido', neto: null, fechaPago: null })
  })
})

describe('qué renglones se suben', () => {
  it('los que nunca entraron y los que la base rechazó; los guardados, no', () => {
    expect(L.avisoPendienteDeSubir(fila({ remitente: 'a@b', asunto: '' }))).toBe(true)
    expect(L.avisoPendienteDeSubir(fila({ remitente: 'a@b', asunto: '', base: 'error HTTP 500: …' }))).toBe(true)
    expect(L.avisoPendienteDeSubir(fila({ remitente: 'a@b', asunto: '', base: 'guardado' }))).toBe(false)
    expect(L.avisoPendienteDeSubir(fila({ remitente: 'a@b', asunto: '', base: 'releído · vinculó 1 orden' }))).toBe(false)
  })

  it('una fila vieja, sin la columna base, se sube', () => {
    expect(L.avisoPendienteDeSubir(fila({ remitente: 'a@b', asunto: '' }).slice(0, 13))).toBe(true)
  })

  it('lo que contestó la base, en palabras', () => {
    expect(L.respuestaDeLaBase({ resultado: 'guardado', vinculadas: 0 })).toBe('guardado')
    expect(L.respuestaDeLaBase({ resultado: 'releido', vinculadas: 2 })).toBe('releído · vinculó 2 órdenes')
  })
})

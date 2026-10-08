/* Los lectores de avisos y las reglas del robot. Plan 005, fase 0.
 *
 * lectores.js no tiene export (en Apps Script todos los archivos comparten el ámbito global), así
 * que se carga como lo carga Apps Script: el archivo entero, en un contexto aparte. Lo que se
 * prueba es el mismo texto que se pega en el editor.
 *
 * Todos los mails de acá son INVENTADOS, con la forma de los reales (H3: el repo es público).
 * Los importes, números de factura, egresos y certificados no son de nadie. */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const CARPETA = import.meta.dirname

type Mail = { remitente: string; asunto: string; cuerpo: string; textoPdf: string }
type Lectores = {
  direccionDe: (from: string) => string
  aImporte: (texto: string) => string | null
  leerAviso: (mail: Mail) => Record<string, unknown> & { estado: string }
  leerAsuntoEnvio: (asunto: string) => Record<string, unknown> | null
}

const L = runInNewContext(
  readFileSync(join(CARPETA, 'lectores.js'), 'utf8') + '\n;({ direccionDe, aImporte, leerAviso, leerAsuntoEnvio })',
  {},
) as Lectores

/* El resultado sale de otro contexto de vm: se pasa por JSON para compararlo con objetos de acá. */
const leer = (mail: Partial<Mail>) =>
  JSON.parse(JSON.stringify(L.leerAviso({ remitente: '', asunto: '', cuerpo: '', textoPdf: '', ...mail }))) as Record<string, unknown>

const FEDPAT = 'Caja de Egresos <no_responder@fedpat.com.ar>'
const ASUNTO_FEDPAT = 'Aviso De Depósito De Transferencias'

function cuerpoFedpat(importe: string, facturas: string, retenciones: string[]): string {
  return [
    `      Ponemos en su conocimiento que con fecha 03-02-2026 hemos cursado una transferencia a la CBU 0000**************0000 por un importe de $ ${importe} correspondiente al pago del egreso nro. 1000001 de la/s factura/s: ${facturas} y que ser� efectivizada dentro de las pr�ximas 48 hs.-`,
    '',
    ...(retenciones.length > 0 ? ['      Las retenciones impositivas realizadas son las siguientes:', 'NRO.COMPROBANTE CONCEPTO MONTO RETENIDO', ...retenciones] : []),
    '      El recibo correspondiente a la misma y los comprobantes de retenciones impositivas (si correspondieren) est�n a su disposici�n en nuestra pagina WEB.-',
    '                                                  Caja de Egresos',
  ].join('\n')
}

describe('piezas comunes', () => {
  it('saca la dirección del encabezado From', () => {
    expect(L.direccionDe('Caja <No_Responder@Fedpat.com.ar>')).toBe('no_responder@fedpat.com.ar')
    expect(L.direccionDe('pagos@ejemplo.com')).toBe('pagos@ejemplo.com')
  })

  it('entiende los importes como los escriba cada compañía, y devuelve texto', () => {
    expect(L.aImporte('1,234,567.89')).toBe('1234567.89')
    expect(L.aImporte('1234567.89')).toBe('1234567.89')
    expect(L.aImporte('1.234.567,89')).toBe('1234567.89')
    expect(L.aImporte('12,34')).toBe('12.34')
    expect(L.aImporte('12.34')).toBe('12.34')
    expect(L.aImporte('1.234')).toBe('1234')
    expect(L.aImporte('1,234,567')).toBe('1234567')
    expect(L.aImporte('12.5')).toBe('125') // un solo dígito después: no es decimal
    expect(L.aImporte('abc')).toBeNull()
    expect(L.aImporte('')).toBeNull()
  })
})

describe('Federación Patronal', () => {
  it('lee fecha, egreso, factura, lo transferido y las retenciones', () => {
    const r = leer({
      remitente: FEDPAT,
      asunto: ASUNTO_FEDPAT,
      cuerpo: cuerpoFedpat('1,000,000.50', 'Fac 2-1234', [
        '          100001 Ret. Ganancias 20,000.10',
        '          100002 Ret. IVA 150,000.20',
        '100002 Ing.Brutos BUENOS AIRES 40,000.30',
        '          100003 RG. 1784 10,000.40',
      ]),
    })
    expect(r).toEqual({
      estado: 'leido',
      lector: 'fed-patronal',
      version: 1,
      tipo: 'pago',
      op: '1000001',
      fechaPago: '2026-02-03',
      importeTransferido: '1000000.50',
      lineas: [{ factura: { texto: 'Fac 2-1234', puntoVenta: 2, numero: 1234 }, neto: '1000000.50' }],
      retenciones: [
        { certificado: '100001', concepto: 'Ret. Ganancias', impuesto: 'ganancias', importe: '20000.10' },
        { certificado: '100002', concepto: 'Ret. IVA', impuesto: 'iva', importe: '150000.20' },
        { certificado: '100002', concepto: 'Ing.Brutos BUENOS AIRES', impuesto: 'iibb', importe: '40000.30' },
        { certificado: '100003', concepto: 'RG. 1784', impuesto: 'suss', importe: '10000.40' },
      ],
    })
  })

  it('el mismo importe sin separador de miles da lo mismo', () => {
    const r = leer({ remitente: FEDPAT, asunto: ASUNTO_FEDPAT, cuerpo: cuerpoFedpat('1000000.50', 'Fac 2-1234', []) })
    expect(r['importeTransferido']).toBe('1000000.50')
  })

  it('un pago residual de centavos, sin retenciones, también es un pago', () => {
    const r = leer({ remitente: FEDPAT, asunto: ASUNTO_FEDPAT, cuerpo: cuerpoFedpat('0.99', 'Fac 2-1235', []) })
    expect(r['estado']).toBe('leido')
    expect(r['lineas']).toEqual([{ factura: { texto: 'Fac 2-1235', puntoVenta: 2, numero: 1235 }, neto: '0.99' }])
    expect(r['retenciones']).toEqual([])
  })

  it('con varias facturas en un egreso, no reparte el importe: las líneas quedan sin neto', () => {
    const r = leer({ remitente: FEDPAT, asunto: ASUNTO_FEDPAT, cuerpo: cuerpoFedpat('300.00', 'Fac 2-1236, Fac 2-1237 y Fac 2-1238', []) })
    expect(r['importeTransferido']).toBe('300.00')
    expect(r['lineas']).toEqual([
      { factura: { texto: 'Fac 2-1236', puntoVenta: 2, numero: 1236 }, neto: null },
      { factura: { texto: 'Fac 2-1237', puntoVenta: 2, numero: 1237 }, neto: null },
      { factura: { texto: 'Fac 2-1238', puntoVenta: 2, numero: 1238 }, neto: null },
    ])
  })

  it('si cambia la plantilla, no inventa: devuelve no_entendido con el motivo (RF-507)', () => {
    const r = leer({ remitente: FEDPAT, asunto: ASUNTO_FEDPAT, cuerpo: 'Le informamos que le pagamos. Saludos.' })
    expect(r['estado']).toBe('no_entendido')
    expect(r['lector']).toBe('fed-patronal')
    expect(String(r['motivo'])).not.toBe('')
  })

  it('si no nombra ninguna factura con su formato, tampoco', () => {
    const r = leer({ remitente: FEDPAT, asunto: ASUNTO_FEDPAT, cuerpo: cuerpoFedpat('300.00', 'la que corresponde', []) })
    expect(r['estado']).toBe('no_entendido')
  })
})

describe('La Segunda', () => {
  const LS = 'enviosautomaticos@lasegunda.com.ar'

  it('saca la factura del asunto; es un envío de retenciones, sin importes', () => {
    const r = leer({ remitente: LS, asunto: 'Envío de Retenciones Factura/s Nro. 1234' })
    expect(r).toEqual({
      estado: 'leido',
      lector: 'la-segunda',
      version: 1,
      tipo: 'retencion',
      op: null,
      fechaPago: null,
      importeTransferido: null,
      lineas: [{ factura: { texto: '1234', puntoVenta: null, numero: 1234 }, neto: null }],
      retenciones: [],
    })
  })

  it('varias facturas en el asunto, varias líneas', () => {
    const r = leer({ remitente: LS, asunto: 'Envío de Retenciones Factura/s Nro. 1234, 1235' })
    expect((r['lineas'] as unknown[]).length).toBe(2)
  })

  it('un mail de La Segunda que no es de retenciones no lo agarra este lector', () => {
    const r = leer({ remitente: 'alguien@lasegunda.com.ar', asunto: 'Siniestro 1-234 franquicia' })
    expect(r['estado']).toBe('sin_lector')
  })
})

describe('el reparto entre lectores', () => {
  it('un remitente sin lector queda guardado como sin_lector, con el motivo', () => {
    const r = leer({ remitente: 'Pagos <pagos@otra-compania.example>', asunto: 'AVISO DE PAGO' })
    expect(r).toEqual({ estado: 'sin_lector', lector: null, version: null, motivo: 'Todavía no hay lector para pagos@otra-compania.example.' })
  })

  it('un dominio que sólo termina parecido no se confunde', () => {
    const r = leer({ remitente: 'x@nofedpat.com.ar', asunto: ASUNTO_FEDPAT, cuerpo: cuerpoFedpat('1.00', 'Fac 2-1', []) })
    expect(r['estado']).toBe('sin_lector')
  })
})

describe('asunto de las facturas enviadas', () => {
  const asunto = (a: string) => JSON.parse(JSON.stringify(L.leerAsuntoEnvio(a))) as unknown

  it('el asunto estándar', () => {
    expect(asunto('factura n°1234 siniestro n°9999999999')).toEqual({ tipo: 'envio', factura: 1234, siniestro: '9999999999', ordenCompra: null })
  })

  it('siniestros con barras, guiones y letras quedan como están escritos', () => {
    expect(asunto('factura n°1234 siniestro n°12345/678')).toMatchObject({ siniestro: '12345/678' })
    expect(asunto('factura n°1234 siniestro n°c1234-5678')).toMatchObject({ siniestro: 'c1234-5678' })
    expect(asunto('factura n°1234 siniestro n° 99887766')).toMatchObject({ siniestro: '99887766' })
  })

  it('con orden de compra en vez de siniestro', () => {
    expect(asunto('factura n°123 orden de compra n°45678')).toEqual({ tipo: 'envio', factura: 123, siniestro: null, ordenCompra: '45678' })
  })

  it('una respuesta o un reenvío no es un envío nuevo', () => {
    expect(asunto('Re: factura n°1234 siniestro n°1')).toMatchObject({ tipo: 'respuesta' })
    expect(asunto('Fwd: factura n°1234 siniestro n°1')).toMatchObject({ tipo: 'respuesta' })
    expect(asunto('RE:[123] factura n°1234 siniestro n°1')).toMatchObject({ tipo: 'respuesta' })
    expect(asunto('[123] Re: factura n°1234 siniestro n°1')).toMatchObject({ tipo: 'respuesta' })
  })

  it('un asunto sin número de factura no es un envío', () => {
    expect(L.leerAsuntoEnvio('Estado de cuenta 2025')).toBeNull()
  })
})

describe('el robot no puede mandar ni tocar mails (R1, RF-501)', () => {
  const codigo = readdirSync(CARPETA)
    .filter((n) => n.endsWith('.js'))
    .map((n) => ({ nombre: n, texto: readFileSync(join(CARPETA, n), 'utf8') }))

  it('pide sólo los permisos de la lista, y ninguno de Gmail que escriba', () => {
    const manifiesto = JSON.parse(readFileSync(join(CARPETA, 'appsscript.json'), 'utf8')) as { oauthScopes: string[] }
    expect([...manifiesto.oauthScopes].sort()).toEqual([
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/script.external_request',
      'https://www.googleapis.com/auth/spreadsheets.currentonly',
    ])
  })

  it('ningún archivo llama a algo que mande, borre o modifique un mail', () => {
    // GmailApp y MailApp quedan afuera enteros: piden el permiso total de Gmail.
    const prohibido = /\b(GmailApp|MailApp)\b|sendEmail|createDraft|\.(send|trash|untrash|modify|batchModify|batchDelete|import|insert)\s*\(|Gmail\.Users\.(Drafts|Labels|Settings)|Messages\.(remove|delete)/
    for (const { nombre, texto } of codigo) {
      const sinComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(sinComentarios, nombre).not.toMatch(prohibido)
    }
  })

  it('no hay credenciales en el código del robot (R2)', () => {
    for (const { nombre, texto } of codigo) {
      expect(texto, nombre).not.toMatch(/service_role|password|contraseña\s*[:=]|apikey|anon_key/i)
    }
  })
})

/* Los lectores de avisos y las reglas del robot. Plan 005, fase 0.
 *
 * Los lectores no tienen export (en Apps Script todos los archivos comparten el ámbito global), así
 * que se cargan como los carga Apps Script: los archivos enteros, juntos, en un contexto aparte.
 *
 * Todos los mails y PDF de acá son INVENTADOS, con la forma de los reales (H3: el repo es
 * público). Importes, números de factura, órdenes, siniestros y certificados no son de nadie; los
 * importes están elegidos para que bruto = neto + retenciones, como en los reales. */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { armar } from './armar.mjs'

const CARPETA = import.meta.dirname
const DIR_LECTORES = join(CARPETA, 'lectores')

type Mail = { remitente: string; asunto: string; cuerpo: string; textoPdf: string }
type Lectores = {
  direccionDe: (from: string) => string
  aImporte: (texto: string) => string | null
  aImporteConPunto: (texto: string) => string | null
  leerAviso: (mail: Mail) => unknown
  leerAsuntoEnvio: (asunto: string) => unknown
}

const fuentes = readdirSync(DIR_LECTORES).filter((n) => n.endsWith('.js')).sort()
const L = runInNewContext(
  fuentes.map((n) => readFileSync(join(DIR_LECTORES, n), 'utf8')).join('\n') +
    '\n;({ direccionDe, aImporte, aImporteConPunto, leerAviso, leerAsuntoEnvio })',
  {},
) as Lectores

type Linea = { factura: { texto: string; puntoVenta: number | null; numero: number } | null; siniestro: string | null; bruto: string | null; neto: string | null }
type Retencion = { certificado: string | null; concepto: string; impuesto: string; importe: string }
type Leido = {
  estado: string; lector: string | null; version: number | null; motivo?: string; tipo?: string
  op?: string | null; fechaPago?: string | null; neto?: string | null
  lineas: Linea[]; retenciones: Retencion[]; control: { resultado: string; detalle: string }
}

/* El resultado sale de otro contexto de vm: se pasa por JSON para compararlo con objetos de acá. */
const leer = (mail: Partial<Mail>) =>
  JSON.parse(JSON.stringify(L.leerAviso({ remitente: '', asunto: '', cuerpo: '', textoPdf: '', ...mail }))) as Leido

const impuestos = (r: Leido) => r.retenciones.map((x) => [x.impuesto, x.importe, x.certificado])

describe('piezas comunes', () => {
  it('saca la dirección del encabezado From', () => {
    expect(L.direccionDe('Caja <No_Responder@Fedpat.com.ar>')).toBe('no_responder@fedpat.com.ar')
    expect(L.direccionDe('pagos@ejemplo.com')).toBe('pagos@ejemplo.com')
  })

  it('entiende los importes como los escriba cada compañía, y devuelve texto', () => {
    expect(L.aImporte('1,234,567.89')).toBe('1234567.89')
    expect(L.aImporte('1234567.89')).toBe('1234567.89')
    expect(L.aImporte('1.234.567,89')).toBe('1234567.89')
    expect(L.aImporte('123 456,78')).toBe('123456.78')
    expect(L.aImporte('1 234 567,89')).toBe('1234567.89')
    expect(L.aImporte('$123.456,78')).toBe('123456.78')
    expect(L.aImporte('12,34')).toBe('12.34')
    expect(L.aImporte('1.234')).toBe('1234')
    expect(L.aImporte('12.5')).toBe('125') // un solo dígito después: no es decimal
    expect(L.aImporte('abc')).toBeNull()
    expect(L.aImporte('')).toBeNull()
  })

  it('los que siempre escriben punto decimal, aunque sea con un solo decimal', () => {
    expect(L.aImporteConPunto('123456.0')).toBe('123456.00')
    expect(L.aImporteConPunto('1234.45')).toBe('1234.45')
    expect(L.aImporteConPunto('100')).toBe('100.00')
    expect(L.aImporteConPunto('1.234,5')).toBeNull()
  })
})

/* ------------------------------------------------------------------------------------------- */

describe('Federación Patronal (cuerpo del mail)', () => {
  const FEDPAT = 'Caja de Egresos <no_responder@fedpat.com.ar>'
  const ASUNTO = 'Aviso De Depósito De Transferencias'
  const cuerpo = (importe: string, facturas: string, retenciones: string[]) =>
    [
      `      Ponemos en su conocimiento que con fecha 03-02-2026 hemos cursado una transferencia a la CBU 0000**************0000 por un importe de $ ${importe} correspondiente al pago del egreso nro. 1000001 de la/s factura/s: ${facturas} y que ser� efectivizada dentro de las pr�ximas 48 hs.-`,
      '',
      ...(retenciones.length > 0 ? ['      Las retenciones impositivas realizadas son las siguientes:', 'NRO.COMPROBANTE CONCEPTO MONTO RETENIDO', ...retenciones] : []),
      '      El recibo correspondiente a la misma está a su disposición en nuestra pagina WEB.-',
    ].join('\n')

  it('lee fecha, egreso, factura, lo transferido y las retenciones; sin bruto no hay control', () => {
    const r = leer({
      remitente: FEDPAT,
      asunto: ASUNTO,
      cuerpo: cuerpo('1,000,000.50', 'Fac 2-1234', [
        '          100001 Ret. Ganancias 20,000.10',
        '          100002 Ret. IVA 150,000.20',
        '100002 Ing.Brutos BUENOS AIRES 40,000.30',
        '          100003 RG. 1784 10,000.40',
      ]),
    })
    expect(r).toMatchObject({ estado: 'leido', lector: 'fed-patronal', tipo: 'pago', op: '1000001', fechaPago: '2026-02-03', neto: '1000000.50' })
    expect(r.lineas).toEqual([{ factura: { texto: 'Fac 2-1234', puntoVenta: 2, numero: 1234 }, siniestro: null, bruto: null, neto: '1000000.50' }])
    expect(impuestos(r)).toEqual([
      ['ganancias', '20000.10', '100001'],
      ['iva', '150000.20', '100002'],
      ['iibb', '40000.30', '100002'],
      ['suss', '10000.40', '100003'],
    ])
    expect(r.control.resultado).toBe('sin_bruto')
  })

  it('con varias facturas en un egreso, no reparte el importe', () => {
    const r = leer({ remitente: FEDPAT, asunto: ASUNTO, cuerpo: cuerpo('300.00', 'Fac 2-1236, Fac 2-1237 y Fac 2-1238', []) })
    expect(r.lineas.map((l) => [l.factura?.numero, l.neto])).toEqual([[1236, null], [1237, null], [1238, null]])
  })

  it('si cambia la plantilla, no inventa: no_entendido con el motivo (RF-507)', () => {
    const r = leer({ remitente: FEDPAT, asunto: ASUNTO, cuerpo: 'Le informamos que le pagamos. Saludos.' })
    expect(r).toMatchObject({ estado: 'no_entendido', lector: 'fed-patronal' })
    expect(r.motivo).not.toBe('')
  })
})

describe('La Segunda (asunto)', () => {
  const LS = 'enviosautomaticos@lasegunda.com.ar'

  it('saca la factura del asunto; los importes están en un PDF que todavía no se lee', () => {
    const r = leer({ remitente: LS, asunto: 'Envío de Retenciones Factura/s Nro. 1234, 1235' })
    expect(r).toMatchObject({ estado: 'leido', lector: 'la-segunda', tipo: 'retencion', neto: null })
    expect(r.lineas.map((l) => l.factura?.numero)).toEqual([1234, 1235])
  })

  it('un mail de La Segunda que no es de retenciones no lo agarra este lector', () => {
    expect(leer({ remitente: 'alguien@lasegunda.com.ar', asunto: 'Siniestro 1-234 franquicia' }).estado).toBe('sin_lector')
  })
})

/* ------------------------------------------------------------------------------------------- */

describe('LPS (PDF de la orden de pago)', () => {
  const LPS = 'no-responder@lps.com.ar'
  const ASUNTO = 'Orden de Pago Número: 00100001'
  const pdf = (filas: string[], subtotal: string) =>
    [
      'ORDEN DE PAGO', '', 'Nro. 0010000103/02/2026 T.E. : I.V.A.: E-Mail:', '', 'Señor/es:', '', 'TALLER DE PRUEBA S.R.L.', '',
      'COMPROBANTES CANCELADOS', '', 'Fecha Tipo y Nro.Comprobante Imp.Cancelado Cotiz. Moneda Deducciones', '',
      ...filas,
      `${subtotal} VALORES`, '', '1191 BANCO DE PRUEBA TRANS. CBU $ 80.000,00', '',
      `DETALLE RETENCIONES Tipo DGI % Exención Vto. Exen. Monto Ret. Base Ret. SUBTOTAL ${subtotal} RET.GANANCIAS`, '',
      '2.000,00 RET.I.V.A.', '', '16.800,00 RET.I.BRUTOS', '', '1.000,00 RET.S.U.S.S.', '', '200,00 RET. OSSEG', '',
      '0,00 RET.TASA LOCAL 0,00 TOTAL 80.000,00', '', '\\-------------------------------- ----------', '', '0,00 RET. MEDICOS', '',
      'CONSTANCIA DE RETENCIÓN DE IMPUESTOS A LAS GANANCIAS', 'Fecha : 03/02/2026 C.U.I.T.:', 'Afectado a la OP: 100001',
      'RET.IVA LOC.SERV. 21%', 'FS A/00002/00001234',
    ].join('\n')

  it('una factura: su bruto, lo transferido, las retenciones, y cierra', () => {
    const r = leer({ remitente: LPS, asunto: ASUNTO, textoPdf: pdf(['01/01/2026 FS - A / 00002 /', '', '1234 100.000,00 1,0000 $ TOTAL CPTES.:', ''], '100.000,00') })
    expect(r).toMatchObject({ estado: 'leido', lector: 'lps', op: '100001', fechaPago: '2026-02-03', neto: '80000.00' })
    expect(r.lineas).toEqual([{ factura: { texto: 'FS A 00002-1234', puntoVenta: 2, numero: 1234 }, siniestro: null, bruto: '100000.00', neto: '80000.00' }])
    expect(impuestos(r)).toEqual([['ganancias', '2000.00', null], ['iva', '16800.00', null], ['iibb', '1000.00', null], ['suss', '200.00', null]])
    expect(r.control.resultado).toBe('cierra')
  })

  it('varias facturas: cada una con su bruto, y el neto no se reparte', () => {
    const r = leer({
      remitente: LPS,
      asunto: ASUNTO,
      textoPdf: pdf(['01/01/2026 FS - A / 00002 /', '', '1234 60.000,00 1,0000 $', '02/01/2026 FS - A / 00002 /', '', '1235 40.000,00 1,0000 $ TOTAL CPTES.:', ''], '100.000,00'),
    })
    expect(r.lineas.map((l) => [l.factura?.numero, l.bruto, l.neto])).toEqual([[1234, '60000.00', null], [1235, '40000.00', null]])
    expect(r.control.resultado).toBe('cierra')
  })

  it('si el bruto no es neto + retenciones, no lo da por bueno: no_cierra, con el detalle', () => {
    const r = leer({ remitente: LPS, asunto: ASUNTO, textoPdf: pdf(['01/01/2026 FS - A / 00002 /', '', '1234 100.000,00 1,0000 $', ''], '100.500,00') })
    expect(r.estado).toBe('no_cierra')
    expect(r.control.detalle).toContain('faltan 500.00')
  })

  it('un comprobante que no es factura: no adivina el signo', () => {
    const r = leer({ remitente: LPS, asunto: ASUNTO, textoPdf: pdf(['01/01/2026 NC - A / 00002 /', '', '0012 100.000,00 1,0000 $', ''], '100.000,00') })
    expect(r.estado).toBe('no_entendido')
  })

  it('sin PDF, lo dice', () => {
    expect(leer({ remitente: LPS, asunto: ASUNTO, textoPdf: '' }).estado).toBe('no_entendido')
  })

  it('un número de orden todo en ceros en el asunto no vale: se toma el del PDF', () => {
    const r = leer({ remitente: LPS, asunto: 'Orden de Pago Número: 00000000', textoPdf: pdf(['01/01/2026 FS - A / 00002 /', '', '1234 100.000,00 1,0000 $', ''], '100.000,00') })
    expect(r.op).toBe('100001')
  })
})

describe('Río Uruguay (PDF de la orden de pago)', () => {
  const RUS = 'retenciones.rus@riouruguay.com.ar'
  const ASUNTO = 'Detalle de pago y retenciones RUS'
  // El texto sale desordenado, como el real: el total del primer certificado aparece antes que su título.
  const pdf = (aPagar: string) =>
    [
      '1000.00 Total retenido', '', 'MIL CON 00/100 Son Pesos Argentinos', '',
      'ORDEN Agente de Retención CUIT 30000000000 Ingresos Brutos N° Fecha', '', 'DE 03/02/2026 PAGO 2000001 Nro de Certificado:', '', '0000000011 1 /', '',
      "3 CONSTANCIA DE RETENCIÓN: 'RETENCIÓN INGRESOS BRUTOS BUENOS AIRES PROVEEDORES (SERVICIOS)' Sujeto Pasible de Retención TALLER DE PRUEBA SRL", '',
      'Detalle de Retenciones N° Documento Tipo Documento Fecha Importe Importe Doc', '', '2000001 FACTURA A 03/02/2026 100000.0 Estado', '',
      'Orden Pago Nro. S', '', 'RIO URUGUAY COOP. DE SEGUROS LTDA.', '', 'Productor', '', '4:99999999 1111111', '',
      'BOLSA NRO. 1 Siniestro', '', 'Póliza', '', 'Fecha Siniestro Socio Apellido y Nombre / Razón Social', '', '4:1234567 01/01/2026', '', 'PEREZ JUAN', '',
      `Beneficiario TALLER DE PRUEBA SRL Total a Pagar: ${aPagar} En concepto de:`, '', 'Factura: 1234 Dirección (CP): CALLE FALSA 123', '',
      'Fecha Emisión Fecha Pago', '', 'Localidad de Pago', '', 'Forma de Envío', '', '01/01/2026', '', '03/02/2026', '',
      'ORDEN Agente de Retención', '', 'DE PAGO 2000001 Fecha 03/02/2026 CUIT 30000000000 Ingresos Brutos N° Nro de Certificado:', '', '0000000022 2 /', '',
      "3 CONSTANCIA DE RETENCIÓN: 'RETENCIÓN IVA LOCACIÓN OBRA Y SERVICIOS RG 2854' Sujeto Pasible de Retención TALLER DE PRUEBA SRL", '',
      'IVA Retención IVA Locación Obra 0000000022 y Servicios RG', '', '2854', '', 'Total retenido 16800.00 Son Pesos Argentinos', '',
      'Agente de Retención CUIT 30000000000 Ingresos Brutos N° ORDEN DE PAGO 2000001', '', 'Fecha 03/02/2026 Nro de Certificado:', '', '0000000033 3 /', '',
      "3 CONSTANCIA DE RETENCIÓN: 'RETENCIÓN GANANCIAS LOCACIÓN OBRA Y SERVICIOS RG 830 (94)' Sujeto Pasible de Retención TALLER DE PRUEBA SRL", '',
      'Total retenido 2200.0 Son Pesos Argentinos',
    ].join('\n')

  it('lee la orden y los tres certificados, y cierra', () => {
    const r = leer({ remitente: RUS, asunto: ASUNTO, textoPdf: pdf('$80.000,00') })
    expect(r).toMatchObject({ estado: 'leido', lector: 'rio-uruguay', op: '2000001', fechaPago: '2026-02-03', neto: '80000.00' })
    expect(r.lineas).toEqual([{ factura: { texto: 'A 1234', puntoVenta: null, numero: 1234 }, siniestro: '4:1234567', bruto: '100000.00', neto: '80000.00' }])
    expect(impuestos(r)).toEqual([['iibb', '1000.00', '0000000011'], ['iva', '16800.00', '0000000022'], ['ganancias', '2200.00', '0000000033']])
    expect(r.control.resultado).toBe('cierra')
  })

  it('si se leyó mal un total, el control lo detecta', () => {
    expect(leer({ remitente: RUS, asunto: ASUNTO, textoPdf: pdf('$79.000,00') }).estado).toBe('no_cierra')
  })

  it('dos órdenes en un PDF: todavía no, y lo dice', () => {
    const r = leer({ remitente: RUS, asunto: ASUNTO, textoPdf: pdf('$80.000,00') + '\nTotal a Pagar: $1.000,00' })
    expect(r.estado).toBe('no_entendido')
    expect(r.motivo).toContain('2 órdenes')
  })
})

describe('Nación (PDF de la orden de pago)', () => {
  const NACION = 'Nacion-Seguros@nacion-seguros.com.ar'
  const ASUNTO = 'Nacion Seguros - Aviso de pago-Cuit: 00000000000 -OP: 1000001'
  const fila = (n: string, bruto: string, gcias: string, iibb: string, iva: string, neto: string) =>
    `Factura A 0002-0000${n} 01000000/1 01/02/2026 ${bruto} Retención Impto a las Gcias-LOCAC-NAC Cert: 0000-2026-00${n}1 - ${gcias} Retención Ingresos Brutos-REPAR-BSAS Cert: 0000-0000${n}2 - ${iibb} Retención IVA-GRAL-NAC Cert: 0000-2026-00${n}3 - ${iva} ${neto}`
  const pdf = (filas: string[], neto: string) =>
    [
      'Nación Seguros S.A Calle 1 Capital Federal 30000000000', '', 'Hoja : 1 Orden de Pago Nro. :', '', '1000001', '',
      'Datos del Pago acred inte disponible 03/02/2026', '',
      `Banco : Banco de Prueba Medio de Pago : Giro - EFT Nro. : 0000000001 Importe Moneda Pago : ${neto} Peso Argentino Importe Moneda Base : ${neto} Peso Argentino`, '',
      `Tipo Nro. Nro. Comp. Fecha Vto. Importe Descuentos Importe Comprobante Comprobante Pago Bruto Neto ${filas.join(' ')}`, '',
      `Total ARS ${neto} 1.00 ${neto}`, '',
      'CERTIFICADO DE RETENCION Retención del Impuesto a las Ganancias', 'Factura A 0002-00001234 01/01/2026 Locaciones de Obras y Servicios - R.G. 830',
    ].join('\n')

  it('una factura: bruto, las tres retenciones con su certificado, neto, y cierra', () => {
    const r = leer({ remitente: NACION, asunto: ASUNTO, textoPdf: pdf([fila('1234', '10,000.00', '200.00', '200.00', '1,600.00', '8,000.00')], '8,000.00') })
    expect(r).toMatchObject({ estado: 'leido', lector: 'nacion', op: '1000001', fechaPago: '2026-02-03', neto: '8000.00' })
    expect(r.lineas).toEqual([{ factura: { texto: 'Factura A 0002-00001234', puntoVenta: 2, numero: 1234 }, siniestro: null, bruto: '10000.00', neto: '8000.00' }])
    expect(impuestos(r)).toEqual([['ganancias', '200.00', '0000-2026-0012341'], ['iibb', '200.00', '0000-000012342'], ['iva', '1600.00', '0000-2026-0012343']])
    expect(r.control.resultado).toBe('cierra')
  })

  it('dos facturas en la orden: cada una con su bruto y su neto', () => {
    const r = leer({
      remitente: NACION,
      asunto: ASUNTO,
      textoPdf: pdf([fila('1234', '10,000.00', '200.00', '200.00', '1,600.00', '8,000.00'), fila('1235', '5,000.00', '100.00', '100.00', '800.00', '4,000.00')], '12,000.00'),
    })
    expect(r.lineas.map((l) => [l.factura?.numero, l.bruto, l.neto])).toEqual([[1234, '10000.00', '8000.00'], [1235, '5000.00', '4000.00']])
    expect(r.retenciones).toHaveLength(6)
    expect(r.control.resultado).toBe('cierra')
  })

  it('el acuse "Ingreso de Factura" no pasa por el lector de pagos (R3)', () => {
    const r = leer({ remitente: NACION, asunto: 'Nación Seguros - Ingreso de Factura N° 0002-00001234', cuerpo: 'su factura N? 0002-00001234 ha sido ingresada bajo el Nro de Tr?mite 00000001.' })
    expect(r).toMatchObject({ estado: 'acuse', tipo: 'acuse', factura: { puntoVenta: 2, numero: 1234 }, referencia: 'trámite 00000001' })
  })
})

describe('San Cristóbal (PDF del recibo, impreso dos veces)', () => {
  const SC = 'pagossc@sancristobal.com.ar'
  const ASUNTO = 'AVISO DE PAGO 03/02/2026 -REF: 5000000001'
  const recibo = (extra: string) =>
    `BANCO DE PRUEBA 01032-00000/6/00000001/5000000001 O.Pago: 1020260203 Moneda: Pesos Beneficiario: TALLER DE PRUEBA S.R.L. ${extra}
Certificado Stro. Cheque Cargo Bco. y Nro. Importe Neto 05-01-12345678 5012345678 BANCO DE PRUEBA (00000001) 80 000,00`
  const pdf = (extra = '') =>
    [
      recibo(extra), '', 'El que suscribe declara recibir de SAN CRISTOBAL SMSG el importe neto.', '', recibo(extra), '',
      'RUBRO I: Agente de Retención-Percepción Número Constancia San Cristobal SM Seg.Gral 0000000001 - 6 - 11111', '',
      'Monto Imponible Alícuota Impte Ret./Perc. Acreditación de 80 000,00 4,00 1 000,00 Pago: 03/02/2026', '',
      'Total Retenido-Percibido 1 000,00', '', 'Total Retenido-Percibido 1 000,00', '',
      'A.F.I.P. SI.CO.RE. - Sistema de Control de Retenciones Certificado Nro.: 0000 - 2026 - 00001 Fecha: 03/02/2026', '',
      'Datos de la Retención Practicada Concepto: Ganancias Regimen: 094 Cmpte. que origina Retención: Recibo Nro. Monto Cmpte. que origina Retención: \\*\\*80 000,00 Monto de la Retención: \\*\\*2 000,00', '',
      'A.F.I.P. SI.CO.RE. - Sistema de Control de Retenciones Certificado Nro.: 0000 - 2026 - 00001 Fecha: 03/02/2026', '',
      'Datos de la Retención Practicada Concepto: Ganancias Regimen: 094 Cmpte. que origina Retención: Recibo Nro. Monto de la Retención: \\*\\*2 000,00', '',
      'A.F.I.P. SI.CO.RE. - Sistema de Control de Retenciones', '', 'Certificado Nro.: 0000 - 2026 - 00002', '', 'Certificado Nro.: 0000 - 2026 - 00002 Fecha: 03/02/2026', '',
      'Fecha: 03/02/2026', '', 'Datos de la Retención Practicada Concepto: IVA', '', 'Concepto: IVA Regimen: 212', '', 'Regimen: 212 Cmpte. que origina Retención: Recibo Nro.', '',
      'Monto Cmpte. que origina Retención: \\*\\*20 000,00 Monto de la Retención: \\*\\*16 000,00', '', 'Monto de la Retención: \\*\\*16 000,00', '',
      'A.F.I.P. Comprobante de Retención Certificado Nro.: 0000 - 2026 - 00003 Fecha: 03/02/2026', '',
      'Datos de la Retención Practicada Concepto: Cont. Patron. RI Empl. Regimen: 755 Cmpte. que origina Retención: Recibo Nro. Monto de la Retención: \\*\\*1 000,00',
    ].join('\n')

  it('lee siniestro, neto y las cuatro retenciones, sin contar dos veces lo impreso dos veces', () => {
    const r = leer({ remitente: SC, asunto: ASUNTO, textoPdf: pdf() })
    expect(r).toMatchObject({ estado: 'leido', lector: 'san-cristobal', op: '1020260203', fechaPago: '2026-02-03', neto: '80000.00' })
    expect(r.lineas).toEqual([{ factura: null, siniestro: '5012345678', bruto: null, neto: '80000.00' }])
    expect(impuestos(r)).toEqual([
      ['ganancias', '2000.00', '0000-2026-00001'],
      ['iva', '16000.00', '0000-2026-00002'],
      ['suss', '1000.00', '0000-2026-00003'],
      ['iibb', '1000.00', '0000000001-6-11111'],
    ])
    // El recibo no dice el bruto, pero las bases de Ganancias e IVA de los certificados sí lo dan, y
    // alcanzan para controlar. Atribuir la línea a una factura sigue siendo de una persona.
    expect(r.control).toEqual({ resultado: 'cierra', detalle: '' })
  })

  it('el otro formato, "Recibo de Pago" a proveedor: factura y bruto, y cierra', () => {
    const recibo = [
      'BANCO DE PRUEBA/00000001/5000000002', 'Recibo de Pago Nº O.P: 1020260203 I.Brutos: 000-000000-0', 'Lugar y Fecha: CASA CENTRAL, 3 de FEBRERO de 2026',
      'Detalle de Facturas', 'Detalle de Facturas Tipo/Conc. Nro.Cmpte Importe', 'Tipo/Conc. Nro.Cmpte Importe Total 80 000,00', 'Total 80 000,00',
      'Retenciones Varias: IVA: 16 000,00 DGI: 2 000,00 DGR: 0,00 MUN: 0,00 SSS: 0,00 OTR: 2 000,00', 'Importe Bruto 100 000,00',
      'Detalle de Facturas Tipo/Conc. Nro.Cmpte Importe Factura 00002A00001234 100 000,00',
      'Detalle de Facturas Tipo/Conc. Nro.Cmpte Importe Factura 00002A00001234 100 000,00',
      'A.F.I.P. SI.CO.RE. - Sistema de Control de Retenciones Certificado Nro.: 0000 - 2026 - 00001 Fecha: 03/02/2026',
      'Datos de la Retención Practicada Concepto: Ganancias Regimen: 094 Monto de la Retención: \\*\\*2 000,00',
      'A.F.I.P. SI.CO.RE. - Sistema de Control de Retenciones Certificado Nro.: 0000 - 2026 - 00002 Fecha: 03/02/2026',
      'Datos de la Retención Practicada Concepto: IVA Regimen: 212 Monto de la Retención: \\*\\*16 000,00',
      'A.F.I.P. Comprobante de Retención Certificado Nro.: 0000 - 2026 - 00003 Fecha: 03/02/2026',
      'Datos de la Retención Practicada Concepto: Cont. Patron. RI Empl. Regimen: 755 Monto de la Retención: \\*\\*2 000,00',
    ].join('\n\n')
    const r = leer({ remitente: SC, asunto: ASUNTO, textoPdf: recibo })
    expect(r).toMatchObject({ estado: 'leido', op: '1020260203', fechaPago: '2026-02-03', neto: '80000.00' })
    expect(r.lineas).toEqual([{ factura: { texto: 'Factura 00002A00001234', puntoVenta: 2, numero: 1234 }, siniestro: null, bruto: '100000.00', neto: '80000.00' }])
    expect(impuestos(r)).toEqual([['ganancias', '2000.00', '0000-2026-00001'], ['iva', '16000.00', '0000-2026-00002'], ['suss', '2000.00', '0000-2026-00003']])
    expect(r.control.resultado).toBe('cierra')
  })

  it('dos recibos en el mismo PDF: una línea por recibo, y el control con el total', () => {
    const otro = 'Certificado Stro. Cheque Cargo Bco. y Nro. Importe Neto 05-01-12345679 5012345679 BANCO DE PRUEBA (00000001) 10 000,00'
    const doble = pdf().replace('El que suscribe', `${otro}\n\nEl que suscribe`)
    const r = leer({ remitente: SC, asunto: ASUNTO, textoPdf: doble })
    expect(r.lineas.map((l) => [l.siniestro, l.neto])).toEqual([['5012345678', '80000.00'], ['5012345679', '10000.00']])
    expect(r.neto).toBeNull()
    // Las bases dicen 100.000 y lo transferido más lo retenido da 110.000: no cierra, y se ve.
    expect(r.estado).toBe('no_cierra')
  })

  it('cuando el recibo trae la factura, la línea la nombra', () => {
    const r = leer({ remitente: SC, asunto: ASUNTO, textoPdf: pdf('Factura 00002A00001234') })
    expect(r.lineas[0]?.factura).toEqual({ texto: 'Factura 00002A00001234', puntoVenta: 2, numero: 1234 })
  })
})

describe('Sancor (PDF "Orden de Pago General")', () => {
  const SANCOR = 'InfoProveedores@sancorseguros.com'
  const ASUNTO = 'Comprobante de pago'
  const orden = (total: string) =>
    [
      'Número: 4100000001', '',
      'EN CONCEPTO DE PAGO POR: Importe Importe en Pesos Factura A N°: 0002-00001234 de 01.02.2026 Us: XXXX N°Stro:2000000001 60.000,00 Factura A N°: 0002-00001235 de 02.02.2026 Us: XXXX N°Stro:2000000002 40.000,00 Ret. IIBB Buenos Aires (Pcia.) 3.000,00- Ganancias 2 2.000,00- IVA 1 14.000,00- Seguridad Social Regimen General 1.000,00-', '',
      `IMPORTE TOTAL: ${total} Son pesos OCHENTA MIL`, '', 'COMPROBANTE DE PAGO', '', 'Lugar: Ciudad Fecha: 03.02.2026',
    ].join('\n')
  const constancia =
    'CONSTANCIA Sancor INFORMATIVA DE RETENCION DE IVA Fecha: 03/02/2026 N° documento 0002A00001234 2500000000 01.02.2026 Factura TOTAL 12.000,00 9.600,00 ARS'

  it('lee las dos facturas con su siniestro y su bruto, las retenciones y el total, y cierra', () => {
    const r = leer({ remitente: SANCOR, asunto: ASUNTO, textoPdf: `${orden('80.000,00')}\n\n${constancia}` })
    expect(r).toMatchObject({ estado: 'leido', lector: 'sancor', op: '4100000001', fechaPago: '2026-02-03', neto: '80000.00' })
    expect(r.lineas).toEqual([
      { factura: { texto: 'Factura A 0002-00001234', puntoVenta: 2, numero: 1234 }, siniestro: '2000000001', bruto: '60000.00', neto: null },
      { factura: { texto: 'Factura A 0002-00001235', puntoVenta: 2, numero: 1235 }, siniestro: '2000000002', bruto: '40000.00', neto: null },
    ])
    // Las de la constancia aparte no se suman: ya están en la orden.
    expect(impuestos(r)).toEqual([['iibb', '3000.00', null], ['ganancias', '2000.00', null], ['iva', '14000.00', null], ['suss', '1000.00', null]])
    expect(r.control.resultado).toBe('cierra')
  })

  it('si no cierra, lo dice', () => {
    expect(leer({ remitente: SANCOR, asunto: ASUNTO, textoPdf: orden('81.000,00') }).estado).toBe('no_cierra')
  })

  it('el punto de venta con 5 dígitos, mezclado con 4 en la misma orden, no se saltea', () => {
    const mixta = orden('80.000,00').replace('Factura A N°: 0002-00001235', 'Factura A N°: 00002-00001235')
    const r = leer({ remitente: SANCOR, asunto: ASUNTO, textoPdf: mixta })
    expect(r.lineas.map((l) => [l.factura?.puntoVenta, l.factura?.numero])).toEqual([[2, 1234], [2, 1235]])
    expect(r.control.resultado).toBe('cierra')
  })

  it('una nota de crédito dentro de la orden ("Nota de crédito", en minúscula): no adivina, lo dice', () => {
    const conNc = orden('80.000,00').replace(' Ret. IIBB', ' Nota de crédito A N°: 00002-00000077 de 01.03.2026 Us: XXXX N°Stro:2000000001 Ret. IIBB')
    expect(leer({ remitente: SANCOR, asunto: ASUNTO, textoPdf: conNc }).estado).toBe('no_entendido')
  })

  it('un descuento que no es una retención conocida no se cuenta como retención', () => {
    const raro = orden('80.000,00').replace(' Ret. IIBB', ' Algo raro 1.000,00- Ret. IIBB')
    expect(leer({ remitente: SANCOR, asunto: ASUNTO, textoPdf: raro }).estado).toBe('no_entendido')
  })

  it('un mail con sólo constancias, sin la orden: todavía no se lee, y lo dice', () => {
    expect(leer({ remitente: SANCOR, asunto: ASUNTO, textoPdf: constancia }).estado).toBe('no_entendido')
  })
})

describe('Galicia / SURA (cuerpo del mail)', () => {
  const GALICIA = 'ar-sap@galiciaseguros.com.ar'
  const cuerpo = (detalle: string) =>
    ['Se acredita dentro de las 48Hs en su cuenta: $ 125.000,00', '', detalle, '', 'Beneficiario: TALLER DE PRUEBA S.R.L .', '', 'Generación automática del 08 Junio de 2026'].join('\n')

  it('lee el importe, la OP del asunto y las facturas', () => {
    const r = leer({
      remitente: GALICIA,
      asunto: 'Seguros Galicia – Información de Pago OP 170000001',
      cuerpo: cuerpo('Correspondientes a las facturas detalladas a continuación:\n\n00002A00001234 del 05/06/2026\n\n00002A00001235 del 06/06/2026'),
    })
    expect(r).toMatchObject({ estado: 'leido', lector: 'galicia', op: '170000001', fechaPago: '2026-06-08', neto: '125000.00' })
    expect(r.lineas.map((l) => [l.factura?.numero, l.neto])).toEqual([[1234, null], [1235, null]])
  })

  it('SURA usa el mismo formato', () => {
    const r = leer({ remitente: GALICIA, asunto: 'SURA – Información de Pago OP 1700000002 AR10 2025', cuerpo: cuerpo('Correspondientes a las facturas detalladas a continuación:\n00002A00001234 del 05/06/2025') })
    expect(r.lineas).toEqual([{ factura: { texto: '00002A00001234', puntoVenta: 2, numero: 1234 }, siniestro: null, bruto: null, neto: '125000.00' }])
  })

  it('si sólo nombra la orden de pago, se anota el pago sin líneas: las facturas están en el PDF', () => {
    const r = leer({ remitente: GALICIA, asunto: 'SURA – Información de Pago OP 1700000003 AR10 2025', cuerpo: cuerpo('Correspondientes a la siguiente Orden de Pago: 1700000003') })
    expect(r).toMatchObject({ estado: 'leido', op: '1700000003', neto: '125000.00', lineas: [] })
  })

  it('el número de orden sale del cuerpo: el asunto de "Seguros Galicia" lo corta', () => {
    const r = leer({ remitente: GALICIA, asunto: 'Seguros Galicia – Información de Pago OP 170000004', cuerpo: cuerpo('Correspondientes a la siguiente Orden de Pago: 1700000045') })
    expect(r.op).toBe('1700000045')
  })
})

describe('La Caja (aviso de cobranzas.com)', () => {
  it('el mail de acceso al portal no es un pago', () => {
    expect(leer({ remitente: 'no-reply@cobranzas.com', asunto: 'Acceso a Caja de Ahorro y Seguro S.A.', cuerpo: 'Para ingresar…' }).estado).toBe('sin_lector')
  })

  it('anota que hubo un pago, con su liquidación y su fecha; el detalle está en el portal', () => {
    const r = leer({
      remitente: 'no-reply@cobranzas.com',
      asunto: 'Novedad de Caja de Ahorro y Seguro S.A.',
      cuerpo: '| | ## Pago |\n| | Usted tiene una novedad en un pago de Caja de Ahorro y Seguro S.A.. |\n| Número de Liquidación | 100000000000001 |\n| Fecha de Disponibilidad | 24/08/2026 |',
    })
    expect(r).toMatchObject({ estado: 'leido', lector: 'la-caja', op: '100000000000001', fechaPago: '2026-08-24', neto: null, lineas: [] })
  })
})

describe('acuses: dicen algo de una factura, pero no son un pago (R3)', () => {
  it('Mercantil: factura aprobada, con monto, siniestro y fecha estimada de pago', () => {
    const r = leer({
      remitente: 'no-responder@mail.lamercantil.flowable-managed.com',
      asunto: 'Tu Factura A0002-00001234 ha sido aprobada',
      cuerpo: 'Te informamos que tu factura A0002-00001234, de monto $ 100.000,00 , correspondiente al siniestro Nro. 500000000001, fue aprobada y la fecha estimada de pago es 2026-10-14.',
    })
    expect(r).toMatchObject({ estado: 'acuse', tipo: 'aprobacion', factura: { puntoVenta: 2, numero: 1234 }, siniestro: '500000000001', monto: '100000.00', fechaPrometida: '2026-10-14' })
  })

  it('Allianz: la fecha con barras, y el asunto "Factura: N"', () => {
    const r = leer({ remitente: 'proveedoresmdp@allianz.com.ar', asunto: 'RE: Siniestro: C000-111 Factura: 1234', cuerpo: 'La fecha de pago es el 20/11/2025.' })
    expect(r).toMatchObject({ estado: 'acuse', tipo: 'fecha_prometida', factura: { numero: 1234 }, fechaPrometida: '2025-11-20' })
  })

  it('Allianz: un reenvío interno no es una respuesta; una respuesta sin fecha la mira una persona', () => {
    expect(leer({ remitente: 'proveedoresmdp@allianz.com.ar', asunto: 'RV: FACTURA N°1234 SINIESTRO N°1', cuerpo: 'Te paso un caso.' }).estado).toBe('sin_lector')
    expect(leer({ remitente: 'proveedoresmdp@allianz.com.ar', asunto: 'RE: factura n°1234 siniestro n°1', cuerpo: 'Adjuntaste la orden de trabajo incorrecta.' }).estado).toBe('no_entendido')
  })

  it('Allianz: la fecha de pago, en respuesta al mail de la factura; y la respuesta automática', () => {
    const r = leer({ remitente: 'proveedoresmdp@allianz.com.ar', asunto: 'RE: factura n°1234 siniestro n°c0001', cuerpo: 'Les informamos que la fecha de pago es el 20-08-2026.' })
    expect(r).toMatchObject({ estado: 'acuse', tipo: 'fecha_prometida', factura: { numero: 1234 }, fechaPrometida: '2026-08-20' })
    expect(leer({ remitente: 'proveedoresmdp@allianz.com.ar', asunto: 'Respuesta Automatica' })).toMatchObject({ estado: 'acuse', tipo: 'autorespuesta', factura: null })
  })

  it('Zurich por Grant: "recibimos tu factura" es un acuse; otro mail de esa casilla, no', () => {
    expect(leer({ remitente: 'facturacion.zurich@grant.com.ar', asunto: 'Re: factura n°1234 siniestro n°9-1', cuerpo: 'Recibimos tu factura Hola! Te confirmamos que recibimos tu factura para su proceso de pago.' }))
      .toMatchObject({ estado: 'acuse', tipo: 'acuse', factura: { numero: 1234 } })
    expect(leer({ remitente: 'facturacion.zurich@grant.com.ar', asunto: 'Re: factura n°1234 siniestro n°9-1', cuerpo: 'Siniestro habilitado en la plataforma.' }).estado).toBe('sin_lector')
  })
})

/* ------------------------------------------------------------------------------------------- */

describe('el reparto entre lectores', () => {
  it('un remitente sin lector queda guardado como sin_lector, con el motivo', () => {
    expect(leer({ remitente: 'Pagos <pagos@otra-compania.example>', asunto: 'AVISO DE PAGO' })).toEqual({
      estado: 'sin_lector', lector: null, version: null, motivo: 'Todavía no hay lector para pagos@otra-compania.example con ese asunto.',
    })
  })

  it('un dominio que sólo termina parecido no se confunde', () => {
    expect(leer({ remitente: 'x@nofedpat.com.ar', asunto: 'Aviso De Depósito De Transferencias' }).estado).toBe('sin_lector')
  })
})

describe('asunto de las facturas enviadas', () => {
  const asunto = (a: string) => JSON.parse(JSON.stringify(L.leerAsuntoEnvio(a))) as unknown

  it('el asunto estándar, y siniestros escritos de cualquier forma', () => {
    expect(asunto('factura n°1234 siniestro n°9999999999')).toEqual({ tipo: 'envio', factura: 1234, siniestro: '9999999999', ordenCompra: null })
    expect(asunto('factura n°1234 siniestro n°12345/678')).toMatchObject({ siniestro: '12345/678' })
    expect(asunto('factura n°1234 siniestro n°c1234-5678')).toMatchObject({ siniestro: 'c1234-5678' })
    expect(asunto('factura n°1234 siniestro n° 99887766')).toMatchObject({ siniestro: '99887766' })
  })

  it('con orden de compra en vez de siniestro', () => {
    expect(asunto('factura n°123 orden de compra n°45678')).toEqual({ tipo: 'envio', factura: 123, siniestro: null, ordenCompra: '45678' })
  })

  it('una respuesta o un reenvío no es un envío nuevo', () => {
    for (const a of ['Re: factura n°1234 siniestro n°1', 'Fwd: factura n°1234 siniestro n°1', 'RE:[123] factura n°1234 siniestro n°1', '[123] Re: factura n°1234 siniestro n°1']) {
      expect(asunto(a), a).toMatchObject({ tipo: 'respuesta' })
    }
  })

  it('un asunto sin número de factura no es un envío', () => {
    expect(L.leerAsuntoEnvio('Estado de cuenta 2025')).toBeNull()
  })
})

describe('el robot', () => {
  const codigo = [...fuentes.map((n) => join('lectores', n)), 'barrido.js', 'robot.gs'].map((n) => ({ nombre: n, texto: readFileSync(join(CARPETA, n), 'utf8') }))

  it('no guarda enlaces que inician sesión en un portal sin clave (R2)', () => {
    const { sinEnlacesDeSesion } = runInNewContext(readFileSync(join(CARPETA, 'barrido.js'), 'utf8') + '\n;({ sinEnlacesDeSesion })', {}) as {
      sinEnlacesDeSesion: (t: string) => string
    }
    const limpio = sinEnlacesDeSesion('Ingresar[](https://www.portal.example/api/v1/session/fromToken/?utm_source=x&token=eyJhbGciOi.abc.def) | y https://www.ejemplo.com/ayuda queda')
    expect(limpio).not.toContain('eyJhbGciOi')
    expect(limpio).toContain('[enlace de acceso quitado por el robot]')
    expect(limpio).toContain('https://www.ejemplo.com/ayuda')
  })

  it('no guarda claves que una compañía mandó por mail (R2)', () => {
    const { sinClaves } = runInNewContext(readFileSync(join(CARPETA, 'barrido.js'), 'utf8') + '\n;({ sinClaves })', {}) as { sinClaves: (t: string) => string }
    const limpio = sinClaves('Usuario taller@ejemplo.com Contraseña Qw7[>9=k2 y Clave: abc123 y password=zz9')
    expect(limpio).not.toMatch(/Qw7|abc123|zz9/)
    expect(limpio).toContain('Usuario taller@ejemplo.com')
  })

  it('robot.gs, el archivo que se pega, está al día con sus fuentes (node robot/armar.mjs)', () => {
    expect(readFileSync(join(CARPETA, 'robot.gs'), 'utf8')).toBe(armar())
  })

  it('pide sólo los permisos de la lista, y ninguno de Gmail que escriba (R1)', () => {
    const manifiesto = JSON.parse(readFileSync(join(CARPETA, 'appsscript.json'), 'utf8')) as { oauthScopes: string[] }
    expect([...manifiesto.oauthScopes].sort()).toEqual([
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/script.external_request',
      'https://www.googleapis.com/auth/spreadsheets.currentonly',
    ])
  })

  it('ningún archivo llama a algo que mande, borre o modifique un mail (R1, RF-501)', () => {
    // GmailApp y MailApp quedan afuera enteros: piden el permiso total de Gmail.
    const prohibido = /\b(GmailApp|MailApp)\b|sendEmail|createDraft|\.(send|trash|untrash|modify|batchModify|batchDelete|import|insert)\s*\(|Gmail\.Users\.(Drafts|Labels|Settings)|Messages\.(remove|delete)/
    for (const { nombre, texto } of codigo) {
      const sinComentarios = texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(sinComentarios, nombre).not.toMatch(prohibido)
    }
  })

  it('no hay credenciales en el código (R2)', () => {
    for (const { nombre, texto } of codigo) {
      expect(texto, nombre).not.toMatch(/service_role|password|contraseña\s*[:=]|apikey|anon_key/i)
    }
  })
})

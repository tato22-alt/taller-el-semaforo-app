import { describe, expect, it } from 'vitest'
import {
  certificadoEnPalabras,
  esImpuesto,
  importeParaPlanilla,
  impuestoEnPalabras,
  mesEnPalabras,
  nombreDePlanilla,
  planillaDelMes,
  queFacturasPago,
  type Retencion,
} from './retenciones'

const retencion: Retencion = {
  idRetencion: 1, gmailMessageId: 'm1', cuit: '30000000001', compania: 'Compañía Uno', fecha: '2026-10-15', mes: '2026-10-01',
  impuesto: 'iva', concepto: 'IVA (régimen 212)', certificado: '0000-2026-000001', importe: '69421.49', op: '1234567',
  facturas: [3571, 3572], siniestros: [],
}

describe('retenciones', () => {
  it('nombra los impuestos como los nombra el taller, y reconoce sólo los que conoce', () => {
    expect(impuestoEnPalabras('iibb')).toBe('Ingresos Brutos')
    expect(esImpuesto('suss')).toBe(true)
    expect(esImpuesto('sircreb')).toBe(false)
  })

  it('dice el mes en palabras', () => {
    expect(mesEnPalabras('2026-10-01')).toBe('octubre de 2026')
    expect(mesEnPalabras('2026-01-01')).toBe('enero de 2026')
    expect(mesEnPalabras('cualquiera')).toBe('cualquiera')
  })

  it('sin número de certificado no dice que se perdió: dice que el aviso no lo trae', () => {
    expect(certificadoEnPalabras({ certificado: null })).toBe('El aviso no trae el número')
    expect(certificadoEnPalabras({ certificado: '00-0001-400004' })).toBe('00-0001-400004')
  })

  it('dice qué pagó la orden: las facturas o los siniestros', () => {
    expect(queFacturasPago({ facturas: [3571, 3572], siniestros: [] })).toBe('3571, 3572')
    expect(queFacturasPago({ facturas: [], siniestros: ['2001234567'] })).toBe('siniestro 2001234567')
    expect(queFacturasPago({ facturas: [], siniestros: [] })).toBe('—')
  })

  it('escribe el importe con coma decimal y sin miles, sin pasar por float', () => {
    expect(importeParaPlanilla('69421.49')).toBe('69421,49')
    expect(importeParaPlanilla('4130.5')).toBe('4130,50')
    expect(importeParaPlanilla('12')).toBe('12,00')
    expect(importeParaPlanilla('1234567890123.45')).toBe('1234567890123,45')
  })

  it('arma la planilla del mes para Excel: marca de UTF-8, punto y coma, y comillas donde hacen falta', () => {
    const csv = planillaDelMes([retencion, { ...retencion, idRetencion: 2, compania: 'Seguros "Dos"; S.A.', certificado: null, op: null, facturas: [], siniestros: ['S-1'] }])
    const renglones = csv.slice(1).split('\r\n')
    expect(csv.startsWith('﻿')).toBe(true)
    expect(renglones[0]).toBe('Fecha;Compañía;CUIT;Impuesto;Concepto;Certificado;Importe;Orden de pago;Facturas')
    expect(renglones[1]).toBe('15/10/2026;Compañía Uno;30000000001;IVA;IVA (régimen 212);0000-2026-000001;69421,49;1234567;3571, 3572')
    expect(renglones[2]).toBe('15/10/2026;"Seguros ""Dos""; S.A.";30000000001;IVA;IVA (régimen 212);;69421,49;;siniestro S-1')
    expect(renglones[3]).toBe('')
  })

  it('nombra el archivo por el mes', () => {
    expect(nombreDePlanilla('2026-10-01')).toBe('retenciones-2026-10.csv')
  })
})

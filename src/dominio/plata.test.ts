import { describe, expect, it } from 'vitest'
import {
  armarCompras, cambioContraElMesAnterior, compararImportes, enCentavos, esCero, mesParaAbrir, nombreDePlanilla, planillaDelMes,
  rubroEnPalabras, type FilaDeCompras,
} from './plata'

const fila = (o: Partial<FilaDeCompras>): FilaDeCompras => ({
  fila: 'proveedor', rubro: 'repuestos', cuit: '30000000002', proveedor: 'Repuestos', comprado: '100.00', comprobantes: 1, mesAnterior: '0.00', enElAnio: '100.00', ...o,
})

describe('los importes, sin float', () => {
  it('pasa a centavos y compara', () => {
    expect(enCentavos('1234.5')).toBe(123450n)
    expect(enCentavos('-0.07')).toBe(-7n)
    expect(enCentavos('mil')).toBeNull()
    expect(compararImportes('900000000000.10', '900000000000.09')).toBe(1)
    expect(compararImportes('10.00', '10')).toBe(0)
    expect(compararImportes('-1', '0')).toBe(-1)
    expect(esCero('0.00')).toBe(true)
    expect(esCero('0.01')).toBe(false)
  })
})

describe('las compras del mes', () => {
  it('ordena los rubros y sus proveedores de más a menos, comparando números y no letras', () => {
    const r = armarCompras([
      fila({ fila: 'mes', rubro: null, cuit: null, comprado: '1150.00' }),
      fila({ fila: 'rubro', rubro: 'pintura', cuit: null, comprado: '150.00' }),
      fila({ fila: 'rubro', rubro: 'repuestos', cuit: null, comprado: '1000.00' }),
      fila({ proveedor: 'Chico', comprado: '99.00' }),
      fila({ proveedor: 'Grande', comprado: '901.00', cuit: '30000000003' }),
      fila({ proveedor: 'Pinturería', rubro: 'pintura', comprado: '150.00', cuit: '30000000004' }),
    ])
    expect(r.total?.comprado).toBe('1150.00')
    expect(r.rubros.map((x) => x.rubro.rubro)).toEqual(['repuestos', 'pintura'])
    expect(r.rubros[0]?.proveedores.map((p) => p.proveedor)).toEqual(['Grande', 'Chico'])
    expect(armarCompras([]).total).toBeNull()
  })

  it('dice para qué lado cambió contra el mes anterior', () => {
    expect(cambioContraElMesAnterior({ comprado: '200.00', mesAnterior: '100.00' })).toBe('mas')
    expect(cambioContraElMesAnterior({ comprado: '50.00', mesAnterior: '100.00' })).toBe('menos')
    expect(cambioContraElMesAnterior({ comprado: '100.00', mesAnterior: '100.00' })).toBe('igual')
    expect(cambioContraElMesAnterior({ comprado: '100.00', mesAnterior: '0.00' })).toBe('nuevo')
  })

  it('nombra los rubros, y lo que no es de la lista es "Sin rubro"', () => {
    expect(rubroEnPalabras('pintura')).toBe('Pintura e insumos')
    expect(rubroEnPalabras('sin_rubro')).toBe('Sin rubro')
    expect(rubroEnPalabras(null)).toBe('Sin rubro')
  })

  it('abre el mes de hoy si tiene algo; si no, el más reciente', () => {
    const meses = [{ mes: '2026-11-01' }, { mes: '2026-10-01' }]
    expect(mesParaAbrir(meses, '2026-10-20')).toBe('2026-10-01')
    expect(mesParaAbrir(meses, '2026-12-03')).toBe('2026-11-01')
    expect(mesParaAbrir([], '2026-12-03')).toBeNull()
  })
})

describe('la planilla del mes', () => {
  it('trae ventas, compras y retenciones, con coma decimal y la nota de crédito en negativo', () => {
    const p = planillaDelMes(
      [{ fecha: '2026-10-02', tipo: 'Nota de Crédito A', puntoVenta: 2, numero: 31, cuit: '30000000001', nombre: 'Seguros; S.A.', rubro: null, netoGravado: '-1000.00', iva: '-210.00', total: '-1210.00' }],
      [{ fecha: '2026-10-05', tipo: 'Factura A', puntoVenta: 5, numero: 77, cuit: '30000000002', nombre: 'Repuestos', rubro: 'repuestos', netoGravado: '500.5', iva: '105.11', total: '605.61' }],
      [{ fecha: '2026-10-09', compania: 'Seguros', cuit: '30000000001', impuesto: 'IVA', certificado: null, importe: '30.00' }],
    )
    const lineas = p.replace(/^﻿/, '').split('\r\n')
    expect(p.charCodeAt(0)).toBe(0xfeff)
    expect(lineas[0]).toBe('VENTAS')
    expect(lineas[2]).toBe('02/10/2026;Nota de Crédito A;0002-00000031;"Seguros; S.A.";30000000001;-1000,00;-210,00;-1210,00')
    expect(lineas[4]).toBe('COMPRAS')
    expect(lineas[6]).toBe('05/10/2026;Factura A;0005-00000077;Repuestos;30000000002;Repuestos;500,50;105,11;605,61')
    expect(lineas[8]).toBe('RETENCIONES')
    expect(lineas[10]).toBe('09/10/2026;Seguros;30000000001;IVA;;30,00')
    expect(nombreDePlanilla('2026-10-01')).toBe('el-semaforo-2026-10.csv')
  })
})

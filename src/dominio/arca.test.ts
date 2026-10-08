import { describe, expect, it } from 'vitest'
import { aDecimal, leerMisComprobantes, partirLinea } from './arca'

/* Datos inventados con el formato real del CSV de Mis Comprobantes (visto el 2026-10-08).
 * Nunca renglones reales: el repo es público. */

const TITULOS =
  '"Fecha de Emisión";"Tipo de Comprobante";"Punto de Venta";"Número Desde";"Número Hasta";' +
  '"Cód. Autorización";"Tipo Doc. Receptor";"Nro. Doc. Receptor";"Denominación Receptor";' +
  '"Tipo Cambio";"Moneda";"Imp. Neto Gravado IVA 0%";"IVA 2,5%";"Imp. Neto Gravado IVA 2,5%";' +
  '"IVA 5%";"Imp. Neto Gravado IVA 5%";"IVA 10,5%";"Imp. Neto Gravado IVA 10,5%";"IVA 21%";' +
  '"Imp. Neto Gravado IVA 21%";"IVA 27%";"Imp. Neto Gravado IVA 27%";"Imp. Neto Gravado Total";' +
  '"Imp. Neto No Gravado";"Imp. Op. Exentas";"Otros Tributos";"Total IVA";"Imp. Total"'

/** Un renglón con los valores que importan; el resto, como lo deja ARCA. */
function renglon(o: {
  fecha?: string; tipo?: string; pv?: string; desde?: string; hasta?: string
  tipoDoc?: string; nroDoc?: string; nombre?: string; moneda?: string
  neto?: string; iva?: string; total?: string
}): string {
  const neto = o.neto ?? '1000,00'
  const iva = o.iva ?? '210,00'
  return [
    o.fecha ?? '2025-01-15', o.tipo ?? '1', o.pv ?? '2', o.desde ?? '100', o.hasta ?? o.desde ?? '100',
    '12345678901234', o.tipoDoc ?? '80', o.nroDoc ?? '30000000001', o.nombre ?? 'COMPAÑIA INVENTADA S.A.',
    '1,00', o.moneda ?? '$', '', '', '', '', '', '', '', iva, neto, '', '', neto, '0,00', '0,00', '0,00',
    iva, o.total ?? '1210,00',
  ].join(';')
}

const TIPOS = new Set([1, 2, 3, 6, 7, 8, 201, 202, 203])

function leer(...renglones: string[]) {
  return leerMisComprobantes([TITULOS, ...renglones].join('\r\n'), TIPOS)
}

describe('leerMisComprobantes', () => {
  it('lee un renglón con el formato real', () => {
    const r = leer(renglon({ total: '1234500,00', neto: '1020247,95', iva: '214252,07' }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.leidas).toBe(1)
    expect(r.errores).toEqual([])
    expect(r.filas[0]).toEqual({
      renglon: 2,
      fechaEmision: '2025-01-15',
      tipoCodigo: 1,
      puntoVenta: 2,
      numero: 100,
      cuitReceptor: '30000000001',
      receptorNombre: 'COMPAÑIA INVENTADA S.A.',
      moneda: 'PES',
      tipoCambio: '1.00',
      netoGravado: '1020247.95',
      iva: '214252.07',
      total: '1234500.00',
    })
  })

  it('pasa los importes como texto con punto, sin pasar por un float', () => {
    const r = leer(renglon({ total: '8999999999,99' }))
    expect(r.ok && r.filas[0]?.total).toBe('8999999999.99')
  })

  it('busca las columnas por título, no por posición', () => {
    const titulos = TITULOS.split(';')
    const datos = renglon({ desde: '555' }).split(';')
    // Se invierte el orden de todas las columnas: tiene que leer lo mismo.
    const texto = [titulos.reverse().join(';'), datos.reverse().join(';')].join('\n')
    const r = leerMisComprobantes(texto, TIPOS)
    expect(r.ok && r.filas[0]?.numero).toBe(555)
  })

  it('acepta los títulos sin acentos, por si el archivo pasó por otro programa', () => {
    const sinAcentos = TITULOS.normalize('NFD').replace(/[̀-ͯ]/g, '')
    const r = leerMisComprobantes([sinAcentos, renglon({})].join('\n'), TIPOS)
    expect(r.ok && r.filas.length).toBe(1)
  })

  it('ignora la marca BOM del principio y los renglones vacíos del final', () => {
    const r = leerMisComprobantes('﻿' + [TITULOS, renglon({}), '', ''].join('\n'), TIPOS)
    expect(r.ok && r.leidas).toBe(1)
  })

  it('el CUIT del receptor, sólo cuando ARCA dice que es un CUIT', () => {
    const r = leer(renglon({ tipoDoc: '96', nroDoc: '12345678', nombre: 'PARTICULAR INVENTADO' }))
    expect(r.ok && r.filas[0]?.cuitReceptor).toBeNull()
    expect(r.ok && r.filas[0]?.receptorNombre).toBe('PARTICULAR INVENTADO')
  })

  it('un renglón agrupado (desde distinto de hasta) no se importa: va a errores', () => {
    const r = leer(renglon({ desde: '10', hasta: '12' }))
    expect(r.ok && r.filas).toEqual([])
    expect(r.ok && r.errores[0]?.motivo).toMatch(/agrupado/)
  })

  it('un tipo que la base no conoce va a errores, con su renglón', () => {
    const r = leer(renglon({}), renglon({ tipo: '11', desde: '101' }))
    expect(r.ok && r.filas.length).toBe(1)
    expect(r.ok && r.errores).toEqual([{ renglon: 3, motivo: 'tipo de comprobante 11, que la base no conoce' }])
  })

  it('una fecha o un importe que no se entienden van a errores, sin frenar el resto', () => {
    const r = leer(renglon({ fecha: '15/01/2025' }), renglon({ total: '1.210,00', desde: '101' }), renglon({ desde: '102' }))
    expect(r.ok && r.leidas).toBe(3)
    expect(r.ok && r.filas.map((f) => f.numero)).toEqual([102])
    expect(r.ok && r.errores.map((e) => e.renglon)).toEqual([2, 3])
  })

  it('rechaza un archivo que no es de Mis Comprobantes, diciendo qué falta', () => {
    const r = leerMisComprobantes('"Fecha";"Importe"\n2025-01-01;100', TIPOS)
    expect(r).toEqual({ ok: false, motivo: 'No parece el CSV de Mis Comprobantes: falta la columna "Fecha de Emisión".' })
  })

  it('rechaza un archivo vacío', () => {
    expect(leerMisComprobantes('', TIPOS)).toEqual({ ok: false, motivo: 'El archivo está vacío.' })
  })
})

describe('partirLinea', () => {
  it('no corta en un separador que está entre comillas', () => {
    expect(partirLinea('a;"b;c";d', ';')).toEqual(['a', 'b;c', 'd'])
  })

  it('entiende las comillas dobles escapadas', () => {
    expect(partirLinea('"dice ""hola""";x', ';')).toEqual(['dice "hola"', 'x'])
  })
})

describe('aDecimal', () => {
  it('pasa la coma decimal a punto', () => {
    expect(aDecimal('1210,50')).toBe('1210.50')
    expect(aDecimal('1210')).toBe('1210')
  })

  it('vacío es cero, que es como ARCA deja las columnas sin importe', () => {
    expect(aDecimal('')).toBe('0')
  })

  it('no adivina un formato con separador de miles', () => {
    expect(aDecimal('1.210,50')).toBeNull()
    expect(aDecimal('abc')).toBeNull()
  })
})

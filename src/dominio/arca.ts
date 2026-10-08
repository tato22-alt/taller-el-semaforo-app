/* El CSV de "Mis Comprobantes" de ARCA, leído a filas que la base puede guardar.
 *
 * Función pura: recibe el texto del archivo, devuelve filas o errores. No sabe nada de la
 * base ni de la pantalla, así que se prueba con texto inventado.
 *
 * Cómo viene el archivo (visto en uno real, 2026-10-08): separador ";", títulos entre
 * comillas y datos sin comillas, fecha año-mes-día, tipo como número, importes con coma
 * decimal y sin separador de miles, moneda "$". Las columnas se buscan por su título y no por
 * su posición: ARCA ya cambió el orden más de una vez (agregó una columna por alícuota de IVA).
 *
 * No se suma nada: los totales vienen calculados por ARCA ("Imp. Neto Gravado Total",
 * "Total IVA", "Imp. Total") y pasan tal cual. Los importes salen como texto con punto
 * decimal ("1210.50"), igual que los manda PostgREST, para no pasar nunca por un float. */

export type ComprobanteArca = {
  readonly renglon: number
  readonly fechaEmision: string
  readonly tipoCodigo: number
  readonly puntoVenta: number
  readonly numero: number
  readonly cuitReceptor: string | null
  readonly receptorNombre: string | null
  readonly moneda: string
  readonly tipoCambio: string
  readonly netoGravado: string
  readonly iva: string
  readonly total: string
}

export type ErrorDeRenglon = { readonly renglon: number; readonly motivo: string }

export type LecturaArca =
  | { readonly ok: true; readonly leidas: number; readonly filas: readonly ComprobanteArca[]; readonly errores: readonly ErrorDeRenglon[] }
  | { readonly ok: false; readonly motivo: string }

/* Los títulos que hacen falta, tal como los escribe ARCA. Se comparan sin acentos ni
 * mayúsculas, para que un archivo pasado por otro programa no falle por una tilde. */
const COLUMNAS = {
  fecha: 'Fecha de Emisión',
  tipo: 'Tipo de Comprobante',
  puntoVenta: 'Punto de Venta',
  desde: 'Número Desde',
  hasta: 'Número Hasta',
  tipoDoc: 'Tipo Doc. Receptor',
  nroDoc: 'Nro. Doc. Receptor',
  denominacion: 'Denominación Receptor',
  tipoCambio: 'Tipo Cambio',
  moneda: 'Moneda',
  neto: 'Imp. Neto Gravado Total',
  iva: 'Total IVA',
  total: 'Imp. Total',
} as const

type Columna = keyof typeof COLUMNAS

/** El código de ARCA para "el receptor se identifica con CUIT". */
const DOC_CUIT = '80'

export function leerMisComprobantes(texto: string, tiposConocidos: ReadonlySet<number>): LecturaArca {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/)
  const titulos = lineas[0] ?? ''
  if (titulos.trim() === '') return { ok: false, motivo: 'El archivo está vacío.' }

  const separador = titulos.split(';').length >= titulos.split(',').length ? ';' : ','
  const indices = ubicarColumnas(partirLinea(titulos, separador))
  if (!indices.ok) {
    return { ok: false, motivo: `No parece el CSV de Mis Comprobantes: falta la columna "${indices.falta}".` }
  }

  const filas: ComprobanteArca[] = []
  const errores: ErrorDeRenglon[] = []
  let leidas = 0

  lineas.slice(1).forEach((linea, i) => {
    if (linea.trim() === '') return
    leidas += 1
    const renglon = i + 2 // el renglón como lo ve una persona en el archivo: los títulos son el 1
    const leida = leerRenglon(partirLinea(linea, separador), indices.dato, renglon, tiposConocidos)
    if (leida.ok) filas.push(leida.fila)
    else errores.push({ renglon, motivo: leida.motivo })
  })

  return { ok: true, leidas, filas, errores }
}

function leerRenglon(
  valores: readonly string[],
  indices: Readonly<Record<Columna, number>>,
  renglon: number,
  tiposConocidos: ReadonlySet<number>,
): { readonly ok: true; readonly fila: ComprobanteArca } | { readonly ok: false; readonly motivo: string } {
  const v = (c: Columna): string => (valores[indices[c]] ?? '').trim()

  const fecha = v('fecha')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, motivo: `fecha que no se entiende: "${fecha}"` }

  const tipo = entero(v('tipo'))
  if (tipo === null) return { ok: false, motivo: `tipo de comprobante que no se entiende: "${v('tipo')}"` }
  if (!tiposConocidos.has(tipo)) return { ok: false, motivo: `tipo de comprobante ${tipo}, que la base no conoce` }

  const puntoVenta = entero(v('puntoVenta'))
  const desde = entero(v('desde'))
  const hasta = entero(v('hasta'))
  if (puntoVenta === null || puntoVenta <= 0) return { ok: false, motivo: 'punto de venta inválido' }
  if (desde === null || desde <= 0) return { ok: false, motivo: 'número de comprobante inválido' }
  if (hasta !== null && hasta !== desde) {
    return { ok: false, motivo: `renglón agrupado (del ${desde} al ${hasta}): no se importa, hay que revisarlo` }
  }

  const importes = { tipoCambio: v('tipoCambio'), neto: v('neto'), iva: v('iva'), total: v('total') }
  const convertidos: Partial<Record<keyof typeof importes, string>> = {}
  for (const [clave, crudo] of Object.entries(importes) as [keyof typeof importes, string][]) {
    const decimal = aDecimal(crudo)
    if (decimal === null) return { ok: false, motivo: `importe que no se entiende en ${COLUMNAS[clave]}: "${crudo}"` }
    convertidos[clave] = decimal
  }

  const nroDoc = v('nroDoc')
  const cuitReceptor = v('tipoDoc') === DOC_CUIT && /^\d{11}$/.test(nroDoc) ? nroDoc : null
  const moneda = v('moneda')

  return {
    ok: true,
    fila: {
      renglon,
      fechaEmision: fecha,
      tipoCodigo: tipo,
      puntoVenta,
      numero: desde,
      cuitReceptor,
      receptorNombre: v('denominacion') || null,
      moneda: moneda === '$' ? 'PES' : moneda,
      tipoCambio: convertidos.tipoCambio ?? '1',
      netoGravado: convertidos.neto ?? '0',
      iva: convertidos.iva ?? '0',
      total: convertidos.total ?? '0',
    },
  }
}

function ubicarColumnas(
  titulos: readonly string[],
): { readonly ok: true; readonly dato: Readonly<Record<Columna, number>> } | { readonly ok: false; readonly falta: string } {
  const normalizados = titulos.map(normalizar)
  const indices: Partial<Record<Columna, number>> = {}
  for (const [clave, titulo] of Object.entries(COLUMNAS) as [Columna, string][]) {
    const i = normalizados.indexOf(normalizar(titulo))
    if (i < 0) return { ok: false, falta: titulo }
    indices[clave] = i
  }
  return { ok: true, dato: indices as Record<Columna, number> }
}

/** Parte una línea respetando comillas: un ";" dentro de "S.A.; sucursal" no corta. */
export function partirLinea(linea: string, separador: string): readonly string[] {
  const valores: string[] = []
  let actual = ''
  let entreComillas = false
  for (let i = 0; i < linea.length; i += 1) {
    const c = linea[i]
    if (c === '"' && entreComillas && linea[i + 1] === '"') {
      actual += '"'
      i += 1
    } else if (c === '"') {
      entreComillas = !entreComillas
    } else if (c === separador && !entreComillas) {
      valores.push(actual)
      actual = ''
    } else {
      actual += c
    }
  }
  valores.push(actual)
  return valores
}

/** "1234500,00" → "1234500.00". Vacío cuenta como cero: ARCA deja vacías las columnas en cero. */
export function aDecimal(texto: string): string | null {
  if (texto === '') return '0'
  if (!/^-?\d+(,\d+)?$/.test(texto)) return null
  return texto.replace(',', '.')
}

function entero(texto: string): number | null {
  return /^\d+$/.test(texto) ? Number(texto) : null
}

function normalizar(titulo: string): string {
  return titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

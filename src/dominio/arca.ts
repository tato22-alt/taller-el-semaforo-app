/* El CSV de "Mis Comprobantes" de ARCA, leído a filas que la base puede guardar.
 *
 * Funciones puras: reciben el texto del archivo, devuelven filas o errores. No saben nada de la
 * base ni de la pantalla, así que se prueban con texto inventado.
 *
 * Son dos archivos con la misma forma: el de Emitidos (lo que factura el taller) y el de Recibidos
 * (lo que le facturan al taller, spec 013 de semaforo-base). Se distinguen por sus títulos: uno
 * nombra al receptor y el otro al emisor. `claseDeArchivo` dice cuál es, y cada uno tiene su lector:
 * nadie elige a mano, así que una compra no puede entrar como venta ni al revés.
 *
 * Cómo viene el archivo (visto en uno real de Emitidos, 2026-10-08): separador ";", títulos entre
 * comillas y datos sin comillas, fecha año-mes-día, tipo como número, importes con coma
 * decimal y sin separador de miles, moneda "$". Las columnas se buscan por su título y no por
 * su posición: ARCA ya cambió el orden más de una vez (agregó una columna por alícuota de IVA).
 * El lector de Recibidos se escribió con esos mismos títulos, sin un archivo real a la vista: si
 * ARCA llama distinto a una columna, el lector dice cuál le falta.
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

/** Un comprobante que le emitieron al taller. */
export type CompraArca = {
  readonly renglon: number
  readonly fechaEmision: string
  readonly tipoCodigo: number
  readonly puntoVenta: number
  readonly numero: number
  readonly cuitEmisor: string
  readonly emisorNombre: string
  /** El CUIT de quien lo recibió, si el archivo lo trae: sirve para ver que sea el del taller. */
  readonly cuitReceptor: string | null
  readonly moneda: string
  readonly tipoCambio: string
  readonly netoGravado: string
  readonly iva: string
  readonly total: string
}

export type ErrorDeRenglon = { readonly renglon: number; readonly motivo: string }

type Lectura<F> =
  | { readonly ok: true; readonly leidas: number; readonly filas: readonly F[]; readonly errores: readonly ErrorDeRenglon[] }
  | { readonly ok: false; readonly motivo: string }

export type LecturaArca = Lectura<ComprobanteArca>
export type LecturaRecibidos = Lectura<CompraArca>

export type ClaseDeArchivo = 'emitidos' | 'recibidos'

/* Los títulos que hacen falta, tal como los escribe ARCA. Se comparan sin acentos ni
 * mayúsculas, para que un archivo pasado por otro programa no falle por una tilde. */
const COMUNES = {
  fecha: 'Fecha de Emisión',
  tipo: 'Tipo de Comprobante',
  puntoVenta: 'Punto de Venta',
  desde: 'Número Desde',
  hasta: 'Número Hasta',
  tipoCambio: 'Tipo Cambio',
  moneda: 'Moneda',
  neto: 'Imp. Neto Gravado Total',
  iva: 'Total IVA',
  total: 'Imp. Total',
} as const

const DE_EMITIDOS = {
  ...COMUNES,
  tipoDoc: 'Tipo Doc. Receptor',
  nroDoc: 'Nro. Doc. Receptor',
  denominacion: 'Denominación Receptor',
} as const

const DE_RECIBIDOS = {
  ...COMUNES,
  nroDoc: 'Nro. Doc. Emisor',
  denominacion: 'Denominación Emisor',
} as const

/** En Recibidos, quién lo recibió. Puede no venir. */
const RECEPTOR_EN_RECIBIDOS = 'Nro. Doc. Receptor'

type Comun = keyof typeof COMUNES

/** El código de ARCA para "el receptor se identifica con CUIT". */
const DOC_CUIT = '80'

/** Qué archivo de Mis Comprobantes es, por sus títulos. Nulo: ninguno de los dos. */
export function claseDeArchivo(texto: string): ClaseDeArchivo | null {
  const abierto = abrir(texto)
  if (!abierto.ok) return null
  const titulos = abierto.titulos.map(normalizar)
  if (titulos.includes(normalizar(DE_RECIBIDOS.denominacion))) return 'recibidos'
  if (titulos.includes(normalizar(DE_EMITIDOS.denominacion))) return 'emitidos'
  return null
}

/** El archivo de Emitidos: lo que factura el taller. */
export function leerMisComprobantes(texto: string, tiposConocidos: ReadonlySet<number>): LecturaArca {
  return leer(texto, DE_EMITIDOS, (v, renglon) => {
    const comun = leerLoComun(v, renglon, tiposConocidos, 1)
    if (!comun.ok) return comun
    const nroDoc = v('nroDoc')
    return {
      ok: true,
      fila: {
        ...comun.dato,
        cuitReceptor: v('tipoDoc') === DOC_CUIT && /^\d{11}$/.test(nroDoc) ? nroDoc : null,
        receptorNombre: v('denominacion') || null,
      },
    }
  })
}

/** El archivo de Recibidos: lo que le facturan al taller. */
export function leerRecibidos(texto: string, tiposConocidos: ReadonlySet<number>): LecturaRecibidos {
  const abierto = abrir(texto)
  const receptor = abierto.ok ? abierto.titulos.map(normalizar).indexOf(normalizar(RECEPTOR_EN_RECIBIDOS)) : -1
  return leer(texto, DE_RECIBIDOS, (v, renglon, valores) => {
    // Un tique o un servicio público pueden venir con punto de venta 0.
    const comun = leerLoComun(v, renglon, tiposConocidos, 0)
    if (!comun.ok) return comun
    const cuitEmisor = v('nroDoc').replace(/\D/g, '')
    if (cuitEmisor.length !== 11) return { ok: false, motivo: `no trae el CUIT de quien lo emitió: "${v('nroDoc')}"` }
    const cuitReceptor = (receptor >= 0 ? (valores[receptor] ?? '') : '').replace(/\D/g, '')
    return {
      ok: true,
      fila: {
        ...comun.dato,
        cuitEmisor,
        emisorNombre: v('denominacion') || cuitEmisor,
        cuitReceptor: cuitReceptor.length === 11 ? cuitReceptor : null,
      },
    }
  })
}

type LoComun = Pick<ComprobanteArca, 'renglon' | 'fechaEmision' | 'tipoCodigo' | 'puntoVenta' | 'numero' | 'moneda' | 'tipoCambio' | 'netoGravado' | 'iva' | 'total'>

type Renglon<F> = { readonly ok: true; readonly fila: F } | { readonly ok: false; readonly motivo: string }

/** Abre el archivo, ubica las columnas y lee renglón por renglón con el lector que le pasan. */
function leer<C extends string, F>(
  texto: string,
  columnas: Readonly<Record<C, string>>,
  leerRenglon: (v: (c: C) => string, renglon: number, valores: readonly string[]) => Renglon<F>,
): Lectura<F> {
  const abierto = abrir(texto)
  if (!abierto.ok) return abierto
  const indices = ubicarColumnas(abierto.titulos, columnas)
  if (!indices.ok) {
    return { ok: false, motivo: `No parece el CSV de Mis Comprobantes: falta la columna "${indices.falta}".` }
  }

  const filas: F[] = []
  const errores: ErrorDeRenglon[] = []
  let leidas = 0

  abierto.renglones.forEach((linea, i) => {
    if (linea.trim() === '') return
    leidas += 1
    const renglon = i + 2 // el renglón como lo ve una persona en el archivo: los títulos son el 1
    const valores = partirLinea(linea, abierto.separador)
    const leida = leerRenglon((c) => (valores[indices.dato[c]] ?? '').trim(), renglon, valores)
    if (leida.ok) filas.push(leida.fila)
    else errores.push({ renglon, motivo: leida.motivo })
  })

  return { ok: true, leidas, filas, errores }
}

type Abierto =
  | { readonly ok: true; readonly titulos: readonly string[]; readonly renglones: readonly string[]; readonly separador: string }
  | { readonly ok: false; readonly motivo: string }

function abrir(texto: string): Abierto {
  const lineas = texto.replace(/^﻿/, '').split(/\r?\n/)
  const titulos = lineas[0] ?? ''
  if (titulos.trim() === '') return { ok: false, motivo: 'El archivo está vacío.' }
  const separador = titulos.split(';').length >= titulos.split(',').length ? ';' : ','
  return { ok: true, titulos: partirLinea(titulos, separador), renglones: lineas.slice(1), separador }
}

/** Lo que traen igual los dos archivos: la fecha, el tipo, el número y los importes. */
function leerLoComun(
  v: (c: Comun) => string,
  renglon: number,
  tiposConocidos: ReadonlySet<number>,
  puntoVentaMinimo: number,
): { readonly ok: true; readonly dato: LoComun } | { readonly ok: false; readonly motivo: string } {
  const fecha = v('fecha')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, motivo: `fecha que no se entiende: "${fecha}"` }

  const tipo = entero(v('tipo'))
  if (tipo === null) return { ok: false, motivo: `tipo de comprobante que no se entiende: "${v('tipo')}"` }
  if (!tiposConocidos.has(tipo)) return { ok: false, motivo: `tipo de comprobante ${tipo}, que la base no conoce` }

  const puntoVenta = entero(v('puntoVenta'))
  const desde = entero(v('desde'))
  const hasta = entero(v('hasta'))
  if (puntoVenta === null || puntoVenta < puntoVentaMinimo) return { ok: false, motivo: 'punto de venta inválido' }
  if (desde === null || desde <= 0) return { ok: false, motivo: 'número de comprobante inválido' }
  if (hasta !== null && hasta !== desde) {
    return { ok: false, motivo: `renglón agrupado (del ${desde} al ${hasta}): no se importa, hay que revisarlo` }
  }

  const importes = { tipoCambio: v('tipoCambio'), neto: v('neto'), iva: v('iva'), total: v('total') }
  const convertidos: Partial<Record<keyof typeof importes, string>> = {}
  for (const [clave, crudo] of Object.entries(importes) as [keyof typeof importes, string][]) {
    const decimal = aDecimal(crudo)
    if (decimal === null) return { ok: false, motivo: `importe que no se entiende en ${COMUNES[clave]}: "${crudo}"` }
    convertidos[clave] = decimal
  }

  const moneda = v('moneda') === '$' ? 'PES' : v('moneda')
  // Sin tipo de cambio (vacío o cero): en pesos vale 1; en otra moneda no se adivina.
  const sinCambio = convertidos.tipoCambio === undefined || /^0(\.0+)?$/.test(convertidos.tipoCambio)
  if (sinCambio && moneda !== 'PES') return { ok: false, motivo: `comprobante en ${moneda || 'otra moneda'} sin tipo de cambio` }
  return {
    ok: true,
    dato: {
      renglon,
      fechaEmision: fecha,
      tipoCodigo: tipo,
      puntoVenta,
      numero: desde,
      moneda,
      tipoCambio: sinCambio ? '1' : (convertidos.tipoCambio ?? '1'),
      netoGravado: convertidos.neto ?? '0',
      iva: convertidos.iva ?? '0',
      total: convertidos.total ?? '0',
    },
  }
}

function ubicarColumnas<C extends string>(
  titulos: readonly string[],
  columnas: Readonly<Record<C, string>>,
): { readonly ok: true; readonly dato: Readonly<Record<C, number>> } | { readonly ok: false; readonly falta: string } {
  const normalizados = titulos.map(normalizar)
  const indices: Partial<Record<C, number>> = {}
  for (const [clave, titulo] of Object.entries(columnas) as [C, string][]) {
    const i = normalizados.indexOf(normalizar(titulo))
    if (i < 0) return { ok: false, falta: titulo }
    indices[clave] = i
  }
  return { ok: true, dato: indices as Record<C, number> }
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

/** El CUIT de quien recibió las compras, si el archivo lo trae y no es el del taller: ese archivo es
 *  de otra persona y no se importa. Nulo: no hay nada raro, o no se puede saber. */
export function recibidoPorOtro(filas: readonly Pick<CompraArca, 'cuitReceptor'>[], cuitDelTaller: string | null): string | null {
  if (cuitDelTaller === null) return null
  return filas.find((f) => f.cuitReceptor !== null && f.cuitReceptor !== cuitDelTaller)?.cuitReceptor ?? null
}

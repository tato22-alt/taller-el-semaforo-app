/* Revisar los avisos de pago que el robot no pudo cerrar solo. Spec 005 §6 (Revisar), plan de la fase 2
 * de semaforo-base (M7).
 *
 * La base dice qué espera a una persona (vw_revisar) y qué facturas pueden ser (vw_revisar_candidatas,
 * ya ordenadas). Acá se decide cómo se dice y cómo se agrupa: qué es cada cosa en palabras del taller, y
 * de qué compañía. La plata no se suma ni se ordena acá: llega como texto y así se muestra. */

export type QueRevisar =
  | 'aviso_sin_lector'
  | 'aviso_no_entendido'
  | 'aviso_no_cierra'
  | 'remitente_sin_compania'
  | 'factura_sin_comprobante'
  | 'siniestro_sin_factura'

/** Algo que espera a una persona: un aviso entero (lineaOrden nulo) o uno de sus renglones. */
export type CosaPorRevisar = {
  readonly gmailMessageId: string
  readonly lineaOrden: number | null
  readonly que: QueRevisar
  /** DATE: como texto. */
  readonly recibido: string
  readonly remitente: string
  readonly compania: string | null
  readonly cuitCompania: string | null
  readonly numero: number | null
  readonly siniestro: string | null
  readonly detalle: string | null
  /** NUMERIC: lo que el aviso o el renglón dicen, como texto. */
  readonly bruto: string | null
  readonly asunto: string | null
  readonly pdfsDrive: readonly string[]
}

/** Una factura que puede ser la de lo que se revisa, como la ordenó la base. */
export type Candidata = {
  readonly idComprobante: number
  readonly puntoVenta: number
  readonly numero: number
  readonly fecha: string
  /** NUMERIC: como texto. */
  readonly total: string
  /** Lo que le falta según los avisos que ya la pagan; nulo si ningún aviso la nombra. */
  readonly falta: string | null
  readonly mismoNumero: boolean
}

/** Una decisión vigente, para poder deshacerla. */
export type Decision = {
  readonly idImputacion: number
  readonly decision: 'vincula' | 'descarta'
  readonly decididoEn: string
  readonly asunto: string | null
  readonly remitente: string | null
  readonly factura: { readonly puntoVenta: number; readonly numero: number } | null
  readonly bruto: string | null
  readonly nota: string | null
}

const QUE: Readonly<Record<QueRevisar, string>> = {
  aviso_sin_lector: 'El robot todavía no sabe leer los avisos de esta casilla',
  aviso_no_entendido: 'El robot no entendió este aviso',
  aviso_no_cierra: 'Los importes del aviso no cierran',
  remitente_sin_compania: 'No sé de qué compañía es esta casilla',
  factura_sin_comprobante: 'Nombra una factura que no está en ARCA',
  siniestro_sin_factura: 'Dice sólo el siniestro, y no sé qué factura paga',
}

export function queEnPalabras(que: QueRevisar): string {
  return QUE[que]
}

export function esQueRevisar(texto: string): texto is QueRevisar {
  return texto in QUE
}

/** Sin la compañía no hay facturas para elegir: sólo se puede decir que no es un pago. */
export function puedeVincular(c: Pick<CosaPorRevisar, 'cuitCompania'>): boolean {
  return c.cuitCompania !== null
}

/** Un renglón trae su importe: al vincularlo no hace falta preguntar cuánto pagó. */
export function esDeUnRenglon(c: Pick<CosaPorRevisar, 'lineaOrden'>): boolean {
  return c.lineaOrden !== null
}

export function claveDe(c: Pick<CosaPorRevisar, 'gmailMessageId' | 'lineaOrden'>): string {
  return `${c.gmailMessageId}#${c.lineaOrden ?? 0}`
}

export type GrupoPorRevisar = { readonly nombre: string; readonly cosas: readonly CosaPorRevisar[] }

/** Por compañía (o por casilla, si no se sabe de quién es), las que más tienen primero; adentro, lo
 *  más nuevo primero. Así se ve de un vistazo a qué compañía le falta un lector. */
export function agruparPorCompania(cosas: readonly CosaPorRevisar[]): readonly GrupoPorRevisar[] {
  const grupos = new Map<string, CosaPorRevisar[]>()
  for (const c of cosas) {
    const nombre = c.compania ?? c.remitente
    grupos.set(nombre, [...(grupos.get(nombre) ?? []), c])
  }
  return [...grupos.entries()]
    .map(([nombre, lista]) => ({ nombre, cosas: [...lista].sort((a, b) => b.recibido.localeCompare(a.recibido)) }))
    .sort((a, b) => b.cosas.length - a.cosas.length || a.nombre.localeCompare(b.nombre))
}

/** El PDF guardado en el Drive del taller. Sólo lo abre quien tiene acceso a esa carpeta. */
export function enlaceAlPdf(idDrive: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(idDrive)}/view`
}

/** Cómo está una factura candidata, según los avisos que ya la pagan. `residuo`: hasta cuánto se lee
 *  como pagada (RESIDUO_EN_PESOS de ordenes.ts; dominio/ no se importa a sí mismo). */
export function estadoDeCandidata(c: Pick<Candidata, 'falta'>, residuo: number): 'sin_aviso' | 'pagada' | 'le_falta' {
  if (c.falta === null) return 'sin_aviso'
  return Number(c.falta) > residuo ? 'le_falta' : 'pagada'
}

/** Un importe escrito por una persona, como lo escribe el taller: "1.234.567,89", "1234567,89",
 *  "$ 1.250" o "1250.5". Devuelve "1234567.89", o nulo si no se entiende. Sin pasar por float. */
export function importeEscrito(texto: string): string | null {
  const limpio = texto.replace(/[$\s]/g, '')
  if (limpio === '') return null
  let normal: string
  if (limpio.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(limpio)) return null
    normal = limpio.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) {
    normal = limpio.replace(/\./g, '')
  } else if (/^\d+(\.\d{1,2})?$/.test(limpio)) {
    normal = limpio
  } else {
    return null
  }
  const [entero = '0', decimales = ''] = normal.split('.')
  return `${entero.replace(/^0+(?=\d)/, '')}.${decimales.padEnd(2, '0')}`
}

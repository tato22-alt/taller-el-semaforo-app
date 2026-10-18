/* Órdenes de trabajo: qué hay que mirar hoy. Spec 010 de semaforo-base.
 *
 * La base entrega magnitudes: los días que le faltan a cada orden para vencer (negativo si ya
 * venció), si está anulada y si tiene factura. Acá se decide qué significa eso para una persona del
 * taller (principio III): en qué grupo va, si se puede borrar, y qué frase se lee. */

export type Orden = {
  readonly id: number
  readonly compania: string
  readonly siniestro: string
  readonly patente: string | null
  readonly fechaEmision: string
  readonly vence: string
  readonly diasParaVencer: number
  /** NUMERIC: llega como texto y así se queda. Nulo si la compañía no lo dice en el mail. */
  readonly montoAutorizado: string | null
  readonly perito: string | null
  readonly anulada: boolean
  readonly facturada: boolean
}

export type EstadoOrden = 'anulada' | 'facturada' | 'vencida' | 'por_vencer' | 'vigente'

/** Con cuántos días de anticipación una orden pasa a "por vencer" (RF-1007). */
export const DIAS_DE_AVISO = 30

/** Cuántos días después de vencida una orden sin factura deja de mostrarse (RF-1010). */
export const DIAS_QUE_SE_MUESTRA_VENCIDA = 30

export function estadoDeOrden(o: Pick<Orden, 'anulada' | 'facturada' | 'diasParaVencer'>): EstadoOrden {
  if (o.anulada) return 'anulada'
  if (o.facturada) return 'facturada'
  if (o.diasParaVencer < 0) return 'vencida'
  if (o.diasParaVencer <= DIAS_DE_AVISO) return 'por_vencer'
  return 'vigente'
}

/** RF-1010: se borra sólo una vencida sin factura. Es la misma regla que aplica la base; acá
 *  sirve para no mostrar un botón que la base va a rechazar. */
export function sePuedeBorrar(o: Pick<Orden, 'facturada' | 'diasParaVencer'>): boolean {
  return !o.facturada && o.diasParaVencer < 0
}

export type Grupos = {
  /** Por vencer y vencidas sin factura: lo que hay que atender hoy. */
  readonly paraAtender: readonly Orden[]
  readonly vigentes: readonly Orden[]
  /** Facturadas y anuladas: resueltas, para consultar. */
  readonly resueltas: readonly Orden[]
}

/** Reparte las órdenes en los tres grupos de la pantalla, sin cambiar el orden en que llegan (la
 *  base ya las manda ordenadas por monto). Las vencidas hace más de 30 días no se muestran. */
export function agruparOrdenes(ordenes: readonly Orden[]): Grupos {
  const paraAtender: Orden[] = []
  const vigentes: Orden[] = []
  const resueltas: Orden[] = []
  for (const o of ordenes) {
    const estado = estadoDeOrden(o)
    if (estado === 'anulada' || estado === 'facturada') resueltas.push(o)
    else if (estado === 'vigente') vigentes.push(o)
    else if (estado === 'por_vencer' || o.diasParaVencer >= -DIAS_QUE_SE_MUESTRA_VENCIDA) paraAtender.push(o)
  }
  return { paraAtender, vigentes, resueltas }
}

/** "vence hoy", "vence en 12 días", "venció hace 3 días". */
export function vencimientoEnPalabras(diasParaVencer: number): string {
  if (diasParaVencer === 0) return 'vence hoy'
  if (diasParaVencer === 1) return 'vence mañana'
  if (diasParaVencer > 1) return `vence en ${diasParaVencer} días`
  if (diasParaVencer === -1) return 'venció ayer'
  return `venció hace ${-diasParaVencer} días`
}

export type OrdenNueva = {
  readonly cuitCompania: string
  readonly siniestro: string
  readonly patente: string | null
  readonly fechaEmision: string
  /** Normalizado con punto decimal, como lo espera la base. Nulo si no se cargó. */
  readonly montoAutorizado: string | null
  readonly perito: string | null
}

export type Formulario = {
  readonly cuitCompania: string
  readonly siniestro: string
  readonly patente: string
  readonly fechaEmision: string
  readonly monto: string
  readonly perito: string
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/
/** "150000", "150.000", "150000,50", "150.000,50" o "150000.50". */
const MONTO = /^(\d{1,3}(\.\d{3})+|\d+)([.,]\d{1,2})?$/

/** Valida lo que se cargó a mano. Devuelve la orden lista, o el texto de qué falta. */
export function validarOrden(f: Formulario): { readonly ok: true; readonly orden: OrdenNueva } | { readonly ok: false; readonly motivo: string } {
  if (f.cuitCompania === '') return { ok: false, motivo: 'Elegí la compañía.' }
  const siniestro = f.siniestro.trim()
  if (siniestro === '') return { ok: false, motivo: 'Falta el número de siniestro.' }
  if (!FECHA.test(f.fechaEmision)) return { ok: false, motivo: 'Falta la fecha de la orden.' }

  const monto = f.monto.replace(/\s|\$/g, '')
  let montoAutorizado: string | null = null
  if (monto !== '') {
    if (!MONTO.test(monto)) return { ok: false, motivo: 'El monto no se entiende. Escribilo así: 150000 o 150.000,50' }
    montoAutorizado = normalizarMonto(monto)
  }

  const patente = f.patente.trim().toUpperCase()
  const perito = f.perito.trim()
  return {
    ok: true,
    orden: {
      cuitCompania: f.cuitCompania,
      siniestro,
      patente: patente === '' ? null : patente,
      fechaEmision: f.fechaEmision,
      montoAutorizado,
      perito: perito === '' ? null : perito,
    },
  }
}

/** "150.000,50" → "150000.50". Sin pasar por float: es texto a texto.
 *  Si hay coma, es la de los decimales y los puntos son de miles. Si no hay coma, un solo punto con
 *  uno o dos dígitos atrás es decimal; cualquier otro punto es de miles. */
function normalizarMonto(monto: string): string {
  const [entero = '', decimales] = monto.includes(',')
    ? monto.split(',')
    : /^\d+\.\d{1,2}$/.test(monto)
      ? monto.split('.')
      : [monto, undefined]
  const limpio = entero.replace(/\./g, '')
  return decimales === undefined ? limpio : `${limpio}.${decimales.padEnd(2, '0')}`
}

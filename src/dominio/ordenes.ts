/* Órdenes de trabajo: qué hay que mirar hoy. Spec 010 de semaforo-base.
 *
 * La base entrega magnitudes: los días que le faltan a cada orden para vencer (negativo si ya
 * venció), si está anulada, cerrada, descartada o a confirmar, y si tiene factura. Acá se decide qué
 * significa eso para una persona del taller (principio III): en qué grupo va y qué frase se lee.
 *
 * Una orden no se borra nunca (RF-1013, que reemplazó a RF-1010): la que no se va a hacer se cierra
 * ("No se hizo") y la que no era una orden se descarta. Las dos se pueden deshacer. */

export type Orden = {
  readonly id: number
  /** Nula sólo en una a confirmar cuyo remitente el robot no reconoció (RF-1014). */
  readonly compania: string | null
  /** Nulo sólo en una a confirmar cuyo número el robot no pudo leer del mail (RF-1014): la persona lo
   *  completa al decir "Es una orden", y la base no la deja confirmar sin él. */
  readonly siniestro: string | null
  readonly patente: string | null
  readonly fechaEmision: string
  readonly vence: string
  readonly diasParaVencer: number
  /** NUMERIC: llega como texto y así se queda. Nulo si la compañía no lo dice en el mail. */
  readonly montoAutorizado: string | null
  readonly perito: string | null
  readonly vehiculo: string | null
  /** Lo que dice el mail de la franquicia y los repuestos, tal cual. */
  readonly observaciones: string | null
  readonly anulada: boolean
  /** La anuló el robot por un mail (y no una persona): se puede deshacer si se equivocó. */
  readonly anuladaPorMail: boolean
  readonly facturada: boolean
  /** Feature 012: las facturas que la cobran, como las escribe la base ("2-3553 del 2026-08-26").
   *  Nula si no tiene. */
  readonly facturas: string | null
  /** La vinculó la base sola, al leer el mail con que se mandó la factura (RF-1201). */
  readonly facturaPorMail: boolean
  /** Fase 2: la vinculó la base al leer un aviso de pago o un acuse que dicen factura y siniestro. */
  readonly facturaPorEvidencia: 'aviso' | 'acuse' | null
  /** Fase 2: lo que dicen los avisos y acuses de sus facturas. Nulo si no está facturada. */
  readonly pago: PagoDeLaFactura | null
  /** RF-1014: el robot la adivinó del mail de una persona. Hasta que alguien dice "Es una orden",
   *  no cuenta para los avisos ni para lo autorizado. */
  readonly aConfirmar: boolean
  /** RF-1014: alguien dijo "No es una orden". Queda, no se borra. */
  readonly descartada: boolean
  /** RF-1013: alguien dijo "No se hizo". Sale de los avisos y queda anotada. */
  readonly cerrada: boolean
  readonly cerradaMotivo: string | null
}

/** Fase 2 (plan-fase-2.md de semaforo-base): lo que la base deriva de los avisos de pago de las
 *  facturas de una orden (vw_ordenes_trabajo, columnas pago_*). Magnitudes, no conclusiones: qué es
 *  "pagada" lo decide pagoDeOrden. */
export type PagoDeLaFactura = {
  /** Cuántas de sus facturas no tienen ningún aviso de pago. */
  readonly facturasSinAviso: number
  /** Total de sus facturas menos lo que los avisos dicen que pagaron. NUMERIC: texto. Nulo si alguna
   *  factura no tiene un aviso que diga el importe. */
  readonly falta: string | null
  /** Hay un aviso de pago que no dice el importe (La Segunda, Federación Patronal agrupado). */
  readonly sinImporte: boolean
  readonly ultimoPago: string | null
  /** El aviso nombra el siniestro, no la factura (San Cristóbal, pregunta 7 del plan). */
  readonly porSiniestro: boolean
  /** El último acuse: 'acuse' (la recibieron), 'aprobacion' o 'fecha_prometida'. R3: no es un pago. */
  readonly acuse: string | null
  readonly fechaPrometida: string | null
}

/** Lo que se dice del pago de una orden facturada. */
export type EstadoDelPago = 'pagada' | 'pagada_por_siniestro' | 'sin_importe' | 'pago_parcial' | 'aprobada' | 'recibida' | 'sin_aviso'

/** Hasta cuánto puede faltar y que igual se lea "pagada": el residuo de centavos de un pago redondeado
 *  (criterio 9 de la spec 005). Se muestra igual, pero no deja la orden abierta. */
export const RESIDUO_EN_PESOS = 1

/** El pago de una orden facturada, o nulo si no está facturada. Un acuse nunca la da por pagada (R3). */
export function pagoDeOrden(o: Pick<Orden, 'facturada' | 'pago'>): EstadoDelPago | null {
  if (!o.facturada || o.pago === null) return null
  const p = o.pago
  if (p.facturasSinAviso === 0) {
    if (p.falta !== null) return Number(p.falta) > RESIDUO_EN_PESOS ? 'pago_parcial' : 'pagada'
    if (p.porSiniestro) return 'pagada_por_siniestro'
    if (p.sinImporte) return 'sin_importe'
  }
  if (p.ultimoPago !== null) return 'pago_parcial'
  if (p.acuse === 'aprobacion' || p.acuse === 'fecha_prometida') return 'aprobada'
  if (p.acuse === 'acuse') return 'recibida'
  return 'sin_aviso'
}

/** El pago, como lo diría una persona. Nulo si no hay nada que decir más allá de "facturada". */
export function pagoEnPalabras(o: Pick<Orden, 'facturada' | 'pago'>, formatearFecha: (f: string | null) => string, formatearPesos: (p: string | null) => string): string | null {
  const estado = pagoDeOrden(o)
  const p = o.pago
  if (estado === null || p === null) return null
  const cuando = p.ultimoPago !== null ? ` el ${formatearFecha(p.ultimoPago)}` : ''
  switch (estado) {
    case 'pagada':
      return p.falta !== null && Number(p.falta) > 0
        ? `Pagada${cuando} (quedaron ${formatearPesos(p.falta)} sin pagar)`
        : `Pagada${cuando}`
    case 'pagada_por_siniestro':
      return `Pagada${cuando} (el aviso nombra el siniestro, no la factura)`
    case 'sin_importe':
      return `Hay un aviso de pago${cuando}, pero no dice el importe`
    case 'pago_parcial':
      return p.falta !== null && p.facturasSinAviso === 0 ? `Pago parcial${cuando}: faltan ${formatearPesos(p.falta)}` : `Pago parcial${cuando}: una de sus facturas todavía no tiene aviso`
    case 'aprobada':
      return p.fechaPrometida !== null ? `Aprobada: pagan el ${formatearFecha(p.fechaPrometida)}` : 'Aprobada por la compañía, sin fecha de pago'
    case 'recibida':
      return 'La compañía acusó recibo de la factura'
    case 'sin_aviso':
      return null
  }
}

/** En orden de prioridad: lo primero que se cumple manda. A confirmar va antes que todo porque,
 *  hasta que alguien la mire, no se sabe si las demás marcas significan algo. */
export type EstadoOrden =
  | 'a_confirmar'
  | 'descartada'
  | 'cerrada'
  | 'anulada'
  | 'facturada'
  | 'vencida'
  | 'por_vencer'
  | 'vigente'

/** Con cuántos días de anticipación una orden pasa a "por vencer" (RF-1007). */
export const DIAS_DE_AVISO = 30

/** Cuántos días después de vencida una orden sin factura sigue en "para atender". Pasado eso no
 *  desaparece (RF-1013): baja al grupo plegado de vencidas sin factura. */
export const DIAS_QUE_SE_MUESTRA_VENCIDA = 30

export function estadoDeOrden(
  o: Pick<Orden, 'aConfirmar' | 'descartada' | 'cerrada' | 'anulada' | 'facturada' | 'diasParaVencer'>,
): EstadoOrden {
  if (o.aConfirmar) return 'a_confirmar'
  if (o.descartada) return 'descartada'
  if (o.cerrada) return 'cerrada'
  if (o.anulada) return 'anulada'
  if (o.facturada) return 'facturada'
  if (o.diasParaVencer < 0) return 'vencida'
  if (o.diasParaVencer <= DIAS_DE_AVISO) return 'por_vencer'
  return 'vigente'
}

export type Grupos = {
  /** Las que el robot adivinó: arriba de todo, hasta que alguien diga si son órdenes. */
  readonly paraConfirmar: readonly Orden[]
  /** Por vencer, y vencidas sin factura hace poco: lo que hay que atender hoy. */
  readonly paraAtender: readonly Orden[]
  readonly vigentes: readonly Orden[]
  /** Vencidas sin factura hace más de DIAS_QUE_SE_MUESTRA_VENCIDA. Ya no son urgentes, pero
   *  tampoco se esconden: si el trabajo no se hizo, alguien lo tiene que decir. */
  readonly vencidasViejas: readonly Orden[]
  /** Facturadas y pagadas (fase 2): plegadas, para consultar. */
  readonly pagadas: readonly Orden[]
  /** Facturadas sin pago, anuladas, cerradas y descartadas: para consultar. */
  readonly resueltas: readonly Orden[]
}

/** Reparte las órdenes en los grupos de la pantalla, sin cambiar el orden en que llegan (la base
 *  ya las manda ordenadas por monto). Ninguna se queda afuera: cada orden cae en un grupo. */
export function agruparOrdenes(ordenes: readonly Orden[]): Grupos {
  const paraConfirmar: Orden[] = []
  const paraAtender: Orden[] = []
  const vigentes: Orden[] = []
  const vencidasViejas: Orden[] = []
  const pagadas: Orden[] = []
  const resueltas: Orden[] = []
  for (const o of ordenes) {
    switch (estadoDeOrden(o)) {
      case 'a_confirmar':
        paraConfirmar.push(o)
        break
      case 'facturada': {
        const pago = pagoDeOrden(o)
        if (pago === 'pagada' || pago === 'pagada_por_siniestro') pagadas.push(o)
        else resueltas.push(o)
        break
      }
      case 'descartada':
      case 'cerrada':
      case 'anulada':
        resueltas.push(o)
        break
      case 'vigente':
        vigentes.push(o)
        break
      case 'por_vencer':
        paraAtender.push(o)
        break
      case 'vencida':
        if (o.diasParaVencer >= -DIAS_QUE_SE_MUESTRA_VENCIDA) paraAtender.push(o)
        else vencidasViejas.push(o)
        break
    }
  }
  return { paraConfirmar, paraAtender, vigentes, vencidasViejas, pagadas, resueltas }
}

/** Cómo se resolvió una orden. Nula en las que todavía no se resolvieron (las que siguen corriendo
 *  y las a confirmar), donde lo que importa es cuánto les falta (vencimientoEnPalabras). */
export function situacionEnPalabras(
  o: Pick<Orden, 'aConfirmar' | 'descartada' | 'cerrada' | 'cerradaMotivo' | 'anulada' | 'anuladaPorMail' | 'facturada' | 'diasParaVencer'>,
): string | null {
  switch (estadoDeOrden(o)) {
    case 'descartada':
      return 'No era una orden'
    case 'cerrada':
      return o.cerradaMotivo ?? 'No se hizo'
    case 'anulada':
      return o.anuladaPorMail ? 'Anulada por la compañía (lo leyó el robot del mail)' : 'Anulada por la compañía'
    case 'facturada':
      return 'Facturada'
    case 'a_confirmar':
    case 'vencida':
    case 'por_vencer':
    case 'vigente':
      return null
  }
}

/** "siniestro 900000000001", o "sin número de siniestro" en una a confirmar que el robot no pudo leer. */
export function siniestroEnPalabras(siniestro: string | null): string {
  return siniestro === null ? 'sin número de siniestro' : `siniestro ${siniestro}`
}

/** El número que tipea la persona al confirmar una orden que llegó sin él: sin los espacios de las
 *  puntas, igual que lo guarda el robot (si no, una anulación que llega después con el mismo número no
 *  la encontraría). Nulo si no escribió nada: "Es una orden" no se habilita. No se toca nada más: un
 *  número de siniestro no tiene un formato único entre compañías. */
export function siniestroTipeado(texto: string): string | null {
  const limpio = texto.trim()
  return limpio === '' ? null : limpio
}

/** "vence hoy", "vence en 12 días", "venció hace 3 días". */
export function vencimientoEnPalabras(diasParaVencer: number): string {
  if (diasParaVencer === 0) return 'vence hoy'
  if (diasParaVencer === 1) return 'vence mañana'
  if (diasParaVencer > 1) return `vence en ${diasParaVencer} días`
  if (diasParaVencer === -1) return 'venció ayer'
  return `venció hace ${-diasParaVencer} días`
}

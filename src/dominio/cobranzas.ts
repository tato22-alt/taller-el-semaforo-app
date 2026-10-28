/* Cobranzas (fase 3 de la spec 005 de semaforo-base): cuánto me deben, quién, desde cuándo, y qué hago
 * hoy para cobrarlo.
 *
 * La base deriva el estado de cada factura y suma por compañía (vw_cobranza_factura, vw_cobranzas). Acá
 * no se suma nada: se decide cómo se llama cada estado, en qué orden se miran las compañías, qué hacer
 * con cada una, y el texto del reclamo, que arma la app y manda una persona (R1). */

/** Los estados de una factura, en el orden en que hay que mirarlos. */
export const ESTADOS = ['a_reclamar', 'en_curso', 'aprobada', 'pago_no_visible', 'sin_evidencia', 'pagada_sin_importe', 'cobrada', 'anulada'] as const
export type EstadoFactura = (typeof ESTADOS)[number]

export function esEstado(x: string): x is EstadoFactura {
  return (ESTADOS as readonly string[]).includes(x)
}

const NOMBRES: Record<EstadoFactura, string> = {
  a_reclamar: 'A reclamar',
  en_curso: 'En plazo',
  aprobada: 'Aprobada, con fecha de pago',
  pago_no_visible: 'No se ve el pago',
  sin_evidencia: 'Sin señal de envío',
  pagada_sin_importe: 'Pagada, sin importe',
  cobrada: 'Cobrada',
  anulada: 'Anulada',
}

const EXPLICACIONES: Record<EstadoFactura, string> = {
  a_reclamar: 'Venció, y la compañía avisa sus pagos por mail: si no avisó éste, no pagó.',
  en_curso: 'Se mandó y todavía está en plazo.',
  aprobada: 'La compañía la aprobó o dijo una fecha de pago, y la fecha no pasó.',
  pago_no_visible: 'Venció, pero la compañía no avisa sus pagos por mail: puede estar pagada. Se confirma en su portal o con Mis Retenciones de ARCA.',
  sin_evidencia: 'Nada dice que se mandó: ni el mail del envío, ni un acuse, ni un pago. ¿Se mandó?',
  pagada_sin_importe: 'Un aviso dice que la pagaron, pero no cuánto.',
  cobrada: 'Lo que dicen los avisos de pago cubre la factura.',
  anulada: 'Una nota de crédito la cubre.',
}

export function estadoEnPalabras(e: EstadoFactura): string {
  return NOMBRES[e]
}

export function explicacionDe(e: EstadoFactura): string {
  return EXPLICACIONES[e]
}

/** Los estados que son plata que alguien debe. */
export function esDeuda(e: EstadoFactura): boolean {
  return e === 'a_reclamar' || e === 'en_curso' || e === 'aprobada'
}

export type Tramo = 'hasta_60' | 'de_61_a_120' | 'de_4_a_12_meses' | 'mas_de_un_anio'
export const TRAMOS: readonly Tramo[] = ['hasta_60', 'de_61_a_120', 'de_4_a_12_meses', 'mas_de_un_anio']

const TRAMOS_EN_PALABRAS: Record<Tramo, string> = {
  hasta_60: 'hasta 60 días',
  de_61_a_120: '61 a 120 días',
  de_4_a_12_meses: '4 a 12 meses',
  mas_de_un_anio: 'más de un año',
}

export function tramoEnPalabras(t: Tramo): string {
  return TRAMOS_EN_PALABRAS[t]
}

export function esTramo(x: string): x is Tramo {
  return (TRAMOS as readonly string[]).includes(x)
}

/** Una fila de vw_cobranzas. Los importes, como texto: llegan así de la base y así se muestran. */
export type FilaCobranzas = {
  readonly fila: 'compania' | 'sin_ficha' | 'total'
  readonly cuit: string | null
  readonly compania: string
  readonly facturas: number
  readonly facturado: string
  readonly cobrado: string
  readonly anulado: string
  readonly deuda: string
  readonly aReclamar: string
  readonly enCurso: string
  readonly aprobada: string
  readonly pagadaSinImporte: string
  readonly pagoNoVisible: string
  readonly sinEvidencia: string
  readonly deudaPorTramo: Readonly<Record<Tramo, string>>
  readonly facturasAReclamar: number
  readonly facturasDeuda: number
  readonly facturasPagoNoVisible: number
  readonly facturasSinEvidencia: number
  readonly avisaPagos: boolean
  readonly aReclamarDesde: string | null
  readonly plazoDias: number | null
  readonly plazoOrigen: 'declarado' | 'observado' | 'supuesto' | null
}

/** Una factura de vw_cobranza_factura. */
export type FacturaCobranza = {
  readonly id: number
  readonly puntoVenta: number
  readonly numero: number
  readonly fecha: string
  readonly total: string
  readonly cobrado: string
  readonly anulado: string
  readonly saldo: string
  readonly estado: EstadoFactura
  readonly dias: number
  readonly tramo: Tramo
  readonly envioVisto: boolean
  readonly mailEnvio: string | null
  readonly vence: string | null
  readonly diasVencida: number | null
  readonly fechaPrometida: string | null
  readonly ultimoPago: string | null
  readonly siniestros: string | null
}

/** "1234.56" → 123456n: los centavos como entero, para comparar sin pasar por float. */
export function centavos(importe: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(importe.trim())
  if (!m) return 0n
  const valor = BigInt(m[2] ?? '0') * 100n + BigInt(((m[3] ?? '') + '00').slice(0, 2))
  return m[1] === '-' ? -valor : valor
}

export function hayPlata(importe: string): boolean {
  return centavos(importe) !== 0n
}

/** Las compañías en el orden en que hay que mirarlas: primero lo que hay que reclamar, después lo que
 *  está en plazo, después lo que no se ve. Las que no tienen nada abierto, al final. */
export function ordenarCompanias(filas: readonly FilaCobranzas[]): FilaCobranzas[] {
  const clave = (f: FilaCobranzas): readonly bigint[] => [centavos(f.aReclamar), centavos(f.deuda), centavos(f.pagoNoVisible), centavos(f.sinEvidencia)]
  return [...filas].sort((a, b) => {
    const ka = clave(a)
    const kb = clave(b)
    for (let i = 0; i < ka.length; i++) {
      const x = ka[i] ?? 0n
      const y = kb[i] ?? 0n
      if (x !== y) return x > y ? -1 : 1
    }
    return a.compania.localeCompare(b.compania)
  })
}

/** ¿Le queda algo abierto? Cobrado y anulado no cuentan. */
export function tieneAlgoAbierto(f: FilaCobranzas): boolean {
  return [f.deuda, f.pagoNoVisible, f.sinEvidencia, f.pagadaSinImporte].some(hayPlata)
}

/** Las facturas de una compañía, por estado y, dentro de cada uno, la más vieja primero. */
export function ordenarFacturas(facturas: readonly FacturaCobranza[]): FacturaCobranza[] {
  return [...facturas].sort((a, b) => ESTADOS.indexOf(a.estado) - ESTADOS.indexOf(b.estado) || a.fecha.localeCompare(b.fecha) || a.numero - b.numero)
}

/** Qué plazo se usa para decir que una factura venció, y de dónde sale. */
export function plazoEnPalabras(dias: number | null, origen: FilaCobranzas['plazoOrigen']): string {
  if (dias === null || origen === null) return ''
  if (origen === 'declarado') return `Plazo de la ficha: ${dias} días.`
  if (origen === 'observado') return `Suele pagar en unos ${Math.round(dias / 2)} días: se reclama a los ${dias}.`
  return `Plazo supuesto: ${dias} días (no hay pagos suyos con importe para medirlo).`
}

/** Lo que hay que hacer hoy con una compañía, en el orden en que conviene hacerlo. */
export function queHacer(f: FilaCobranzas): string[] {
  const tareas: string[] = []
  if (f.facturasAReclamar > 0) tareas.push(f.facturasAReclamar === 1 ? 'Reclamar 1 factura.' : `Reclamar ${f.facturasAReclamar} facturas.`)
  if (f.facturasPagoNoVisible > 0) {
    tareas.push(`${f.facturasPagoNoVisible === 1 ? '1 factura vencida' : `${f.facturasPagoNoVisible} facturas vencidas`} sin ver el pago: esta compañía no avisa sus pagos por mail. Confirmalo en su portal.`)
  }
  if (f.facturasSinEvidencia > 0) {
    tareas.push(`${f.facturasSinEvidencia === 1 ? '1 factura' : `${f.facturasSinEvidencia} facturas`} sin señal de envío: ¿se mandaron?`)
  }
  if (hayPlata(f.aprobada)) tareas.push('Aprobada con fecha de pago: esperar esa fecha.')
  return tareas
}

/** "0002-00003285". */
export function numeroDeFactura(f: Pick<FacturaCobranza, 'puntoVenta' | 'numero'>): string {
  return `${String(f.puntoVenta).padStart(4, '0')}-${String(f.numero).padStart(8, '0')}`
}

/** El saludo según la hora, como escribe el taller: hasta el mediodía, "Buenos días". */
export function saludo(hora: number): string {
  return hora < 13 ? 'Buenos días' : 'Buenas tardes'
}

/** El texto del reclamo de una compañía, con sus facturas a reclamar. Lo copia y lo manda una persona
 *  (R1). Las fechas y los importes los formatea quien llama (dominio/fechas.ts, dominio/dinero.ts). */
export function textoDelReclamo(
  facturas: readonly FacturaCobranza[],
  formato: { readonly pesos: (importe: string) => string; readonly fecha: (fecha: string) => string; readonly hora: number },
): string {
  const aReclamar = facturas.filter((f) => f.estado === 'a_reclamar')
  const renglones = aReclamar.map((f) => {
    const siniestro = f.siniestros === null ? '' : `, siniestro ${f.siniestros}`
    const parcial = hayPlata(f.cobrado) ? ` (de ${formato.pesos(f.total)}, pagaron ${formato.pesos(f.cobrado)})` : ''
    return `- Factura ${numeroDeFactura(f)} del ${formato.fecha(f.fecha)}${siniestro}: ${formato.pesos(f.saldo)}${parcial}`
  })
  const una = aReclamar.length === 1
  return [
    `${saludo(formato.hora)}, les escribimos de Taller El Semáforo. Según nuestros registros, ${una ? 'esta factura sigue pendiente' : 'estas facturas siguen pendientes'} de pago:`,
    '',
    ...renglones,
    '',
    `¿Nos podrían confirmar ${una ? 'su estado y la fecha de pago' : 'su estado y las fechas de pago'}? Si ya ${una ? 'está pagada' : 'están pagadas'}, les pedimos el comprobante.`,
    '',
    'Muchas gracias.',
  ].join('\n')
}

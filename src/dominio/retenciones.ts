/* Retenciones (spec 014 de semaforo-base): cómo se nombran y cómo se le pasan al contador.
 *
 * La base arma el libro (vw_libro_retenciones: una fila por retención, sin contar dos veces un
 * certificado) y suma cada mes (vw_retenciones_mes). Acá no se suma nada: se decide cómo se llama cada
 * impuesto, qué se dice cuando el aviso no trae el número de certificado, y cómo se escribe la planilla
 * del mes para que el contador la abra en Excel tal cual. */

export const IMPUESTOS = ['iva', 'ganancias', 'iibb', 'suss', 'otro'] as const
export type Impuesto = (typeof IMPUESTOS)[number]

export function esImpuesto(x: string): x is Impuesto {
  return (IMPUESTOS as readonly string[]).includes(x)
}

/** Una retención del libro. Los importes, como texto: llegan así de la base y así se muestran. */
export type Retencion = {
  readonly idRetencion: number
  readonly gmailMessageId: string
  readonly cuit: string | null
  readonly compania: string | null
  readonly fecha: string
  readonly mes: string
  readonly impuesto: Impuesto
  readonly concepto: string
  readonly certificado: string | null
  readonly importe: string
  readonly op: string | null
  readonly facturas: readonly number[]
  readonly siniestros: readonly string[]
}

/** Lo retenido en un mes, como lo suma la base. */
export type MesDeRetenciones = {
  readonly mes: string
  readonly total: string
  readonly porImpuesto: Readonly<Record<Impuesto, string>>
  readonly retenciones: number
  readonly sinCertificado: number
  readonly companias: number
}

const NOMBRES: Record<Impuesto, string> = {
  iva: 'IVA',
  ganancias: 'Ganancias',
  iibb: 'Ingresos Brutos',
  suss: 'SUSS',
  otro: 'Otro',
}

export function impuestoEnPalabras(i: Impuesto): string {
  return NOMBRES[i]
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "2026-10-01" → "octubre de 2026". Si no tiene forma de fecha, la devuelve como vino. */
export function mesEnPalabras(mes: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(mes)
  const nombre = m ? MESES[Number(m[2]) - 1] : undefined
  return m && nombre ? `${nombre} de ${m[1]}` : mes
}

/** Qué decir del certificado. Sin número no quiere decir que se perdió: hay compañías (Sancor) cuyo
 *  aviso trae sólo una constancia, y el certificado lo emite ARCA (IVA, Ganancias, SUSS) o ARBA. */
export function certificadoEnPalabras(r: Pick<Retencion, 'certificado'>): string {
  return r.certificado ?? 'El aviso no trae el número'
}

/** Las facturas (o los siniestros) que pagó la orden de esa retención: "3571, 3572" · "siniestro 123". */
export function queFacturasPago(r: Pick<Retencion, 'facturas' | 'siniestros'>): string {
  const partes = [...r.facturas.map(String), ...r.siniestros.map((s) => `siniestro ${s}`)]
  return partes.length === 0 ? '—' : partes.join(', ')
}

/** "1234.5" → "1234,50": la coma decimal que espera el Excel en castellano, sin separador de miles
 *  (con miles, Excel puede leer el número como texto). Sin pasar por float. */
export function importeParaPlanilla(importe: string): string {
  const m = /^(-?\d+)(?:\.(\d+))?$/.exec(importe.trim())
  if (!m) return importe
  return `${m[1]},${(m[2] ?? '').padEnd(2, '0').slice(0, 2)}`
}

/** Una celda: entre comillas si trae punto y coma, comillas o un salto de renglón. */
function celda(texto: string): string {
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

/** "2026-10-15" → "15/10/2026". */
function fechaParaPlanilla(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha
}

export const COLUMNAS_PLANILLA = ['Fecha', 'Compañía', 'CUIT', 'Impuesto', 'Concepto', 'Certificado', 'Importe', 'Orden de pago', 'Facturas'] as const

/** La planilla del mes para el contador (RF-1407): un CSV que Excel abre solo, con punto y coma, coma
 *  decimal y la marca de UTF-8 al principio para que respete las tildes. Una fila por retención, en el
 *  orden en que vienen. */
export function planillaDelMes(retenciones: readonly Retencion[]): string {
  const filas = retenciones.map((r) => [
    fechaParaPlanilla(r.fecha),
    r.compania ?? '',
    r.cuit ?? '',
    impuestoEnPalabras(r.impuesto),
    r.concepto,
    r.certificado ?? '',
    importeParaPlanilla(r.importe),
    r.op ?? '',
    queFacturasPago(r) === '—' ? '' : queFacturasPago(r),
  ])
  return '﻿' + [[...COLUMNAS_PLANILLA], ...filas].map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n'
}

/** "2026-10-01" → "retenciones-2026-10.csv". */
export function nombreDePlanilla(mes: string): string {
  return `retenciones-${mes.slice(0, 7)}.csv`
}

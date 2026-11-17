/* La plata del taller (spec 013 de semaforo-base): el mes, las compras y la planilla del contador.
 *
 * La base entrega los montos ya sumados (vw_plata_mes, vw_compras_mes, vw_te_deben). Acá no se suma
 * nada: se decide cómo se llama cada rubro, en qué orden se muestran las compras y cómo se escribe
 * la planilla del mes. Los importes van como texto, igual que llegan de la base; cuando hace falta
 * comparar dos, se comparan en centavos enteros, nunca con un float. */

export const RUBROS = ['repuestos', 'pintura', 'herramientas', 'servicios', 'alquiler', 'seguros', 'combustible', 'otros'] as const
export type Rubro = (typeof RUBROS)[number]

/** Como llama la base a los proveedores que todavía no tienen rubro. */
export const SIN_RUBRO = 'sin_rubro'

export function esRubro(x: string | null): x is Rubro {
  return x !== null && (RUBROS as readonly string[]).includes(x)
}

const NOMBRES_DE_RUBRO: Record<Rubro, string> = {
  repuestos: 'Repuestos',
  pintura: 'Pintura e insumos',
  herramientas: 'Herramientas y equipos',
  servicios: 'Servicios (luz, gas, teléfono, internet)',
  alquiler: 'Alquiler',
  seguros: 'Seguros',
  combustible: 'Combustible',
  otros: 'Otros',
}

/** El rubro como se lee en la pantalla. Lo que no es un rubro de la lista es "Sin rubro". */
export function rubroEnPalabras(rubro: string | null): string {
  return esRubro(rubro) ? NOMBRES_DE_RUBRO[rubro] : 'Sin rubro'
}

/** Un mes, como lo suma la base. */
export type MesDePlata = {
  readonly mes: string
  readonly facturado: string
  readonly cobradoCompanias: string
  /** Facturas con aviso de pago que no dice cuánto: se cobraron, pero no se sabe el importe. */
  readonly pagadoSinImporte: string
  readonly cobradoParticulares: string
  readonly comprado: string
  readonly ivaVentas: string
  readonly ivaCompras: string
  readonly retencionesIva: string
  readonly retenciones: string
  readonly ivaEstimado: string
  readonly comprobantesVentas: number
  readonly comprobantesCompras: number
}

/** Una fila de las compras del mes: el total, un rubro o un proveedor. */
export type FilaDeCompras = {
  readonly fila: 'mes' | 'rubro' | 'proveedor'
  readonly rubro: string | null
  readonly cuit: string | null
  readonly proveedor: string | null
  readonly comprado: string
  readonly comprobantes: number
  readonly mesAnterior: string
  readonly enElAnio: string
}

export type Proveedor = { readonly cuit: string; readonly nombre: string; readonly rubro: Rubro | null }

/** Cuánto deben hoy las compañías o los particulares. */
export type TeDeben = {
  readonly quien: 'companias' | 'particulares'
  readonly monto: string
  readonly cuantas: number
  readonly desde: string | null
}

/** Un renglón del libro de ventas o del de compras, para la planilla. */
export type Comprobante = {
  readonly fecha: string
  readonly tipo: string
  readonly puntoVenta: number
  readonly numero: number
  readonly cuit: string | null
  readonly nombre: string | null
  readonly rubro: string | null
  readonly netoGravado: string
  readonly iva: string
  readonly total: string
}

/** Una retención, ya con el impuesto en palabras. */
export type RetencionDelMes = {
  readonly fecha: string
  readonly compania: string | null
  readonly cuit: string | null
  readonly impuesto: string
  readonly certificado: string | null
  readonly importe: string
}

/** "1234.5" → 123450n. Nulo si no tiene forma de importe. Sin pasar por float. */
export function enCentavos(importe: string): bigint | null {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(importe.trim())
  if (!m) return null
  const centavos = BigInt(m[2] ?? '0') * 100n + BigInt((m[3] ?? '').padEnd(2, '0').slice(0, 2))
  return m[1] === '-' ? -centavos : centavos
}

/** -1, 0 o 1, como un comparador de sort. Un importe que no se entiende vale cero. */
export function compararImportes(a: string, b: string): -1 | 0 | 1 {
  const x = enCentavos(a) ?? 0n
  const y = enCentavos(b) ?? 0n
  return x < y ? -1 : x > y ? 1 : 0
}

export function esCero(importe: string): boolean {
  return (enCentavos(importe) ?? 0n) === 0n
}

/** Cómo viene lo comprado contra el mes anterior (RF-1312). La app no calcula la diferencia: dice
 *  para qué lado fue, y la pantalla muestra los dos importes. */
export type Cambio = 'mas' | 'menos' | 'igual' | 'nuevo'

export function cambioContraElMesAnterior(f: Pick<FilaDeCompras, 'comprado' | 'mesAnterior'>): Cambio {
  if (esCero(f.mesAnterior)) return esCero(f.comprado) ? 'igual' : 'nuevo'
  const c = compararImportes(f.comprado, f.mesAnterior)
  return c > 0 ? 'mas' : c < 0 ? 'menos' : 'igual'
}

export function cambioEnPalabras(c: Cambio): string {
  switch (c) {
    case 'mas':
      return 'más que el mes anterior'
    case 'menos':
      return 'menos que el mes anterior'
    case 'igual':
      return 'igual que el mes anterior'
    case 'nuevo':
      return 'el mes anterior no hubo'
  }
}

export type ComprasDelMes = {
  readonly total: FilaDeCompras | null
  /** Cada rubro con sus proveedores, de más comprado a menos. */
  readonly rubros: readonly { readonly rubro: FilaDeCompras; readonly proveedores: readonly FilaDeCompras[] }[]
}

/** Ordena las filas del mes: el total, y cada rubro con sus proveedores, de más a menos (RF-1312). */
export function armarCompras(filas: readonly FilaDeCompras[]): ComprasDelMes {
  const deMasAMenos = (x: FilaDeCompras, y: FilaDeCompras) => compararImportes(y.comprado, x.comprado)
  const rubros = filas.filter((f) => f.fila === 'rubro').sort(deMasAMenos)
  return {
    total: filas.find((f) => f.fila === 'mes') ?? null,
    rubros: rubros.map((rubro) => ({
      rubro,
      proveedores: filas.filter((f) => f.fila === 'proveedor' && f.rubro === rubro.rubro).sort(deMasAMenos),
    })),
  }
}

/** El mes que se muestra al abrir: el de hoy si ya tiene algo; si no, el más reciente. */
export function mesParaAbrir(meses: readonly Pick<MesDePlata, 'mes'>[], hoy: string): string | null {
  const esteMes = `${hoy.slice(0, 7)}-01`
  return meses.some((m) => m.mes === esteMes) ? esteMes : (meses[0]?.mes ?? null)
}

/* ── La planilla del mes para el contador (RF-1313) ─────────────────────────────────────────────
 * Un solo CSV que Excel abre tal cual (punto y coma, coma decimal, marca de UTF-8), con tres partes:
 * ventas, compras y retenciones, cada una con sus comprobantes. Las funciones de formato son las
 * mismas de dominio/retenciones.ts, repetidas acá porque dominio/ no importa de dominio/. */

function importeParaPlanilla(importe: string): string {
  const m = /^(-?\d+)(?:\.(\d+))?$/.exec(importe.trim())
  if (!m) return importe
  return `${m[1]},${(m[2] ?? '').padEnd(2, '0').slice(0, 2)}`
}

function celda(texto: string): string {
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

function fechaParaPlanilla(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha
}

function numeroDeComprobante(c: Pick<Comprobante, 'puntoVenta' | 'numero'>): string {
  return `${String(c.puntoVenta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`
}

export function planillaDelMes(
  ventas: readonly Comprobante[],
  compras: readonly Comprobante[],
  retenciones: readonly RetencionDelMes[],
): string {
  const comprobante = (c: Comprobante, conRubro: boolean): string[] => [
    fechaParaPlanilla(c.fecha),
    c.tipo,
    numeroDeComprobante(c),
    c.nombre ?? '',
    c.cuit ?? '',
    ...(conRubro ? [rubroEnPalabras(c.rubro)] : []),
    importeParaPlanilla(c.netoGravado),
    importeParaPlanilla(c.iva),
    importeParaPlanilla(c.total),
  ]
  const renglones: string[][] = [
    ['VENTAS'],
    ['Fecha', 'Tipo', 'Número', 'Cliente', 'CUIT', 'Neto gravado', 'IVA', 'Total'],
    ...ventas.map((v) => comprobante(v, false)),
    [],
    ['COMPRAS'],
    ['Fecha', 'Tipo', 'Número', 'Proveedor', 'CUIT', 'Rubro', 'Neto gravado', 'IVA', 'Total'],
    ...compras.map((c) => comprobante(c, true)),
    [],
    ['RETENCIONES'],
    ['Fecha', 'Compañía', 'CUIT', 'Impuesto', 'Certificado', 'Importe'],
    ...retenciones.map((r) => [fechaParaPlanilla(r.fecha), r.compania ?? '', r.cuit ?? '', r.impuesto, r.certificado ?? '', importeParaPlanilla(r.importe)]),
  ]
  return '﻿' + renglones.map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n'
}

/** "2026-10-01" → "el-semaforo-2026-10.csv". */
export function nombreDePlanilla(mes: string): string {
  return `el-semaforo-${mes.slice(0, 7)}.csv`
}

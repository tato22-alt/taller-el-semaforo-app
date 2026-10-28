/* Cobranzas (fase 3 de la spec 005 de semaforo-base). Sólo lectura: el estado de cada factura y lo que
 * debe cada compañía los deriva la base (vw_cobranza_factura, vw_cobranzas), y nadie carga nada. */

import { esEstado, esTramo, type FacturaCobranza, type FilaCobranzas } from '../dominio/cobranzas'
import { bien, mal, type Resultado } from '../dominio/resultado'
import { TODAVIA_NO } from './avisos'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import { clasificar } from './respuesta'
import { sesionActual } from './sesion'

export { TODAVIA_NO }

/** Lo que devuelven las consultas, con los NUMERIC como texto (el porqué está en filas.ts). */
type FilaResumen = {
  fila: string; cuit: string | null; compania: string; facturas: number
  facturado: string; cobrado: string; anulado: string; deuda: string; a_reclamar: string; en_curso: string; aprobada: string
  pagada_sin_importe: string; pago_no_visible: string; sin_evidencia: string
  deuda_hasta_60: string; deuda_de_61_a_120: string; deuda_de_4_a_12_meses: string; deuda_mas_de_un_anio: string
  facturas_a_reclamar: number; facturas_deuda: number; facturas_pago_no_visible: number; facturas_sin_evidencia: number
  avisa_pagos: boolean | null; a_reclamar_desde: string | null; plazo_dias: number | null; plazo_origen: string | null
}
type FilaFactura = {
  id_comprobante: number; punto_venta: number; numero: number; fecha_emision: string; total: string; cobrado: string; anulado: string
  saldo: string; estado: string; dias: number; tramo: string; envio_visto: boolean; mail_envio: string | null; vence: string | null
  dias_vencida: number | null; fecha_prometida: string | null; ultimo_pago: string | null; siniestros: string | null
}

const COLUMNAS_RESUMEN = 'fila, cuit, compania, facturas, facturado, cobrado, anulado, deuda, a_reclamar, en_curso, aprobada, ' +
  'pagada_sin_importe, pago_no_visible, sin_evidencia, deuda_hasta_60, deuda_de_61_a_120, deuda_de_4_a_12_meses, deuda_mas_de_un_anio, ' +
  'facturas_a_reclamar, facturas_deuda, facturas_pago_no_visible, facturas_sin_evidencia, avisa_pagos, a_reclamar_desde, plazo_dias, plazo_origen'
const COLUMNAS_FACTURA = 'id_comprobante, punto_venta, numero, fecha_emision, total, cobrado, anulado, saldo, estado, dias, tramo, ' +
  'envio_visto, mail_envio, vence, dias_vencida, fecha_prometida, ultimo_pago, siniestros'

/** Códigos con los que PostgREST dice que la vista no existe: la app puede estar publicada antes de que se
 *  aplique la migración de cobranzas, y no por eso tiene que mostrar un error. */
const SIN_COBRANZAS = new Set(['42P01', 'PGRST205'])

/** Lo que debe cada compañía, las facturas sin ficha y el total, como lo suma la base. */
export async function leerCobranzas(base: ClienteBase | null = null): Promise<Resultado<readonly FilaCobranzas[] | typeof TODAVIA_NO>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('vw_cobranzas').select(COLUMNAS_RESUMEN)
  if (r.error !== null) return r.error.code !== undefined && SIN_COBRANZAS.has(r.error.code) ? bien(TODAVIA_NO) : mal(clasificar(r.error))
  return bien((r.data as unknown as FilaResumen[]).map((f) => ({
    fila: f.fila === 'total' || f.fila === 'sin_ficha' ? f.fila : 'compania',
    cuit: f.cuit,
    compania: f.compania,
    facturas: f.facturas,
    facturado: String(f.facturado),
    cobrado: String(f.cobrado),
    anulado: String(f.anulado),
    deuda: String(f.deuda),
    aReclamar: String(f.a_reclamar),
    enCurso: String(f.en_curso),
    aprobada: String(f.aprobada),
    pagadaSinImporte: String(f.pagada_sin_importe),
    pagoNoVisible: String(f.pago_no_visible),
    sinEvidencia: String(f.sin_evidencia),
    deudaPorTramo: {
      hasta_60: String(f.deuda_hasta_60),
      de_61_a_120: String(f.deuda_de_61_a_120),
      de_4_a_12_meses: String(f.deuda_de_4_a_12_meses),
      mas_de_un_anio: String(f.deuda_mas_de_un_anio),
    },
    facturasAReclamar: f.facturas_a_reclamar,
    facturasDeuda: f.facturas_deuda,
    facturasPagoNoVisible: f.facturas_pago_no_visible,
    facturasSinEvidencia: f.facturas_sin_evidencia,
    avisaPagos: f.avisa_pagos === true,
    aReclamarDesde: f.a_reclamar_desde,
    plazoDias: f.plazo_dias,
    plazoOrigen: f.plazo_origen === 'declarado' || f.plazo_origen === 'observado' || f.plazo_origen === 'supuesto' ? f.plazo_origen : null,
  })))
}

/** Las facturas de una compañía (por su CUIT), o las de quien no tiene ficha (cuit nulo). */
export async function leerFacturasDe(cuit: string | null, base: ClienteBase | null = null): Promise<Resultado<readonly FacturaCobranza[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const consulta = cliente.dato.from('vw_cobranza_factura').select(COLUMNAS_FACTURA)
  const r = await (cuit === null ? consulta.eq('con_ficha', false) : consulta.eq('cuit_receptor', cuit).eq('con_ficha', true))
    .order('fecha_emision')
  if (r.error !== null) return mal(clasificar(r.error))
  return bien((r.data as unknown as FilaFactura[]).flatMap((f) => (esEstado(f.estado) && esTramo(f.tramo) ? [{
    id: f.id_comprobante,
    puntoVenta: f.punto_venta,
    numero: f.numero,
    fecha: f.fecha_emision,
    total: String(f.total),
    cobrado: String(f.cobrado),
    anulado: String(f.anulado),
    saldo: String(f.saldo),
    estado: f.estado,
    dias: f.dias,
    tramo: f.tramo,
    envioVisto: f.envio_visto,
    mailEnvio: f.mail_envio,
    vence: f.vence,
    diasVencida: f.dias_vencida,
    fechaPrometida: f.fecha_prometida,
    ultimoPago: f.ultimo_pago,
    siniestros: f.siniestros,
  }] : [])))
}

/** El cliente, sólo si hay sesión: sin sesión, RLS no da error, devuelve vacío. */
async function clienteConSesion(base: ClienteBase | null): Promise<Resultado<ClienteBase>> {
  const cliente = base === null ? obtenerCliente() : bien(base)
  if (!cliente.ok) return cliente
  const sesion = await sesionActual(cliente.dato)
  if (!sesion.ok) return mal(sesion.fallo)
  if (sesion.dato === null) return mal({ tipo: 'sin_sesion' })
  return cliente
}

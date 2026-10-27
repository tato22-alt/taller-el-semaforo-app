/* El libro de retenciones (spec 014 de semaforo-base). Sólo lectura: el libro lo arma la base con lo que
 * subió el robot, y nadie carga nada.
 *
 * vw_retenciones_mes trae lo retenido cada mes, ya sumado; vw_libro_retenciones, cada retención. */

import { esImpuesto, type MesDeRetenciones, type Retencion } from '../dominio/retenciones'
import { bien, mal, type Resultado } from '../dominio/resultado'
import { TODAVIA_NO } from './avisos'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import { clasificar } from './respuesta'
import { sesionActual } from './sesion'

export { TODAVIA_NO }

/** Lo que devuelven las consultas, con los NUMERIC como texto (el porqué está en filas.ts). */
type FilaMes = {
  mes: string; total: string; iva: string; ganancias: string; iibb: string; suss: string; otro: string
  retenciones: number; sin_certificado: number; companias: number
}
type FilaLibro = {
  id_retencion: number; gmail_message_id: string; cuit: string | null; compania: string | null; fecha: string; mes: string
  impuesto: string; concepto: string; certificado: string | null; importe: string; op: string | null
  facturas: number[] | null; siniestros: string[] | null
}

const COLUMNAS_LIBRO = 'id_retencion, gmail_message_id, cuit, compania, fecha, mes, impuesto, concepto, certificado, importe, op, facturas, siniestros'

/** Códigos con los que PostgREST dice que la vista no existe: la app puede estar publicada antes de que
 *  se aplique la migración del libro, y no por eso tiene que mostrar un error. */
const SIN_LIBRO = new Set(['42P01', 'PGRST205'])

/** Cada mes con alguna retención, el más reciente primero. */
export async function leerMeses(base: ClienteBase | null = null): Promise<Resultado<readonly MesDeRetenciones[] | typeof TODAVIA_NO>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato
    .from('vw_retenciones_mes')
    .select('mes, total, iva, ganancias, iibb, suss, otro, retenciones, sin_certificado, companias')
    .order('mes', { ascending: false })
  if (r.error !== null) return r.error.code !== undefined && SIN_LIBRO.has(r.error.code) ? bien(TODAVIA_NO) : mal(clasificar(r.error))
  return bien((r.data as unknown as FilaMes[]).map((f) => ({
    mes: f.mes,
    total: String(f.total),
    porImpuesto: { iva: String(f.iva), ganancias: String(f.ganancias), iibb: String(f.iibb), suss: String(f.suss), otro: String(f.otro) },
    retenciones: f.retenciones,
    sinCertificado: f.sin_certificado,
    companias: f.companias,
  })))
}

/** Las retenciones de un mes ("2026-10-01"), por fecha y compañía. */
export async function leerLibro(mes: string, base: ClienteBase | null = null): Promise<Resultado<readonly Retencion[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato
    .from('vw_libro_retenciones')
    .select(COLUMNAS_LIBRO)
    .eq('mes', mes)
    .order('fecha')
    .order('compania')
    .order('id_retencion')
  if (r.error !== null) return mal(clasificar(r.error))
  return bien((r.data as unknown as FilaLibro[]).map((f) => ({
    idRetencion: f.id_retencion,
    gmailMessageId: f.gmail_message_id,
    cuit: f.cuit,
    compania: f.compania,
    fecha: f.fecha,
    mes: f.mes,
    // La base sólo admite estos cinco; si algún día suma otro, se muestra como "otro" y no se pierde.
    impuesto: esImpuesto(f.impuesto) ? f.impuesto : 'otro',
    concepto: f.concepto,
    certificado: f.certificado,
    importe: String(f.importe),
    op: f.op,
    facturas: f.facturas ?? [],
    siniestros: f.siniestros ?? [],
  })))
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

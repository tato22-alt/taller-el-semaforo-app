/* La factura de cada orden. Spec 012 de semaforo-base.
 *
 * La base vincula sola la factura que se mandó por mail con su siniestro (RF-1201). Lo que no puede
 * decidir sola lo propone (vw_orden_factura_propuesta), y una persona confirma con un toque
 * (RF-1203). Un vínculo equivocado no se borra: se deshace, y queda quién y cuándo (RF-1204). */

import { bien, mal, type Resultado } from '../dominio/resultado'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import { clasificar } from './respuesta'
import { sesionActual } from './sesion'

/** Una factura que puede ser la de la orden. motivo 'mail': un mail la mandó con ese siniestro (la
 *  más probable); 'misma_compania': de la misma compañía, emitida después de la orden y libre. */
export type FacturaPropuesta = {
  readonly idComprobante: number
  readonly puntoVenta: number
  readonly numero: number
  readonly fecha: string
  /** NUMERIC: llega como texto. */
  readonly total: string
  readonly porMail: boolean
}

type FilaPropuesta = {
  id_comprobante: number; punto_venta: number; numero: number; fecha_emision: string; total: string; motivo: string
}

/** Cuántas candidatas se muestran: la primera que se pregunta y algunas más para elegir. */
const PROPUESTAS = 8

/** Las facturas que pueden ser la de una orden, la más probable primero. Vacía si no hay ninguna. */
export async function leerPropuestas(idOrden: number, base: ClienteBase | null = null): Promise<Resultado<readonly FacturaPropuesta[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato
    .from('vw_orden_factura_propuesta')
    .select('id_comprobante, punto_venta, numero, fecha_emision, total, motivo')
    .eq('id_orden', idOrden)
    .order('orden_propuesta')
    .limit(PROPUESTAS)
  if (r.error !== null) return mal(clasificar(r.error))
  return bien((r.data as unknown as FilaPropuesta[]).map((f) => ({
    idComprobante: f.id_comprobante,
    puntoVenta: f.punto_venta,
    numero: f.numero,
    fecha: f.fecha_emision,
    total: String(f.total),
    porMail: f.motivo === 'mail',
  })))
}

/** "Es ésta": la factura cobra la orden. Queda quién la vinculó (lo pone la base). */
export async function vincularFactura(idOrden: number, idComprobante: number, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('orden_factura').insert({ id_orden: idOrden, id_comprobante: idComprobante, origen: 'persona' })
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** "No es ésta": deshace los vínculos vigentes de la orden. No borra: anota cuándo, y la base anota
 *  quién. La base no vuelve a vincular sola lo que una persona deshizo. */
export async function desvincularFacturas(idOrden: number, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato
    .from('orden_factura')
    .update({ deshecho_en: new Date().toISOString() })
    .eq('id_orden', idOrden)
    .is('deshecho_en', null)
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** Después de subir el CSV de ARCA: los mails de factura que esperaban su factura se vuelven a
 *  mirar. Devuelve cuántas órdenes quedaron vinculadas. */
export async function revincularEnvios(base: ClienteBase | null = null): Promise<Resultado<number>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.rpc('fn_revincular_envios')
  if (r.error !== null) return mal(clasificar(r.error))
  return bien(Number(r.data))
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

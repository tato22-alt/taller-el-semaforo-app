/* Órdenes de trabajo: leer de la vista, cargar a mano, anular y borrar. Spec 010 de semaforo-base.
 *
 * Se lee de vw_ordenes_trabajo, que ya trae el vencimiento y los días que faltan: la app no
 * calcula fechas de vencimiento. Se escribe a la tabla orden_trabajo, y la RLS decide qué se puede
 * borrar (sólo una vencida sin factura); el botón de la pantalla nada más evita ofrecer lo que la
 * base va a rechazar. */

import type { Orden, OrdenNueva } from '../dominio/ordenes'
import { normalizarPatente } from '../dominio/patente'
import { bien, mal, type Resultado } from '../dominio/resultado'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import { clasificar } from './respuesta'
import { sesionActual } from './sesion'

export type Compania = { readonly cuit: string; readonly nombre: string }

/* Lo que devuelve la vista, con el monto como texto (el porqué está en filas.ts). */
type FilaOrden = {
  id_orden: number; compania: string; siniestro: string; patente: string | null
  fecha_emision: string; vence: string; dias_para_vencer: number
  monto_autorizado: string | null; perito: string | null
  anulada: boolean; id_comprobante: number | null
}

const COLUMNAS = 'id_orden, compania, siniestro, patente, fecha_emision, vence, dias_para_vencer, monto_autorizado, perito, anulada, id_comprobante'

/** Todas las órdenes, de la de mayor monto a la de menor. Las que no tienen monto, al final. */
export async function leerOrdenes(base: ClienteBase | null = null): Promise<Resultado<readonly Orden[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato
    .from('vw_ordenes_trabajo')
    .select(COLUMNAS)
    .order('monto_autorizado', { ascending: false, nullsFirst: false })
    .order('fecha_emision')
  if (r.error !== null) return mal(clasificar(r.error))
  return bien((r.data as unknown as FilaOrden[]).map(orden))
}

/** Las compañías (y la concesionaria), para elegir a quién es la orden. */
export async function leerCompanias(base: ClienteBase | null = null): Promise<Resultado<readonly Compania[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('compania').select('cuit, nombre').order('nombre')
  if (r.error !== null) return mal(clasificar(r.error))
  return bien(r.data)
}

/** Una orden que llegó por portal o por WhatsApp. Quién la cargó y cuándo los pone la base. */
export async function cargarOrden(o: OrdenNueva, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('orden_trabajo').insert({
    cuit_compania: o.cuitCompania,
    siniestro: o.siniestro,
    // La misma forma que usa la herramienta de presupuestos: así una orden y un presupuesto del
    // mismo auto se pueden cruzar por patente.
    patente: o.patente === null ? null : normalizarPatente(o.patente),
    fecha_emision: o.fechaEmision,
    // PostgREST acepta el numeric como texto: así no pasa por un float de JavaScript.
    monto_autorizado: o.montoAutorizado as unknown as number | null,
    perito: o.perito,
    origen: 'manual',
  })
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** La compañía la dejó sin efecto. No se borra: puede tener factura igual (RF-1011). */
export async function anularOrden(idOrden: number, fecha: string, motivo: string | null, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('orden_trabajo').update({ anulada_en: fecha, anulada_motivo: motivo }).eq('id_orden', idOrden)
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** Sólo una vencida sin factura. Si la base no la borró (la RLS no da error: borra cero filas),
 *  se avisa en vez de dar por hecho algo que no pasó. */
export async function borrarOrden(idOrden: number, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('orden_trabajo').delete({ count: 'exact' }).eq('id_orden', idOrden)
  if (r.error !== null) return mal(clasificar(r.error))
  if (r.count === 0) return mal({ tipo: 'base', detalle: 'La orden no se borró: sólo se borra una vencida y sin factura.' })
  return bien(null)
}

function orden(f: FilaOrden): Orden {
  return {
    id: f.id_orden,
    compania: f.compania,
    siniestro: f.siniestro,
    patente: f.patente,
    fechaEmision: f.fecha_emision,
    vence: f.vence,
    diasParaVencer: f.dias_para_vencer,
    montoAutorizado: f.monto_autorizado,
    perito: f.perito,
    anulada: f.anulada,
    facturada: f.id_comprobante !== null,
  }
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

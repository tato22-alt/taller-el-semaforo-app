/* Órdenes de trabajo: leer de la vista, confirmar, anular y cerrar. Spec 010 de semaforo-base.
 *
 * Las órdenes no se cargan desde la app: las sube el robot cuando llegan por mail (RF-1005). Las que
 * adivina del mail de una persona llegan a confirmar (RF-1014), y acá una persona dice si son o no.
 *
 * Se lee de vw_ordenes_trabajo, que ya trae el vencimiento y los días que faltan: la app no
 * calcula fechas de vencimiento. Se escribe a la tabla orden_trabajo, y nunca se borra (RF-1013): la
 * base no da el permiso, así que no hay función para pedirlo. Lo que antes se borraba ahora se cierra
 * ("No se hizo"), y lo que no era una orden se descarta. Las dos cosas se deshacen poniendo la fecha
 * otra vez en nulo. */

import type { Orden } from '../dominio/ordenes'
import { bien, mal, type Resultado } from '../dominio/resultado'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import { clasificar } from './respuesta'
import { sesionActual } from './sesion'

export type Compania = { readonly cuit: string; readonly nombre: string }

/* Lo que devuelve la vista, con el monto como texto (el porqué está en filas.ts). El siniestro puede
 * faltar sólo en una a confirmar que el robot no pudo leer (RF-1014). */
type FilaOrden = {
  id_orden: number; compania: string | null; siniestro: string | null; patente: string | null
  fecha_emision: string; vence: string; dias_para_vencer: number
  monto_autorizado: string | null; perito: string | null
  vehiculo: string | null; observaciones: string | null
  anulada: boolean; anulada_por_mail: string | null
  facturas: string | null; facturada: boolean; por_mail: boolean | null
  a_confirmar: boolean; descartada: boolean; cerrada: boolean; cerrada_motivo: string | null
}

const COLUMNAS = 'id_orden, compania, siniestro, patente, fecha_emision, vence, dias_para_vencer, monto_autorizado, perito, vehiculo, observaciones, anulada, anulada_por_mail, facturas, facturada, por_mail, a_confirmar, descartada, cerrada, cerrada_motivo'

/** Cuántas filas se piden por vez. Es el tope que PostgREST devuelve por pedido en Supabase ("Max
 *  rows", 1000 de fábrica): pasado eso corta sin avisar, con un 200 y la lista incompleta. No puede
 *  ser mayor que ese tope: una página corta se lee como la última. */
export const FILAS_POR_PAGINA = 1000

/** Todas las órdenes, de la de mayor monto a la de menor. Las que no tienen monto, al final.
 *
 * Se leen por páginas, hasta que una vuelve incompleta. De una sola vez, PostgREST corta en 1000 sin
 * avisar, y lo primero que se pierde es el final del orden: las que no tienen monto, que son justo las
 * a confirmar. El id va último en el orden para que sea total: con dos órdenes del mismo monto y la
 * misma fecha, la base podría mandarlas en distinto orden en cada pedido, y una caería en dos páginas
 * y otra en ninguna. Si una página falla, falla todo: una lista a medias se leería como completa. */
export async function leerOrdenes(base: ClienteBase | null = null): Promise<Resultado<readonly Orden[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const filas: FilaOrden[] = []
  for (;;) {
    const desde = filas.length
    const r = await cliente.dato
      .from('vw_ordenes_trabajo')
      .select(COLUMNAS)
      .order('monto_autorizado', { ascending: false, nullsFirst: false })
      .order('fecha_emision')
      .order('id_orden')
      .range(desde, desde + FILAS_POR_PAGINA - 1)
    if (r.error !== null) return mal(clasificar(r.error))
    const pagina = r.data as unknown as FilaOrden[]
    filas.push(...pagina)
    if (pagina.length < FILAS_POR_PAGINA) break
  }
  return bien(sinRepetidas(filas).map(orden))
}

/** Si el robot sube una orden mientras se leen las páginas, las que vienen después se corren un lugar
 *  y la última de una página vuelve como primera de la siguiente. Se queda la primera vez que
 *  aparece: así no hay dos tarjetas de la misma orden. Correrse para adelante no hace perder
 *  ninguna; para atrás no se corren nunca, porque ninguna sale de la vista (no se borran, RF-1013). */
function sinRepetidas(filas: readonly FilaOrden[]): FilaOrden[] {
  const vistas = new Set<number>()
  const unicas: FilaOrden[] = []
  for (const f of filas) {
    if (vistas.has(f.id_orden)) continue
    vistas.add(f.id_orden)
    unicas.push(f)
  }
  return unicas
}

/** Las compañías (y la concesionaria), para elegir de quién es una orden que el robot no supo. */
export async function leerCompanias(base: ClienteBase | null = null): Promise<Resultado<readonly Compania[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('compania').select('cuit, nombre').order('nombre')
  if (r.error !== null) return mal(clasificar(r.error))
  return bien(r.data)
}

/** "Es una orden" (RF-1014): desde ahora cuenta para los avisos y para lo autorizado. Si el robot no
 *  supo la compañía o el siniestro, vienen los que puso la persona; si los supo, se dejan los suyos
 *  (nulo = no tocar). Una confirmada sin compañía o sin siniestro la rechaza la base (dos checks), no
 *  sólo la pantalla. */
export async function confirmarOrden(
  idOrden: number,
  cuitCompania: string | null,
  siniestro: string | null,
  base: ClienteBase | null = null,
): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const cambios: { a_confirmar: false; cuit_compania?: string; siniestro?: string } = { a_confirmar: false }
  if (cuitCompania !== null) cambios.cuit_compania = cuitCompania
  if (siniestro !== null) cambios.siniestro = siniestro
  const r = await cliente.dato.from('orden_trabajo').update(cambios).eq('id_orden', idOrden)
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** "No es una orden" (RF-1014). No se borra: el mail queda anotado y se puede deshacer. */
export async function descartarOrden(idOrden: number, fecha: string, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('orden_trabajo').update({ descartada_en: fecha }).eq('id_orden', idOrden)
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** "Deshacer" un descarte equivocado: vuelve a quedar para confirmar. */
export async function deshacerDescarte(idOrden: number, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('orden_trabajo').update({ descartada_en: null }).eq('id_orden', idOrden)
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** La compañía la dejó sin efecto. No se borra: puede tener factura igual (RF-1011). */
export async function anularOrden(idOrden: number, fecha: string, motivo: string | null, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('orden_trabajo').update({ anulada_en: fecha, anulada_motivo: motivo }).eq('id_orden', idOrden)
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** "No la anularon": deshace una anulación equivocada. La orden vuelve a contar para las alertas. */
export async function desanularOrden(idOrden: number, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('orden_trabajo')
    .update({ anulada_en: null, anulada_motivo: null, anulada_por_mail: null })
    .eq('id_orden', idOrden)
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** "No se hizo" (RF-1013): el auto no se reparó o el cliente no volvió. Sale de los avisos y queda
 *  anotado cuándo y por qué. Es lo que antes era borrar una vencida. */
export async function cerrarOrden(idOrden: number, fecha: string, motivo: string, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('orden_trabajo').update({ cerrada_en: fecha, cerrada_motivo: motivo }).eq('id_orden', idOrden)
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** "Deshacer" un cierre: la orden vuelve a contar para los avisos. Fecha y motivo se van juntos,
 *  porque la base no acepta un motivo sin fecha. */
export async function deshacerCierre(idOrden: number, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('orden_trabajo').update({ cerrada_en: null, cerrada_motivo: null }).eq('id_orden', idOrden)
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
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
    vehiculo: f.vehiculo,
    observaciones: f.observaciones,
    anulada: f.anulada,
    anuladaPorMail: f.anulada_por_mail !== null,
    facturada: f.facturada,
    facturas: f.facturas,
    facturaPorMail: f.por_mail === true,
    aConfirmar: f.a_confirmar,
    descartada: f.descartada,
    cerrada: f.cerrada,
    cerradaMotivo: f.cerrada_motivo,
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

/* La plata del taller (spec 013 de semaforo-base). Casi todo es lectura: el mes, las compras y lo
 * que deben los suma la base (vw_plata_mes, vw_compras_mes, vw_te_deben). Lo único que se escribe
 * es el rubro de un proveedor.
 *
 * Sólo la ve quien tiene el permiso de ver la plata. Lo cuida la base: con otro usuario, las vistas
 * de acá vuelven vacías aunque se pidan a mano (RF-1314). */

import { esRubro, type Comprobante, type FilaDeCompras, type MesDePlata, type Proveedor, type Rubro, type TeDeben } from '../dominio/plata'
import { bien, mal, type Resultado } from '../dominio/resultado'
import { TODAVIA_NO } from './avisos'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import { clasificar } from './respuesta'
import { sesionActual } from './sesion'

export { TODAVIA_NO }

/** Lo que devuelven las consultas, con los NUMERIC como texto (el porqué está en filas.ts). */
type FilaMes = {
  mes: string; facturado: string; cobrado_companias: string; pagado_sin_importe: string; cobrado_particulares: string
  comprado: string; iva_ventas: string; iva_compras: string; retenciones_iva: string; retenciones: string; iva_estimado: string
  comprobantes_ventas: number; comprobantes_compras: number
}
type FilaCompras = {
  fila: string; rubro: string | null; cuit: string | null; proveedor: string | null
  comprado: string; comprobantes: number; mes_anterior: string; en_el_anio: string
}
type FilaTeDeben = { quien: string; monto: string; cuantas: number; desde: string | null }
type FilaVenta = {
  fecha_emision: string; tipo: string; punto_venta: number; numero: number; cuit_receptor: string | null; receptor: string | null
  neto_gravado: string; iva: string; total: string
}
type FilaCompra = {
  fecha_emision: string; tipo: string; punto_venta: number; numero: number; cuit: string; proveedor: string; rubro: string | null
  neto_gravado: string; iva: string; total: string
}

const COLUMNAS_MES = 'mes, facturado, cobrado_companias, pagado_sin_importe, cobrado_particulares, comprado, iva_ventas, iva_compras, ' +
  'retenciones_iva, retenciones, iva_estimado, comprobantes_ventas, comprobantes_compras'

/** Códigos con los que PostgREST dice que la vista no existe: la app puede estar publicada antes de
 *  que se aplique la migración, y no por eso tiene que mostrar un error. */
const SIN_LA_MIGRACION = new Set(['42P01', 'PGRST205'])

/** Cada mes con algo de plata, el más reciente primero. */
export async function leerMeses(base: ClienteBase | null = null): Promise<Resultado<readonly MesDePlata[] | typeof TODAVIA_NO>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('vw_plata_mes').select(COLUMNAS_MES).order('mes', { ascending: false })
  if (r.error !== null) return r.error.code !== undefined && SIN_LA_MIGRACION.has(r.error.code) ? bien(TODAVIA_NO) : mal(clasificar(r.error))
  return bien((r.data as unknown as FilaMes[]).map((f) => ({
    mes: f.mes,
    facturado: String(f.facturado),
    cobradoCompanias: String(f.cobrado_companias),
    pagadoSinImporte: String(f.pagado_sin_importe),
    cobradoParticulares: String(f.cobrado_particulares),
    comprado: String(f.comprado),
    ivaVentas: String(f.iva_ventas),
    ivaCompras: String(f.iva_compras),
    retencionesIva: String(f.retenciones_iva),
    retenciones: String(f.retenciones),
    ivaEstimado: String(f.iva_estimado),
    comprobantesVentas: f.comprobantes_ventas,
    comprobantesCompras: f.comprobantes_compras,
  })))
}

/** Lo comprado en un mes ("2026-10-01"): el total, cada rubro y cada proveedor. */
export async function leerCompras(mes: string, base: ClienteBase | null = null): Promise<Resultado<readonly FilaDeCompras[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato
    .from('vw_compras_mes')
    .select('fila, rubro, cuit, proveedor, comprado, comprobantes, mes_anterior, en_el_anio')
    .eq('mes', mes)
  if (r.error !== null) return mal(clasificar(r.error))
  return bien((r.data as unknown as FilaCompras[]).map((f) => ({
    fila: f.fila === 'mes' || f.fila === 'rubro' ? f.fila : 'proveedor',
    rubro: f.rubro,
    cuit: f.cuit,
    proveedor: f.proveedor,
    comprado: String(f.comprado),
    comprobantes: f.comprobantes,
    mesAnterior: String(f.mes_anterior),
    enElAnio: String(f.en_el_anio),
  })))
}

/** Cuánto deben hoy las compañías y los particulares. */
export async function leerTeDeben(base: ClienteBase | null = null): Promise<Resultado<readonly TeDeben[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('vw_te_deben').select('quien, monto, cuantas, desde')
  if (r.error !== null) return mal(clasificar(r.error))
  return bien((r.data as unknown as FilaTeDeben[]).map((f) => ({
    quien: f.quien === 'particulares' ? 'particulares' : 'companias',
    monto: String(f.monto),
    cuantas: f.cuantas,
    desde: f.desde,
  })))
}

/** Los proveedores que todavía no tienen rubro, por nombre. */
export async function leerProveedoresSinRubro(base: ClienteBase | null = null): Promise<Resultado<readonly Proveedor[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('proveedor').select('cuit, nombre, rubro').is('rubro', null).order('nombre')
  if (r.error !== null) return mal(clasificar(r.error))
  return bien(r.data.map((f) => ({ cuit: f.cuit, nombre: f.nombre, rubro: esRubro(f.rubro) ? f.rubro : null })))
}

/** Le pone el rubro a un proveedor: vale para todas sus facturas, las de antes y las que vengan
 *  (RF-1304). Se pide de vuelta lo cambiado: si la base no lo cambió, se dice. */
export async function ponerRubro(cuit: string, rubro: Rubro, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('proveedor').update({ rubro }).eq('cuit', cuit).select('cuit')
  if (r.error !== null) return mal(clasificar(r.error))
  if ((r.data as unknown as readonly unknown[]).length === 0) return mal({ tipo: 'regla', detalle: 'No se pudo poner el rubro: ese proveedor ya no está, o no tenés permiso.' })
  return bien(null)
}

/** El libro de ventas de un mes, para la planilla. */
export async function leerVentasDelMes(mes: string, base: ClienteBase | null = null): Promise<Resultado<readonly Comprobante[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato
    .from('vw_ventas')
    .select('fecha_emision, tipo, punto_venta, numero, cuit_receptor, receptor, neto_gravado, iva, total')
    .eq('mes', mes)
    .order('fecha_emision')
    .order('numero')
  if (r.error !== null) return mal(clasificar(r.error))
  return bien((r.data as unknown as FilaVenta[]).map((f) => ({
    fecha: f.fecha_emision, tipo: f.tipo, puntoVenta: f.punto_venta, numero: f.numero, cuit: f.cuit_receptor, nombre: f.receptor,
    rubro: null, netoGravado: String(f.neto_gravado), iva: String(f.iva), total: String(f.total),
  })))
}

/** El libro de compras de un mes, para la planilla. */
export async function leerComprasDelMes(mes: string, base: ClienteBase | null = null): Promise<Resultado<readonly Comprobante[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato
    .from('vw_compras')
    .select('fecha_emision, tipo, punto_venta, numero, cuit, proveedor, rubro, neto_gravado, iva, total')
    .eq('mes', mes)
    .order('fecha_emision')
    .order('proveedor')
  if (r.error !== null) return mal(clasificar(r.error))
  return bien((r.data as unknown as FilaCompra[]).map((f) => ({
    fecha: f.fecha_emision, tipo: f.tipo, puntoVenta: f.punto_venta, numero: f.numero, cuit: f.cuit, nombre: f.proveedor,
    rubro: f.rubro, netoGravado: String(f.neto_gravado), iva: String(f.iva), total: String(f.total),
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

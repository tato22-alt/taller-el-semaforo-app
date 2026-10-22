/* Los hitos del auto: leer qué hay hoy, anotar un toque, deshacerlo. Spec 011 de semaforo-base.
 *
 * Se lee de vw_autos_en_taller, que ya trae los días derivados: la app no cuenta días. Se escribe a
 * la tabla hito_trabajo, nunca a trabajos (son de la herramienta de presupuestos). Un toque
 * equivocado se deshace borrando el hito, y sólo en la primera semana: lo decide la política de la
 * base, y la vista avisa si todavía se puede (ultimo_se_puede_deshacer). */

import { tipoDeHito, type Auto, type TipoHito } from '../dominio/hitos'
import { normalizarPatente } from '../dominio/patente'
import { bien, mal, type Resultado } from '../dominio/resultado'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import { clasificar } from './respuesta'
import { sesionActual } from './sesion'

/** Un presupuesto encontrado por patente, para tocar el primer hito de un auto que todavía no tiene. */
export type TrabajoEncontrado = {
  readonly idTrabajo: number
  readonly numeroPresupuesto: number | null
  readonly fecha: string | null
  readonly patente: string | null
  readonly vehiculo: string | null
  readonly cliente: string | null
}

type FilaAuto = {
  id_trabajo: number; numero_presupuesto: number | null; patente: string | null; vehiculo: string | null
  cliente: string | null; telefono: string | null; repuestos_llegaron: string | null; turno_para: string | null
  entro: string | null; listo: string | null; salio: string | null; en_taller: boolean; dias_en_taller: number | null
  dias_sin_turno: number | null; dias_para_turno: number | null; dias_listo: number | null
  ultimo_hito: number | null; ultimo_tipo: string | null; ultimo_se_puede_deshacer: boolean
}

const COLUMNAS = 'id_trabajo, numero_presupuesto, patente, vehiculo, cliente, telefono, repuestos_llegaron, turno_para, entro, listo, salio, en_taller, dias_en_taller, dias_sin_turno, dias_para_turno, dias_listo, ultimo_hito, ultimo_tipo, ultimo_se_puede_deshacer'

/** Sólo los autos con algo pendiente: en el taller, o esperando turno, un turno o que lo retiren. Los
 *  que ya salieron y no tienen nada más quedan en la base, pero no viajan a la pantalla de hoy. */
const PENDIENTES = 'en_taller.is.true,dias_sin_turno.not.is.null,dias_para_turno.not.is.null,dias_listo.not.is.null'

/** Cuántas filas se piden por vez: el tope de PostgREST en Supabase (el porqué, en datos/ordenes.ts). */
export const FILAS_POR_PAGINA = 1000

/** Cuántos presupuestos devuelve una búsqueda por patente. */
const ENCONTRADOS = 8

/** Los autos con algo pendiente, para la pantalla Hoy. Por páginas, igual que las órdenes: una lista
 *  cortada en silencio se leería como completa. */
export async function leerAutos(base: ClienteBase | null = null): Promise<Resultado<readonly Auto[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const filas: FilaAuto[] = []
  for (;;) {
    const desde = filas.length
    const r = await cliente.dato
      .from('vw_autos_en_taller')
      .select(COLUMNAS)
      .or(PENDIENTES)
      .order('id_trabajo')
      .range(desde, desde + FILAS_POR_PAGINA - 1)
    if (r.error !== null) return mal(clasificar(r.error))
    const pagina = r.data as unknown as FilaAuto[]
    filas.push(...pagina)
    if (pagina.length < FILAS_POR_PAGINA) break
  }
  return bien(filas.map(auto))
}

/** Los presupuestos de una patente (o de una parte: "123" encuentra "AB123CD"), el más nuevo
 *  primero. Vacía si lo tipeado tiene menos de tres caracteres: buscar "A" traería medio taller. */
export async function buscarPorPatente(texto: string, base: ClienteBase | null = null): Promise<Resultado<readonly TrabajoEncontrado[]>> {
  const patente = normalizarPatente(texto).replace(/[^A-Z0-9]/g, '')
  if (patente.length < 3) return bien([])
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato
    .from('vw_presupuestos')
    .select('id_trabajo, numero_presupuesto, fecha_presupuesto, patente_norm, txt_vehiculo, txt_cliente')
    .ilike('patente_norm', `%${patente}%`)
    .order('fecha_presupuesto', { ascending: false, nullsFirst: false })
    .limit(ENCONTRADOS)
  if (r.error !== null) return mal(clasificar(r.error))
  type Fila = { id_trabajo: number; numero_presupuesto: number | null; fecha_presupuesto: string | null; patente_norm: string | null; txt_vehiculo: string | null; txt_cliente: string | null }
  return bien((r.data as unknown as Fila[]).map((f) => ({
    idTrabajo: f.id_trabajo,
    numeroPresupuesto: f.numero_presupuesto,
    fecha: f.fecha_presupuesto,
    patente: f.patente_norm,
    vehiculo: f.txt_vehiculo,
    cliente: f.txt_cliente,
  })))
}

/** Un toque: el hito, con su fecha (hoy en el taller, salvo que la persona la cambie). La fecha va
 *  siempre desde acá: el "hoy" de la base es el de UTC, que después de las 21 ya es mañana. El turno
 *  lleva además para cuándo se dio. */
export async function anotarHito(
  idTrabajo: number,
  tipo: TipoHito,
  fecha: string,
  fechaTurno: string | null,
  base: ClienteBase | null = null,
): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const fila: { id_trabajo: number; tipo: TipoHito; fecha: string; fecha_turno?: string | null } = { id_trabajo: idTrabajo, tipo, fecha }
  if (tipo === 'turno') fila.fecha_turno = fechaTurno
  const r = await cliente.dato.from('hito_trabajo').insert(fila)
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** "Deshacer" el último toque (RF-1105). Si pasó la semana, la base no lo borra y no da error: se
 *  pide de vuelta lo borrado para saberlo, en vez de decir que se deshizo algo que sigue ahí. */
export async function deshacerHito(idHito: number, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('hito_trabajo').delete().eq('id_hito', idHito).select('id_hito')
  if (r.error !== null) return mal(clasificar(r.error))
  if ((r.data as unknown as readonly unknown[]).length === 0) {
    return mal({ tipo: 'base', detalle: 'No se deshizo: el toque tiene más de una semana, o ya no estaba.' })
  }
  return bien(null)
}

function auto(f: FilaAuto): Auto {
  return {
    idTrabajo: f.id_trabajo,
    numeroPresupuesto: f.numero_presupuesto,
    patente: f.patente,
    vehiculo: f.vehiculo,
    cliente: f.cliente,
    telefono: f.telefono,
    repuestosLlegaron: f.repuestos_llegaron,
    turnoPara: f.turno_para,
    entro: f.entro,
    listo: f.listo,
    salio: f.salio,
    enTaller: f.en_taller,
    diasEnTaller: f.dias_en_taller,
    diasSinTurno: f.dias_sin_turno,
    diasParaTurno: f.dias_para_turno,
    diasListo: f.dias_listo,
    ultimoHito: f.ultimo_hito,
    ultimoTipo: tipoDeHito(f.ultimo_tipo),
    ultimoSePuedeDeshacer: f.ultimo_se_puede_deshacer,
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

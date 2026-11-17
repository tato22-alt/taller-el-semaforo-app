/* La plata de los particulares (spec 013 de semaforo-base, RF-1305 a RF-1309): leer qué salidas
 * esperan respuesta y quién debe; anotar un cobro o una deuda; deshacerlos.
 *
 * Se lee de vistas, que ya traen el saldo y los días: la app no resta ni cuenta. Se escribe a
 * `cobro_particular` y `deuda_particular`, que son hechos: se anotan y, dentro de la semana, se
 * deshacen borrándolos. No se corrigen. La fecha va siempre desde acá (el "hoy" del taller), como
 * en los hitos. */

import type { Cobro, Deuda, Salida } from '../dominio/particulares'
import { bien, mal, type Resultado } from '../dominio/resultado'
import { TODAVIA_NO } from './avisos'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import { clasificar } from './respuesta'
import { sesionActual } from './sesion'

export { TODAVIA_NO }

/** Lo que devuelven las consultas, con los NUMERIC como texto (el porqué está en filas.ts). */
type FilaSalida = {
  id_salida: number; id_trabajo: number; salio: string; dias: number; numero_presupuesto: number | null; patente: string | null
  vehiculo: string | null; cliente: string | null; telefono: string | null; total_presupuesto: string | null
}
type FilaDeuda = {
  id_deuda: number; deudor: string; telefono: string | null; detalle: string | null; numero_presupuesto: number | null
  patente: string | null; vehiculo: string | null; monto: string; pagado: string; saldo: string; fecha: string; dias: number
  pagos: number; ultimo_pago: string | null; se_puede_deshacer: boolean
}
type FilaCobro = {
  id_cobro: number; cuando: string; monto: string; fecha: string; quien: string | null; patente: string | null
  vehiculo: string | null; detalle: string | null; se_puede_deshacer: boolean
}

const COLUMNAS_SALIDA = 'id_salida, id_trabajo, salio, dias, numero_presupuesto, patente, vehiculo, cliente, telefono, total_presupuesto'
const COLUMNAS_DEUDA = 'id_deuda, deudor, telefono, detalle, numero_presupuesto, patente, vehiculo, monto, pagado, saldo, fecha, dias, pagos, ultimo_pago, se_puede_deshacer'
const COLUMNAS_COBRO = 'id_cobro, cuando, monto, fecha, quien, patente, vehiculo, detalle, se_puede_deshacer'

/** Códigos con los que PostgREST dice que la vista no existe: la app puede estar publicada antes de
 *  que se aplique la migración, y Hoy tiene que seguir andando igual. */
const SIN_LA_MIGRACION = new Set(['42P01', 'PGRST205'])

/** El código de Postgres para "otra fila depende de ésta". */
const TIENE_ALGO_COLGADO = '23503'

/** Todo lo que Hoy muestra de la plata de los particulares. */
export type PlataDeParticulares = {
  /** Los autos que salieron y nadie dijo qué pasó con la plata, el más viejo primero. */
  readonly sinContestar: readonly Salida[]
  /** Las deudas con saldo. */
  readonly deudas: readonly Deuda[]
  /** Lo anotado en la última semana, que todavía se puede deshacer. */
  readonly cobrosRecientes: readonly Cobro[]
  readonly deudasRecientes: readonly Deuda[]
}

export async function leerPlataDeParticulares(base: ClienteBase | null = null): Promise<Resultado<PlataDeParticulares | typeof TODAVIA_NO>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente

  const salidas = await cliente.dato.from('vw_plata_al_salir').select(COLUMNAS_SALIDA).eq('contestada', false).order('salio')
  if (salidas.error !== null) {
    return salidas.error.code !== undefined && SIN_LA_MIGRACION.has(salidas.error.code) ? bien(TODAVIA_NO) : mal(clasificar(salidas.error))
  }
  const deudas = await cliente.dato.from('vw_deudas_particulares').select(COLUMNAS_DEUDA).or('saldo.gt.0,se_puede_deshacer.is.true').order('fecha')
  if (deudas.error !== null) return mal(clasificar(deudas.error))
  const cobros = await cliente.dato.from('vw_cobros_particulares').select(COLUMNAS_COBRO).eq('se_puede_deshacer', true).order('id_cobro', { ascending: false })
  if (cobros.error !== null) return mal(clasificar(cobros.error))

  const todas = (deudas.data as unknown as FilaDeuda[]).map(deuda)
  return bien({
    sinContestar: (salidas.data as unknown as FilaSalida[]).map((f) => ({
      idSalida: f.id_salida,
      idTrabajo: f.id_trabajo,
      salio: f.salio,
      dias: f.dias,
      numeroPresupuesto: f.numero_presupuesto,
      patente: f.patente,
      vehiculo: f.vehiculo,
      cliente: f.cliente,
      telefono: f.telefono,
      totalPresupuesto: f.total_presupuesto === null ? null : String(f.total_presupuesto),
    })),
    deudas: todas,
    cobrosRecientes: (cobros.data as unknown as FilaCobro[]).map((f) => ({
      idCobro: f.id_cobro,
      cuando: f.cuando === 'deuda' ? 'deuda' : 'al_salir',
      monto: String(f.monto),
      fecha: f.fecha,
      quien: f.quien,
      patente: f.patente,
      vehiculo: f.vehiculo,
      detalle: f.detalle,
      sePuedeDeshacer: f.se_puede_deshacer,
    })),
    deudasRecientes: todas.filter((d) => d.sePuedeDeshacer),
  })
}

/** Lo que se anota al entregar un auto: un cobro, una deuda, o las dos (lo decide dominio/particulares).
 *  La deuda va primero: es lo que no se puede perder. Si el cobro falla después, se dice. */
export async function anotarAlSalir(
  idSalida: number,
  anotar: { readonly cobro: string | null; readonly deuda: string | null; readonly deudor: string; readonly telefono: string | null },
  fecha: string,
  base: ClienteBase | null = null,
): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  if (anotar.deuda !== null) {
    const r = await cliente.dato
      .from('deuda_particular')
      .insert({ id_salida: idSalida, deudor: anotar.deudor.trim(), telefono: anotar.telefono, monto: anotar.deuda as unknown as number, fecha })
    if (r.error !== null) return mal(clasificar(r.error))
  }
  if (anotar.cobro !== null) {
    const r = await cliente.dato.from('cobro_particular').insert({ id_salida: idSalida, monto: anotar.cobro as unknown as number, fecha })
    if (r.error !== null) return mal(clasificar(r.error))
  }
  return bien(null)
}

/** Un pago de lo que alguien quedó debiendo (RF-1307). */
export async function anotarPago(idDeuda: number, monto: string, fecha: string, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('cobro_particular').insert({ id_deuda: idDeuda, monto: monto as unknown as number, fecha })
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** Una deuda anotada sin pasar por «Salió»: sobre un presupuesto, o de un auto que no lo tiene
 *  (entonces `detalle` dice cuál es). `fecha` es desde cuándo debe. */
export async function anotarDeuda(
  deuda: {
    readonly idTrabajo: number | null
    readonly detalle: string | null
    readonly deudor: string
    readonly telefono: string | null
    readonly monto: string
    readonly fecha: string
  },
  base: ClienteBase | null = null,
): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('deuda_particular').insert({
    id_trabajo: deuda.idTrabajo,
    detalle: deuda.idTrabajo === null ? deuda.detalle : null,
    deudor: deuda.deudor.trim(),
    telefono: deuda.telefono,
    monto: deuda.monto as unknown as number,
    fecha: deuda.fecha,
  })
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** Deshacer un cobro anotado (RF-1309). Si pasó la semana, la base no lo borra y no da error: se
 *  pide de vuelta lo borrado para saberlo. */
export async function deshacerCobro(idCobro: number, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('cobro_particular').delete().eq('id_cobro', idCobro).select('id_cobro')
  if (r.error !== null) return mal(clasificar(r.error))
  if ((r.data as unknown as readonly unknown[]).length === 0) {
    return mal({ tipo: 'regla', detalle: 'No se deshizo: el cobro tiene más de una semana, o ya no estaba.' })
  }
  return bien(null)
}

/** Deshacer una deuda anotada. Con pagos no se puede: primero se deshacen los pagos. */
export async function deshacerDeuda(idDeuda: number, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('deuda_particular').delete().eq('id_deuda', idDeuda).select('id_deuda')
  if (r.error !== null) {
    return r.error.code === TIENE_ALGO_COLGADO
      ? mal({ tipo: 'regla', detalle: 'Esa deuda ya tiene pagos anotados: primero deshacé los pagos.' })
      : mal(clasificar(r.error))
  }
  if ((r.data as unknown as readonly unknown[]).length === 0) {
    return mal({ tipo: 'regla', detalle: 'No se deshizo: la deuda tiene más de una semana, o ya no estaba.' })
  }
  return bien(null)
}

function deuda(f: FilaDeuda): Deuda {
  return {
    idDeuda: f.id_deuda,
    deudor: f.deudor,
    telefono: f.telefono,
    detalle: f.detalle,
    numeroPresupuesto: f.numero_presupuesto,
    patente: f.patente,
    vehiculo: f.vehiculo,
    monto: String(f.monto),
    pagado: String(f.pagado),
    saldo: String(f.saldo),
    fecha: f.fecha,
    dias: f.dias,
    pagos: f.pagos,
    ultimoPago: f.ultimo_pago,
    sePuedeDeshacer: f.se_puede_deshacer,
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

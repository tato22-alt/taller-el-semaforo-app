/* Revisar las notas de crédito y de débito: a qué factura toca cada una. Spec 005 §5.5, P9.
 *
 * La base ya derivó lo que se puede derivar: vw_nc_candidatas dice, para cada nota de crédito, si
 * tiene una sola factura posible (se toma sola), varias (ambigua) o ninguna. Lo que queda es lo que
 * decide una persona, y esa decisión es lo único que esta pantalla escribe: una fila en
 * comprobante_vinculo. Deshacer una decisión equivocada es borrar esa fila; nada más se toca.
 *
 * Las notas de débito no tienen vista: hay muy pocas (una, hoy) y la decisión es siempre de una
 * persona. Se listan con las notas de crédito del mismo cliente, sin calcular nada: se filtra por
 * CUIT, que es una consulta, no una cuenta. */

import { bien, mal, type Resultado } from '../dominio/resultado'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import { clasificar } from './respuesta'
import { sesionActual } from './sesion'

export type Comprobante = {
  readonly id: number
  readonly puntoVenta: number
  readonly numero: number
  readonly fecha: string
  /** NUMERIC: llega como texto y así se queda. */
  readonly total: string
}

export type NotaCredito = Comprobante & {
  readonly cuitReceptor: string | null
  readonly receptor: string | null
  readonly estado: 'confirmada' | 'unica' | 'ambigua' | 'sin_candidata'
  /** Las facturas posibles, o la elegida si ya está resuelta. Sin total: es el de la nota. */
  readonly facturas: readonly Omit<Comprobante, 'total'>[]
  /** Si una persona la vinculó, con qué fila: para poder deshacerlo. */
  readonly idVinculo: number | null
}

export type NotaDebito = Comprobante & {
  readonly cuitReceptor: string | null
  readonly receptor: string | null
  readonly vinculo: { readonly idVinculo: number; readonly idDestino: number } | null
}

export type Notas = { readonly creditos: readonly NotaCredito[]; readonly debitos: readonly NotaDebito[] }

export type Motivo = 'anula' | 'ajuste' | 'revierte_nc'

/* Lo que devuelven las consultas, con los NUMERIC como texto (el porqué está en filas.ts). */
export type FilaCandidata = {
  id_nota: number; nota_punto_venta: number; nota_numero: number; nota_fecha: string
  cuit_receptor: string | null; receptor_nombre: string | null; total: string
  id_factura: number | null; factura_punto_venta: number | null; factura_numero: number | null; factura_fecha: string | null
  estado: NotaCredito['estado']
}
type FilaComprobante = {
  id_comprobante: number; punto_venta: number; numero: number; fecha_emision: string
  cuit_receptor: string | null; receptor_nombre: string | null; total: string
}
export type FilaVinculo = { id_vinculo: number; id_origen: number; id_destino: number }

const COLUMNAS_COMPROBANTE = 'id_comprobante, punto_venta, numero, fecha_emision, cuit_receptor, receptor_nombre, total'

export async function leerNotas(base: ClienteBase | null = null): Promise<Resultado<Notas>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const db = cliente.dato

  const candidatas = await db.from('vw_nc_candidatas').select('*').order('nota_fecha').order('id_nota')
  if (candidatas.error !== null) return mal(clasificar(candidatas.error))
  const vinculos = await db.from('comprobante_vinculo').select('id_vinculo, id_origen, id_destino')
  if (vinculos.error !== null) return mal(clasificar(vinculos.error))
  const tipos = await codigosDeClase(db, 'nota_debito')
  if (!tipos.ok) return tipos
  const debitos = await db.from('comprobante').select(COLUMNAS_COMPROBANTE).in('tipo_codigo', tipos.dato).order('fecha_emision')
  if (debitos.error !== null) return mal(clasificar(debitos.error))

  const porOrigen = new Map((vinculos.data as FilaVinculo[]).map((v) => [v.id_origen, v]))
  return bien({
    creditos: agruparPorNota(candidatas.data as unknown as FilaCandidata[], porOrigen),
    debitos: (debitos.data as unknown as FilaComprobante[]).map((d) => {
      const v = porOrigen.get(d.id_comprobante)
      return { ...comprobante(d), cuitReceptor: d.cuit_receptor, receptor: d.receptor_nombre, vinculo: v ? { idVinculo: v.id_vinculo, idDestino: v.id_destino } : null }
    }),
  })
}

/** Los comprobantes de una clase de un cliente, del más nuevo al más viejo: para elegir a mano. */
export async function delCliente(
  cuitReceptor: string,
  clase: 'factura' | 'nota_credito',
  base: ClienteBase | null = null,
): Promise<Resultado<readonly Comprobante[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const tipos = await codigosDeClase(cliente.dato, clase)
  if (!tipos.ok) return tipos
  const r = await cliente.dato
    .from('comprobante')
    .select(COLUMNAS_COMPROBANTE)
    .eq('cuit_receptor', cuitReceptor)
    .in('tipo_codigo', tipos.dato)
    .order('fecha_emision', { ascending: false })
    .limit(60)
  if (r.error !== null) return mal(clasificar(r.error))
  return bien((r.data as unknown as FilaComprobante[]).map(comprobante))
}

/** Lo que decidió una persona: esta nota va con este comprobante. Quién y cuándo los pone la base. */
export async function vincular(
  v: { readonly idOrigen: number; readonly idDestino: number; readonly motivo: Motivo },
  base: ClienteBase | null = null,
): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('comprobante_vinculo').insert({ id_origen: v.idOrigen, id_destino: v.idDestino, motivo: v.motivo })
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** Deshacer una decisión: la nota vuelve a quedar como la base la deriva. */
export async function desvincular(idVinculo: number, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('comprobante_vinculo').delete().eq('id_vinculo', idVinculo)
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/* ------------------------------------------------------------------------------------------- */

/** La vista trae una fila por nota y factura posible; la pantalla quiere una por nota. */
export function agruparPorNota(filas: readonly FilaCandidata[], vinculos: ReadonlyMap<number, FilaVinculo>): NotaCredito[] {
  const notas = new Map<number, NotaCredito & { facturas: Omit<Comprobante, 'total'>[] }>()
  for (const f of filas) {
    let n = notas.get(f.id_nota)
    if (!n) {
      n = {
        id: f.id_nota, puntoVenta: f.nota_punto_venta, numero: f.nota_numero, fecha: f.nota_fecha, total: f.total,
        cuitReceptor: f.cuit_receptor, receptor: f.receptor_nombre, estado: f.estado, facturas: [],
        idVinculo: f.estado === 'confirmada' ? (vinculos.get(f.id_nota)?.id_vinculo ?? null) : null,
      }
      notas.set(f.id_nota, n)
    }
    if (f.id_factura !== null && f.factura_punto_venta !== null && f.factura_numero !== null && f.factura_fecha !== null) {
      n.facturas.push({ id: f.id_factura, puntoVenta: f.factura_punto_venta, numero: f.factura_numero, fecha: f.factura_fecha })
    }
  }
  return [...notas.values()]
}

function comprobante(f: FilaComprobante): Comprobante {
  return { id: f.id_comprobante, puntoVenta: f.punto_venta, numero: f.numero, fecha: f.fecha_emision, total: f.total }
}

async function codigosDeClase(db: ClienteBase, clase: string): Promise<Resultado<number[]>> {
  const r = await db.from('tipo_comprobante').select('codigo').eq('clase', clase)
  if (r.error !== null) return mal(clasificar(r.error))
  return bien(r.data.map((t) => t.codigo))
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

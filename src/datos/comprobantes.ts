/* Importar el libro de ARCA: la primera escritura de esta app.
 *
 * Escribe sólo dos tablas del módulo de cobranzas, `importacion` y `comprobante`. Las tablas
 * de la herramienta de presupuestos no se tocan nunca, y lo verifica arquitectura.test.ts.
 *
 * Reimportar no duplica: cada comprobante tiene la clave de ARCA más el CUIT emisor, y el que
 * ya está se saltea (ON CONFLICT DO NOTHING). Las "nuevas" no las cuenta el navegador: se le
 * preguntan a la base, contando los comprobantes que quedaron colgados de esta importación.
 *
 * Trade-off conocido: no es una transacción. Si se corta internet a mitad de camino queda una
 * importación con parte de sus comprobantes. No hace daño, porque volver a importar el mismo
 * archivo completa lo que faltó y no duplica lo que ya estaba. Hacerlo atómico pediría una
 * función en la base; con un archivo por mes, no lo vale todavía. */

import type { ComprobanteArca } from '../dominio/arca'
import { bien, mal, type Resultado } from '../dominio/resultado'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import { clasificar } from './respuesta'
import { sesionActual } from './sesion'
import type { Database } from './tipos-base'

/** Lo que la pantalla necesita antes de leer el archivo. */
export type ParaImportar = {
  /** Los tipos que la base conoce: el lector rechaza los demás antes de intentar guardarlos. */
  readonly tiposConocidos: ReadonlySet<number>
  /** El CUIT emisor de la última importación, para no tener que escribirlo cada vez. */
  readonly ultimoEmisor: string | null
}

export type ResumenImportacion = {
  readonly idImportacion: number
  readonly nuevas: number
  readonly yaEstaban: number
}

/** De a cuántos comprobantes se mandan. Un año del taller son unos 300: entra en uno o dos. */
const LOTE = 500

const CLAVE_ARCA = 'cuit_emisor,tipo_codigo,punto_venta,numero'

type InsertComprobante = Database['public']['Tables']['comprobante']['Insert']

/* El tipo generado dice que los numeric se mandan como number. Se mandan como texto, a
 * propósito: así "1234500.00" llega entero a Postgres sin pasar por un float. Postgres convierte
 * el texto a numeric solo. Se afirma acá, una vez y a la vista, igual que en presupuestos.ts. */
type ComprobanteParaBase = Omit<InsertComprobante, 'tipo_cambio' | 'neto_gravado' | 'iva' | 'total'> & {
  readonly tipo_cambio: string
  readonly neto_gravado: string
  readonly iva: string
  readonly total: string
}

export async function prepararImportacion(base: ClienteBase | null = null): Promise<Resultado<ParaImportar>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente

  const tipos = await cliente.dato.from('tipo_comprobante').select('codigo')
  if (tipos.error !== null) return mal(clasificar(tipos.error))

  const ultimo = await cliente.dato
    .from('comprobante')
    .select('cuit_emisor')
    .order('id_comprobante', { ascending: false })
    .limit(1)
  if (ultimo.error !== null) return mal(clasificar(ultimo.error))

  return bien({
    tiposConocidos: new Set((tipos.data ?? []).map((t) => t.codigo)),
    ultimoEmisor: ultimo.data?.[0]?.cuit_emisor ?? null,
  })
}

export async function importarComprobantes(
  entrada: {
    readonly archivoNombre: string
    readonly archivoHash: string
    readonly leidas: number
    readonly cuitEmisor: string
    readonly filas: readonly ComprobanteArca[]
  },
  base: ClienteBase | null = null,
): Promise<Resultado<ResumenImportacion>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente

  const importacion = await cliente.dato
    .from('importacion')
    .insert({
      fuente: 'arca',
      archivo_nombre: entrada.archivoNombre,
      archivo_hash: entrada.archivoHash,
      filas_leidas: entrada.leidas,
    })
    .select('id_importacion')
    .single()
  if (importacion.error !== null || importacion.data === null) {
    return mal(importacion.error !== null ? clasificar(importacion.error) : { tipo: 'base', detalle: 'La importación no devolvió su número.' })
  }
  const idImportacion = importacion.data.id_importacion

  const filas: ComprobanteParaBase[] = entrada.filas.map((f) => ({
    cuit_emisor: entrada.cuitEmisor,
    tipo_codigo: f.tipoCodigo,
    punto_venta: f.puntoVenta,
    numero: f.numero,
    fecha_emision: f.fechaEmision,
    cuit_receptor: f.cuitReceptor,
    receptor_nombre: f.receptorNombre,
    moneda: f.moneda,
    tipo_cambio: f.tipoCambio,
    neto_gravado: f.netoGravado,
    iva: f.iva,
    total: f.total,
    id_importacion: idImportacion,
  }))

  for (let desde = 0; desde < filas.length; desde += LOTE) {
    const lote = filas.slice(desde, desde + LOTE) as unknown as InsertComprobante[]
    const r = await cliente.dato.from('comprobante').upsert(lote, { onConflict: CLAVE_ARCA, ignoreDuplicates: true })
    if (r.error !== null) return mal(clasificar(r.error))
  }

  const conteo = await cliente.dato
    .from('comprobante')
    .select('id_comprobante', { count: 'exact', head: true })
    .eq('id_importacion', idImportacion)
  if (conteo.error !== null) return mal(clasificar(conteo.error))

  const nuevas = conteo.count ?? 0
  return bien({ idImportacion, nuevas, yaEstaban: filas.length - nuevas })
}

/** El cliente, sólo si hay sesión: sin sesión, RLS no da error, devuelve vacío y escribe nada. */
async function clienteConSesion(base: ClienteBase | null): Promise<Resultado<ClienteBase>> {
  const cliente = base === null ? obtenerCliente() : bien(base)
  if (!cliente.ok) return cliente

  const sesion = await sesionActual(cliente.dato)
  if (!sesion.ok) return mal(sesion.fallo)
  if (sesion.dato === null) return mal({ tipo: 'sin_sesion' })
  return cliente
}

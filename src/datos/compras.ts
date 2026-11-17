/* Importar las compras de ARCA (spec 013 de semaforo-base, RF-1301 a RF-1304).
 *
 * El archivo de Mis Comprobantes → Recibidos se guarda en `compra`, nunca en `comprobante`: así
 * ninguna pantalla de cobranzas puede contar una compra. Cada proveedor nace acá, la primera vez que
 * aparece, con el CUIT y el nombre que trae ARCA; el que ya está se saltea, con su rubro.
 *
 * Igual que la importación de las ventas: reimportar no duplica (la clave es la de ARCA), las
 * "nuevas" se le preguntan a la base, y no es una transacción: si se corta a mitad de camino, volver
 * a importar el mismo archivo completa lo que faltó.
 *
 * Sólo importa quien ve la plata: lo cuida la base. Acá se pregunta antes, para decirlo con palabras
 * en vez de dejar que la base lo rechace. */

import type { CompraArca } from '../dominio/arca'
import { bien, mal, type Resultado } from '../dominio/resultado'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import type { ResumenImportacion } from './comprobantes'
import { clasificar } from './respuesta'
import { sesionActual } from './sesion'
import type { Database } from './tipos-base'

/** De a cuántas filas se mandan. */
const LOTE = 500

const CLAVE_ARCA = 'cuit_emisor,tipo_codigo,punto_venta,numero'

type InsertCompra = Database['public']['Tables']['compra']['Insert']

/* Los numeric se mandan como texto, a propósito: el porqué está en comprobantes.ts. */
type CompraParaBase = Omit<InsertCompra, 'tipo_cambio' | 'neto_gravado' | 'iva' | 'total'> & {
  readonly tipo_cambio: string
  readonly neto_gravado: string
  readonly iva: string
  readonly total: string
}

export const SIN_PERMISO = 'Las compras las importa quien ve la plata del taller.'

export async function importarCompras(
  entrada: {
    readonly archivoNombre: string
    readonly archivoHash: string
    readonly leidas: number
    readonly filas: readonly CompraArca[]
  },
  base: ClienteBase | null = null,
): Promise<Resultado<ResumenImportacion>> {
  const resuelto = base === null ? obtenerCliente() : bien(base)
  if (!resuelto.ok) return resuelto
  const cliente = resuelto.dato
  const sesion = await sesionActual(cliente)
  if (!sesion.ok) return mal(sesion.fallo)
  if (sesion.dato === null) return mal({ tipo: 'sin_sesion' })
  if (!sesion.dato.vePlata) return mal({ tipo: 'regla', detalle: SIN_PERMISO })

  const importacion = await cliente
    .from('importacion')
    .insert({
      fuente: 'arca_recibidos',
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

  // Un proveedor por CUIT, con el primer nombre con que aparece en el archivo.
  const proveedores = new Map<string, string>()
  for (const f of entrada.filas) if (!proveedores.has(f.cuitEmisor)) proveedores.set(f.cuitEmisor, f.emisorNombre)
  const fichas = [...proveedores].map(([cuit, nombre]) => ({ cuit, nombre }))
  for (let desde = 0; desde < fichas.length; desde += LOTE) {
    const r = await cliente.from('proveedor').upsert(fichas.slice(desde, desde + LOTE), { onConflict: 'cuit', ignoreDuplicates: true })
    if (r.error !== null) return mal(clasificar(r.error))
  }

  const filas: CompraParaBase[] = entrada.filas.map((f) => ({
    cuit_emisor: f.cuitEmisor,
    tipo_codigo: f.tipoCodigo,
    punto_venta: f.puntoVenta,
    numero: f.numero,
    fecha_emision: f.fechaEmision,
    moneda: f.moneda,
    tipo_cambio: f.tipoCambio,
    neto_gravado: f.netoGravado,
    iva: f.iva,
    total: f.total,
    id_importacion: idImportacion,
  }))
  for (let desde = 0; desde < filas.length; desde += LOTE) {
    const lote = filas.slice(desde, desde + LOTE) as unknown as InsertCompra[]
    const r = await cliente.from('compra').upsert(lote, { onConflict: CLAVE_ARCA, ignoreDuplicates: true })
    if (r.error !== null) return mal(clasificar(r.error))
  }

  const conteo = await cliente.from('compra').select('id_compra', { count: 'exact', head: true }).eq('id_importacion', idImportacion)
  if (conteo.error !== null) return mal(clasificar(conteo.error))

  const nuevas = conteo.count ?? 0
  return bien({ idImportacion, nuevas, yaEstaban: filas.length - nuevas })
}

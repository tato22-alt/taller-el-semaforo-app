/* La factura lista para mandar (spec 016 de semaforo-base): leer en qué anda cada orden, subir los
 * archivos, sacar uno equivocado, y pedir "armar igual" o "armarlo de nuevo".
 *
 * Se lee de vw_factura_para_mandar, que ya trae el estado derivado. Se escribe a factura_para_mandar
 * (el intento de cada orden) y a archivo_para_mandar (sus archivos), y los archivos van al espacio
 * privado "facturas-para-mandar": primero el archivo, después la fila, porque la base no anota un
 * archivo que no está. Lo que anota el robot (lo leído, los controles, el borrador) no se escribe acá:
 * la base no deja. */

import {
  esEstadoParaMandar, rutaDelArchivo, type ArchivoSubido, type ClaseDeArchivo, type FacturaParaMandar,
} from '../dominio/mandar-factura'
import { hoyEnElTaller } from '../dominio/fechas'
import { bien, mal, type Resultado } from '../dominio/resultado'
import { TODAVIA_NO } from './avisos'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import { FILAS_POR_PAGINA } from './ordenes'
import { clasificar } from './respuesta'
import { sesionActual } from './sesion'

export { TODAVIA_NO }

const ESPACIO = 'facturas-para-mandar'

type FilaParaMandar = {
  id_orden: number; id_para_mandar: number | null; estado: string; para: string | null; para_origen: string | null
  asunto: string | null; problemas: string[] | null; archivos: unknown; mandado_en: string | null
}

/** Códigos con los que PostgREST dice que la vista no existe: la app puede estar publicada antes de
 *  que se aplique la migración de la spec 016. */
const SIN_LA_016 = new Set(['42P01', 'PGRST205'])

/** En qué anda la factura de cada orden que la puede mandar, por número de orden. */
export async function leerFacturasParaMandar(
  base: ClienteBase | null = null,
): Promise<Resultado<ReadonlyMap<number, FacturaParaMandar> | typeof TODAVIA_NO>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const filas: FilaParaMandar[] = []
  for (;;) {
    const desde = filas.length
    const r = await cliente.dato
      .from('vw_factura_para_mandar')
      .select('id_orden, id_para_mandar, estado, para, para_origen, asunto, problemas, archivos, mandado_en')
      .order('id_orden')
      .range(desde, desde + FILAS_POR_PAGINA - 1)
    if (r.error !== null) return r.error.code !== undefined && SIN_LA_016.has(r.error.code) ? bien(TODAVIA_NO) : mal(clasificar(r.error))
    const pagina = r.data as unknown as FilaParaMandar[]
    filas.push(...pagina)
    if (pagina.length < FILAS_POR_PAGINA) break
  }
  const porOrden = new Map<number, FacturaParaMandar>()
  for (const f of filas) {
    if (!esEstadoParaMandar(f.estado)) continue
    porOrden.set(f.id_orden, {
      idOrden: f.id_orden,
      idParaMandar: f.id_para_mandar,
      estado: f.estado,
      para: f.para,
      paraOrigen: f.para_origen === 'ficha' || f.para_origen === 'mas_usada' || f.para_origen === 'intento' ? f.para_origen : null,
      asunto: f.asunto,
      problemas: f.problemas ?? [],
      archivos: archivosDe(f.archivos),
      // La hora en que el robot vio el mail enviado, como fecha de calendario de Argentina.
      mandadaEl: f.mandado_en === null ? null : hoyEnElTaller(new Date(f.mandado_en)),
    })
  }
  return bien(porOrden)
}

function archivosDe(x: unknown): ArchivoSubido[] {
  if (!Array.isArray(x)) return []
  return x.flatMap((a: { id?: unknown; clase?: unknown; nombre?: unknown }) =>
    typeof a.id === 'number' && (a.clase === 'factura' || a.clase === 'orden_firmada' || a.clase === 'otro') && typeof a.nombre === 'string'
      ? [{ id: a.id, clase: a.clase, nombre: a.nombre }]
      : [])
}

/** Sube un archivo a la tarjeta de una orden. Si la orden todavía no tenía intento, lo abre, y
 *  devuelve su número para los archivos que siguen. Que el archivo sea del tipo y del tamaño que se
 *  aceptan lo controla quien llama (dominio/mandar-factura.ts), y lo vuelve a controlar el espacio de la base. */
export async function subirArchivo(
  idOrden: number,
  idParaMandar: number | null,
  clase: ClaseDeArchivo,
  archivo: File,
  base: ClienteBase | null = null,
): Promise<Resultado<number>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  let intento = idParaMandar
  if (intento === null) {
    const r = await cliente.dato.from('factura_para_mandar').insert({ id_orden: idOrden }).select('id_para_mandar').single()
    if (r.error !== null) return mal(clasificar(r.error))
    intento = r.data.id_para_mandar
  }
  const ruta = rutaDelArchivo(idOrden, clase, archivo.name, Date.now())
  const subido = await cliente.dato.storage.from(ESPACIO).upload(ruta, archivo, { contentType: archivo.type, upsert: false })
  if (subido.error !== null) return mal(clasificar({ message: subido.error.message }))
  const r = await cliente.dato.from('archivo_para_mandar').insert({ id_para_mandar: intento, clase, ruta, nombre: archivo.name, tipo: archivo.type })
  return r.error !== null ? mal(clasificar(r.error)) : bien(intento)
}

/** Saca un archivo equivocado. No se borra: queda anotado que se sacó, y deja de usarse. */
export async function sacarArchivo(idArchivo: number, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('archivo_para_mandar').update({ quitado_en: new Date().toISOString() }).eq('id_archivo', idArchivo)
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** "Armar igual": una persona sabe algo que el robot no (RF-1604). La hora la pone la base. */
export async function armarIgual(idParaMandar: number, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('factura_para_mandar').update({ armar_igual_en: new Date().toISOString() }).eq('id_para_mandar', idParaMandar)
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** "Armarlo de nuevo", cuando el borrador se borró sin mandar (RF-1606). */
export async function armarDeNuevo(idParaMandar: number, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('factura_para_mandar').update({ rearmar_en: new Date().toISOString() }).eq('id_para_mandar', idParaMandar)
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
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

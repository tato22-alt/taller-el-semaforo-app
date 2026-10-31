/* La factura lista para mandar (spec 016 de semaforo-base): en la tarjeta de la orden se suben la
 * factura y la orden firmada, y el robot deja el borrador en Gmail. Lo manda una persona (R1).
 *
 * La base deriva en qué anda cada orden (vw_factura_para_mandar) y controla la factura contra la orden.
 * Acá se decide cómo se dice cada cosa y qué archivo se acepta antes de subirlo. */

export const ESTADOS_PARA_MANDAR = [
  'se_carga_en_el_portal', 'mandada', 'borrador_listo', 'borrador_borrado', 'sin_empezar', 'falta_factura',
  'falta_orden_firmada', 'faltan_las_dos', 'sin_casilla', 'no_cierra', 'armando',
] as const
export type EstadoParaMandar = (typeof ESTADOS_PARA_MANDAR)[number]

export function esEstadoParaMandar(x: string): x is EstadoParaMandar {
  return (ESTADOS_PARA_MANDAR as readonly string[]).includes(x)
}

export type ClaseDeArchivo = 'factura' | 'orden_firmada' | 'otro'

export type ArchivoSubido = {
  readonly id: number
  readonly clase: ClaseDeArchivo
  readonly nombre: string
}

/** Una fila de vw_factura_para_mandar. */
export type FacturaParaMandar = {
  readonly idOrden: number
  readonly idParaMandar: number | null
  readonly estado: EstadoParaMandar
  readonly para: string | null
  readonly paraOrigen: 'ficha' | 'mas_usada' | 'intento' | null
  readonly asunto: string | null
  readonly problemas: readonly string[]
  readonly archivos: readonly ArchivoSubido[]
  readonly mandadaEl: string | null
}

const PROBLEMAS: Record<string, string> = {
  no_se_leyo: 'no pude leer el número o el CUIT de la factura (¿es el PDF de ARCA?)',
  otro_cuit: 'la factura es para otro CUIT',
  sin_siniestro: 'la factura no dice el siniestro de la orden',
  orden_vencida: 'la orden está vencida',
  orden_facturada: 'la orden ya tiene factura',
  factura_de_otra_orden: 'esa factura ya es de otra orden',
  pasa_lo_autorizado: 'la factura pasa lo autorizado',
  orden_no_vigente: 'la orden no está vigente (cerrada, descartada o sin confirmar)',
}

/** "la factura es para otro CUIT". Un control que la app todavía no conoce se dice como viene. */
export function problemaEnPalabras(codigo: string): string {
  return PROBLEMAS[codigo] ?? codigo
}

/** Lo que dice la tarjeta, en una frase. La fecha la formatea quien llama (dominio/fechas.ts). */
export function estadoEnPalabras(f: FacturaParaMandar, fecha: (d: string) => string): string {
  switch (f.estado) {
    case 'se_carga_en_el_portal': return 'La factura se carga en el portal de la compañía.'
    case 'mandada': return f.mandadaEl === null ? 'Mandada.' : `Mandada el ${fecha(f.mandadaEl)}.`
    case 'borrador_listo': return 'Borrador listo en Gmail: revisalo y mandalo.'
    case 'borrador_borrado': return 'El borrador se borró sin mandar.'
    case 'sin_empezar':
    case 'faltan_las_dos': return 'Para mandar la factura: subí la factura de ARCA y la orden firmada.'
    case 'falta_factura': return 'Falta la factura (el PDF de ARCA).'
    case 'falta_orden_firmada': return 'Falta la orden firmada.'
    case 'sin_casilla': return 'No sé a qué casilla mandarla: cargá el mail de facturación en la ficha de la compañía.'
    case 'no_cierra': return `No armé el borrador: ${f.problemas.map(problemaEnPalabras).join('; ')}.`
    case 'armando': return 'Está todo: el robot arma el borrador en su próxima corrida (como mucho, una hora).'
  }
}

/** ¿Se pueden subir o sacar archivos? No con un borrador armado ni con la factura mandada. */
export function sePuedenCambiarArchivos(e: EstadoParaMandar): boolean {
  return e !== 'se_carga_en_el_portal' && e !== 'mandada' && e !== 'borrador_listo'
}

export const TIPOS_ACEPTADOS = ['application/pdf', 'image/jpeg', 'image/png'] as const
export const TAMANO_MAXIMO = 10 * 1024 * 1024

/** null si el archivo se puede subir; si no, por qué. Lo mismo controla el espacio de la base. */
export function porQueNoSeSube(clase: ClaseDeArchivo, tipo: string, tamano: number): string | null {
  if (clase === 'factura' && tipo !== 'application/pdf') return 'La factura tiene que ser el PDF que se baja de ARCA.'
  if (!(TIPOS_ACEPTADOS as readonly string[]).includes(tipo)) return 'Sólo PDF o fotos (JPG o PNG).'
  if (tamano > TAMANO_MAXIMO) return 'El archivo pesa más de 10 MB.'
  return null
}

/** Dónde se guarda en el espacio "facturas-para-mandar": empieza con el número de orden (lo pide la
 *  base), lleva la hora para que dos archivos con el mismo nombre no se pisen, y sólo letras simples. */
export function rutaDelArchivo(idOrden: number, clase: ClaseDeArchivo, nombre: string, ahora: number): string {
  const limpio = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
  return `${idOrden}/${ahora}-${clase}-${limpio === '' ? 'archivo' : limpio}`
}

/** Los borradores de Gmail, en la cuenta con que se entró primero en ese navegador (la del taller). */
export const ENLACE_A_LOS_BORRADORES = 'https://mail.google.com/mail/u/0/#drafts'

/* Revisar los avisos de pago: lo que el robot no pudo cerrar solo. Plan de la fase 2 de semaforo-base, M7.
 *
 * La base derivó lo que se puede derivar: vw_revisar dice qué espera a una persona, y
 * vw_revisar_candidatas, qué facturas pueden ser, ya ordenadas. Lo que esta pantalla escribe es lo que
 * decide una persona: una fila en imputacion, que vincula un aviso (o un renglón) con su factura o dice
 * que no es un pago. Una decisión equivocada no se borra: se deshace, y la base anota quién. */

import { esQueRevisar, type Candidata, type CosaPorRevisar, type Decision } from '../dominio/revisar-avisos'
import { bien, mal, type Resultado } from '../dominio/resultado'
import { obtenerCliente, type ClienteBase } from './cliente-supabase'
import { clasificar } from './respuesta'
import { sesionActual } from './sesion'

/* Lo que devuelven las consultas, con los NUMERIC como texto (el porqué está en filas.ts). */
type FilaRevisar = {
  que: string; gmail_message_id: string; linea_orden: number | null; recibido_en: string; remitente: string
  compania: string | null; cuit_compania: string | null; numero: number | null; siniestro: string | null
  detalle: string | null; bruto: string | null; asunto: string | null; pdfs_drive: string[] | null
}
type FilaCandidata = {
  id_comprobante: number; punto_venta: number; numero: number; fecha_emision: string
  total: string; falta: string | null; mismo_numero: boolean
}
type FilaDecision = {
  id_imputacion: number; decision: string; decidido_en: string; bruto: string | null; nota: string | null
  aviso: { asunto: string | null; remitente: string | null } | null
  comprobante: { punto_venta: number; numero: number } | null
}

const COLUMNAS = 'que, gmail_message_id, linea_orden, recibido_en, remitente, compania, cuit_compania, numero, siniestro, detalle, bruto, asunto, pdfs_drive'

/** Cuántas facturas se ofrecen para elegir: la más probable y algunas más. */
const CANDIDATAS = 6
/** Cuántas decisiones se muestran para poder deshacerlas: las últimas. */
const DECISIONES = 15

/** La base todavía no tiene la M7 (las columnas nuevas de vw_revisar y la tabla imputacion): la app
 *  puede estar publicada antes de que se aplique, y no por eso tiene que mostrar un error. */
export const TODAVIA_NO = 'todavia_no'

/** Códigos con los que PostgREST dice que una columna o una vista no existe. */
const SIN_M7 = new Set(['42703', '42P01', 'PGRST204', 'PGRST205'])

/** Todo lo que espera a una persona. Lo que la base devuelva con un "que" que esta app no conoce, no se
 *  muestra mal: se deja afuera (aparece cuando la app lo aprenda). */
export async function leerPorRevisar(base: ClienteBase | null = null): Promise<Resultado<readonly CosaPorRevisar[] | typeof TODAVIA_NO>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('vw_revisar').select(COLUMNAS).order('recibido_en', { ascending: false })
  if (r.error !== null) return r.error.code !== undefined && SIN_M7.has(r.error.code) ? bien(TODAVIA_NO) : mal(clasificar(r.error))
  return bien((r.data as unknown as FilaRevisar[]).flatMap((f) => (esQueRevisar(f.que) ? [{
    gmailMessageId: f.gmail_message_id,
    lineaOrden: f.linea_orden,
    que: f.que,
    recibido: f.recibido_en,
    remitente: f.remitente,
    compania: f.compania,
    cuitCompania: f.cuit_compania,
    numero: f.numero,
    siniestro: f.siniestro,
    detalle: f.detalle,
    bruto: f.bruto === null ? null : String(f.bruto),
    asunto: f.asunto,
    pdfsDrive: f.pdfs_drive ?? [],
  }] : [])))
}

/** Las facturas que pueden ser las de un aviso o un renglón, la más probable primero. */
export async function leerCandidatas(
  c: Pick<CosaPorRevisar, 'gmailMessageId' | 'lineaOrden'>,
  base: ClienteBase | null = null,
): Promise<Resultado<readonly Candidata[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const consulta = cliente.dato
    .from('vw_revisar_candidatas')
    .select('id_comprobante, punto_venta, numero, fecha_emision, total, falta, mismo_numero')
    .eq('gmail_message_id', c.gmailMessageId)
  const r = await (c.lineaOrden === null ? consulta.is('linea_orden', null) : consulta.eq('linea_orden', c.lineaOrden))
    .order('orden')
    .limit(CANDIDATAS)
  if (r.error !== null) return mal(clasificar(r.error))
  return bien((r.data as unknown as FilaCandidata[]).map((f) => ({
    idComprobante: f.id_comprobante,
    puntoVenta: f.punto_venta,
    numero: f.numero,
    fecha: f.fecha_emision,
    total: String(f.total),
    falta: f.falta === null ? null : String(f.falta),
    mismoNumero: f.mismo_numero,
  })))
}

/** "Es de esta factura". `bruto`: lo que el aviso dice que pagó ("1234.56"), o nulo si no lo dice. En un
 *  renglón va nulo: vale el importe del renglón. Quién lo decidió lo pone la base. */
export async function vincularConFactura(
  c: Pick<CosaPorRevisar, 'gmailMessageId' | 'lineaOrden'>,
  idComprobante: number,
  bruto: string | null,
  base: ClienteBase | null = null,
): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('imputacion').insert({
    gmail_message_id: c.gmailMessageId,
    linea_orden: c.lineaOrden,
    decision: 'vincula',
    id_comprobante: idComprobante,
    // El generador tipa NUMERIC como number; PostgREST acepta el texto y no se pierde ningún centavo.
    bruto: bruto as unknown as number | null,
  })
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** "No es un pago": sale de Revisar sin pagar nada. */
export async function descartar(
  c: Pick<CosaPorRevisar, 'gmailMessageId' | 'lineaOrden'>,
  nota: string | null,
  base: ClienteBase | null = null,
): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato.from('imputacion').insert({
    gmail_message_id: c.gmailMessageId,
    linea_orden: c.lineaOrden,
    decision: 'descarta',
    nota: nota !== null && nota.trim() !== '' ? nota.trim() : null,
  })
  return r.error !== null ? mal(clasificar(r.error)) : bien(null)
}

/** Las últimas decisiones vigentes, para poder deshacer una equivocada. */
export async function leerDecisiones(base: ClienteBase | null = null): Promise<Resultado<readonly Decision[]>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato
    .from('imputacion')
    .select('id_imputacion, decision, decidido_en, bruto, nota, aviso(asunto, remitente), comprobante(punto_venta, numero)')
    .is('deshecho_en', null)
    .order('decidido_en', { ascending: false })
    .limit(DECISIONES)
  if (r.error !== null) return mal(clasificar(r.error))
  return bien((r.data as unknown as FilaDecision[]).map((f) => ({
    idImputacion: f.id_imputacion,
    decision: f.decision === 'vincula' ? 'vincula' : 'descarta',
    decididoEn: f.decidido_en,
    asunto: f.aviso?.asunto ?? null,
    remitente: f.aviso?.remitente ?? null,
    factura: f.comprobante === null ? null : { puntoVenta: f.comprobante.punto_venta, numero: f.comprobante.numero },
    bruto: f.bruto === null ? null : String(f.bruto),
    nota: f.nota,
  })))
}

/** Deshace una decisión: vuelve a Revisar, y si pagaba una factura, deja de pagarla. No borra nada. */
export async function deshacerDecision(idImputacion: number, base: ClienteBase | null = null): Promise<Resultado<null>> {
  const cliente = await clienteConSesion(base)
  if (!cliente.ok) return cliente
  const r = await cliente.dato
    .from('imputacion')
    .update({ deshecho_en: new Date().toISOString() })
    .eq('id_imputacion', idImputacion)
    .is('deshecho_en', null)
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

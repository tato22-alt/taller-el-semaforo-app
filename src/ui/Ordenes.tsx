/* Órdenes de trabajo: que ninguna venza sin facturar. Spec 010 de semaforo-base.
 *
 * Arriba, si hay, las que el robot adivinó del mail de una persona y alguien tiene que confirmar
 * (RF-1014). Después lo que hay que atender (por vencer y vencidas hace poco), ordenado por monto: la
 * base lo manda así. Después las vigentes, las vencidas sin factura de hace tiempo (plegadas, RF-1013)
 * y al final las resueltas. Nadie las carga: las sube el robot cuando llegan por mail (RF-1005), y
 * nadie las borra: la que no se hizo se cierra. La pantalla pinta y llama: qué grupo y qué frase lo
 * decide dominio/ordenes.ts. */

import { useCallback, useEffect, useState } from 'react'
import {
  anularOrden, cerrarOrden, confirmarOrden, desanularOrden, descartarOrden, deshacerCierre, deshacerDescarte,
  leerCompanias, leerOrdenes, type Compania,
} from '../datos/ordenes'
import { formatearPesos } from '../dominio/dinero'
import { formatearFecha, hoyEnElTaller } from '../dominio/fechas'
import {
  agruparOrdenes, DIAS_QUE_SE_MUESTRA_VENCIDA, estadoDeOrden, siniestroEnPalabras, siniestroTipeado, situacionEnPalabras,
  vencimientoEnPalabras, type Orden,
} from '../dominio/ordenes'
import { textoDeFallo, type Fallo, type Resultado } from '../dominio/resultado'
import { FacturaDeLaOrden } from './FacturaDeLaOrden'

/** Lo que queda anotado al tocar "No se hizo". */
const MOTIVO_NO_SE_HIZO = 'No se hizo'

export function Ordenes() {
  const [ordenes, setOrdenes] = useState<readonly Orden[] | Fallo | null>(null)
  const [companias, setCompanias] = useState<readonly Compania[]>([])
  const [fallo, setFallo] = useState<Fallo | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(() => {
    void leerOrdenes().then((r) => setOrdenes(r.ok ? r.dato : r.fallo))
  }, [])
  useEffect(cargar, [cargar])

  // La lista de compañías sólo hace falta si el robot dejó alguna orden sin saber de quién es: se
  // pide entonces, y una sola vez.
  const faltaCompania = ordenes !== null && !('tipo' in ordenes) && ordenes.some((o) => estadoDeOrden(o) === 'a_confirmar' && o.compania === null)
  useEffect(() => {
    if (!faltaCompania || companias.length > 0) return
    void leerCompanias().then((r) => (r.ok ? setCompanias(r.dato) : setFallo(r.fallo)))
  }, [faltaCompania, companias.length])

  /** Toda escritura pasa por acá: se hace, y se vuelve a leer de la base lo que quedó. */
  async function hacer(accion: () => Promise<Resultado<null>>): Promise<void> {
    setOcupado(true)
    setFallo(null)
    const r = await accion()
    if (!r.ok) setFallo(r.fallo)
    setOcupado(false)
    cargar()
  }

  if (ordenes === null) return <p className="apagado">Buscando órdenes de trabajo…</p>
  if ('tipo' in ordenes) return <p className="error tarjeta">{textoDeFallo(ordenes)}</p>

  const { paraConfirmar, paraAtender, vigentes, vencidasViejas, resueltas } = agruparOrdenes(ordenes)
  const tarjeta = (o: Orden) => <TarjetaOrden key={o.id} orden={o} companias={companias} ocupado={ocupado} hacer={hacer} />

  return (
    <div className="ordenes">
      <h2>Órdenes de trabajo</h2>
      <p className="apagado">Llegan solas: el robot las toma del mail.</p>
      {fallo !== null && <p className="error">{textoDeFallo(fallo)}</p>}

      {paraConfirmar.length > 0 && (
        <section className="para-confirmar">
          <h3>Para confirmar ({paraConfirmar.length})</h3>
          <p className="apagado">
            Llegaron del mail de una persona y parecen órdenes. Hasta que digas que sí, no cuentan para los avisos.
          </p>
          {paraConfirmar.map(tarjeta)}
        </section>
      )}

      <section>
        <h3>Para atender ({paraAtender.length})</h3>
        {paraAtender.length === 0 && <p className="apagado">Ninguna orden por vencer en los próximos 30 días.</p>}
        {paraAtender.map(tarjeta)}
      </section>

      <section>
        <h3>Vigentes ({vigentes.length})</h3>
        {vigentes.map(tarjeta)}
      </section>

      {vencidasViejas.length > 0 && (
        <details>
          <summary>Vencidas sin factura ({vencidasViejas.length})</summary>
          <p className="apagado">
            Vencieron hace más de {DIAS_QUE_SE_MUESTRA_VENCIDA} días y nadie las facturó. Si el trabajo no se hizo, tocá «No se hizo» y salen de acá.
          </p>
          {vencidasViejas.map(tarjeta)}
        </details>
      )}

      {resueltas.length > 0 && (
        <details>
          <summary>Resueltas ({resueltas.length})</summary>
          {resueltas.map(tarjeta)}
        </details>
      )}
    </div>
  )
}

type Hacer = (accion: () => Promise<Resultado<null>>) => Promise<void>
type PropsTarjeta = { orden: Orden; companias: readonly Compania[]; ocupado: boolean; hacer: Hacer }

function TarjetaOrden({ orden: o, companias, ocupado, hacer }: PropsTarjeta) {
  const estado = estadoDeOrden(o)
  const situacion = situacionEnPalabras(o)
  return (
    <div className={`tarjeta orden orden-${estado}`}>
      <p className="orden-encabezado">
        <strong>{o.compania ?? 'Sin compañía'}</strong> · {siniestroEnPalabras(o.siniestro)}
        {o.patente !== null && <span className="patente">{o.patente}</span>}
        {o.vehiculo !== null && <span className="apagado">{o.vehiculo}</span>}
        <span className="monto">{o.montoAutorizado === null ? 'sin monto' : formatearPesos(o.montoAutorizado)}</span>
      </p>
      <p className="apagado">
        {estado === 'a_confirmar' && `Mail del ${formatearFecha(o.fechaEmision)} · si es una orden, ${vencimientoEnPalabras(o.diasParaVencer)}`}
        {estado !== 'a_confirmar' && (situacion ?? `${vencimientoEnPalabras(o.diasParaVencer)} (${formatearFecha(o.vence)})`)}
        {o.perito !== null && ` · perito ${o.perito}`}
      </p>
      {o.observaciones !== null && <p className="apagado">{o.observaciones}</p>}
      {estado === 'a_confirmar' && <AccionesParaConfirmar orden={o} companias={companias} ocupado={ocupado} hacer={hacer} />}
      {estado !== 'a_confirmar' && estado !== 'descartada' && estado !== 'cerrada' && <FacturaDeLaOrden orden={o} ocupado={ocupado} hacer={hacer} />}
      {(estado === 'por_vencer' || estado === 'vigente' || estado === 'vencida') && (
        <p className="acciones">
          <button
            type="button"
            className="enlace"
            disabled={ocupado}
            onClick={() => {
              if (window.confirm(`¿La compañía anuló la orden del ${siniestroEnPalabras(o.siniestro)}?`)) {
                void hacer(() => anularOrden(o.id, hoyEnElTaller(), null))
              }
            }}
          >
            La anularon
          </button>
          <button
            type="button"
            className="enlace"
            disabled={ocupado}
            onClick={() => {
              if (window.confirm(
                `¿El trabajo del ${siniestroEnPalabras(o.siniestro)} no se hizo? La orden sale de los avisos y queda anotada como «No se hizo», con la fecha de hoy. Se puede deshacer.`,
              )) {
                void hacer(() => cerrarOrden(o.id, hoyEnElTaller(), MOTIVO_NO_SE_HIZO))
              }
            }}
          >
            No se hizo
          </button>
        </p>
      )}
      {estado === 'anulada' && (
        <p className="acciones">
          <button
            type="button"
            className="enlace"
            disabled={ocupado}
            onClick={() => {
              if (window.confirm(`¿La orden del ${siniestroEnPalabras(o.siniestro)} sigue vigente? Vuelve a contar para los avisos.`)) {
                void hacer(() => desanularOrden(o.id))
              }
            }}
          >
            No la anularon
          </button>
        </p>
      )}
      {(estado === 'cerrada' || estado === 'descartada') && (
        <p className="acciones">
          <button
            type="button"
            className="enlace"
            disabled={ocupado}
            onClick={() => void hacer(() => (estado === 'cerrada' ? deshacerCierre(o.id) : deshacerDescarte(o.id)))}
          >
            Deshacer
          </button>
        </p>
      )}
    </div>
  )
}

/** "Es una orden" o "No es una orden": dos toques (RF-1014). Si el robot no supo la compañía, primero
 *  se elige de la lista. Si no pudo leer el número de siniestro, se escribe en un campo corto: es lo
 *  único que se tipea en esta pantalla, y sólo en ese caso. Mientras falte algo, "Es una orden" no se
 *  puede tocar (y si se pudiera, la base la rechazaría igual). */
function AccionesParaConfirmar({ orden: o, companias, ocupado, hacer }: PropsTarjeta) {
  const [cuit, setCuit] = useState('')
  const [numero, setNumero] = useState('')
  const faltaElegir = o.compania === null
  const faltaSiniestro = o.siniestro === null
  const siniestro = siniestroTipeado(numero)
  const falta = (faltaElegir && cuit === '') || (faltaSiniestro && siniestro === null)
  return (
    <p className="acciones">
      {faltaElegir && (
        <select aria-label="De qué compañía es" value={cuit} onChange={(e) => setCuit(e.target.value)} disabled={ocupado}>
          <option value="">¿De qué compañía es?</option>
          {companias.map((c) => (
            <option key={c.cuit} value={c.cuit}>{c.nombre}</option>
          ))}
        </select>
      )}
      {faltaSiniestro && (
        <input
          type="text"
          aria-label="Número de siniestro"
          placeholder="N.º de siniestro"
          size={16}
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          disabled={ocupado}
        />
      )}
      <button
        type="button"
        disabled={ocupado || falta}
        onClick={() => void hacer(() => confirmarOrden(o.id, faltaElegir ? cuit : null, faltaSiniestro ? siniestro : null))}
      >
        Es una orden
      </button>
      <button type="button" className="enlace" disabled={ocupado} onClick={() => void hacer(() => descartarOrden(o.id, hoyEnElTaller()))}>
        No es una orden
      </button>
    </p>
  )
}

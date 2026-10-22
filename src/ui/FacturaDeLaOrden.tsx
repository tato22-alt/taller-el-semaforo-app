/* La factura de una orden, en su tarjeta. Spec 012 de semaforo-base.
 *
 * Si ya tiene, dice cuál y deja deshacerla ("No es ésta", RF-1204). Si no, a pedido busca las
 * candidatas y pregunta por la más probable: "¿Es la 2-3553 del 26/08/2026?". Un toque la vincula; si
 * no es, se elige otra de la lista (RF-1203). Nunca se vincula sola por parecido: eso lo hace la base
 * sólo cuando el mail de la factura lo dice sin dudas. */

import { useState } from 'react'
import { desvincularFacturas, leerPropuestas, vincularFactura, type FacturaPropuesta } from '../datos/orden-factura'
import { formatearPesos } from '../dominio/dinero'
import { formatearFecha } from '../dominio/fechas'
import { siniestroEnPalabras, type Orden } from '../dominio/ordenes'
import { textoDeFallo, type Fallo, type Resultado } from '../dominio/resultado'

type Hacer = (accion: () => Promise<Resultado<null>>) => Promise<void>
type Props = { orden: Orden; ocupado: boolean; hacer: Hacer }

/** "2-3553 del 26/08/2026". */
function nombreDeFactura(f: FacturaPropuesta): string {
  return `${f.puntoVenta}-${f.numero} del ${formatearFecha(f.fecha)}`
}

export function FacturaDeLaOrden({ orden: o, ocupado, hacer }: Props) {
  const [propuestas, setPropuestas] = useState<readonly FacturaPropuesta[] | Fallo | null>(null)
  const [elegida, setElegida] = useState<number | null>(null)
  const [eligiendo, setEligiendo] = useState(false)

  if (o.facturada) {
    return (
      <p className="acciones factura">
        <span>
          Factura {o.facturas}
          {o.facturaPorMail && <span className="apagado"> · la vinculó el mail con que se mandó</span>}
        </span>
        <button
          type="button"
          className="enlace"
          disabled={ocupado}
          onClick={() => {
            if (window.confirm(`¿Esa factura no es la del ${siniestroEnPalabras(o.siniestro)}? La orden vuelve a quedar sin factura. Queda anotado.`)) {
              void hacer(() => desvincularFacturas(o.id))
            }
          }}
        >
          No es ésta
        </button>
      </p>
    )
  }

  if (propuestas === null) {
    return (
      <p className="acciones">
        <button
          type="button"
          className="enlace"
          disabled={ocupado}
          onClick={() => void leerPropuestas(o.id).then((r) => setPropuestas(r.ok ? r.dato : r.fallo))}
        >
          Buscar su factura
        </button>
      </p>
    )
  }
  if ('tipo' in propuestas) return <p className="error">{textoDeFallo(propuestas)}</p>
  if (propuestas.length === 0) {
    return (
      <p className="apagado">
        No hay facturas de {o.compania ?? 'esa compañía'} emitidas después de la orden y sin otra orden. Si ya se facturó, subí el CSV de ARCA del mes.
      </p>
    )
  }

  const primera = propuestas[0] as FacturaPropuesta
  if (!eligiendo) {
    return (
      <p className="acciones">
        <span>
          ¿Es la {nombreDeFactura(primera)} ({formatearPesos(primera.total)})?
          {primera.porMail && <span className="apagado"> · se mandó con este siniestro</span>}
        </span>
        <button type="button" disabled={ocupado} onClick={() => void hacer(() => vincularFactura(o.id, primera.idComprobante))}>
          Sí, es ésta
        </button>
        {propuestas.length > 1 && (
          <button type="button" className="enlace" disabled={ocupado} onClick={() => setEligiendo(true)}>
            Es otra
          </button>
        )}
      </p>
    )
  }

  return (
    <p className="acciones">
      <select aria-label="Qué factura es" value={elegida ?? ''} onChange={(e) => setElegida(e.target.value === '' ? null : Number(e.target.value))} disabled={ocupado}>
        <option value="">¿Cuál es?</option>
        {propuestas.map((f) => (
          <option key={f.idComprobante} value={f.idComprobante}>{nombreDeFactura(f)} · {formatearPesos(f.total)}</option>
        ))}
      </select>
      <button type="button" disabled={ocupado || elegida === null} onClick={() => elegida !== null && void hacer(() => vincularFactura(o.id, elegida))}>
        Es ésta
      </button>
    </p>
  )
}

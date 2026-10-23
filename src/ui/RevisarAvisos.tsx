/* Revisar: los avisos de pago que el robot no pudo cerrar solo. Plan de la fase 2 de semaforo-base, M7.
 *
 * Por compañía, la que más tiene primero: así se ve a cuál le falta un lector. Cada aviso se resuelve
 * con un toque: de qué factura es (la base ya ordenó las que pueden ser) o que no es un pago. Abajo, lo
 * ya decidido, para deshacer lo equivocado. La pantalla no decide ni calcula nada: pinta y llama. */

import { useCallback, useEffect, useState } from 'react'
import { TODAVIA_NO, deshacerDecision, descartar, leerCandidatas, leerDecisiones, leerPorRevisar, vincularConFactura } from '../datos/avisos'
import { formatearPesos } from '../dominio/dinero'
import { formatearFecha } from '../dominio/fechas'
import { RESIDUO_EN_PESOS } from '../dominio/ordenes'
import { textoDeFallo, type Fallo, type Resultado } from '../dominio/resultado'
import {
  agruparPorCompania,
  claveDe,
  enlaceAlPdf,
  esDeUnRenglon,
  estadoDeCandidata,
  importeEscrito,
  puedeVincular,
  queEnPalabras,
  type Candidata,
  type CosaPorRevisar,
  type Decision,
} from '../dominio/revisar-avisos'

const numero = (c: { puntoVenta: number; numero: number }) => `${String(c.puntoVenta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`

type Decidir = (accion: () => Promise<Resultado<null>>) => Promise<void>

export function RevisarAvisos() {
  const [cosas, setCosas] = useState<readonly CosaPorRevisar[] | typeof TODAVIA_NO | Fallo | null>(null)
  const [decisiones, setDecisiones] = useState<readonly Decision[]>([])
  const [fallo, setFallo] = useState<Fallo | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(() => {
    void leerPorRevisar().then((r) => setCosas(r.ok ? r.dato : r.fallo))
    void leerDecisiones().then((r) => setDecisiones(r.ok ? r.dato : []))
  }, [])
  useEffect(cargar, [cargar])

  /** Toda escritura pasa por acá: se hace, y se vuelve a leer de la base lo que quedó. */
  const decidir: Decidir = async (accion) => {
    setOcupado(true)
    setFallo(null)
    const r = await accion()
    if (!r.ok) setFallo(r.fallo)
    setOcupado(false)
    cargar()
  }

  if (cosas === null) return <p className="apagado">Buscando avisos de pago para revisar…</p>
  if (cosas === TODAVIA_NO) {
    return (
      <section className="revisar-avisos">
        <h3>Avisos de pago</h3>
        <p className="apagado">Esta parte se activa con la próxima actualización de la base.</p>
      </section>
    )
  }
  if ('tipo' in cosas) return <p className="error tarjeta">{textoDeFallo(cosas)}</p>

  const grupos = agruparPorCompania(cosas)
  return (
    <section className="revisar-avisos">
      <h3>Avisos de pago ({cosas.length})</h3>
      <p className="apagado">
        Lo que el robot no pudo cerrar solo. Cada uno se resuelve con un toque: de qué factura es, o que no es un pago.
      </p>
      {fallo !== null && <p className="error">{textoDeFallo(fallo)}</p>}
      {cosas.length === 0 && <p className="apagado">No queda ningún aviso por revisar.</p>}
      {grupos.map((g, i) => (
        <details key={g.nombre} open={i === 0}>
          <summary>{g.nombre} ({g.cosas.length})</summary>
          {g.cosas.map((c) => <AvisoPorRevisar key={claveDe(c)} cosa={c} ocupado={ocupado} decidir={decidir} />)}
        </details>
      ))}
      {decisiones.length > 0 && (
        <details>
          <summary>Lo último que se decidió ({decisiones.length})</summary>
          <ul className="notas">
            {decisiones.map((d) => (
              <li key={d.idImputacion}>
                {d.decision === 'vincula'
                  ? `Factura ${d.factura ? numero(d.factura) : '—'}${d.bruto !== null ? ` · pagó ${formatearPesos(d.bruto)}` : ''}`
                  : 'No es un pago'}
                {' · '}{d.asunto ?? d.remitente ?? 'aviso'}
                <button type="button" className="enlace" disabled={ocupado} onClick={() => void decidir(() => deshacerDecision(d.idImputacion))}>
                  Deshacer
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

type Importe = 'toda' | 'otro' | 'no_dice'

function AvisoPorRevisar({ cosa, ocupado, decidir }: { cosa: CosaPorRevisar; ocupado: boolean; decidir: Decidir }) {
  const [candidatas, setCandidatas] = useState<readonly Candidata[] | Fallo | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [elegida, setElegida] = useState<Candidata | null>(null)
  const [importe, setImporte] = useState<Importe>('toda')
  const [otro, setOtro] = useState('')
  const renglon = esDeUnRenglon(cosa)

  function abrir() {
    setAbierto(true)
    void leerCandidatas(cosa).then((r) => setCandidatas(r.ok ? r.dato : r.fallo))
  }

  // En un renglón vale su importe. En un aviso entero, lo que diga la persona.
  const otroEscrito = importeEscrito(otro)
  const bruto = renglon || elegida === null ? null : importe === 'toda' ? elegida.total : importe === 'otro' ? otroEscrito : null
  const sePuede = elegida !== null && (renglon || importe !== 'otro' || otroEscrito !== null)

  return (
    <div className="tarjeta nota">
      <p>
        <strong>{queEnPalabras(cosa.que)}</strong> · {formatearFecha(cosa.recibido)}
        <br />
        <span className="apagado">{cosa.asunto !== null && cosa.asunto !== '' ? cosa.asunto : '(sin asunto)'} · {cosa.remitente}</span>
      </p>
      {renglon && (
        <p>
          {cosa.numero !== null ? `Dice factura ${cosa.numero}` : `Dice siniestro ${cosa.siniestro ?? '—'}`}
          {cosa.bruto !== null && ` · ${formatearPesos(cosa.bruto)}`}
        </p>
      )}
      {cosa.detalle !== null && <p className="apagado">{cosa.detalle}</p>}
      {cosa.pdfsDrive.length > 0 && (
        <p>
          {cosa.pdfsDrive.map((id, i) => (
            <a key={id} href={enlaceAlPdf(id)} target="_blank" rel="noreferrer">
              {cosa.pdfsDrive.length === 1 ? 'Ver el PDF' : `PDF ${i + 1}`}{' '}
            </a>
          ))}
        </p>
      )}

      {!abierto ? (
        <p className="acciones">
          {puedeVincular(cosa) && <button type="button" disabled={ocupado} onClick={abrir}>Es de una factura</button>}
          <button type="button" className="enlace" disabled={ocupado} onClick={() => void decidir(() => descartar(cosa, null))}>
            No es un pago
          </button>
        </p>
      ) : (
        <>
          {candidatas === null && <p className="apagado">Buscando las facturas de {cosa.compania ?? 'la compañía'}…</p>}
          {candidatas !== null && 'tipo' in candidatas && <p className="error">{textoDeFallo(candidatas)}</p>}
          {candidatas !== null && !('tipo' in candidatas) && (
            <>
              {candidatas.length === 0 && <p className="apagado">No hay facturas de esta compañía emitidas antes del aviso.</p>}
              <ul className="opciones">
                {candidatas.map((f) => (
                  <li key={f.idComprobante}>
                    <label>
                      <input type="radio" name={`factura-${claveDe(cosa)}`} checked={elegida?.idComprobante === f.idComprobante} onChange={() => setElegida(f)} />{' '}
                      Factura {numero(f)} · {formatearFecha(f.fecha)} · {formatearPesos(f.total)}
                      <span className="apagado"> · {textoDeCandidata(f)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {!renglon && elegida !== null && <p>¿Cuánto pagó de esa factura?</p>}
              {!renglon && elegida !== null && (
                <ul className="opciones">
                  <li><label><input type="radio" name={`importe-${claveDe(cosa)}`} checked={importe === 'toda'} onChange={() => setImporte('toda')} /> Pagó toda la factura ({formatearPesos(elegida.total)})</label></li>
                  <li>
                    <label><input type="radio" name={`importe-${claveDe(cosa)}`} checked={importe === 'otro'} onChange={() => setImporte('otro')} /> Pagó otro importe:</label>
                    <input value={otro} onChange={(e) => { setOtro(e.target.value); setImporte('otro') }} inputMode="decimal" placeholder="1.234.567,89" aria-label="Importe que pagó" />
                    {importe === 'otro' && otro !== '' && otroEscrito === null && <span className="error">No entiendo ese importe.</span>}
                  </li>
                  <li><label><input type="radio" name={`importe-${claveDe(cosa)}`} checked={importe === 'no_dice'} onChange={() => setImporte('no_dice')} /> El aviso no dice cuánto</label></li>
                </ul>
              )}
              <p className="acciones">
                <button type="button" disabled={ocupado || !sePuede} onClick={() => elegida !== null && void decidir(() => vincularConFactura(cosa, elegida.idComprobante, bruto))}>
                  Confirmar
                </button>
                <button type="button" className="enlace" disabled={ocupado} onClick={() => setAbierto(false)}>Cancelar</button>
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}

function textoDeCandidata(f: Candidata): string {
  const estado = estadoDeCandidata(f, RESIDUO_EN_PESOS)
  const prefijo = f.mismoNumero ? 'mismo número · ' : ''
  if (estado === 'pagada') return `${prefijo}ya figura pagada`
  if (estado === 'le_falta') return `${prefijo}le falta ${formatearPesos(f.falta)}`
  return `${prefijo}sin avisos de pago`
}

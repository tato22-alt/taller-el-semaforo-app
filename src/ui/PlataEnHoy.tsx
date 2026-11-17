/* La plata de los particulares, dentro de Hoy. Spec 013 de semaforo-base, RF-1305 a RF-1309.
 *
 * Tres cosas, en dos partes de la pantalla: la pregunta de la plata de cada auto que salió, quién debe (con su recordatorio de
 * WhatsApp, que manda una persona, y «Pagó»), y lo anotado esta semana, para deshacerlo. Los saldos y
 * los días los trae la base. Si la base todavía no tiene la migración, esto no muestra nada y Hoy
 * sigue igual que antes. */

import { useCallback, useEffect, useState } from 'react'
import { TODAVIA_NO, anotarPago, deshacerCobro, deshacerDeuda, leerPlataDeParticulares, type PlataDeParticulares } from '../datos/particulares'
import { leerTeDeben } from '../datos/plata'
import { formatearPesos } from '../dominio/dinero'
import { formatearFecha, hoyEnElTaller } from '../dominio/fechas'
import { recordatorioDeDeuda } from '../dominio/mensajes'
import { autoEnPalabras, desdeCuandoDebe, deudasPorCobrar, esPositivo, leerMonto, montoParaCorregir, pagaDeMas, type Deuda } from '../dominio/particulares'
import { textoDeFallo, type Fallo, type Resultado } from '../dominio/resultado'
import { linkDeWhatsApp } from '../dominio/telefono'
import { AnotarDeuda } from './AnotarDeuda'
import { PreguntaDeLaPlata } from './PreguntaDeLaPlata'

type Hacer = (accion: () => Promise<Resultado<null>>) => Promise<void>

type Estado = {
  readonly plata: PlataDeParticulares | typeof TODAVIA_NO | Fallo | null
  readonly totalQueDeben: string | null
  readonly fallo: Fallo | null
  readonly ocupado: boolean
  readonly hacer: Hacer
}

/** Lo que Hoy necesita de la plata, leído una vez para sus dos partes. `vuelta` cambia cada vez que
 *  Hoy anota un toque: un «Salió» nuevo trae una pregunta nueva. */
export function usarPlata(vuelta: number): Estado {
  const [plata, setPlata] = useState<Estado['plata']>(null)
  const [totalQueDeben, setTotalQueDeben] = useState<string | null>(null)
  const [fallo, setFallo] = useState<Fallo | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(() => {
    void leerPlataDeParticulares().then((r) => {
      setPlata(r.ok ? r.dato : r.fallo)
      // El total sólo se pide si la base ya tiene la migración: si no, sería un error a la vista.
      if (r.ok && r.dato !== TODAVIA_NO) {
        void leerTeDeben().then((t) => setTotalQueDeben(t.ok ? (t.dato.find((d) => d.quien === 'particulares')?.monto ?? null) : null))
      }
    })
  }, [])
  useEffect(cargar, [cargar, vuelta])

  /** Toda escritura pasa por acá: se hace, y se vuelve a leer de la base lo que quedó. */
  const hacer: Hacer = async (accion) => {
    setOcupado(true)
    setFallo(null)
    const r = await accion()
    if (!r.ok) setFallo(r.fallo)
    setOcupado(false)
    cargar()
  }

  return { plata, totalQueDeben, fallo, ocupado, hacer }
}

/** Arriba de todo: la pregunta de cada auto que salió y todavía no tiene la plata anotada. */
export function PreguntasDeLaPlata({ estado }: { estado: Estado }) {
  const { plata, fallo, ocupado, hacer } = estado
  if (plata === null || plata === TODAVIA_NO) return null
  if ('tipo' in plata) return <p className="error">{textoDeFallo(plata)}</p>
  return (
    <>
      {fallo !== null && <p className="error">{textoDeFallo(fallo)}</p>}
      {plata.sinContestar.length > 0 && (
        <section>
          <h3>La plata de los autos que salieron ({plata.sinContestar.length})</h3>
          {plata.sinContestar.map((s) => <PreguntaDeLaPlata key={s.idSalida} salida={s} ocupado={ocupado} hacer={hacer} />)}
        </section>
      )}
    </>
  )
}

/** Quién debe, anotar una deuda, y lo anotado esta semana. */
export function LoQueDeben({ estado }: { estado: Estado }) {
  const { plata, totalQueDeben, ocupado, hacer } = estado
  if (plata === null || plata === TODAVIA_NO || 'tipo' in plata) return null

  const deben = deudasPorCobrar(plata.deudas)
  const anotado = plata.cobrosRecientes.length + plata.deudasRecientes.length

  return (
    <>
      <section>
        <h3>
          Te deben ({deben.length})
          {deben.length > 0 && totalQueDeben !== null && <span className="monto-reclamar"> · {formatearPesos(totalQueDeben)}</span>}
        </h3>
        {deben.length === 0 && <p className="apagado">Ningún particular anotado como deudor.</p>}
        {/* La clave lleva el saldo: después de un pago parcial, la tarjeta propone el saldo nuevo. */}
        {deben.map((d) => <TarjetaDeuda key={`${d.idDeuda}-${d.saldo}`} deuda={d} ocupado={ocupado} hacer={hacer} />)}
        <AnotarDeuda ocupado={ocupado} hacer={hacer} />
      </section>

      {anotado > 0 && (
        <details>
          <summary>Anotado esta semana ({anotado})</summary>
          <p className="apagado">Lo que se anotó de la plata en los últimos siete días. Si algo está mal, se deshace y se anota de nuevo.</p>
          {plata.deudasRecientes.map((d) => (
            <p key={`d${d.idDeuda}`} className="auto-linea">
              <span>{formatearFecha(d.fecha)}</span> <strong>{d.deudor}</strong> quedó debiendo {formatearPesos(d.monto)}
              <span className="apagado">{autoEnPalabras(d)}</span>
              <Deshacer que={`la deuda de ${d.deudor}`} ocupado={ocupado} alConfirmar={() => void hacer(() => deshacerDeuda(d.idDeuda))} />
            </p>
          ))}
          {plata.cobrosRecientes.map((c) => (
            <p key={`c${c.idCobro}`} className="auto-linea">
              <span>{formatearFecha(c.fecha)}</span> <strong>{c.quien ?? 'Sin nombre'}</strong>{' '}
              {esPositivo(c.monto) ? `pagó ${formatearPesos(c.monto)}` : 'no pagó nada (de seguro)'}
              <span className="apagado">{c.cuando === 'deuda' ? 'de lo que debía' : 'al retirar'} · {autoEnPalabras(c)}</span>
              <Deshacer que={`el cobro a ${c.quien ?? 'ese cliente'}`} ocupado={ocupado} alConfirmar={() => void hacer(() => deshacerCobro(c.idCobro))} />
            </p>
          ))}
        </details>
      )}
    </>
  )
}

function Deshacer({ que, ocupado, alConfirmar }: { que: string; ocupado: boolean; alConfirmar: () => void }) {
  return (
    <button type="button" className="enlace" disabled={ocupado} onClick={() => { if (window.confirm(`¿Deshacer ${que}? Se borra lo anotado.`)) alConfirmar() }}>
      Deshacer
    </button>
  )
}

/** Quién debe, cuánto y desde cuándo, con el recordatorio armado y «Pagó». */
function TarjetaDeuda({ deuda: d, ocupado, hacer }: { deuda: Deuda; ocupado: boolean; hacer: Hacer }) {
  const hoy = hoyEnElTaller()
  const [monto, setMonto] = useState(montoParaCorregir(d.saldo))
  const [fecha, setFecha] = useState(hoy)
  const [aviso, setAviso] = useState<string | null>(null)
  const auto = autoEnPalabras(d)

  function pagar(): void {
    const importe = leerMonto(monto)
    if (importe === null || !esPositivo(importe)) return setAviso('Escribí cuánto pagó, así: 150.000 o 150.000,50.')
    if (pagaDeMas(importe, d.saldo) && !window.confirm(`Es más de lo que debe (${formatearPesos(d.saldo)}). ¿Lo anoto igual?`)) return
    setAviso(null)
    void hacer(() => anotarPago(d.idDeuda, importe, fecha))
  }

  return (
    <div className="tarjeta auto plata-deuda">
      <p className="auto-encabezado">
        <strong>{d.deudor}</strong>
        <span className="monto-reclamar">{formatearPesos(d.saldo)}</span>
        <span className="apagado">{desdeCuandoDebe(d.dias)}</span>
      </p>
      <p className="apagado">
        {auto}
        {d.numeroPresupuesto !== null && <> · N.º {d.numeroPresupuesto}</>}
        {d.pagos > 0 && <> · debía {formatearPesos(d.monto)}, ya pagó {formatearPesos(d.pagado)}</>}
      </p>
      <p>
        <a className="whatsapp" href={linkDeWhatsApp(d.telefono, recordatorioDeDeuda({ deudor: d.deudor, auto, saldo: formatearPesos(d.saldo) }))} target="_blank" rel="noreferrer">
          Recordárselo por WhatsApp
        </a>
      </p>
      <div className="acciones">
        <input inputMode="decimal" aria-label={`Cuánto pagó ${d.deudor}`} value={monto} onChange={(e) => setMonto(e.target.value)} disabled={ocupado} />
        <button type="button" disabled={ocupado} onClick={pagar}>Pagó</button>
        <details className="plegado">
          <summary>{fecha === hoy ? '¿Fue otro día?' : `Fecha: ${formatearFecha(fecha)}`}</summary>
          <input type="date" aria-label="Qué día pagó" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value === '' ? hoy : e.target.value)} disabled={ocupado} />
        </details>
      </div>
      {aviso !== null && <p className="error">{aviso}</p>}
    </div>
  )
}

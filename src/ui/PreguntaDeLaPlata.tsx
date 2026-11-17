/* "¿Qué pasó con la plata?", por cada auto que salió. Spec 013 de semaforo-base, RF-1305 y RF-1306.
 *
 * Cuatro respuestas de un toque. "Pagó todo" propone el total del presupuesto, que se puede corregir;
 * "Quedó debiendo" propone como deudor al cliente del presupuesto, que se puede cambiar. La tarjeta
 * pinta y llama: qué se anota por cada respuesta lo decide dominio/particulares.ts. */

import { useState } from 'react'
import { anotarAlSalir } from '../datos/particulares'
import { antiguedadEnPalabras, formatearFecha } from '../dominio/fechas'
import { RESPUESTAS, montoParaCorregir, paraAnotar, respuestaEnPalabras, type Respuesta, type Salida } from '../dominio/particulares'
import type { Resultado } from '../dominio/resultado'

type Props = { salida: Salida; ocupado: boolean; hacer: (accion: () => Promise<Resultado<null>>) => Promise<void> }

export function PreguntaDeLaPlata({ salida: s, ocupado, hacer }: Props) {
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null)
  const [monto, setMonto] = useState('')
  const [pagoAhora, setPagoAhora] = useState('')
  const [deudor, setDeudor] = useState(s.cliente ?? '')
  const [telefono, setTelefono] = useState(s.telefono ?? '')
  const [aviso, setAviso] = useState<string | null>(null)

  /** La plata de una salida lleva la fecha de la salida: se pagó, o se quedó debiendo, ese día. */
  function anotar(r: Respuesta): void {
    const que = paraAnotar(r, { monto, pagoAhora })
    if (!que.ok) return setAviso(que.motivo)
    if (que.deuda !== null && deudor.trim() === '') return setAviso('Falta quién debe.')
    setAviso(null)
    void hacer(() => anotarAlSalir(s.idSalida, { cobro: que.cobro, deuda: que.deuda, deudor, telefono: telefono.trim() || null }, s.salio))
  }

  function elegir(r: Respuesta): void {
    setAviso(null)
    if (r === 'seguro') return anotar(r)
    setRespuesta(r)
    setMonto(r === 'pago_todo' ? montoParaCorregir(s.totalPresupuesto) : '')
  }

  return (
    <div className="tarjeta auto plata-pregunta">
      <p className="auto-encabezado">
        <span className="patente">{s.patente ?? 'sin patente'}</span>
        {s.vehiculo !== null && <strong>{s.vehiculo}</strong>}
        {s.cliente !== null && <span className="apagado">{s.cliente}</span>}
        {s.numeroPresupuesto !== null && <span className="numero">N.º {s.numeroPresupuesto}</span>}
      </p>
      <p>
        Salió el {formatearFecha(s.salio)} <span className="apagado">({antiguedadEnPalabras(s.dias)})</span>. ¿Qué pasó con la plata?
      </p>
      <div className="acciones">
        {RESPUESTAS.map((r) => (
          <button key={r} type="button" disabled={ocupado} aria-pressed={respuesta === r} onClick={() => elegir(r)}>
            {respuestaEnPalabras(r)}
          </button>
        ))}
      </div>

      {respuesta !== null && respuesta !== 'seguro' && (
        <div className="plata-formulario">
          <label className="campo">
            {respuesta === 'quedo_debiendo' ? 'Cuánto quedó debiendo' : 'Cuánto pagó'}
            <input inputMode="decimal" placeholder="150.000" value={monto} onChange={(e) => setMonto(e.target.value)} disabled={ocupado} />
          </label>
          {respuesta === 'quedo_debiendo' && (
            <>
              <label className="campo">
                Quién debe
                <input value={deudor} onChange={(e) => setDeudor(e.target.value)} disabled={ocupado} />
              </label>
              <label className="campo">
                Teléfono, para recordárselo
                <input inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} disabled={ocupado} />
              </label>
              <label className="campo">
                Cuánto pagó ahora (si pagó algo)
                <input inputMode="decimal" placeholder="0" value={pagoAhora} onChange={(e) => setPagoAhora(e.target.value)} disabled={ocupado} />
              </label>
            </>
          )}
          <div className="acciones">
            <button type="button" disabled={ocupado} onClick={() => anotar(respuesta)}>Anotar</button>
            <button type="button" className="enlace" disabled={ocupado} onClick={() => setRespuesta(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {aviso !== null && <p className="error">{aviso}</p>}
    </div>
  )
}

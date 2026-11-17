/* Anotar una deuda sin pasar por «Salió». Spec 013 de semaforo-base, decisión 6 del plan.
 *
 * Para quien ya debe plata desde antes de usar la app, o de un auto que salió sin que nadie tocara
 * nada. Se busca el presupuesto por patente; si el auto no tiene presupuesto acá, se escribe cuál es.
 * Quién debe se propone del presupuesto, y se puede cambiar (principio VII). */

import { useState, type FormEvent } from 'react'
import { buscarPorPatente, type TrabajoEncontrado } from '../datos/hitos'
import { anotarDeuda } from '../datos/particulares'
import { formatearFecha, hoyEnElTaller } from '../dominio/fechas'
import { faltaParaLaDeuda, leerMonto } from '../dominio/particulares'
import { textoDeFallo, type Fallo, type Resultado } from '../dominio/resultado'

type Props = { ocupado: boolean; hacer: (accion: () => Promise<Resultado<null>>) => Promise<void> }

export function AnotarDeuda({ ocupado, hacer }: Props) {
  const hoy = hoyEnElTaller()
  const [patente, setPatente] = useState('')
  const [encontrados, setEncontrados] = useState<readonly TrabajoEncontrado[] | Fallo | null>(null)
  const [trabajo, setTrabajo] = useState<TrabajoEncontrado | null>(null)
  const [detalle, setDetalle] = useState('')
  const [deudor, setDeudor] = useState('')
  const [telefono, setTelefono] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [aviso, setAviso] = useState<string | null>(null)

  async function buscar(e: FormEvent): Promise<void> {
    e.preventDefault()
    const r = await buscarPorPatente(patente)
    setEncontrados(r.ok ? r.dato : r.fallo)
  }

  function elegir(t: TrabajoEncontrado): void {
    setTrabajo(t)
    if (deudor.trim() === '') setDeudor(t.cliente ?? '')
  }

  async function anotar(): Promise<void> {
    const falta = faltaParaLaDeuda({ deudor, monto, conPresupuesto: trabajo !== null, detalle })
    if (falta !== null) return setAviso(falta)
    const importe = leerMonto(monto)
    if (importe === null) return
    setAviso(null)
    await hacer(() => anotarDeuda({ idTrabajo: trabajo?.idTrabajo ?? null, detalle: detalle.trim() || null, deudor, telefono: telefono.trim() || null, monto: importe, fecha }))
    setPatente(''); setEncontrados(null); setTrabajo(null); setDetalle(''); setDeudor(''); setTelefono(''); setMonto(''); setFecha(hoy)
  }

  return (
    <details className="plegado anotar-deuda">
      <summary>Anotar una deuda</summary>
      <p className="apagado">Para alguien que se llevó el auto y quedó debiendo. Aparece arriba, en «Te deben», hasta que pague.</p>

      {trabajo === null ? (
        <>
          <form className="buscar-presupuesto" onSubmit={(e) => void buscar(e)}>
            <input type="search" aria-label="Patente del auto que debe" placeholder="Patente" value={patente} onChange={(e) => setPatente(e.target.value)} />
            <button type="submit">Buscar el presupuesto</button>
          </form>
          {encontrados !== null && 'tipo' in encontrados && <p className="error">{textoDeFallo(encontrados)}</p>}
          {encontrados !== null && !('tipo' in encontrados) && encontrados.length === 0 && (
            <p className="apagado">No hay presupuestos con esa patente: escribí abajo de qué auto es.</p>
          )}
          {encontrados !== null && !('tipo' in encontrados) && encontrados.map((t) => (
            <p key={t.idTrabajo} className="auto-linea">
              <span className="patente">{t.patente ?? 'sin patente'}</span> {t.vehiculo} <span className="apagado">{t.cliente} · {formatearFecha(t.fecha)}</span>
              <button type="button" className="enlace" onClick={() => elegir(t)}>Es éste</button>
            </p>
          ))}
          <label className="campo">
            O, si no tiene presupuesto acá, qué auto es
            <input placeholder="Gol gris, AB123CD" value={detalle} onChange={(e) => setDetalle(e.target.value)} disabled={ocupado} />
          </label>
        </>
      ) : (
        <p className="auto-linea">
          <span className="patente">{trabajo.patente ?? 'sin patente'}</span> {trabajo.vehiculo}
          {trabajo.numeroPresupuesto !== null && <span className="numero">N.º {trabajo.numeroPresupuesto}</span>}
          <button type="button" className="enlace" onClick={() => setTrabajo(null)}>Cambiar</button>
        </p>
      )}

      <label className="campo">
        Quién debe
        <input value={deudor} onChange={(e) => setDeudor(e.target.value)} disabled={ocupado} />
      </label>
      <label className="campo">
        Teléfono, para recordárselo
        <input inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} disabled={ocupado} />
      </label>
      <label className="campo">
        Cuánto debe
        <input inputMode="decimal" placeholder="150.000" value={monto} onChange={(e) => setMonto(e.target.value)} disabled={ocupado} />
      </label>
      <label className="campo">
        Desde cuándo
        <input type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value === '' ? hoy : e.target.value)} disabled={ocupado} />
      </label>
      {aviso !== null && <p className="error">{aviso}</p>}
      <p>
        <button type="button" className="boton" disabled={ocupado} onClick={() => void anotar()}>Anotar la deuda</button>
      </p>
    </details>
  )
}

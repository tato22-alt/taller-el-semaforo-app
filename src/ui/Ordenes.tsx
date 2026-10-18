/* Órdenes de trabajo: que ninguna venza sin facturar. Spec 010 de semaforo-base.
 *
 * Arriba lo que hay que atender (por vencer y vencidas sin factura), ordenado por monto: la base lo
 * manda así. Después las vigentes, y al final las resueltas. Abajo, el formulario para cargar una
 * orden que llegó por portal o por WhatsApp. La pantalla pinta y llama: qué grupo, qué frase y qué
 * se puede borrar lo decide dominio/ordenes.ts. */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { anularOrden, borrarOrden, cargarOrden, leerCompanias, leerOrdenes, type Compania } from '../datos/ordenes'
import { formatearPesos } from '../dominio/dinero'
import { formatearFecha, hoyEnElTaller } from '../dominio/fechas'
import { agruparOrdenes, estadoDeOrden, sePuedeBorrar, validarOrden, vencimientoEnPalabras, type Formulario, type Orden } from '../dominio/ordenes'
import { textoDeFallo, type Fallo, type Resultado } from '../dominio/resultado'

const FORMULARIO_VACIO: Formulario = { cuitCompania: '', siniestro: '', patente: '', fechaEmision: hoyEnElTaller(), monto: '', perito: '' }

export function Ordenes() {
  const [ordenes, setOrdenes] = useState<readonly Orden[] | Fallo | null>(null)
  const [companias, setCompanias] = useState<readonly Compania[]>([])
  const [fallo, setFallo] = useState<Fallo | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(() => {
    void leerOrdenes().then((r) => setOrdenes(r.ok ? r.dato : r.fallo))
  }, [])
  useEffect(cargar, [cargar])
  useEffect(() => {
    void leerCompanias().then((r) => (r.ok ? setCompanias(r.dato) : setFallo(r.fallo)))
  }, [])

  /** Toda escritura pasa por acá: se hace, y se vuelve a leer de la base lo que quedó. */
  async function hacer(accion: () => Promise<Resultado<null>>): Promise<boolean> {
    setOcupado(true)
    setFallo(null)
    const r = await accion()
    if (!r.ok) setFallo(r.fallo)
    setOcupado(false)
    cargar()
    return r.ok
  }

  if (ordenes === null) return <p className="apagado">Buscando órdenes de trabajo…</p>
  if ('tipo' in ordenes) return <p className="error tarjeta">{textoDeFallo(ordenes)}</p>

  const { paraAtender, vigentes, resueltas } = agruparOrdenes(ordenes)

  return (
    <div className="ordenes">
      <h2>Órdenes de trabajo</h2>
      {fallo !== null && <p className="error">{textoDeFallo(fallo)}</p>}

      <section>
        <h3>Para atender ({paraAtender.length})</h3>
        {paraAtender.length === 0 && <p className="apagado">Ninguna orden por vencer en los próximos 30 días.</p>}
        {paraAtender.map((o) => (
          <TarjetaOrden key={o.id} orden={o} ocupado={ocupado} hacer={hacer} />
        ))}
      </section>

      <section>
        <h3>Vigentes ({vigentes.length})</h3>
        {vigentes.map((o) => (
          <TarjetaOrden key={o.id} orden={o} ocupado={ocupado} hacer={hacer} />
        ))}
      </section>

      {resueltas.length > 0 && (
        <details>
          <summary>Facturadas y anuladas ({resueltas.length})</summary>
          {resueltas.map((o) => (
            <TarjetaOrden key={o.id} orden={o} ocupado={ocupado} hacer={hacer} />
          ))}
        </details>
      )}

      <CargarOrden companias={companias} ocupado={ocupado} hacer={hacer} />
    </div>
  )
}

type Hacer = (accion: () => Promise<Resultado<null>>) => Promise<boolean>

function TarjetaOrden({ orden: o, ocupado, hacer }: { orden: Orden; ocupado: boolean; hacer: Hacer }) {
  const estado = estadoDeOrden(o)
  return (
    <div className={`tarjeta orden orden-${estado}`}>
      <p className="orden-encabezado">
        <strong>{o.compania}</strong> · siniestro {o.siniestro}
        {o.patente !== null && <span className="patente">{o.patente}</span>}
        <span className="monto">{o.montoAutorizado === null ? 'sin monto' : formatearPesos(o.montoAutorizado)}</span>
      </p>
      <p className="apagado">
        {estado === 'anulada' && 'Anulada por la compañía'}
        {estado === 'facturada' && 'Facturada'}
        {estado !== 'anulada' && estado !== 'facturada' && `${vencimientoEnPalabras(o.diasParaVencer)} (${formatearFecha(o.vence)})`}
        {o.perito !== null && ` · perito ${o.perito}`}
      </p>
      {(estado === 'por_vencer' || estado === 'vigente' || estado === 'vencida') && (
        <p className="acciones">
          <button
            type="button"
            className="enlace"
            disabled={ocupado}
            onClick={() => {
              if (window.confirm(`¿La compañía anuló la orden del siniestro ${o.siniestro}?`)) {
                void hacer(() => anularOrden(o.id, hoyEnElTaller(), null))
              }
            }}
          >
            La anularon
          </button>
          {sePuedeBorrar(o) && (
            <button
              type="button"
              className="enlace"
              disabled={ocupado}
              onClick={() => {
                if (window.confirm(`¿Borrar la orden vencida del siniestro ${o.siniestro}? No se puede deshacer.`)) {
                  void hacer(() => borrarOrden(o.id))
                }
              }}
            >
              Borrar
            </button>
          )}
        </p>
      )}
    </div>
  )
}

function CargarOrden({ companias, ocupado, hacer }: { companias: readonly Compania[]; ocupado: boolean; hacer: Hacer }) {
  const [f, setF] = useState<Formulario>(FORMULARIO_VACIO)
  const [motivo, setMotivo] = useState<string | null>(null)
  const campo = (nombre: keyof Formulario) => ({
    value: f[nombre],
    onChange: (e: { target: { value: string } }) => setF({ ...f, [nombre]: e.target.value }),
  })

  async function alEnviar(e: FormEvent) {
    e.preventDefault()
    const v = validarOrden(f)
    if (!v.ok) {
      setMotivo(v.motivo)
      return
    }
    setMotivo(null)
    if (await hacer(() => cargarOrden(v.orden))) setF({ ...FORMULARIO_VACIO, fechaEmision: hoyEnElTaller() })
  }

  return (
    <form className="tarjeta formulario" onSubmit={(e) => void alEnviar(e)}>
      <h3>Cargar una orden</h3>
      <p className="apagado">Para las que llegan por portal o por WhatsApp.</p>
      <label>
        Compañía
        <select {...campo('cuitCompania')}>
          <option value="">Elegí…</option>
          {companias.map((c) => (
            <option key={c.cuit} value={c.cuit}>{c.nombre}</option>
          ))}
        </select>
      </label>
      <label>
        Número de siniestro
        <input {...campo('siniestro')} />
      </label>
      <label>
        Patente
        <input {...campo('patente')} autoCapitalize="characters" />
      </label>
      <label>
        Fecha de la orden
        <input type="date" {...campo('fechaEmision')} />
      </label>
      <label>
        Monto autorizado (si lo sabés)
        <input {...campo('monto')} inputMode="decimal" placeholder="150.000,50" />
      </label>
      <label>
        Perito (si lo sabés)
        <input {...campo('perito')} />
      </label>
      <button type="submit" disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar la orden'}</button>
      {motivo !== null && <p className="error">{motivo}</p>}
    </form>
  )
}

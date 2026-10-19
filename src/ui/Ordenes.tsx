/* Órdenes de trabajo: que ninguna venza sin facturar. Spec 010 de semaforo-base.
 *
 * Arriba lo que hay que atender (por vencer y vencidas sin factura), ordenado por monto: la base lo
 * manda así. Después las vigentes, y al final las resueltas. Nadie las carga: las sube el robot
 * cuando llegan por mail (RF-1005). La pantalla pinta y llama: qué grupo, qué frase y qué se puede
 * borrar lo decide dominio/ordenes.ts. */

import { useCallback, useEffect, useState } from 'react'
import { anularOrden, borrarOrden, desanularOrden, leerOrdenes } from '../datos/ordenes'
import { formatearPesos } from '../dominio/dinero'
import { formatearFecha, hoyEnElTaller } from '../dominio/fechas'
import { agruparOrdenes, estadoDeOrden, sePuedeBorrar, vencimientoEnPalabras, type Orden } from '../dominio/ordenes'
import { textoDeFallo, type Fallo, type Resultado } from '../dominio/resultado'

export function Ordenes() {
  const [ordenes, setOrdenes] = useState<readonly Orden[] | Fallo | null>(null)
  const [fallo, setFallo] = useState<Fallo | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(() => {
    void leerOrdenes().then((r) => setOrdenes(r.ok ? r.dato : r.fallo))
  }, [])
  useEffect(cargar, [cargar])

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

  const { paraAtender, vigentes, resueltas } = agruparOrdenes(ordenes)

  return (
    <div className="ordenes">
      <h2>Órdenes de trabajo</h2>
      <p className="apagado">Llegan solas: el robot las toma del mail.</p>
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
    </div>
  )
}

type Hacer = (accion: () => Promise<Resultado<null>>) => Promise<void>

function TarjetaOrden({ orden: o, ocupado, hacer }: { orden: Orden; ocupado: boolean; hacer: Hacer }) {
  const estado = estadoDeOrden(o)
  return (
    <div className={`tarjeta orden orden-${estado}`}>
      <p className="orden-encabezado">
        <strong>{o.compania}</strong> · siniestro {o.siniestro}
        {o.patente !== null && <span className="patente">{o.patente}</span>}
        {o.vehiculo !== null && <span className="apagado">{o.vehiculo}</span>}
        <span className="monto">{o.montoAutorizado === null ? 'sin monto' : formatearPesos(o.montoAutorizado)}</span>
      </p>
      <p className="apagado">
        {estado === 'anulada' && (o.anuladaPorMail ? 'Anulada por la compañía (lo leyó el robot del mail)' : 'Anulada por la compañía')}
        {estado === 'facturada' && 'Facturada'}
        {estado !== 'anulada' && estado !== 'facturada' && `${vencimientoEnPalabras(o.diasParaVencer)} (${formatearFecha(o.vence)})`}
        {o.perito !== null && ` · perito ${o.perito}`}
      </p>
      {o.observaciones !== null && <p className="apagado">{o.observaciones}</p>}
      {estado === 'anulada' && (
        <p className="acciones">
          <button
            type="button"
            className="enlace"
            disabled={ocupado}
            onClick={() => {
              if (window.confirm(`¿La orden del siniestro ${o.siniestro} sigue vigente? Vuelve a contar para los avisos.`)) {
                void hacer(() => desanularOrden(o.id))
              }
            }}
          >
            No la anularon
          </button>
        </p>
      )}
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

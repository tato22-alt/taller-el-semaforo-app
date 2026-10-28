/* Cobranzas: cuánto me deben, quién, desde cuándo, y qué hago hoy para cobrarlo. Fase 3 de la spec 005 de
 * semaforo-base.
 *
 * Arriba, todo lo facturado partido por estado, como lo suma la base: las partes suman lo de ARCA. Después,
 * las compañías en el orden en que hay que mirarlas, cada una con qué hacer. Cada compañía se abre hasta sus
 * facturas, y cada factura hasta el mail con que se mandó, que tiene el PDF (RF-509). El reclamo se arma acá
 * y lo manda una persona (R1). La pantalla no suma ni decide nada: pinta y llama. */

import { useEffect, useState } from 'react'
import { TODAVIA_NO, leerCobranzas, leerFacturasDe } from '../datos/cobranzas'
import {
  TRAMOS,
  estadoEnPalabras,
  explicacionDe,
  hayPlata,
  numeroDeFactura,
  ordenarCompanias,
  ordenarFacturas,
  plazoEnPalabras,
  queHacer,
  textoDelReclamo,
  tieneAlgoAbierto,
  tramoEnPalabras,
  type EstadoFactura,
  type FacturaCobranza,
  type FilaCobranzas,
} from '../dominio/cobranzas'
import { formatearPesos } from '../dominio/dinero'
import { formatearFecha } from '../dominio/fechas'
import { enlaceAlMail } from '../dominio/ordenes'
import { textoDeFallo, type Fallo } from '../dominio/resultado'

export function Cobranzas() {
  const [filas, setFilas] = useState<readonly FilaCobranzas[] | typeof TODAVIA_NO | Fallo | null>(null)

  useEffect(() => {
    void leerCobranzas().then((r) => setFilas(r.ok ? r.dato : r.fallo))
  }, [])

  if (filas === null) return <p className="apagado">Buscando lo que te deben…</p>
  if (filas === TODAVIA_NO) {
    return (
      <div className="cobranzas">
        <h2>Cobranzas</h2>
        <p className="apagado">Esta pantalla se activa con la próxima actualización de la base.</p>
      </div>
    )
  }
  if ('tipo' in filas) return <p className="error tarjeta">{textoDeFallo(filas)}</p>

  const total = filas.find((f) => f.fila === 'total')
  const companias = ordenarCompanias(filas.filter((f) => f.fila === 'compania'))
  const abiertas = companias.filter(tieneAlgoAbierto)
  const alDia = companias.filter((f) => !tieneAlgoAbierto(f))
  const sinFicha = filas.find((f) => f.fila === 'sin_ficha')

  return (
    <div className="cobranzas">
      <h2>Cobranzas</h2>
      {total !== undefined && <Resumen total={total} />}
      <section>
        <h3>Por compañía</h3>
        {abiertas.length === 0 && <p className="apagado">Ninguna compañía tiene nada abierto.</p>}
        {abiertas.map((f) => <Compania key={f.cuit ?? f.compania} fila={f} />)}
        {sinFicha !== undefined && tieneAlgoAbierto(sinFicha) && <Compania fila={sinFicha} />}
      </section>
      {alDia.length > 0 && (
        <details className="plegado">
          <summary>Al día ({alDia.length})</summary>
          <ul className="notas">
            {alDia.map((f) => <li key={f.cuit ?? f.compania}>{f.compania} · cobrado {formatearPesos(f.cobrado)}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}

/** Lo facturado, partido en lo que cada estado suma. */
function Resumen({ total }: { total: FilaCobranzas }) {
  const partes: readonly { estado: EstadoFactura; importe: string; facturas?: number }[] = [
    { estado: 'a_reclamar', importe: total.aReclamar, facturas: total.facturasAReclamar },
    { estado: 'en_curso', importe: total.enCurso },
    { estado: 'aprobada', importe: total.aprobada },
    { estado: 'pago_no_visible', importe: total.pagoNoVisible, facturas: total.facturasPagoNoVisible },
    { estado: 'sin_evidencia', importe: total.sinEvidencia, facturas: total.facturasSinEvidencia },
    { estado: 'pagada_sin_importe', importe: total.pagadaSinImporte },
    { estado: 'cobrada', importe: total.cobrado },
    { estado: 'anulada', importe: total.anulado },
  ]
  return (
    <section className="tarjeta resumen-cobranzas">
      <p className="cifra-principal">
        <span className="apagado">Te deben</span> <strong>{formatearPesos(total.deuda)}</strong>
        <span className="apagado"> · {total.facturasDeuda === 1 ? '1 factura' : `${total.facturasDeuda} facturas`}</span>
      </p>
      <ul className="estados">
        {partes.filter((p) => hayPlata(p.importe) || p.estado === 'a_reclamar').map((p) => (
          <li key={p.estado} className={`estado-${p.estado}`}>
            <span className="estado-nombre">{estadoEnPalabras(p.estado)}</span>
            <span className="estado-importe">
              {formatearPesos(p.importe)}
              {p.facturas !== undefined && p.facturas > 0 && <span className="apagado"> · {p.facturas}</span>}
            </span>
            <span className="estado-explicacion apagado">{explicacionDe(p.estado)}</span>
          </li>
        ))}
      </ul>
      <p className="apagado">
        Facturado: {formatearPesos(total.facturado)} en {total.facturas} facturas. Las partes de arriba suman exactamente eso, lo mismo que ARCA.
      </p>
    </section>
  )
}

function Compania({ fila }: { fila: FilaCobranzas }) {
  const [abierta, setAbierta] = useState(false)
  const tramos = TRAMOS.filter((t) => hayPlata(fila.deudaPorTramo[t]))
  const tareas = queHacer(fila)
  // En el orden en que importan; la primera letra la pone en mayúscula la hoja de estilos.
  const montos = ([
    ['te debe', fila.deuda], ['en plazo', fila.enCurso], ['aprobada', fila.aprobada], ['no se ve el pago', fila.pagoNoVisible],
    ['sin señal de envío', fila.sinEvidencia], ['pagada sin importe', fila.pagadaSinImporte],
  ] as const).filter(([, importe]) => hayPlata(importe)).map(([que, importe]) => `${que} ${formatearPesos(importe)}`)
  return (
    <div className={`tarjeta compania-cobranza${hayPlata(fila.aReclamar) ? ' con-reclamo' : ''}`}>
      <p className="compania-encabezado">
        <strong>{fila.compania}</strong>
        {hayPlata(fila.aReclamar) && <span className="monto-reclamar">A reclamar {formatearPesos(fila.aReclamar)}</span>}
      </p>
      {montos.length > 0 && <p className="compania-montos">{montos.join(' · ')}</p>}
      {tramos.length > 0 && (
        <p className="compania-linea apagado">
          La deuda, por antigüedad: {tramos.map((t) => `${tramoEnPalabras(t)} ${formatearPesos(fila.deudaPorTramo[t])}`).join(' · ')}
        </p>
      )}
      {fila.fila === 'compania' && <p className="compania-linea apagado">{plazoEnPalabras(fila.plazoDias, fila.plazoOrigen)}</p>}
      {fila.fila === 'sin_ficha' && (
        <p className="compania-linea apagado">Facturas a un CUIT sin ficha de compañía (particulares y otros): sin ficha no se sabe por dónde se mandan ni cuándo vencen.</p>
      )}
      {tareas.length > 0 && <ul className="que-hacer">{tareas.map((t) => <li key={t}>{t}</li>)}</ul>}
      <button type="button" className="enlace" onClick={() => setAbierta(!abierta)}>{abierta ? 'Ocultar las facturas' : `Ver las facturas (${fila.facturas})`}</button>
      {abierta && <Facturas cuit={fila.fila === 'sin_ficha' ? null : fila.cuit} />}
    </div>
  )
}

function Facturas({ cuit }: { cuit: string | null }) {
  const [facturas, setFacturas] = useState<readonly FacturaCobranza[] | Fallo | null>(null)
  const [copiado, setCopiado] = useState<'si' | 'no' | null>(null)

  useEffect(() => {
    void leerFacturasDe(cuit).then((r) => setFacturas(r.ok ? ordenarFacturas(r.dato) : r.fallo))
  }, [cuit])

  if (facturas === null) return <p className="apagado">Buscando las facturas…</p>
  if ('tipo' in facturas) return <p className="error">{textoDeFallo(facturas)}</p>

  const abiertas = facturas.filter((f) => f.estado !== 'cobrada' && f.estado !== 'anulada')
  const cerradas = facturas.filter((f) => f.estado === 'cobrada' || f.estado === 'anulada')
  const hayReclamo = abiertas.some((f) => f.estado === 'a_reclamar')
  const reclamo = hayReclamo ? textoDelReclamo(abiertas, { pesos: formatearPesos, fecha: formatearFecha, hora: new Date().getHours() }) : ''

  function copiar() {
    void navigator.clipboard.writeText(reclamo).then(() => setCopiado('si'), () => setCopiado('no'))
  }

  return (
    <div className="facturas-cobranza">
      {hayReclamo && (
        <div className="reclamo">
          <button type="button" onClick={copiar}>Copiar el reclamo</button>
          <span className="apagado"> {copiado === 'si' ? 'Copiado: pegalo en el mail a la compañía.' : 'Lo pegás en un mail a la compañía y lo mandás vos.'}</span>
          {copiado === 'no' && <textarea readOnly value={reclamo} rows={8} aria-label="El reclamo, para copiar" />}
        </div>
      )}
      <ul className="filas">
        {abiertas.map((f) => <Factura key={f.id} f={f} />)}
      </ul>
      {cerradas.length > 0 && (
        <details className="plegado">
          <summary>Cobradas y anuladas ({cerradas.length})</summary>
          <ul className="filas">{cerradas.map((f) => <Factura key={f.id} f={f} />)}</ul>
        </details>
      )}
    </div>
  )
}

function Factura({ f }: { f: FacturaCobranza }) {
  const parcial = hayPlata(f.cobrado) && hayPlata(f.saldo)
  return (
    <li className={`factura-cobranza estado-${f.estado}`}>
      <p className="factura-linea">
        <strong>{numeroDeFactura(f)}</strong>
        <span>{formatearFecha(f.fecha)}</span>
        <span className="monto">{formatearPesos(hayPlata(f.saldo) ? f.saldo : f.total)}</span>
      </p>
      <p className="factura-linea apagado">
        <span className={`etiqueta-estado estado-${f.estado}`}>{estadoEnPalabras(f.estado)}</span>
        {f.diasVencida !== null && f.diasVencida > 0 && <span>· venció hace {f.diasVencida} {f.diasVencida === 1 ? 'día' : 'días'}</span>}
        {f.fechaPrometida !== null && <span>· prometieron pagar el {formatearFecha(f.fechaPrometida)}</span>}
        {parcial && <span>· pagaron {formatearPesos(f.cobrado)} de {formatearPesos(f.total)}</span>}
        {f.siniestros !== null && <span>· siniestro {f.siniestros}</span>}
        {!f.envioVisto && (f.estado === 'en_curso' || f.estado === 'a_reclamar' || f.estado === 'pago_no_visible') && <span>· el robot no vio el mail del envío</span>}
        {f.mailEnvio !== null && <a href={enlaceAlMail(f.mailEnvio)} target="_blank" rel="noreferrer">Ver el mail del envío</a>}
      </p>
    </li>
  )
}

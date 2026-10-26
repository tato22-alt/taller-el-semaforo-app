/* Retenciones: cuánto te retuvieron cada mes, y el libro para el contador. Spec 014 de semaforo-base.
 *
 * Arriba, el mes: lo retenido por impuesto, como lo suma la base. Después, la planilla del mes para
 * bajar. Al final, el libro: cada retención con su certificado y el mail del aviso, que es su respaldo.
 * La pantalla no suma ni decide nada: pinta y llama. */

import { useEffect, useState } from 'react'
import { TODAVIA_NO, leerLibro, leerMeses } from '../datos/retenciones'
import { formatearPesos } from '../dominio/dinero'
import { formatearFecha } from '../dominio/fechas'
import { enlaceAlMail } from '../dominio/ordenes'
import { textoDeFallo, type Fallo } from '../dominio/resultado'
import {
  IMPUESTOS,
  certificadoEnPalabras,
  impuestoEnPalabras,
  mesEnPalabras,
  nombreDePlanilla,
  planillaDelMes,
  queFacturasPago,
  type MesDeRetenciones,
  type Retencion,
} from '../dominio/retenciones'

export function Retenciones() {
  const [meses, setMeses] = useState<readonly MesDeRetenciones[] | typeof TODAVIA_NO | Fallo | null>(null)
  const [elegido, setElegido] = useState<string | null>(null)

  useEffect(() => {
    void leerMeses().then((r) => {
      setMeses(r.ok ? r.dato : r.fallo)
      if (r.ok && r.dato !== TODAVIA_NO) setElegido(r.dato[0]?.mes ?? null)
    })
  }, [])

  if (meses === null) return <p className="apagado">Buscando las retenciones…</p>
  if (meses === TODAVIA_NO) {
    return (
      <div className="retenciones">
        <h2>Retenciones</h2>
        <p className="apagado">El libro de retenciones se activa con la próxima actualización de la base.</p>
      </div>
    )
  }
  if ('tipo' in meses) return <p className="error tarjeta">{textoDeFallo(meses)}</p>

  const mes = meses.find((m) => m.mes === elegido)
  return (
    <div className="retenciones">
      <h2>Retenciones</h2>
      {meses.length === 0 && <p className="apagado">Todavía no hay retenciones: aparecen solas cuando el robot lee las órdenes de pago.</p>}
      {meses.length > 0 && (
        <label className="campo">
          Mes
          <select value={elegido ?? ''} onChange={(e) => setElegido(e.target.value)}>
            {meses.map((m) => (
              <option key={m.mes} value={m.mes}>{mesEnPalabras(m.mes)} · {formatearPesos(m.total)}</option>
            ))}
          </select>
        </label>
      )}
      {mes !== undefined && <ResumenDelMes mes={mes} />}
      {mes !== undefined && <LibroDelMes key={mes.mes} mes={mes} />}
    </div>
  )
}

function ResumenDelMes({ mes }: { mes: MesDeRetenciones }) {
  return (
    <section className="tarjeta resumen-retenciones">
      <p>
        En {mesEnPalabras(mes.mes)} te retuvieron <strong>{formatearPesos(mes.total)}</strong>
        <span className="apagado">
          {' '}· {mes.retenciones === 1 ? '1 retención' : `${mes.retenciones} retenciones`} de{' '}
          {mes.companias === 1 ? '1 compañía' : `${mes.companias} compañías`}
        </span>
      </p>
      <ul className="por-impuesto">
        {IMPUESTOS.filter((i) => i !== 'otro' || !/^0(\.0+)?$/.test(mes.porImpuesto.otro)).map((i) => (
          <li key={i}>
            <span className="apagado">{impuestoEnPalabras(i)}</span> {formatearPesos(mes.porImpuesto[i])}
          </li>
        ))}
      </ul>
      {mes.sinCertificado > 0 && (
        <p className="apagado">
          {mes.sinCertificado === 1 ? '1 retención viene' : `${mes.sinCertificado} retenciones vienen`} sin número de certificado en el
          aviso. No están perdidas: el certificado de IVA, Ganancias y SUSS lo emite ARCA (Mis Retenciones), y el de Ingresos Brutos,
          ARBA. Se van a controlar cuando se importe el archivo de Mis Retenciones.
        </p>
      )}
    </section>
  )
}

function LibroDelMes({ mes }: { mes: MesDeRetenciones }) {
  const [libro, setLibro] = useState<readonly Retencion[] | Fallo | null>(null)

  useEffect(() => {
    void leerLibro(mes.mes).then((r) => setLibro(r.ok ? r.dato : r.fallo))
  }, [mes.mes])

  if (libro === null) return <p className="apagado">Buscando el libro de {mesEnPalabras(mes.mes)}…</p>
  if ('tipo' in libro) return <p className="error tarjeta">{textoDeFallo(libro)}</p>

  function bajarPlanilla(retenciones: readonly Retencion[]) {
    const url = URL.createObjectURL(new Blob([planillaDelMes(retenciones)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = nombreDePlanilla(mes.mes)
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section>
      <h3>El libro de {mesEnPalabras(mes.mes)}</h3>
      <p>
        <button type="button" disabled={libro.length === 0} onClick={() => bajarPlanilla(libro)}>Bajar la planilla del mes</button>{' '}
        <span className="apagado">Se abre con Excel. Es la que se le pasa al contador.</span>
      </p>
      <ul className="filas">
        {libro.map((r) => (
          <li key={r.idRetencion} className="tarjeta retencion">
            <p className="retencion-linea">
              <span>{formatearFecha(r.fecha)}</span>
              <strong>{r.compania ?? r.cuit ?? 'Compañía sin ficha'}</strong>
              <span>{impuestoEnPalabras(r.impuesto)}</span>
              <span className="monto">{formatearPesos(r.importe)}</span>
            </p>
            <p className="retencion-linea apagado">
              <span>Certificado: {certificadoEnPalabras(r)}</span>
              {r.op !== null && <span>· Orden de pago {r.op}</span>}
              <span>· Pagó {queFacturasPago(r)}</span>
              <a href={enlaceAlMail(r.gmailMessageId)} target="_blank" rel="noreferrer">Ver el mail</a>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

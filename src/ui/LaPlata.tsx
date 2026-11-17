/* La plata del taller: lo que entra, lo que sale y lo que te deben. Spec 013 de semaforo-base.
 *
 * Por mes y sin elegir filtros: lo facturado, lo cobrado (de compañías y de particulares), lo comprado
 * por rubro y por proveedor, y el IVA estimado. Aparte, lo que te deben hoy. Todo lo suma la base
 * (vw_plata_mes, vw_compras_mes, vw_te_deben); la pantalla pinta y llama. Lo único que se carga acá
 * es el rubro de un proveedor nuevo.
 *
 * La ven sólo quienes tienen el permiso de ver la plata. Lo cuida la base, no esta pantalla. */

import { useCallback, useEffect, useState } from 'react'
import { TODAVIA_NO, leerCompras, leerComprasDelMes, leerMeses, leerProveedoresSinRubro, leerTeDeben, leerVentasDelMes, ponerRubro } from '../datos/plata'
import { leerLibro } from '../datos/retenciones'
import { formatearPesos } from '../dominio/dinero'
import { formatearFecha, hoyEnElTaller } from '../dominio/fechas'
import {
  RUBROS, armarCompras, cambioContraElMesAnterior, cambioEnPalabras, compararImportes, esCero, esRubro, mesParaAbrir, nombreDePlanilla,
  planillaDelMes, rubroEnPalabras, type FilaDeCompras, type MesDePlata, type Proveedor, type TeDeben,
} from '../dominio/plata'
import { textoDeFallo, type Fallo } from '../dominio/resultado'
import { impuestoEnPalabras, mesEnPalabras } from '../dominio/retenciones'

export function LaPlata({ vePlata }: { vePlata: boolean }) {
  const [meses, setMeses] = useState<readonly MesDePlata[] | typeof TODAVIA_NO | Fallo | null>(null)
  const [elegido, setElegido] = useState<string | null>(null)
  // Poner un rubro cambia cómo se reparten las compras: da una vuelta y se vuelven a leer.
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    if (!vePlata) return
    void leerMeses().then((r) => {
      setMeses(r.ok ? r.dato : r.fallo)
      if (r.ok && r.dato !== TODAVIA_NO) setElegido(mesParaAbrir(r.dato, hoyEnElTaller()))
    })
  }, [vePlata])

  if (!vePlata) {
    return (
      <div className="plata">
        <h2>La plata del taller</h2>
        <p className="apagado">Esta pantalla la ven sólo quienes tienen el permiso de ver la plata del taller.</p>
      </div>
    )
  }
  if (meses === null) return <p className="apagado">Buscando la plata del mes…</p>
  if (meses === TODAVIA_NO) {
    return (
      <div className="plata">
        <h2>La plata del taller</h2>
        <p className="apagado">Esta pantalla se activa con la próxima actualización de la base.</p>
      </div>
    )
  }
  if ('tipo' in meses) return <p className="error tarjeta">{textoDeFallo(meses)}</p>

  const mes = meses.find((m) => m.mes === elegido)
  return (
    <div className="plata">
      <h2>La plata del taller</h2>
      <TeDebenHoy />
      {meses.length === 0 && <p className="apagado">Todavía no hay nada para mostrar: falta importar las facturas de ARCA.</p>}
      {meses.length > 0 && (
        <label className="campo">
          Mes
          <select value={elegido ?? ''} onChange={(e) => setElegido(e.target.value)}>
            {meses.map((m) => (
              <option key={m.mes} value={m.mes}>{mesEnPalabras(m.mes)}</option>
            ))}
          </select>
        </label>
      )}
      {mes !== undefined && <ElMes mes={mes} />}
      {mes !== undefined && <Iva mes={mes} />}
      {mes !== undefined && <Compras key={`${mes.mes}-${vuelta}`} mes={mes} />}
      <SinRubro alCambiar={() => setVuelta((v) => v + 1)} />
      {mes !== undefined && <Planilla key={mes.mes} mes={mes} />}
    </div>
  )
}

/** Lo que te deben hoy: no es del mes, es de ahora. */
function TeDebenHoy() {
  const [deben, setDeben] = useState<readonly TeDeben[] | null>(null)
  useEffect(() => {
    void leerTeDeben().then((r) => setDeben(r.ok ? r.dato : []))
  }, [])
  if (deben === null || deben.length === 0) return null
  return (
    <section className="tarjeta">
      <h3>Te deben hoy</h3>
      <ul className="plata-renglones">
        {deben.map((d) => (
          <li key={d.quien}>
            <span>
              {d.quien === 'companias' ? 'Las compañías' : 'Los particulares'}
              <span className="apagado">
                {' '}· {d.quien === 'companias' ? (d.cuantas === 1 ? '1 factura' : `${d.cuantas} facturas`) : (d.cuantas === 1 ? '1 persona' : `${d.cuantas} deudas`)}
                {d.desde !== null && <>, la más vieja del {formatearFecha(d.desde)}</>}
              </span>
            </span>
            <strong>{formatearPesos(d.monto)}</strong>
            <a href={d.quien === 'companias' ? '#/cobranzas' : '#/hoy'}>{d.quien === 'companias' ? 'Ver en Cobranzas' : 'Ver en Hoy'}</a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ElMes({ mes }: { mes: MesDePlata }) {
  return (
    <section className="tarjeta">
      <h3>{mesEnPalabras(mes.mes)}</h3>
      <ul className="plata-renglones">
        <li>
          <span>Facturado <span className="apagado">· {mes.comprobantesVentas} comprobantes, menos las notas de crédito</span></span>
          <strong>{formatearPesos(mes.facturado)}</strong>
        </li>
        <li>
          <span>Cobrado de compañías <span className="apagado">· lo que se ve en los avisos de pago, con sus retenciones</span></span>
          <strong>{formatearPesos(mes.cobradoCompanias)}</strong>
        </li>
        {!esCero(mes.pagadoSinImporte) && (
          <li className="plata-aparte">
            <span className="apagado">Además avisaron que pagaron, sin decir cuánto, facturas por</span>
            <span>{formatearPesos(mes.pagadoSinImporte)}</span>
          </li>
        )}
        <li>
          <span>Cobrado de particulares <span className="apagado">· lo anotado al entregar y después</span></span>
          <strong>{formatearPesos(mes.cobradoParticulares)}</strong>
        </li>
        <li>
          <span>Comprado <span className="apagado">· {mes.comprobantesCompras} comprobantes de ARCA, menos sus notas de crédito</span></span>
          <strong>{formatearPesos(mes.comprado)}</strong>
        </li>
      </ul>
      <p className="apagado">
        Lo cobrado de compañías va en el mes del último aviso de pago de cada factura. Lo que una compañía paga sin avisar por mail
        no aparece acá.
      </p>
    </section>
  )
}

function Iva({ mes }: { mes: MesDePlata }) {
  const aFavor = compararImportes(mes.ivaEstimado, '0') < 0
  return (
    <section className="tarjeta">
      <h3>IVA del mes, estimado</h3>
      <ul className="plata-renglones">
        <li><span>IVA de lo facturado</span><span>{formatearPesos(mes.ivaVentas)}</span></li>
        <li><span>Menos el IVA de las compras <span className="apagado">· sólo facturas A</span></span><span>{formatearPesos(mes.ivaCompras)}</span></li>
        <li><span>Menos las retenciones de IVA que te hicieron</span><span>{formatearPesos(mes.retencionesIva)}</span></li>
        <li>
          <span>{aFavor ? 'Te quedaría a favor' : 'Quedaría para pagar'}</span>
          <strong>{formatearPesos(aFavor ? mes.ivaEstimado.replace(/^-/, '') : mes.ivaEstimado)}</strong>
        </li>
      </ul>
      <p className="apagado">
        Es una estimación, para que el vencimiento no sorprenda. No tiene en cuenta los saldos a favor de meses anteriores, las
        percepciones ni nada que no esté en la base. <strong>El número que vale es el de la declaración del contador.</strong>
      </p>
    </section>
  )
}

/** Lo comprado en el mes, por rubro y por proveedor, de más a menos (RF-1312). */
function Compras({ mes }: { mes: MesDePlata }) {
  const [filas, setFilas] = useState<readonly FilaDeCompras[] | Fallo | null>(null)
  useEffect(() => {
    void leerCompras(mes.mes).then((r) => setFilas(r.ok ? r.dato : r.fallo))
  }, [mes.mes])

  if (filas === null) return <p className="apagado">Buscando las compras…</p>
  if ('tipo' in filas) return <p className="error tarjeta">{textoDeFallo(filas)}</p>
  const { total, rubros } = armarCompras(filas)

  return (
    <section>
      <h3>A quién le comprás</h3>
      {total === null && (
        <p className="apagado">
          No hay compras de {mesEnPalabras(mes.mes)}. Entran solas al importar el archivo de Recibidos de ARCA, en <a href="#/importar">Importar</a>.
        </p>
      )}
      {total !== null && (
        <p className="apagado">
          En lo que va del año compraste {formatearPesos(total.enElAnio)}. El mes anterior, {formatearPesos(total.mesAnterior)}.
        </p>
      )}
      {rubros.map(({ rubro, proveedores }) => (
        <details key={rubro.rubro ?? 'sin'} className="tarjeta plata-rubro">
          <summary>
            <strong>{rubroEnPalabras(rubro.rubro)}</strong>
            <span className="monto">{formatearPesos(rubro.comprado)}</span>
          </summary>
          <ul className="plata-proveedores">
            {proveedores.map((p) => (
              <li key={p.cuit ?? p.proveedor}>
                <span>
                  {p.proveedor}
                  <span className="apagado"> · {cambioEnPalabras(cambioContraElMesAnterior(p))}
                    {!esCero(p.mesAnterior) && <> ({formatearPesos(p.mesAnterior)})</>} · en el año, {formatearPesos(p.enElAnio)}
                  </span>
                </span>
                <span>{formatearPesos(p.comprado)}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  )
}

/** Los proveedores sin rubro: aparecen una vez, se les pone, y no vuelven (RF-1304). */
function SinRubro({ alCambiar }: { alCambiar: () => void }) {
  const [proveedores, setProveedores] = useState<readonly Proveedor[] | null>(null)
  const [fallo, setFallo] = useState<Fallo | null>(null)

  const cargar = useCallback(() => {
    void leerProveedoresSinRubro().then((r) => setProveedores(r.ok ? r.dato : []))
  }, [])
  useEffect(cargar, [cargar])

  async function poner(cuit: string, rubro: string): Promise<void> {
    if (!esRubro(rubro)) return
    const r = await ponerRubro(cuit, rubro)
    setFallo(r.ok ? null : r.fallo)
    cargar()
    alCambiar()
  }

  if (proveedores === null || proveedores.length === 0) return null
  return (
    <section>
      <h3>Proveedores sin rubro ({proveedores.length})</h3>
      <p className="apagado">Se le pone una sola vez, y vale para todas sus facturas, las de antes y las que vengan.</p>
      {fallo !== null && <p className="error">{textoDeFallo(fallo)}</p>}
      <ul className="plata-proveedores">
        {proveedores.map((p) => (
          <li key={p.cuit}>
            <span>{p.nombre} <span className="apagado">· {p.cuit}</span></span>
            <select aria-label={`Rubro de ${p.nombre}`} value="" onChange={(e) => void poner(p.cuit, e.target.value)}>
              <option value="">Elegir el rubro…</option>
              {RUBROS.map((r) => <option key={r} value={r}>{rubroEnPalabras(r)}</option>)}
            </select>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** La planilla del mes para el contador: ventas, compras y retenciones, con sus comprobantes (RF-1313). */
function Planilla({ mes }: { mes: MesDePlata }) {
  const [estado, setEstado] = useState<'lista' | 'armando' | Fallo>('lista')

  async function bajar(): Promise<void> {
    setEstado('armando')
    const [ventas, compras, retenciones] = await Promise.all([leerVentasDelMes(mes.mes), leerComprasDelMes(mes.mes), leerLibro(mes.mes)])
    if (!ventas.ok) return setEstado(ventas.fallo)
    if (!compras.ok) return setEstado(compras.fallo)
    if (!retenciones.ok) return setEstado(retenciones.fallo)
    const planilla = planillaDelMes(ventas.dato, compras.dato, retenciones.dato.map((r) => ({
      fecha: r.fecha, compania: r.compania, cuit: r.cuit, impuesto: impuestoEnPalabras(r.impuesto), certificado: r.certificado, importe: r.importe,
    })))
    const url = URL.createObjectURL(new Blob([planilla], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = nombreDePlanilla(mes.mes)
    a.click()
    URL.revokeObjectURL(url)
    setEstado('lista')
  }

  return (
    <section>
      <h3>Para el contador</h3>
      <p>
        <button type="button" disabled={estado === 'armando'} onClick={() => void bajar()}>
          {estado === 'armando' ? 'Armando la planilla…' : `Bajar la planilla de ${mesEnPalabras(mes.mes)}`}
        </button>{' '}
        <span className="apagado">Ventas, compras y retenciones, cada una con sus comprobantes. Se abre con Excel.</span>
      </p>
      {typeof estado === 'object' && <p className="error">{textoDeFallo(estado)}</p>}
    </section>
  )
}

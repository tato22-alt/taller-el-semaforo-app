/* Pantalla 2: una fila por presupuesto. Se usa parado, con el celular, al lado
 * de un auto, así que la patente va primero y grande.
 *
 * Ningún número de acá se calcula en el navegador: `monto_total` viene sumado por
 * la vista. Los días sí se cuentan acá, y es la única cuenta que se hace: son una
 * magnitud que la base todavía no deriva (está anotado en specs/002 §3.2). */

import { useEffect, useState } from 'react'
import { listarPresupuestos } from '../datos/presupuestos'
import { antiguedadEnPalabras, diasDesde, formatearFecha } from '../dominio/fechas'
import { formatearPesos } from '../dominio/dinero'
import { textoDeFallo, type Fallo } from '../dominio/resultado'
import type { FilaPresupuesto } from '../datos/filas'
import { hashDeRuta } from '../dominio/ruta'

type Estado =
  | { readonly fase: 'cargando' }
  | { readonly fase: 'lista'; readonly filas: readonly FilaPresupuesto[] }
  | { readonly fase: 'falló'; readonly fallo: Fallo }

export function Tablero() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })

  useEffect(() => {
    let vigente = true
    void listarPresupuestos().then((r) => {
      if (!vigente) return
      setEstado(r.ok ? { fase: 'lista', filas: r.dato } : { fase: 'falló', fallo: r.fallo })
    })
    return () => {
      vigente = false
    }
  }, [])

  if (estado.fase === 'cargando') {
    return <p className="apagado">Buscando presupuestos…</p>
  }

  if (estado.fase === 'falló') {
    return (
      <div className="tarjeta">
        <p className="error">{textoDeFallo(estado.fallo)}</p>
      </div>
    )
  }

  if (estado.filas.length === 0) {
    return (
      <div className="tarjeta pendiente">
        <strong>No hay presupuestos cargados</strong>
        <p className="apagado">
          La sesión está abierta y la base contestó: todavía no hay ninguno. Van a
          aparecer acá a medida que se emitan desde la herramienta de presupuestos.
        </p>
      </div>
    )
  }

  return (
    <>
      <p className="apagado contador">
        {estado.filas.length} presupuesto{estado.filas.length === 1 ? '' : 's'}, del más
        nuevo al más viejo. Los días son <strong>desde que se presupuestó</strong>, no
        desde que entró el auto: la base todavía no guarda la fecha de ingreso.
      </p>

      <ul className="filas">
        {estado.filas.map((fila) => (
          <Fila key={fila.id_trabajo ?? 0} fila={fila} />
        ))}
      </ul>
    </>
  )
}

function Fila({ fila }: { readonly fila: FilaPresupuesto }) {
  const dias = diasDesde(fila.fecha_presupuesto)
  const cliente = fila.txt_cliente ?? fila.cliente_actual

  return (
    <li className="fila">
      <a href={hashDeRuta({ pantalla: 'ficha', idTrabajo: fila.id_trabajo ?? 0 })}>
        <span className="patente">{fila.patente_norm ?? 'sin patente'}</span>

        <span className="vehiculo">{fila.txt_vehiculo ?? '—'}</span>
        <span className="cliente">{cliente ?? 'sin cliente'}</span>

        <span className="pie">
          <span className="numero">
            {fila.numero_presupuesto === null ? 'pendiente' : `N° ${fila.numero_presupuesto}`}
          </span>
          <span className="apagado" title={formatearFecha(fila.fecha_presupuesto)}>
            {antiguedadEnPalabras(dias)}
          </span>
          <strong className="monto">{formatearPesos(fila.monto_total)}</strong>
        </span>
      </a>
    </li>
  )
}

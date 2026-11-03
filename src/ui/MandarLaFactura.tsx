/* "Mandar la factura", en la tarjeta de la orden. Spec 016 de semaforo-base.
 *
 * Se suben, desde la compu, la factura (el PDF de ARCA) y la orden firmada (bajada del WhatsApp), y si
 * hace falta otros papeles (la orden de compra, el remito). El robot controla la factura contra la
 * orden y deja el borrador en Gmail: lo manda una persona (R1). Cerrada hasta que se abre, para que la
 * lista de órdenes no se llene de botones. La pantalla pinta y llama: qué dice cada estado y qué
 * archivo se acepta lo decide dominio/mandar-factura.ts. */

import { useState } from 'react'
import { armarDeNuevo, armarIgual, sacarArchivo, subirArchivo } from '../datos/mandar-factura'
import { formatearFecha } from '../dominio/fechas'
import {
  ENLACE_A_LOS_BORRADORES, estadoEnPalabras, porQueNoSeSube, sePuedenCambiarArchivos, type ClaseDeArchivo, type FacturaParaMandar,
} from '../dominio/mandar-factura'
import { bien, type Resultado } from '../dominio/resultado'

type Hacer = (accion: () => Promise<Resultado<null>>) => Promise<void>
type Props = { fila: FacturaParaMandar; ocupado: boolean; hacer: Hacer }

const QUE_ES: Record<ClaseDeArchivo, string> = { factura: 'Factura', orden_firmada: 'Orden firmada', otro: 'Otro' }

export function MandarLaFactura({ fila: f, ocupado, hacer }: Props) {
  const [abierta, setAbierta] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  if (f.estado === 'se_carga_en_el_portal') return <p className="apagado mandar">Factura: se carga en el portal de la compañía.</p>
  if (f.estado === 'sin_empezar' && !abierta) {
    return (
      <p className="acciones mandar">
        <button type="button" className="enlace" disabled={ocupado} onClick={() => setAbierta(true)}>Mandar la factura</button>
      </p>
    )
  }

  const cambiar = sePuedenCambiarArchivos(f.estado)
  const hayFactura = f.archivos.some((a) => a.clase === 'factura')

  /** Controla cada archivo antes de subir nada; si uno no sirve, no se sube ninguno. */
  function elegir(clase: ClaseDeArchivo, lista: FileList | null) {
    const archivos = [...(lista ?? [])]
    if (archivos.length === 0) return
    for (const a of archivos) {
      const no = porQueNoSeSube(clase, a.type, a.size)
      if (no !== null) {
        setAviso(`«${a.name}»: ${no}`)
        return
      }
    }
    setAviso(null)
    void hacer(async () => {
      let intento = f.idParaMandar
      for (const a of archivos) {
        const r = await subirArchivo(f.idOrden, intento, clase, a)
        if (!r.ok) return r
        intento = r.dato
      }
      return bien(null)
    })
  }

  return (
    <div className={`mandar mandar-${f.estado}`}>
      <p className="mandar-estado">{estadoEnPalabras(f, formatearFecha)}</p>
      {f.para !== null && f.estado !== 'mandada' && (
        <p className="apagado">
          Va a {f.para}
          {f.paraOrigen === 'mas_usada' && ' (la casilla a la que más se le mandó este año)'}
          {f.asunto !== null && <> · asunto «{f.asunto}»</>}
        </p>
      )}
      {f.archivos.length > 0 && (
        <ul className="mandar-archivos">
          {f.archivos.map((a) => (
            <li key={a.id}>
              <span className="apagado">{QUE_ES[a.clase]}:</span> {a.nombre}
              {cambiar && (
                <button type="button" className="enlace" disabled={ocupado} onClick={() => void hacer(() => sacarArchivo(a.id))}>Sacar</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {cambiar && (
        <p className="acciones">
          {!hayFactura && <Subir clase="factura" texto="Subir la factura (PDF de ARCA)" tipos="application/pdf" ocupado={ocupado} elegir={elegir} />}
          <Subir clase="orden_firmada" texto="Subir la orden firmada" tipos="application/pdf,image/jpeg,image/png" varios ocupado={ocupado} elegir={elegir} />
          <Subir clase="otro" texto="Otro papel (orden de compra, remito)" tipos="application/pdf,image/jpeg,image/png" varios ocupado={ocupado} elegir={elegir} />
        </p>
      )}
      {aviso !== null && <p className="error">{aviso}</p>}
      {f.estado === 'no_cierra' && f.idParaMandar !== null && (
        <p className="acciones">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => {
              const id = f.idParaMandar
              if (id !== null && window.confirm('¿Armar el borrador igual? Revisalo bien antes de mandarlo.')) void hacer(() => armarIgual(id))
            }}
          >
            Armar igual
          </button>
        </p>
      )}
      {f.estado === 'borrador_borrado' && f.idParaMandar !== null && (
        <p className="acciones">
          <button type="button" disabled={ocupado} onClick={() => { const id = f.idParaMandar; if (id !== null) void hacer(() => armarDeNuevo(id)) }}>
            Armarlo de nuevo
          </button>
        </p>
      )}
      {f.estado === 'borrador_listo' && (
        <p><a href={ENLACE_A_LOS_BORRADORES} target="_blank" rel="noreferrer">Abrir los borradores de Gmail</a></p>
      )}
    </div>
  )
}

type PropsSubir = {
  clase: ClaseDeArchivo; texto: string; tipos: string; varios?: boolean; ocupado: boolean
  elegir: (clase: ClaseDeArchivo, lista: FileList | null) => void
}

/** Un botón que abre el selector de archivos de la compu. */
function Subir({ clase, texto, tipos, varios = false, ocupado, elegir }: PropsSubir) {
  return (
    <label className={`subir${ocupado ? ' deshabilitado' : ''}`}>
      {texto}
      <input
        type="file"
        accept={tipos}
        multiple={varios}
        disabled={ocupado}
        onChange={(e) => {
          elegir(clase, e.target.files)
          e.target.value = ''
        }}
      />
    </label>
  )
}

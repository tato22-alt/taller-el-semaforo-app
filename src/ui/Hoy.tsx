/* Hoy: qué autos hay, a quién llamar y qué mensaje mandar. Spec 011 de semaforo-base.
 *
 * Arriba, lo que la app pregunta (RF-1108): dar turno, recordar el turno, ¿vino?, ¿lo retiró?. Cada
 * pregunta trae el mensaje que corresponde, armado para abrir WhatsApp; lo manda la persona (R1).
 * Después, qué autos hay en el taller (RF-1102), los turnos de la semana y, plegados, los que no
 * volvieron. Un auto que todavía no tiene hitos se busca por patente. La pantalla pinta y llama: qué
 * pregunta, qué botón y qué texto lo decide dominio/hitos.ts y dominio/mensajes.ts. */

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { anotarHito, buscarPorPatente, deshacerHito, leerAutos, type TrabajoEncontrado } from '../datos/hitos'
import { diaEnPalabras, formatearFecha, hoyEnElTaller } from '../dominio/fechas'
import {
  armarHoy, enTallerEnPalabras, etiquetaDeHito, hitosQueSiguen, preguntaEnPalabras, type Auto, type Pregunta,
} from '../dominio/hitos'
import { etiquetaDeMensaje, mensajeDe, textoDelMensaje } from '../dominio/mensajes'
import { textoDeFallo, type Fallo, type Resultado } from '../dominio/resultado'
import { linkDeWhatsApp } from '../dominio/telefono'

type Hacer = (accion: () => Promise<Resultado<null>>) => Promise<void>

export function Hoy() {
  const [autos, setAutos] = useState<readonly Auto[] | Fallo | null>(null)
  const [fallo, setFallo] = useState<Fallo | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(() => {
    void leerAutos().then((r) => setAutos(r.ok ? r.dato : r.fallo))
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

  if (autos === null) return <p className="apagado">Buscando los autos…</p>
  if ('tipo' in autos) return <p className="error tarjeta">{textoDeFallo(autos)}</p>

  const { preguntas, enTaller, proximosTurnos, noVolvieron } = armarHoy(autos)
  const tarjeta = (a: Auto, pregunta: Pregunta | null = null) => (
    <TarjetaAuto key={a.idTrabajo} auto={a} pregunta={pregunta} ocupado={ocupado} hacer={hacer} />
  )

  return (
    <div className="hoy">
      <h2>Hoy</h2>
      {fallo !== null && <p className="error">{textoDeFallo(fallo)}</p>}
      <Buscar autos={autos} ocupado={ocupado} hacer={hacer} />

      <section>
        <h3>Para hacer hoy ({preguntas.length})</h3>
        {preguntas.length === 0 && <p className="apagado">Nada pendiente con los autos.</p>}
        {preguntas.map(({ auto, pregunta }) => tarjeta(auto, pregunta))}
      </section>

      <section>
        <h3>En el taller ({enTaller.length})</h3>
        {enTaller.length === 0 && <p className="apagado">Ningún auto anotado como adentro.</p>}
        {/* El que ya está arriba, en las preguntas, va en una línea: la tarjeta con sus botones es la de arriba. */}
        {enTaller.map((a) =>
          preguntas.some((p) => p.auto.idTrabajo === a.idTrabajo) ? (
            <p key={a.idTrabajo} className="auto-linea">
              <span className="patente">{a.patente ?? 'sin patente'}</span> {a.vehiculo} <span className="apagado">{enTallerEnPalabras(a)}</span>
            </p>
          ) : (
            tarjeta(a)
          ),
        )}
      </section>

      {proximosTurnos.length > 0 && (
        <section>
          <h3>Turnos de esta semana ({proximosTurnos.length})</h3>
          {proximosTurnos.map((a) => tarjeta(a))}
        </section>
      )}

      {noVolvieron.length > 0 && (
        <details>
          <summary>No volvieron ({noVolvieron.length})</summary>
          <p className="apagado">Tenían turno hace más de un mes y no entraron. Si vuelven, tocá «Entró»; si querés, dales otro turno.</p>
          {noVolvieron.map((a) => tarjeta(a))}
        </details>
      )}
    </div>
  )
}

type PropsTarjeta = { auto: Auto; pregunta: Pregunta | null; ocupado: boolean; hacer: Hacer }

function TarjetaAuto({ auto: a, pregunta, ocupado, hacer }: PropsTarjeta) {
  const mensaje = mensajeDe(a)
  const linea = pregunta !== null ? preguntaEnPalabras(pregunta, a) : a.enTaller ? enTallerEnPalabras(a) : null
  return (
    <div className={`tarjeta auto${pregunta !== null ? ` auto-${pregunta}` : ''}`}>
      <Encabezado patente={a.patente} vehiculo={a.vehiculo} cliente={a.cliente} numero={a.numeroPresupuesto} />
      {linea !== null && <p>{linea}</p>}
      {a.diasParaTurno !== null && a.turnoPara !== null && <p className="apagado">Turno: {diaEnPalabras(a.turnoPara)}</p>}
      {mensaje !== null && (
        <p>
          <a
            className="whatsapp"
            href={linkDeWhatsApp(a.telefono, textoDelMensaje(mensaje, { ...a, diaDelTurno: diaEnPalabras(a.turnoPara) }))}
            target="_blank"
            rel="noreferrer"
          >
            {etiquetaDeMensaje(mensaje)}
          </a>
        </p>
      )}
      <Hitos idTrabajo={a.idTrabajo} auto={a} ocupado={ocupado} hacer={hacer} />
    </div>
  )
}

type PropsEncabezado = { patente: string | null; vehiculo: string | null; cliente: string | null; numero: number | null }

function Encabezado({ patente, vehiculo, cliente, numero }: PropsEncabezado) {
  return (
    <p className="auto-encabezado">
      <span className="patente">{patente ?? 'sin patente'}</span>
      {vehiculo !== null && <strong>{vehiculo}</strong>}
      {cliente !== null && <span className="apagado">{cliente}</span>}
      {numero !== null && <span className="numero">N.º {numero}</span>}
    </p>
  )
}

/** Los botones de los hitos que siguen, la fecha (hoy, salvo que se cambie) y deshacer el último. */
function Hitos({ idTrabajo, auto, ocupado, hacer }: { idTrabajo: number; auto: Auto | null; ocupado: boolean; hacer: Hacer }) {
  const hoy = hoyEnElTaller()
  const [fecha, setFecha] = useState(hoy)
  const [fechaTurno, setFechaTurno] = useState('')
  const siguen = hitosQueSiguen(auto)
  const ultimo = auto !== null && auto.ultimoSePuedeDeshacer && auto.ultimoHito !== null && auto.ultimoTipo !== null
    ? { id: auto.ultimoHito, tipo: auto.ultimoTipo }
    : null
  const darTurno = (
    <span className="dar-turno">
      <input type="date" aria-label="Para cuándo es el turno" min={hoy} value={fechaTurno} onChange={(e) => setFechaTurno(e.target.value)} disabled={ocupado} />
      <button type="button" disabled={ocupado || fechaTurno === ''} onClick={() => void hacer(() => anotarHito(idTrabajo, 'turno', fecha, fechaTurno))}>
        {etiquetaDeHito('turno')}
      </button>
    </span>
  )
  return (
    <div className="acciones">
      {siguen.map((tipo, i) => {
        if (tipo !== 'turno') {
          return (
            <button key={tipo} type="button" disabled={ocupado} onClick={() => void hacer(() => anotarHito(idTrabajo, tipo, fecha, null))}>
              {etiquetaDeHito(tipo)}
            </button>
          )
        }
        // Dar turno es lo principal cuando llegaron los repuestos; si no, queda a mano pero plegado.
        if (i === 0 || auto === null) return <span key={tipo}>{darTurno}</span>
        return (
          <details key={tipo} className="plegado">
            <summary>Darle otro turno</summary>
            {darTurno}
          </details>
        )
      })}
      <details className="plegado">
        <summary>{fecha === hoy ? '¿Fue otro día?' : `Fecha: ${formatearFecha(fecha)}`}</summary>
        <input type="date" aria-label="Qué día fue" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value === '' ? hoy : e.target.value)} disabled={ocupado} />
      </details>
      {ultimo !== null && (
        <button
          type="button"
          className="enlace"
          disabled={ocupado}
          onClick={() => {
            if (window.confirm(`¿Deshacer «${etiquetaDeHito(ultimo.tipo)}»? Se borra ese toque.`)) void hacer(() => deshacerHito(ultimo.id))
          }}
        >
          Deshacer «{etiquetaDeHito(ultimo.tipo)}»
        </button>
      )}
    </div>
  )
}

/** Un auto sin hitos no aparece en ninguna lista: se lo busca por patente entre los presupuestos. Si
 *  ya tiene hitos, se muestra su tarjeta, con lo que tiene. */
function Buscar({ autos, ocupado, hacer }: { autos: readonly Auto[]; ocupado: boolean; hacer: Hacer }) {
  const [texto, setTexto] = useState('')
  const [encontrados, setEncontrados] = useState<readonly TrabajoEncontrado[] | Fallo | null>(null)

  async function buscar(e: FormEvent): Promise<void> {
    e.preventDefault()
    const r = await buscarPorPatente(texto)
    setEncontrados(r.ok ? r.dato : r.fallo)
  }

  return (
    <section className="buscar">
      <form onSubmit={(e) => void buscar(e)}>
        <input type="search" aria-label="Buscar un auto por patente" placeholder="Patente" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button type="submit">Buscar</button>
      </form>
      {encontrados !== null && 'tipo' in encontrados && <p className="error">{textoDeFallo(encontrados)}</p>}
      {encontrados !== null && !('tipo' in encontrados) && encontrados.length === 0 && (
        <p className="apagado">No hay presupuestos con esa patente.</p>
      )}
      {encontrados !== null && !('tipo' in encontrados) && encontrados.map((t) => {
        const conHitos = autos.find((a) => a.idTrabajo === t.idTrabajo)
        if (conHitos !== undefined) return <TarjetaAuto key={t.idTrabajo} auto={conHitos} pregunta={null} ocupado={ocupado} hacer={hacer} />
        return (
          <div key={t.idTrabajo} className="tarjeta auto">
            <Encabezado patente={t.patente} vehiculo={t.vehiculo} cliente={t.cliente} numero={t.numeroPresupuesto} />
            <p className="apagado">Presupuesto del {formatearFecha(t.fecha)}</p>
            <Hitos idTrabajo={t.idTrabajo} auto={null} ocupado={ocupado} hacer={hacer} />
          </div>
        )
      })}
    </section>
  )
}

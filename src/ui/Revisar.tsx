/* Revisar: las notas de crédito y de débito que la base no puede resolver sola. Spec 005 §6, P9.
 *
 * Tres bloques, en el orden en que hay que mirarlos: lo que falta decidir, las notas de débito, y
 * lo que ya está resuelto (por la base o por una persona), con la posibilidad de deshacer. Cada
 * decisión es un botón; la pantalla no decide nada ni calcula nada: pinta y llama. */

import { useCallback, useEffect, useState } from 'react'
import { delCliente, desvincular, leerNotas, vincular, type Comprobante, type Motivo, type NotaCredito, type NotaDebito, type Notas } from '../datos/notas'
import { formatearPesos } from '../dominio/dinero'
import { formatearFecha } from '../dominio/fechas'
import { textoDeFallo, type Fallo, type Resultado } from '../dominio/resultado'

const numero = (c: { puntoVenta: number; numero: number }) => `${String(c.puntoVenta).padStart(4, '0')}-${String(c.numero).padStart(8, '0')}`

export function Revisar() {
  const [notas, setNotas] = useState<Notas | Fallo | null>(null)
  const [fallo, setFallo] = useState<Fallo | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const cargar = useCallback(() => {
    void leerNotas().then((r) => setNotas(r.ok ? r.dato : r.fallo))
  }, [])
  useEffect(cargar, [cargar])

  /** Toda escritura pasa por acá: se hace, y se vuelve a leer de la base lo que quedó. */
  async function decidir(accion: () => Promise<Resultado<null>>): Promise<void> {
    setOcupado(true)
    setFallo(null)
    const r = await accion()
    if (!r.ok) setFallo(r.fallo)
    setOcupado(false)
    cargar()
  }

  if (notas === null) return <p className="apagado">Buscando notas de crédito y débito…</p>
  if ('tipo' in notas) return <p className="error tarjeta">{textoDeFallo(notas)}</p>

  const porDecidir = notas.creditos.filter((n) => n.estado === 'ambigua' || n.estado === 'sin_candidata')
  const resueltas = notas.creditos.filter((n) => n.estado === 'confirmada' || n.estado === 'unica')
  const dePersona = resueltas.filter((n) => n.estado === 'confirmada')
  const solas = resueltas.length - dePersona.length
  // Una NC que una ND revirtió sigue vinculada a su factura, pero ya no la anula: se avisa.
  const revertidaPor = new Map(notas.debitos.flatMap((d) => (d.vinculo ? [[d.vinculo.idDestino, d] as const] : [])))

  return (
    <div className="revisar">
      <h2>Revisar notas de crédito y débito</h2>
      {fallo !== null && <p className="error">{textoDeFallo(fallo)}</p>}

      <section>
        <h3>Para decidir ({porDecidir.length})</h3>
        {porDecidir.length === 0 && <p className="apagado">No queda ninguna nota de crédito sin resolver.</p>}
        {porDecidir.map((n) => (
          <NotaPorDecidir key={n.id} nota={n} ocupado={ocupado} decidir={decidir} />
        ))}
      </section>

      <section>
        <h3>Notas de débito ({notas.debitos.length})</h3>
        {notas.debitos.length === 0 && <p className="apagado">No hay notas de débito.</p>}
        {notas.debitos.map((d) => (
          <NotaDebitoTarjeta key={d.id} nota={d} creditos={notas.creditos} ocupado={ocupado} decidir={decidir} />
        ))}
      </section>

      <section>
        <h3>Ya resueltas ({resueltas.length})</h3>
        <p className="apagado">
          {solas === 1 ? '1 se resolvió sola' : `${solas} se resolvieron solas`}: había una sola factura del mismo cliente y el mismo importe.
          {dePersona.length === 1 && ' 1 la decidió una persona.'}
          {dePersona.length > 1 && ` ${dePersona.length} las decidió una persona.`}
        </p>
        <details>
          <summary>Ver cuáles</summary>
          <ul className="notas">
            {resueltas.map((n) => (
              <li key={n.id}>
                NC {numero(n)} → factura {n.facturas[0] ? numero(n.facturas[0]) : '—'} · {n.receptor ?? n.cuitReceptor} · {formatearPesos(n.total)}
                {revertidaPor.has(n.id) && <strong> · revertida por la ND {numero(revertidaPor.get(n.id) ?? n)}</strong>}
                {n.idVinculo !== null && (
                  <button type="button" className="enlace" disabled={ocupado} onClick={() => void decidir(() => desvincular(n.idVinculo ?? 0))}>
                    Deshacer
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  )
}

type Decidir = (accion: () => Promise<Resultado<null>>) => Promise<void>

function Encabezado({ tipo, nota }: { tipo: string; nota: Comprobante & { receptor: string | null; cuitReceptor: string | null } }) {
  return (
    <p>
      <strong>{tipo} {numero(nota)}</strong> · {formatearFecha(nota.fecha)} · {formatearPesos(nota.total)}
      <br />
      <span className="apagado">{nota.receptor ?? 'Sin nombre'} · CUIT {nota.cuitReceptor ?? '—'}</span>
    </p>
  )
}

function NotaPorDecidir({ nota, ocupado, decidir }: { nota: NotaCredito; ocupado: boolean; decidir: Decidir }) {
  // Sin candidata del mismo importe: se ofrecen las facturas del cliente, y elegir una es un ajuste.
  const [otras, setOtras] = useState<readonly Comprobante[] | null>(null)
  const elegir = (idDestino: number, motivo: Motivo) => decidir(() => vincular({ idOrigen: nota.id, idDestino, motivo }))

  return (
    <div className="tarjeta nota">
      <Encabezado tipo="NC" nota={nota} />
      {nota.estado === 'ambigua' && (
        <>
          <p>Puede ir con cualquiera de estas facturas del mismo importe. ¿Cuál anula?</p>
          <ul className="opciones">
            {nota.facturas.map((f) => (
              <li key={f.id}>
                Factura {numero(f)} · {formatearFecha(f.fecha)}
                <button type="button" disabled={ocupado} onClick={() => void elegir(f.id, 'anula')}>Es ésta</button>
              </li>
            ))}
          </ul>
        </>
      )}
      {nota.estado === 'sin_candidata' && (
        <>
          <p>No hay ninguna factura de este cliente por el mismo importe.</p>
          {otras === null ? (
            <button type="button" disabled={ocupado || nota.cuitReceptor === null} onClick={() => void delCliente(nota.cuitReceptor ?? '', 'factura').then((r) => r.ok && setOtras(r.dato))}>
              Ver las facturas de este cliente
            </button>
          ) : (
            <ListaParaElegir lista={otras} vacio="Este cliente no tiene facturas." boton="Ajusta ésta" ocupado={ocupado} elegir={(id) => void elegir(id, 'ajuste')} />
          )}
        </>
      )}
    </div>
  )
}

function NotaDebitoTarjeta({ nota, creditos, ocupado, decidir }: { nota: NotaDebito; creditos: readonly NotaCredito[]; ocupado: boolean; decidir: Decidir }) {
  const [ncs, setNcs] = useState<readonly Comprobante[] | null>(null)
  const revertida = nota.vinculo ? creditos.find((c) => c.id === nota.vinculo?.idDestino) : undefined

  return (
    <div className="tarjeta nota">
      <Encabezado tipo="ND" nota={nota} />
      {nota.vinculo !== null ? (
        <p>
          Revierte la NC {revertida ? numero(revertida) : `#${nota.vinculo.idDestino}`}: esa nota de crédito deja de anular su factura.{' '}
          <button type="button" className="enlace" disabled={ocupado} onClick={() => void decidir(() => desvincular(nota.vinculo?.idVinculo ?? 0))}>
            Deshacer
          </button>
        </p>
      ) : (
        <>
          <p>¿Revierte alguna nota de crédito de este cliente? Si es así, la factura que esa nota anulaba vuelve a deberse.</p>
          {ncs === null ? (
            <button type="button" disabled={ocupado || nota.cuitReceptor === null} onClick={() => void delCliente(nota.cuitReceptor ?? '', 'nota_credito').then((r) => r.ok && setNcs(r.dato))}>
              Ver las notas de crédito de este cliente
            </button>
          ) : (
            <ListaParaElegir lista={ncs} vacio="Este cliente no tiene notas de crédito." boton="Revierte ésta" ocupado={ocupado} elegir={(id) => void decidir(() => vincular({ idOrigen: nota.id, idDestino: id, motivo: 'revierte_nc' }))} />
          )}
        </>
      )}
    </div>
  )
}

function ListaParaElegir(p: { lista: readonly Comprobante[]; vacio: string; boton: string; ocupado: boolean; elegir: (id: number) => void }) {
  if (p.lista.length === 0) return <p className="apagado">{p.vacio}</p>
  return (
    <ul className="opciones">
      {p.lista.map((c) => (
        <li key={c.id}>
          {numero(c)} · {formatearFecha(c.fecha)} · {formatearPesos(c.total)}
          <button type="button" disabled={p.ocupado} onClick={() => p.elegir(c.id)}>{p.boton}</button>
        </li>
      ))}
    </ul>
  )
}

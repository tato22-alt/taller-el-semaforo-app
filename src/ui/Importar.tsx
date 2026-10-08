/* Importar el libro de ARCA. Plan 005, fase 1.
 *
 * Tres pasos a la vista: elegir el archivo, ver qué se va a importar y qué no, e importar. El
 * archivo se lee entero en el navegador antes de mandar nada, así lo que no se entiende se ve
 * antes de tocar la base. Nada se calcula acá: las cuentas las hacen el lector (dominio/arca.ts)
 * y la base. Esta pantalla pinta y llama. */

import { useEffect, useState } from 'react'
import { importarComprobantes, prepararImportacion, type ParaImportar, type ResumenImportacion } from '../datos/comprobantes'
import { leerMisComprobantes, type LecturaArca } from '../dominio/arca'
import { cuitValido, normalizarCuit } from '../dominio/cuit'
import { huellaSha256 } from '../dominio/huella'
import { textoDeFallo, type Fallo } from '../dominio/resultado'

type Archivo = { readonly nombre: string; readonly huella: string; readonly lectura: LecturaArca }

type Paso =
  | { readonly fase: 'eligiendo' }
  | { readonly fase: 'importando' }
  | { readonly fase: 'importado'; readonly resumen: ResumenImportacion }

export function Importar() {
  const [preparacion, setPreparacion] = useState<ParaImportar | Fallo | null>(null)
  const [cuit, setCuit] = useState('')
  const [archivo, setArchivo] = useState<Archivo | null>(null)
  const [paso, setPaso] = useState<Paso>({ fase: 'eligiendo' })
  const [fallo, setFallo] = useState<Fallo | null>(null)

  useEffect(() => {
    void prepararImportacion().then((r) => {
      setPreparacion(r.ok ? r.dato : r.fallo)
      if (r.ok && r.dato.ultimoEmisor !== null) setCuit(r.dato.ultimoEmisor)
    })
  }, [])

  if (preparacion === null) return <p className="apagado">Preparando…</p>
  if ('tipo' in preparacion) return <p className="error tarjeta">{textoDeFallo(preparacion)}</p>
  const tipos = preparacion.tiposConocidos

  async function alElegir(lista: FileList | null): Promise<void> {
    const elegido = lista?.[0]
    setPaso({ fase: 'eligiendo' })
    setFallo(null)
    if (!elegido) return setArchivo(null)
    const bytes = await elegido.arrayBuffer()
    const texto = new TextDecoder('utf-8').decode(bytes)
    setArchivo({ nombre: elegido.name, huella: await huellaSha256(bytes), lectura: leerMisComprobantes(texto, tipos) })
  }

  async function alImportar(): Promise<void> {
    const cuitEmisor = normalizarCuit(cuit)
    if (archivo === null || !archivo.lectura.ok || cuitEmisor === null) return
    setPaso({ fase: 'importando' })
    const r = await importarComprobantes({
      archivoNombre: archivo.nombre,
      archivoHash: archivo.huella,
      leidas: archivo.lectura.leidas,
      cuitEmisor,
      filas: archivo.lectura.filas,
    })
    if (r.ok) setPaso({ fase: 'importado', resumen: r.dato })
    else {
      setFallo(r.fallo)
      setPaso({ fase: 'eligiendo' })
    }
  }

  const lectura = archivo?.lectura ?? null
  const cuitBien = cuitValido(cuit)
  const sePuede = lectura !== null && lectura.ok && lectura.filas.length > 0 && cuitBien && paso.fase === 'eligiendo'

  return (
    <div className="importar">
      <h2>Importar facturas de ARCA</h2>
      <p className="apagado">
        El archivo de <strong>Mis Comprobantes → Emitidos</strong>, tal como lo baja ARCA. Si lo
        abriste y lo guardaste con Excel, bajalo de nuevo. Importar dos veces el mismo archivo no
        duplica nada.
      </p>

      <label className="campo">
        CUIT de quien emitió estas facturas
        <input value={cuit} onChange={(e) => setCuit(e.target.value)} inputMode="numeric" placeholder="30-00000000-0" />
        {cuit !== '' && !cuitBien && <span className="error">Ese CUIT no es válido: revisá los números.</span>}
      </label>

      <label className="campo">
        Archivo
        <input type="file" accept=".csv,text/csv" onChange={(e) => void alElegir(e.target.files)} />
      </label>

      {lectura !== null && !lectura.ok && <p className="error">{lectura.motivo}</p>}

      {lectura !== null && lectura.ok && paso.fase !== 'importado' && (
        <div className="tarjeta resumen">
          <p>
            <strong>{lectura.filas.length}</strong> comprobante{lectura.filas.length === 1 ? '' : 's'} para importar
            {lectura.errores.length > 0 && <>, <strong>{lectura.errores.length}</strong> con problemas que no se van a importar</>}.
          </p>
          <button type="button" disabled={!sePuede} onClick={() => void alImportar()}>
            {paso.fase === 'importando' ? 'Importando…' : 'Importar'}
          </button>
        </div>
      )}

      {paso.fase === 'importado' && (
        <div className="tarjeta resumen">
          <p>
            Listo. <strong>{paso.resumen.nuevas}</strong> nueva{paso.resumen.nuevas === 1 ? '' : 's'} ·{' '}
            <strong>{paso.resumen.yaEstaban}</strong> ya estaba{paso.resumen.yaEstaban === 1 ? '' : 'n'}
            {lectura !== null && lectura.ok && lectura.errores.length > 0 && (
              <> · <strong>{lectura.errores.length}</strong> con problemas, sin importar</>
            )}
          </p>
        </div>
      )}

      {lectura !== null && lectura.ok && lectura.errores.length > 0 && (
        <div className="problemas">
          <h3>Renglones que no se importan</h3>
          <ul>
            {lectura.errores.map((e) => (
              <li key={e.renglon}>
                Renglón {e.renglon}: {e.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fallo !== null && <p className="error">{textoDeFallo(fallo)}</p>}
    </div>
  )
}

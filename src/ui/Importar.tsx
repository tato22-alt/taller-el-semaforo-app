/* Importar los libros de ARCA. Plan 005, fase 1; y las compras, spec 013 de semaforo-base.
 *
 * Tres pasos a la vista: elegir el archivo, ver qué se va a importar y qué no, e importar. El
 * archivo se lee entero en el navegador antes de mandar nada, así lo que no se entiende se ve
 * antes de tocar la base. La app reconoce sola si es el de Emitidos (ventas) o el de Recibidos
 * (compras) y lo manda a su tabla: no hay nada que elegir, así que no se pueden mezclar. Nada se
 * calcula acá: las cuentas las hacen el lector (dominio/arca.ts) y la base. */

import { useEffect, useState } from 'react'
import { importarCompras, SIN_PERMISO } from '../datos/compras'
import { importarComprobantes, prepararImportacion, type ParaImportar, type ResumenImportacion } from '../datos/comprobantes'
import { revincularEnvios } from '../datos/orden-factura'
import { claseDeArchivo, leerMisComprobantes, leerRecibidos, recibidoPorOtro, type LecturaArca, type LecturaRecibidos } from '../dominio/arca'
import { cuitValido, normalizarCuit } from '../dominio/cuit'
import { huellaSha256 } from '../dominio/huella'
import { textoDeFallo, type Fallo } from '../dominio/resultado'

type Archivo = { readonly nombre: string; readonly huella: string } & (
  | { readonly clase: 'emitidos'; readonly lectura: LecturaArca }
  | { readonly clase: 'recibidos'; readonly lectura: LecturaRecibidos }
  | { readonly clase: null }
)

type Paso =
  | { readonly fase: 'eligiendo' }
  | { readonly fase: 'importando' }
  | { readonly fase: 'importado'; readonly resumen: ResumenImportacion }

export function Importar({ vePlata }: { vePlata: boolean }) {
  const [preparacion, setPreparacion] = useState<ParaImportar | Fallo | null>(null)
  const [cuit, setCuit] = useState('')
  const [archivo, setArchivo] = useState<Archivo | null>(null)
  const [paso, setPaso] = useState<Paso>({ fase: 'eligiendo' })
  const [vinculadas, setVinculadas] = useState<number | null>(null)
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
  const cuitDelTaller = preparacion.ultimoEmisor

  async function alElegir(lista: FileList | null): Promise<void> {
    const elegido = lista?.[0]
    setPaso({ fase: 'eligiendo' })
    setFallo(null)
    if (!elegido) return setArchivo(null)
    const bytes = await elegido.arrayBuffer()
    const texto = new TextDecoder('utf-8').decode(bytes)
    const base = { nombre: elegido.name, huella: await huellaSha256(bytes) }
    const clase = claseDeArchivo(texto)
    if (clase === 'emitidos') setArchivo({ ...base, clase, lectura: leerMisComprobantes(texto, tipos) })
    else if (clase === 'recibidos') setArchivo({ ...base, clase, lectura: leerRecibidos(texto, tipos) })
    else setArchivo({ ...base, clase: null })
  }

  async function alImportar(): Promise<void> {
    if (archivo === null || archivo.clase === null || !archivo.lectura.ok) return
    const comun = { archivoNombre: archivo.nombre, archivoHash: archivo.huella, leidas: archivo.lectura.leidas }
    let r
    if (archivo.clase === 'emitidos') {
      const cuitEmisor = normalizarCuit(cuit)
      if (cuitEmisor === null) return
      setPaso({ fase: 'importando' })
      r = await importarComprobantes({ ...comun, cuitEmisor, filas: archivo.lectura.filas })
      // Spec 012: los mails de factura que esperaban este CSV se vuelven a mirar. Si falla, la
      // importación igual quedó hecha: se reintenta con el próximo CSV o el robot.
      if (r.ok) void revincularEnvios().then((v) => setVinculadas(v.ok ? v.dato : null))
    } else {
      setPaso({ fase: 'importando' })
      r = await importarCompras({ ...comun, filas: archivo.lectura.filas })
    }
    if (r.ok) setPaso({ fase: 'importado', resumen: r.dato })
    else {
      setFallo(r.fallo)
      setPaso({ fase: 'eligiendo' })
    }
  }

  const lectura = archivo !== null && archivo.clase !== null ? archivo.lectura : null
  const deCompras = archivo?.clase === 'recibidos'
  const cuitBien = cuitValido(cuit)
  // Lo que frena un archivo de compras: no tener el permiso, o que sea de otro CUIT.
  const deOtro = archivo?.clase === 'recibidos' && archivo.lectura.ok ? recibidoPorOtro(archivo.lectura.filas, cuitDelTaller) : null
  const freno = !deCompras ? null : !vePlata ? SIN_PERMISO : deOtro !== null ? `Este archivo es de otro CUIT (${deOtro}): no es del taller, y no se importa.` : null
  const sePuede = lectura !== null && lectura.ok && lectura.filas.length > 0 && (deCompras ? freno === null : cuitBien) && paso.fase === 'eligiendo'
  const proveedores = archivo?.clase === 'recibidos' && archivo.lectura.ok ? new Set(archivo.lectura.filas.map((f) => f.cuitEmisor)).size : 0

  return (
    <div className="importar">
      <h2>Importar de ARCA</h2>
      <p className="apagado">
        El archivo de <strong>Mis Comprobantes</strong>, tal como lo baja ARCA: el de <strong>Emitidos</strong> (lo que
        facturás) o el de <strong>Recibidos</strong> (lo que te facturan). La app reconoce sola cuál es. Si lo abriste y lo
        guardaste con Excel, bajalo de nuevo. Importar dos veces el mismo archivo no duplica nada.
      </p>

      {!deCompras && (
        <label className="campo">
          CUIT de quien emitió las facturas (para el archivo de Emitidos)
          <input value={cuit} onChange={(e) => setCuit(e.target.value)} inputMode="numeric" placeholder="30-00000000-0" />
          {cuit !== '' && !cuitBien && <span className="error">Ese CUIT no es válido: revisá los números.</span>}
        </label>
      )}

      <label className="campo">
        Archivo
        <input type="file" accept=".csv,text/csv" onChange={(e) => void alElegir(e.target.files)} />
      </label>

      {archivo !== null && archivo.clase === null && (
        <p className="error">No parece un archivo de Mis Comprobantes de ARCA: no trae ni «Denominación Receptor» ni «Denominación Emisor».</p>
      )}
      {lectura !== null && !lectura.ok && <p className="error">{lectura.motivo}</p>}

      {lectura !== null && lectura.ok && paso.fase !== 'importado' && (
        <div className="tarjeta resumen">
          <p>
            Es el archivo de <strong>{deCompras ? 'Recibidos: las compras' : 'Emitidos: las ventas'}</strong>.{' '}
            <strong>{lectura.filas.length}</strong> comprobante{lectura.filas.length === 1 ? '' : 's'} para importar
            {deCompras && <>, de <strong>{proveedores}</strong> proveedor{proveedores === 1 ? '' : 'es'}</>}
            {lectura.errores.length > 0 && <>, <strong>{lectura.errores.length}</strong> con problemas que no se van a importar</>}.
          </p>
          {freno !== null && <p className="error">{freno}</p>}
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
          {deCompras && (
            <p>
              Las compras ya están en <a href="#/plata">La plata del taller</a>. Si entró algún proveedor nuevo, ahí se le pone el rubro.
            </p>
          )}
          {!deCompras && vinculadas !== null && vinculadas > 0 && (
            <p>
              <strong>{vinculadas}</strong> factura{vinculadas === 1 ? '' : 's'} mandada{vinculadas === 1 ? '' : 's'} por mail ya
              quedaron con su orden de trabajo.
            </p>
          )}
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

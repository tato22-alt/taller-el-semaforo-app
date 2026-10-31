/* La factura lista para mandar: qué se le pide a la base. Con un cliente falso: que cada estado salga
 * bien y que los controles cierren lo prueba qa-016.sql de semaforo-base contra el Postgres local. */

import { describe, expect, it } from 'vitest'
import type { ClienteBase } from './cliente-supabase'
import { armarIgual, leerFacturasParaMandar, sacarArchivo, subirArchivo } from './mandar-factura'

function clienteFalso(o: { conSesion?: boolean; filas?: readonly unknown[]; error?: { code: string; message: string }; errorAlSubir?: string } = {}) {
  const llamadas: string[] = []
  const cadena = (datos: unknown): unknown =>
    Object.assign(Promise.resolve({ data: o.error ? null : datos, error: o.error ?? null }), {
      eq: (c: string, v: unknown) => { llamadas.push(`  where ${c} = ${String(v)}`); return cadena(datos) },
      order: () => cadena(datos),
      range: () => cadena(datos),
      select: () => cadena(datos),
      single: () => cadena(datos),
    })
  const from = (tabla: string) => ({
    select: () => { llamadas.push(`lee ${tabla}`); return cadena(o.filas ?? []) },
    insert: (fila: Record<string, unknown>) => { llamadas.push(`inserta ${tabla} ${JSON.stringify(fila)}`); return cadena({ id_para_mandar: 77 }) },
    update: (cambios: Record<string, unknown>) => { llamadas.push(`cambia ${tabla} ${Object.keys(cambios).join(',')}`); return cadena(null) },
  })
  const storage = {
    from: (espacio: string) => ({
      upload: (ruta: string, _archivo: unknown, opciones: { contentType: string; upsert: boolean }) => {
        llamadas.push(`sube ${espacio}/${ruta.replace(/\/\d+-/, '/<hora>-')} ${opciones.contentType} ${String(opciones.upsert)}`)
        return Promise.resolve(o.errorAlSubir ? { data: null, error: { message: o.errorAlSubir } } : { data: { path: ruta }, error: null })
      },
    }),
  }
  const sesion = (o.conSesion ?? true) ? { session: { user: { email: 'taller@ejemplo.com' } } } : { session: null }
  return { cliente: { auth: { getSession: () => Promise.resolve({ data: sesion, error: null }) }, from, storage } as unknown as ClienteBase, llamadas }
}

const archivo = (nombre: string, tipo: string) => new File(['x'], nombre, { type: tipo })

describe('la factura lista para mandar, en la base', () => {
  it('lee en qué anda cada orden, con sus archivos', async () => {
    const { cliente } = clienteFalso({ filas: [
      { id_orden: 10, id_para_mandar: 1, estado: 'no_cierra', para: 'f@c.example', para_origen: 'mas_usada', asunto: null,
        problemas: ['otro_cuit'], archivos: [{ id: 3, clase: 'factura', nombre: 'F.pdf', tipo: 'application/pdf', ruta: '10/x' }], mandado_en: null },
      { id_orden: 11, id_para_mandar: null, estado: 'estado_que_no_conozco', para: null, para_origen: null, asunto: null, problemas: null, archivos: [], mandado_en: null },
      { id_orden: 12, id_para_mandar: 2, estado: 'mandada', para: 'f@c.example', para_origen: 'intento', asunto: 'a', problemas: [], archivos: [], mandado_en: '2026-10-31T01:30:00+00:00' },
    ] })
    const r = await leerFacturasParaMandar(cliente)
    expect(r.ok && r.dato !== 'todavia_no' && [...r.dato.values()].map((f) => [f.idOrden, f.estado, f.problemas, f.archivos.map((a) => a.nombre), f.mandadaEl]))
      .toEqual([[10, 'no_cierra', ['otro_cuit'], ['F.pdf'], null], [12, 'mandada', [], [], '2026-10-30']])
  })

  it('antes de la migración de la spec 016 no es un error: es que todavía no está', async () => {
    const { cliente } = clienteFalso({ error: { code: 'PGRST205', message: "Could not find the table 'public.vw_factura_para_mandar'" } })
    expect(await leerFacturasParaMandar(cliente)).toEqual({ ok: true, dato: 'todavia_no' })
  })

  it('el primer archivo abre el intento; primero se sube el archivo, después se anota', async () => {
    const { cliente, llamadas } = clienteFalso()
    expect(await subirArchivo(10, null, 'factura', archivo('Factura 3285.pdf', 'application/pdf'), cliente)).toEqual({ ok: true, dato: 77 })
    expect(llamadas).toEqual([
      'inserta factura_para_mandar {"id_orden":10}',
      'sube facturas-para-mandar/10/<hora>-factura-Factura_3285.pdf application/pdf false',
      expect.stringMatching(/^inserta archivo_para_mandar \{"id_para_mandar":77,"clase":"factura","ruta":"10\/\d+-factura-Factura_3285.pdf","nombre":"Factura 3285.pdf","tipo":"application\/pdf"\}$/),
    ])
  })

  it('con el intento abierto no abre otro; si no se pudo subir, no anota nada', async () => {
    const una = clienteFalso()
    await subirArchivo(10, 5, 'orden_firmada', archivo('firma.jpg', 'image/jpeg'), una.cliente)
    expect(una.llamadas.filter((l) => l.startsWith('inserta factura_para_mandar'))).toEqual([])
    const otra = clienteFalso({ errorAlSubir: 'The object exceeded the maximum allowed size' })
    const r = await subirArchivo(10, 5, 'orden_firmada', archivo('firma.jpg', 'image/jpeg'), otra.cliente)
    expect(r.ok).toBe(false)
    expect(otra.llamadas.filter((l) => l.startsWith('inserta'))).toEqual([])
  })

  it('sacar un archivo y "armar igual" sólo marcan; sin sesión no se pide nada', async () => {
    const { cliente, llamadas } = clienteFalso()
    await sacarArchivo(3, cliente)
    await armarIgual(1, cliente)
    expect(llamadas).toEqual(['cambia archivo_para_mandar quitado_en', '  where id_archivo = 3', 'cambia factura_para_mandar armar_igual_en', '  where id_para_mandar = 1'])
    const sin = clienteFalso({ conSesion: false })
    expect(await subirArchivo(10, null, 'factura', archivo('f.pdf', 'application/pdf'), sin.cliente)).toEqual({ ok: false, fallo: { tipo: 'sin_sesion' } })
    expect(sin.llamadas).toEqual([])
  })
})

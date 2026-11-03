/* La factura lista para mandar (spec 016 de semaforo-base). Que la base controle bien la factura contra
 * la orden lo prueba qa-016.sql de semaforo-base; acá, que el robot lea la factura de ARCA, arme el mail
 * con sus adjuntos y nunca lo mande. Todo inventado: los números y los CUIT tienen la forma de los
 * reales, no son reales, y no hay ningún Google de verdad. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const CARPETA = import.meta.dirname
const leer = (n: string) => readFileSync(join(CARPETA, 'lectores', n), 'utf8')

type Leida = { puntoVenta: number | null; numero: number | null; cuits: string[]; neto: string | null; total: string | null; letra: string | null; siniestros: string[] }
type Archivo = { clase: string; nombre: string; tipo: string; ruta: string }

const R = runInNewContext(
  [leer('comun.js'), leer('factura-arca.js'), leer('borrador.js')].join('\n') +
    '\n;({ leerFacturaArca, cuerpoDelBorrador, mensajeDelBorrador, adjuntosEnOrden, utf8EnBase64 })',
  {},
) as {
  leerFacturaArca: (t: string) => Leida
  cuerpoDelBorrador: (hora: number, letra: string | null) => string
  mensajeDelBorrador: (b: { para: string; asunto: string; cuerpo: string; adjuntos: { nombre: string; tipo: string; base64: string }[] }) => string
  adjuntosEnOrden: (a: Archivo[], nombre: string | null) => Archivo[]
  utf8EnBase64: (t: string) => string
}
/* Lo que sale de otro contexto de vm se pasa por JSON para compararlo con objetos de acá. */
const json = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T

/** Una factura como queda el PDF de ARCA pasado a texto: con renglones partidos y repetida (ORIGINAL, DUPLICADO). */
function facturaDeArca(o: { cod?: string; pv?: string; numero?: string; cuitCompania?: string; detalle?: string; neto?: string; total?: string } = {}) {
  const una = (copia: string) => [
    'TALLER DE PRUEBA S.R.L. ', copia, 'A ', `COD. ${o.cod ?? '01'}`, '\t', '', 'FACTURA ',
    `Punto de Venta: ${o.pv ?? '00002'} Comp. Nro: ${o.numero ?? '00003285'} `, 'Razón Social: ', 'TALLER DE PRUEBA S.R.L. ',
    'Fecha de Emisión: ', '20/10/2026 ', 'CUIT: ', '30000000007 ', 'Ingresos Brutos: ', '30000000007 ',
    'Período Facturado Desde: Hasta: Fecha de Vto. para el pago: 20/10/2026 20/10/2026 20/10/2026 ',
    'CUIT: ', `${o.cuitCompania ?? '30500000001'} COMPAÑIA DE SEGUROS DE PRUEBA S.A. Apellido y Nombre / Razón Social: `,
    'Código ', '\tProducto / Servicio ', '\tCantidad ',
    o.detalle ?? 'POR REPARACIÓN FORD KA PATENTE AA000AA SINIESTRO N° 900000001 ',
    '1,00 unidades 100000,00 0,00 100000,00 21% 121000,00 ',
    `Importe Neto Gravado: $ ${o.neto ?? '100000,00'} `, 'IVA 21%: $ 21000,00 ', `Importe Total: $ ${o.total ?? '121000,00'} `,
    'CAE N°:     ', 'Comprobante Autorizado ', 'Pág. 1/1',
  ].join('\r\n')
  return `${una('ORIGINAL ')}\r\n${una('DUPLICADO ')}`
}

describe('la factura de ARCA', () => {
  it('lee el número, los dos CUIT, el neto, el total, la letra y el siniestro', () => {
    expect(json(R.leerFacturaArca(facturaDeArca()))).toEqual({
      puntoVenta: 2, numero: 3285, cuits: ['30000000007', '30500000001'], neto: '100000.00', total: '121000.00', letra: 'A', siniestros: ['900000001'],
    })
  })

  it('el siniestro como lo escriba el taller; la letra de la factura B o de crédito MiPyME', () => {
    expect(R.leerFacturaArca(facturaDeArca({ detalle: 'REPARACION Siniestro: 12345/26 ' })).siniestros).toEqual(['12345/26'])
    expect(R.leerFacturaArca(facturaDeArca({ detalle: 'REPARACION SINIESTRO N° C00111111111110022222222222 ' })).siniestros).toEqual(['C00111111111110022222222222'])
    expect(R.leerFacturaArca(facturaDeArca({ cod: '06' })).letra).toBe('B')
    expect(R.leerFacturaArca(facturaDeArca({ cod: '201' })).letra).toBe('A')
  })

  it('lo que no encuentra queda nulo: decide la base', () => {
    expect(json(R.leerFacturaArca('[no se pudo leer el PDF: HTTP 500]'))).toEqual({
      puntoVenta: null, numero: null, cuits: [], neto: null, total: null, letra: null, siniestros: [],
    })
  })
})

/** Desarma el mail que arma el robot, como lo haría Gmail. */
function desarmar(mime: string) {
  const [cabeza = '', ...resto] = mime.split('\r\n\r\n')
  const limite = /boundary="([^"]+)"/.exec(cabeza)?.[1] ?? ''
  const encabezado = (n: string) => new RegExp(`^${n}: (.*(?:\\r\\n .*)*)`, 'm').exec(cabeza)?.[1] ?? ''
  const decodificar = (h: string) => h.replace(/=\?UTF-8\?B\?([^?]+)\?=(\r\n )?/g, (_, b: string) => Buffer.from(b, 'base64').toString('utf8'))
  const partes = resto.join('\r\n\r\n').split(`--${limite}`).slice(1, -1).map((p) => {
    const [h = '', cuerpo = ''] = p.replace(/^\r\n/, '').split('\r\n\r\n')
    return {
      tipo: /Content-Type: ([^;\r\n]+)/.exec(h)?.[1],
      nombre: /filename\*=UTF-8''([^\r\n;]+)/.exec(h)?.[1],
      bytes: Buffer.from(cuerpo.replace(/\r\n/g, ''), 'base64'),
    }
  })
  return { para: encabezado('To'), asunto: decodificar(encabezado('Subject')), asuntoCrudo: encabezado('Subject'), partes, ascii: /^[\x00-\x7f]*$/.test(mime) }
}

describe('el mail de la factura', () => {
  it('el texto de siempre, con el saludo de la hora', () => {
    expect(R.cuerpoDelBorrador(9, 'A')).toBe('Buenos días, adjunto factura A y conformidad de trabajos realizados.')
    expect(R.cuerpoDelBorrador(13, 'B')).toBe('Buenas tardes, adjunto factura B y conformidad de trabajos realizados.')
  })

  it('la factura primero, después la orden firmada y lo demás; la factura con el nombre de la ficha', () => {
    const archivos = [
      { clase: 'otro', nombre: 'remito.pdf', tipo: 'application/pdf', ruta: '1/c' },
      { clase: 'orden_firmada', nombre: 'firma.jpg', tipo: 'image/jpeg', ruta: '1/b' },
      { clase: 'factura', nombre: 'FACTURA.pdf', tipo: 'application/pdf', ruta: '1/a' },
    ]
    expect(json(R.adjuntosEnOrden(archivos, '0022222222222.pdf')).map((a) => a.nombre)).toEqual(['0022222222222.pdf', 'firma.jpg', 'remito.pdf'])
    expect(json(R.adjuntosEnOrden(archivos, null)).map((a) => a.nombre)[0]).toBe('FACTURA.pdf')
  })

  it('arma el mail entero en ASCII: el asunto con "n°", el cuerpo y los adjuntos se leen igual del otro lado', () => {
    const pdf = Buffer.from('%PDF-1.4 factura de prueba')
    const foto = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
    const mime = R.mensajeDelBorrador({
      para: 'facturas@compania.example', asunto: 'factura n°3285 siniestro n°900000001', cuerpo: R.cuerpoDelBorrador(9, 'A'),
      adjuntos: [
        { nombre: 'FACTURA 0002-00003285.pdf', tipo: 'application/pdf', base64: pdf.toString('base64') },
        { nombre: 'Conformidad firmada (ñandú).jpg', tipo: 'image/jpeg', base64: foto.toString('base64') },
      ],
    })
    const m = desarmar(mime)
    expect(m.ascii).toBe(true)
    expect(m.para).toBe('facturas@compania.example')
    expect(m.asuntoCrudo).toMatch(/^=\?UTF-8\?B\?/)
    expect(m.asunto).toBe('factura n°3285 siniestro n°900000001')
    expect(m.partes.map((p) => p.tipo)).toEqual(['text/plain', 'application/pdf', 'image/jpeg'])
    expect(m.partes[0]?.bytes.toString('utf8')).toBe('Buenos días, adjunto factura A y conformidad de trabajos realizados.')
    expect(m.partes[1]?.bytes.equals(pdf)).toBe(true)
    expect(m.partes[2]?.bytes.equals(foto)).toBe(true)
    expect(decodeURIComponent(m.partes[2]?.nombre ?? '')).toBe('Conformidad firmada (ñandú).jpg')
    // Un asunto sin tildes va tal cual (el de Allianz).
    expect(desarmar(R.mensajeDelBorrador({ para: 'x@y.example', asunto: 'Pago factura 0022222222222', cuerpo: 'c', adjuntos: [] })).asuntoCrudo).toBe('Pago factura 0022222222222')
  })

  it('el base64 de un texto con tildes es el mismo que el de Node', () => {
    for (const t of ['', 'a', 'ab', 'abc', 'n°3285', 'Buenos días, ñandú 😀']) expect(R.utf8EnBase64(t)).toBe(Buffer.from(t, 'utf8').toString('base64'))
  })
})

/* ------------------------------------------------------------------------------------------- */

type Llamada = { a: string; datos?: unknown }

/** La base, el espacio de archivos, Drive y Gmail, falsos. Gmail no tiene ninguna forma de mandar. */
function robotFalso(o: { control?: Record<string, unknown>; hilos?: Record<string, { labelIds: string[] }[] | 'no_existe' | 'roto'>; borradores?: string[] } = {}) {
  const llamadas: Llamada[] = []
  const borradoresCreados: string[] = []
  const archivos: Record<string, Buffer> = {
    'facturas-para-mandar/10/factura.pdf': Buffer.from('%PDF factura'),
    'facturas-para-mandar/10/firmada.jpg': Buffer.from([0xff, 0xd8, 1]),
  }
  const respuesta = (codigo: number, texto: string) => ({ getResponseCode: () => codigo, getContentText: () => texto })
  const blob = (b: Buffer) => {
    const x = { getBytes: () => [...b], setName: () => x, setContentType: () => x }
    return x
  }
  const noExiste = () => { throw new Error('GoogleJsonResponseException: API call to gmail.users.threads.get failed with error: Requested entity was not found.') }
  const contexto = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => (k === 'SUPABASE_URL' ? 'https://base.example' : 'x') }) },
    ScriptApp: { getOAuthToken: () => 'token-de-drive' },
    Utilities: {
      formatDate: (d: Date, _zona: string, formato: string) => (formato === 'H' ? '10' : d.toISOString().slice(0, 10)),
      base64Encode: (bytes: number[]) => Buffer.from(bytes).toString('base64'),
      base64EncodeWebSafe: (t: string) => Buffer.from(t, 'utf8').toString('base64url'),
    },
    Drive: { Files: { create: () => ({ id: 'doc-temporal' }), remove: () => undefined } },
    UrlFetchApp: {
      fetch: (url: string, opciones: { payload?: string }) => {
        if (url.includes('/auth/v1/token')) return respuesta(200, JSON.stringify({ access_token: 'falso' }))
        if (url.includes('/drive/v3/files/doc-temporal/export')) return respuesta(200, facturaDeArca())
        const archivo = /\/storage\/v1\/object\/authenticated\/(.+)$/.exec(url)?.[1]
        if (archivo !== undefined) {
          llamadas.push({ a: `baja ${decodeURIComponent(archivo)}` })
          const b = archivos[decodeURIComponent(archivo)]
          return b ? { ...respuesta(200, ''), getBlob: () => blob(b) } : respuesta(404, '')
        }
        const funcion = /\/rpc\/(\w+)$/.exec(url)?.[1] ?? '?'
        const datos = JSON.parse(opciones.payload ?? '{}') as Record<string, unknown>
        llamadas.push({ a: funcion, datos })
        if (funcion === 'fn_robot_facturas_para_mandar') {
          return respuesta(200, JSON.stringify({
            armar: [{ id: 1, orden: 10, compania: 'Compañía', archivos: [
              { id: 2, clase: 'orden_firmada', nombre: 'firmada.jpg', tipo: 'image/jpeg', ruta: '10/firmada.jpg' },
              { id: 1, clase: 'factura', nombre: 'FACTURA 0002-00003285.pdf', tipo: 'application/pdf', ruta: '10/factura.pdf' },
            ] }],
            mirar: [{ id: 5, borrador: 'b5', hilo: 'h5' }, { id: 6, borrador: 'b6', hilo: 'h6' }, { id: 7, borrador: 'b7', hilo: 'h7' }],
          }))
        }
        if (funcion === 'fn_robot_controla_factura') {
          return respuesta(200, JSON.stringify(o.control ?? { armar: true, problemas: [], para: 'facturas@compania.example', asunto: 'factura n°3285 siniestro n°900000001', archivo: null }))
        }
        if (funcion === 'fn_robot_anota_borrador') return respuesta(204, '')
        return respuesta(200, JSON.stringify(datos.p_visto === 'mandado' ? 'vinculada' : 'borrado'))
      },
    },
    Gmail: {
      Users: {
        Threads: {
          get: (_yo: string, hilo: string) => {
            const h = (o.hilos ?? {})[hilo]
            if (h === 'roto') throw new Error('Service unavailable')
            if (h === undefined || h === 'no_existe') return noExiste()
            return { messages: h.map((m, i) => ({ id: `${hilo}-m${i}`, internalDate: String(Date.UTC(2026, 9, 30, 15)), labelIds: m.labelIds })) }
          },
        },
        Drafts: {
          get: (_yo: string, id: string) => ((o.borradores ?? []).includes(id) ? { id } : noExiste()),
          create: (recurso: { message: { raw: string } }, yo: string) => {
            expect(yo).toBe('me')
            borradoresCreados.push(Buffer.from(recurso.message.raw, 'base64url').toString('utf8'))
            return { id: 'borrador-nuevo', message: { id: 'm-nuevo', threadId: 'hilo-nuevo' } }
          },
        },
      },
    },
  }
  const r = runInNewContext(readFileSync(join(CARPETA, 'robot.gs'), 'utf8') + '\n;({ armarFacturas, armarFacturasSinCortar })', contexto) as {
    armarFacturas: () => string
    armarFacturasSinCortar: (inicio: number) => string
  }
  return { ...r, llamadas, borradoresCreados }
}

describe('el robot arma el borrador y mira los que ya están', () => {
  it('baja los archivos, lee la factura, la controla la base, arma el borrador y lo anota; ve uno mandado y uno borrado', () => {
    const g = robotFalso({ hilos: { h5: [{ labelIds: ['DRAFT'] }, { labelIds: ['SENT'] }], h6: 'no_existe', h7: [{ labelIds: ['DRAFT'] }] }, borradores: ['b7'] })
    expect(g.armarFacturas()).toBe('Facturas para mandar: 1 borrador armado, 1 mandada, 1 borrador borrado sin mandar.')

    // Lo que leyó de la factura, tal cual se lo pasó a la base.
    const control = g.llamadas.find((l) => l.a === 'fn_robot_controla_factura')?.datos as { p_id: number; p_leido: Leida }
    expect(control.p_id).toBe(1)
    expect(control.p_leido).toMatchObject({ numero: 3285, cuits: ['30000000007', '30500000001'], siniestros: ['900000001'], letra: 'A' })
    expect(g.llamadas.find((l) => l.a === 'fn_robot_anota_borrador')?.datos).toEqual({ p_id: 1, p_borrador_id: 'borrador-nuevo', p_hilo_id: 'hilo-nuevo' })

    // El borrador: a la casilla, con el asunto de siempre, el saludo de la hora y la factura primero.
    expect(g.borradoresCreados).toHaveLength(1)
    const m = desarmar(g.borradoresCreados[0] ?? '')
    expect([m.para, m.asunto]).toEqual(['facturas@compania.example', 'factura n°3285 siniestro n°900000001'])
    expect(m.partes.map((p) => [p.tipo, decodeURIComponent(p.nombre ?? '')])).toEqual([
      ['text/plain', ''], ['application/pdf', 'FACTURA 0002-00003285.pdf'], ['image/jpeg', 'firmada.jpg'],
    ])
    expect(m.partes[0]?.bytes.toString('utf8')).toBe('Buenos días, adjunto factura A y conformidad de trabajos realizados.')

    // Lo visto: el enviado, con su id y su fecha; el que ya no está, como borrado; el que sigue, nada.
    const vistos = g.llamadas.filter((l) => l.a === 'fn_robot_anota_lo_visto').map((l) => l.datos)
    expect(vistos).toEqual([
      { p_id: 5, p_visto: 'mandado', p_message_id: 'h5-m1', p_fecha: '2026-10-30' },
      { p_id: 6, p_visto: 'borrado', p_message_id: null, p_fecha: null },
    ])
  })

  it('si la base dice que no cierra, no arma nada', () => {
    const g = robotFalso({ control: { armar: false, problemas: ['otro_cuit'], para: 'x@y.example', asunto: 'a', archivo: null }, borradores: ['b5', 'b6', 'b7'] })
    expect(g.armarFacturas()).toBe('Facturas para mandar: 1 no cierra (lo dice la tarjeta).')
    expect(g.borradoresCreados).toEqual([])
  })

  it('un error de Gmail al mirar un borrador no es "se borró", y no frena a los demás', () => {
    const g = robotFalso({ hilos: { h5: 'roto', h6: 'roto', h7: 'roto' } })
    expect(g.armarFacturas()).toBe('Facturas para mandar: 1 borrador armado, 3 con error (borrador b5: Service unavailable).')
    expect(g.llamadas.filter((l) => l.a === 'fn_robot_anota_lo_visto')).toEqual([])
  })

  it('nunca manda: en el código del robot no hay ninguna llamada que mande', () => {
    const codigo = readFileSync(join(CARPETA, 'mandar.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(codigo).toMatch(/Gmail\.Users\.Drafts\.create\(/)
    expect(codigo).not.toMatch(/\.send\s*\(|sendEmail|Drafts\.(send|update|delete|remove)|GmailApp|MailApp/)
  })
})

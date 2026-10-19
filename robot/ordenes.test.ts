/* El lector de órdenes de trabajo del robot. Spec 010 de semaforo-base.
 *
 * Todos los mails de acá son INVENTADOS, con la forma de los reales (H3: el repo es público).
 * Siniestros, patentes, peritos y montos no son de nadie. */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const DIR = join(import.meta.dirname, 'lectores')
type Mail = { remitente: string; asunto: string; cuerpo: string; textoPdf: string }
const fuentes = readdirSync(DIR).filter((n) => n.endsWith('.js')).sort()
const { leerOrden } = runInNewContext(
  fuentes.map((n) => readFileSync(join(DIR, n), 'utf8')).join('\n') + '\n;({ leerOrden })',
  {},
) as { leerOrden: (m: Mail) => unknown }

const leer = (m: Partial<Mail>) =>
  JSON.parse(JSON.stringify(leerOrden({ remitente: '', asunto: '', cuerpo: '', textoPdf: '', ...m }))) as Record<string, unknown> | null

const ORION = 'Sistemas <sistemas@mg.sistema-orion.com>'
const MERCANTIL = 'no-responder@mail.lamercantil.flowable-managed.com'

describe('órdenes de Orion', () => {
  it('saca compañía, siniestro, vehículo, patente y perito del asunto', () => {
    expect(leer({
      remitente: ORION,
      asunto: 'Orden De Trabajo SANCOR-COOPERATIVA-DE-SEGUROS-LTDA---CASA-CENTRAL-2000000001FORD-KA-15-S-4P-AB123CD-JUAN-PEREZINVENTADO',
      cuerpo: 'Buenas tardes, envío orden. Los repuestos los entrega Autopartes Ejemplo en 5 días.',
      textoPdf: 'Orden de trabajo\nMano de obra 100.000,00\nRepuestos 50.000,00\nTotal: $ 150.000,00',
    })).toEqual({
      tipo: 'orden', plataforma: 'orion', compania: 'Sancor', siniestro: '2000000001',
      patente: 'AB123CD', vehiculo: 'FORD KA 15 S 4P', perito: 'JUAN PEREZINVENTADO', peritoMail: null,
      monto: '150000.00', franquicia: null,
      repuestos: 'Los repuestos los entrega Autopartes Ejemplo en 5 días', referencia: null, lector: 'ordenes v4',
    })
  })

  it('anota la franquicia si el cuerpo la menciona, y entiende las patentes viejas', () => {
    const r = leer({
      remitente: ORION,
      asunto: 'Orden De Trabajo LA-SEGUNDA-COOP-LTDA-DE-SEGUROS-GRALES-010120269999999FIAT-PALIO-14-ABC123-ANA-GOMEZINVENTADA',
      cuerpo: 'Estimados: envío orden de trabajo, asegurado abona franquicia en taller.',
    })
    expect(r).toMatchObject({ compania: 'La Segunda', siniestro: '010120269999999', patente: 'ABC123', franquicia: 'asegurado abona franquicia en taller' })
  })

  it('la franquicia con monto no se corta en el punto de los miles', () => {
    const r = leer({ remitente: ORION, asunto: 'Orden De Trabajo ZAASA-1TOYOTA-ETIOS-AB123CD-P-I', cuerpo: 'Envío orden de trabajo, asegurado abona franquicia $340.000 en taller. Saludos.' })
    expect(r).toMatchObject({ franquicia: 'asegurado abona franquicia $340.000 en taller' })
  })

  it('el número de siniestro con letras se corta donde empieza la marca, no antes', () => {
    const r = leer({ remitente: ORION, asunto: 'Orden De Trabajo ZAASA-0001AUT1234567DS7654321TOYOTA-COROLLA-AB123CD-PERITO-INVENTADO' })
    expect(r).toMatchObject({ compania: 'Zurich ex QBE', siniestro: '0001AUT1234567DS7654321', vehiculo: 'TOYOTA COROLLA' })
  })

  it('una orden que dice "dejar sin efecto" es una anulación', () => {
    const r = leer({ remitente: ORION, asunto: 'Orden De Trabajo ZAASA-0001AUT1TOYOTA-ETIOS-AB123CD-PERITO-INVENTADO', cuerpo: 'Dejar sin efecto esta orden.' })
    expect(r).toMatchObject({ tipo: 'anulacion' })
  })

  it.each([
    ['Dejar sin efecto esta orden y la orden anterior.', 'anulacion'],
    ['No dar curso a la orden anterior ni a esta orden.', 'anulacion'],
    ['Dejar sin efecto la orden anterior, se envía la nueva con el monto corregido.', 'orden'],
    ['Envío orden. Saludos.', 'orden'],
  ])('"%s" es %s', (cuerpo, tipo) => {
    expect(leer({ remitente: ORION, asunto: 'Orden De Trabajo ZAASA-0001AUT1TOYOTA-ETIOS-AB123CD-PERITO-INVENTADO', cuerpo })).toMatchObject({ tipo })
  })

  it('una compañía que no conoce queda vacía, y el siniestro también: lo completa una persona', () => {
    const r = leer({ remitente: ORION, asunto: 'Orden De Trabajo OTRA-COMPANIA-SEGUROS-123456RENAULT-CLIO-AB123CD-PERITO-INVENTADO' })
    expect(r).toMatchObject({ compania: null, siniestro: null, patente: 'AB123CD', vehiculo: 'RENAULT CLIO' })
  })

  it('si el PDF no tiene un total claro, el monto queda vacío', () => {
    expect(leer({ remitente: ORION, asunto: 'Orden De Trabajo ZAASA-1TOYOTA-ETIOS-AB123CD-P-I', textoPdf: 'sin montos' })).toMatchObject({ monto: null })
  })
})

describe('órdenes de La Mercantil', () => {
  it('saca siniestro, patente, perito y su mail', () => {
    expect(leer({
      remitente: MERCANTIL,
      asunto: 'Orden de reparación – Siniestro 900000000001 – Tasación 123456 – Dominio AB123CD',
      cuerpo: 'Se le ha asignado una orden de reparación.\n\nEn caso de ser necesario contactar al perito interviniente,*PEREZ JUAN*, podrás hacerlo así:\n\nEmail: Perito.Inventado@ejemplo.com\n',
    })).toEqual({
      tipo: 'orden', plataforma: 'mercantil', compania: 'Mercantil Andina', siniestro: '900000000001',
      patente: 'AB123CD', vehiculo: null, perito: 'PEREZ JUAN', peritoMail: 'perito.inventado@ejemplo.com',
      monto: null, franquicia: null, repuestos: null, referencia: 'Tasación 123456', lector: 'ordenes v4',
    })
  })

  it('reconoce la anulación', () => {
    const r = leer({ remitente: MERCANTIL, asunto: 'Anulación de Orden de reparación – Siniestro: 900000000001 – Tasación 123456 – Dominio: AB123CD' })
    expect(r).toMatchObject({ tipo: 'anulacion', siniestro: '900000000001', patente: 'AB123CD' })
  })

  it('un recordatorio de actualizar el estado no es una orden', () => {
    expect(leer({ remitente: MERCANTIL, asunto: 'Actualización de estado de reparación – Siniestro 900000000001 – Dominio AB123CD' })).toBeNull()
  })
})

describe('lo que no es una orden', () => {
  it('un mail de otro remitente no se lee como orden', () => {
    expect(leer({ remitente: 'pagos@compania.example', asunto: 'Orden De Trabajo algo' })).toBeNull()
  })
})

describe('el barrido guarda las órdenes en su pestaña', () => {
  it('una orden de Orion queda en la planilla, con el id de Drive de su PDF', () => {
    const filas: unknown[][] = []
    const hoja = { getLastRow: () => 1, getRange: () => ({ setValues: (f: unknown[][]) => { filas.push(...f) } }) }
    const contexto = {
      Gmail: { Users: { Messages: { get: () => ({
        internalDate: '0',
        payload: {
          headers: [{ name: 'From', value: ORION }, { name: 'Subject', value: 'Orden De Trabajo ZAASA-77TOYOTA-ETIOS-AB123CD-PERITO-INVENTADO' }],
          parts: [
            { mimeType: 'text/plain', filename: '', headers: [], body: { data: 'Envío orden, repuesto envía Autopartes Ejemplo en 3 días' } },
            { mimeType: 'application/pdf', filename: 'informeOrdenTrabajo.pdf', headers: [], body: { data: 'pdf' } },
          ],
        },
      }) } } },
      Utilities: { newBlob: (d: string) => ({ getDataAsString: () => d }), base64DecodeWebSafe: (d: string) => d, formatDate: () => '2026-01-02 10:00' },
      Drive: { Files: { create: (m: { mimeType?: string }) => ({ id: m.mimeType === 'application/vnd.google-apps.document' ? 'ocr' : 'drive-orden-1' }), remove: () => undefined } },
      UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => 'Total: $ 200.000,00' }) },
      ScriptApp: { getOAuthToken: () => 'x' },
      PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'carpeta', setProperty: () => undefined }) },
    }
    const { guardarOrden } = runInNewContext(readFileSync(join(import.meta.dirname, 'robot.gs'), 'utf8') + '\n;({ guardarOrden })', contexto) as {
      guardarOrden: (id: string, hojas: Record<string, typeof hoja>) => void
    }
    guardarOrden('msg-orden-1', { ordenes: hoja })
    expect(filas).toEqual([['msg-orden-1', '2026-01-02 10:00', 'orion', 'orden', 'Zurich ex QBE', '77', 'AB123CD', 'TOYOTA ETIOS',
      'PERITO INVENTADO', '', '200000.00', '', 'repuesto envía Autopartes Ejemplo en 3 días', 'drive-orden-1', 'ordenes v4', '', '']])
  })
})

describe('las compañías de Orion van con el nombre exacto de su ficha', () => {
  it.each([
    ['SAN-CRISTÓBAL-SMSG---CASA-CENTRAL-1234FORD-KA-AB123CD-PERITO-INVENTADO', 'San Cristóbal', '1234'],
    ['SEGUROS-BERNARDINO-RIVADAVIA-COOP-LTDA-5678FIAT-ARGO-AB123CD-PERITO-INVENTADO', 'Rivadavia', '5678'],
    ['PROVINCIA-SEGUROS-9012CHEVROLET-PRISMA-AB123CD-PERITO-INVENTADO', 'Provincia', '9012'],
    ['ALLIANZ-ARGENTINA---CÍA-DE-SEGUROS-GRALES-SA-C0042TOYOTA-HILUX-ABC123-PERITO-INVENTADO', 'Allianz', 'C0042'],
  ])('%s', (asunto, compania, siniestro) => {
    expect(leer({ remitente: ORION, asunto: `Orden De Trabajo ${asunto}` })).toMatchObject({ compania, siniestro })
  })
})

describe('el robot sube las órdenes a la base', () => {
  type Fila = string[]
  const fila = (id: string, fecha: string, tipo: string, base = ''): Fila =>
    [id, fecha, 'orion', tipo, 'Sancor', '111', 'AB123CD', 'FORD KA', 'PERITO INVENTADO', '', '1000.50', 'franquicia en taller', '', '', 'ordenes v4', base, '']

  function correr(filas: Fila[], props: Record<string, string>, contesta: (cuerpo: Record<string, unknown>) => string, inicio = Date.now()) {
    const llamadas: { url: string; cuerpo: Record<string, unknown> }[] = []
    const escritas: Record<number, unknown> = {}
    const hoja = {
      getDataRange: () => ({ getValues: () => [['encabezado'], ...filas] }),
      getRange: (f: number, c: number) => ({ setValue: (v: unknown) => { if (c === 16) escritas[f] = v } }),
    }
    const contexto = {
      PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => props[k] ?? null }) },
      UrlFetchApp: { fetch: (url: string, o: { payload: string }) => {
        const cuerpo = JSON.parse(o.payload) as Record<string, unknown>
        llamadas.push({ url, cuerpo })
        if (url.includes('/auth/')) return { getResponseCode: () => 200, getContentText: () => '{"access_token":"t"}' }
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify(contesta(cuerpo)) }
      } },
    }
    const { subirOrdenes } = runInNewContext(readFileSync(join(import.meta.dirname, 'robot.gs'), 'utf8') + '\n;({ subirOrdenes })', contexto) as {
      subirOrdenes: (h: typeof hoja, inicio: number) => string
    }
    return { mensaje: subirOrdenes(hoja, inicio), llamadas, escritas }
  }
  const PROPS = { SUPABASE_URL: 'https://ejemplo.supabase.co', SUPABASE_CLAVE_PUBLICA: 'k', ROBOT_MAIL: 'robot@ejemplo.com', ROBOT_CLAVE: 'c' }

  it('sin las propiedades no sube nada, y lo dice', () => {
    const r = correr([fila('m1', '2026-01-01 10:00', 'orden')], {}, () => 'cargada')
    expect(r.llamadas).toHaveLength(0)
    expect(r.mensaje).toContain('faltan las propiedades')
  })

  it('sube de la más vieja a la más nueva, y la anulación después de su orden', () => {
    const r = correr([
      fila('anula', '2026-01-05 10:00', 'anulacion'),
      fila('orden', '2026-01-02 10:00', 'orden'),
    ], PROPS, (c) => (c.p_tipo === 'orden' ? 'cargada' : 'anulada'))
    const rpc = r.llamadas.filter((l) => l.url.endsWith('/rpc/fn_robot_guarda_orden'))
    expect(rpc.map((l) => l.cuerpo.p_gmail_message_id)).toEqual(['orden', 'anula'])
    expect(rpc[0]?.cuerpo).toMatchObject({ p_compania: 'Sancor', p_siniestro: '111', p_fecha: '2026-01-02', p_monto: '1000.50',
      p_vehiculo: 'FORD KA', p_referencia: null, p_observaciones: 'franquicia en taller' })
    expect(r.escritas).toEqual({ 2: 'anulada', 3: 'cargada' })
  })

  it('si se acaba el tiempo de la corrida, corta y deja el resto para la próxima', () => {
    const r = correr([fila('m1', '2026-01-01 10:00', 'orden')], PROPS, () => 'cargada', 0)
    expect(r.llamadas.filter((l) => l.url.includes('/rpc/'))).toHaveLength(0)
    expect(r.mensaje).toContain('siguen en la próxima corrida')
  })

  it('no vuelve a mandar lo terminado, y reintenta lo que quedó sin compañía', () => {
    const r = correr([
      fila('ya', '2026-01-01 10:00', 'orden', 'cargada'),
      fila('otro', '2026-01-01 11:00', 'otro'),
      fila('reintento', '2026-01-02 10:00', 'orden', 'sin_compania'),
    ], PROPS, () => 'cargada')
    const rpc = r.llamadas.filter((l) => l.url.includes('/rpc/'))
    expect(rpc.map((l) => l.cuerpo.p_gmail_message_id)).toEqual(['reintento'])
  })
})

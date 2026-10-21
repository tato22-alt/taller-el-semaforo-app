/* El lector de órdenes de trabajo del robot. Spec 010 de semaforo-base.
 *
 * Todos los mails de acá son INVENTADOS, con la forma de los reales (H3: el repo es público).
 * Siniestros, patentes, peritos, asegurados y montos no son de nadie. Los únicos dominios reales son
 * los de las compañías (empresas, no personas); los estudios son dominios .example. */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const DIR = join(import.meta.dirname, 'lectores')
type Mail = { remitente: string; asunto: string; cuerpo: string; textoPdf: string; adjuntos: string[]; copia: string }
type Dominios = unknown
const fuentes = readdirSync(DIR).filter((n) => n.endsWith('.js')).sort()
const L = runInNewContext(
  fuentes.map((n) => readFileSync(join(DIR, n), 'utf8')).join('\n') + '\n;({ leerOrden, dominiosDeOrdenes })',
  {},
) as {
  leerOrden: (m: Mail, dominios?: Dominios) => unknown
  dominiosDeOrdenes: (filas: readonly (readonly unknown[])[]) => Dominios
}

/** Lee un mail inventado. Sin `dominios`, con la lista inicial (la que llena la pestaña la primera vez). */
const leer = (m: Partial<Mail>, dominios?: readonly (readonly string[])[]) =>
  JSON.parse(JSON.stringify(L.leerOrden(
    { remitente: '', asunto: '', cuerpo: '', textoPdf: '', adjuntos: [], copia: '', ...m },
    dominios ? L.dominiosDeOrdenes(dominios) : undefined,
  ))) as Record<string, unknown> | null

const ORION = 'Sistemas <sistemas@mg.sistema-orion.com>'
const MERCANTIL = 'no-responder@mail.lamercantil.flowable-managed.com'
const MERCANTIL_VIEJA = 'La Mercantil Andina <no-responder@lamercantil.com.ar>'
const VALUA = 'Avisos Valua <avisos@sistemavalua.info>'
const COOPERACION = 'Inspector Inventado <inspector.inventado@cooperacionseguros.com.ar>'

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
      repuestos: 'Los repuestos los entrega Autopartes Ejemplo en 5 días', referencia: null, nota: null, aConfirmar: false, lector: 'ordenes v7',
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

  it.each([
    ['Sistema Orion <sistema.orion@cesvi.com.ar>', '[EXTERNO] Orden De Trabajo PROVINCIA-SEGUROS-4321FIAT-CRONOS-AB123CD-PERITO-INVENTADO'],
    ['sistema.orion@cesvi.com.ar', '[EXTERNO]Orden De Trabajo PROVINCIA-SEGUROS-4321FIAT-CRONOS-AB123CD-PERITO-INVENTADO'],
    ['Sistemas <sistemas@mg.cesvi.com.ar>', 'Orden De Trabajo PROVINCIA-SEGUROS-4321FIAT-CRONOS-AB123CD-PERITO-INVENTADO'],
  ])('las casillas viejas de Orion entran solas: %s', (remitente, asunto) => {
    expect(leer({ remitente, asunto })).toMatchObject({
      tipo: 'orden', plataforma: 'orion', compania: 'Provincia', siniestro: '4321', patente: 'AB123CD', vehiculo: 'FIAT CRONOS', aConfirmar: false,
    })
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
      monto: null, franquicia: null, repuestos: null, referencia: 'Tasación 123456', nota: null, aConfirmar: false, lector: 'ordenes v7',
    })
  })

  it('reconoce la anulación', () => {
    const r = leer({ remitente: MERCANTIL, asunto: 'Anulación de Orden de reparación – Siniestro: 900000000001 – Tasación 123456 – Dominio: AB123CD' })
    expect(r).toMatchObject({ tipo: 'anulacion', siniestro: '900000000001', patente: 'AB123CD' })
  })

  it('el formato viejo: el número largo es el siniestro, y el asegurado no se guarda en ningún campo', () => {
    const r = leer({ remitente: MERCANTIL_VIEJA, asunto: 'Orden de reparación – ASEGURADO INVENTADO PEREZ – 900000000002 – AC456BD' })
    expect(r).toEqual({
      tipo: 'orden', plataforma: 'mercantil', compania: 'Mercantil Andina', siniestro: '900000000002',
      patente: 'AC456BD', vehiculo: null, perito: null, peritoMail: null,
      monto: null, franquicia: null, repuestos: null, referencia: null, nota: null, aConfirmar: false, lector: 'ordenes v7',
    })
    expect(JSON.stringify(r)).not.toContain('ASEGURADO')
  })

  // La forma real de las anulaciones viejas: "Siniestro/Carpeta: N/1" (el siniestro es lo de antes de
  // la barra) y "Patente:" en lugar de "Dominio". Datos inventados.
  it.each([
    'Anulación de Orden de reparación – ASEGURADO INVENTADO – Siniestro/Carpeta: 900000000003/1 – Patente: ABC123',
    'Anulacion Orden de reparacion – ASEGURADO INVENTADO – Siniestro/Carpeta: 900000000003/1 – Patente: AB 123 CD',
  ])('la anulación en el formato viejo: "%s"', (asunto) => {
    const r = leer({ remitente: MERCANTIL_VIEJA, asunto })
    expect(r).toMatchObject({ tipo: 'anulacion', siniestro: '900000000003', compania: 'Mercantil Andina' })
    expect(['ABC123', 'AB123CD']).toContain(r?.patente)
    expect(JSON.stringify(r)).not.toContain('ASEGURADO')
  })

  it.each([
    [MERCANTIL, 'Actualización de estado de reparación – Siniestro 900000000001 – Dominio AB123CD'],
    [MERCANTIL, 'Aviso de Conformidad – Orden de reparación – Siniestro 900000000001 – Dominio AB123CD'],
    [MERCANTIL, 'Orden de compra – Siniestro 900000000001 – Dominio AB123CD'],
    [MERCANTIL_VIEJA, 'Actualización de estado – ASEGURADO INVENTADO – 900000000002 – AC456BD'],
    [MERCANTIL_VIEJA, 'Aviso de Conformidad – ASEGURADO INVENTADO – 900000000002 – AC456BD'],
    [MERCANTIL_VIEJA, 'Orden de Compra N° 5555 – 900000000002 – AC456BD'],
  ])('no es una orden: %s "%s"', (remitente, asunto) => {
    // Aunque traiga un PDF con nombre de orden: la casilla automática decide sola.
    expect(leer({ remitente, asunto, adjuntos: ['orden_reparacion.pdf'] })).toBeNull()
  })
})

describe('órdenes de Nación (sistema Valua)', () => {
  it('saca el siniestro del asunto, y del PDF la patente y el monto si están claros', () => {
    expect(leer({
      remitente: VALUA,
      asunto: 'ORDEN DE TRABAJO - NACION SEGUROS *STRO Nro 4500123',
      cuerpo: 'Se adjunta la orden de trabajo. El asegurado abona franquicia.',
      textoPdf: 'ORDEN DE TRABAJO\nDominio: AB 123 CD\nMano de obra 80.000,00\nRepuestos 20.000,00\nTotal: $ 100.000,00',
      adjuntos: ['orden.pdf'],
    })).toEqual({
      tipo: 'orden', plataforma: 'nacion', compania: 'Nación', siniestro: '4500123', patente: 'AB123CD',
      vehiculo: null, perito: null, peritoMail: null, monto: '100000.00',
      franquicia: 'El asegurado abona franquicia', repuestos: null, referencia: null, nota: null, aConfirmar: false, lector: 'ordenes v7',
    })
  })

  it('sin total claro en el PDF, el monto queda vacío', () => {
    expect(leer({ remitente: VALUA, asunto: 'ORDEN DE TRABAJO - NACION SEGUROS *STRO Nro 4500124', textoPdf: 'sin importes' }))
      .toMatchObject({ siniestro: '4500124', monto: null, patente: null })
  })

  it('lo que no es una orden no se lee como orden', () => {
    expect(leer({ remitente: VALUA, asunto: 'Recordatorio: actualizá el estado de la reparación' })).toBeNull()
  })

  it('si el asunto no dice Nación, la compañía queda vacía: no se adivina', () => {
    expect(leer({ remitente: VALUA, asunto: 'ORDEN DE TRABAJO - OTRA COMPANIA *STRO Nro 77' })).toMatchObject({ compania: null, siniestro: '77' })
  })
})

describe('órdenes de Cooperación', () => {
  it('cualquier casilla de Cooperación, con "ORDEN DE TRABAJO" y "STRO n/n" en el asunto, entra sola', () => {
    expect(leer({
      remitente: COOPERACION,
      asunto: 'ORDEN DE TRABAJO - STRO 123456/1 - AB123CD',
      cuerpo: 'Adjunto orden. Los repuestos los provee la compañía.',
      textoPdf: 'Total: $ 90.000,00',
    })).toEqual({
      tipo: 'orden', plataforma: 'cooperacion', compania: 'Cooperación', siniestro: '123456/1', patente: 'AB123CD',
      vehiculo: null, perito: null, peritoMail: null, monto: null,
      franquicia: null, repuestos: 'Los repuestos los provee la compañía', referencia: null, nota: null, aConfirmar: false, lector: 'ordenes v7',
    })
  })

  it('el asunto con "Nro"', () => {
    expect(leer({ remitente: 'otra.persona@sucursal.cooperacionseguros.com.ar', asunto: 'Orden de Trabajo STRO Nro 99/2' }))
      .toMatchObject({ plataforma: 'cooperacion', siniestro: '99/2' })
  })

  it.each([
    'ORDEN - Siniestro 123456/1 - Repuestos',
    'RE: ORDEN - Siniestro 123456/1',
  ])('no es una orden de trabajo: "%s"', (asunto) => {
    expect(leer({ remitente: COOPERACION, asunto, adjuntos: ['orden de trabajo.pdf'] })).toBeNull()
  })

  it('una respuesta del hilo no entra sola: si trae la orden, queda para confirmar', () => {
    expect(leer({ remitente: COOPERACION, asunto: 'RE: ORDEN DE TRABAJO - STRO 123456/1' })).toBeNull()
    expect(leer({ remitente: COOPERACION, asunto: 'RE: ORDEN DE TRABAJO - STRO 123456/1', adjuntos: ['ORDEN DE TRABAJO.pdf'] }))
      .toMatchObject({ plataforma: 'otra', aConfirmar: true, compania: 'Cooperación', siniestro: '123456/1' })
  })
})

describe('órdenes de personas: para confirmar (RF-1014)', () => {
  it('de una aseguradora, con un PDF con nombre de orden: entra para confirmar', () => {
    expect(leer({
      remitente: 'Analista Inventada <analista.inventada@lps.com.ar>',
      asunto: 'Envío orden siniestro N° 555001 - AB123CD',
      cuerpo: 'Buen día, adjunto la orden. El asegurado abona franquicia en el taller.',
      adjuntos: ['firma.png', 'ord rep 555001.pdf'],
    })).toEqual({
      tipo: 'orden', plataforma: 'otra', compania: 'LPS', siniestro: '555001', patente: 'AB123CD',
      vehiculo: null, perito: null, peritoMail: null, monto: null,
      franquicia: 'El asegurado abona franquicia en el taller', repuestos: null, referencia: null, nota: null, aConfirmar: true, lector: 'ordenes v7',
    })
  })

  it.each([
    ['orden_trabajo.pdf'], ['Orden de reparación.pdf'], ['OrdenDeTrabajo final.PDF'], ['informe orden trabajo.pdf'],
    ['OT_445566.pdf'], ['ORD-MANO DE OBRA.pdf'],
  ])('reconoce el adjunto "%s"', (adjunto) => {
    expect(leer({ remitente: 'perito@mapfre.com.ar', asunto: 'Siniestro 112233', adjuntos: [adjunto] })).toMatchObject({ aConfirmar: true, compania: 'Mapfre' })
  })

  it.each([
    ['sin PDF con nombre de orden', { adjuntos: ['poliza.pdf', 'fotos.pdf'] }],
    ['el nombre de orden en algo que no es un PDF', { adjuntos: ['orden de trabajo.docx'] }],
    ['una orden de pago', { asunto: 'Orden de pago 3344 - Siniestro 112233', adjuntos: ['OrdenDePago 3344.pdf'] }],
    ['una orden de compra', { asunto: 'Órdenes de compra de repuestos - Siniestro 112233', adjuntos: ['orden de compra 112233.pdf'] }],
    ['un certificado de retención', { asunto: 'Siniestro 112233', adjuntos: ['certificado orden 112233.pdf'] }],
    ['un dominio que no está en la lista', { remitente: 'alguien@desconocido.example', adjuntos: ['orden_rep.pdf'] }],
  ])('no es una orden: %s', (_, m) => {
    expect(leer({ remitente: 'perito@mapfre.com.ar', asunto: 'Siniestro 112233', ...m })).toBeNull()
  })

  it('alcanza con que alguien en copia sea de una aseguradora, aunque el nombre tenga una coma', () => {
    expect(leer({
      remitente: 'Perito Inventado <perito@estudio-inventado.example>',
      copia: '"Inventada, Analista" <analista.inventada@siniestros.mapfre.com.ar>, otro@desconocido.example',
      asunto: 'Orden',
      adjuntos: ['ORDEN DE TRABAJO.pdf'],
    })).toMatchObject({ aConfirmar: true, compania: 'Mapfre' })
  })

  it('un estudio de la pestaña sin compañía: entra, con la compañía vacía para elegir al confirmar', () => {
    const dominios = [['estudio-inventado.example', ''], ['victoria.com.ar', 'Victoria']]
    expect(leer({ remitente: 'perito@estudio-inventado.example', asunto: 'Orden de reparación', adjuntos: ['orden_rep.pdf'] }, dominios))
      .toMatchObject({ aConfirmar: true, compania: null })
    // Si alguien en copia es de una compañía, ésa.
    expect(leer({ remitente: 'perito@estudio-inventado.example', copia: 'x@victoria.com.ar', asunto: 'Orden', adjuntos: ['orden_rep.pdf'] }, dominios))
      .toMatchObject({ compania: 'Victoria' })
    // Y la lista que manda es la de la pestaña: un dominio que no está ahí no cuenta.
    expect(leer({ remitente: 'perito@lps.com.ar', asunto: 'Orden', adjuntos: ['orden_rep.pdf'] }, dominios)).toBeNull()
  })

  it('el siniestro sale del asunto; si no, del número largo del nombre del PDF; si no, queda vacío', () => {
    const de = (asunto: string, adjunto: string) => leer({ remitente: 'x@lps.com.ar', asunto, adjuntos: [adjunto] })?.siniestro
    expect(de('Stro. N° 123/45 - orden', 'orden_rep.pdf')).toBe('123/45')
    expect(de('SINIESTRO NRO: 777-1', 'orden_rep.pdf')).toBe('777-1')
    expect(de('Orden de reparación', 'OT_7770001.pdf')).toBe('7770001')
    expect(de('Orden de reparación', 'orden_rep 12345.pdf')).toBeNull()
  })

  it('sin siniestro, la orden vuelve igual: la base contesta sin_siniestro y queda en la planilla', () => {
    expect(leer({ remitente: 'x@lps.com.ar', asunto: 'Te mando la orden', adjuntos: ['orden_rep.pdf'] })).toMatchObject({ siniestro: null, aConfirmar: true })
  })
})

describe('la pestaña dominios_ordenes', () => {
  it('acepta un mail entero o con @, ignora los correos de todos, y la compañía vacía es null', () => {
    const d = L.dominiosDeOrdenes([
      ['@Estudio-Inventado.Example', ''], ['perito@otro-estudio.example', 'Mapfre'], ['gmail.com', 'LPS'], ['', 'Sancor'], ['sin punto', 'x'],
    ])
    expect(JSON.stringify([...(d as Map<string, string | null>)])).toBe(JSON.stringify([['estudio-inventado.example', null], ['otro-estudio.example', 'Mapfre']]))
  })

  it('la lista inicial tiene sólo aseguradoras, con el nombre exacto de su ficha', () => {
    const { DOMINIOS_ORDENES_INICIALES } = runInNewContext(
      fuentes.map((n) => readFileSync(join(DIR, n), 'utf8')).join('\n') + '\n;({ DOMINIOS_ORDENES_INICIALES })', {},
    ) as { DOMINIOS_ORDENES_INICIALES: [string, string][] }
    const fichas = ['LPS', 'Mapfre', 'Provincia', 'Victoria', 'Cooperación', 'Nación', 'Sancor', 'San Cristóbal', 'Río Uruguay',
      'La Segunda', 'Allianz', 'Federación Patronal', 'Mercantil Andina', 'Triunfo', 'Rivadavia', 'Zurich', 'Zurich ex QBE',
      'La Caja', 'Experta', 'Galicia', 'San Jorge (concesionaria)']
    for (const [dominio, compania] of DOMINIOS_ORDENES_INICIALES) {
      expect(fichas, dominio).toContain(compania)
    }
    expect(DOMINIOS_ORDENES_INICIALES).toHaveLength(20)
  })

  it('están todas las compañías a las que se les facturó desde el 1/1/2025 (cruce del 2026-10-21)', () => {
    const { DOMINIOS_ORDENES_INICIALES } = runInNewContext(
      fuentes.map((n) => readFileSync(join(DIR, n), 'utf8')).join('\n') + '\n;({ DOMINIOS_ORDENES_INICIALES })', {},
    ) as { DOMINIOS_ORDENES_INICIALES: [string, string][] }
    const companias = new Set(DOMINIOS_ORDENES_INICIALES.map(([, c]) => c))
    for (const c of ['Sancor', 'Rivadavia', 'Federación Patronal', 'Mercantil Andina', 'San Cristóbal', 'La Segunda', 'Provincia',
      'La Caja', 'Cooperación', 'Allianz', 'LPS', 'Zurich', 'Río Uruguay', 'Experta', 'Galicia', 'Nación', 'San Jorge (concesionaria)']) {
      expect(companias, c).toContain(c)
    }
  })
})

describe('lo que no es una orden', () => {
  it('un mail de otro remitente no se lee como orden', () => {
    expect(leer({ remitente: 'pagos@compania.example', asunto: 'Orden De Trabajo algo' })).toBeNull()
  })
})

describe('lo que encontró la revisión del 2026-10-20 (nada se pierde)', () => {
  const LPS = 'Analista Inventada <analista@lps.com.ar>'

  it('en el mail de una persona, un asunto "Orden - Siniestro" no esconde la orden: sólo en Cooperación es una compra', () => {
    expect(leer({ remitente: LPS, asunto: 'Orden - Siniestro 900000000001', adjuntos: ['ord rep.pdf'] }))
      .toMatchObject({ aConfirmar: true, compania: 'LPS', siniestro: '900000000001' })
    expect(leer({ remitente: 'inspector@cooperacionseguros.com.ar', asunto: 'ORDEN - Siniestro 1234/5', adjuntos: ['ord rep.pdf'] })).toBeNull()
  })

  it.each([
    ['el rotulado del asunto', { asunto: 'Siniestro N° 900000000011 - AB123CD' }, '900000000011'],
    ['el número que abre el asunto (como escribe Provincia)', { remitente: 'x@pseguros.com.ar', asunto: 'RE: 9000012 PEREZ INVENTADO' }, '9000012'],
    ['el tramo largo del asunto viejo de La Mercantil, reenviado por un perito', {
      remitente: 'perito@hotmail.example', copia: 'analista@lamercantil.com.ar',
      asunto: 'RV: Orden de reparación – PEREZ INVENTADO – 900000000013 – AB123CD' }, '900000000013'],
    ['el rotulado dentro del PDF', { asunto: 'Envío orden', textoPdf: 'Orden de reparación\nSiniestro N°: 900000000014' }, '900000000014'],
  ])('el siniestro de una orden de persona sale de %s', (_, m, siniestro) => {
    expect(leer({ remitente: LPS, adjuntos: ['ord rep.pdf'], ...m })).toMatchObject({ aConfirmar: true, siniestro })
  })

  it('del nombre del PDF no se toma un pedazo de un código, ni la tasación de La Mercantil', () => {
    expect(leer({ remitente: 'x@mapfre.com.ar', asunto: 'Orden', adjuntos: ['3f2a9c11-4b7e-4d2a-9e1f-123456789abc-77-informeOrdenTrabajo.pdf'] }))
      .toMatchObject({ aConfirmar: true, siniestro: null })
    expect(leer({ remitente: 'perito@hotmail.example', copia: 'a@lamercantil.com.ar', asunto: 'Orden', adjuntos: ['Orden_Reparacion_555001.pdf'] }))
      .toMatchObject({ aConfirmar: true, siniestro: null, referencia: 'Tasación 555001' })
    expect(leer({ remitente: LPS, asunto: 'Orden', adjuntos: ['ord rep 900000000015.pdf'] })).toMatchObject({ siniestro: '900000000015' })
  })

  it('sin siniestro en ningún lado, entra igual para confirmar: la persona completa el número', () => {
    expect(leer({ remitente: LPS, asunto: 'Envío orden de reparación', adjuntos: ['ord rep.pdf'] }))
      .toMatchObject({ tipo: 'orden', aConfirmar: true, compania: 'LPS', siniestro: null })
  })

  it.each([
    ['04-07000 ORDEN.pdf'], ['Orden actualizada.pdf'], ['OT 900000000016.pdf'], ['OT-900000000016.pdf'],
    ['O.T. 900000000016.pdf'], ['Ord. Rep. 900000000016.pdf'], ['Orden 900000000016.pdf'],
  ])('reconoce el PDF "%s" como una orden', (adjunto) => {
    expect(leer({ remitente: 'perito@gmail.com', copia: 'analista@victoria.com.ar', asunto: 'STRO 7000/04 - AB123CD', adjuntos: [adjunto] }))
      .toMatchObject({ aConfirmar: true, compania: 'Victoria' })
  })

  it('un mail con varias órdenes lo avisa en la nota, para quien confirma', () => {
    const r = leer({ remitente: LPS, asunto: 'Órdenes de reparación', adjuntos: ['ord rep 900000000017.pdf', 'ord rep 900000000018.pdf'] })
    expect(r).toMatchObject({ siniestro: '900000000017' })
    expect(r?.nota).toContain('2 órdenes')
    expect(r?.nota).toContain('ord rep 900000000018.pdf')
  })

  it('la pestaña acepta lo que se copia de Gmail: "Nombre <mail@dominio>"', () => {
    const r = leer({ remitente: 'perito@estudio-inventado.example', asunto: 'Siniestro 900000000019', adjuntos: ['ord rep.pdf'] },
      [['Estudio Inventado <perito@estudio-inventado.example>', 'Sancor']])
    expect(r).toMatchObject({ aConfirmar: true, compania: 'Sancor' })
  })

  it('un nombre visible con forma de mail no hace pasar a nadie por una aseguradora', () => {
    expect(leer({ remitente: '"analista@lps.com.ar" <alguien@gmail.com>', asunto: 'Siniestro 900000000020', adjuntos: ['ord rep.pdf'] })).toBeNull()
    expect(leer({ remitente: 'alguien@gmail.com', copia: '"perito@mapfre.com.ar" <otro@hotmail.example>', asunto: 'Siniestro 900000000020', adjuntos: ['ord rep.pdf'] })).toBeNull()
  })

  it.each([
    ['ORDEN DE TRABAJO SINIESTRO 14000/98', '14000/98'],
    ['ORDEN DE TRABAJO - 334/101 PEREZ INVENTADO', '334/101'],
  ])('Cooperación sin "STRO": "%s" entra sola', (asunto, siniestro) => {
    expect(leer({ remitente: 'inspector@cooperacionseguros.com.ar', asunto, adjuntos: ['OrdenRepuesto-1-2.pdf'] }))
      .toMatchObject({ plataforma: 'cooperacion', compania: 'Cooperación', siniestro, aConfirmar: false })
  })

  it('Valua con otra compañía: Paraná se reconoce; otra cualquiera entra para confirmar', () => {
    expect(leer({ remitente: 'avisos@sistemavalua.info', asunto: 'ORDEN DE TRABAJO - PARANA SEGUROS *STRO Nro 900000000021' }))
      .toMatchObject({ compania: 'Paraná', aConfirmar: false })
    expect(leer({ remitente: 'avisos@sistemavalua.info', asunto: 'ORDEN DE TRABAJO - OTRA COMPAÑIA INVENTADA *STRO Nro 900000000022' }))
      .toMatchObject({ compania: null, siniestro: '900000000022', aConfirmar: true })
  })
})

/* ------------------------------------------------------------------------------------------- */
/* El barrido (robot.gs, con los servicios de Google de mentira)                                 */
/* ------------------------------------------------------------------------------------------- */

const ROBOT = readFileSync(join(import.meta.dirname, 'robot.gs'), 'utf8')

type Mensaje = { from: string; asunto: string; cc?: string; cuerpo?: string; adjuntos?: string[] }

/** Un mensaje de Gmail como lo devuelve la API, con adjuntos que hay que pedir aparte. */
const mensaje = (m: Mensaje) => ({
  internalDate: '0',
  payload: {
    headers: [{ name: 'From', value: m.from }, { name: 'Subject', value: m.asunto }, ...(m.cc ? [{ name: 'Cc', value: m.cc }] : [])],
    parts: [
      { mimeType: 'text/plain', filename: '', headers: [], body: { data: m.cuerpo ?? 'Mail inventado' } },
      ...(m.adjuntos ?? []).map((n) => ({ mimeType: 'application/octet-stream', filename: n, headers: [], body: { attachmentId: `adjunto-${n}` } })),
    ],
  },
})

/** Corre guardarOrden sobre un mensaje, y cuenta qué bajó de Gmail y qué subió a Drive. */
function guardar(m: Mensaje, textoPdf = '') {
  const filas: unknown[][] = []
  const bajados: string[] = []
  const subidos: string[] = []
  const hoja = { getLastRow: () => 1, getRange: () => ({ setValues: (f: unknown[][]) => { filas.push(...f) } }) }
  const contexto = {
    Gmail: { Users: { Messages: {
      get: () => mensaje(m),
      Attachments: { get: (_: string, __: string, id: string) => { bajados.push(id); return { data: 'pdf' } } },
    } } },
    Utilities: { newBlob: (d: string) => ({ getDataAsString: () => d }), base64DecodeWebSafe: (d: string) => d, formatDate: () => '2026-01-02 10:00' },
    Drive: { Files: {
      create: (meta: { name: string; mimeType?: string }) => {
        if (meta.mimeType === 'application/vnd.google-apps.document') return { id: 'ocr' }
        subidos.push(meta.name)
        return { id: `drive-${subidos.length}` }
      },
      remove: () => undefined,
    } },
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => textoPdf }) },
    ScriptApp: { getOAuthToken: () => 'x' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'carpeta', setProperty: () => undefined }) },
  }
  const { guardarOrden } = runInNewContext(`${ROBOT}\n;({ guardarOrden })`, contexto) as {
    guardarOrden: (id: string, hojas: Record<string, typeof hoja>) => void
  }
  guardarOrden('msg-1', { ordenes: hoja })
  return { filas, bajados, subidos }
}

describe('el barrido guarda las órdenes en su pestaña', () => {
  it('una orden de Orion queda en la planilla, con el id de Drive de su PDF', () => {
    const r = guardar({
      from: ORION,
      asunto: 'Orden De Trabajo ZAASA-77TOYOTA-ETIOS-AB123CD-PERITO-INVENTADO',
      cuerpo: 'Envío orden, repuesto envía Autopartes Ejemplo en 3 días',
      adjuntos: ['informeOrdenTrabajo.pdf'],
    }, 'Total: $ 200.000,00')
    expect(r.filas).toEqual([['msg-1', '2026-01-02 10:00', 'orion', 'orden', 'Zurich ex QBE', '77', 'AB123CD', 'TOYOTA ETIOS',
      'PERITO INVENTADO', '', '200000.00', '', 'repuesto envía Autopartes Ejemplo en 3 días', 'drive-1', 'ordenes v7', '', '', '',
      ORION, 'Orden De Trabajo ZAASA-77TOYOTA-ETIOS-AB123CD-PERITO-INVENTADO', 'informeOrdenTrabajo.pdf', '']])
  })

  it('lo que no es una orden se anota como "otro" sin bajar ni subir sus PDF', () => {
    const r = guardar({ from: 'Pagos <pagos@lps.com.ar>', asunto: 'Orden de Pago Número: 00001', adjuntos: ['OrdenDePago.pdf', 'retenciones.pdf'] })
    expect(r.bajados).toEqual([])
    expect(r.subidos).toEqual([])
    // Nada se pierde: aunque no sea una orden, queda de quién es, el asunto, los adjuntos y la versión
    // del lector, para encontrarla y releerla si el lector se equivocó.
    expect(r.filas).toEqual([['msg-1', '2026-01-02 10:00', '', 'otro', '', '', '', '', '', '', '', '', '', '', 'ordenes v7', '', '', '',
      'Pagos <pagos@lps.com.ar>', 'Orden de Pago Número: 00001', 'OrdenDePago.pdf\nretenciones.pdf', '']])
  })

  it('una póliza de una compañía, con un PDF que no se llama como una orden, tampoco baja nada', () => {
    const r = guardar({ from: 'emision@mapfre.com.ar', asunto: 'Su póliza', adjuntos: ['poliza.pdf'] })
    expect(r.bajados).toEqual([])
    expect(r.subidos).toEqual([])
    expect(r.filas[0]?.[3]).toBe('otro')
  })

  it('una orden de una persona: sube su PDF y queda marcada para confirmar', () => {
    const r = guardar({
      from: 'Analista Inventada <analista@lps.com.ar>',
      cc: 'otra@lps.com.ar',
      asunto: 'Orden de reparación - Siniestro 555002 - AB123CD',
      adjuntos: ['ord rep 555002.pdf'],
    }, 'Total: $ 1.000,00')
    expect(r.bajados).toEqual(['adjunto-ord rep 555002.pdf'])
    expect(r.subidos).toEqual(['2026-01-02 ord rep 555002.pdf'])
    expect(r.filas).toEqual([['msg-1', '2026-01-02 10:00', 'otra', 'orden', 'LPS', '555002', 'AB123CD', '', '', '', '', '', '', 'drive-1',
      'ordenes v7', '', '', 'sí', 'Analista Inventada <analista@lps.com.ar>', 'Orden de reparación - Siniestro 555002 - AB123CD',
      'ord rep 555002.pdf', '']])
  })
})

describe('el barrido busca las órdenes de las casillas nuevas y las de personas', () => {
  /** Una planilla de mentira: cada pestaña es una lista de filas. */
  function libro(pestanias: Record<string, unknown[][]>) {
    const hoja = (nombre: string) => {
      const filas = pestanias[nombre] ?? []
      pestanias[nombre] = filas
      return {
        appendRow: (f: unknown[]) => { filas.push(f) },
        setFrozenRows: () => undefined,
        getLastRow: () => filas.length,
        getDataRange: () => ({ getValues: () => filas }),
        getRange: (fila: number | string, columna = 1) => ({
          setNumberFormat: () => undefined,
          getValue: () => (typeof fila === 'number' ? (filas[fila - 1]?.[columna - 1] ?? '') : ''),
          setValues: (v: unknown[][]) => { v.forEach((f, i) => { filas[(fila as number) - 1 + i] = f }) },
        }),
      }
    }
    return {
      getSheetByName: (n: string) => (n in pestanias ? hoja(n) : null),
      insertSheet: (n: string) => hoja(n),
    }
  }

  /** Corre barrer sobre una planilla de mentira. `props` son las propiedades del script, y quedan escritas. */
  function barrer(pestanias: Record<string, unknown[][]>, props: Record<string, string> = {}) {
    const consultas: string[] = []
    const contexto = {
      SpreadsheetApp: { getActive: () => libro(pestanias) },
      Gmail: { Users: { Messages: { list: (_: string, o: { q: string }) => { consultas.push(o.q); return { messages: [] } } } } },
      PropertiesService: { getScriptProperties: () => ({
        getProperty: (k: string) => props[k] ?? null,
        setProperty: (k: string, v: string) => { props[k] = v },
      }) },
      console: { log: () => undefined },
    }
    const { barrer: correr } = runInNewContext(`${ROBOT}\n;({ barrer })`, contexto) as { barrer: () => void }
    correr()
    return consultas
  }

  it('la primera vez llena la pestaña de dominios con las aseguradoras, y busca por remitente o copia', () => {
    const pestanias: Record<string, unknown[][]> = {}
    const consultas = barrer(pestanias)
    expect(pestanias.dominios_ordenes?.[0]).toEqual(['dominio', 'compañía'])
    expect(pestanias.dominios_ordenes).toContainEqual(['lps.com.ar', 'LPS'])
    expect(pestanias.ordenes?.[0]?.slice(-5)).toEqual(['a_confirmar', 'remitente', 'asunto', 'adjuntos', 'nota'])

    const deOrdenes = consultas.find((q) => q.includes('subject:(orden)')) ?? ''
    for (const r of ['sistema.orion@cesvi.com.ar', 'sistemas@mg.cesvi.com.ar', 'no-responder@lamercantil.com.ar', 'avisos@sistemavalua.info',
      'zurich@grant.com.ar', 'cooperacionseguros.com.ar']) {
      expect(deOrdenes).toContain(r)
    }
    const dePersonas = consultas.find((q) => q.includes('has:attachment')) ?? ''
    expect(dePersonas).toMatch(/^\(from:\(lps\.com\.ar OR .*\) OR cc:\(lps\.com\.ar OR .*\)\) has:attachment filename:pdf -from:me after:/)
  })

  it('de ahí en más manda la pestaña: lo que agregó Luciano se busca, y lo que borró no vuelve', () => {
    const props: Record<string, string> = {}
    const pestanias: Record<string, unknown[][]> = {}
    barrer(pestanias, props)
    // Luciano borra todas las compañías y deja sólo un estudio.
    pestanias.dominios_ordenes = [['dominio', 'compañía'], ['estudio-inventado.example', '']]
    const consultas = barrer(pestanias, props)
    expect(pestanias.dominios_ordenes).toEqual([['dominio', 'compañía'], ['estudio-inventado.example', '']])
    expect(consultas.find((q) => q.includes('has:attachment'))).toContain('from:(estudio-inventado.example) OR cc:(estudio-inventado.example)')
  })

  it('una pestaña que llenó una versión anterior recibe sola las compañías nuevas, una vez, sin repetir las que ya tiene', () => {
    const viejas = [['lps.com.ar', 'LPS'], ['@sancorseguros.com', 'Sancor'], ['estudio-inventado.example', '']]
    const pestanias: Record<string, unknown[][]> = { dominios_ordenes: [['dominio', 'compañía'], ...viejas] }
    const props: Record<string, string> = {}
    barrer(pestanias, props)
    const filas = pestanias.dominios_ordenes ?? []
    expect(filas.slice(1, 4)).toEqual(viejas)
    expect(filas).toContainEqual(['lacaja.com.ar', 'La Caja'])
    expect(filas).toContainEqual(['zurich.com', 'Zurich'])
    expect(filas.filter((f) => f[0] === 'lps.com.ar')).toHaveLength(1)
    expect(filas.some((f) => f[0] === 'sancorseguros.com')).toBe(false)
    expect(filas).toHaveLength(1 + 3 + 18)
    barrer(pestanias, props)
    expect(pestanias.dominios_ordenes).toHaveLength(1 + 3 + 18)
  })
  it('releerOrdenesOtro vuelve a leer un "otro" con el lector de hoy y reemplaza la fila, sin agregar otra', () => {
    const pestanias: Record<string, unknown[][]> = {
      ordenes: [['message_id'], ['msg-viejo', '2026-01-02 10:00', '', 'otro', '', '', '', '', '', '', '', '', '', '', 'ordenes v1']],
      dominios_ordenes: [['dominio', 'compañía'], ['lps.com.ar', 'LPS']],
      remitentes: [['remitente', 'compañía'], ['pagos@ejemplo.example', 'X']],
    }
    const contexto = {
      SpreadsheetApp: { getActive: () => libro(pestanias) },
      Gmail: { Users: { Messages: {
        get: () => mensaje({ from: 'Analista Inventada <analista@lps.com.ar>', asunto: 'Siniestro 900000000023', adjuntos: ['ord rep.pdf'] }),
        Attachments: { get: () => ({ data: 'pdf' }) },
      } } },
      Utilities: { newBlob: (d: string) => ({ getDataAsString: () => d }), base64DecodeWebSafe: (d: string) => d, formatDate: () => '2026-01-02 10:00', sleep: () => undefined },
      Drive: { Files: { create: () => ({ id: 'drive-1' }), remove: () => undefined } },
      UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '' }) },
      ScriptApp: { getOAuthToken: () => 'x' },
      PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => (k === 'carpeta_pdf' ? 'carpeta' : null), setProperty: () => undefined, deleteProperty: () => undefined }) },
      console: { log: () => undefined },
    }
    const { releerOrdenesOtro } = runInNewContext(`${ROBOT}\n;({ releerOrdenesOtro })`, contexto) as { releerOrdenesOtro: () => void }
    releerOrdenesOtro()
    const filas = (pestanias.ordenes ?? []).slice(1)
    expect(filas).toHaveLength(1)
    expect(filas[0]?.slice(0, 6)).toEqual(['msg-viejo', '2026-01-02 10:00', 'otra', 'orden', 'LPS', '900000000023'])
  })

  it('releerOrdenesOtro relee también la orden que la base no acepta (sin compañía), sin volver a subir su PDF', () => {
    const asunto = 'Orden De Trabajo ZURICH-COMPAÑÍA-DE-SEGUROS-900000011FORD-RANGER-AB123CD-PERITO-INVENTADO'
    const vieja = ['msg-zurich', '2026-01-02 10:00', 'orion', 'orden', '', '', 'AB123CD', '', 'PERITO INVENTADO', '', '', '', '', 'drive-viejo',
      'ordenes v6', 'sin_compania', '', '', ORION, asunto, 'orden.pdf', '']
    const cargada = ['msg-cargada', '2026-01-03 10:00', 'orion', 'orden', 'Sancor', '111', '', '', '', '', '', '', '', '', 'ordenes v6', 'cargada']
    const pestanias: Record<string, unknown[][]> = {
      ordenes: [['message_id'], vieja, cargada],
      dominios_ordenes: [['dominio', 'compañía'], ['lps.com.ar', 'LPS']],
      remitentes: [['remitente', 'compañía'], ['pagos@ejemplo.example', 'X']],
    }
    const pedidos: string[] = []
    const subidos: string[] = []
    const contexto = {
      SpreadsheetApp: { getActive: () => libro(pestanias) },
      Gmail: { Users: { Messages: {
        get: (_: string, id: string) => { pedidos.push(id); return mensaje({ from: ORION, asunto, adjuntos: ['orden.pdf'] }) },
        Attachments: { get: () => ({ data: 'pdf' }) },
      } } },
      Utilities: { newBlob: (d: string) => ({ getDataAsString: () => d }), base64DecodeWebSafe: (d: string) => d, formatDate: () => '2026-01-02 10:00', sleep: () => undefined },
      Drive: { Files: {
        create: (meta: { name: string; mimeType?: string }) => {
          if (meta.mimeType !== 'application/vnd.google-apps.document') subidos.push(meta.name)
          return { id: 'ocr' }
        },
        remove: () => undefined,
      } },
      UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => 'Total: $ 1.000,00' }) },
      ScriptApp: { getOAuthToken: () => 'x' },
      PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => (k === 'carpeta_pdf' ? 'carpeta' : null), setProperty: () => undefined, deleteProperty: () => undefined }) },
      console: { log: () => undefined },
    }
    const { releerOrdenesOtro } = runInNewContext(`${ROBOT}\n;({ releerOrdenesOtro })`, contexto) as { releerOrdenesOtro: () => void }
    releerOrdenesOtro()
    expect(pedidos).toEqual(['msg-zurich'])
    expect(subidos).toEqual([])
    const filas = (pestanias.ordenes ?? []).slice(1)
    expect(filas).toHaveLength(2)
    expect(filas[0]?.slice(0, 6)).toEqual(['msg-zurich', '2026-01-02 10:00', 'orion', 'orden', 'Zurich', '900000011'])
    expect(filas[0]?.[13]).toBe('drive-viejo')
    expect(filas[0]?.[15]).toBe('')
    expect(filas[1]).toBe(cargada)
  })
})

describe('releerOrdenesOtro y el límite de Gmail', () => {
  it('si Gmail pide una pausa, frena sin perder lo hecho y la vez siguiente sigue desde ahí', () => {
    const otro = (id: string) => [id, '2026-01-02 10:00', '', 'otro', '', '', '', '', '', '', '', '', '', '', 'ordenes v1']
    const pestanias: Record<string, unknown[][]> = {
      ordenes: [['message_id'], otro('msg-1'), otro('msg-2'), otro('msg-3')],
      dominios_ordenes: [['dominio', 'compañía'], ['lps.com.ar', 'LPS']],
      remitentes: [['remitente', 'compañía'], ['pagos@ejemplo.example', 'X']],
    }
    const props: Record<string, string> = {}
    const pedidos: string[] = []
    let cupo = 1
    const hoja = (nombre: string) => {
      const filas = pestanias[nombre] ?? []
      pestanias[nombre] = filas
      return {
        appendRow: (f: unknown[]) => { filas.push(f) }, setFrozenRows: () => undefined, getLastRow: () => filas.length,
        getDataRange: () => ({ getValues: () => filas }),
        getRange: (fila: number | string, columna = 1) => ({
          setNumberFormat: () => undefined,
          getValue: () => (typeof fila === 'number' ? (filas[fila - 1]?.[columna - 1] ?? '') : ''),
          setValues: (v: unknown[][]) => { v.forEach((f, i) => { filas[(fila as number) - 1 + i] = f }) },
        }),
      }
    }
    const contexto = {
      SpreadsheetApp: { getActive: () => ({ getSheetByName: (n: string) => (n in pestanias ? hoja(n) : null), insertSheet: hoja }) },
      Gmail: { Users: { Messages: { get: (_: string, id: string) => {
        if (cupo-- <= 0) throw new Error("Quota exceeded for quota metric 'Total Query Cost'")
        pedidos.push(id)
        return mensaje({ from: 'Alguien <alguien@ejemplo.example>', asunto: 'Hola' })
      } } } },
      Utilities: { sleep: () => undefined, newBlob: (d: string) => ({ getDataAsString: () => d }), base64DecodeWebSafe: (d: string) => d, formatDate: () => '2026-01-02 10:00' },
      PropertiesService: { getScriptProperties: () => ({
        getProperty: (k: string) => props[k] ?? null,
        setProperty: (k: string, v: string) => { props[k] = v },
        deleteProperty: (k: string) => { delete props[k] },
      }) },
      console: { log: () => undefined },
    }
    const { releerOrdenesOtro } = runInNewContext(`${ROBOT}\n;({ releerOrdenesOtro })`, contexto) as { releerOrdenesOtro: () => void }
    releerOrdenesOtro()
    expect(pedidos).toEqual(['msg-1'])
    expect(props.releer_desde_fila).toBe('1')
    cupo = 10
    releerOrdenesOtro()
    expect(pedidos).toEqual(['msg-1', 'msg-2', 'msg-3'])
    expect(props.releer_desde_fila).toBeUndefined()
  })
})

describe('las compañías de Orion van con el nombre exacto de su ficha', () => {
  it.each([
    ['SAN-CRISTÓBAL-SMSG---CASA-CENTRAL-1234FORD-KA-AB123CD-PERITO-INVENTADO', 'San Cristóbal', '1234'],
    ['SEGUROS-BERNARDINO-RIVADAVIA-COOP-LTDA-5678FIAT-ARGO-AB123CD-PERITO-INVENTADO', 'Rivadavia', '5678'],
    ['PROVINCIA-SEGUROS-9012CHEVROLET-PRISMA-AB123CD-PERITO-INVENTADO', 'Provincia', '9012'],
    ['ALLIANZ-ARGENTINA---CÍA-DE-SEGUROS-GRALES-SA-C0042TOYOTA-HILUX-ABC123-PERITO-INVENTADO', 'Allianz', 'C0042'],
    // Las que faltaban (cruce con las facturas del 2026-10-21): antes quedaban sin compañía y sin cargar.
    ['ZURICH-COMPAÑÍA-DE-SEGUROS-900000011FORD-RANGER-AB123CD-PERITO-INVENTADO', 'Zurich', '900000011'],
    ['ZURICH-COMPANIA-DE-SEGUROS-900000021FIAT-CRONOS-AB123CD-PERITO-INVENTADO', 'Zurich', '900000021'],
    ['SEGUROS-GALICIA-SA-0420260000001001001FORD-FIESTA-ABC123-PERITO-INVENTADO', 'Galicia', '0420260000001001001'],
    ['SEGUROS-SURA-SA-0420240000002001001PEUGEOT-207-ABC123-PERITO-INVENTADO', 'Galicia', '0420240000002001001'],
    ['SEGURCOOP-COOP-DE-SEGUROS-LTDA-123456CITROEN-C-3-ABC123-PERITO-INVENTADO', 'Segurcoop', '123456'],
  ])('%s', (asunto, compania, siniestro) => {
    expect(leer({ remitente: ORION, asunto: `Orden De Trabajo ${asunto}` })).toMatchObject({ compania, siniestro })
  })

  it('una marca que va delante de otra (CHRYSLER-JEEP) corta en la primera', () => {
    expect(leer({ remitente: ORION, asunto: 'Orden De Trabajo ZURICH-COMPAÑÍA-DE-SEGUROS-900000031CHRYSLER-JEEP-RENEGADE-AB123CD-PERITO-INVENTADO' }))
      .toMatchObject({ compania: 'Zurich', siniestro: '900000031', vehiculo: 'CHRYSLER JEEP RENEGADE' })
  })

  it('una marca que no está en la lista: el siniestro son las cifras del principio', () => {
    expect(leer({ remitente: ORION, asunto: 'Orden De Trabajo PROVINCIA-SEGUROS-9012MARCAINVENTADA-X1-AB123CD-PERITO-INVENTADO' }))
      .toMatchObject({ compania: 'Provincia', siniestro: '9012', vehiculo: 'MARCAINVENTADA X1' })
    expect(leer({ remitente: ORION, asunto: 'Orden De Trabajo ALLIANZ-ARGENTINA---CIA-DE-SEGUROS-GRALES-SA-C0042MARCAINVENTADA-AB123CD-PERITO-INVENTADO' }))
      .toMatchObject({ compania: 'Allianz', siniestro: 'C0042' })
    // Un siniestro con guion y una marca desconocida: no se corta a ciegas, queda sin siniestro.
    expect(leer({ remitente: ORION, asunto: 'Orden De Trabajo PROVINCIA-SEGUROS-4-123MARCAINVENTADA-AB123CD-PERITO-INVENTADO' }))
      .toMatchObject({ compania: 'Provincia', siniestro: null })
  })
})

describe('órdenes de Zurich por Grant', () => {
  const GRANT = 'Zurich Seguros <zurich@grant.com.ar>'

  it('la orden de adjudicación entra para confirmar, con la compañía, el siniestro y el número de Grant', () => {
    expect(leer({
      remitente: GRANT,
      asunto: 'Zurich Seguros: Orden 900001 - Siniestro 0001-AUT1-60-00001',
      cuerpo: 'Orden de adjudicación. A continuación remitimos los datos de asignación de orden para iniciar el proceso de facturación.',
    })).toEqual({
      tipo: 'orden', plataforma: 'grant', compania: 'Zurich', siniestro: '0001-AUT1-60-00001', patente: null, vehiculo: null,
      perito: null, peritoMail: null, monto: null, franquicia: null, repuestos: null, referencia: 'Grant 900001',
      nota: 'Adjudicación de Grant: si ya está la orden de Orion de este siniestro, es la misma.', aConfirmar: true, lector: 'ordenes v7',
    })
    expect(leer({ remitente: GRANT, asunto: 'Zurich Seguros: Orden 900002 - Siniestro 90000001' })).toMatchObject({ siniestro: '90000001' })
  })

  it('lo demás que manda Grant no es una orden, ni pasa a la regla de las personas', () => {
    expect(leer({ remitente: GRANT, asunto: 'Grant Siniestros: Cambio de contraseña', adjuntos: ['orden de trabajo.pdf'] })).toBeNull()
  })
})

describe('el robot sube las órdenes a la base', () => {
  type Fila = string[]
  const fila = (id: string, fecha: string, tipo: string, base = '', aConfirmar = ''): Fila =>
    [id, fecha, 'orion', tipo, 'Sancor', '111', 'AB123CD', 'FORD KA', 'PERITO INVENTADO', '', '1000.50', 'franquicia en taller', '', '', 'ordenes v7', base, '', aConfirmar]

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
    const { subirOrdenes } = runInNewContext(`${ROBOT}\n;({ subirOrdenes })`, contexto) as {
      subirOrdenes: (h: typeof hoja, inicio: number) => string
    }
    return { mensaje: subirOrdenes(hoja, inicio), llamadas, escritas }
  }
  const PROPS = { SUPABASE_URL: 'https://ejemplo.supabase.co', SUPABASE_CLAVE_PUBLICA: 'k', ROBOT_MAIL: 'robot@ejemplo.com', ROBOT_CLAVE: 'c' }
  const rpc = (r: ReturnType<typeof correr>) => r.llamadas.filter((l) => l.url.endsWith('/rpc/fn_robot_guarda_orden'))

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
    expect(rpc(r).map((l) => l.cuerpo.p_gmail_message_id)).toEqual(['orden', 'anula'])
    expect(rpc(r)[0]?.cuerpo).toMatchObject({ p_compania: 'Sancor', p_siniestro: '111', p_fecha: '2026-01-02', p_monto: '1000.50',
      p_vehiculo: 'FORD KA', p_referencia: null, p_observaciones: 'franquicia en taller', p_a_confirmar: false })
    expect(r.escritas).toEqual({ 2: 'anulada', 3: 'cargada' })
  })

  it('una orden para confirmar viaja con p_a_confirmar, y sin compañía si el robot no la supo', () => {
    const sinCompania = fila('persona', '2026-01-03 10:00', 'orden', '', 'sí')
    sinCompania[4] = ''
    const r = correr([sinCompania, fila('vieja', '2026-01-01 10:00', 'orden')], PROPS, (c) => (c.p_a_confirmar ? 'a_confirmar' : 'cargada'))
    expect(rpc(r).map((l) => [l.cuerpo.p_gmail_message_id, l.cuerpo.p_a_confirmar, l.cuerpo.p_compania]))
      .toEqual([['vieja', false, 'Sancor'], ['persona', true, null]])
    expect(r.escritas).toEqual({ 2: 'a_confirmar', 3: 'cargada' })
    expect(r.mensaje).toBe('Órdenes a la base: 2 de 2 pendientes.')
  })

  it('si se acaba el tiempo de la corrida, corta y deja el resto para la próxima', () => {
    const r = correr([fila('m1', '2026-01-01 10:00', 'orden')], PROPS, () => 'cargada', 0)
    expect(rpc(r)).toHaveLength(0)
    expect(r.mensaje).toContain('siguen en la próxima corrida')
  })

  it('no vuelve a mandar lo terminado (tampoco lo que entró para confirmar), y reintenta lo que quedó sin compañía o sin siniestro', () => {
    const r = correr([
      fila('ya', '2026-01-01 10:00', 'orden', 'cargada'),
      fila('confirmar', '2026-01-01 10:30', 'orden', 'a_confirmar', 'sí'),
      fila('otro', '2026-01-01 11:00', 'otro'),
      fila('reintento', '2026-01-02 10:00', 'orden', 'sin_compania'),
      fila('sin-siniestro', '2026-01-03 10:00', 'orden', 'sin_siniestro', 'sí'),
    ], PROPS, () => 'cargada')
    expect(rpc(r).map((l) => l.cuerpo.p_gmail_message_id)).toEqual(['reintento', 'sin-siniestro'])
  })
})

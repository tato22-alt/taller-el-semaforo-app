import { describe, expect, it } from 'vitest'
import { deshacerHito } from './hitos'
import { TODAVIA_NO, anotarAlSalir, anotarDeuda, anotarPago, deshacerCobro, deshacerDeuda, leerPlataDeParticulares } from './particulares'
import { baseFalsa } from './plata-falsa'

const salida = { id_salida: 7, id_trabajo: 3, salio: '2026-11-10', dias: 2, numero_presupuesto: 16010, patente: 'AB123CD', vehiculo: 'Ford Ka', cliente: 'Juan', telefono: '2255123456', total_presupuesto: 500000 }
const deuda = { id_deuda: 4, deudor: 'Juan', telefono: null, detalle: null, numero_presupuesto: 16010, patente: 'AB123CD', vehiculo: 'Ford Ka', monto: '80000.00', pagado: '30000.00', saldo: '50000.00', fecha: '2026-11-01', dias: 11, pagos: 1, ultimo_pago: '2026-11-05', se_puede_deshacer: false }
const reciente = { ...deuda, id_deuda: 5, pagado: '0.00', saldo: '10000.00', pagos: 0, se_puede_deshacer: true }
const cobro = { id_cobro: 9, cuando: 'deuda', monto: '30000.00', fecha: '2026-11-05', quien: 'Juan', patente: 'AB123CD', vehiculo: 'Ford Ka', detalle: null, se_puede_deshacer: true }

describe('la plata de los particulares', () => {
  it('lee las salidas sin contestar, las deudas y lo anotado en la semana', async () => {
    const { cliente, llamadas } = baseFalsa({ filas: { vw_plata_al_salir: [salida], vw_deudas_particulares: [deuda, reciente], vw_cobros_particulares: [cobro] } })
    const r = await leerPlataDeParticulares(cliente)
    if (!r.ok || r.dato === TODAVIA_NO) throw new Error('no leyó')
    expect(r.dato.sinContestar[0]).toMatchObject({ idSalida: 7, totalPresupuesto: '500000', cliente: 'Juan' })
    expect(r.dato.deudas.map((d) => d.saldo)).toEqual(['50000.00', '10000.00'])
    expect(r.dato.deudasRecientes.map((d) => d.idDeuda)).toEqual([5])
    expect(r.dato.cobrosRecientes[0]).toMatchObject({ idCobro: 9, cuando: 'deuda', monto: '30000.00' })
    expect(llamadas).toContain('  where contestada = false')
    expect(llamadas).toContain('  or saldo.gt.0,se_puede_deshacer.is.true')
    expect(llamadas).toContain('  where se_puede_deshacer = true')
  })

  it('si la base todavía no tiene la migración, Hoy sigue andando', async () => {
    const { cliente } = baseFalsa({ errores: { vw_plata_al_salir: { code: 'PGRST205', message: 'no existe' } } })
    expect(await leerPlataDeParticulares(cliente)).toEqual({ ok: true, dato: TODAVIA_NO })
  })

  it('al salir anota la deuda primero y después el cobro, con la fecha de la salida', async () => {
    const { cliente, llamadas } = baseFalsa()
    await anotarAlSalir(7, { cobro: '20000.00', deuda: '80000.00', deudor: ' Juan ', telefono: '2255123456' }, '2026-11-10', cliente)
    expect(llamadas).toEqual([
      'insert deuda_particular {"id_salida":7,"deudor":"Juan","telefono":"2255123456","monto":"80000.00","fecha":"2026-11-10"}',
      'insert cobro_particular {"id_salida":7,"monto":"20000.00","fecha":"2026-11-10"}',
    ])
  })

  it('pagó todo es sólo un cobro; de seguro, un cobro de cero', async () => {
    const { cliente, llamadas } = baseFalsa()
    await anotarAlSalir(7, { cobro: '500000.00', deuda: null, deudor: 'Juan', telefono: null }, '2026-11-10', cliente)
    await anotarAlSalir(8, { cobro: '0.00', deuda: null, deudor: '', telefono: null }, '2026-11-11', cliente)
    expect(llamadas).toEqual([
      'insert cobro_particular {"id_salida":7,"monto":"500000.00","fecha":"2026-11-10"}',
      'insert cobro_particular {"id_salida":8,"monto":"0.00","fecha":"2026-11-11"}',
    ])
  })

  it('si la deuda falla, no anota el cobro', async () => {
    const { cliente, llamadas } = baseFalsa({ errores: { deuda_particular: { code: '23514', message: 'no' } } })
    expect((await anotarAlSalir(7, { cobro: '1.00', deuda: '2.00', deudor: 'Juan', telefono: null }, '2026-11-10', cliente)).ok).toBe(false)
    expect(llamadas.some((l) => l.startsWith('insert cobro_particular'))).toBe(false)
  })

  it('un pago va contra su deuda', async () => {
    const { cliente, llamadas } = baseFalsa()
    await anotarPago(4, '30000.00', '2026-11-12', cliente)
    expect(llamadas).toEqual(['insert cobro_particular {"id_deuda":4,"monto":"30000.00","fecha":"2026-11-12"}'])
  })

  it('una deuda de antes va con su presupuesto, o con qué auto es si no lo tiene', async () => {
    const { cliente, llamadas } = baseFalsa()
    await anotarDeuda({ idTrabajo: 3, detalle: 'no va', deudor: 'Juan', telefono: null, monto: '40000.00', fecha: '2026-03-01' }, cliente)
    await anotarDeuda({ idTrabajo: null, detalle: 'Gol gris', deudor: 'Ana', telefono: '2255000000', monto: '15000.00', fecha: '2026-05-05' }, cliente)
    expect(llamadas).toEqual([
      'insert deuda_particular {"id_trabajo":3,"detalle":null,"deudor":"Juan","telefono":null,"monto":"40000.00","fecha":"2026-03-01"}',
      'insert deuda_particular {"id_trabajo":null,"detalle":"Gol gris","deudor":"Ana","telefono":"2255000000","monto":"15000.00","fecha":"2026-05-05"}',
    ])
  })

  it('deshacer borra y confirma que se borró; si pasó la semana, lo dice', async () => {
    const borra = baseFalsa({ devuelve: { cobro_particular: { data: [{ id_cobro: 9 }] } } })
    expect(await deshacerCobro(9, borra.cliente)).toEqual({ ok: true, dato: null })
    expect(borra.llamadas).toEqual(['delete cobro_particular', '  where id_cobro = 9', '  returning id_cobro'])
    const vieja = baseFalsa({ devuelve: { cobro_particular: { data: [] }, deuda_particular: { data: [] } } })
    for (const r of [await deshacerCobro(9, vieja.cliente), await deshacerDeuda(4, vieja.cliente)]) expect(!r.ok && r.fallo.tipo === 'regla' && r.fallo.detalle).toContain('más de una semana')
  })

  it('una deuda con pagos, o un «Salió» con la plata anotada, no se deshacen: se dice por qué', async () => {
    const conPagos = baseFalsa({ devuelve: { deuda_particular: { error: { code: '23503', message: 'fk' } }, hito_trabajo: { error: { code: '23503', message: 'fk' } } } })
    const d = await deshacerDeuda(4, conPagos.cliente)
    expect(!d.ok && d.fallo.tipo === 'regla' && d.fallo.detalle).toContain('primero deshacé los pagos')
    const h = await deshacerHito(41, conPagos.cliente)
    expect(!h.ok && h.fallo.tipo === 'regla' && h.fallo.detalle).toContain('Ya se anotó la plata')
  })
})

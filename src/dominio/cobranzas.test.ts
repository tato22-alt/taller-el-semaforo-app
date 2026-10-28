import { describe, expect, it } from 'vitest'
import {
  centavos,
  esEstado,
  estadoEnPalabras,
  numeroDeFactura,
  ordenarCompanias,
  ordenarFacturas,
  plazoEnPalabras,
  queHacer,
  saludo,
  textoDelReclamo,
  tieneAlgoAbierto,
  type FacturaCobranza,
  type FilaCobranzas,
} from './cobranzas'

const fila = (o: Partial<FilaCobranzas>): FilaCobranzas => ({
  fila: 'compania', cuit: '30000000001', compania: 'Compañía', facturas: 1, facturado: '0', cobrado: '0', anulado: '0', deuda: '0',
  aReclamar: '0', enCurso: '0', aprobada: '0', pagadaSinImporte: '0', pagoNoVisible: '0', sinEvidencia: '0',
  deudaPorTramo: { hasta_60: '0', de_61_a_120: '0', de_4_a_12_meses: '0', mas_de_un_anio: '0' },
  facturasAReclamar: 0, facturasDeuda: 0, facturasPagoNoVisible: 0, facturasSinEvidencia: 0, avisaPagos: true,
  aReclamarDesde: null, plazoDias: 60, plazoOrigen: 'supuesto', ...o,
})

const factura = (o: Partial<FacturaCobranza>): FacturaCobranza => ({
  id: 1, puntoVenta: 2, numero: 3285, fecha: '2026-08-20', total: '121000.00', cobrado: '0.00', anulado: '0.00', saldo: '121000.00',
  estado: 'a_reclamar', dias: 69, tramo: 'de_61_a_120', envioVisto: true, mailEnvio: 'm1', vence: '2026-10-19', diasVencida: 9,
  fechaPrometida: null, ultimoPago: null, siniestros: '900000001', ...o,
})

describe('cobranzas', () => {
  it('nombra los estados y reconoce sólo los que conoce', () => {
    expect(estadoEnPalabras('pago_no_visible')).toBe('No se ve el pago')
    expect(esEstado('a_reclamar')).toBe(true)
    expect(esEstado('perdida')).toBe(false)
  })

  it('compara la plata en centavos, sin float', () => {
    expect(centavos('1234.56')).toBe(123456n)
    expect(centavos('0.1')).toBe(10n)
    expect(centavos('12')).toBe(1200n)
    expect(centavos('99999999999999.99')).toBe(9999999999999999n)
  })

  it('ordena las compañías: primero lo que hay que reclamar, después la deuda, después lo que no se ve', () => {
    const orden = ordenarCompanias([
      fila({ compania: 'Sólo no visible', pagoNoVisible: '9000000.00' }),
      fila({ compania: 'Reclamo chico', aReclamar: '100.00', deuda: '100.00' }),
      fila({ compania: 'Reclamo grande', aReclamar: '50000.00', deuda: '50000.00' }),
      fila({ compania: 'En plazo', deuda: '700.00', enCurso: '700.00' }),
    ]).map((f) => f.compania)
    expect(orden).toEqual(['Reclamo grande', 'Reclamo chico', 'En plazo', 'Sólo no visible'])
  })

  it('una compañía con todo cobrado o anulado no tiene nada abierto', () => {
    expect(tieneAlgoAbierto(fila({ cobrado: '500.00', anulado: '100.00' }))).toBe(false)
    expect(tieneAlgoAbierto(fila({ sinEvidencia: '1.00' }))).toBe(true)
  })

  it('ordena las facturas por estado y, dentro de cada uno, la más vieja primero', () => {
    const orden = ordenarFacturas([
      factura({ numero: 3, estado: 'cobrada', fecha: '2026-01-01' }),
      factura({ numero: 2, estado: 'a_reclamar', fecha: '2026-05-01' }),
      factura({ numero: 1, estado: 'a_reclamar', fecha: '2026-03-01' }),
      factura({ numero: 4, estado: 'en_curso', fecha: '2026-01-01' }),
    ]).map((f) => f.numero)
    expect(orden).toEqual([1, 2, 4, 3])
  })

  it('dice de dónde sale el plazo', () => {
    expect(plazoEnPalabras(15, 'declarado')).toBe('Plazo de la ficha: 15 días.')
    expect(plazoEnPalabras(32, 'observado')).toBe('Suele pagar en unos 16 días: se reclama a los 32.')
    expect(plazoEnPalabras(60, 'supuesto')).toMatch(/^Plazo supuesto: 60 días/)
    expect(plazoEnPalabras(null, null)).toBe('')
  })

  it('dice qué hacer hoy con cada compañía', () => {
    expect(queHacer(fila({ facturasAReclamar: 3, facturasPagoNoVisible: 1, facturasSinEvidencia: 2 }))).toEqual([
      'Reclamar 3 facturas.',
      '1 factura vencida sin ver el pago: esta compañía no avisa sus pagos por mail. Confirmalo en su portal.',
      '2 facturas sin señal de envío: ¿se mandaron?',
    ])
    expect(queHacer(fila({}))).toEqual([])
  })

  it('arma el número de factura y el saludo según la hora', () => {
    expect(numeroDeFactura({ puntoVenta: 2, numero: 3285 })).toBe('0002-00003285')
    expect(saludo(9)).toBe('Buenos días')
    expect(saludo(15)).toBe('Buenas tardes')
  })

  it('arma el reclamo con las facturas a reclamar, y nada más', () => {
    const formato = { pesos: (i: string) => `$${i}`, fecha: (f: string) => f.split('-').reverse().join('/'), hora: 10 }
    const texto = textoDelReclamo([
      factura({ numero: 3285 }),
      factura({ numero: 3290, fecha: '2026-08-25', siniestros: null, total: '200.00', cobrado: '50.00', saldo: '150.00' }),
      factura({ numero: 3300, estado: 'en_curso' }),
    ], formato)
    expect(texto).toContain('Buenos días, les escribimos de Taller El Semáforo. Según nuestros registros, estas facturas siguen pendientes de pago:')
    expect(texto).toContain('- Factura 0002-00003285 del 20/08/2026, siniestro 900000001: $121000.00')
    expect(texto).toContain('- Factura 0002-00003290 del 25/08/2026: $150.00 (de $200.00, pagaron $50.00)')
    expect(texto).not.toContain('3300')
    expect(textoDelReclamo([factura({})], formato)).toContain('esta factura sigue pendiente de pago')
  })
})

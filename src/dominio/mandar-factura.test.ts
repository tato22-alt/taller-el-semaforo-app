import { describe, expect, it } from 'vitest'
import { estadoEnPalabras, porQueNoSeSube, problemaEnPalabras, rutaDelArchivo, sePuedenCambiarArchivos, type FacturaParaMandar } from './mandar-factura'

const fila = (o: Partial<FacturaParaMandar>): FacturaParaMandar => ({
  idOrden: 10, idParaMandar: 1, estado: 'armando', para: 'facturas@compania.example', paraOrigen: 'mas_usada', asunto: null,
  problemas: [], archivos: [], mandadaEl: null, ...o,
})
const fecha = (d: string) => d.split('-').reverse().join('/')

describe('la factura lista para mandar', () => {
  it('dice en qué anda, y por qué no armó el borrador', () => {
    expect(estadoEnPalabras(fila({ estado: 'falta_orden_firmada' }), fecha)).toBe('Falta la orden firmada.')
    expect(estadoEnPalabras(fila({ estado: 'mandada', mandadaEl: '2026-10-30' }), fecha)).toBe('Mandada el 30/10/2026.')
    expect(estadoEnPalabras(fila({ estado: 'no_cierra', problemas: ['otro_cuit', 'sin_siniestro'] }), fecha))
      .toBe('No armé el borrador: la factura es para otro CUIT; la factura no dice el siniestro de la orden.')
    expect(problemaEnPalabras('un_control_nuevo')).toBe('un_control_nuevo')
  })

  it('con el borrador armado o la factura mandada, los archivos no se tocan', () => {
    expect(sePuedenCambiarArchivos('falta_factura')).toBe(true)
    expect(sePuedenCambiarArchivos('no_cierra')).toBe(true)
    expect(sePuedenCambiarArchivos('borrador_borrado')).toBe(true)
    expect(sePuedenCambiarArchivos('borrador_listo')).toBe(false)
    expect(sePuedenCambiarArchivos('mandada')).toBe(false)
  })

  it('la factura, sólo el PDF; lo demás, PDF o fotos de hasta 10 MB', () => {
    expect(porQueNoSeSube('factura', 'application/pdf', 200_000)).toBeNull()
    expect(porQueNoSeSube('factura', 'image/jpeg', 200_000)).toMatch(/PDF que se baja de ARCA/)
    expect(porQueNoSeSube('orden_firmada', 'image/jpeg', 200_000)).toBeNull()
    expect(porQueNoSeSube('orden_firmada', 'image/heic', 200_000)).toMatch(/Sólo PDF o fotos/)
    expect(porQueNoSeSube('otro', 'application/pdf', 11 * 1024 * 1024)).toMatch(/10 MB/)
  })

  it('la ruta empieza con la orden y no lleva tildes ni espacios', () => {
    expect(rutaDelArchivo(10, 'orden_firmada', 'WhatsApp Image 2026-10-30 at 10.15.jpeg', 1700000000000))
      .toBe('10/1700000000000-orden_firmada-WhatsApp_Image_2026-10-30_at_10.15.jpeg')
    expect(rutaDelArchivo(7, 'factura', 'Factura Ñandú (1).pdf', 1)).toBe('7/1-factura-Factura_Nandu_1_.pdf')
    expect(rutaDelArchivo(7, 'otro', '###', 1)).toBe('7/1-otro-archivo')
  })
})

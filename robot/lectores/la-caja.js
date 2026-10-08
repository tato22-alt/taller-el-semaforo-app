// @ts-check
/* La Caja (Caja de Ahorro y Seguro S.A.) · avisa por cobranzas.com, y el aviso casi no dice nada.
 *
 * "Usted tiene una novedad en un pago de Caja de Ahorro y Seguro S.A.
 *  Número de Liquidación | 100000000000001
 *  Fecha de Disponibilidad | 24/08/2026"
 * No trae importe ni facturas: eso está en el portal de cobranzas.com, y lo que dice un portal lo
 * carga una persona (N1). El lector anota que hubo un pago, con su número y su fecha, para que
 * nadie tenga que acordarse de entrar a mirar. Experta, que tiene otro CUIT, puede usar el mismo
 * portal: el aviso no dice de cuál de las dos es, salvo por el nombre del asunto. */

const VERSION_LA_CAJA = 1

/**
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerLaCaja(mail) {
  const lector = 'la-caja'
  const v = VERSION_LA_CAJA
  const cuerpo = mail.cuerpo.replace(/[|\s]+/g, ' ')
  const liquidacion = /N[uú]mero de Liquidaci[oó]n (\d+)/i.exec(cuerpo)
  if (!liquidacion) return noEntendido(lector, v, 'No encontré el número de liquidación.')
  const disponible = /Fecha de Disponibilidad (\d{2}\/\d{2}\/\d{4})/i.exec(cuerpo)

  return conControl({
    lector,
    version: v,
    tipo: 'pago',
    op: liquidacion[1] ?? null,
    fechaPago: disponible ? aFecha(disponible[1] ?? '') : null,
    neto: null,
    lineas: [],
    retenciones: [],
  }, null)
}

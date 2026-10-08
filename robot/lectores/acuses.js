// @ts-check
/* Acuses: los mails que dicen algo de una factura pero NO son un pago (R3).
 *
 * "Recibimos tu factura", "tu factura fue aprobada", "la fecha de pago es el …". Sirven para
 * saber en qué anda cada factura y qué reclamar, pero nunca suman al cobrado. Por eso no salen
 * como un pago: salen como `acuse`, y el barrido los escribe en su propia pestaña, separada de las
 * líneas de pago. En la base van a ir a la tabla `acuse` (spec §4.3), que no es la de los pagos.
 *
 * Tipos, los de la spec: acuse (la recibieron), aprobacion (la aprobaron), fecha_prometida
 * (dicen cuándo pagan) y autorespuesta (un "recibimos su mail" que no nombra ninguna factura). */

/**
 * @typedef {'acuse' | 'aprobacion' | 'fecha_prometida' | 'autorespuesta'} TipoAcuse
 * @typedef {{
 *   estado: 'acuse', lector: string, version: number, tipo: TipoAcuse,
 *   factura: FacturaCitada | null, siniestro: string | null, monto: string | null,
 *   fechaPrometida: string | null, referencia: string | null
 * }} AcuseLeido
 */

const VERSION_ACUSES = 1

/**
 * @param {string} lector
 * @param {TipoAcuse} tipo
 * @param {Partial<Omit<AcuseLeido, 'estado' | 'lector' | 'version' | 'tipo'>>} datos
 * @returns {AcuseLeido}
 */
function acuse(lector, tipo, datos) {
  return { estado: 'acuse', lector, version: VERSION_ACUSES, tipo, factura: null, siniestro: null, monto: null, fechaPrometida: null, referencia: null, ...datos }
}

/**
 * La factura del asunto estándar del taller, cuando el acuse es una respuesta a ese mail.
 * @param {string} asunto
 * @returns {FacturaCitada | null}
 */
function facturaDelAsunto(asunto) {
  const e = leerAsuntoEnvio(asunto)
  return e ? { texto: `factura n°${e.factura}`, puntoVenta: null, numero: e.factura } : null
}

/**
 * Nación: "Ingreso de Factura N° 0002-00001234 … bajo el Nro de Trámite 00700000".
 * @param {Mail} mail
 * @returns {AcuseLeido | AvisoNoLeido}
 */
function leerAcuseNacion(mail) {
  const f = /Ingreso de Factura N\S* ?(\d{4})-(\d{8})/i.exec(mail.asunto)
  if (!f) return noEntendido('acuse-nacion', VERSION_ACUSES, 'El asunto no tiene la forma "Ingreso de Factura N° 0002-00001234".')
  const tramite = /Tr\S*mite:? ?(\d+)/i.exec(mail.cuerpo)
  return acuse('acuse-nacion', 'acuse', {
    factura: { texto: `${f[1]}-${f[2]}`, puntoVenta: Number(f[1]), numero: Number(f[2]) },
    referencia: tramite ? `trámite ${tramite[1]}` : null,
  })
}

/**
 * Mercantil Andina: "Tu Factura A0002-00001234 ha sido aprobada", con monto, siniestro y la fecha
 * estimada de pago ("2026-10-14").
 * @param {Mail} mail
 * @returns {AcuseLeido | AvisoNoLeido}
 */
function leerAcuseMercantil(mail) {
  const f = /Factura ([A-C])(\d{4})-(\d{8}) ha sido aprobada/i.exec(mail.asunto)
  if (!f) return noEntendido('acuse-mercantil', VERSION_ACUSES, 'El asunto no tiene la forma "Tu Factura A0002-00001234 ha sido aprobada".')
  const cuerpo = mail.cuerpo.replace(/\s+/g, ' ')
  const monto = /monto \$ ?(\d[\d.,]*\d)/i.exec(cuerpo)
  const siniestro = /siniestro Nro\.? ?(\d+)/i.exec(cuerpo)
  const fecha = /fecha estimada de pago es (\d{4}-\d{2}-\d{2})/i.exec(cuerpo)
  return acuse('acuse-mercantil', 'aprobacion', {
    factura: { texto: `${f[1]}${f[2]}-${f[3]}`, puntoVenta: Number(f[2]), numero: Number(f[3]) },
    siniestro: siniestro ? (siniestro[1] ?? null) : null,
    monto: monto ? aImporte(monto[1] ?? '') : null,
    fechaPrometida: fecha ? (fecha[1] ?? null) : null,
  })
}

/**
 * Allianz: la respuesta automática ("Respuesta Automatica") y la que da la fecha de pago, que
 * responde al mail de la factura: "Les informamos que la fecha de pago es el 20-08-2026".
 * @param {Mail} mail
 * @returns {AcuseLeido | AvisoNoLeido}
 */
function leerAcuseAllianz(mail) {
  if (/respuesta autom/i.test(mail.asunto)) return acuse('acuse-allianz', 'autorespuesta', {})
  const fecha = /fecha de pago es el (\d{2}-\d{2}-\d{4})/i.exec(mail.cuerpo)
  if (!fecha) return noEntendido('acuse-allianz', VERSION_ACUSES, 'No dice una fecha de pago ("la fecha de pago es el dd-mm-aaaa").')
  return acuse('acuse-allianz', 'fecha_prometida', { factura: facturaDelAsunto(mail.asunto), fechaPrometida: aFecha(fecha[1] ?? '') })
}

/**
 * Zurich, por Grant: "Recibimos tu factura … para su proceso de pago", como respuesta al mail de
 * la factura. Los demás mails de esa casilla (habilitaciones de siniestro, accesos) no son acuses.
 * @param {Mail} mail
 * @returns {AcuseLeido | AvisoNoLeido}
 */
function leerAcuseGrant(mail) {
  if (!/recibimos tu factura/i.test(mail.cuerpo)) {
    return { estado: 'sin_lector', lector: null, version: null, motivo: 'Mail de Grant que no es un acuse de factura.' }
  }
  return acuse('acuse-grant', 'acuse', { factura: facturaDelAsunto(mail.asunto) })
}

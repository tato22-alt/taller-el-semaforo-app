// @ts-check
/* A qué lector va cada mail, y el asunto de las facturas enviadas.
 *
 * Cada lector se elige por el dominio del remitente y, cuando la compañía manda más de un tipo de
 * mail desde el mismo dominio, por el asunto: así un acuse ("Ingreso de Factura") nunca pasa por
 * un lector de pagos (R3). Lo que no tiene lector se guarda igual, como `sin_lector`, y se lee el
 * día que lo tenga. La lista se arma dentro de una función, no al cargar el archivo: en Apps
 * Script los archivos se cargan en orden y los lectores están en otros archivos. */

/**
 * @returns {readonly { readonly dominio: string, readonly asunto: RegExp, readonly leer: (mail: Mail) => AvisoLeido | AvisoNoLeido }[]}
 */
function lectores() {
  return [
    { dominio: 'fedpat.com.ar', asunto: /dep[oó]sito de transferencia/i, leer: leerFedPatronal },
    { dominio: 'lasegunda.com.ar', asunto: /retenciones factura/i, leer: leerLaSegunda },
    { dominio: 'lps.com.ar', asunto: /orden de pago/i, leer: leerLps },
    { dominio: 'riouruguay.com.ar', asunto: /pago/i, leer: leerRioUruguay },
    { dominio: 'nacion-seguros.com.ar', asunto: /aviso de pago/i, leer: leerNacion },
    { dominio: 'sancristobal.com.ar', asunto: /aviso de pago/i, leer: leerSanCristobal },
    { dominio: 'sancorseguros.com', asunto: /comprobante de pago/i, leer: leerSancor },
  ]
}

/**
 * Lee un mail con el lector de su compañía. Si no hay lector, lo dice.
 * @param {Mail} mail
 * @returns {AvisoLeido | AvisoNoLeido}
 */
function leerAviso(mail) {
  const direccion = direccionDe(mail.remitente)
  const dominio = direccion.slice(direccion.indexOf('@') + 1)
  for (const l of lectores()) {
    const deEseDominio = dominio === l.dominio || dominio.endsWith('.' + l.dominio)
    if (deEseDominio && l.asunto.test(mail.asunto)) return l.leer(mail)
  }
  return { estado: 'sin_lector', lector: null, version: null, motivo: `Todavía no hay lector para ${direccion} con ese asunto.` }
}

/* Facturas enviadas · el asunto estándar del taller: "factura n°3567 siniestro n°2004085048", u
 * "orden de compra n°…" en vez de siniestro. Una respuesta o un reenvío ("Re:", "RV:", "Fwd:")
 * no es un envío nuevo. */

/**
 * @typedef {{ tipo: 'envio' | 'respuesta', factura: number, siniestro: string | null, ordenCompra: string | null }} AsuntoEnvio
 */

/**
 * @param {string} asunto
 * @returns {AsuntoEnvio | null}
 */
function leerAsuntoEnvio(asunto) {
  const factura = /factura\s*n\s*[°º.]?\s*(\d+)/i.exec(asunto)
  if (!factura) return null
  const siniestro = /siniestro\s*n\s*[°º.]?\s*(\S+)/i.exec(asunto)
  const orden = /orden de compra\s*n\s*[°º.]?\s*(\S+)/i.exec(asunto)
  return {
    tipo: /^\s*(re|rv|fw|fwd|reenv\w*)\s*:/i.test(asunto) || /^\s*\[[^\]]*\]\s*(re|rv)\s*:/i.test(asunto) ? 'respuesta' : 'envio',
    factura: Number(factura[1]),
    siniestro: siniestro ? (siniestro[1] ?? null) : null,
    ordenCompra: orden ? (orden[1] ?? null) : null,
  }
}

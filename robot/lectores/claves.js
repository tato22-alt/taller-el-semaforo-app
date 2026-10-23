// @ts-check
/* Lo que el robot NO guarda: claves y enlaces que inician sesión (R2, RF-502). Plan 005, fase 0.
 *
 * Vivía en barrido.js. Pasó acá, como función pura y con tests, el 2026-10-23: un mail de acceso a un
 * portal traía "*Contraseña* <la clave>", con la palabra en negrita, y la regla vieja tapaba el
 * asterisco y dejaba la clave. Se aplica a todo lo que se escribe en la planilla y en la base: el
 * cuerpo del mail y el texto de sus PDF. Los lectores leen el texto original, antes de taparlo. */

const TAPADA = '[quitada por el robot]'

/**
 * Hay compañías que mandan el usuario y la clave de su portal por mail, en texto plano. Lo que sigue
 * a "contraseña", "clave" o "password" se reemplaza, aunque entre la palabra y la clave haya
 * asteriscos, dos puntos, comillas o un guion. Se puede aplicar dos veces: lo que ya está tapado
 * queda igual.
 * @param {string} texto
 * @returns {string}
 */
function sinClaves(texto) {
  return texto.replace(
    /\b(contrase(?:ñ|n|\uFFFD)a|clave|pass(?:word)?)\b(\s*(?:provisoria|temporal|de acceso)?[\s*_:=\-"'“”]*)(?!\[quitada)[^\s*_:=\-"'“”][^\s*"'“”]*/gi,
    `$1$2${TAPADA}`,
  )
}

/**
 * Algunos avisos traen un enlace que inicia sesión en el portal de la compañía sin pedir clave
 * (cobranzas.com lo hace, con un token que dura días). Es una credencial: no se guarda (R2). Se
 * reemplaza cualquier URL que lleve un token, una sesión o una clave en sus parámetros.
 * @param {string} texto
 * @returns {string}
 */
function sinEnlacesDeSesion(texto) {
  return texto.replace(/https?:\/\/[^\s)\]"'<>]*[?&](token|session|sesion|auth|key|clave|pass\w*)=[^\s)\]"'<>]*/gi, '[enlace de acceso quitado por el robot]')
}

/**
 * Lo que se guarda de un texto: sin claves ni enlaces de sesión.
 * @param {string} texto
 * @returns {string}
 */
function paraGuardar(texto) {
  return sinClaves(sinEnlacesDeSesion(texto))
}

/* La huella de un archivo: SHA-256 en hexadecimal.
 *
 * Se guarda con cada importación para saber, mirando la base, si dos importaciones fueron del
 * mismo archivo. No la usa nadie para decidir nada en el momento: es para auditar. Usa la
 * criptografía que ya trae el navegador (y Node, en los tests); no hace falta una librería. */

export async function huellaSha256(contenido: ArrayBuffer): Promise<string> {
  const resumen = await crypto.subtle.digest('SHA-256', contenido)
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

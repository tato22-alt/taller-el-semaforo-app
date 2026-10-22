/* El teléfono del presupuesto, para abrir WhatsApp. Spec 011 de semaforo-base, RF-1109.
 *
 * El teléfono se carga en la herramienta de presupuestos como lo dicta el cliente: casi siempre
 * característica y número, diez dígitos ("2255 123456"). WhatsApp lo quiere en formato
 * internacional y, para los celulares de Argentina, con el 9 después del 54 y sin el 15:
 * 2255 15 123456 → 5492255123456.
 *
 * Si el número no se entiende, no se adivina: el link abre WhatsApp con el mensaje escrito y la
 * persona elige el contacto. Un número adivinado mal le manda el mensaje a un desconocido. */

/** "2255-123456" → "5492255123456". Nulo si no tiene una forma que se pueda pasar sin adivinar. */
export function numeroDeWhatsApp(telefono: string | null | undefined): string | null {
  if (typeof telefono !== 'string') return null
  let digitos = telefono.replace(/\D/g, '')
  if (digitos.startsWith('549') && digitos.length === 13) return digitos
  if (digitos.startsWith('54') && digitos.length === 12) return `549${digitos.slice(2)}`
  if (digitos.startsWith('0')) digitos = digitos.slice(1)
  if (digitos.length === 12) digitos = sinElQuince(digitos) ?? digitos
  // Diez dígitos que empiezan con 15 son un celular sin característica: no se sabe de dónde es.
  if (digitos.length === 10 && !digitos.startsWith('15')) return `549${digitos}`
  return null
}

/** El link que abre WhatsApp con el mensaje ya escrito. Lo manda una persona (R1). */
export function linkDeWhatsApp(telefono: string | null | undefined, texto: string): string {
  const numero = numeroDeWhatsApp(telefono)
  const mensaje = encodeURIComponent(texto)
  return numero === null ? `https://wa.me/?text=${mensaje}` : `https://wa.me/${numero}?text=${mensaje}`
}

/** "2255 15 123456" (doce dígitos) → "2255123456". Las características tienen de 2 a 4 dígitos; se
 *  prueba primero la de 4, que es la de Villa Gesell y la zona. Nulo si no hay un 15 donde va. */
function sinElQuince(digitos: string): string | null {
  for (const largo of [4, 3, 2]) {
    if (digitos.slice(largo, largo + 2) === '15') return digitos.slice(0, largo) + digitos.slice(largo + 2)
  }
  return null
}

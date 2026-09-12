/* Normalización de patentes, para buscar.
 *
 * La base es la autoridad: tiene fn_normalizar_patente() y valida el formato.
 * Esta copia existe sólo para normalizar lo que se tipea en el buscador ANTES de
 * consultar, así "ab 123 cd" encuentra la fila guardada como "AB123CD". No se usa
 * para guardar: al guardar manda la base. */

/** "ab 123-cd" → "AB123CD" */
export function normalizarPatente(patente: string | null | undefined): string {
  if (typeof patente !== 'string') return ''
  return patente.toUpperCase().replace(/[\s.-]/g, '')
}

/** Los dos formatos que usa Argentina, ya normalizados:
 *  AAA000 (hasta 2016) y AA000AA (Mercosur). */
export function tieneFormatoDePatente(patente: string): boolean {
  const norma = normalizarPatente(patente)
  return /^[A-Z]{3}\d{3}$/.test(norma) || /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(norma)
}

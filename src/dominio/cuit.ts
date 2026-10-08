/* El CUIT, validado con su dígito verificador.
 *
 * El CUIT del emisor entra en la clave de cada comprobante importado (plan 005, D3): un dígito
 * mal tipeado deja 470 facturas colgadas de un emisor que no existe, y no se arregla editando una
 * fila. El último dígito de un CUIT se calcula con los otros diez, así que un error de tipeo se
 * detecta antes de importar. */

const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const

/** "30-00000000-7" o "30000000007" → "30000000007". Cualquier otra cosa → null. */
export function normalizarCuit(texto: string): string | null {
  const digitos = texto.replace(/[\s-]/g, '')
  return /^\d{11}$/.test(digitos) ? digitos : null
}

/** true si tiene once dígitos y el último es el verificador que corresponde. */
export function cuitValido(texto: string): boolean {
  const cuit = normalizarCuit(texto)
  if (cuit === null) return false

  const suma = PESOS.reduce((acumulado, peso, i) => acumulado + peso * Number(cuit[i]), 0)
  const resto = suma % 11
  const verificador = resto === 0 ? 0 : 11 - resto
  // Un resto de 1 daría verificador 10, que no es un dígito: ARCA no emite esos CUIT.
  return verificador !== 10 && verificador === Number(cuit[10])
}

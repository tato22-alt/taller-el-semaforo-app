/* Lo que el robot no guarda: claves y enlaces de sesión (R2). lectores/claves.js.
 *
 * Las claves de acá son INVENTADAS, con la forma de las que mandan los portales. */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const C = runInNewContext(readFileSync(join(import.meta.dirname, 'lectores', 'claves.js'), 'utf8') + '\n;({ sinClaves, paraGuardar })', {}) as {
  sinClaves: (t: string) => string
  paraGuardar: (t: string) => string
}

describe('sinClaves', () => {
  it('tapa la clave después de "contraseña:"', () => {
    expect(C.sinClaves('Usuario: taller Contraseña: Xy9#kq2!Lm')).toBe('Usuario: taller Contraseña: [quitada por el robot]')
  })

  it('tapa la clave aunque la palabra venga en negrita, con asteriscos (el caso que se escapaba)', () => {
    expect(C.sinClaves('*Usuario* alguien@ejemplo.com *Contraseña* Qw3[>0=;zz&?H/;<&rT Adjuntamos instructivo'))
      .toBe('*Usuario* alguien@ejemplo.com *Contraseña* [quitada por el robot] Adjuntamos instructivo')
  })

  it('tapa claves provisorias, con comillas o con "password"', () => {
    expect(C.sinClaves('su clave provisoria = "Ab12cd34"')).toBe('su clave provisoria = "[quitada por el robot]"')
    expect(C.sinClaves('Password: hunter22')).toBe('Password: [quitada por el robot]')
  })

  it('se puede aplicar dos veces: lo que ya está tapado queda igual', () => {
    const una = C.sinClaves('cambiar su contraseña[quitada por el robot] En su ingreso, el sistema le pedirá otra')
    expect(una).toBe('cambiar su contraseña[quitada por el robot] En su ingreso, el sistema le pedirá otra')
    const tapada = C.sinClaves('Contraseña: Xy9#kq2!Lm y nada más')
    expect(C.sinClaves(tapada)).toBe(tapada)
  })

  it('el texto sin claves no cambia', () => {
    const texto = 'Orden de Pago Nro 00123456. Total a pagar 100.000,00. Retención Ganancias 2.000,00.'
    expect(C.sinClaves(texto)).toBe(texto)
  })
})

describe('paraGuardar', () => {
  it('saca también los enlaces que inician sesión', () => {
    expect(C.paraGuardar('Ingresar: https://portal.ejemplo.com/entrar?token=abc123 o con su clave: Zz9!aa'))
      .toBe('Ingresar: [enlace de acceso quitado por el robot] o con su clave: [quitada por el robot]')
  })
})

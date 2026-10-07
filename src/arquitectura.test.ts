/* La regla de las capas, verificada en vez de confiada.
 *
 * El CLAUDE.md dice que la regla "se puede verificar leyendo imports". Esto lo
 * hace automáticamente, porque una convención que nadie chequea se rompe sola el
 * día que alguien tiene apuro. */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = join(import.meta.dirname, '.')

function archivosDe(capa: string): readonly string[] {
  const dir = join(RAIZ, capa)
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((n) => /\.tsx?$/.test(n) && !n.endsWith('.test.ts'))
    .map((n) => join(dir, n))
}

function importsDe(archivo: string): readonly string[] {
  const codigo = readFileSync(archivo, 'utf8')
  return [...codigo.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1] ?? '')
}

describe('dominio/', () => {
  it('no importa nada del proyecto: funciones puras, testeables sin montar nada', () => {
    for (const archivo of archivosDe('dominio')) {
      for (const imp of importsDe(archivo)) {
        expect(imp.startsWith('.'), `${archivo} importa ${imp}`).toBe(false)
      }
    }
  })

  it('no conoce React ni Supabase', () => {
    for (const archivo of archivosDe('dominio')) {
      for (const imp of importsDe(archivo)) {
        expect(['react', '@supabase/supabase-js'], `${archivo} importa ${imp}`).not.toContain(imp)
      }
    }
  })
})

describe('ui/', () => {
  it('nunca importa el cliente de Supabase', () => {
    // Si un componente lo necesita, lo que falta es una función en datos/.
    for (const archivo of [...archivosDe('ui'), join(RAIZ, 'app.tsx')]) {
      for (const imp of importsDe(archivo)) {
        expect(imp, archivo).not.toBe('@supabase/supabase-js')
        expect(imp.includes('datos/cliente-supabase'), `${archivo} importa ${imp}`).toBe(false)
      }
    }
  })
})

describe('datos/', () => {
  it('es la única capa que conoce Supabase', () => {
    const conSupabase = archivosDe('datos').filter((a) =>
      importsDe(a).includes('@supabase/supabase-js'),
    )
    expect(conSupabase.length).toBeGreaterThan(0)
  })
})

describe('lo que esta app no escribe', () => {
  // Regla del CLAUDE.md: los conceptos y el texto tal como se imprimió son de quien emite
  // el papel. Si esta app también los escribiera, habría dos implementaciones de lo mismo.
  //
  // Esta regla se verificaba buscando las palabras `trabajo_items` y `txt_` en el código, y
  // esa medición estaba mal de dos maneras distintas, las dos descubiertas construyendo:
  //
  //   1. tipos-base.ts describe el esquema COMPLETO porque lo genera Supabase. Nombra todas
  //      las columnas, incluidas las que esta app no toca.
  //   2. El tablero LEE txt_cliente y txt_vehiculo, y tiene que hacerlo: son el nombre y el
  //      vehículo tal como se imprimieron, que es lo que el cliente tiene en la mano.
  //
  // Nombrar no es escribir, y leer tampoco. Así que la regla ahora mide escrituras, que es
  // lo que el CLAUDE.md prohíbe de verdad. Queda más estricta que antes, no más floja.
  const capasQueTocanLaBase = () => [...archivosDe('datos'), ...archivosDe('ui'), join(RAIZ, 'app.tsx')]

  it('no escribe nada: ni insert, ni update, ni upsert, ni delete', () => {
    // Hoy esta app es de sólo lectura. El día que tenga un hecho propio que registrar
    // —marcar no concretado, un cobro— este test va a fallar, y está bien: obliga a que
    // la excepción se decida y se escriba acá con nombre, en vez de aparecer sola.
    const escrituras = /\.(insert|update|upsert|delete)\s*\(/
    for (const archivo of capasQueTocanLaBase()) {
      expect(readFileSync(archivo, 'utf8'), archivo).not.toMatch(escrituras)
    }
  })

  it('nunca abre trabajo_items, ni siquiera para leer', () => {
    // Los conceptos del presupuesto se muestran desde vw_presupuestos, que ya los trae
    // sumados. Entrar a la tabla sería el primer paso hacia escribirla.
    for (const archivo of capasQueTocanLaBase()) {
      expect(readFileSync(archivo, 'utf8'), archivo).not.toMatch(/\.from\(\s*['"`]trabajo_items/)
    }
  })

  it('lee de vistas, no de las tablas de presupuesto', () => {
    // Principio III: los totales los deriva la base. Si la app abriera `trabajos`
    // directamente, el próximo paso sería sumar los renglones en el navegador.
    for (const archivo of capasQueTocanLaBase()) {
      expect(readFileSync(archivo, 'utf8'), archivo).not.toMatch(/\.from\(\s*['"`]trabajos['"`]/)
    }
  })
})

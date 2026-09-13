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
  const capasQueTocanLaBase = () => [...archivosDe('datos'), ...archivosDe('ui'), join(RAIZ, 'app.tsx')]

  it('no menciona trabajo_items: los conceptos los escribe quien emite el presupuesto', () => {
    for (const archivo of capasQueTocanLaBase()) {
      expect(readFileSync(archivo, 'utf8'), archivo).not.toContain('trabajo_items')
    }
  })

  it('no menciona las columnas txt_: son el snapshot de lo que decía el papel', () => {
    for (const archivo of capasQueTocanLaBase()) {
      expect(readFileSync(archivo, 'utf8'), archivo).not.toMatch(/txt_(cliente|direccion|telefono|vehiculo|patente)/)
    }
  })
})

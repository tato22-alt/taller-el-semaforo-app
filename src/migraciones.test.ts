/* Que ninguna tabla ni función nueva nazca abierta (plan 005, D8; hallazgo H9).
 *
 * Supabase le da privilegios a anon sobre toda tabla nueva del esquema public, y Postgres le da
 * EXECUTE a PUBLIC sobre toda función nueva. Las primeras 19 migraciones lo resolvieron a mano,
 * una por una; con cobranzas entran unas quince tablas y vistas más, y alguna se iba a olvidar.
 * Esto lo convierte en algo que se chequea en vez de algo que hay que recordar.
 *
 * Lee los archivos .sql como texto: no importa nada de base/, igual que arquitectura.test.ts
 * lee los de src/. Mide sólo las migraciones desde M1 de cobranzas: las anteriores activaron la
 * RLS en un archivo aparte (rls_tablas) y ya están verificadas contra la base real. */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRACIONES = join(import.meta.dirname, '..', 'base', 'supabase', 'migrations')
const PRIMERA_MEDIDA = '20261008120000'

function migracionesMedidas(): readonly { readonly nombre: string; readonly sql: string }[] {
  return readdirSync(MIGRACIONES)
    .filter((n) => n.endsWith('.sql') && n >= PRIMERA_MEDIDA)
    .sort()
    .map((nombre) => ({ nombre, sql: readFileSync(join(MIGRACIONES, nombre), 'utf8') }))
}

/* Los comentarios SQL se sacan antes de buscar: un "create table" mencionado en un comentario
 * no crea nada, y un "revoke" comentado no protege nada. */
function sinComentarios(sql: string): string {
  return sql.replace(/--.*$/gm, '')
}

function nombresCreados(sql: string, objeto: 'table' | 'function' | 'view'): readonly string[] {
  const patron = new RegExp(`create\\s+(?:or\\s+replace\\s+)?${objeto}\\s+(?:public\\.)?(\\w+)`, 'gi')
  return [...sinComentarios(sql).matchAll(patron)].map((m) => (m[1] ?? '').toLowerCase())
}

function contiene(sql: string, patron: string): boolean {
  return new RegExp(patron, 'i').test(sinComentarios(sql).replace(/\s+/g, ' '))
}

describe('migraciones de cobranzas en adelante', () => {
  it('hay al menos una para medir', () => {
    expect(migracionesMedidas().length).toBeGreaterThan(0)
  })

  it('toda tabla nueva activa y fuerza su RLS, y le revoca todo a anon, en el mismo archivo', () => {
    for (const { nombre, sql } of migracionesMedidas()) {
      for (const tabla of nombresCreados(sql, 'table')) {
        expect(contiene(sql, `alter table ${tabla} enable row level security`), `${nombre}: ${tabla} sin enable RLS`).toBe(true)
        expect(contiene(sql, `alter table ${tabla} force row level security`), `${nombre}: ${tabla} sin force RLS`).toBe(true)
        expect(contiene(sql, `revoke all on ${tabla} from anon`), `${nombre}: ${tabla} sin revoke a anon`).toBe(true)
      }
    }
  })

  it('toda vista nueva evalúa la RLS de quien consulta y le revoca todo a anon', () => {
    // Sin security_invoker, una vista se evalúa con los permisos de quien la creó y se saltea
    // la RLS entera: es la forma clásica de abrir una tabla cerrada sin darse cuenta.
    for (const { nombre, sql } of migracionesMedidas()) {
      for (const vista of nombresCreados(sql, 'view')) {
        expect(contiene(sql, `create (or replace )?view ${vista} with \\(security_invoker = true\\)`), `${nombre}: ${vista} sin security_invoker`).toBe(true)
        expect(contiene(sql, `revoke all on ${vista} from anon`), `${nombre}: ${vista} sin revoke a anon`).toBe(true)
      }
    }
  })

  it('toda función nueva le revoca EXECUTE a public y a anon, en el mismo archivo', () => {
    for (const { nombre, sql } of migracionesMedidas()) {
      for (const funcion of nombresCreados(sql, 'function')) {
        expect(
          contiene(sql, `revoke execute on function ${funcion}\\([^)]*\\) from public, anon`),
          `${nombre}: ${funcion} sin revoke de execute`,
        ).toBe(true)
      }
    }
  })

  it('ninguna columna puede guardar una contraseña (R2, RF-502)', () => {
    // Del portal de una compañía se guardan URL y usuario, nunca la clave.
    const prohibidas = /\b\w*(password|passwd|contrasena|contraseña|clave|token|secret)\w*\s+(text|varchar|char|bytea|jsonb?)\b/i
    for (const { nombre, sql } of migracionesMedidas()) {
      expect(sinComentarios(sql), nombre).not.toMatch(prohibidas)
    }
  })
})

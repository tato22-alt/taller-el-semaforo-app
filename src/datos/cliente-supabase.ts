/* El único lugar del proyecto donde se crea el cliente de Supabase.
 *
 * Si un componente de ui/ necesita importar esto, la capa de datos está
 * incompleta: lo que falta es una función acá que devuelva tipos del dominio. */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { mal, type Resultado, bien } from '../dominio/resultado'

let cliente: SupabaseClient | null = null

/** Devuelve el cliente, o el fallo de configuración si faltan las variables.
 *
 * Se crea la primera vez que se usa, no al importar el módulo: si tirara al
 * importar, un `.env` incompleto rompería el build entero en vez de mostrar un
 * mensaje claro en pantalla. */
export function obtenerCliente(): Resultado<SupabaseClient> {
  if (cliente !== null) return bien(cliente)

  const url = import.meta.env.VITE_SUPABASE_URL
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || !anon) {
    return mal({
      tipo: 'sin_configurar',
      detalle: 'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Ver .env.example',
    })
  }

  cliente = createClient(url, anon)
  return bien(cliente)
}

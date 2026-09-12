/// <reference types="vite/client" />

/* Las dos variables que la app necesita. Tipadas para que falten en tiempo de
 * compilación y no en producción. Todo lo que empieza con VITE_ se hornea en el
 * bundle y queda visible en el navegador: acá no va nunca un secreto real. */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string | undefined
  readonly VITE_SUPABASE_ANON_KEY: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

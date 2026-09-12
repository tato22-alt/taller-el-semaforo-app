import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages sirve el sitio en un subpath, no en la raíz del dominio.
  // Sin esto, el HTML pide /assets/... y recibe un 404.
  base: '/taller-el-semaforo-app/',
  plugins: [react()],
  test: {
    // El dominio son funciones puras: no hace falta un DOM para probarlas.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})

# Ver las pantallas en un navegador, contra una base simulada

Scripts que abren la app compilada en un navegador de verdad, le contestan como si fueran la base
(con datos inventados) y tocan los botones. Sirven para ver una pantalla funcionar sin tocar la base
real. No corren con `npm test`: necesitan Playwright y Chromium instalados.

```
VITE_SUPABASE_URL=http://mock.local VITE_SUPABASE_ANON_KEY=falsa npx vite build --outDir /tmp/dist-mock
node verificar/plata.mjs /tmp/dist-mock /tmp/capturas
```

- `plata.mjs`: la spec 013 de `semaforo-base`. La pregunta de la plata y quién debe en Hoy, la pantalla
  La plata del taller, y el archivo de Recibidos en Importar, con y sin el permiso de ver la plata.

Las rutas de Playwright y de Chromium que traen son las del entorno en la nube donde se escribieron:
en otra máquina hay que cambiarlas.

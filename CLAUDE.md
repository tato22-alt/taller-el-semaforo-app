# El Semáforo — aplicación

Taller de chapa y pintura en Villa Gesell. Tres personas cargan datos: Luciano (dueño,
estudiante de desarrollo), su padre, y una administrativa.

**Regla madre:** la aplicación no debe convertir a las personas en cargadores de datos.
Cada campo que se pide cargar tiene que devolver más valor del esfuerzo que cuesta. Lo que
se puede derivar, se deriva.

El problema real no es "no tenemos un sistema". Es que hoy nadie puede contestar de memoria
qué autos hay, hace cuánto están, y quién debe plata.

---

## Alcance: tres pantallas

1. **Presupuesto** — ya existe y está en producción, en el repo `semaforo-presupuesto`. Ya
   migró de `localStorage` a Supabase en la rama `claude/conectar-base-datos`, sin mergear y
   sin verificar contra el Supabase real. Se muda a este repo recién cuando el tablero
   pruebe el stack.
2. **Tablero** — una fila por trabajo: patente destacada, vehículo, cliente, número, días
   desde que entró. Se usa parado, con el celular, al lado de un auto.
3. **Ficha** — un trabajo: sus conceptos, su historia, los presupuestos anteriores de ese
   mismo auto, y los pocos botones que registran hechos que no se derivan.

Nada más. Si algo no entra en esas tres, no entra. Defendé el alcance activamente: si suena
a "podría ser útil algún día", no va.

**Estado del modelo:** hoy la base sólo tiene presupuestos. El tablero arranca mostrando
presupuestos con sus días. Se vuelve semáforo de verdad cuando el modelo incorpore la plata.
No inventes columnas de datos que la base todavía no tiene.

---

## El contrato con la base

La base vive en otro repo: `tato22-alt/gestion-taller-sql-server`, rama
`claude/semaforo-taller-system-eroppo`. Su `.specify/memory/constitution.md` es vinculante
también acá.

**No hay backend.** Supabase expone el esquema como REST vía PostgREST. La base *es* la API.

Cuatro reglas que salen de ahí y no se negocian:

- **La app no recalcula lo que la base deriva.** Los totales salen de `vw_presupuestos`, no
  se suman en el navegador. Si hace falta un derivado que la base no da, eso es una tarea
  del repo del modelo: decilo, no lo calcules acá.
- **La app sí decide colores, prioridades y textos.** La base entrega magnitudes (días,
  montos, cantidades); interpretarlas es trabajo de la app. Esa frontera es el principio III.
- **Se lee de vistas, se escribe a tablas.** Las vistas de PostgREST son de sólo lectura
  salvo que tengan triggers `INSTEAD OF`, y no los tienen.
- **La numeración de presupuestos la asigna la base, nunca el cliente.** Si la app hace
  `max + 1`, vuelve el bug que ya tuvimos: dos pestañas sacan el mismo número y una pisa a
  la otra en silencio. Se pide por RPC o se asigna en el `INSERT`. Nunca del lado del navegador.

### Gotchas de PostgREST que ya nos van a morder

- **`NUMERIC` llega como string**, no como number — PostgREST lo serializa así a propósito
  para no perder precisión en el float de JS. `"importe": "15000.00"`. No hagas aritmética de
  plata en el navegador; formateá y mostrá. Si alguna vez hay que sumar del lado del cliente,
  es señal de que falta una vista.
- **`DATE` llega como `"2026-09-12"`**, y `new Date("2026-09-12")` lo parsea como medianoche
  **UTC**, que en Argentina (UTC-3) se muestra como el día anterior. Tratá las fechas de
  calendario como string, o parseálas a mano. `creado_en` y `modificado_en` son `TIMESTAMPTZ`
  y vienen con offset: ésos sí son seguros con `new Date()`.
- **RLS deniega en silencio.** Sin sesión, una lectura devuelve `[]` con HTTP 200, no un
  error. "Vacío" es ambiguo: distinguí siempre *no hay sesión* de *no hay filas*, o vas a
  mostrar "no hay trabajos" cuando en realidad se venció el token.
- **`supabase-js` no tira excepciones.** Devuelve `{ data, error }`. Un `error` ignorado es
  un `data` en `null` que revienta tres líneas más abajo, lejos de la causa.

### Credenciales

La clave *publishable* es pública por diseño: lo que protege los datos es RLS, que ya está
puesto y verificado (una llamada sin sesión devuelve 401). Va en `.env` como
`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

**Ojo con Vite:** todo lo que empiece con `VITE_` se hornea en el bundle y queda visible en
el navegador. Ahí adentro no va nunca una `service_role` ni ningún secreto real.

---

## Stack

Vite + React + TypeScript, compilado a estático, servido por GitHub Pages desde este mismo
repo. Vitest para los tests.

`strict: true` en el `tsconfig`, y sin `any`. Si un tipo no cierra, el problema es el
modelado, no el tipo.

Los tipos de la base no se escriben a mano: se generan con
`supabase gen types typescript --project-id osslhkvdclrbukjqwpnt` y se guardan en
`src/datos/tipos-base.ts`. Regeneralos cada vez que el otro repo agregue una migración.

**Este repo es la app:** `tato22-alt/taller-el-semaforo-app` (decidido el 2026-09-12). La
herramienta de presupuesto sigue en producción en `tato22-alt/semaforo-presupuesto` y se
mudará acá más adelante, no ahora.

**Gotcha de Pages:** el sitio se sirve en un subpath (`/taller-el-semaforo-app/`), así que un
router de history API tira 404 al refrescar una ruta profunda. Usá `HashRouter`, o el truco
de `404.html`. Decidilo una vez y dejalo escrito acá.

---

## Estructura y capas

```
src/
  dominio/     lógica pura. Sin React, sin supabase, sin fetch.
  datos/       única capa que conoce supabase. Devuelve tipos del dominio.
  ui/          componentes y pantallas. No conoce supabase.
  app.tsx
```

La regla es una sola y se puede verificar leyendo imports:

- `dominio/` no importa nada del proyecto. Funciones puras, testeables sin montar nada.
- `datos/` importa `dominio/`. Es el único lugar donde se crea el cliente de Supabase y el
  único que sabe cómo se llaman las tablas.
- `ui/` importa `dominio/` y `datos/`. **Nunca** `@supabase/supabase-js`.

Si un componente necesita importar el cliente de Supabase, la capa de datos está incompleta.

### Cómo se escribe

- **La lógica de negocio no vive en los componentes.** Un componente pinta y llama; no
  decide. La decisión de qué color es un trabajo vive en `dominio/semaforo.ts` y se testea
  sin renderizar nada.
- **Nombres del dominio, en español**, igual que el esquema: `trabajo`, `presupuesto`,
  `patente`, `cliente`, `siniestro`. Nada de `utils`, `helpers`, `manager`, `service`.
- **Archivos chicos.** Pasado el par de cientos de líneas, preguntate si no son dos cosas.
- **Los errores se manejan en el borde.** `datos/` traduce el `{ data, error }` de Supabase a
  algo que el llamador esté obligado a mirar — un `Resultado<T>` como unión discriminada
  sirve, porque TypeScript no te deja leer el dato sin chequear el caso de error primero.
- **Antes de agregar una dependencia, preguntá.** Cada una es superficie que hay que
  mantener y actualizar. Para un proyecto de tres pantallas, la respuesta suele ser que no.
- **Tests donde pagan:** las funciones puras de `dominio/` (normalización de patente,
  formato de moneda y fechas, la lógica del semáforo). Tests de componentes, sólo si algo se
  rompió dos veces.
- **Vocabulario del taller en la interfaz.** Trabajo, presupuesto, patente, siniestro,
  franquicia. Nunca vocabulario de software.

---

## Método de trabajo

SDD, igual que el repo del modelo: la spec precede al código. Las specs van en
`specs/00X-nombre/spec.md`.

- Si lo que se pide no está especificado, escribí la spec, confirmala, y recién ahí codeá.
- **Mejora continua de verdad:** si mientras escribís se nota que la spec está mal, o que hay
  un camino más simple, **pará y decilo**. Codear alrededor de un problema en silencio es la
  forma más cara de avanzar.
- Una tarea termina cuando **funciona y se vio funcionar**, no cuando el código está escrito.
  Al pedir que se pruebe algo, decí exactamente qué tocar y qué tendría que pasar.
- Luciano está en segundo año de desarrollo: explicá el *por qué* de una decisión técnica, no
  sólo el *qué*, y no escondas los trade-offs. Si hay dos caminos razonables, decí cuál
  elegirías y qué se pierde con el otro.

---

## Lo primero

No empieces migrando el presupuesto. Está en producción y su hoja de impresión está calibrada
contra el talonario de papel; tocarlo primero arriesga lo único que ya funciona.

**Tarea 1:** login con Supabase Auth + tablero leyendo presupuestos reales de la base. Es el
camino de datos más corto que prueba el stack entero de punta a punta — auth, RLS, PostgREST,
build y deploy.

Antes de codear, proponé la estructura del proyecto y esperá confirmación.

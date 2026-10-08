# El Semáforo — aplicación

Taller de chapa y pintura en Villa Gesell. Tres personas cargan datos: Luciano (dueño,
estudiante de desarrollo), su padre, y una administrativa.

**Regla madre:** la aplicación no debe convertir a las personas en cargadores de datos.
Cada campo que se pide cargar tiene que devolver más valor del esfuerzo que cuesta. Lo que
se puede derivar, se deriva.

El problema real no es "no tenemos un sistema". Es que hoy nadie puede contestar de memoria
qué autos hay, hace cuánto están, y quién debe plata.

---

## Alcance: dos módulos, cada uno con su frontera

El alcance se abrió una sola vez, el 2026-10-07, y de una forma precisa: **no "ahora son ocho
pantallas", sino un segundo módulo declarado** con su propia lista de lo que hace y lo que no.
Si el alcance se abre sin redefinirlo, el principio IX deja de poder decir no a nada.

### Módulo 1 — Presupuestos (spec 002)

1. **Presupuesto** — ya está, conectado a Supabase y en producción, y **vive en su propio
   repo** (`semaforo-presupuesto`). **No se muda acá** (decidido el 2026-09-13). Esta
   aplicación lo lee, no lo emite: emitir son cuatro escrituras encadenadas sin transacción,
   y esa lógica duplicada en dos aplicaciones termina comportándose distinto en cada una.
2. **Tablero** — hecho como prueba del stack (spec 003) y **cerrado: no se amplía**. La
   herramienta ya tiene historial con buscador y ficha interna; agrandar el tablero sería
   escribir lo mismo dos veces (spec 004 §3). Vuelve a crecer recién cuando la base tenga el
   estado operativo del auto, que es lo único que ninguna otra pieza muestra.
3. **Ficha** — en espera, por el mismo motivo. Marcar no concretado y particular/seguro ya lo
   hace la ficha interna de la herramienta.

### Módulo 2 — Cobranzas (spec 005)

Contesta en diez segundos **cuánto me deben, quién, desde cuándo, y qué tengo que hacer hoy
para cobrarlo**, con datos que ya están escritos en ARCA y en Gmail. Sus pantallas son las de
la spec 005 §6: **Cobranzas, Ficha de factura, Revisar, Ficha de compañía y Antes de emitir**,
más **Importar** (subir el CSV de ARCA), que entró con el plan de la fase 1, y nada más. Lo que este módulo no hace está en la spec 005 §10, y se defiende igual que el
resto.

Fuera de esos dos módulos no entra nada. Defendé el alcance activamente: si suena a "podría
ser útil algún día", no va.

**Estado del modelo:** hoy la base tiene presupuestos y, desde el 2026-10-08, las tablas de la
fase 1 de cobranzas (roles, fichas de compañía y el libro de ARCA). No inventes columnas de datos
que la base todavía no tiene: las de cobranzas se especifican en `specs/005-cobranzas/` (una sola
spec y un solo plan para todo el bloque) y se migran en `base/supabase/migrations/`.

---

## El contrato con la base

**La base vive en este mismo repo, bajo `base/`** (mudada el 2026-10-07 desde
`tato22-alt/semaforo-modelo-datos`, conservando sus 52 commits). Su
`base/.specify/memory/constitution.md` es vinculante para todo lo que hay acá adentro.

`base/` es un *subtree*, no una copia: mantiene la historia del repo de origen y se puede
sincronizar con él. **Las migraciones se escriben ahí, no en `src/`**, y se siguen aplicando a
mano en el editor SQL del panel de Supabase — tener el archivo en el repo no las despliega.

**Dónde manda el esquema (decidido el 2026-10-07).** El repo `semaforo-modelo-datos` —antes
`gestion-taller-sql-server`— **queda como histórico y no se toca más.** Toda migración nueva se
escribe en `base/supabase/migrations/` de este repo. Hay una sola razón y es la de siempre: dos
copias del mismo esquema terminan dejando de coincidir, y la que mande va a ser la que alguien
recuerde haber editado. Acá hay una sola.

Esto no quiere decir que no haya más migraciones: cobranzas (spec 005) necesita una docena de
tablas. Quiere decir que se escriben acá.

**No hay backend.** Supabase expone el esquema como REST vía PostgREST. La base *es* la API.
El robot de cobranzas (un Apps Script que lee Gmail, en `robot/`) no es un backend de la app:
es otro consumidor de la base, que escribe **evidencia** con su propio usuario y su propia RLS,
nunca con la `service_role` (spec 005 §3).

Cinco reglas que salen de ahí y no se negocian:

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
- **Esta app no escribe lo que es de la herramienta de presupuestos:** `trabajos`,
  `trabajo_items`, `clientes` y `vehiculos`, incluidas `no_concretado` y `origen`, que la
  herramienta ya marca desde su ficha interna (spec 004 §4). Los conceptos, el texto tal como
  se imprimió y los hechos sobre el trabajo tienen un solo dueño; si esta app también los
  escribiera, habría dos implementaciones de lo mismo comportándose distinto. Lo que esta app
  escribe son tablas del módulo de cobranzas, y sólo las que figuran por nombre en
  `src/arquitectura.test.ts` (hoy `importacion` y `comprobante`, desde la pantalla Importar). Una
  tabla nueva que la app escriba se agrega a esa lista en el mismo commit que la escribe, no
  antes: un test que se afloja por adelantado no protege nada.

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
`src/datos/tipos-base.ts`. **Regeneralos cada vez que se agregue una migración a
`base/supabase/migrations/`** — ahora que están en el mismo repo, un cambio de esquema y el
código que lo usa pueden ir en el mismo commit, que es la mitad del motivo de haberlos juntado.
**Hoy el archivo es provisorio:** se escribió a partir de las migraciones porque el generador no
corre en la máquina de Luciano. Está marcado así en su encabezado; cuando el generador corra,
gana el generado.

**Este repo es la app y la base:** `tato22-alt/taller-el-semaforo-app`. La app en la raíz,
el modelo de datos en `base/`. La herramienta de presupuesto **no se muda**: sigue en
producción en `tato22-alt/semaforo-presupuesto` y se queda ahí (decidido el 2026-09-13).

**Gotcha de Pages:** el sitio se sirve en un subpath (`/taller-el-semaforo-app/`), así que un
router de history API tira 404 al refrescar una ruta profunda. **Decidido: ruteo por hash**,
escrito a mano en `src/dominio/ruta.ts` — 25 líneas y una dependencia menos que `HashRouter`.
No necesita el archivo `404.html` ni duplicar la app, y la URL con `#` no le molesta a nadie.
El `base` de Vite va igual: `/taller-el-semaforo-app/`.

**Estilos: CSS plano, sin Tailwind** (decidido el 2026-09-12). Una dependencia menos, y
coincide con la herramienta de presupuesto, que es CSS escrito a mano con la hoja de impresión
calibrada contra el talonario de papel: cuando se mude acá no hay que traducir nada.

---

## Estructura y capas

```
src/             LA APP
  dominio/     lógica pura. Sin React, sin supabase, sin fetch.
  datos/       única capa que conoce supabase. Devuelve tipos del dominio.
  ui/          componentes y pantallas. No conoce supabase.
  app.tsx
specs/           las specs de la app
robot/           el Apps Script de cobranzas (fase 0; todavía no existe)
base/            LA BASE (subtree, con su propia historia)
  supabase/migrations/   el esquema. 23 migraciones
  specs/                 las specs del modelo de datos
  docs/                  diccionario de datos
  .specify/memory/constitution.md   LOS DIEZ PRINCIPIOS
```

**Nada de `src/` importa nada de `base/`.** `base/` es SQL y documentos; el puente entre los
dos es `src/datos/tipos-base.ts`, generado desde el esquema.

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

### Autoría de los commits

Los commits van a nombre de Luciano y **no llevan ninguna línea de atribución a Claude**. Dos
cosas distintas lo garantizan, y conviene no confundirlas:

- **Las líneas del mensaje** (`Co-Authored-By` y el link a la sesión) las apaga
  `.claude/settings.json`, que está versionado: `attribution` con `commit` y `pr` en vacío y
  `sessionUrl` en `false`. Vale en cualquier máquina que clone el repo.
- **El autor y la firma del commit** salen de git, no de Claude. El contenedor de una sesión web
  arranca con autor `Claude <noreply@anthropic.com>` y firma con una clave de Claude; si el autor
  es Luciano y la firma es de otro, GitHub muestra **Unverified**, peor que no tener nada.

  **Lo resuelven variables del entorno de la nube "Predeterminado"** (decidido el 2026-10-08), que
  valen para todos los repos de la cuenta y le ganan a la configuración del contenedor:
  `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME` y `GIT_COMMITTER_EMAIL` con el
  nombre y el mail de la cuenta de GitHub de Luciano, y `GIT_CONFIG_COUNT=1`,
  `GIT_CONFIG_KEY_0=commit.gpgsign`, `GIT_CONFIG_VALUE_0=false` para no firmar. Las aplica git, así
  que no dependen de que Claude se acuerde de nada.

  **Antes del primer commit de cada sesión, mirá `git var GIT_AUTHOR_IDENT`.** Si dice Claude, las
  variables no están cargadas: hay que cargarlas en el entorno y, para esa sesión, correr
  `git config user.name "Luciano"`, `git config user.email "<el mail de su cuenta de GitHub>"` y
  `git config commit.gpgsign false`.

  Los commits quedan **sin firma**, que es el estado normal de la enorme mayoría de los commits
  de GitHub: no muestran badge ni advertencia. Para el "Verified" verde hace falta firmar con una
  clave propia de Luciano, y eso sólo se hace desde su máquina: la clave privada no va acá.

---

## Por dónde seguir

El orden de trabajo vive en `ESTADO.md`, no acá: este archivo dice cómo se trabaja, aquél qué
toca ahora. La Tarea 1 —login + tablero leyendo presupuestos reales— está hecha y se vio
funcionar el 2026-10-07.

Lo que no cambia: **no se empieza tocando el presupuesto.** Está en producción y su hoja de
impresión está calibrada contra el talonario de papel; tocarlo arriesga lo único que ya
funciona.

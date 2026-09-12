# Estado del proyecto — dónde está todo

Punto de entrada cuando volvés. Misma convención que el repo del modelo. Si esto y el código
se contradicen, gana el código.

**Fecha:** 2026-09-12 · **Rama de trabajo:** `claude/presupuesto-app-limits-dea467`

---

## Las tres piezas

El sistema vive en tres repositorios. Esto es lo que hay en cada uno, medido, no supuesto.

| Repo | Qué es | Estado real |
|---|---|---|
| **`gestion-taller-sql-server`**<br>rama `claude/semaforo-taller-system-eroppo` | La base de datos. **Es también la API**, vía PostgREST | ✅ **Funcionando y verificado.** 4 tablas, 2 vistas, 6 funciones, 0 triggers, 15 migraciones corridas. 57/57 verificaciones del QA. RLS activa y forzada, `anon` revocado. Numeración desde el 16000, imposible de repetir. **La base está vacía**, esperando la primera carga real |
| **`semaforo-presupuesto`** | La herramienta de presupuestos, **en producción** | 🟡 **Funciona en producción** en `localStorage`. En la rama `claude/conectar-base-datos` ya está conectada a Supabase (login, numeración por RPC, lectura y escritura contra las tablas), pero **sin mergear y sin verificar contra el Supabase real**: se probó con Playwright contra un mock |
| **`taller-el-semaforo-app`**<br>(este repo) | **La aplicación.** Decidido el 2026-09-12 | 🔴 **Verde.** Tiene la documentación ordenada y un andamiaje de Next.js que ya no corresponde al stack decidido (Vite). Cero código útil todavía |

---

## Seguridad — qué está resuelto y qué no

Conviene separarlo, porque es fácil creer que falta algo que ya está.

**✅ Resuelto, y verificado en el código de las migraciones:**

- RLS **activada y forzada** (`force row level security`) en `clientes`, `vehiculos`,
  `trabajos` y `trabajo_items`.
- Las políticas son **solo para el rol `authenticated`**. El rol `anon` no tiene ninguna.
- `revoke all` explícito sobre `anon`, incluidas las secuencias: sin sesión no se lee, no se
  escribe y no se piden números.
- Las vistas usan `security_invoker = true`, así que evalúan la RLS de quien consulta y no de
  quien las creó. Una vista mal configurada es la forma clásica de saltearse la RLS sin
  darse cuenta; acá está bien.
- Verificado con login real de punta a punta: 8/8 en `verificar-acceso.html`.
- La `anon key` es pública por diseño y eso **no es un agujero**: lo que protege los datos es
  la RLS, no esconder la clave.

**🔴 Pendiente, y es lo único realmente expuesto hoy:**

- Las credenciales del proyecto **Insforge** anterior (project ID, app key, URL) siguen
  legibles en el historial de git de este repo, en el commit `6c5252b`. Se sacaron del
  archivo, pero borrar un archivo no borra la historia.
- **Qué hacer:** entrar a Insforge y **borrar ese proyecto**. Es lo más rápido y lo más
  definitivo: con el proyecto borrado, la clave no abre nada y reescribir la historia de git
  deja de ser necesario. Cinco minutos, y es tarea tuya, no mía.

---

## El orden de trabajo

Uno por vez, y cada uno termina cuando **se vio funcionar**, no cuando está escrito.

| # | Qué | Quién | Por qué en este orden |
|---|---|---|---|
| 0 | **Borrar el proyecto Insforge** | Tato | Es el único agujero real y cuesta cinco minutos |
| 1 | **Ordenar este repo:** retirar el andamiaje de Next.js e Insforge, armar Vite + React + las tres capas | Claude, con la estructura confirmada antes de codear | Un repo cuyo README no coincide con su código es lo primero que se nota al abrirlo |
| 2 | **Login + tablero** leyendo `vw_presupuestos` | Claude | Es la Tarea 1 del `CLAUDE.md`: el camino de datos más corto que prueba auth, RLS, PostgREST, build y deploy de punta a punta |
| 3 | **Verificar la página de presupuesto** contra el Supabase real y mergear | Tato abre, Claude corrige | Independiente de 1 y 2. No se muda nada sin esto |
| 4 | **Mudar el presupuesto a este repo** | Claude | Recién cuando el tablero probó el stack. Es lo único en producción: se toca último |
| 5 | **Ficha + botón de "no concretado"** | Claude | La columna ya existe en la base y nadie la escribe. Un botón desbloquea la tasa de conversión |
| 6 | **Vistas de derivación** en el repo del modelo | Spec allá | Conversión, mix mano de obra, ticket promedio. Cero carga extra. Ver `specs/002-alcance/spec.md` §3.2 |

**Lo que NO se hace todavía:** gráficos (hasta seis meses de datos reales), facturas y cobros
(son varias tablas y una spec del repo del modelo), fotos, IA.

---

## Dónde está cada cosa en este repo

```
CLAUDE.md                        Contexto y reglas de esta app. Se lee al inicio de cada sesión
ESTADO.md                        Este archivo
.specify/memory/constitution.md  Puntero: la constitución vinculante vive en el repo del modelo
specs/README.md                  Cómo se trabaja con SDD y cómo se revisa una spec
specs/002-alcance/spec.md        EL ALCANCE VIGENTE: los límites y qué se puede derivar
specs/001-mvp-gestion/spec.md    Reemplazada. Se conserva por el razonamiento sobre límites
app/ components/ lib/            Andamiaje de Next.js — se retira en el paso 1
```

---

## Decisiones abiertas

| Qué | Recomendación |
|---|---|
| ¿Se rearma como Vite o se sigue sobre el `index.html` que funciona? | Rearmar **acá** (repo nuevo, sin nada en producción) y dejar el `index.html` intacto en su repo hasta el paso 4 |
| `HashRouter` o el truco de `404.html` | `HashRouter`: una línea, sin archivos extra, y para tres pantallas la URL fea no molesta a nadie |
| ¿Qué pasa con la URL pública del presupuesto cuando se mude? | La de hoy (`/semaforo-presupuesto/`) está en uso. Conviene dejar una redirección antes de apagarla |

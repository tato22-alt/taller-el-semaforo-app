# Estado del proyecto — dónde está todo

Punto de entrada cuando volvés. Misma convención que el repo del modelo. Si esto y el código
se contradicen, gana el código.

**Fecha:** 2026-10-01 · **Rama de trabajo:** `claude/presupuesto-app-limits-dea467`

---

## Las piezas

El sistema vivía en tres repositorios. **Desde el 2026-10-07 son dos:** la base se mudó a este
repo, bajo `base/`, conservando sus 52 commits. Esto es lo que hay en cada pieza, medido, no
supuesto.

| Repo | Qué es | Estado real |
|---|---|---|
| **`base/`** en este repo<br>(subtree de `gestion-taller-sql-server`) | La base de datos. **Es también la API**, vía PostgREST | ✅ **Funcionando y verificado.** 4 tablas, 2 vistas, 0 triggers, **19 migraciones** y 7 features especificadas. 57/57 verificaciones del QA. RLS activa y forzada, `anon` revocado. **Vacía y confirmada vacía** el 2026-09-13: cero presupuestos. El talonario de papel terminó en el 15999 y no se emitió ninguno más, así que el 16000 sale limpio y **no hay que ajustar la numeración** |
| **`semaforo-presupuesto`** | La herramienta de presupuestos, **en producción**. Se queda acá: no se muda a la app | ✅ **Conectada y en uso.** `main` (commit `2d1374c`) emite contra Supabase: login real, numeración por `fn_proximo_numero_presupuesto()`, y lectura/escritura contra `clientes`/`vehiculos`/`trabajos`/`trabajo_items`/`vw_presupuestos`. De `localStorage` sólo queda la clave de sesión |
| **`taller-el-semaforo-app`**<br>(este repo, la raíz) | **La aplicación.** Decidido el 2026-09-12 | 🟡 **Esqueleto en pie, y nada más.** Vite + React + TypeScript estricto, las tres capas, **29 tests en verde**, 0 vulnerabilidades y el workflow de Pages. **Cero lecturas y cero escrituras contra la base**: las dos pantallas son carteles que explican lo que todavía no hacen. Verificado corriéndolo, no leyéndolo |

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
| 1 | ~~**Ordenar este repo:** retirar el andamiaje de Next.js e Insforge, armar Vite + React + las tres capas~~ | ✅ **Hecho** | Un repo cuyo README no coincide con su código es lo primero que se nota al abrirlo |
| 1.5 | ~~**Llevar todo esto a `main`**~~ | ✅ **Hecho el 2026-10-07** | `main` tenía la app vieja de Next + Insforge y el App Key a la vista. Ahora tiene esto, y el deploy corre por primera vez |
| 2 | **Contestar las cuatro preguntas que bloquean** la spec 005 (P1 a P4) | Tato | Son choques con decisiones ya escritas. Hasta que estén resueltos, cualquier código de cobranzas se construye sobre un alcance que todavía no se abrió |
| 3 | **Fase 0 de cobranzas:** extender el Apps Script que ya baja los PDF para que guarde `gmail_message_id`, remitente, asunto y **texto extraído** | Claude, con tu cuenta | Ya funciona. Es lo único que se puede avanzar sin tocar la base, y es lo que convierte los doce parsers en código testeado contra 21 meses en vez de contra una muestra |
| 4 | **Fase 1:** el libro de ARCA y las fichas de compañía (A1, A5 datos) | Spec allá, pantalla acá | Sin comprobantes no hay a qué imputar. Es la fase que no depende de ningún parser |
| 5 | **Fase 2:** los parsers y las imputaciones (A2, A3) + la pantalla **Revisar** | Claude | El núcleo. Acá entra la plata |
| 6 | **Fase 3:** el semáforo y las tareas (A8, A7) | Claude | Es donde se contesta la pregunta de los diez segundos. No estrena tablas: son vistas |
| 7 | **Fase 4:** antes de emitir (A4, A5, A6) | Claude | Previene; no recupera. Por eso va después |
| 8 | **Fase 5:** banco y libro de retenciones (A9, A10) | Enmienda primero | A9 necesita enmendar el principio IX (ver spec 005 C2) |

**Lo que queda en espera, y no se perdió:** login + tablero leyendo `vw_presupuestos`, el
resumen del mes de la spec 004, y las vistas de derivación de la spec 002 §3.2. Siguen siendo
correctas; **cobranzas se puso adelante** porque es lo único del sistema que no pide cargar
ningún dato nuevo: el dato ya está escrito en ARCA y en Gmail.

**Lo que NO se hace:** mudar la herramienta de presupuesto a este repo — vive en su repo y
esta app no emite presupuestos, sólo los lee.

**Lo que NO se hace todavía:** gráficos (hasta seis meses de datos reales), fotos, IA sobre
los mails.

**Lo que cambió de lugar (decisión de Luciano, 2026-10-01):** facturas y cobros ya **no** están
en la lista de "todavía no". Pasaron a ser el MVP, y están especificados en
[`specs/005-cobranzas/spec.md`](./specs/005-cobranzas/spec.md). El argumento es que son el
único hecho del sistema que no cuesta carga: los otros dos candidatos —marcar no concretado y
las fechas de ingreso y entrega— piden que alguien toque un botón; éste sale de 470
comprobantes que ya están escritos en ARCA y en Gmail.

---

## Dónde está cada cosa en este repo

```
CLAUDE.md                        Contexto y reglas de esta app. Se lee al inicio de cada sesión
ESTADO.md                        Este archivo
.specify/memory/constitution.md  Puntero a base/.specify/memory/constitution.md
base/                            LA BASE DE DATOS (subtree, 52 commits propios)
  .specify/memory/constitution.md  Los diez principios. Vinculantes para todo el repo
  supabase/migrations/             El esquema: 19 migraciones
  specs/                           Las 7 specs del modelo de datos
  docs/diccionario-datos.md        Qué es cada tabla y cada columna
specs/README.md                  Cómo se trabaja con SDD y cómo se revisa una spec
specs/002-alcance/spec.md        EL ALCANCE VIGENTE: los límites y qué se puede derivar
specs/003-tablero/spec.md        El tablero. La spec 004 propone retirarlo
specs/004-frontera/spec.md       La frontera entre los tres repos. Cinco decisiones abiertas
specs/005-cobranzas/spec.md      COBRANZAS: A1 a A10, el modelo, y 15 preguntas para vos
index.html                       El único HTML; Vite le inyecta el bundle
vite.config.ts                   base: '/taller-el-semaforo-app/' para el subpath de Pages
.github/workflows/pages.yml      Build, tests y publicación. Si los tests fallan, no publica
src/
  dominio/                       Funciones puras: plata, fechas, patentes, rutas. Con tests
  datos/                         La única capa que conoce Supabase
  ui/                            Pantallas. No conocen Supabase
  arquitectura.test.ts           Verifica la regla de las capas leyendo los imports
```

---

## Decisiones abiertas

| Qué | Recomendación |
|---|---|
| ~~¿Se rearma como Vite?~~ | **CERRADO.** Rearmado acá. El `index.html` del presupuesto queda intacto en su repo hasta el paso 4 |
| ~~`HashRouter` o `404.html`~~ | **CERRADO.** Ruteo por hash, escrito a mano en `dominio/ruta.ts`: 25 líneas y una dependencia menos |
| **Las cuatro de la spec 005 que bloquean** | P1 a P4: el principio VI, la conciliación bancaria, el alcance de tres pantallas, y RF-601. Están en [`specs/005-cobranzas/spec.md`](./specs/005-cobranzas/spec.md) §8 y §9 |
| **La planilla de la conciliación manual** | Si existe, es el juego de datos de prueba: es con lo que se verifica que el sistema llegue a tus $171 M al peso (P12) |
| **Los umbrales del semáforo** | A partir de cuántos días un presupuesto está "frío". Es decisión de negocio, no técnica |
| ¿Qué pasa con la URL pública del presupuesto cuando se mude? | La de hoy (`/semaforo-presupuesto/`) está en uso. Conviene dejar una redirección antes de apagarla |

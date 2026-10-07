# Estado del proyecto — dónde está todo

Punto de entrada cuando volvés. Si esto y el código se contradicen, gana el código.

**Fecha:** 2026-10-07 · **Rama de trabajo:** `claude/zen-hawking-3cmq54` · **`main`:** `b7bf211`

---

## Las piezas

El sistema vivía en tres repositorios. **Desde el 2026-10-07 son dos:** la base se mudó a este
repo, bajo `base/`, conservando sus 52 commits. Esto es lo que hay en cada pieza, medido, no
supuesto.

| Pieza | Qué es | Estado real |
|---|---|---|
| **`base/`** en este repo<br>(subtree de `gestion-taller-sql-server`) | La base de datos. **Es también la API**, vía PostgREST | ✅ **Funcionando y verificada.** 4 tablas, 2 vistas, 0 triggers, **19 migraciones**. RLS activa y forzada, `anon` revocado. **Vacía**: cero presupuestos. El talonario de papel terminó en el 15999, así que el 16000 sale limpio |
| **`semaforo-presupuesto`** | La herramienta de presupuestos, **en producción**. Se queda en su repo | ✅ **Conectada y en uso.** Emite, numera con `fn_proximo_numero_presupuesto()`, tiene historial con buscador, y su ficha interna escribe `no_concretado` y `origen` |
| **La app** (la raíz de este repo) | Login y tablero | 🟡 **Lee la base de punta a punta.** Login contra Supabase Auth y tablero leyendo `vw_presupuestos`, **probado el 2026-10-07**. **Cero escrituras**, y un test lo verifica. 44 tests en verde. **El sitio público todavía no publica** (ver abajo) |

---

## Lo que la app hace hoy, y dónde se aparta de su spec

El tablero (spec 003) **se cerró como prueba del stack y no se amplía** (decisión del
2026-10-07): ya probó auth, RLS, PostgREST y el build, y agrandarlo duplicaría el historial de la
herramienta (spec 004 §3).

Tres cosas del código no coinciden con la spec 003. Quedan escritas para que no se lean como
decisiones:

| Qué dice la spec | Qué hace el código | Qué hacer |
|---|---|---|
| Mostrar la **fecha**, no los días, hasta que la base derive los días (principio III) | Calcula los días en el navegador (`diasDesde` en `dominio/fechas.ts`) | O vuelve a mostrar la fecha, o se especifica `dias_desde_presupuesto` en una vista de `base/`. **Pendiente de decisión** |
| RF-309: no mostrar los no concretados | No los filtra | Menor: con la base vacía no hay ninguno. Si el tablero no se amplía, no vale la pena |
| Criterio 8: el sitio publicado carga | Pages todavía no está prendido | Tarea tuya, ver abajo |

Además: `src/datos/tipos-base.ts` está **escrito a mano a partir de las migraciones**, marcado
PROVISORIO, porque `supabase gen types` no corre en la máquina de Luciano. Cuando corra, gana el
generado.

---

## Seguridad — qué está resuelto y qué no

**✅ Resuelto, y verificado en el código de las migraciones:**

- RLS **activada y forzada** en `clientes`, `vehiculos`, `trabajos` y `trabajo_items`.
- Políticas **sólo para `authenticated`**; `anon` no tiene ninguna y tiene `revoke all`,
  incluidas las secuencias.
- Vistas con `security_invoker = true`.
- La `anon key` es pública por diseño y **no es un agujero**: lo que protege es la RLS.

**🔴 Pendiente:**

1. **Los registros públicos de Supabase Auth.** Las políticas son `to authenticated using (true)`:
   **cualquier usuario con sesión puede leer y escribir todo.** Si en el panel está prendido
   *Allow new users to sign up*, cualquiera puede tomar la clave pública del bundle de la
   herramienta —que ya está publicada—, registrarse, y quedar adentro. **Va antes de prender
   Pages.** Panel → Authentication → Sign In / Providers → apagar *Allow new users to sign up*.
   Los tres usuarios se crean a mano desde Authentication → Users. *Desde este entorno no se
   puede ver cómo está configurado: hay que mirarlo.*
2. **Las credenciales de Insforge** siguen legibles en el historial de git (commit `6c5252b`).
   Borrar ese proyecto en Insforge las vuelve inútiles sin reescribir la historia.

---

## El orden de trabajo

Uno por vez, y cada uno termina cuando **se vio funcionar**, no cuando está escrito.

| # | Qué | Quién | Por qué en este orden |
|---|---|---|---|
| 0 | **Apagar los registros públicos en Supabase Auth y borrar el proyecto Insforge** | Luciano | Son los dos agujeros reales y cuestan minutos |
| 1 | ~~Ordenar este repo: Vite + React + las tres capas~~ | ✅ Hecho | |
| 1.5 | ~~Llevar todo a `main`~~ | ✅ Hecho el 2026-10-07 | |
| 1.6 | ~~Login + tablero leyendo `vw_presupuestos`~~ | ✅ **Hecho y probado el 2026-10-07** | El camino de datos más corto que prueba el stack entero |
| 1.7 | ~~Las cuatro preguntas que bloqueaban la spec 005 (P1 a P4)~~ | ✅ **Contestadas el 2026-10-07** | Ver la spec 005 §8 y §9 |
| 2 | **Prender Pages** | Luciano | Settings → Pages → Source: *GitHub Actions*. Settings → Secrets and variables → Actions → **Variables**: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. **Después del paso 0** |
| 3 | **Pasar la planilla de la conciliación manual** (P12) | Luciano | Es el juego de datos de prueba: sin ella, "llega a los $171 M al peso" no se puede verificar contra nada |
| 4 | **Fase 1 de cobranzas:** spec en `base/specs/` del libro de ARCA (A1) y las fichas de compañía (A5 datos), después la migración | Claude, spec → tu OK → plan → tu OK | **Va antes que la fase 0** (decisión del 2026-10-07): no depende de nada y da el total contra el que se mide todo lo demás |
| 5 | **Fase 0:** extender el Apps Script para que guarde `gmail_message_id`, remitente, asunto y **texto extraído**. El código vive en `robot/` de este repo | Claude, con tu cuenta | Es el corpus contra el que se escriben los doce parsers |
| 6 | **Fase 2:** parsers e imputaciones (A2, A3) + pantalla **Revisar** | Claude | El núcleo. Acá entra la plata |
| 7 | **Fase 3:** el semáforo y las tareas (A8, A7) | Claude | No estrena tablas: son vistas |
| 8 | **Fase 4:** antes de emitir (A4, A5, A6) | Claude | Previene; no recupera |
| 9 | **Fase 5:** banco y libro de retenciones (A9, A10) | **Enmienda del principio IX primero** | A9 es conciliación bancaria |

**Lo que queda en espera, y no se perdió:** el resumen del mes de la spec 004, y las vistas de
derivación de la spec 002 §3.2.

**Lo que NO se hace:** mudar la herramienta de presupuesto a este repo; ampliar el tablero
(buscador, ficha, botones de no concretado u origen: eso ya lo tiene la herramienta).

**Lo que NO se hace todavía:** gráficos, fotos, IA sobre los mails.

---

## Dónde está cada cosa en este repo

```
CLAUDE.md                        Contexto y reglas de esta app. Se lee al inicio de cada sesión
ESTADO.md                        Este archivo
.specify/memory/constitution.md  Puntero a base/.specify/memory/constitution.md
base/                            LA BASE DE DATOS (subtree, 52 commits propios)
  .specify/memory/constitution.md  Los diez principios (v3.0.1). Vinculantes para todo el repo
  supabase/migrations/             El esquema: 19 migraciones
  specs/                           Las specs del modelo de datos
  docs/diccionario-datos.md        Qué es cada tabla y cada columna
specs/README.md                  Cómo se trabaja con SDD y el estado de cada spec
specs/002-alcance/spec.md        Los límites del módulo de presupuestos y qué se puede derivar
specs/003-tablero/spec.md        El tablero. Cerrada como prueba del stack
specs/004-frontera/spec.md       La frontera entre la herramienta, la base y esta app
specs/005-cobranzas/spec.md      COBRANZAS: el segundo módulo. A1 a A10, el modelo, las preguntas
robot/                           (todavía no existe) El Apps Script de la fase 0
.github/workflows/pages.yml      Build, tests y publicación. Si los tests fallan, no publica
src/
  dominio/                       Funciones puras: plata, fechas, patentes, rutas. Con tests
  datos/                         La única capa que conoce Supabase
  ui/                            Pantallas. No conocen Supabase
  arquitectura.test.ts           Verifica las capas y que la app no escriba
```

---

## Decisiones abiertas

| Qué | Recomendación |
|---|---|
| **Los días del tablero se calculan en el navegador** | Volver a mostrar la fecha: es un cambio de tres líneas y no pide migración. Los días entran cuando haya una vista que los derive |
| **P5 a P16 de la spec 005** | No bloquean la fase 1. Las que tocan su modelo (P8, P9, P10, P11) se contestan antes de aprobar su spec; **P16** (¿lo que escribe el robot suma sin confirmación?) antes de la fase 2 |
| **Los umbrales del semáforo** | Decisión de negocio, no técnica. Se necesita recién en la fase 3 |
| **La planilla de la conciliación manual** | Es el paso 3 de arriba |

## Decisiones cerradas el 2026-10-07

| Qué | Decisión |
|---|---|
| ¿Qué pasa con el tablero? | Queda como está, cerrado como prueba del stack. No se amplía |
| P1 — ¿el robot que escribe evidencia viola el principio VI? | No. Escrito como aclaración en la constitución, v3.0.1 |
| P2 — ¿se enmienda el principio IX para la conciliación bancaria? | Todavía no. Se decide al llegar a la fase 5 |
| P3 — ¿se abre el alcance de tres pantallas? | Sí, como **segundo módulo declarado**: Cobranzas, con su propia frontera. Escrito en el `CLAUDE.md` |
| P4 — RF-601 | Se reemplaza por "la app no escribe lo que es de la herramienta". El test sigue diciendo "no escribe nada" hasta el commit de la primera escritura de cobranzas |
| ¿Dónde vive el Apps Script? | En `robot/`, en este repo |
| ¿Fase 0 o fase 1 primero? | Fase 1 |
| Los commits de `main` a nombre de Claude | Se quedan como están: reescribir `main` cuesta más de lo que arregla. De acá en adelante, a nombre de Luciano y sin firma |

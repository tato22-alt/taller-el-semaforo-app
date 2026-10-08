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
| **`base/`** en este repo<br>(subtree de `gestion-taller-sql-server`) | La base de datos. **Es también la API**, vía PostgREST | ✅ **Funcionando y verificada.** 4 tablas, 2 vistas, 0 triggers, **19 migraciones**. RLS activa y forzada, `anon` revocado. **Ya tiene presupuestos reales**, emitidos desde la herramienta (visto el 2026-10-08 en el sitio publicado). El talonario de papel terminó en el 15999; la numeración digital arranca en el 16000 |
| **`semaforo-presupuesto`** | La herramienta de presupuestos, **en producción**. Se queda en su repo | ✅ **Conectada y en uso.** Emite, numera con `fn_proximo_numero_presupuesto()`, tiene historial con buscador, y su ficha interna escribe `no_concretado` y `origen` |
| **La app** (la raíz de este repo) | Login y tablero | 🟡 **Lee la base de punta a punta.** Login contra Supabase Auth y tablero leyendo `vw_presupuestos`, **probado el 2026-10-07**. **Cero escrituras**, y un test lo verifica. 44 tests en verde. **Publicada en https://tato22-alt.github.io/taller-el-semaforo-app/** desde el 2026-10-08: Luciano entró desde el sitio y vio los presupuestos reales |

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
| RF-309: no mostrar los no concretados | No los filtra | **Ahora que hay datos, se nota:** los que la herramienta marcó como no concretados aparecen igual. Pendiente de decisión, junto con los días |
| Criterio 8: el sitio publicado carga | ✅ Cumplido el 2026-10-08 | |

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

**✅ Cerrado el 2026-10-08:**

1. **Los registros públicos de Supabase Auth, apagados.** Importaba porque las políticas son
   `to authenticated using (true)`: con el registro abierto, cualquiera podía crearse una cuenta
   y leer todo. Revisada la lista de usuarios: **son tres y son los del taller**, así que nadie
   entró por ahí. Las cuentas nuevas se crean a mano desde Authentication → Users.
2. **Insforge, sin proyecto.** Ninguna de las tres cuentas de Luciano tiene un proyecto, y la
   dirección del proyecto viejo no muestra nada. La clave que quedó en el historial
   (commit `6c5252b`) no abre nada. No se reescribe la historia.

**🟠 Pendiente, antes de que entre cobranzas** (detalle en la
auditoría del 2026-10-07, que está fuera del repo hasta contestar N3):

3. **H5 — un presupuesto numerado se puede borrar en dos pasos.** La política de borrado sólo
   deja borrar trabajos sin número, pero el `UPDATE` de `numero_presupuesto` a nulo está
   permitido; después, el `DELETE` también. El número queda libre y el presupuesto emitido
   desaparece. Se arregla con una regla de integridad (rechazar que un número ya puesto cambie),
   con su spec chica. *Leído en las migraciones, no probado contra la base.*
4. **H6 — el usuario robot heredaría acceso total.** Se resuelve con roles, en la primera
   migración de cobranzas (plan, D2). Hasta entonces, **no crear el usuario `robot@`**.

---

## El orden de trabajo

Uno por vez, y cada uno termina cuando **se vio funcionar**, no cuando está escrito.

| # | Qué | Quién | Por qué en este orden |
|---|---|---|---|
| 0 | ~~Apagar los registros públicos en Supabase Auth y borrar el proyecto Insforge~~ | ✅ **Hecho el 2026-10-08** | Eran los dos agujeros reales |
| 1 | ~~Ordenar este repo: Vite + React + las tres capas~~ | ✅ Hecho | |
| 1.5 | ~~Llevar todo a `main`~~ | ✅ Hecho el 2026-10-07 | |
| 1.6 | ~~Login + tablero leyendo `vw_presupuestos`~~ | ✅ **Hecho y probado el 2026-10-07** | El camino de datos más corto que prueba el stack entero |
| 1.7 | ~~Las cuatro preguntas que bloqueaban la spec 005 (P1 a P4)~~ | ✅ **Contestadas el 2026-10-07** | Ver la spec 005 §8 y §9 |
| 2 | ~~Prender Pages~~ | ✅ **Hecho y visto el 2026-10-08** | Source en *GitHub Actions*, las dos variables cargadas, corrida #5 en verde. Cada push a `main` publica solo, y sólo si pasan los tests |
| 3 | **Pasar la planilla de la conciliación manual** (P12) | Luciano | Es el juego de datos de prueba: sin ella, "llega a los $171 M al peso" no se puede verificar contra nada |
| 4 | **Fase 1 de cobranzas:** contestar **N10** (CLI de Supabase) —N1 ya está—, aprobar el plan de cobranzas, y recién ahí las migraciones M1 a M4 y la pantalla Importar. La spec y el plan del bloque van en `specs/005-cobranzas/`, no en `base/specs/` | Luciano decide, Claude construye | **Va antes que la fase 0** (decisión del 2026-10-07): no depende de nada y da el total contra el que se mide todo lo demás |
| 5 | **Fase 0:** extender el Apps Script para que guarde `gmail_message_id`, remitente, asunto y **texto extraído**. El código vive en `robot/` de este repo, **sin datos reales** | Claude, con tu cuenta. **Antes: N3** (repo público y datos de terceros) | Es el corpus contra el que se escriben los doce parsers |
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
| **N1 y N3 a N10 del plan** | Cada una dice qué bloquea (plan §7). Las primeras: **N1** antes de M3, **N10** antes de M1, **N3** antes de la fase 0 |
| **P5 a P15 de la spec 005** | No bloquean la fase 1. Las que tocan su modelo (P8, P9, P10, P11) se contestan antes de aprobar las migraciones de la fase 1 |
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
| P16 / N2 — ¿el robot escribe imputaciones? | No. Escribe `aviso_linea` y una vista hace el cruce exacto con el comprobante (plan, D4). Lo que decide una persona va en `imputacion` |
| ¿Dónde viven la spec y el plan de cobranzas? | En `specs/005-cobranzas/`, una sola vez. No se duplican en `base/specs/` |
| ¿Qué tablas no escribe esta app? | Las cuatro de la herramienta: `trabajos`, `trabajo_items`, `clientes` y `vehiculos` |
| N1 — ¿quién emite las facturas? *(2026-10-08)* | Un solo CUIT desde ene-2025, el del taller, con un cambio de emisor previsto. **`cuit_emisor` entra en la clave del comprobante desde la primera migración** (spec 005 §4.2) |
| Los commits de `main` a nombre de Claude | Se quedan como están: reescribir `main` cuesta más de lo que arregla. De acá en adelante, a nombre de Luciano y sin firma |

# Constitución — acá no hay una segunda

**La constitución vinculante de El Semáforo vive en este mismo repositorio, desde que la base
se mudó acá (2026-10-07):**

> [`base/.specify/memory/constitution.md`](../../base/.specify/memory/constitution.md) — v3.0.0,
> diez principios.

Este archivo existe sólo para decir eso. Hubo una constitución propia de esta aplicación y se
retiró: dos constituciones son dos leyes que se pisan, y eso contradice el principio V —
cada hecho se registra en un solo lugar. Queda en el historial de git.

**Por qué sigue viviendo bajo `base/` y no acá arriba.** Porque `base/` es un *subtree* de
`tato22-alt/semaforo-modelo-datos` y conserva su historia: moverlo rompería la
correspondencia con ese repositorio y la posibilidad de sincronizarlos. La constitución manda
igual sobre todo el repo, esté donde esté el archivo.

| Qué | Dónde |
|---|---|
| Los diez principios no negociables | `base/.specify/memory/constitution.md` |
| El esquema: migraciones, vistas, RLS | `base/supabase/migrations/` |
| Las specs del modelo de datos | `base/specs/` |
| Reglas de esta app: alcance, capas, stack, cómo se escribe | `CLAUDE.md` en la raíz |
| Estado real de las piezas y el orden de trabajo | `ESTADO.md` |
| Los límites de la app y qué se puede derivar | `specs/002-alcance/spec.md` |

**No crear una constitución nueva acá.** Un principio propio de la aplicación va a `CLAUDE.md`.
Si contradice a la del modelo, se enmienda la del modelo — no se escribe una excepción local.

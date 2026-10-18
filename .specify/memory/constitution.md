# Constitución — acá no hay una segunda

**La constitución vinculante de El Semáforo vive en el repo privado del modelo de datos,
`tato22-alt/semaforo-base`:**

> `.specify/memory/constitution.md` de `semaforo-base` — v3.0.1, diez principios.

Este archivo existe sólo para decir eso. Hubo una constitución propia de esta aplicación y se
retiró: dos constituciones son dos leyes que se pisan, y eso contradice el principio V —
cada hecho se registra en un solo lugar. Queda en el historial de git.

**Por qué no está acá.** Desde el 2026-10-17 el modelo de datos vive en un repo privado, con su
historia: este repo es público para que GitHub Pages lo publique gratis. La constitución manda
igual sobre todo este repo, esté donde esté el archivo: para trabajar en la app hay que tener a
mano también `semaforo-base`.

| Qué | Dónde |
|---|---|
| Los diez principios no negociables | `.specify/memory/constitution.md` de `semaforo-base` |
| El esquema: migraciones, vistas, RLS | `supabase/migrations/` de `semaforo-base` |
| Las specs del modelo de datos, y la de cobranzas | `specs/` de `semaforo-base` |
| Reglas de esta app: alcance, capas, stack, cómo se escribe | `CLAUDE.md` en la raíz |
| Estado real de las piezas y el orden de trabajo | `ESTADO.md` |
| Los límites de la app y qué se puede derivar | `specs/002-alcance/spec.md` |

**No crear una constitución nueva acá.** Un principio propio de la aplicación va a `CLAUDE.md`.
Si contradice a la del modelo, se enmienda la del modelo — no se escribe una excepción local.

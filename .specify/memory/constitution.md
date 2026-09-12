# Constitución — acá no hay una segunda

**La constitución vinculante de El Semáforo es la del repo del modelo de datos:**

> `tato22-alt/gestion-taller-sql-server`, rama `claude/semaforo-taller-system-eroppo`,
> archivo `.specify/memory/constitution.md` (v3.0.0).

Este archivo existía con una constitución propia de la aplicación, escrita el 2026-09-05
contra un contexto anterior (Next.js, Insforge, entidad `caso`, cinco cortes de MVP). Se
retiró porque tener dos constituciones es tener dos leyes que se pisan, y eso contradice
el principio V del modelo: **cada hecho se registra en un solo lugar.** Queda en el
historial de git, en el commit `66b388f` y anteriores.

**Dónde vive cada cosa ahora:**

| Qué | Dónde |
|---|---|
| Principios no negociables (los diez) | Repo del modelo, `.specify/memory/constitution.md` |
| Reglas de esta aplicación: alcance, capas, stack, cómo se escribe | `CLAUDE.md` en la raíz de este repo |
| Límites concretos de la app y qué información se puede derivar | [`specs/002-alcance/spec.md`](../../specs/002-alcance/spec.md) |

**No crear una constitución nueva acá.** Si hace falta un principio que la del modelo no
cubre porque es propio de la aplicación y no de los datos, va a `CLAUDE.md`. Si contradice
a la del modelo, se enmienda la del modelo — no se escribe una excepción local.

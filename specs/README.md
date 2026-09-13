# Specs — Cómo trabajamos con SDD

**SDD (Spec-Driven Development)** es escribir primero *qué* tiene que pasar y recién después
*cómo* se hace. Suena obvio, pero lo normal es al revés: se empieza a codear y la definición
del problema queda implícita en el código, donde nadie la puede discutir.

La idea de fondo: **la especificación es el documento fuente, el código es su traducción.**
Si hay que cambiar el rumbo, se cambia la spec y el código la sigue.

## El orden de autoridad

```
constitución del modelo  →  CLAUDE.md  →  spec  →  plan  →  tareas
   (los principios)        (esta app)    (qué)    (cómo)   (pasos)
```

| Capa | Dónde | Contesta | Cambia... |
|---|---|---|---|
| **Constitución** | Repo del modelo, `.specify/memory/constitution.md` | ¿Qué principios no se negocian nunca? | Casi nunca, y con enmienda escrita |
| **Contexto de la app** | `CLAUDE.md` en la raíz | ¿Cómo se trabaja en este repo? | Cuando cambia el stack o el alcance |
| **Especificación** | `specs/00X-nombre/spec.md` | ¿Qué tiene que lograr y **dónde termina**? | Cuando cambia el problema |
| **Plan** | `specs/00X-nombre/plan.md` | ¿Con qué estructura y decisiones técnicas? | Cuando cambia una decisión técnica |
| **Tareas** | `specs/00X-nombre/tasks.md` | ¿Cuáles son los pasos concretos? | Todo el tiempo |

**La regla que las ordena:** si una capa de abajo contradice a una de arriba, gana la de
arriba. Una spec no puede violar la constitución. Una tarea no puede agregar algo que la
spec dejó explícitamente afuera.

**Hay una sola constitución** y vive en el repo del modelo de datos. Acá no se escribe otra
(ver [`.specify/memory/constitution.md`](../.specify/memory/constitution.md), que ahora es
solo un puntero y explica por qué).

## Por qué sirve en este proyecto

Este sistema tiene un enemigo declarado: convertirse en "uno que hace todo pero no hace
nada". Ese enemigo no aparece de golpe, aparece de a un feature razonable por vez. Cada uno
parece barato por separado.

La spec es la defensa: **la sección de lo que queda afuera tiene más valor que la lista de
funcionalidades**, porque es la que permite decir "eso ya lo discutimos y decidimos que no,
y acá está escrito por qué".

## Estado actual

| Spec | Título | Estado |
|---|---|---|
| [002](./002-alcance/spec.md) | Alcance y límites de la aplicación | Borrador, esperando revisión |
| [003](./003-tablero/spec.md) | Tablero | Borrador, esperando revisión |

## Cómo se revisa una spec

No se lee de arriba abajo buscando errores de redacción. Se le hacen estas preguntas:

1. **¿Está lo que falta?** Un requisito que no está escrito no se va a construir.
2. **¿Sobra algo?** Todo lo que entra tiene que ayudar a contestar qué autos hay, hace cuánto
   están, y quién debe plata.
3. **¿Los límites son los correctos?** Cada cosa que queda afuera es algo que no vas a tener.
4. **¿Los criterios de aceptación son medibles?** "Rápido" no sirve. "Menos de 90 segundos" sí.
5. **¿Cada dato nuevo que se pide cargar justifica su costo?** Un campo que nadie completa es
   peor que no tenerlo: ensucia lo que sí se carga.
6. **¿Las decisiones abiertas están todas listadas?** Una decisión sin tomar que nadie anotó
   se termina tomando sola, en el código, sin que nadie la mire.

Cuando la spec está aprobada, recién ahí se escribe el `plan.md`.

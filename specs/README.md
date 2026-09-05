# Specs — Cómo trabajamos con SDD

**SDD (Spec-Driven Development)** es escribir primero *qué* tiene que pasar y
recién después *cómo* se hace. Suena obvio, pero lo normal es al revés: se empieza
a codear y la definición del problema queda implícita en el código, donde nadie
la puede discutir.

La idea de fondo: **la especificación es el documento fuente, el código es su
traducción.** Si hay que cambiar el rumbo, se cambia la spec y el código la sigue.

## Las cuatro capas

```
constitución  →  spec  →  plan  →  tareas
   (leyes)      (qué)    (cómo)   (pasos)
```

| Capa | Archivo | Contesta | Cambia... |
|---|---|---|---|
| **Constitución** | `.specify/memory/constitution.md` | ¿Qué principios no se negocian nunca? | Casi nunca, y con enmienda escrita |
| **Especificación** | `specs/001-.../spec.md` | ¿Qué tiene que lograr y **dónde termina**? | Cuando cambia el problema |
| **Plan** | `specs/001-.../plan.md` | ¿Con qué tecnología y arquitectura? | Cuando cambia una decisión técnica |
| **Tareas** | `specs/001-.../tasks.md` | ¿Cuáles son los pasos concretos? | Todo el tiempo |

**La regla que las ordena:** si una capa de abajo contradice a una de arriba, gana
la de arriba. Un plan no puede violar la constitución. Una tarea no puede agregar
algo que la spec dejó explícitamente afuera.

## Por qué sirve en este proyecto

Este sistema tiene un enemigo declarado: convertirse en "uno que hace todo pero no
hace nada". Ese enemigo no aparece de golpe, aparece de a un feature razonable por
vez. Cada uno parece barato por separado.

La spec es la defensa: **la sección "Fuera de alcance" tiene más valor que la
sección de funcionalidades**, porque es la que permite decir "eso ya lo discutimos
y decidimos que no, y acá está escrito por qué".

## Estado actual

| Spec | Título | Estado |
|---|---|---|
| [001](./001-mvp-gestion/spec.md) | MVP de gestión | Borrador, esperando revisión |

## Cómo se revisa una spec

No se lee de arriba abajo buscando errores de redacción. Se le hacen estas
preguntas:

1. **¿Está lo que falta?** Un requisito que no está escrito no se va a construir.
2. **¿Sobra algo?** Todo requisito tiene que sobrevivir la pregunta núcleo:
   *¿esto ayuda a saber dónde se va la plata?*
3. **¿Los límites son los correctos?** Ojo especialmente con §4: cada cosa que
   queda afuera es algo que no vas a tener.
4. **¿Los criterios de aceptación son medibles?** "Rápido" no sirve. "Menos de 90
   segundos" sí.
5. **¿Las decisiones abiertas están todas listadas?** Una decisión sin tomar que
   nadie anotó se termina tomando sola, en el código, sin que nadie la mire.

Cuando la spec está aprobada, recién ahí se escribe el `plan.md`.

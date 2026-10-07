# Gestión de Taller — El Semáforo

Modelo de datos del sistema de gestión del Taller El Semáforo, un taller de chapa y pintura.

**Motor: PostgreSQL sobre Supabase.** Acá vive la base de datos: el esquema, las restricciones de
integridad, las vistas que derivan las magnitudes del negocio, las políticas de acceso, y el
diccionario que las explica. La aplicación se construye por separado y consume esta base.

## Estado

En desarrollo y ya en uso real. Diecinueve migraciones corridas: cuatro tablas, dos vistas, seis
funciones, cero triggers, RLS puesto, y **58 verificaciones automáticas** que corren en una sola
consulta. La base reparte los números de presupuesto desde el 16000 y no puede repetir ninguno.

| Feature | Estado |
|---|---|
| 001 Presupuesto | Cerrado. 58/58 en el QA de SQL, 8/8 en la verificación de acceso con login real |
| 002 Numeración | Implementado. La base reparte los números, arrancando en 16000 |
| 003 Verificación del impreso | En pausa: el código de verificación no se imprime |
| 004 Chasis y observaciones | Implementado |
| 005 Detalle de mano de obra | Implementado |
| 006 Presupuestos pendientes | Implementado. Un trabajo todavía sin número |
| 007 El borrador no se pierde | Especificado, sin aprobar. No toca la base |

El estado al día está en `ESTADO.md`, que es el punto de entrada cuando se vuelve al proyecto.

## Cómo está organizado

```text
.specify/memory/constitution.md    Los principios que mandan sobre todo lo demás
specs/                             Una carpeta por feature: spec, plan, tareas y verificación
supabase/migrations/               EL MODELO VIGENTE — diecinueve migraciones
ESTADO.md                          Dónde está todo. El punto de entrada
docs/diccionario-datos.md          Qué guarda la base y qué deriva al leer
docs/legado-modelo-academico.md    Qué se derogó del modelo académico, y por qué
```

## Cómo se trabaja acá

El orden es **spec → plan → tareas → implementación**, y las dos primeras las confirma el dueño del
negocio antes de que se toque el esquema. Ninguna migración se escribe sin una spec aprobada. Cuando
la implementación descubre que la spec estaba equivocada, se corrige la spec — no se deja el DDL como
única verdad.

Las migraciones se ejecutan pegándolas en el editor SQL del panel de Supabase. El criterio para dar
una tarea por terminada es que **corra**, no que esté escrita.

## Verificación

`specs/001-presupuesto/qa-001-verificacion.sql` es una sola consulta que devuelve 58 filas, una por
verificación, con PASA o FALLA. Cubre estructura, integridad, derivación y acceso. Se limpia sola.

Es la fuente de verdad sobre el estado de la base: responde si el esquema es el que debería ser, que
es más útil que acordarse de qué migración se corrió.

## Principios que explican las decisiones raras

Están completos en la constitución. Los tres que más se notan al leer el esquema:

- **Lo que se puede derivar, no se almacena.** No hay ninguna columna de total: los totales salen de
  una vista, calculados al leer. Un dato derivado que se almacena es uno que alguien va a olvidar de
  actualizar.
- **El esquema no impide registrar la realidad.** Casi todo es nulo. Un sistema que impide registrar
  lo que pasó se saltea, y desde ese día refleja una realidad que no existe.
- **Ningún automatismo escribe estados financieros.** Cero triggers. El modelo anterior tenía un
  procedimiento que marcaba un trabajo como cobrado ante cualquier seña, sin comparar montos.

## El modelo, en una línea cada uno

| Tabla | Qué es |
|---|---|
| `clientes` | El dueño o responsable. Lo único exigido es el nombre |
| `vehiculos` | Identificado por patente, única y normalizada por el motor |
| `trabajos` | El expediente: nace del presupuesto y lleva su número. No se borra |
| `trabajo_items` | Los conceptos presupuestados, en el orden en que se cargaron |
| `vw_presupuestos` | Una fila por trabajo, con los totales calculados al leer |
| `vw_presupuestos_incompletos` | A qué presupuestos les falta algo, y qué |

Deuda, cobranza, facturación, documentos, seguro, siniestro y estado operativo **no existen
todavía**: son features posteriores, y cada uno necesita su propia spec aprobada antes de tocar el
esquema.

## Qué preguntas responde hoy

1. Qué presupuesto tiene un número dado.
2. Qué presupuestos existen para una patente, del más nuevo al más viejo.
3. Qué presupuestos tiene un cliente, buscándolo por parte del nombre — sin tildes también.
4. Cuál fue el último presupuesto cargado.
5. Cuánto suma un presupuesto y qué conceptos lo componen.
6. Qué presupuestos quedaron sin concretarse.
7. Cuántos presupuestos se hicieron en un mes y por qué monto.

Cada una se responde con una sola consulta. Están en
`specs/001-presupuesto/consultas-siete-preguntas.sql`.

# Tareas 001 — Presupuesto

**Plan:** `specs/001-presupuesto/plan.md` · **Constitución:** v3.0.0 · **Motor:** PostgreSQL sobre Supabase

Cada tarea entrega algo verificable. El orden importa: una tarea no arranca hasta que su dependencia
está verificada.

---

## Bloque A — Esquema

**Bloque A: TERMINADO.** Corrido y verificado sobre Supabase.

| # | Tarea | Estado |
|---|---|---|
| T001 | Migración inicial: extensiones y convenciones | ✅ |
| T002 | Tabla `clientes` con `nombre_norm` e índice de búsqueda | ✅ |
| T003 | Tabla `vehiculos` con `patente_norm` única | ✅ |
| T004 | Validación de formato de patente, no bloqueante | ✅ (enmendada por H3) |
| T005 | Tabla `trabajos` | ✅ |
| T006 | Tabla `trabajo_items` | ✅ |

## Bloque B — Acceso

**Bloque B: TERMINADO.**

| # | Tarea | Estado |
|---|---|---|
| T007 | RLS y políticas de usuario autenticado | ✅ |
| T008 | Permisos sobre vistas y revocación al rol anónimo | ✅ — falta correr `verificar-acceso.html` para cerrarlo con la llamada REST real que el criterio pide |

## Bloque C — Derivación

**Bloque C: TERMINADO.**

| # | Tarea | Estado |
|---|---|---|
| T009 | Vista `vw_presupuestos` con totales derivados | ✅ |
| T010 | Consultas de las siete preguntas | ✅ (la 3 y la 7 corregidas por H1 y H7) |

## Bloque D — Importación

> **EN PAUSA — ver H16.** Luciano confirmó que no hay registro histórico: el taller está pasando de
> papel a digital, y el `localStorage` no tiene presupuestos que traer. Estas cinco tareas migran
> cero filas. Se conservan sin empezar, porque vuelven a tener sentido si se cargan presupuestos en
> el navegador antes de que la página se conecte a la base. **No bloquean al feature 002.**

| # | Tarea | Depende | Termina cuando |
|---|---|---|---|
| T011 | Tabla `stg_presupuesto_csv` con las catorce columnas como texto | T001 | Un CSV entero entra crudo sin validar |
| T012 | Función de validación que reporta por número de línea y no escribe | T011 | Detecta número no entero, importe no numérico y detalle sin importe |
| T013 | Función de consolidación: resolver cliente y vehículo, upsert, reemplazo de conceptos | T012, T006 | Un lote válido queda cargado con sus conceptos en orden |
| T014 | Idempotencia y regla de `modificado_en` | T013 | Reimportar no duplica; un CSV viejo no pisa una corrección nueva (RF-018) |
| T015 | Consulta de clientes posiblemente duplicados | T013 | Lista nombres parecidos para revisión manual (riesgo D5) |

## Bloque E — Verificación y cierre

| # | Tarea | Estado |
|---|---|---|
| T016 | Datos de prueba de los seis escenarios | ❌ **descartada.** El QA crea y borra sus propios datos para cada escenario, y la base quedó vacía a propósito para la primera carga real |
| T017 | Verificación de los siete criterios | ✅ `verificacion-criterios.md` |
| T018 | Diccionario de datos | ✅ `docs/diccionario-datos.md`, reescrito para el modelo vigente |
| T019 | Retirar el modelo académico derogado | ✅ ver `docs/legado-modelo-academico.md` |

---

## Feature 002 — Numeración

| # | Tarea | Estado |
|---|---|---|
| T101 | Secuencia desde 16000, `fn_proximo_numero_presupuesto()` y sincronización | ✅ escrita y probada en local; **falta correrla en Supabase** |

Spec en `specs/002-numeracion/spec.md`.

---

## Fuera de estas tareas

Conectar la herramienta de presupuesto a la base, y con eso mover la autoridad de la numeración
(RF-021). Es el feature 002 y necesita antes: proyecto de Supabase creado, usuarios dados de alta y
login resuelto en la página, que hoy no tiene ninguno.

**Actualización (H16).** El proyecto de Supabase ya existe y el esquema está corrido y verificado.
Al no haber histórico, el bloque D dejó de ser un requisito previo. Lo que falta para el 002 es:
usuarios de Supabase Auth dados de alta, login en la página, y decidir cómo se asigna el número
—arrancando en 16000 sobre una base vacía, y confirmando en qué número quedó el talonario de papel.

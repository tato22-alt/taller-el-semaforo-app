# Verificación de los criterios de aceptación — 001 Presupuesto

**Tarea:** T017 · **Spec:** `spec.md` · **QA:** `qa-001-verificacion.sql`

Los siete criterios de la spec, con cómo se probó cada uno. Donde dice "QA n", es el número de
verificación de `fn_qa_001_presupuesto()`, que corre sobre la base real y se puede repetir.

**Última corrida completa:** 49 PASA · 0 FALLA, sobre Supabase (`osslhkvdclrbukjqwpnt`) y sobre
PostgreSQL 16 local en tres escenarios (base vacía desde cero, base poblada, y doble pasada de las
migraciones).

---

### 1. Se puede registrar el presupuesto de un auto y un cliente que nunca estuvieron, en un solo acto

**Cumplido en cuanto a la base; el "solo acto" es de la aplicación.**

- QA 14 — un cliente entra sólo con el nombre.
- QA 16 — un trabajo entra sin cliente, sin vehículo, sin fecha y sin origen.
- QA 32 — se crea vehículo y se le cuelgan presupuestos.

**Salvedad registrada (H4).** Contra Supabase, insertar cliente + vehículo + trabajo + conceptos son
llamadas REST separadas: no hay una transacción que las agrupe. Si se corta la conexión en el medio
quedan un cliente y un vehículo huérfanos. Resolverlo en la base sería orquestación, que la
constitución pone explícitamente fuera de este repositorio. **Queda como requisito para quien
construya la aplicación**, no como deuda del modelo.

### 2. Se puede registrar un presupuesto con importes y sin ningún dato del cliente

**Cumplido.**

- QA 16 — el trabajo nace con todo en nulo y los defaults correctos (`no_concretado=false`,
  `monto_mano_obra=0`).
- QA 30 — un trabajo sin conceptos da total igual a la mano de obra.
- QA 45 — la vista de incompletos lo reporta como incompleto en vez de impedirlo.

### 3. Un segundo presupuesto sobre la misma patente reutiliza el vehículo y no lo duplica

**Cumplido.**

- QA 17 — `aa 123-bb` y `AA123BB` colisionan: `unique_violation` sobre `patente_norm`. El esquema
  hace **imposible** duplicar un vehículo por diferencia de tipeo.
- QA 32 — un vehículo, dos presupuestos, con clientes distintos. Verifica también RF-012: el cliente
  de un presupuesto es el de ese presupuesto, no el del vehículo.

### 4. Corregir el nombre de un cliente no altera lo que dice un presupuesto ya emitido

**Cumplido.**

- QA 31 — se crea el cliente, se emite el presupuesto con su `txt_cliente`, se corrige el nombre en
  la ficha, y se comprueba que `trabajos.txt_cliente` sigue diciendo lo que decía **y** que
  `vw_presupuestos.cliente_actual` muestra el nombre nuevo. Los dos hechos conviven, que es el punto
  de D4.

### 5. Las siete preguntas se responden cada una con una sola consulta

**Cumplido.** Las consultas están en `consultas-siete-preguntas.sql` y se corrieron sobre Supabase.

| Pregunta | Cómo se responde | Evidencia |
|---|---|---|
| 1. ¿Qué presupuesto tiene el número 16043? | `where numero_presupuesto = ...` | corrida, devuelve la fila |
| 2. ¿Presupuestos de una patente, del más nuevo al más viejo? | `where patente_norm = ...` | corrida |
| 3. ¿Presupuestos de un cliente, por parte del nombre? | `where cliente_norm like ...` | QA 38, QA 39 |
| 4. ¿Último presupuesto y próximo número? | `max(numero_presupuesto)` | corrida |
| 5. ¿Cuánto suma un presupuesto y qué lo compone? | `vw_presupuestos` + `jsonb_agg` de los conceptos | corrida |
| 6. ¿Cuáles quedaron sin concretarse? | `where no_concretado` | corrida |
| 7. ¿Cuántos en un mes y por qué monto? | `date_trunc('month', ...)::date` | QA 48 |

La 3 falló en la primera corrida —buscar "perez" no encontraba "Pérez"— y se resolvió con la enmienda
H1. La 7 descartaba los presupuestos sin fecha, y se resolvió con H7: ahora salen en una fila aparte.

Sobre la 4: devuelve el último número emitido. **No es el próximo a asignar** — la serie puede tener
huecos y esa decisión es del feature 002.

### 6. El CSV de la herramienta actual se importa completo, y reimportarlo no duplica

**No verificado — el bloque D está en pausa (H16).**

No hay registro histórico que importar: el taller está pasando de papel a digital. Las cinco tareas
del bloque D quedan escritas y sin empezar. El formato del CSV sí quedó verificado contra la fuente
publicada (`tato22-alt/semaforo-presupuesto` @ `178fb1d`) y contra un CSV real exportado, y las
reglas de lectura están definidas en el plan.

**Es el único criterio de los siete que queda abierto**, y por ausencia de datos, no por falla.

### 7. Ningún dato del seguro, de la deuda ni del estado operativo es necesario para que todo lo anterior funcione

**Cumplido, y verificado estructuralmente.**

- QA 12 — no existe ninguna columna de total almacenado.
- QA 13 — no existe ninguna columna de estado financiero, documental ni de siniestro.
- QA 11 — cero triggers: ningún automatismo escribe nada.
- QA 1 — sólo existen las cuatro tablas del feature.

---

## Cobertura más allá de los criterios

El QA verifica además cosas que la spec no pidió explícitamente pero de las que depende el modelo:

- **Acceso** (QA 33–37): `anon` no lee ni escribe, ni en tablas ni en vistas; `authenticated` sí.
  Esto es lo que sostiene que la clave publicable pueda estar en un repositorio público.
- **Dominios cerrados** (QA 21, 22, 24, 25): número menor a 16000, número duplicado, `origen` y
  `origen_carga` fuera de dominio — todos rechazados.
- **Registro histórico** (QA 42, 43): `authenticated` no puede borrar un trabajo, pero sí corregirlo
  y reemplazar sus conceptos.
- **Invariantes de normalización** (QA 41): `patente_norm` y `fn_normalizar_patente` no divergieron.

## Qué queda sin cubrir

- **El criterio 6**, por lo dicho arriba.
- **La atomicidad del criterio 1** (H4), que es de la aplicación.
- **Los datos de prueba de los seis escenarios (T016)**: la base quedó vacía a propósito, lista para
  la primera carga real. Los escenarios están cubiertos por las verificaciones del QA, que crea y
  borra sus propios datos, así que T016 dejó de tener un motivo propio.

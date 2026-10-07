# Estado del proyecto — dónde está todo

Punto de entrada cuando volvés. Si algo de acá y el esquema se contradicen, gana el esquema: corré
el QA, que es la fuente de verdad.

**Rama:** `claude/semaforo-taller-system-eroppo` · **Proyecto Supabase:** `osslhkvdclrbukjqwpnt`

---

## Qué hay funcionando

Cuatro tablas, dos vistas, seis funciones, cero triggers. La base reparte los números desde el 16000
y no puede repetir ninguno. RLS puesto: el rol anónimo no lee, no escribe y no pide números.

**Verificado:** 58 comprobaciones en una sola consulta, sobre Supabase y sobre PostgreSQL local, en
base vacía, en base poblada, y aplicando las migraciones dos veces seguidas.

La base está **vacía y con los contadores en cero**, lista para la primera carga real.

---

## Las diecinueve migraciones están corridas

**58 PASA · 0 FALLA**, medido. La base quedó vacía y con los contadores en cero.
El primer presupuesto real sale con el **16000**, justo donde terminó el talonario de papel (15999).

Para volver a verificar en cualquier momento: pegar `specs/001-presupuesto/qa-001-verificacion.sql`
entero y ejecutar. Después conviene dejar la base limpia otra vez:

```sql
truncate table trabajo_items, trabajos, vehiculos, clientes restart identity;
```

*(El QA borra sus propias filas pero consume ids; sin el truncate el próximo cliente no arrancaría
en 1. Los números de presupuesto sí quedan intactos: eso lo restaura el propio QA, y el truncate no
toca esa secuencia porque es independiente, no de una columna `identity`.)*

---

## Feature 001 — CERRADO

Las migraciones corridas y verificadas: 58/58 PASA en el QA de SQL, y 8/8 PASA en
`verificar-acceso.html` con un login real (usuario, contraseña, token, PostgREST, RLS — la cadena
completa, no sólo el rol). No queda ningún criterio de T007/T008/T009 sin probar.

**Detalle encontrado al verificar el login:** los dos usuarios estaban dados de alta pero sin el
email confirmado, así que el login fallaba con `Invalid login credentials` hasta confirmarlos:

```sql
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;
```

Si en algún momento se agrega un usuario nuevo a mano desde el panel, revisar que quede confirmado —
si no, el login falla igual aunque el usuario y la contraseña estén bien.

---

## La página ya está conectada y en producción

Repo `tato22-alt/semaforo-presupuesto`, **en `main`** y publicado por GitHub Pages.
Reemplaza `localStorage` por login (Supabase Auth), numeración con
`fn_proximo_numero_presupuesto()` y guardado/lectura contra
`clientes`/`vehiculos`/`trabajos`/`trabajo_items`/`vw_presupuestos`. El detalle de
qué cambió y por qué está en `CONEXION-BASE.md` de ese repo.

Probado de punta a punta con Playwright contra un mock de la API — login, campos
obligatorios, guardar, reeditar, un fallo real a mitad del guardado, historial, CSV,
persistencia de sesión — pero **nunca contra el proyecto Supabase real desde este
entorno**, que no tiene salida de red hacia él.

**Lo que no está registrado acá:** si la cadena completa se ejercitó con un
presupuesto real (login, pedir número, guardar, imprimir, reabrir del historial), y si
ya salió el 16000. Cuando pase, anotarlo acá: es el único dato que convierte
"debería funcionar" en "funciona".

**Dos cosas que resuelve la página, no la base:**

- Crear cliente + vehículo + presupuesto son llamadas separadas. Si se corta la conexión en el medio
  quedan huérfanos. Agruparlas es orquestación, que la constitución pone fuera de este repositorio.
- Los campos obligatorios al cargar (fecha, cliente con dirección y teléfono, mano de obra) los exige
  la página. La base los reporta con `vw_presupuestos_incompletos` pero no bloquea.

---

## Decisiones cerradas en el feature 006

| Qué | Decidido |
|---|---|
| ¿Un pendiente tiene número desde que se guarda? | **No.** El número se pide recién al emitirlo. Un pendiente abandonado no puede dejar un hueco en el talonario (RF-502) |
| ¿Se puede borrar un pendiente? | **Sí**, y sólo un pendiente. `delete` vuelve sobre `trabajos` acotado por una política restrictiva a las filas sin número (RF-507/RF-508). RF-023 sigue intacto para todo lo emitido |

## Feature 007 — especificado, sin aprobar

El presupuesto a medio cargar se pierde si el navegador descarta la pestaña en segundo plano, que es
lo que pasa en el celular al cambiar de app. **No lo arregla "Dejar pendiente"**: ese botón exige un
tap, y el bug ocurre justamente cuando nadie tocó nada.

**No toca la base.** Cero migraciones: el trabajo es todo en `index.html`. El borrador se guarda
local porque un formulario a medio llenar todavía no es un hecho del taller, y guardar cada tecleo
contra la base dejaría filas de basura en `trabajos`, arriba de todo en el historial.

Lo técnico que resuelve el bug: el evento es `visibilitychange` pasando a `hidden`, no
`beforeunload` — ése no se dispara cuando el sistema mata la pestaña, y es la razón por la que el
bug existe. La spec está en `specs/007-borrador/spec.md`, con nueve requisitos y diez criterios.

## Decisiones abiertas

| Qué | Estado |
|---|---|
| ~~¿En qué número quedó el talonario de papel?~~ | **CERRADO.** El talonario físico terminó en el **15999**, así que el 16000 digital continúa la serie sin hueco ni superposición. No hay que ajustar nada ni correr `fn_sincronizar_numeracion()` |
| ¿Alguien usa la otra versión de la herramienta? | Existe una variante que arranca en 16001, no normaliza patentes y exporta 12 columnas. Si corre en algún equipo, sus datos se comportan distinto (H12) |
| ~~¿Se borra `scripts/`?~~ | **CERRADO.** Sí. Los seis `.sql` de T-SQL se retiraron del árbol: hacían parecer el repositorio un proyecto de SQL Server. El registro de qué se derogó y por qué quedó en `docs/legado-modelo-academico.md`, y el contenido sigue recuperable del historial |

---

## Dónde está cada cosa

```
.specify/memory/constitution.md              Los principios. Mandan sobre todo lo demás
ESTADO.md                                    Este archivo
README.md                                    Qué es el proyecto y cómo se trabaja
docs/diccionario-datos.md                    Qué guarda la base y qué deriva al leer
docs/mejoras-futuras.md                      Qué sigue, qué está en pausa, qué no se va a construir
docs/legado-modelo-academico.md              Qué se derogó del modelo académico, y por qué
supabase/migrations/                          EL MODELO — 19 migraciones
specs/001-presupuesto/
  spec.md · plan.md · tasks.md               El feature, con sus enmiendas
  qa-001-verificacion.sql                    EL QA — 58 verificaciones en una consulta
  verificar-acceso.html                      Verificación del login real, desde el navegador
  verificacion-criterios.md                  Los siete criterios y cómo se probó cada uno
  qa-hallazgos.md                            Los 16 hallazgos, con lo decidido y por qué
  consultas-siete-preguntas.sql              Las siete preguntas de la spec
  limpieza-datos-prueba.sql                  Dejar la base en cero
specs/002-numeracion/spec.md                 La numeración
specs/003-verificacion/spec.md               Código de verificación del impreso — EN PAUSA
specs/004-chasis-observaciones/spec.md       Chasis y observaciones en el presupuesto
specs/005-detalle-mano-obra/spec.md          Qué dice el renglón de mano de obra
specs/006-pendientes/                        Presupuestos pendientes, con su propio QA
specs/007-borrador/spec.md                   El borrador no se pierde — SIN APROBAR
```

---

## Cómo se trabaja acá

Orden: **spec → plan → tareas → implementación**. Ninguna migración se escribe sin una spec
aprobada, y las dos primeras las confirma el dueño del negocio antes de que se toque el esquema.
Cuando la implementación descubre que la spec estaba equivocada, se corrige la spec.

Las migraciones se pegan a mano en el editor SQL del panel. **El criterio para dar una tarea por
terminada es que corra, no que esté escrita.**

Si al re-pegar una migración vieja salta **"ya existe"**, es inofensivo: ya estaba aplicada. El QA
—no los errores de las migraciones— es lo que dice el estado real de la base.

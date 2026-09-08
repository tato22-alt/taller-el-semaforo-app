# Estado del proyecto — dónde está todo

Punto de entrada cuando volvés. Si algo de acá y el esquema se contradicen, gana el esquema: corré
el QA, que es la fuente de verdad.

**Rama:** `claude/semaforo-taller-system-eroppo` · **Proyecto Supabase:** `osslhkvdclrbukjqwpnt`

---

## Qué hay funcionando

Cuatro tablas, dos vistas, seis funciones, cero triggers. La base reparte los números desde el 16000
y no puede repetir ninguno. RLS puesto: el rol anónimo no lee, no escribe y no pide números.

**Verificado:** 57 comprobaciones en una sola consulta, sobre Supabase y sobre PostgreSQL local, en
base vacía, en base poblada, y aplicando las migraciones dos veces seguidas.

La base está **vacía y con los contadores en cero**, lista para la primera carga real.

---

## Las quince migraciones están corridas

**57 PASA · 0 FALLA sobre Supabase**, medido. La base quedó vacía y con los contadores en cero.
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

Las quince migraciones corridas y verificadas: 57/57 PASA en el QA de SQL, y 8/8 PASA en
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

## Después de eso: conectar la página

Es lo único que falta para que el sistema sirva de verdad, y es urgente por una razón concreta: cada
presupuesto que se cargue en el navegador sin conectar es uno que después habrá que mover a mano.

Falta, todo del lado de la página (repo `tato22-alt/semaforo-presupuesto`):

1. **Login.** Hoy no tiene ninguno, y sin sesión no se lee ni se escribe nada.
2. **Pedir el número** con `fn_proximo_numero_presupuesto()` en vez de repartirlo desde el navegador.
3. **Guardar contra la base** en lugar del `localStorage`.

`verificar-acceso.html` muestra exactamente las llamadas HTTP que hacen falta.

**Dos cosas que resuelve la página, no la base:**

- Crear cliente + vehículo + presupuesto son llamadas separadas. Si se corta la conexión en el medio
  quedan huérfanos. Agruparlas es orquestación, que la constitución pone fuera de este repositorio.
- Los campos obligatorios al cargar (fecha, cliente con dirección y teléfono, mano de obra) los exige
  la página. La base los reporta con `vw_presupuestos_incompletos` pero no bloquea.

---

## Decisiones abiertas

| Qué | Estado |
|---|---|
| ~~¿En qué número quedó el talonario de papel?~~ | **CERRADO.** El talonario físico terminó en el **15999**, así que el 16000 digital continúa la serie sin hueco ni superposición. No hay que ajustar nada ni correr `fn_sincronizar_numeracion()` |
| ¿Alguien usa la otra versión de la herramienta? | Existe una variante que arranca en 16001, no normaliza patentes y exporta 12 columnas. Si corre en algún equipo, sus datos se comportan distinto (H12) |
| ¿Se borra `scripts/`? | Es el modelo académico superado. El plan del 001 dijo que esas tablas no se tocan en este feature (`scripts/LEGADO.md`) |

---

## Dónde está cada cosa

```
.specify/memory/constitution.md              Los principios. Mandan sobre todo lo demás
ESTADO.md                                    Este archivo
README.md                                    Qué es el proyecto y cómo se trabaja
docs/diccionario-datos.md                    Qué guarda la base y qué deriva al leer
docs/mejoras-futuras.md                      Qué sigue, qué está en pausa, qué no se va a construir
supabase/migrations/                          EL MODELO — 15 migraciones, una por tarea
specs/001-presupuesto/
  spec.md · plan.md · tasks.md               El feature, con sus enmiendas
  qa-001-verificacion.sql                    EL QA — 57 verificaciones en una consulta
  verificar-acceso.html                      Verificación del login real, desde el navegador
  verificacion-criterios.md                  Los siete criterios y cómo se probó cada uno
  qa-hallazgos.md                            Los 16 hallazgos, con lo decidido y por qué
  consultas-siete-preguntas.sql              Las siete preguntas de la spec
  limpieza-datos-prueba.sql                  Dejar la base en cero
specs/002-numeracion/spec.md                 La numeración
scripts/                                     Modelo académico superado — ver LEGADO.md
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

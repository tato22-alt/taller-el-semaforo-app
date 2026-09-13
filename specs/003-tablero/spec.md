# Spec 003 — Tablero

**Estado:** borrador, pendiente de aprobación de Luciano
**Alcance vigente:** `specs/002-alcance/spec.md`
**Constitución aplicable:** la del repo del modelo, v3.0.0
**Base:** `gestion-taller-sql-server` @ `claude/semaforo-taller-system-eroppo` — 4 tablas, 2 vistas, **vacía**

---

## Por qué

Hoy nadie puede contestar de memoria qué autos hay en el taller. Esta pantalla es el primer
paso hacia eso, y conviene decir con todas las letras **hasta dónde llega**: con lo que la
base guarda hoy, el tablero no puede contestar esa pregunta. Puede contestar una más chica:
qué presupuestos se emitieron y hace cuánto.

Y tiene un segundo motivo, que hoy vale más que el primero: **la base está vacía.** Probar
el camino completo —login, RLS, PostgREST, build y deploy— con cero filas es hacerlo en el
único momento en que no hay un solo dato real que perder. Si algo de esa cadena está mal,
se descubre ahora y no el día que la administrativa cargue el primer presupuesto.

## Alcance

**Entra:** login, y una pantalla de sólo lectura con una fila por presupuesto, leída de
`vw_presupuestos`.

**No entra, y no es olvido:** emitir o corregir presupuestos (eso es la herramienta),
buscador, filtros, gráficos, marcar no concretado (eso es la Ficha), estado operativo del
auto, y cualquier cosa relacionada con plata que se debe.

**Lo que esta app nunca escribe, en ninguna pantalla:** `trabajo_items` y las columnas
`txt_*` de `trabajos`. Los conceptos y el texto tal como se imprimió son del que emite el
papel. La app escribe sólo hechos posteriores: no concretado, origen, y más adelante el
estado operativo y los cobros. **Hay un test que lo verifica**, así que deja de depender de
que alguien se acuerde.

## Lo que esta pantalla NO puede contestar todavía

Está acá para que no se la pida y para que nadie lea en ella algo que no dice:

| Pregunta | Por qué no | Qué haría falta |
|---|---|---|
| ¿Qué autos hay **en el taller**? | Un presupuesto no es un auto adentro. La base no registra si el auto entró | El estado operativo del trabajo — una columna, principio I |
| ¿Hace cuántos días **está** el auto? | No existe fecha de ingreso. Lo único que hay es `fecha_presupuesto` | Ídem |
| ¿Quién **debe** plata? | No existe deuda ni cobro en el modelo | El feature de cobranza |
| ¿Cuántos se concretaron? | La columna `no_concretado` existe y **nadie la escribe todavía** | El botón de la Ficha |

**Consecuencia directa sobre el texto de la pantalla:** los días que muestre son **días desde
que se presupuestó**, y la interfaz lo dice con esas palabras. Si dijera "días en el taller",
el sistema miente desde el primer día, y un tablero que miente se deja de mirar.

---

## Escenarios

**E1 — La base vacía.** La administrativa entra y no hay nada cargado. Tiene que ver que
está adentro del sistema y que no hay presupuestos todavía, no una pantalla en blanco.

**E2 — Se venció la sesión.** Estaba mirando el tablero, pasó el tiempo, el token venció.
Tiene que ver que se cerró la sesión, **no** que no hay trabajos.

**E3 — Al lado de un auto.** Está parada en el taller con el celular en una mano, con la
patente del auto delante. Necesita encontrar ese presupuesto sin acercarse el teléfono a la
cara.

**E4 — Sin internet.** Se cortó la conexión del taller. Tiene que ver que el problema es la
conexión, no que se borraron los datos.

---

## Requisitos

### Sesión

- **RF-301** — Sin sesión no se ve ningún dato. Pantalla de email y contraseña. Los usuarios
  se dan de alta desde el panel de Supabase, no desde acá.
- **RF-302** — La pantalla muestra **explícitamente que hay sesión activa y de quién**.
  Motivo: con la base vacía, "no hay sesión" y "no hay presupuestos" se ven exactamente
  igual —una lista vacía— y sin este dato no hay forma de distinguirlos mirando la pantalla.
- **RF-303** — La sesión se maneja con el cliente oficial de Supabase, **nunca a mano**. El
  refresco escrito a mano es lo que deja a una pestaña con un token gastado cuando otra
  renueva primero; el cliente oficial relee el storage y toma un lock antes de renovar.
- **RF-304** — La sesión **queda abierta** entre visitas: no se pide la contraseña cada vez.
  Son tres personas de confianza y el celular es personal; pedir la contraseña diez veces por
  día termina en un papelito pegado al monitor. Hay un botón para cerrar sesión.

### La lista

- **RF-305** — Una fila por presupuesto, leída de `vw_presupuestos`. Nunca de las tablas.
- **RF-306** — Cada fila muestra: **número de presupuesto**, **patente**, vehículo, cliente,
  fecha del presupuesto y monto total.
- **RF-307** — La patente es el dato más destacado de la fila. Es con lo que se busca cuando
  se está al lado del auto.
- **RF-308** — Ordenado del más nuevo al más viejo.
- **RF-309** — Sólo lo activo: no se muestran los marcados como no concretados. Siguen
  consultables, pero por otra vía (buscador o ficha), que no es de esta spec.
- **RF-310** — Techo de **100 filas**, de las más nuevas. El taller emite unos **80
  presupuestos por mes** (dato de Luciano), así que 100 filas son poco más de un mes. No es
  un techo cómodo: es a propósito, para que la lista abra rápido en el celular y para que
  quede claro que **una lista que crece para siempre no es un tablero**. Lo que la hace útil
  no es mostrar más filas, es que se marquen los no concretados (ver abajo).

### Los números

- **RF-311** — **Ningún número se calcula acá.** `monto_total` sale de la vista, no de sumar
  los renglones en el navegador.
- **RF-312** — Los importes se formatean sin hacer aritmética: la base los manda como texto
  (`"15000.00"`) para no perder precisión, y así se muestran.
- **RF-313** — La fecha se muestra como fecha de calendario, sin pasar por conversión de
  zona horaria. Una fecha `2026-09-12` interpretada como UTC se ve como el 11 en Argentina.

### Cuando no hay nada, o algo falla

- **RF-314** — Estado vacío que **dice qué hacer**, no "no hay datos".
- **RF-315** — Los cuatro estados se distinguen entre sí, y ninguno se muestra como una
  lista vacía: hay presupuestos · no hay ninguno cargado · se cerró la sesión · no se pudo
  conectar.
- **RF-316** — Todo error dice qué pasó y qué hacer, en castellano, sin jerga de software.

---

## Preguntas que la pantalla tiene que poder contestar

1. ¿Qué presupuestos se emitieron, del más nuevo al más viejo?
2. ¿Qué presupuesto corresponde a esta patente que tengo delante?
3. ¿Cuánto salió cada uno?
4. ¿Hay sesión activa, y de quién?
5. Si no se ve nada: ¿es porque no hay nada cargado, o porque algo falló?

---

## Criterios de aceptación

1. Sin sesión, no se ve ninguna fila y se ve la pantalla de login.
2. Con sesión y la base vacía: dice que todavía no hay presupuestos cargados, y muestra
   quién está conectado.
3. Con la sesión vencida a propósito: dice que se cerró la sesión. **No** dice que no hay
   presupuestos.
4. Con una fila cargada a mano desde el panel de Supabase: aparece con su número, patente y
   total, y ese total coincide con lo que devuelve `vw_presupuestos` consultada directo.
5. Ningún archivo de `ui/` importa el cliente de Supabase. Lo verifica un test.
6. Se lee de la vista, nunca de las tablas.
7. En un celular, parado, con una mano: la patente se lee sin acercarse el teléfono.
8. El sitio publicado en GitHub Pages carga y permite entrar.

---

## Lo que necesito de la base, y no está

- **`dias_desde_presupuesto` en una vista.** El principio III pone los días transcurridos del
  lado de la base, no de la aplicación. **Decisión de esta spec:** el tablero v1 muestra la
  **fecha** y no los días, y los días se agregan cuando la columna exista. Es una spec de una
  línea en el repo del modelo, y tiene una trampa: `current_date` en Supabase está en UTC, así
  que entre las 21 y las 24 de Argentina contaría un día de más. Hay que escribirlo
  `(now() at time zone 'America/Argentina/Buenos_Aires')::date`.

## Lo que esta spec descubrió, y hay que tener presente

**Con 80 presupuestos por mes, el tablero se llena rápido y deja de servir solo.** Si nadie
marca los que no se concretaron, en tres meses hay 240 filas de las cuales la mayoría son
autos que nunca entraron al taller. La lista se vuelve un archivo, no un tablero.

Eso convierte al **botón de "no concretado"** en lo que hace que el tablero siga sirviendo
al segundo mes, no en una mejora opcional. Y al **estado operativo del auto** —una columna en
la base— en lo que lo convierte en el semáforo que el nombre promete.

Dicho de otra forma: esta pantalla nace con fecha de caducidad si se queda sola.

## Pendientes de aclaración

Ninguno. Los dos que había quedaron resueltos: el techo es 100 filas (80 presupuestos por
mes) y la sesión queda abierta.

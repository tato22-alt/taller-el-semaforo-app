# Hallazgos de verificación 001 — Presupuesto

**Estado:** los hallazgos de los bloques A, B y C están cerrados. Queda abierto H11, que se decide en el bloque D.
**Origen:** pase de verificación tras implementar los bloques A, B y C (T001–T010)
**Spec:** `spec.md` · **Plan:** `plan.md` · **Constitución:** v3.0.0

Este documento no decide nada. Registra lo que la implementación descubrió, para que se
corrija la spec antes de seguir — principio X: la spec precede a la migración, y cuando la
implementación descubre que la spec estaba equivocada se corrige la spec, no se deja el DDL
como única verdad.

Cada hallazgo dice: qué se rompe, en qué caso real, y qué requisito toca. Las opciones están
para elegir, no aplicadas.

---

## Estado real de lo verificado

Corrido y verificado en Supabase, a mano, desde el editor SQL:

| Tarea | Verificado con | Resultado |
|---|---|---|
| T001 | Migración sobre base vacía | corre limpia |
| T002 | Insert sólo con nombre | `nombre_norm` = `JUAN PÉREZ` |
| T003 | `aa 123-bb` vs `AA123BB` | colisionan, unicidad activa |
| T004 | `AAR222` / `AA000AA` / `X1` | true / true / false; patente rara se guarda |
| T005 | Insert sin cliente, sin vehículo, sin origen | entra, defaults correctos |
| T006 | Dos conceptos fuera de orden | vuelven ordenados por `orden` |
| T007 | `set role anon` + select/insert | 0 filas / bloqueado por RLS |
| T008 | `set role anon` + select | `42501 permission denied` |
| T009 | Vista sobre trabajo con 2 conceptos | 23000 + 1000 = 24000, derivado |
| T010 | Las 7 preguntas | 6 responden; la 3 falla (hallazgo 1) |

Esa tabla es el registro de la verificación **manual**, que resultó no ser confiable (ver H10).
La verificación que vale hoy es `qa-001-verificacion.sql`: 41 comprobaciones en una sola
consulta.

| Corrida | Entorno | Resultado |
|---|---|---|
| Local, base vacía | PostgreSQL 16, las trece migraciones desde cero, roles de Supabase replicados | **49 PASA · 0 FALLA** |
| Local, base poblada | Migraciones 1–9 + datos equivalentes a los reales, después las cuatro enmiendas | **49 PASA · 0 FALLA** |
| Local, doble pasada | Las trece migraciones aplicadas dos veces seguidas | **49 PASA · 0 FALLA** |
| **Supabase** | Proyecto real `osslhkvdclrbukjqwpnt`, las trece migraciones aplicadas | **49 PASA · 0 FALLA** |

Las cuatro corridas coinciden verificación por verificación. Nada quedó inferido: el 49/49 sobre
la base real está medido.

En local se corrió tres veces seguidas con idéntico resultado y dejando la base en cero filas.

**Estado de los datos:** la base real quedó vacía y con los contadores de id en cero
(`truncate ... restart identity`), lista para la primera carga real. H9 cerrado.

---

## Hallazgos

### H1 — La búsqueda por nombre no encuentra nombres con tilde · RESUELTO

**Qué pasa.** La pregunta 3 de la spec devuelve vacío buscando `perez` cuando el cliente es
`Juan Pérez`. `ILIKE` es insensible a mayúsculas, no a acentos.

**Caso real.** Alguien busca "perez" desde el teléfono, sin tilde, y el sistema dice que ese
cliente no existe. Lo carga de nuevo. Ahora hay dos "Pérez".

**Toca.** Pregunta 3, criterio de aceptación 5, y agrava el riesgo de duplicados de D5.

**Opciones.**

1. **Dejarlo.** Hay que buscar con tilde. Es lo que dice la spec hoy, literal.
2. **Agregar `unaccent`** y redefinir `clientes.nombre_norm` para que también saque acentos.
   Cuesta una migración que recrea la columna generada (Postgres no deja alterar su
   expresión), sobre una tabla que ya tiene RLS y permisos — hay que verificar que no se
   pierdan. Es una enmienda a RF-009 y al esquema de `clientes` del plan.

---

### H2 — Nunca se probó que un usuario autenticado pueda leer y escribir · RESUELTO

**Qué pasa.** Se verificó exhaustivamente que `anon` no puede hacer nada. No se verificó
nunca lo contrario: que `authenticated` sí puede. Las pruebas se corrieron como `postgres`,
que bypassea RLS y no prueba ninguna política.

**Caso real.** Se conecta la página, entra el primer usuario real, y no ve nada — o no puede
guardar. Un `GRANT` de más en el `REVOKE` de T008, una política mal escrita, o una columna
`IDENTITY` que necesita permiso sobre su secuencia, y no nos enteramos hasta producción.

**Toca.** T007, T008, T009 — los tres se dieron por cerrados sin esta prueba. D8.

**Qué falta correr** (no cambia nada, sólo verifica):

```sql
set role authenticated;
select * from vw_presupuestos;              -- tiene que devolver filas
select * from trabajos;                      -- tiene que devolver filas
insert into clientes (nombre) values ('Prueba autenticado');  -- tiene que funcionar
reset role;
delete from clientes where nombre = 'Prueba autenticado';
```

**Resuelto.** Se corrió a mano contra Supabase: `authenticated` lee la vista y escribe sin
problema. Además quedó automatizado en `qa-001-verificacion.sql`, verificaciones 36 y 37, así
que se vuelve a comprobar en cada corrida y no depende de que alguien se acuerde.

---

### H3 — La validación de patente da falso negativo si le llega la patente cruda · RESUELTO

**Qué pasa.** `fn_es_formato_patente_valido` espera la patente ya normalizada. Con `aar222`
en minúscula devuelve `false`. Lo descubrimos probando: pasó exactamente eso.

**Caso real.** La página la usa "para advertir mientras se tipea" (D3) — o sea, sobre lo que
la persona está escribiendo, que es justamente texto crudo. Va a marcar como inválida toda
patente escrita en minúscula o con guión. La gente aprende a ignorar la advertencia, y
entonces la advertencia no sirve para nada.

**Toca.** RF-022, D3.

**Opciones.**

1. **Dejarlo** y documentar que quien llama tiene que normalizar antes.
2. **Que la función normalice internamente** antes de comparar. Es un cambio chico
   (`create or replace`), no toca ninguna tabla, y hace que la función sea correcta para el
   único uso que la spec le da.

---

### H4 — "Un solo acto" no es atómico

**Qué pasa.** El criterio de aceptación 1 pide registrar cliente + vehículo + presupuesto
"en un solo acto". Contra Supabase eso son tres llamadas REST separadas: tres transacciones
distintas. No hay nada que las agrupe.

**Caso real.** Se corta el wifi del taller entre la segunda y la tercera. Queda un cliente y
un vehículo creados, sin presupuesto. Nadie lo ve nunca, y el próximo presupuesto de ese auto
"reutiliza" un vehículo huérfano. Con dos o tres de estos por mes, la base se ensucia sola.

**Toca.** Criterio de aceptación 1, escenario E1.

**Opciones.**

1. **Dejarlo, y es de la aplicación.** La constitución dice que este repositorio *no* es
   responsable de "reglas de proceso, interfaz, orquestación ni presentación". Resolver el
   orden de tres inserts es orquestación. El riesgo es real, pero atajarlo acá sería meter
   alcance que la constitución sacó a propósito.
2. **Una función RPC** (`fn_registrar_presupuesto`) que reciba todo y lo inserte en una sola
   transacción. Supabase la expone como endpoint. No sería un automatismo prohibido por el
   principio VI (alguien la invoca, no se dispara sola), pero sí sería orquestación dentro de
   la base.

**Corrección de este hallazgo.** Al escribirlo recomendé la opción 2 sin haber contrastado
contra el alcance declarado en la constitución. Contrastado, la opción 1 es la que respeta el
reparto de responsabilidades del proyecto: el hueco existe, pero se tapa en la aplicación, no
acá. Queda como advertencia para quien construya la app, no como tarea de este repositorio.

---

### H5 — RF-020 no está garantizado: un número borrado se puede reusar · RESUELTO

**Qué pasa.** RF-020 dice que un número emitido no se reutiliza nunca, "ni siquiera si el
presupuesto se borra". El índice único sólo impide dos filas simultáneas con el mismo número.
Si se borra el trabajo 16043, el 16043 queda libre otra vez.

**Caso real.** Se carga un presupuesto mal, se borra, se vuelve a cargar. Dos papeles
distintos con el mismo número, y el segundo pisó al primero en el historial. Es exactamente
el riesgo que la herramienta actual mitiga con `maxEmitido`, que nunca retrocede.

**Toca.** RF-020. El plan delega la *asignación* al feature 002, pero la *garantía de no
reúso* es estructural y no está.

**Opciones.**

1. **Es del feature 002.** El que asigne números lleva el máximo histórico, como hace hoy la
   herramienta. La base no lo garantiza sola.
2. **Un registro de números emitidos** en esta feature: una tabla a la que sólo se agrega, y
   de la que nunca se borra. Cuesta una tabla que la spec no pidió (principio V pide
   justificar cada estructura).

Nota: el número **16043 ya está quemado** por los datos de prueba (ver H9).

---

### H6 — El índice de búsqueda de clientes no lo usa ninguna consulta · RESUELTO

**Qué pasa.** T002 creó un índice de trigramas sobre `clientes.nombre_norm`. La consulta de
la pregunta 3 filtra por `vw_presupuestos.cliente_actual`, que es `clientes.nombre` — otra
columna. Postgres no puede usar ese índice para esa consulta. El índice está muerto.

**Caso real.** Con tres personas y unos miles de presupuestos no se va a notar nunca. Pero es
una inconsistencia entre lo que el plan dijo que hacía falta y lo que las consultas hacen.

**Toca.** Sección "Índices" del plan, pregunta 3.

**Opciones.** Que la consulta filtre por `nombre_norm` (y entonces hay que exponerlo en la
vista), o mover el índice a `nombre`. Se resuelve junto con H1, porque si se agrega `unaccent`
la normalización cambia igual.

---

### H7 — La pregunta 7 deja afuera los presupuestos sin fecha · RESUELTO

**Qué pasa.** La consulta mensual filtra `where fecha_presupuesto is not null`. RF-008 dice
que la fecha puede faltar.

**Caso real.** El total de un mes no cuadra con la suma de los presupuestos de ese mes, porque
algunos no tienen fecha y desaparecen del conteo sin avisar.

**Toca.** Pregunta 7, RF-008.

**Resuelto, y más grande de lo que parecía.** Luciano: *"mano de obra y los datos no pueden
faltar, lo que a veces no se necesita son repuestos"*. Eso es una regla de carga, no una
restricción del esquema: hacerla `NOT NULL` dejaría afuera el histórico incompleto (RF-019) y
empujaría a que alguien escriba `xx` con tal de guardar (principio IV). Quedó así:

- **RF-024** (nuevo): un presupuesto cargado hoy está completo si tiene fecha, cliente con
  nombre, dirección y teléfono, y mano de obra mayor a cero. Repuestos y vehículo, no.
- La exige **la aplicación**; la base la reporta con `vw_presupuestos_incompletos`, que devuelve
  qué le falta a cada uno. Vista, no columna — principio I.
- El corte mensual ya no descarta los sin fecha: salen en una fila aparte, con el mes en nulo,
  para que se vean y se corrijan.

**Aparte, menor:** `date_trunc('month', fecha_presupuesto)` devuelve `timestamptz`
(`2026-09-01 00:00:00+00`), no una fecha. Invita justo a la confusión que D6 quiere evitar.
Conviene cerrarlo con `::date`.

---

### H8 — No hay registro de qué migraciones se corrieron

**Qué pasa.** Las migraciones se pegan a mano en el panel. Nada anota cuáles se aplicaron. La
única fuente es esta conversación.

**Caso real.** En dos semanas nadie sabe si la base tiene T008 o no. Se vuelve a correr una
migración y falla a la mitad, o peor: se saltea una y queda una tabla sin RLS. El plan ya
marca esto como riesgo abierto ("conviene verificarlo en cada migración") pero no lo resuelve.

**Toca.** Proceso, no esquema. La restricción de que no hay salida de red viene del entorno.

**Cubierto en parte, después de escribir esto.** `qa-001-verificacion.sql` responde la
pregunta que de verdad importa: no *qué migraciones corrieron*, sino *si el esquema es el que
debería ser*. Sus trece verificaciones de estructura detectan una migración salteada — una
tabla sin RLS, un índice que falta, un privilegio que quedó — en una sola consulta.

**Lo que sigue abierto.** Saber en qué punto de la serie está la base si alguna vez hay que
retomarla a ciegas. Opciones: una tabla `migraciones_aplicadas` que cada migración escribe al
final, o adoptar la CLI de Supabase cuando haya red. Recomendación: no agregar la tabla —
correr el QA cuesta menos y dice más.

---

### H9 — La base tiene datos de prueba adentro · RESUELTO

**Qué pasa.** Quedaron: cliente `Juan Pérez` (id 1), vehículo `x1-rara` (id 3), trabajo
`id_trabajo=1` con número **16043** y dos conceptos por 23000.

**Caso real.** Si esto sigue ahí cuando entren los datos reales, el 16043 está ocupado por un
presupuesto que no existe, y el primer reporte mensual arranca con 24000 de más.

**Qué falta.** Limpiarlos antes de que entre nada real, y decidir si los datos de prueba
vuelven de forma controlada en T016 (que ya existe en `tasks.md` justamente para eso).

---

### H10 — El método de verificación usado hasta acá era inválido · RESUELTO

**Qué pasa.** El editor SQL de Supabase muestra **sólo el resultado de la última sentencia**
de un bloque. Durante T001–T010 se verificó pegando bloques de varias sentencias y mirando un
único resultado: el de la última. Todo lo anterior de cada bloque quedó sin mirar.

**Caso real.** No es hipotético, pasó tres veces en esta implementación: se dio por buena una
tabla que todavía no existía, se leyó como `false` una función que en realidad no se había
ejecutado, y se confirmó un `insert` mirando el `Success` de otra línea. Cualquiera de esas
podría haber sido una falla real dada por buena.

**Resuelto.** Todo el QA es ahora **una sola función que devuelve una tabla de veredictos**
(`qa-001-verificacion.sql`): una fila por verificación, con PASA / FALLA / ABIERTO. La única
sentencia que devuelve resultados es la última, así que la limitación del editor deja de
esconder nada.

**Regla que queda:** ninguna verificación de este repositorio se hace con sentencias sueltas
en un bloque. Se agrega como verificación a la función de QA, y se corre entera.

---

### H11 — Normalizar sin acentos sirve para buscar, pero es peligroso para deduplicar · RESUELTO

**Qué pasa.** La enmienda H1 hace que `nombre_norm` ignore acentos. `unaccent` también convierte
`Ñ` en `N`, así que `MARÍA ÑANDÚ` queda como `MARIA NANDU`. Para **buscar** es lo que se quería.
El problema es el otro uso de esa misma columna.

**Caso real.** D5 dice que la importación resuelve el cliente **por nombre normalizado**, y crea
uno nuevo si no lo encuentra. Con la normalización sin acentos, `Peña` y `Pena` pasan a ser el
mismo nombre — y son dos apellidos distintos, los dos comunes. La importación los fusionaría en
un solo cliente, en silencio.

Eso choca de frente con el razonamiento que el propio D5 dejó escrito: *"Duplicar y unir a mano
de a uno es reversible; fusionar de más, no."* Es el mismo argumento por el que se decidió no
unificar por teléfono.

Del otro lado: `Pérez` y `Perez` casi siempre **son** la misma persona escrita de dos maneras, y
ahí la normalización sin acentos ayuda. O sea que la misma regla mejora un caso y empeora el otro.

**Toca.** D5, T013 (consolidación de la importación), RF-019. No afecta a nada de lo que está
corrido hoy: sólo importa cuando se construya la importación, en el bloque D.

**Opciones.**

1. **Dos normalizaciones, cada una para lo suyo** (recomendada). `nombre_norm` sin acentos sigue
   siendo la de **buscar**. La importación coteja con una forma más estricta —mayúsculas y
   espacios, pero respetando acentos y la Ñ— de modo que ante la duda duplica en vez de fusionar,
   que es la dirección reversible. Cuesta una función más, `fn_cotejar_nombre`, y ninguna columna.
2. **Una sola normalización.** La importación coteja por `nombre_norm`. Más simple, y unifica
   bien los `Pérez`/`Perez`. Acepta que algún `Peña`/`Pena` se fusione mal, sin vuelta atrás.

**Decidido por Luciano: "si peña y pena es lo mismo".** Se coteja con `nombre_norm`, la misma
normalización sin acentos que usa la búsqueda. `Peña` y `Pena` se unifican, igual que `Pérez` y
`Perez`. No hace falta una segunda función de cotejo. Se acepta que dos apellidos distintos que
sólo difieren en la eñe queden fusionados; a cambio, los mismos clientes escritos de dos maneras
—que es el caso frecuente— dejan de duplicarse.

---

### H12 — Hay dos versiones de la herramienta dando vueltas · CORREGIDO

**Cómo se registró primero, y por qué estaba mal.** Con el HTML que Luciano subió, di por hecho que
esa era la herramienta publicada y anoté que la spec describía una versión inexistente. Era al revés.
El CSV real y el código publicado (`tato22-alt/semaforo-presupuesto` @ `178fb1d`, el mismo commit que
la spec cita) confirman que **la spec es exacta**:

| Lo que la spec dice | El publicado hace | ¿Coincide? |
|---|---|---|
| CSV de 14 columnas, con `creado_en` y `modificado_en` | `COLUMNAS` tiene las 14 | sí |
| `{version, inicializado, maxEmitido, guardados}` | están las cuatro | sí |
| La serie arranca en 16000 | `const PRIMER_NUMERO = 16000` | sí |
| La patente se guarda normalizada | `normalizarPatente = v => v.toUpperCase().replace(/[\s.-]/g,'')` | sí |
| Todo presupuesto deja al menos una fila | `if(!filas.length) filas.push([...izq,'','',...der])` | sí |
| Máximo histórico que nunca retrocede | `maxEmitido`, y al restaurar sube con `Math.max` | sí |

**El hallazgo real.** El archivo que Luciano subió **no es el publicado**: arranca en 16001, exporta
12 columnas, no normaliza la patente, guarda `{guardados, proximo}` y no tiene ninguna de las
protecciones de numeración. Es una variante más simple.

**Por qué importa igual.** Si esa variante corre en algún equipo del taller, sus datos se comportan
distinto: numeración que puede volver a 16001 sin avisar, patentes sin normalizar, y un CSV que la
importación no va a poder leer con el mismo parser. Conviene confirmar que nadie la esté usando.

**Lección de método.** La spec citaba el commit exacto de la fuente. Había que leer eso antes de
tratar como autoritativo un archivo suelto, y no al revés.

---

### H13 — La regla de idempotencia de RF-018 · RESUELTO, con el motivo corregido

**Cómo se registró primero, y por qué estaba mal.** Anoté que RF-018 no se podía implementar porque
el CSV no traía `modificado_en`. **Sí lo trae** — la columna existe en el publicado y en el CSV real.
La conclusión salió de la variante equivocada.

**Qué queda.** Luciano eligió que la importación **agregue lo que falta y nunca pise lo que ya está**.
La decisión se sostiene por sus propios méritos, aunque el motivo que le di era falso:

- Ninguna actualización automática puede distinguir una corrección deliberada hecha en la base de un
  dato viejo que vuelve. No pisar es lo único que no puede perder datos en silencio.
- Es exactamente lo que hace la herramienta al restaurar un CSV:
  `const nuevos = r.presupuestos.filter(p => !hay.has(p.numero))`.
- Y como `modificado_en` sí existe, el informe de diferencias puede además decir cuál versión es más
  nueva, sin que eso dispare ninguna escritura.

La alternativa descartada —actualizar cuando el archivo es más nuevo— es implementable. Se descarta
por decisión, no por imposibilidad.

---

### H14 — "Un presupuesto puede desaparecer del CSV" · RETIRADO, no existe

**No aplica.** El publicado ya emite una fila vacía cuando un presupuesto no tiene ni renglones ni
mano de obra:

```js
if(!filas.length) filas.push([...izq, '', '', ...der]);
```

La spec lo decía correctamente ("todo presupuesto deja al menos una fila, incluso sin conceptos"). El
agujero existía sólo en la variante que no está publicada.

**El parche que se había preparado para la página queda retirado y no debe aplicarse:** agregaría una
segunda fila vacía a presupuestos que ya emiten una.

---

### H15 — Cómo se identifica la fila de mano de obra · RESUELTO

**Lo que sigue siendo cierto.** Ni la columna sola ni el texto solo alcanzan. `monto_mano_obra` se
repite en todas las filas del presupuesto, así que no distingue nada; y un repuesto puede llamarse
"Mano de obra" con el mismo importe, con lo que las dos filas quedan idénticas.

**La regla, tomada del lector de la propia herramienta** en vez de inventada — para que no existan dos
lecturas distintas del mismo archivo:

```js
if(p.monto_mano_obra){
  for(let i = resto.length - 1; i >= 0; i--){
    if(T(resto[i][7]) === 'Mano de obra' && aNum(resto[i][COL_IMPORTE]) === p.monto_mano_obra){
      resto.splice(i, 1);
      break;
    }
  }
}
```

De atrás hacia adelante, se descarta **una sola** fila: la primera cuyo detalle sea exactamente
"Mano de obra" y cuyo importe coincida con `monto_mano_obra`. Después se descartan los renglones sin
detalle y sin importe. Como control, la suma de los renglones restantes tiene que dar
`subtotal_repuestos`.

---

### H16 — No hay histórico que importar: el bloque D se queda sin motivo

**Qué pasa.** Luciano: *"No tenemos registro histórico, estamos migrando de presupuesto físico a
digital."* El bloque D entero (T011–T015) existe para traer a la base los presupuestos ya cargados
en el navegador. Si no hay ninguno, no hay nada que traer.

Toda la justificación de esas cinco tareas está en la spec, y toda apunta al mismo supuesto:

- **E6** — *"Los presupuestos ya cargados en el navegador tienen que poder incorporarse a la base
  sin volver a tipearlos."*
- **RF-017 a RF-019** — el formato del CSV, la repetibilidad, y que el pasado entre sucio como está.
- **Criterio de aceptación 6** — *"El CSV de la herramienta actual se importa completo."*
- El *Por qué* de la spec: *"Ese historial vive en el `localStorage` de una máquina."*

Ese historial no existe. Lo que hay es un talonario de papel, y el papel no se importa: se sigue
numerando desde donde quedó.

**Propuesta: diferir, no borrar.** Cinco tareas para migrar cero filas es exactamente lo que el
principio V manda no construir — *"si la respuesta es 'podría servir algún día', no entra"*. Pero la
spec y el plan se conservan tal cual: si entre hoy y el momento en que la página se conecte alguien
carga presupuestos en el navegador, esos sí van a necesitar el importador, y entonces el bloque D
vuelve con su motivo intacto.

**La consecuencia importante, y es al revés de lo que dije antes.** Yo había dicho: *"la importación
va primero, porque si anclás la página antes, la base no sabe cuál es el último número"*. Sin
histórico, eso se da vuelta:

- Ya no hay nada que importar antes de conectar. **El bloque D deja de bloquear al feature 002.**
- Y conectar la página pasa a ser **más urgente**, no menos: cada presupuesto que se cargue en el
  navegador desde ahora es un presupuesto que después habrá que mover a mano — o que va a obligar a
  construir el importador que hoy no hace falta. El histórico que hoy no existe empieza a crecer el
  día que alguien use la herramienta sin conectar.

**Un detalle concreto para el feature 002.** Con la base vacía, `max(numero_presupuesto)` es nulo.
Quien asigne números tiene que arrancar en **16000** (RF-001, y `PRIMER_NUMERO` de la herramienta),
no fallar ni empezar en 1. Y hay que confirmar en qué número quedó el talonario de papel: si ya pasó
el 16000, la serie digital tiene que arrancar más arriba.

**Sin decidir.** Necesita el visto bueno de Luciano antes de tocar `tasks.md`. Mientras tanto, las
cinco tareas quedan escritas y sin empezar.

---

## Lo que ya está previsto y no es hallazgo

`tasks.md` ya contempla la mayor parte del QA que falta, y no hace falta inventar tareas:

- **T016** — datos de prueba que cubren los seis escenarios.
- **T017** — verificación de los siete criterios, registrando cómo se probó cada uno.
- **T018** — diccionario de datos: zonas horarias, campos derivados, qué no toca la importación.

Tres criterios de aceptación siguen **sin probar** y sólo se pueden probar en T016/T017, con
datos que hoy no existen:

- **Criterio 3** — un segundo presupuesto sobre la misma patente reutiliza el vehículo.
- **Criterio 4** — corregir el nombre de un cliente no altera un presupuesto ya emitido (hoy
  imposible de probar: el único trabajo cargado tiene los `txt_*` en nulo).
- **Criterio 6** — el CSV importa completo y reimportarlo no duplica (bloque D, sin empezar).

---

## Propuesta de orden

1. ~~Correr H2~~ — hecho: pasa, y quedó automatizado.
2. Correr `qa-001-verificacion.sql` contra Supabase, para confirmar que la base real coincide
   con lo verificado en local.
3. Decidir H1, H3, H5, H7 — son enmiendas a la spec, y por el principio X van a la spec antes
   que a una migración.
4. Decidir H4 y H8, que agregan tareas al plan.
5. Limpiar H9 antes de cualquier dato real.
6. Recién entonces, bloque D — y cada tarea nueva suma sus verificaciones a la función de QA.

---

## H17 — Las advertencias del linter de Supabase

**Qué pasó.** El panel de Supabase reporta doce advertencias de seguridad sobre esta base. No
todas son problemas, y dos de ellas describen decisiones tomadas a propósito.

### Se arregla: `search_path` mutable (cinco funciones)

Legítima. Sin `search_path` fijo, una función resuelve los nombres con el del que la llama;
quien pudiera crear objetos en un esquema que se busque antes que `public` lograría que la
función use los suyos. Acá el riesgo concreto es bajo —sólo el taller tiene sesión y `anon` no
ejecuta nada— pero el arreglo no tiene contraindicación.

Ya había precedente: `fn_normalizar_nombre` lo lleva desde H1, y de ella depende la columna
generada `clientes.nombre_norm` sin problema. Migración `20260910130000_search_path_funciones.sql`,
más la función del QA en su propio archivo. **Verificado: 57 PASA / 0 FALLA después del cambio.**

### Se acepta: las políticas RLS son `USING (true)`

El linter las marca porque en una aplicación multiusuario eso sería un agujero: cualquiera vería
las filas de cualquiera. **Acá no hay filas de otro.** El taller es un solo inquilino; RLS existe
para bloquear a `anon`, no para repartir filas entre usuarios (D7, D8). "Arreglarlo" exigiría
inventar una noción de dueño de la fila que el negocio no tiene.

Lo que sí importa —que `anon` no lea ni escriba nada— lo verifica el QA en cada corrida.

### Se acepta: `pg_trgm` y `unaccent` viven en `public`

Acá hubo que corregir una conclusión apresurada. Primero pareció que moverlas rompía la base: el
QA caía a 56/1 con `function unaccent(unknown, text) does not exist`. Eso era un defecto de la
prueba —el esquema nuevo se había creado sin permiso de uso para los roles—. Con los permisos que
Supabase ya trae, **mover las extensiones funciona: 57 PASA / 0 FALLA.**

Lo que sí cambia, y es la razón para no hacerlo ahora: una llamada directa a `similarity()`,
`unaccent()` o al operador `%` **desde fuera de una función con `search_path`** deja de resolver.
Hoy nada de eso ocurre, pero la consulta de posibles duplicados (T015, planeada) usa
`similarity()`, y quedaría rota de una forma nada evidente.

Decisión: **no se mueven.** Es una mejora opcional sobre una base en producción, el beneficio real
es marginal en un sistema de un solo inquilino, y el costo es una trampa para el próximo que
escriba una consulta. Si algún día se hace, se hace con el QA en la mano.

### Se activa en el panel: protección de contraseñas filtradas

No es SQL: es una opción de Supabase Auth que compara las contraseñas contra las bases de
contraseñas filtradas. Gratis, sin contraindicación, y las contraseñas de los usuarios del taller
las eligió una persona. Conviene activarla.

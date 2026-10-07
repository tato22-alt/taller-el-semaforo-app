# Dónde está el modelo hoy, y qué sigue

Reemplaza a una lista de deseos heredada del modelo académico que proponía varias cosas que la
constitución v3.0.0 prohíbe expresamente. Una hoja de ruta que contradice los principios es peor que
no tener ninguna: alguien la lee y construye lo que se decidió no construir.

---

## Lo que hay hoy

Cuatro tablas, dos vistas, seis funciones, **cero triggers**.

| | |
|---|---|
| `clientes` | Sólo exige el nombre. Se busca ignorando mayúsculas y acentos |
| `vehiculos` | Por patente única y normalizada por el motor |
| `trabajos` | El expediente. Nace del presupuesto y lleva su número. **No se borra** |
| `trabajo_items` | Los conceptos, en el orden en que se cargaron |
| `vw_presupuestos` | Una fila por trabajo, con los totales calculados al leer |
| `vw_presupuestos_incompletos` | A qué presupuesto le falta qué |

La base reparte los números de presupuesto desde el 16000 y no puede repetir ninguno, ni siquiera si
un presupuesto no se llega a guardar.

RLS en las cuatro tablas. El rol anónimo no tiene absolutamente nada: ni leer, ni escribir, ni pedir
un número. De eso depende que la clave publicable pueda vivir en un repositorio público.

**Verificado:** 58 comprobaciones en una sola consulta, sobre Supabase y sobre PostgreSQL local, en
base vacía y poblada. `specs/001-presupuesto/qa-001-verificacion.sql`.

**Lo que todavía no existe:** deuda, cobranza, facturación, documentos, seguro, siniestro, estado
operativo. Cada uno necesita su spec aprobada antes de tocar el esquema.

---

## Lo próximo, en orden

### 1. Conectar la página del presupuesto

Es lo único que falta para que el sistema empiece a servir de verdad. La base ya está lista; lo que
falta está del lado de la página:

- **Login.** Hoy no tiene ninguno, y sin sesión iniciada no se puede leer ni escribir nada.
- **Confirmar los usuarios** de Supabase Auth: `select id, email, created_at from auth.users`.
- **Pedirle el número a la base** con `fn_proximo_numero_presupuesto()` en vez de repartirlo desde el
  navegador.
- **Guardar contra la base** en lugar del `localStorage`.

**Es lo más urgente, y el motivo es concreto:** cada presupuesto que se cargue en el navegador sin
conectar es uno que después habrá que mover a mano — o que va a obligar a construir el importador que
hoy no hace falta.

Dos cosas a tener en cuenta al construirla, que son de la aplicación y no de la base:

- **Crear cliente + vehículo + presupuesto son llamadas separadas.** Si se corta la conexión en el
  medio quedan huérfanos. Agruparlas es orquestación, que la constitución pone fuera de este
  repositorio, así que lo resuelve la página.
- **Los campos que exige al cargar** (fecha, cliente con dirección y teléfono, mano de obra) los
  valida la página. La base los reporta con `vw_presupuestos_incompletos` pero no bloquea: si
  bloqueara, alguien escribiría "xx" con tal de guardar, y un "xx" miente y no se detecta.

### 2. Deuda y cobranza

La dolencia número uno del negocio y el motivo del proyecto. Necesita su spec. Los principios ya
fijan buena parte del diseño antes de escribirla:

- El deudor es un dato propio, nunca una inferencia del origen del trabajo (VII).
- El saldo se calcula al leer, nunca se almacena (II).
- Las retenciones se imputan a la deuda aunque no entren a la cuenta, para que el saldo pueda llegar
  a cero (VIII).
- Ningún automatismo marca algo como cobrado (VI).

### 3. Estado operativo del trabajo

Dónde está el auto. Es el **único** campo de estado que el modelo admite (I). Hoy no existe; cuando
llegue es una columna más en `trabajos`, no un rediseño.

### 4. Facturación, documentos, seguro y siniestro

Cada uno con su spec, cuando el negocio lo pida.

---

## En pausa

**La importación del histórico** (bloque D del feature 001), escrita y sin empezar: no hay registro
histórico que importar, el taller está pasando de papel a digital. Vuelve a tener sentido sólo si se
cargan presupuestos en el navegador antes de conectar la página.

**Fusionar clientes duplicados.** Todavía no hay ninguno. Cuando los haya, hace falta una consulta
que liste nombres parecidos y una forma de unir dos fichas a mano. Duplicar es reversible; fusionar
mal, no.

---

## Lo que NO se va a construir

No son pendientes: es lo que el principio IX sacó del alcance a propósito. Entra sólo con una
enmienda escrita a la constitución que nombre la dolencia que resuelve.

| No entra | Por qué |
|---|---|
| Cuenta corriente y pagos a proveedores | Principio IX |
| Conciliación bancaria | Principio IX |
| Stock e inventario | Principio IX |
| RRHH y productividad | Principio IX |
| Planificación de capacidad | Principio IX |
| Portal de clientes | Principio IX |
| Sub-etapas de la reparación (chapa, pintura, pulido, lavado) | Principio IX |
| Asignación de tareas por operario | Principio IX |
| Registro manual de comunicaciones | Principio IX |
| Historial de correcciones de un presupuesto | RF-016 lo decidió: el presupuesto vigente es el que está. Se acepta perder la traza de un importe corregido a cambio de no agregar una tabla que nadie va a consultar |
| Columnas de estado financiero, documental o de siniestro | Principio I. La respuesta correcta es una vista, no una columna |
| Cualquier dato derivable, almacenado | Principio II. Un dato derivado que se almacena es uno que alguien va a olvidar de actualizar |
| Triggers que escriban estados | Principio VI. El modelo anterior tenía uno que cerraba un trabajo entero ante una seña |

El taller ya funciona. Su problema es administrativo. Cada tabla que modela la operación agrega carga
de datos sin resolver ninguna de las cuatro dolencias críticas.

---

## Lo que decide la aplicación, no esta base

Está acá para que no se pida por error en una spec de datos: el color del semáforo, la prioridad de
una lista, el texto de un aviso, a quién se le muestra qué y cuándo.

La base entrega magnitudes deterministas. Cualquier consumidor —la página, una automatización, una
capa de IA— obtiene de acá los mismos números.

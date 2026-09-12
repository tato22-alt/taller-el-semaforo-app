# Especificación 002 — Alcance y límites de la aplicación

| | |
|---|---|
| **Estado** | Borrador para revisión |
| **Fecha** | 2026-09-12 |
| **Reemplaza a** | `specs/001-mvp-gestion/spec.md` |
| **Constitución vinculante** | Repo del modelo, `.specify/memory/constitution.md` v3.0.0 |
| **Base de datos** | `gestion-taller-sql-server`, rama `claude/semaforo-taller-system-eroppo` |

> **Qué contesta este documento.** Dos preguntas: **dónde termina la app**, y **cómo se
> recauda información automáticamente** para decidir mejor sin convertir a nadie en
> cargador de datos.

---

## 1. De dónde viene esto

El presupuesto era papel. Se convirtió en una herramienta web que guardaba en el navegador.
De ahí salió el modelo de datos, y hoy la base está aplicada y verificada: cuatro tablas,
dos vistas, seis funciones, numeración desde el 16000 que no puede repetirse, RLS puesto.

Ese recorrido dejó una oportunidad: **los presupuestos ya se cargan igual.** Nadie los carga
"para el sistema", los carga porque necesita entregarle un presupuesto al cliente. Toda
información que se pueda sacar de ahí es información **gratis**.

El problema a resolver ahora no es técnico. Es que hoy nadie puede contestar de memoria qué
autos hay, hace cuánto están, y quién debe plata.

---

## 2. El principio que ordena todo: no se pregunta, se deriva

La regla madre del `CLAUDE.md` dice que la app no debe convertir a las personas en
cargadores de datos. Llevada a los límites del proyecto, significa esto:

> **Un dato que hay que cargar aparte se deja de cargar en tres semanas.** La única
> información sostenible es la que sale de un hecho que alguien ya iba a registrar igual.

Por eso **los límites de esta app no se definen por pantallas, se definen por hechos.** La
pregunta correcta no es "¿qué pantalla falta?" sino:

1. ¿Qué se puede saber con los hechos que ya se registran? → gratis, se hace.
2. ¿Qué requiere registrar un hecho nuevo? → se paga en carga, y hay que justificarlo.
3. ¿Qué no se puede saber ni así? → se dice y no se finge.

Las tres secciones que siguen son exactamente eso.

---

## 3. Lo que se puede saber HOY, sin pedir un dato más

### 3.1 Ya disponible: la app solo lo muestra

Todo esto sale de `vw_presupuestos` y `vw_presupuestos_incompletos`, que ya existen.

| Pregunta | Decisión que habilita | De dónde sale |
|---|---|---|
| ¿Qué presupuesto es el N° 16043? | Encontrar un papel que el cliente trae en la mano | `numero_presupuesto` |
| ¿Qué presupuestos hay de esta patente, del más nuevo al más viejo? | Al presupuestar de nuevo, ver qué se cobró antes por el mismo auto | `patente_norm` |
| ¿Cuánto sale este trabajo y qué lo compone? | Contestarle al cliente | `monto_total`, `subtotal_conceptos`, renglones |
| ¿Hace cuántos días se emitió este presupuesto? | Un presupuesto de 40 días sin respuesta está perdido: llamar o darlo de baja | `fecha_presupuesto` |
| ¿Qué presupuestos quedaron sin concretarse? | Ver el agujero: cuántos se pierden | `no_concretado` |
| ¿Qué presupuestos quedaron incompletos? | Corregir antes de que el dato se pierda | `vw_presupuestos_incompletos` |
| ¿Cuántos presupuestos se hicieron este mes y por cuánto? | Saber si el mes viene bien o mal, sin esperar el cierre | agrupando por mes |

**Límite importante y no negociable:** ninguno de esos números se calcula en el navegador.
`monto_total` se lee de la vista, no se suma sumando renglones en JavaScript. Si hace falta
un derivado que la base no da, **eso es una tarea del repo del modelo**, no una cuenta acá
(principio III del modelo, y el contrato del `CLAUDE.md`).

### 3.2 Derivable de los mismos datos, pero falta la vista

Nada de esto necesita que nadie cargue un dato más. Necesita una **vista nueva en el repo
del modelo**. Son las que más información dan por peso de carga: **cero**.

| Qué se sabría | Qué decisión habilita | Por qué importa acá |
|---|---|---|
| **Tasa de conversión** — concretados sobre emitidos, por mes | Si de cada 10 presupuestos se cierran 3, el problema es el precio o el seguimiento; son dos arreglos distintos | Es el número que hoy nadie del taller sabe |
| **Mix mano de obra / conceptos** — `monto_mano_obra` sobre `monto_total` | Qué trabajos dejan plata: la mano de obra es casi todo margen, los repuestos casi nada | **El más valioso: es una aproximación al margen sin cargar un solo costo** |
| **Ticket promedio por mes** | Cuándo actualizar la lista de precios | Con inflación, un ticket que no sube es un precio que baja |
| **Clientes y patentes recurrentes** | A quién conviene atender bien; quién es cliente de verdad y quién pasó una vez | Sale solo de contar repeticiones |
| **Estacionalidad por mes** | Cuándo tomar vacaciones y cuándo no; cuándo conviene tener repuestos | Villa Gesell: el verano no se parece a junio |
| **Concentración** — qué parte del monto viene de los mejores clientes | Cuánto riesgo hay concentrado en pocos | Si el 60% viene de tres, perder uno duele |

**Cómo se pide:** una spec en el repo del modelo por cada vista, como se hizo con
`vw_presupuestos`. **No se implementan acá con cuentas en el navegador** — si la definición
de "conversión" vive en el JS, en seis meses hay dos definiciones que no coinciden y ninguna
forma de saber cuál rige.

---

## 4. Lo que NO se puede saber hoy, y el hecho mínimo que lo desbloquea

Estos son los límites reales del sistema actual. Cada fila es un hecho que **nadie registra
todavía**, ordenados por cuánta información desbloquean contra cuánto cuesta cargarlos.

| # | Hecho a registrar | Costo de carga | Qué desbloquea |
|---|---|---|---|
| 1 | **Marcar un presupuesto como no concretado** | Un botón. La columna `no_concretado` **ya existe en la base y hoy nadie la escribe** | Tasa de conversión, y limpiar el tablero de presupuestos muertos. **El hecho más barato del sistema y el que más información desbloquea** |
| 2 | **Ingreso y entrega del auto** (dos fechas) | Dos toques por trabajo, en momentos en que alguien ya está al lado del auto | Qué autos hay adentro, hace cuánto están de verdad, si se cumple la fecha prometida. **Es la mitad del problema que el proyecto dice resolver** |
| 3 | **Cobro** (monto, fecha, y quién debe) | Un registro por pago | Quién debe plata: la otra mitad. Los principios VII y VIII del modelo ya están escritos para esto, pero las tablas todavía no existen |
| 4 | **Costo de los repuestos del trabajo** (un número) | Un número al cerrar el trabajo | Margen real por trabajo. Sin esto, el mix de 3.2 es lo más cerca que se llega |
| 5 | **Envío del presupuesto** (una fecha) | Un toque, o derivarlo del día en que se imprimió | Tiempo de respuesta al cliente, y a partir de cuándo un presupuesto sin contestar está frío |

**Todo eso se especifica en el repo del modelo, no acá.** La app no inventa columnas ni
guarda hechos en `localStorage` "hasta que la base los tenga". El `CLAUDE.md` lo dice sin
vueltas: no inventes columnas de datos que la base todavía no tiene.

**El orden que recomiendo:** 1, después 2, después 3. El 1 es casi gratis y arregla la
calidad de todo lo demás. El 2 convierte el tablero en lo que el nombre promete. El 3 es la
dolencia más cara del negocio, y también el más grande: deudores, facturas, retenciones e
imputaciones son varias tablas, no una.

---

## 5. Las tres pantallas: qué hace y qué no hace cada una

### Presupuesto — ya existe y está en producción

**Hace:** cargar y reeditar un presupuesto, pedirle el número a la base, imprimirlo con la
hoja calibrada contra el talonario de papel.

**No hace:** asignar el número por su cuenta (lo pide con `fn_proximo_numero_presupuesto()`),
sumar los totales en el navegador, ni cambiar la hoja de impresión sin verla impresa.

**Límite de riesgo:** es lo único que ya funciona. No se toca primero, y no se toca sin
haber verificado la impresión contra el papel.

### Tablero

**Hace:** una fila por trabajo — patente destacada, vehículo, cliente, número, y los días.
Se usa parado, con el celular, al lado de un auto.

**No hace:** gráficos, totales del mes, filtros avanzados, ni columnas de plata que la base
todavía no deriva.

> ⚠️ **Los "días" de hoy no son los días que dice el nombre.** La base no tiene fecha de
> ingreso: lo único que hay es `fecha_presupuesto`. Así que el tablero muestra **días desde
> que se presupuestó**, y la interfaz tiene que decir eso con esas palabras. Si dice "días
> en el taller", el sistema miente desde el primer día — y un tablero que miente se deja de
> mirar. Se vuelve un semáforo de verdad con el hecho #2 de la sección 4.

### Ficha

**Hace:** un trabajo con sus conceptos, su historia, y los presupuestos anteriores de ese
mismo auto. Los pocos botones que registran hechos que no se derivan (hoy: marcar no
concretado).

**No hace:** editar el presupuesto (eso es la pantalla 1), adjuntar fotos, ni registrar
comunicaciones.

**Nada más que estas tres.** Si algo no entra en ellas, no entra.

---

## 6. Fuera de alcance

### 6.1 Heredado del modelo — no entra sin enmendar su constitución (principio IX)

Cuenta corriente y pagos a proveedores · conciliación bancaria · stock e inventario · RRHH y
productividad · planificación de capacidad · portal de clientes · sub-etapas de la reparación
(chapa, pintura, pulido, lavado) · asignación de tareas por operario · registro manual de
comunicaciones.

### 6.2 Propio de la aplicación

| No se hace | Por qué |
|---|---|
| **Backend propio** | La base *es* la API vía PostgREST. Un servidor en el medio es una pieza más que mantener, desplegar y asegurar, para no agregar nada |
| **Emitir comprobantes fiscales** | Se factura por AFIP o el contador; acá solo se registra |
| **Modo offline** | Es el precio de tener una sola fuente de verdad. Sincronizar dos verdades es un problema grande y no entra |
| **App nativa** | Web responsive en el navegador del celular; se agrega al escritorio y alcanza |
| **Mensajería propia** | WhatsApp con deep links (`wa.me`) |
| **Fotos y documentos** | No en esta etapa, y nunca dentro de la base |
| **Multi-taller** | Un taller, sin arquitectura de inquilinos |
| **Gráficos y reportes visuales** | **Ver abajo** |
| **IA sobre los datos** | Cuando haya datos. Hoy la base está vacía |

**Sobre los gráficos, que es el límite que más cuesta respetar:** no se construye ningún
gráfico de tendencia hasta que haya **al menos seis meses de datos reales cargados**. Con
veinte presupuestos, una curva es ruido con forma de información, y lo peor que puede hacer
este sistema es dar confianza para decidir mal. Hasta entonces, números sueltos con su
período al lado, que se pueden verificar a mano.

---

## 7. Criterios de aceptación

La app cumple su alcance cuando **todo** esto es cierto:

1. La administrativa carga un presupuesto completo desde el celular **en menos de 90
   segundos** (criterio heredado del contexto anterior; sigue siendo el límite correcto).
2. El tablero se lee de un vistazo, parado, con una mano, al lado de un auto.
3. Ninguna magnitud mostrada se calculó en el navegador: todas salen de una vista.
4. Sin sesión, la app distingue **"no hay sesión"** de **"no hay trabajos"**. Nunca muestra
   una lista vacía cuando lo que se venció fue el token.
5. Los totales que muestra la pantalla coinciden con lo que da la consulta directa a la vista.
6. La hoja de impresión sale igual que antes de tocar nada, verificada contra el papel.
7. Ningún componente de `ui/` importa `@supabase/supabase-js`.
8. Los números de presupuesto no se repiten, ni con dos personas cargando a la vez.

---

## 8. Contradicciones y riesgos detectados

Cosas que encontré al cruzar los tres repos y que conviene resolver antes de codear:

| Qué | Por qué importa |
|---|---|
| **El `CLAUDE.md` dice "días desde que entró"; la base no tiene fecha de ingreso** | Ver §5. Hay que rotular el dato por lo que es, o registrar el hecho #2 |
| **`no_concretado` existe en la base y nadie lo escribe** | La página conectada (rama `claude/conectar-base-datos`) no lo menciona. Hasta que haya un botón, la tasa de conversión es 0% por falta de dato, no porque se cierre todo |
| **El `CLAUDE.md` describe `src/dominio`, `src/datos`, `src/ui`; la app real es un `index.html` de 1061 líneas** | Esa estructura es el destino del rearmado, no el estado actual. Hay que decidir si se rearma o se sigue sobre el HTML que ya funciona |
| **La página conectada no se verificó contra el Supabase real** | Está probada con Playwright contra un mock. La cadena real (login, token, PostgREST, RLS) falta confirmarla abriéndola |
| **La base está vacía** | Nada de la sección 3 da información hasta que haya carga real. La primera decisión útil llega con el primer mes cargado |
| ~~El subpath de Pages apuntaba al otro repo~~ | **Corregido:** el subpath es `/taller-el-semaforo-app/` |

---

## 9. Decisiones abiertas

- [x] **¿En qué repo vive la app?** **CERRADO (2026-09-12): este repo,
      `taller-el-semaforo-app`.** Consecuencias: el andamiaje de Next.js se retira, el
      subpath de Pages es `/taller-el-semaforo-app/`, y la herramienta de presupuesto sigue
      en producción en `semaforo-presupuesto` hasta que el tablero pruebe el stack acá.
- [ ] **¿Se rearma como Vite o se sigue sobre el `index.html`?** El HTML funciona y está
      calibrado. Rearmar da estructura y tests, pero arriesga lo único que ya sirve.
      Recomendación: rearmar **alrededor**, dejando la hoja de impresión intacta, y no antes
      de que la página conectada esté verificada contra el Supabase real.
- [ ] **¿Se pide primero el botón de "no concretado"?** Es el hecho #1 de §4 y cuesta casi
      nada. Habilita el único número de negocio que hoy no existe.
- [ ] **`HashRouter` o el truco de `404.html`** para el subpath de Pages. El `CLAUDE.md`
      pide decidirlo una vez y dejarlo escrito.

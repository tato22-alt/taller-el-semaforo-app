# Feature 004 — La frontera entre las tres piezas

**Estado:** borrador, esperando decisión de Luciano
**Leer después:** la [spec 005 — Cobranzas](../005-cobranzas/spec.md) contesta la pregunta de
este documento por otro lado: esta app **sí** tiene contenido propio, y es cobranzas. Eso
retira el RF-601 de §5 (ver 005 §8, C4) y le quita urgencia a la decisión #5 de §8 — pausar la
app ya no está sobre la mesa. Las decisiones #1 a #4 siguen abiertas tal como están escritas acá.
**Fecha:** 2026-09-26
**Método:** comparación de los tres repositorios en su estado real, no en el recordado
**Constitución vinculante:** la del repo del modelo, v3.0.0

> **Qué contesta este documento.** Una sola pregunta, y la respuesta no es cómoda:
> **¿qué le queda por hacer a esta aplicación, ahora que la herramienta de presupuesto
> hace más de lo que hacía hace dos semanas?**

---

## 1. Lo que hay en cada pieza, medido hoy

### La base — `gestion-taller-sql-server`, rama `claude/semaforo-taller-system-eroppo`

| | |
|---|---|
| Tablas | 4: `clientes`, `vehiculos`, `trabajos`, `trabajo_items` |
| Vistas | 2: `vw_presupuestos` (21 columnas), `vw_presupuestos_incompletos` |
| Migraciones | 19 |
| Features | 001 presupuesto · 002 numeración · 003 verificación (en pausa) · 004 chasis y observaciones · 005 detalle de mano de obra · 006 pendientes |

**Lo nuevo desde la última vez que la miré:** `vehiculos.chasis`, `trabajos.txt_chasis`,
`trabajos.observaciones`, `trabajos.detalle_mano_obra`, y una política de borrado que permite
borrar un trabajo **si y sólo si** no tiene número — un pendiente.

**Lo que la base todavía no tiene:** estado operativo del auto, deuda y cobranza, la vista con
el corte mensual, y los días transcurridos como magnitud derivada.

### La herramienta — `semaforo-presupuesto`, `main` @ `15145d0`

Ya no es sólo un emisor de presupuestos. Hoy hace:

- Emitir, reeditar e imprimir, con la hoja calibrada contra el talonario.
- Pedirle el número a la base **recién al guardar**, para no quemar números en vano.
- **Historial con buscador**, leído de `vw_presupuestos`.
- **Ficha interna** por fila: marca si el trabajo **se concretó** (`no_concretado`) y si fue
  **particular o por seguro** (`origen`), con un `PATCH` sobre `trabajos`.
- **Pendientes**: guardar un presupuesto a medias, sin número, y terminarlo después.
- Chasis, observaciones y detalle de mano de obra.
- CSV de respaldo, y `manifest.json` con iconos — se instala en el celular como una app.

### Esta aplicación — `taller-el-semaforo-app`

| | |
|---|---|
| Código propio | 322 líneas, en tres capas |
| Tests | 29, en verde |
| Pantallas con datos reales | **cero** |
| Escrituras a la base | **cero** |

---

## 2. La comparación, en una tabla

Quién hace qué, hoy:

| | La herramienta | Esta app (según su spec 003) |
|---|---|---|
| Lista de presupuestos, del más nuevo al más viejo | ✅ historial | ✅ tablero |
| Leída de `vw_presupuestos` | ✅ | ✅ |
| Patente, cliente, fecha, total | ✅ | ✅ |
| Buscar por patente o cliente | ✅ **con buscador** | ❌ fuera de alcance |
| Marcar no concretado | ✅ ficha interna | ⏳ "la pantalla siguiente" |
| Marcar particular / seguro | ✅ ficha interna | ⏳ idem |
| Se usa desde el celular | ✅ instalable | ⏳ |
| Emitir un presupuesto | ✅ | ❌ nunca |

**Las seis primeras filas son la misma cosa escrita dos veces.**

---

## 3. Lo que esto significa, dicho derecho

**La spec 003 de esta app —el tablero— es el historial de la herramienta, con menos
funcionalidad.** Misma fuente, mismas columnas, mismo orden, mismo filtro. La herramienta
además tiene buscador y se instala en el celular.

Construirlo sería exactamente lo que la quinta regla del contrato prohíbe para otra cosa: dos
implementaciones de lo mismo, que con el tiempo se comportan distinto. La regla no decía "no
dupliques las escrituras"; decía **no dupliques**.

Y la Ficha que esta app tenía como pantalla siguiente —el botón de no concretado y la marca de
seguro— **ya existe y funciona**. No hay nada que agregar ahí.

Conclusión incómoda: **tal como está especificada, esta aplicación no tiene contenido propio.**
Si se construye así, el taller termina con dos listas de presupuestos que hay que mantener en
paralelo.

---

## 4. Lo que corrijo de mis propios documentos

| Dónde | Qué decía | Qué es verdad |
|---|---|---|
| `specs/002-alcance` §8 | "`origen` existe y nadie lo escribe" | La herramienta lo escribe desde su ficha interna |
| `specs/002-alcance` §4 | "el botón de no concretado es el primer hecho que sólo esta app puede registrar" | Ya lo registra la herramienta |
| `CLAUDE.md`, quinta regla | "la app escribe `no_concretado`, `origen`…" | No los escribe: ya tienen dueño |
| `specs/003-tablero` | Es la primera pantalla | Duplica el historial. Se retira |
| `specs/003-tablero` RF-306 | Cada fila muestra el número de presupuesto | Un **pendiente** no tiene número. La spec no lo contemplaba |

---

## 5. La frontera que sí describe la realidad

La frontera que veníamos escribiendo —"la herramienta emite, la app gestiona"— no describe lo
que pasa: la herramienta también gestiona. La que sí describe, y la que propongo dejar escrita
en los tres repos:

> **La herramienta escribe sobre el trabajo. La base deriva. Esta aplicación interpreta.**

De ahí salen tres reglas verificables:

- **RF-601** — Esta aplicación es de **sólo lectura**. No hace `POST`, `PATCH` ni `DELETE`
  contra ninguna tabla. Hoy no tiene un solo hecho propio que registrar, y el día que lo tenga
  (el estado del auto, un cobro) se agrega a esta spec con su nombre.
- **RF-602** — Esta aplicación **no muestra listas de presupuestos**. Si hace falta encontrar un
  presupuesto, se busca en la herramienta, que ya lo hace bien.
- **RF-603** — Esta aplicación muestra **solamente lo que ninguna otra pieza muestra**: números
  agregados para decidir, y —cuando existan— el estado del auto y la plata que se debe.

RF-601 es verificable con un test igual que la regla de las capas: ningún archivo de `datos/`
contiene un método de escritura.

---

## 6. Entonces qué le queda a esta aplicación

Una sola cosa hoy, y no la inventé yo: **el resumen del mes**.

La herramienta lo tuvo y **se lo sacaron a propósito**, con esta justificación en el commit
`2d1374c`: *"Sacar el resumen del mes: esta herramienta sólo emite presupuestos"*. Y Luciano
lo puso como punto 3 de lo que va a hacer falta: *"una vista con el corte mensual de
presupuestos (cantidad, monto, concretados, particular/siniestro). Se sacó a propósito de la
herramienta de presupuesto para que el número lo defina la base y no cada aplicación por su
cuenta."*

O sea: **hay un hueco declarado, con dueño asignado, y nadie lo está construyendo.** Ese hueco
es esta aplicación.

Y ahora se puede llenar de verdad, porque los datos que ese corte necesita existen: la
herramienta escribe `no_concretado` y `origen`, así que "concretados" y "particular/siniestro"
ya no salen vacíos. Hace dos semanas ese reporte habría sido dos columnas nulas.

**Lo que hace falta primero, y no es de este repo:** la vista mensual en la base. Sin ella, esta
app no tiene de dónde leer, y calcular el corte en el navegador está prohibido por el principio
III y por el propio pedido de Luciano — que el número lo defina la base y no cada aplicación.

Después del resumen, en este orden:

1. **Estado operativo del auto** — una columna en la base, el único campo de estado que el
   principio I admite. Es lo que convierte a esta app en el semáforo que el nombre promete, y
   es lo único que contesta "qué autos hay y hace cuánto".
2. **Deuda y cobranza** — varias tablas, la dolencia número uno del negocio.

---

## 7. La alternativa honesta: pausar

Si la vista mensual no se construye, **lo correcto es pausar esta aplicación**, no buscarle
contenido. Un repo pausado con su esqueleto probado y sus documentos al día no cuesta nada y no
miente. Una app que duplica el historial cuesta mantenimiento para siempre y vuelve a dispersar
la información, que es el problema que el proyecto vino a resolver.

No lo digo como amenaza ni como renuncia: lo digo porque el principio IX —el alcance se
defiende activamente— aplica también a defenderlo de nosotros.

---

## 8. Qué necesito que decidas

| # | Decisión | Mi recomendación |
|---|---|---|
| 1 | **¿Se retira la spec 003 (el tablero como lista de presupuestos)?** | Sí. Duplica el historial |
| 2 | **¿La primera pantalla de esta app es el resumen del mes?** | Sí. Es el hueco declarado y ahora tiene datos |
| 3 | **¿Se especifica la vista mensual en el repo de la base?** | Sí, y va antes que cualquier código acá |
| 4 | **¿Esta app queda como sólo lectura, con test que lo verifique?** | Sí |
| 5 | **Si no querés el resumen del mes todavía, ¿pausamos la app?** | Preferible a duplicar |

## 9. Lo que no cambia

El esqueleto de esta app no se tira. Vale igual con cualquiera de las decisiones de arriba: las
tres capas, los formateadores de plata y fecha con los cuatro gotchas de PostgREST resueltos y
testeados, el ruteo, el manejo de errores, el build y el deploy. Son 322 líneas y 29 tests que
no dependen de qué pantalla se construya primero.

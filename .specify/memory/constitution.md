# Constitución — Taller El Semáforo

> **Qué es este archivo.** En Spec-Driven Development (SDD) la constitución es la
> capa más alta: los principios que **no se negocian caso por caso**. Cuando una
> especificación, un plan o una tarea entra en conflicto con un artículo de acá,
> gana el artículo. Si hay que romper uno, primero se modifica este archivo con
> una justificación escrita; no se rompe en silencio dentro de un PR.
>
> Versión: 1.0.0 · Ratificada: 2026-09-05 · Última enmienda: 2026-09-05

---

## Artículo I — La pregunta núcleo manda

Toda funcionalidad se valida contra una sola pregunta:

> **¿Dónde se va la plata, caso por caso?**

Si una pantalla, un campo o una automatización no ayuda a contestarla —directa o
indirectamente— **no entra**. No importa que sea fácil de hacer, que quede lindo
o que "algún día sirva".

**Cómo se aplica:** en cada propuesta de feature hay que poder escribir una
oración que empiece con "esto ayuda a contestar dónde se va la plata porque...".
Si la oración no sale, la respuesta es no.

---

## Artículo II — Captura mínima

Se agrega un campo **cuando duele su ausencia**, no "por si acaso".

El anti-patrón declarado del proyecto es la planilla de 30 columnas que nadie
completa. Un sistema con menos campos de los necesarios se arregla en una tarde.
Un sistema que la administrativa abandonó porque cargar un caso era un suplicio
no se arregla nunca.

**Regla operativa:** un campo nuevo necesita un caso real donde su ausencia
causó un problema concreto. "Estaría bueno tenerlo" no es un caso real.

---

## Artículo III — Mobile-first y para alguien no-técnico

El usuario principal es la administrativa del taller, cargando desde el celular,
entre llamados y clientes en el mostrador.

**Límite duro, medible:** cargar un caso completo (cliente + vehículo + renglones)
debe tomar **menos de 90 segundos** en un celular. Si un flujo no cumple, el flujo
está mal diseñado, no el usuario.

Corolarios:
- Se diseña primero la pantalla angosta, después la ancha.
- Sin jerga técnica en la interfaz. Nada de "registro", "entidad", "commit".
- Todo error visible tiene que decir **qué pasó y qué hacer**, en castellano.

---

## Artículo IV — Una sola fuente de verdad

Cada dato vive en **un** lugar. Si el mismo número existe en dos lados, tarde o
temprano no coinciden y no hay forma de saber cuál está bien.

**Consecuencia inmediata y obligatoria:** el número de presupuesto y su historial
migran a la base de datos. Mientras la numeración viva en el `localStorage` de un
navegador, dos equipos distintos no se ven entre sí y pueden emitir el mismo
número. Eso es el peor error posible del negocio y no se mitiga con advertencias:
se elimina con un servidor.

---

## Artículo V — El sistema es la verdad operativa, no la fiscal

El sistema registra **lo que pasó de verdad**, incluido el efectivo que no se
factura. Lo fiscal se maneja por fuera (AFIP, contador) y acá solo se **registra**.

De acá se desprenden dos prohibiciones absolutas:
- El sistema **nunca emite** un comprobante fiscal.
- El sistema **nunca esconde** un movimiento de dinero real por no estar
  facturado. Un cobro en efectivo se carga igual que cualquier otro.

---

## Artículo VI — Datos de terceros: la puerta se cierra antes de entrar

En la base hay nombres, teléfonos, direcciones y patentes de **personas reales
que no eligieron estar ahí**. No son datos nuestros; están prestados.

Reglas no negociables:
1. **Ninguna URL pública con datos reales sin autenticación.** No hay excepción
   "por un ratito para probar".
2. **RLS activa en toda tabla que tenga datos de personas.** Una tabla sin
   políticas de acceso es una tabla pública. La `anon key` del frontend es
   pública por diseño: cualquiera la lee del código que baja el navegador.
3. **Ninguna credencial en el repositorio.** Todo secreto va a `.env.local`, que
   está en `.gitignore`. Se verifica antes de cada commit.
4. **Ningún dato personal completo en logs.** Ni consola, ni archivos, ni
   mensajes de error.
5. **Backup mensual como mínimo**, exportado y guardado fuera del proveedor.

---

## Artículo VII — Un número emitido no se reusa jamás

Un número de presupuesto o de factura repetido es el error más caro que puede
cometer el sistema: rompe la confianza del cliente, la de la aseguradora y la
trazabilidad contable.

Reglas:
- La numeración la asigna **el servidor**, de forma atómica. Nunca el navegador.
- El contador **nunca retrocede**.
- **Borrar un presupuesto no libera su número.** El número queda quemado y el
  siguiente sigue de largo.
- La numeración no se edita desde la interfaz. A propósito.

---

## Artículo VIII — No reinventamos lo que ya existe

Se **integra**, no se reimplementa:

| En vez de construir | Usamos |
|---|---|
| Mensajería propia | WhatsApp con deep links (`wa.me`) |
| Facturación fiscal | AFIP / servicio externo; acá solo se registra |
| Almacenamiento de fotos en la DB | URL al archivo en Storage o Drive |
| Calendario, mail, drive propios | Google Calendar / Gmail / Drive vía API |

---

## Artículo IX — Ejecutor y mentor

Claude Code escribe el código **y explica las decisiones**. El proyecto también
existe para que Tato aprenda mientras se construye.

- Decisión que toca **modelo de datos, UX o flujo de negocio** → se pregunta antes.
- Decisión técnica menor (nombre de variable, estructura interna de un componente)
  → se decide y se comenta brevemente por qué.
- Después de cada cambio se reporta: qué se hizo, qué se decidió y por qué, qué
  hay que probar, cuál es el siguiente paso.
- Está explícitamente permitido —y esperado— **cuestionar** una solución que sea
  demasiado compleja para el problema.

**Idioma:** interfaz y comentarios en español rioplatense (vos, no tú). Código,
nombres de variables, tablas y campos en inglés o en el español ya establecido
del modelo, pero consistente.

---

## Artículo X — El alcance se corta, no se estira

Cuando una fase no entra en el tiempo disponible, se **saca funcionalidad**, no se
baja la calidad ni se saltean los artículos de seguridad.

Una fase que se entrega a medias pero funcionando de punta a punta vale más que
tres fases empezadas.

---

## Enmiendas

Para cambiar este archivo:
1. Se escribe qué artículo cambia y **qué problema real** motivó el cambio.
2. Se revisa qué specs vigentes quedan en conflicto.
3. Se sube la versión (MAYOR: se saca o redefine un artículo · MENOR: se agrega
   uno · PARCHE: se aclara la redacción sin cambiar el fondo).

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0.0 | 2026-09-05 | Ratificación inicial. |

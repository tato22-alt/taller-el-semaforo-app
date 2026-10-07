# Spec 002 — Numeración

**Estado:** borrador · **Constitución:** v3.0.0 · **Motor:** PostgreSQL sobre Supabase
**Pedido de Luciano:** *"Quiero que arranque en 16000."*

---

## Por qué

La herramienta reparte los números desde el navegador. Su propio README lo dice: eso reduce el
riesgo de duplicados, no lo elimina. Dos equipos no se ven entre sí, y si el historial de uno se
pierde o no se puede leer, su contador vuelve al principio en silencio.

La garantía sólo llega cuando la numeración la reparte la base. Eso es RF-021, y esta spec lo
resuelve.

Es chica a propósito: **sólo la numeración**. Conectar la página, el login y los usuarios son otra
cosa y no dependen de esto.

---

## Requisitos

- **RF-101** — La base entrega el próximo número de presupuesto. El primero de la serie es el
  **16000**. *(Confirmado por Luciano: el talonario físico terminó en el 15999, así que la serie
  digital arranca en el 16000 y continúa la numeración del papel sin hueco ni superposición. No hace
  falta adelantar el contador.)*
- **RF-102** — Dos personas pidiendo un número al mismo tiempo reciben números distintos. Nunca el
  mismo, ni con la base bajo carga.
- **RF-103** — Un número entregado no se vuelve a entregar **nunca**, ni aunque el presupuesto que lo
  iba a usar no se llegue a guardar. La serie puede tener huecos y eso es correcto: es lo mismo que
  RF-020 del feature 001, y la alternativa es arriesgarse a que dos presupuestos lleven el mismo
  número.
- **RF-104** — La numeración no puede retroceder. Ni por un error, ni por una transacción que se
  deshace, ni porque alguien borre algo.
- **RF-105** — Si alguna vez entran números por otro camino —una carga manual, una importación— la
  base tiene que **detectar** que su contador quedó atrás, y tener una forma explícita de ponerlo al
  día. No automática: alguien lo corre a sabiendas.

## Fuera de alcance

Conectar la página, el login, los usuarios de Supabase Auth. Y decidir **qué** número escribe la
aplicación: la base entrega el próximo, la aplicación decide si lo usa.

## Preguntas que la base tiene que poder responder

1. ¿Cuál es el próximo número disponible?
2. ¿Está el contador al día respecto de lo que ya hay cargado?

## Criterios de aceptación

1. Sobre una base vacía, el primer número entregado es 16000.
2. Dos pedidos seguidos devuelven números distintos y crecientes.
3. Un número entregado dentro de una transacción que después se deshace **no** se vuelve a entregar.
4. Si se inserta a mano un número más alto que el contador, la base lo detecta.
5. El rol anónimo no puede pedir números.

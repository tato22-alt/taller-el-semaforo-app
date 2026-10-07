# Spec 004 — Número de chasis y observaciones

**Estado:** borrador, esperando confirmación de Luciano · **Constitución:** v3.0.0
**Pedido de Luciano:** *"necesito que en el campo de dirección en el ppto lo cambies y pongas
n° de chasis, y abajo un renglón que puede estar vacío de observaciones"*

---

## Por qué

En el presupuesto en papel, el espacio de la dirección del cliente se usa en la práctica para
identificar el vehículo. Para un taller de chapa y pintura **el número de chasis identifica al auto
mejor que la patente**: la patente se cambia, el chasis no. Y en un siniestro es el dato que pide la
compañía.

Las observaciones son lo que hoy se escribe al margen del papel: una aclaración sobre el trabajo, una
condición, un plazo. Casi siempre vacío, y cuando hace falta no hay dónde ponerlo.

## La razón de que esto no sea sólo cambiar una etiqueta

El campo que se quiere reemplazar hoy escribe en `clientes.direccion` y en `trabajos.txt_direccion`.
Cambiarle el rótulo y seguir escribiendo ahí dejaría números de chasis guardados como domicilios de
clientes: un dato que miente y que nadie va a poder desarmar después. El principio V —cada hecho en
un solo lugar— existe justamente para esto.

## Requisitos

- **RF-301** — Un trabajo puede registrar el número de chasis tal como se imprimió, junto al resto del
  snapshot del papel (D4).
- **RF-302** — El vehículo puede guardar su número de chasis como dato propio, para no volver a
  tipearlo cada vez que ese auto vuelve al taller.
- **RF-303** — Un trabajo puede registrar observaciones en texto libre. **Puede estar vacío**, y estar
  vacío es lo normal.
- **RF-304** — Ni el chasis ni las observaciones son obligatorios. El esquema no bloquea registrar un
  presupuesto sin ellos (principio IV).
- **RF-305** — La dirección del cliente **sigue existiendo en el modelo**. Deja de pedirse en el
  presupuesto, pero las fichas de clientes que ya la tienen la conservan, y la aplicación El Semáforo
  puede usarla.

## Fuera de alcance

- Validar el formato del chasis. Los VIN tienen reglas, pero un taller también recibe vehículos
  viejos, importados o con el chasis regrabado. Bloquear ahí es impedir registrar la realidad
  (principio IV).
- Hacer el chasis único. Dos fichas de vehículo con el mismo chasis serían un error a corregir, pero
  no vale la pena arriesgar que un tipeo bloquee la carga.

## Preguntas que la base tiene que poder responder

1. ¿Cuál es el chasis de este vehículo, para proponerlo cuando vuelva?
2. ¿Qué decía el presupuesto impreso, incluidas sus observaciones?

## Criterios de aceptación

1. Se puede guardar un trabajo sin chasis y sin observaciones.
2. El chasis y las observaciones impresos quedan en el trabajo y se pueden volver a leer.
3. El chasis del vehículo se puede leer junto con su último cliente conocido, en una sola consulta.
4. La dirección del cliente sigue disponible para quien la tenga cargada.

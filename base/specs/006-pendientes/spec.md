# Feature 006 — Presupuestos pendientes

**Estado:** especificado · **Depende de:** 001 (presupuesto), 002 (numeración) · **Enmienda:** RF-023 / H5

## El problema

El presupuesto se arma en dos momentos, no en uno. Se toma el auto, se anota el cliente, el
vehículo y lo que hay que hacer — y ahí se frena: falta el precio de un repuesto que hay que
pedir, o hay que mirar el auto desarmado para poner la mano de obra.

Hoy eso no se puede guardar. La página exige mano de obra mayor a cero antes de dejar guardar,
así que lo cargado a medias vive sólo en la pantalla: se cierra la pestaña y no queda nada. En
la práctica se vuelve a escribir todo al día siguiente, o se anota en un papel — que es
exactamente de lo que esto venía a sacarlos.

## Un pendiente es un trabajo sin número

Nada de esto necesita una columna nueva. `trabajos.numero_presupuesto` **ya admite nulo**, y su
comentario lo dice desde la primera migración: *"no todo trabajo nace de un presupuesto emitido
(D1)"*. `monto_mano_obra` acepta cero. El índice único es parcial, sobre los no nulos, así que
puede haber muchos pendientes a la vez.

Por el principio II, el estado no se guarda: **se deriva**. Un pendiente es un trabajo cuyo
`numero_presupuesto` es nulo. No hay columna `es_pendiente` ni `estado`, que además chocarían
con el principio I.

## Requisitos

- **RF-501** — Se puede guardar un presupuesto sin mano de obra y sin repuestos. Queda pendiente.
- **RF-502** — Un pendiente **no gasta número**. Decisión de Luciano: un pendiente abandonado no
  puede dejar un hueco en el talonario. El número se pide recién al emitirlo, igual que hoy se
  pide recién al guardar y no al abrir la página (RF-020, RF-103).
- **RF-503** — Lo mínimo para dejar algo pendiente es **el nombre del cliente**. Sin eso la fila
  del historial no se puede identificar y el pendiente no sirve para nada.
- **RF-504** — Un pendiente se termina reabriéndolo del historial y guardándolo como siempre. Ahí
  recibe su número y pasa a ser un presupuesto emitido. Es el mismo trabajo, no uno nuevo.
- **RF-505** — Un pendiente impreso sale marcado **SIN EMITIR** y con `N° —`. Ya funciona así: la
  marca de agua lee el número, y no hay número.
- **RF-506** — El historial muestra los pendientes junto al resto, marcados, arriba de todo.

## Enmienda a RF-023 / H5: un pendiente sí se puede borrar

H5 revocó el `delete` sobre `trabajos`, con este razonamiento: *"como ninguna fila desaparece,
ningún número vuelve a quedar libre"*. Ese razonamiento **sólo aplica a las filas que tienen
número**. Una fila sin número no sostiene nada de RF-020: no hay número que pueda volver a
quedar libre, porque nunca se emitió ninguno.

- **RF-507** — Se puede borrar un trabajo **si y sólo si** `numero_presupuesto is null`. Lo
  garantiza la base con una política restrictiva, no la página: es la base la que no puede
  permitir que se pierda un registro emitido.
- **RF-508** — Un presupuesto con número sigue sin poder borrarse, desde la página y desde el
  panel. RF-023 queda intacto para todo lo emitido.

## Fuera de alcance

- Avisar que hay pendientes viejos, o vencerlos solos. Un pendiente de hace un mes sigue siendo
  válido y quien lo mira decide. La base entrega el hecho, no la decisión (principio III).
- Reservar el número al imprimir un borrador. Se evaluó y se descartó: es la regla más difícil
  de explicar, y le da número a algo que todavía no se emitió.

## Cómo se verifica

1. Guardar un pendiente sin mano de obra: se guarda, no pide número, la serie no avanza.
2. Reabrirlo, completar la mano de obra, guardar: recibe el número que correspondía y el trabajo
   es el mismo (mismo `id_trabajo`), no se crea otro.
3. Borrar un pendiente: se borra, con sus renglones.
4. Intentar borrar un presupuesto con número: la base lo rechaza.

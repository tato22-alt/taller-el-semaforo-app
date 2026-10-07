# Feature 005 — Qué dice el renglón de mano de obra

**Estado:** especificado · **Depende de:** 001 (presupuesto), 004 (chasis y observaciones)

## El problema

El presupuesto tiene un renglón fijo que dice **Mano de obra** y un importe al lado. El texto no
se puede cambiar: la hoja impresa nunca explica *qué* mano de obra se está cobrando.

En chapa y pintura eso importa. No es lo mismo "pintura de guardabarros trasero derecho" que
"desabollado y pintura de tres paños, incluye pulido". Hoy el cliente recibe un número sin
concepto, y cuando vuelve a los dos meses discutiendo qué incluía el trabajo, no hay papel que
lo diga. El taller lo resolvía escribiéndolo a mano al costado del talonario.

No sirve ponerlo en **Observaciones** (RF-303): las observaciones son del presupuesto entero —un
plazo, una condición— y se imprimen arriba, con los datos del cliente. La descripción de la mano
de obra pertenece a su renglón, al lado de su importe. Guardar una cosa en el lugar de la otra
las mezcla para siempre y nadie podría desarmarlas después (principio V).

Tampoco sirve cargarla como un renglón más de la tabla: los renglones son repuestos y **suman al
total**. La mano de obra ya tiene su importe propio; un renglón extra lo duplicaría.

## Requisitos

- **RF-401** — El presupuesto permite escribir un texto libre junto al importe de mano de obra.
- **RF-402** — Ese texto es parte de lo impreso: se guarda como snapshot del trabajo (D4), igual
  que `txt_vehiculo` o `txt_chasis`, para poder reimprimir el presupuesto tal cual salió.
- **RF-403** — **No es obligatorio** (principio IV). Un presupuesto que sólo dice "Mano de obra"
  sigue siendo válido, y es lo normal en un trabajo chico. Vacío no se imprime: la hoja queda
  como está hoy.
- **RF-404** — No se clasifica ni se interpreta. Es texto, como lo escribió quien presupuestó.
  La base no lo parsea, no infiere tareas de él y no lo usa para ningún cálculo (principio III).
- **RF-405** — No afecta ningún monto. El total sigue siendo `subtotal_conceptos + monto_mano_obra`.

## Fuera de alcance

- Una lista de tareas de mano de obra con importe cada una. Sería otro modelo (una tabla de
  ítems de mano de obra) y el taller no cotiza así: cotiza un número por el trabajo.
- Textos sugeridos o repetidos del último presupuesto. Si más adelante hace falta, es otro feature.

## Cómo se verifica

1. Cargar un presupuesto con descripción de mano de obra, guardarlo, reabrirlo del historial:
   el texto vuelve igual.
2. Guardar uno sin descripción: la hoja impresa queda idéntica a la de hoy, sin renglón vacío.
3. El total no cambia al escribir la descripción.

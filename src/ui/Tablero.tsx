/* Pantalla 2: una fila por trabajo. Se usa parado, con el celular, al lado de un auto.
 *
 * Todavía no lee la base: eso es el paso 2 (login + lectura de vw_presupuestos).
 * Lo que falta no es el fetch, es decidir los umbrales del semáforo — a partir de
 * cuántos días un presupuesto está frío. Es una decisión de producto, no técnica. */

export function Tablero() {
  return (
    <div className="tarjeta pendiente">
      <strong>Tablero</strong>
      <p className="apagado">
        Todavía no lee la base. El paso siguiente es el login y la lectura de{' '}
        <code>vw_presupuestos</code>.
      </p>
      <p className="apagado">
        Cuando lea, los días que muestre van a ser <strong>días desde que se
        presupuestó</strong>, no días en el taller: la base no tiene fecha de ingreso.
      </p>
    </div>
  )
}

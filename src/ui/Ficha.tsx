/* Pantalla 3: un trabajo, sus conceptos, su historia, y los presupuestos
 * anteriores del mismo auto. */

export function Ficha({ idTrabajo }: { readonly idTrabajo: number }) {
  return (
    <div className="tarjeta pendiente">
      <strong>Ficha del trabajo {idTrabajo}</strong>
      <p className="apagado">
        Pendiente. Va después del tablero, porque se entra desde ahí.
      </p>
      <p>
        <a href="#/">Volver al tablero</a>
      </p>
    </div>
  )
}

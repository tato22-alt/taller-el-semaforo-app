import { usarRuta } from './ui/usarRuta'
import { usarSesion } from './ui/usarSesion'
import { Tablero } from './ui/Tablero'
import { Ficha } from './ui/Ficha'
import { Login } from './ui/Login'
import { cerrarSesion } from './datos/sesion'
import { textoDeFallo } from './dominio/resultado'

export function App() {
  const ruta = usarRuta()
  const estado = usarSesion()

  return (
    <div className="envoltorio">
      <header className="encabezado">
        <h1>El Semáforo</h1>
        {estado.fase === 'adentro' && ruta.pantalla !== 'tablero' && <a href="#/">Tablero</a>}
      </header>

      {/* Quién está adentro, siempre a la vista. Con la base vacía, "no hay sesión" y
          "no hay presupuestos" se ven igual, y ésta es la línea que los separa. */}
      {estado.fase === 'adentro' && (
        <p className="identidad apagado">
          {estado.sesion.email}
          <button type="button" className="enlace" onClick={() => void cerrarSesion()}>
            Salir
          </button>
        </p>
      )}

      <main>
        {estado.fase === 'cargando' && <p className="apagado">Abriendo…</p>}

        {estado.fase === 'rota' && (
          <div className="tarjeta">
            <p className="error">{textoDeFallo(estado.fallo)}</p>
          </div>
        )}

        {estado.fase === 'afuera' && <Login />}

        {estado.fase === 'adentro' && ruta.pantalla === 'tablero' && <Tablero />}
        {estado.fase === 'adentro' && ruta.pantalla === 'ficha' && (
          <Ficha idTrabajo={ruta.idTrabajo} />
        )}
      </main>
    </div>
  )
}

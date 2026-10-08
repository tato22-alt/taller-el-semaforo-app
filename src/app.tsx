import { usarRuta } from './ui/usarRuta'
import { usarSesion } from './ui/usarSesion'
import { Tablero } from './ui/Tablero'
import { Ficha } from './ui/Ficha'
import { Importar } from './ui/Importar'
import { Revisar } from './ui/Revisar'
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
        {estado.fase === 'adentro' && (
          <nav className="navegacion">
            {ruta.pantalla !== 'tablero' && <a href="#/">Tablero</a>}
            {ruta.pantalla !== 'importar' && <a href="#/importar">Importar facturas</a>}
            {ruta.pantalla !== 'revisar' && <a href="#/revisar">Revisar notas</a>}
          </nav>
        )}
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
        {estado.fase === 'adentro' && ruta.pantalla === 'importar' && <Importar />}
        {estado.fase === 'adentro' && ruta.pantalla === 'revisar' && <Revisar />}
      </main>
    </div>
  )
}

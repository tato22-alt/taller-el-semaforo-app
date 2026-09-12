import { usarRuta } from './ui/usarRuta'
import { Tablero } from './ui/Tablero'
import { Ficha } from './ui/Ficha'

export function App() {
  const ruta = usarRuta()

  return (
    <div className="envoltorio">
      <header className="encabezado">
        <h1>El Semáforo</h1>
        {ruta.pantalla !== 'tablero' && <a href="#/">Tablero</a>}
      </header>

      <main>
        {ruta.pantalla === 'tablero' && <Tablero />}
        {ruta.pantalla === 'ficha' && <Ficha idTrabajo={ruta.idTrabajo} />}
      </main>
    </div>
  )
}

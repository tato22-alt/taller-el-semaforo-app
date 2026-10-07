/* Entrar. Correo y contraseña, nada más: el taller son tres personas. */

import { useState, type FormEvent } from 'react'
import { iniciarSesion } from '../datos/sesion'
import { textoDeFallo, type Fallo } from '../dominio/resultado'

export function Login() {
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [fallo, setFallo] = useState<Fallo | null>(null)

  async function alEnviar(evento: FormEvent): Promise<void> {
    evento.preventDefault()
    setEntrando(true)
    setFallo(null)

    const r = await iniciarSesion(email, contrasena)
    // Si salió bien no hay que hacer nada: usarSesion escucha el cambio y
    // cambia de pantalla sola.
    if (!r.ok) setFallo(r.fallo)
    setEntrando(false)
  }

  return (
    <form className="tarjeta formulario" onSubmit={(e) => void alEnviar(e)}>
      <h2>Entrar</h2>

      <label>
        Correo
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
      </label>

      <label>
        Contraseña
        <input
          type="password"
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>

      <button type="submit" disabled={entrando}>
        {entrando ? 'Entrando…' : 'Entrar'}
      </button>

      {fallo !== null && <p className="error">{textoDeFallo(fallo)}</p>}
    </form>
  )
}

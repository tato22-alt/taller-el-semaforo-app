import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import './ui/estilos.css'

const raiz = document.getElementById('raiz')
if (raiz === null) throw new Error('Falta el div #raiz en index.html')

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/* Arma robot.gs: todos los archivos del robot en uno solo, para pegar en el editor de Apps Script.
 *
 *   node robot/armar.mjs
 *
 * Un archivo y no nueve porque pegar nueve a mano es la forma de que alguno quede viejo. robot.gs
 * se commitea junto con sus fuentes, y lectores.test.ts falla si no está al día: lo que se pega
 * es siempre lo mismo que se testeó. */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const AQUI = import.meta.dirname
const LECTORES = join(AQUI, 'lectores')

export function armar() {
  const fuentes = [
    ...readdirSync(LECTORES).filter((n) => n.endsWith('.js')).sort().map((n) => join('lectores', n)),
    'barrido.js',
  ]
  const partes = fuentes.map((f) => `// ===== ${f} =====\n\n${readFileSync(join(AQUI, f), 'utf8').replace(/^\/\/ @ts-check\n/, '')}`)
  return [
    '// El robot de cobranzas. ARCHIVO ARMADO: no se edita acá. Se edita en robot/ del repo y se',
    '// vuelve a armar con `node robot/armar.mjs`. Se pega entero en el editor de Apps Script.',
    '',
    ...partes,
  ].join('\n')
}

if (process.argv[1] === import.meta.filename) {
  writeFileSync(join(AQUI, 'robot.gs'), armar())
  console.log('robot/robot.gs armado.')
}

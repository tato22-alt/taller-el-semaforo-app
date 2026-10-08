import { describe, expect, it } from 'vitest'
import { huellaSha256 } from './huella'

describe('huellaSha256', () => {
  it('da el SHA-256 conocido de "abc"', async () => {
    const bytes = new TextEncoder().encode('abc')
    expect(await huellaSha256(bytes.buffer)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('tiene el formato que exige la base: 64 caracteres hexadecimales', async () => {
    const huella = await huellaSha256(new TextEncoder().encode('').buffer)
    expect(huella).toMatch(/^[0-9a-f]{64}$/)
  })
})

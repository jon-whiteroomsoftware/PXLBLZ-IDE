import { newPersonalContentId } from './personalContentMetadata'

describe('newPersonalContentId', () => {
  it('uses crypto.randomUUID when available', () => {
    expect(newPersonalContentId({ randomUUID: () => '00000000-0000-4000-8000-000000000000' })).toBe(
      '00000000-0000-4000-8000-000000000000',
    )
  })

  it('falls back to a v4-shaped UUID from random bytes', () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, i) => i)
    const crypto = {
      getRandomValues(target: Uint8Array) {
        target.set(bytes)
        return target
      },
    }
    expect(newPersonalContentId(crypto)).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
  })
})

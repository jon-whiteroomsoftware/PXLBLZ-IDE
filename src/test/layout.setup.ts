import { beforeAll } from 'vitest'
import '../index.css'

beforeAll(async () => {
  if (!document.fonts) {
    throw new Error('Layout tests require the browser FontFaceSet API.')
  }
  await document.fonts.ready
})

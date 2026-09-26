import { expect, it } from 'vitest'
import { showRemoveClipFixture } from './showRemoveClipFixture'
import { frozenV1Output } from './v1AuthoringOracles'

it('freezes the connected Transition insertion (#1042 4-4b)', () => {
  const composition = frozenV1Output(
    'showRemoveClipFixture::showRemoveClipFixture::1',
    () => showRemoveClipFixture().composition,
  )
  expect(composition?.transitions).toContainEqual(expect.objectContaining({ id: 'connected-transition' }))
})

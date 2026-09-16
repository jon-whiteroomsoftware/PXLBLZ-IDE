import { expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { showV2TransitionRouteFixture } from './showV2TransitionEditorFixture'
import { validateShowRecordV2 } from '../engine/showCompositionV2'

const committedPath = new URL('../../e2e/fixtures/showV2Transitions.json', import.meta.url)

/** The authenticated route seeds committed bytes; keep them equal to the shared fixture. */
it('keeps the committed authenticated Transition route bytes valid and in sync', () => {
  const bundle = showV2TransitionRouteFixture()
  expect(validateShowRecordV2(bundle.record)).toEqual([])
  if (process.env.UPDATE_SHOW_V2_TRANSITIONS_FIXTURE) writeFileSync(committedPath, `${JSON.stringify(bundle, null, 1)}\n`)
  expect(JSON.parse(readFileSync(committedPath, 'utf8'))).toEqual(bundle)
})

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { SEQUENCE_DEPENDENCIES, showV2EditorSequenceRecord } from './showV2EditorSequenceFixture'

/**
 * The authenticated animation spec seeds committed JSON rather than importing
 * this builder, because the Playwright loader cannot resolve the engine's schema
 * dependency. This keeps the two from drifting: regenerate with
 * `UPDATE_SHOW_V2_EDITOR_SEQUENCE_FIXTURE=1` after a deliberate change.
 */
const FIXTURE_PATH = resolve('e2e/fixtures/showEditorV2Animation.json')

it('the committed e2e fixture is the record this builder produces', () => {
  const expected = {
    record: { ...showV2EditorSequenceRecord(), id: 'show-editor-v2-animation', name: 'Editor v2 animation' },
    patterns: SEQUENCE_DEPENDENCIES.patterns.map(pattern => ({
      id: pattern.id, name: pattern.name, src: pattern.src, controls: {}, updatedAt: 1,
    })),
  }
  if (process.env.UPDATE_SHOW_V2_EDITOR_SEQUENCE_FIXTURE === '1') {
    writeFileSync(FIXTURE_PATH, `${JSON.stringify(expected, null, 2)}\n`)
    return
  }
  expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(expected)
})

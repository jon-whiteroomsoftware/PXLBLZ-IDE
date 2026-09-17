import { expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { showV2EditorAuthoringRouteFixture } from './showV2EditorAuthoringFixture'
import { captureShowStageEditV2 } from '../engine/showPreparedStageV2'
import { validateShowRecordV2 } from '../engine/showCompositionV2'

const committedPath = new URL('../../e2e/fixtures/showEditorV2Authoring.json', import.meta.url)

/** The authenticated route seeds committed bytes; keep them equal to the shared fixture. */
it('keeps the committed editor-route authoring bytes valid, preparable and in sync', () => {
  const bundle = showV2EditorAuthoringRouteFixture()
  expect(validateShowRecordV2(bundle.record)).toEqual([])
  const capture = captureShowStageEditV2(bundle.record, {
    patterns: bundle.patterns, maps: [], libraries: [], profiles: [], stageMap: null,
  })
  expect(capture.inputCapture.status).toBe('qualified')
  expect(capture.prepared.status, capture.prepared.status === 'refused' ? capture.prepared.message : '').toBe('ready')
  expect(bundle.record.composition.layoutOccurrences.map(occurrence => [occurrence.startMs, occurrence.durationMs]))
    .toEqual([[0, 5_000], [5_000, 25_000]])

  if (process.env.UPDATE_SHOW_V2_EDITOR_AUTHORING_FIXTURE) writeFileSync(committedPath, `${JSON.stringify(bundle, null, 1)}\n`)
  expect(JSON.parse(readFileSync(committedPath, 'utf8'))).toEqual(bundle)
})

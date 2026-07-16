import { readFileSync, writeFileSync } from 'node:fs'
import { buildShowEpeExport } from '../../src/engine/showEpeExport'
import { createPatternPrismShow } from '../../src/engine/patternPrismShow'
import { createSceneSpliceShow } from '../../src/engine/sceneSpliceShow'
import { compileShowForPreview } from '../../src/engine/showPreviewArtifact'
import type { ShowRecord } from '../../src/engine/personalContentRecords'

interface ReviewedArtifactEnvelope {
  id: string
  preview: string
}

const refreshRequested = process.env.PXLBLZ_REFRESH_REVIEWED_SHOW_ARTIFACTS === '1'

describe.skipIf(!refreshRequested)('reviewed Show artifact refresh', () => {
  it('preserves reviewed envelope identity while refreshing compiler output', () => {
    refresh(
      'artifacts/electromage/pattern-prism.epe',
      createPatternPrismShow(),
      '2026-07-10T21:00:00.000Z',
    )
    refresh(
      'artifacts/electromage/scene-splice-showcase.epe',
      createSceneSpliceShow(),
      '2026-07-10T22:00:00.000Z',
    )
  })
})

function refresh(path: string, show: ShowRecord, stampedAt: string): void {
  const current = JSON.parse(readFileSync(path, 'utf8')) as ReviewedArtifactEnvelope
  const compiled = compileShowForPreview(show, [], undefined, {}, { stageDimension: 2 })
  if (!compiled.artifact) throw new Error(compiled.error ?? `${show.name} did not compile`)

  const next = buildShowEpeExport(show, compiled.artifact.code, {
    id: current.id,
    preview: current.preview,
    stampedAt,
  })
  writeFileSync(path, next.text)
}

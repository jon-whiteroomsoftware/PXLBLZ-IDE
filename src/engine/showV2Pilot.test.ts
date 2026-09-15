import { expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { editShowTransitionV2 } from './showTransitionsV2'
import { parseEpe } from './epeImport'
import { parseShowFileBundle } from './showFileBundle'
import { qualifyShowV2PilotArtifacts } from './showV2Pilot'

it('reopens edited v2 .pxlshow and compiled .epe through the ordinary importers', async () => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const transitionId = converted.record.composition.transitions[0].id
  const edited = editShowTransitionV2(converted.record, { kind: 'resize-transition', transitionId, durationMs: 100 })
  if (edited.status !== 'changed') throw new Error(JSON.stringify(edited))

  const artifacts = await qualifyShowV2PilotArtifacts(edited.record, { patterns: [], maps: [], libraries: [] }, {
    appVersion: '1044-test', exportedAt: '2026-09-15T00:00:00.000Z',
  })

  const pxlshow = await parseShowFileBundle(artifacts.pxlshowBytes, { acceptV2: true })
  expect(pxlshow).toMatchObject({ version: 2, show: { version: 2 } })
  expect(artifacts.importedShow).toMatchObject({ version: 2, name: `${edited.record.name} (2)` })
  expect(parseEpe(artifacts.epeText)).toMatchObject({ name: edited.record.name, stamp: { kind: 'show' } })
  expect(artifacts.epeSource).toContain('Compiled PXLBLZ Show')
})

it.each([
  { kind: 'user' as const, id: 'missing-user-pattern' },
  { kind: 'stock' as const, id: 'missing-stock-pattern' },
])('refuses a missing $kind Pattern dependency instead of compiling fallback source', async (pattern) => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  converted.record.composition.patternInstances[0].pattern = pattern

  await expect(qualifyShowV2PilotArtifacts(
    converted.record,
    { patterns: [], maps: [], libraries: [] },
  )).rejects.toThrow('requires exact Pattern source')
})

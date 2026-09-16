import { expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { editShowTransitionV2 } from './showTransitionsV2'
import { parseEpe } from './epeImport'
import { parseShowFileBundle } from './showFileBundle'
import { compileShowV2PilotArtifact, qualifyShowV2PilotArtifacts, type ShowV2PilotAssets } from './showV2Pilot'
import { prepareShowStageV2 } from './showPreparedStageV2'
import type { ShowRecordV2 } from './showCompositionV2'

function capture(record: ShowRecordV2, assets: ShowV2PilotAssets) {
  const prepared = prepareShowStageV2(record, { ...assets, profiles: [], stageMap: null })
  if (prepared.status !== 'ready') throw new Error(prepared.status === 'refused' ? prepared.message : 'Empty Show')
  return prepared.bundle
}

function libraryRestartFixture(librarySource: string) {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade', 'live-live'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const [outgoing, incoming] = converted.record.composition.clips
  incoming.instanceId = outgoing.instanceId
  incoming.entryPolicy = 'restart'
  converted.record.composition.patternInstances = converted.record.composition.patternInstances
    .filter(instance => instance.id === outgoing.instanceId)
  converted.record.composition.patternInstances[0].pattern = { kind: 'user', id: 'library-restart-pattern' }

  return {
    record: converted.record,
    assets: {
      patterns: [{
        id: 'library-restart-pattern',
        name: 'Library Restart',
        src: 'export var sample = 0\nexport function beforeRender(delta) { sample = Blz.next() }\nexport function render(i) { rgb(sample, 0, 0) }',
        controls: {},
        updatedAt: 1,
      }],
      maps: [],
      libraries: [{ id: 'library-restart', name: 'Blz', src: librarySource, updatedAt: 1 }],
    },
  }
}

it('reopens edited v2 .pxlshow and compiled .epe through the ordinary importers', async () => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const transitionId = converted.record.composition.transitions[0].id
  const edited = editShowTransitionV2(converted.record, { kind: 'resize-transition', transitionId, durationMs: 100 })
  if (edited.status !== 'changed') throw new Error(JSON.stringify(edited))

  const artifacts = await qualifyShowV2PilotArtifacts(capture(edited.record, { patterns: [], maps: [], libraries: [] }), {
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

  expect(prepareShowStageV2(converted.record, { patterns: [], maps: [], libraries: [], profiles: [], stageMap: null })).toMatchObject({ status: 'refused', message: expect.stringContaining('requires exact Pattern source') })
})

it('compiles a Restart artifact whose Library owns restorable scalar state', () => {
  const fixture = libraryRestartFixture('var phase = 1\nfunction next() { phase = phase + 1; return phase }')

  const artifact = compileShowV2PilotArtifact(fixture.record, fixture.assets)

  expect(artifact.summary.clips).toHaveLength(1)
  expect(artifact.code).toContain('export function beforeRender')
  expect(artifact.code).not.toContain('Blz.next')
})

it('refuses Library-backed persistent state through the pilot preparation boundary', async () => {
  const fixture = libraryRestartFixture('var state\nfunction next() { state = array(2); return state[0] }')

  expect(prepareShowStageV2(fixture.record, { ...fixture.assets, profiles: [], stageMap: null })).toMatchObject({ status: 'refused', message: expect.stringMatching(/composition\.clips\[1\].*array-or-object-state/) })
})

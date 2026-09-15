import { expect, it } from 'vitest'
import { flatV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'
import { runtimeParity, flatMemberIdentityMappings } from '../../scripts/show-v2-parity'
import { LIBRARIES } from '../pixelblaze/libs'

it('preserves independent flat sampling through a boundary Transition', () => {
  const source = flatV1Show(true)
  source.transitions = [{ id: 'fade', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live' }]
  const code = 'export var calls=0; export var elapsed=0; export function beforeRender(delta) { calls++; elapsed+=delta/1000 } export function render(index) { rgb(index/pixelCount,elapsed,calls/100) }'
  const lookup = { byCellId: { 'cell-a': code, 'cell-b': code } }
  const converted = convertShowRecordV1ToV2(source, lookup)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const prepared = prepareShowV2ForCompile(converted.record, { byCellId: {}, byPatternInstanceId: Object.fromEntries(converted.record.composition.patternInstances.map(instance => [instance.id, code])) })
  expect(prepared.status).toBe('ready')
  if (prepared.status !== 'ready') return
  const before = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
  const after = compileShow(prepared.recipe, LIBRARIES)
  const identities = flatMemberIdentityMappings(converted.report, before, after)
  for (const fidelity of ['fast', 'fidelity'] as const) expect(runtimeParity(before, after, source, converted.record, fidelity, identities).matched).toBe(true)
  after.summary.clips.push({ ...after.summary.clips[0] })
  expect(() => flatMemberIdentityMappings(converted.report, before, after)).toThrow(/bijection/)
})

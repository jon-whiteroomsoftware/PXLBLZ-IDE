import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { prepareShowV2ForCompile } from '../src/engine/showCompositionLoweringV2'
import { compileShow } from '../src/engine/showCompiler'
import type { ShowRecordV2 } from '../src/engine/showCompositionV2'
import type { ShowCompileRecipeSourceLookup } from '../src/engine/showModel'
import { LIBRARIES } from '../src/pixelblaze/libs'
import { STOCK_SHOWS_V2 } from '../src/pixelblaze/stock/showsV2'
import { v1StockShowById } from '../src/test/v1StockShowsFixture'
import { nativeStockSourceLookupV2 } from '../src/pixelblaze/stock/showsV2Compile'
import { describe, expect, it } from 'vitest'
import { assertPreparedMemberProvenance, censusLoweringInputs, runtimeParity, semanticSampleTimes, sha256, stableJson } from './show-v2-parity'
import { convertShowRecordV1ToV2 } from '../src/engine/showRecordV1ToV2'
import { flatV1Show, transitionV1Show } from '../src/test/showV2TracerFixture'

const CENSUS_PATH = 'docs/reference/evidence/issue-1063-flat-transition-multizone/census-lowering.json'

describe('semanticSampleTimes', () => {
  it('samples source and v2 semantic boundaries, neighbors, and interval interiors without treating Markers as behavior', () => {
    const source = transitionV1Show('crossfade')
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return

    const record = structuredClone(converted.record)
    const clip = record.composition.clips[0]
    clip.appearance.keys.push({
      id: 'appearance-change',
      timeMs: 400,
      value: structuredClone(clip.appearance.keys[0].value),
    })
    record.composition.layoutOccurrences[0] = {
      ...record.composition.layoutOccurrences[0],
      startMs: 100,
      durationMs: 800,
    }
    record.composition.propertyTracks.push({
      id: 'track',
      target: { kind: 'show-repeat-scale' },
      activeStartMs: 200,
      activeDurationMs: 400,
      keyframes: [
        { id: 'key-a', timeMs: 250, value: 1, easing: { curve: 'linear' } },
        { id: 'key-b', timeMs: 450, value: 2, easing: { curve: 'linear' } },
      ],
    })
    record.composition.markers.push({ id: 'narrative-only', timeMs: 333, name: 'Chapter' })

    const sampled = semanticSampleTimes(source, record)

    expect(sampled).toEqual(expect.arrayContaining([
      99, 100, 101, 199, 200, 201, 225, 249, 250, 251, 350,
      399, 400, 401, 449, 450, 451, 500, 525, 599, 600,
      601, 899, 900, 901,
    ]))
    expect(sampled).not.toEqual(expect.arrayContaining([332, 333, 334]))
    expect(sampled).toEqual([...sampled].sort((left, right) => left - right))
  })
})


describe('prepared runtime provenance oracle', () => {
  it.each([2, 3])('rejects a shared runtime split across two compiled members with %s source Scenes', sceneCount => {
    const source = flatV1Show(false)
    if (sceneCount === 3) {
      source.scenes.push({ id: 'third', name: 'Third', durationMs: 500 })
      source.cells[0].sceneSpan = 3
    }
    const result = convertShowRecordV1ToV2(source, { byCellId: { 'cell-a': 'export function render(index) { rgb(1, 0, 0) }' } })
    if (result.status !== 'converted') throw new Error('Fixture conversion failed')
    const record = result.record
    const prepared = prepareShowV2ForCompile(record, { byCellId: {}, byPatternInstanceId: { 'cell-a': 'export function render(index) { rgb(1, 0, 0) }' } })
    if (prepared.status !== 'ready') throw new Error('Fixture preparation failed')
    const artifact = compileShow(prepared.recipe, LIBRARIES)
    expect(() => assertPreparedMemberProvenance(record, prepared.provenance, prepared.recipe, artifact)).not.toThrow()
    artifact.summary.clips.push({ ...artifact.summary.clips[0], id: record.composition.clips[1].id })
    expect(() => assertPreparedMemberProvenance(record, prepared.provenance, prepared.recipe, artifact)).toThrow(/exactly once/)
  })

  it('accepts identical member sets with mixed case identifiers', () => {
    const source = transitionV1Show('crossfade')
    const composition = source.composition!
    const ids = ['Rings', 'bed']
    const renames = new Map(composition.patternInstances.map((instance, index) => [instance.id, ids[index]]))
    composition.patternInstances.forEach(instance => { instance.id = renames.get(instance.id)! })
    composition.scenes.forEach(scene => scene.zones.forEach(zone => zone.main.forEach(clip => { clip.instanceId = renames.get(clip.instanceId)! })))
    const converted = convertShowRecordV1ToV2(source)
    if (converted.status !== 'converted') throw new Error('Fixture conversion failed')
    const prepared = prepareShowV2ForCompile(converted.record, { byCellId: {}, byPatternInstanceId: Object.fromEntries(ids.map(id => [id, 'export function render(index) { rgb(1, 0, 0) }'])) })
    if (prepared.status !== 'ready') throw new Error('Fixture preparation failed')
    expect(() => assertPreparedMemberProvenance(converted.record, prepared.provenance, prepared.recipe, compileShow(prepared.recipe, LIBRARIES))).not.toThrow()
  })
})


/**
 * No inventoried record may move when a lowering candidate widens an admission
 * (#1063). The committed table was measured on local main `4c9a59f2`, before
 * the #1063 widening, and is evidence: it is never regenerated to make a
 * candidate pass. `compileShow` is a pure function of its recipe and Libraries,
 * so the recipe hash pins the generated bytes; the table additionally carries
 * the compiled artifact hash for every record the widened predicate can reach
 * and for every record already on the continuous-flat route.
 */
describe('inventoried lowering census', () => {
  const committed = JSON.parse(readFileSync(resolve(CENSUS_PATH), 'utf8')) as {
    rows: Array<{ census: string; id: string; zones: number; participantTransitions: number; sampleModes: string[]; route: string; recipeSha256: string; sourceSha256?: string }>
  }

  function measure(census: string, id: string, record: ShowRecordV2, lookup: ShowCompileRecipeSourceLookup, libraries: Record<string, string>) {
    const expected = committed.rows.find(row => row.census === census && row.id === id)
    expect(expected, `${census}:${id} is not in the committed census`).toBeDefined()
    const prepared = prepareShowV2ForCompile(record, lookup, { libraries })
    if (prepared.status !== 'ready') throw new Error(`${census}:${id} refused: ${JSON.stringify(prepared.issues)}`)
    expect({
      census, id,
      zones: record.zones.length,
      participantTransitions: record.composition.transitions.filter(transition => !transition.wholeOutput).length,
      sampleModes: [...new Set(record.composition.clips.map(clip => clip.zoneSampleMode))].sort(),
      route: prepared.provenance.route,
      recipeSha256: sha256(stableJson(prepared.recipe)),
      ...(expected!.sourceSha256 ? { sourceSha256: sha256(stableJson(compileShow(prepared.recipe, libraries))) } : {}),
    }).toEqual(expected)
  }

  it('keeps every converted v1 record on its route, recipe and bytes', { timeout: 60_000 }, () => {
    const inputs = censusLoweringInputs()
    expect(inputs.length).toBe(47)
    for (const input of inputs) measure('converted-v1', input.corpusId, input.record, input.lookup, input.libraries)
  })

  it('keeps every inventoried native stock v2 Show on its route, recipe and bytes', { timeout: 60_000 }, () => {
    // The census inventoried the Shows the legacy catalogue shipped. Native-only
    // Shows added since (#1134) are outside its evidence (Jon, 2026-09-25).
    const inventoried = STOCK_SHOWS_V2.filter(record => v1StockShowById(record.id))
    expect(inventoried.length).toBe(40)
    for (const record of inventoried) measure('native-v2', record.id, record, nativeStockSourceLookupV2(record), LIBRARIES)
  })

  it('reaches only span-sampled records with more than one Zone and a participant Transition', () => {
    // Why the census cannot move: the widened clause is evaluated once per
    // participant Transition, and `canLowerToFlat` still requires every Clip to
    // sample `independent`. The two inventoried records with both a second Zone
    // and a participant Transition sample `span`, so they keep the routed
    // Transition route regardless of this admission.
    const reachable = committed.rows.filter(row => row.zones > 1 && row.participantTransitions > 0)
    expect(reachable.map(row => `${row.census}:${row.id}`)).toEqual([
      'converted-v1:stock-show-106-built-from-basics',
      'native-v2:stock-show-106-built-from-basics',
    ])
    expect(reachable.every(row => row.sampleModes.join() === 'span' && row.route === 'transition')).toBe(true)
  })
})

describe('isolated replay parity', () => {
  it.each(['fast', 'fidelity'] as const)('compares an identical artifact with implicit Pattern globals in %s', fidelity => {
    const source = transitionV1Show('crossfade')
    const converted = convertShowRecordV1ToV2(source)
    if (converted.status !== 'converted') throw new Error('fixture conversion failed')
    const code = 'scratchClock=0; export function beforeRender(delta) { scratchClock+=delta/1000 } export function render2D(index,x,y) { rgb(scratchClock,0,0) }'
    const prepared = prepareShowV2ForCompile(converted.record, { byCellId: {}, byPatternInstanceId: { 'out-instance': code, 'in-instance': code }, stageDimension: 2 })
    if (prepared.status !== 'ready') throw new Error('fixture preparation failed')
    const artifact = compileShow(prepared.recipe, LIBRARIES)
    expect(runtimeParity(artifact, artifact, source, converted.record, fidelity, []).matched).toBe(true)
  })
})

import { afterEach, expect, it, vi } from 'vitest'
import fixtureText from '../../e2e/fixtures/showV2AppearanceManagement.json?raw'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { prepareShowStageV2 } from './showPreparedStageV2'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime } from './fastReplay'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from './personalContentProvider'
import { showInitialState, useShowStore } from '../store/showStore'
import { admitShowV2PilotAppearanceEdit } from '../store/showV2PreparedEditAdmission'
import type { ShowClipEffect } from './personalContentRecords'
import neutralResidual from '../../docs/reference/evidence/issue-1038-appearance-adoption/neutral-color-residual.json'
import removalResidual from '../../docs/reference/evidence/issue-1038-appearance-surface/removal-precise-residual.json'

afterEach(() => resetPersonalContentProvider())
const dependencies = { patterns: [{ id: 'appearance-voice', name: 'Appearance Voice', src: 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(.2+x/3,.1+y/4,elapsed/50000)}', controls: {}, updatedAt: 1 }], maps: [], libraries: [], profiles: [], stageMap: null }
function reopen(record: ShowRecordV2) {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record)); expect(opened.status).toBe('opened')
  if (opened.status !== 'opened') throw Error('reopen'); return opened.record
}
function runtime(record: ShowRecordV2, fidelity: 'fast' | 'fidelity', authoredSource?: string) {
  const assets = authoredSource ? { ...dependencies, patterns: [{ ...dependencies.patterns[0], src: authoredSource }] } : dependencies
  const ready = prepareShowStageV2(reopen(record), assets); expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') throw Error('prepare')
  expect(ready.bundle.recipe.clips.filter(clip => !clip.compilerOwnedEmpty)).toHaveLength(1)
  const epe = buildShowEpeExportV2(record, ready.bundle.artifact.code, { id: 'appearance-artifact', stampedAt: '2026-09-16T00:00:00.000Z' })
  expect(epe.status).toBe('exported'); if (epe.status !== 'exported') throw Error('export')
  const source = parseEpe(epe.text).src; expect(source).toBe(epe.source)
  return createFastReplayRuntime({ ...ready.bundle.artifact, code: source, fxCode: emitFixedPoint(source), dimension: 2 },
    { fidelity, randomSeed: 1038, mapPoints: [{ sample: [.2, .4], pos: [.2, .4] }, { sample: [.8, .6], pos: [.8, .6] }] })
}
function compare(actual: ShowRecordV2, expected: ShowRecordV2, preimage: ShowRecordV2, measuredEffect?: 'saturation' | 'contrast') {
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const a = runtime(actual, fidelity), b = runtime(expected, fidelity), old = runtime(preimage, fidelity)
    for (const atMs of [0, 1999, 2000, 5999, 6000, 9000, 9999, 20000, 23000, 24999, 30001]) {
      const options = { stepMs: 100, forceFullIntermediateRender: true }
      const left = a.advanceTo(atMs, options), right = b.advanceTo(atMs, options), original = old.advanceTo(atMs, options)
      expect(left.frame).toEqual(right.frame); expect(left.exports).toEqual(right.exports)
      // The selected ordinary Clip has ended; the held Group alone consumes the shared runtime.
      if (atMs >= 20000 && atMs < 25000) {
        const elapsed = (exports: typeof left.exports) => Object.fromEntries(Object.entries(exports).filter(([name]) => name.includes('elapsed')))
        expect(Object.keys(elapsed(left.exports)).length).toBeGreaterThan(0)
        expect(elapsed(left.exports)).toEqual(elapsed(original.exports))
        const measured = fidelity === 'fast' && measuredEffect ? neutralResidual.find(row => row.effect === measuredEffect && row.atMs === atMs) : undefined
        if (measured) {
          expect(Array.from(original.frame)).toEqual(measured.preimage)
          expect(Array.from(left.frame)).toEqual(measured.candidate)
        } else expect(left.frame).toEqual(original.frame)
      }
    }
  }
}
async function submit(effect: ShowClipEffect) {
  resetPersonalContentProvider(); useShowStore.setState(showInitialState)
  const record = JSON.parse(fixtureText) as ShowRecordV2, before = structuredClone(record)
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'artifact', replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const capture = { record, dependencies, prepared: prepareShowStageV2(record, dependencies) }; expect(capture.prepared.status).toBe('ready')
  const result = await admitShowV2PilotAppearanceEdit({ showId: record.id, baseRevision: 0, capture, isCurrent: () => true, onAdopted: () => {},
    intent: { kind: 'add-effect', clipId: 'voice', scope: 'whole-clip', effect } })
  expect(result.status, JSON.stringify(result)).toBe('applied'); expect(write).toHaveBeenCalledTimes(1)
  const expected = structuredClone(before)
  for (const key of expected.composition.clips[0].appearance.keys) key.value.effects!.push(structuredClone(effect))
  const actual = useShowStore.getState().showV2Pilots[record.id]
  expect(actual.composition).toEqual(expected.composition); expect(record).toEqual(before)
  compare(actual, expected, before, effect.kind === 'saturation' || effect.kind === 'contrast' ? effect.kind : undefined)
}
const effects: ShowClipEffect[] = [
  { id: 'new', kind: 'opacity', opacity: .6 }, { id: 'new', kind: 'brightness', brightness: 1.4 },
  { id: 'new', kind: 'hue', turns: .1 }, { id: 'new', kind: 'saturation', saturation: 1.4 }, { id: 'new', kind: 'contrast', contrast: 1.3 },
  { id: 'new', kind: 'invert', amount: .25 }, { id: 'new', kind: 'threshold', threshold: .4, amount: .5 },
  { id: 'new', kind: 'luma-key', target: .2, tolerance: .1, softness: .2 }, { id: 'new', kind: 'chroma-key', color: '#448844', tolerance: .1, softness: .2 },
  { id: 'new', kind: 'posterize', levels: 5, amount: .5 }, { id: 'new', kind: 'vignette', amount: .5, radius: .5, softness: .2, centerX: .5, centerY: .5, aspect: 1 },
  { id: 'new', kind: 'color-map', amount: .5, shadowR: .1, shadowG: .2, shadowB: .3, highlightR: .7, highlightG: .8, highlightB: .9 },
  { id: 'new', kind: 'translate', x: .1, y: .1 }, { id: 'new', kind: 'rotate', turns: .1 }, { id: 'new', kind: 'scale', x: .8, y: 1.2 },
  { id: 'new', kind: 'shear', x: .1, y: .1 }, { id: 'new', kind: 'ripple', amount: .1, frequency: 3, phase: .2, centerX: .5, centerY: .5 },
  { id: 'new', kind: 'swirl', amount: 1, radius: .6, centerX: .5, centerY: .5 }, { id: 'new', kind: 'bulge', amount: .5, radius: .6, centerX: .5, centerY: .5 },
  { id: 'new', kind: 'pixelate', amount: .5, columns: 4, rows: 4 }, { id: 'new', kind: 'kaleidoscope', amount: .5, segments: 3, rotation: .1, centerX: .5, centerY: .5 },
  { id: 'new', kind: 'wrap' },
]
it.each(effects)('adopts $kind with exact native EPE Fast/Precise output, shared held Group runtime and Restart', submit)

it('adopts dirty whole brightness and retained/interior held values against independent complete-key native programs', async () => {
  resetPersonalContentProvider(); useShowStore.setState(showInitialState)
  const record = JSON.parse(fixtureText) as ShowRecordV2, before = structuredClone(record), expected = structuredClone(record)
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'held-values', replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const apply = async (intent: Parameters<typeof admitShowV2PilotAppearanceEdit>[0]['intent']) => {
    const current = useShowStore.getState().showV2Pilots[record.id]
    return admitShowV2PilotAppearanceEdit({ showId: record.id, baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0,
      capture: { record: current, dependencies, prepared: prepareShowStageV2(current, dependencies) }, isCurrent: () => true, onAdopted: () => {}, intent })
  }
  expect((await apply({ kind: 'appearance', clipId: 'voice', scope: 'whole-clip', patch: { view: { brightness: .5 } } })).status).toBe('applied')
  for (const key of expected.composition.clips[0].appearance.keys) key.value.view.brightness = .5
  expect((await apply({ kind: 'appearance', clipId: 'voice', scope: 'selected-time', atMs: 2000,
    keyIdentity: { kind: 'insert', appearanceKeyId: 'interior' }, patch: { opacity: .7 } })).status).toBe('applied')
  const held = structuredClone(expected.composition.clips[0].appearance.keys[0]); held.id = 'interior'; held.timeMs = 2000; held.value.opacity = .7
  expected.composition.clips[0].appearance.keys.splice(1, 0, held)
  expect((await apply({ kind: 'appearance', clipId: 'voice', scope: 'selected-time', atMs: 6000,
    keyIdentity: { kind: 'retain', appearanceKeyId: 'voice-key-1' }, patch: { view: { phase: .25, mirror: true } } })).status).toBe('applied')
  expected.composition.clips[0].appearance.keys[2].value.view.phase = .25
  expected.composition.clips[0].appearance.keys[2].value.view.mirror = true
  const actual = useShowStore.getState().showV2Pilots[record.id]
  expect(actual.composition).toEqual(expected.composition); expect(write).toHaveBeenCalledTimes(3)
  expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(3)
  compare(actual, expected, before)
})

/**
 * Candidate versus an independently authored record stays exact. Against the
 * preimage the untouched shared runtime must keep its clocks and Fast output;
 * emptying the ordinary Clip's Effect stack removes the incidental Effect-stage
 * clamp, so the fixture Pattern's existing Precise `elapsed/50000` divergence
 * becomes visible on the held Group user at the measured probes below. An
 * independently authored no-Effect record reproduces it identically, so it is a
 * measured existing compiler divergence, not a removal cascade.
 */
function compareRemoval(actual: ShowRecordV2, expected: ShowRecordV2, preimage: ShowRecordV2) {
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const a = runtime(actual, fidelity), b = runtime(expected, fidelity), old = runtime(preimage, fidelity)
    for (const atMs of [0, 1999, 2000, 5999, 6000, 9000, 9999, 20000, 23000, 24999, 30001]) {
      const options = { stepMs: 100, forceFullIntermediateRender: true }
      const left = a.advanceTo(atMs, options), right = b.advanceTo(atMs, options), original = old.advanceTo(atMs, options)
      expect(left.frame).toEqual(right.frame); expect(left.exports).toEqual(right.exports)
      if (atMs < 20000 || atMs >= 25000) continue
      const elapsed = (values: typeof left.exports) => Object.fromEntries(Object.entries(values).filter(([name]) => name.includes('elapsed')))
      expect(Object.keys(elapsed(left.exports)).length).toBeGreaterThan(0)
      expect(elapsed(left.exports)).toEqual(elapsed(original.exports))
      const measured = removalResidual.find(row => row.fidelity === fidelity && row.atMs === atMs)
      if (!measured) { expect(left.frame).toEqual(original.frame); continue }
      expect(Array.from(original.frame)).toEqual(measured.preimage)
      expect(Array.from(left.frame)).toEqual(measured.candidate)
    }
  }
}
async function adopt(record: ShowRecordV2, intent: Parameters<typeof admitShowV2PilotAppearanceEdit>[0]['intent']) {
  const current = useShowStore.getState().showV2Pilots[record.id]
  return admitShowV2PilotAppearanceEdit({ showId: record.id, baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0,
    capture: { record: current, dependencies, prepared: prepareShowStageV2(current, dependencies) }, isCurrent: () => true, onAdopted: () => {}, intent })
}
function seed(id: string): { record: ShowRecordV2; write: ReturnType<typeof vi.fn> } {
  resetPersonalContentProvider(); useShowStore.setState(showInitialState)
  const record = JSON.parse(fixtureText) as ShowRecordV2
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), id, replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  return { record, write }
}

it('adopts explicit Transform/Aperture/Presentation/Blink components against an independently authored native program', async () => {
  const { record, write } = seed('optional-components'), before = structuredClone(record), expected = structuredClone(record)
  const patch = { transform: { positionX: .1, scaleX: .8 }, aperture: { enabled: true, width: .8, aperture: 'ellipse' as const, edge: 'hard' as const, feather: .2 },
    presentation: { mode: 'live' as const }, blink: { rateHz: 2, duty: .6, phase: .1 } }
  expect((await adopt(record, { kind: 'appearance', clipId: 'voice', scope: 'whole-clip', patch })).status).toBe('applied')
  for (const key of expected.composition.clips[0].appearance.keys) {
    key.value.transform = { positionX: .1, positionY: 0, rotation: 0, scaleX: .8, scaleY: 1 }
    key.value.aperture = { enabled: true, x: 0, y: 0, width: .8, height: 1, aperture: 'ellipse', edge: 'hard', feather: .2 }
    key.value.presentation = { mode: 'live' }
    key.value.blink = { rateHz: 2, duty: .6, phase: .1 }
  }
  expect((await adopt(record, { kind: 'appearance', clipId: 'voice', scope: 'whole-clip', patch: { aperture: { feather: null }, blink: null } })).status).toBe('applied')
  for (const key of expected.composition.clips[0].appearance.keys) { delete key.value.aperture!.feather; delete key.value.blink }
  const actual = useShowStore.getState().showV2Pilots[record.id]
  expect(actual.composition).toEqual(expected.composition); expect(write).toHaveBeenCalledTimes(2); expect(record).toEqual(before)
  compare(actual, expected, before)
})

it('removes a whole-Clip Effect with exactly its Clip-owned animation and leaves the shared held Group user exact', async () => {
  const { record, write } = seed('effect-removal')
  record.composition.propertyTracks.push({ id: 'hue-track', target: { kind: 'clip-effect', clipId: 'voice', effectId: 'hue', effectKind: 'hue', parameterId: 'turns' },
    activeStartMs: 0, activeDurationMs: 9000,
    keyframes: [{ id: 'hue-first', timeMs: 0, value: 0, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'hue-last', timeMs: 9000, value: .4, easing: { curve: 'linear' } }] })
  const before = structuredClone(record), expected = structuredClone(record)
  const outcome = await adopt(record, { kind: 'remove-effect', clipId: 'voice', scope: 'whole-clip', effectId: 'hue', effectKind: 'hue' })
  expect(outcome.status, JSON.stringify(outcome)).toBe('applied')
  expect(outcome.affectedTrackIds).toEqual(['hue-track'])
  expect(outcome.removedIds).toEqual(['hue-track'])
  expect(outcome.affectedPropertyKeyIds).toEqual(['hue-first', 'hue-last'])
  expect(outcome.affectedAppearanceKeyIds).toEqual(['voice-key-0', 'voice-key-1', 'voice-key-2'])
  for (const key of expected.composition.clips[0].appearance.keys) key.value.effects = []
  expected.composition.propertyTracks = expected.composition.propertyTracks.filter(track => track.id !== 'hue-track')
  const actual = useShowStore.getState().showV2Pilots[record.id]
  expect(actual.composition).toEqual(expected.composition); expect(write).toHaveBeenCalledTimes(1); expect(record).toEqual(before)
  expect(actual.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
  expect(actual.composition.patternInstances).toEqual(before.composition.patternInstances)
  compareRemoval(actual, expected, before)
})

it('reproduces the measured Precise no-Effect divergence from an independently authored record, not from the removal owner', () => {
  const preimage = JSON.parse(fixtureText) as ShowRecordV2
  const authored = structuredClone(preimage)
  for (const key of authored.composition.clips[0].appearance.keys) key.value.effects = []
  for (const row of removalResidual) {
    const old = runtime(preimage, row.fidelity as 'fast' | 'fidelity'), fresh = runtime(authored, row.fidelity as 'fast' | 'fidelity')
    const options = { stepMs: 100, forceFullIntermediateRender: true }
    expect(Array.from(old.advanceTo(row.atMs, options).frame)).toEqual(row.preimage)
    expect(Array.from(fresh.advanceTo(row.atMs, options).frame)).toEqual(row.candidate)
  }
})

it.each(['saturation', 'contrast'] as const)('isolates measured neutral %s arithmetic from selected parameter leakage in both native modes', kind => {
  const preimage = JSON.parse(fixtureText) as ShowRecordV2
  for (const positive of [false, true]) for (const fidelity of ['fast', 'fidelity'] as const) {
    const source = positive ? 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(.375+x/4,.25+y/4,.625+elapsed/50000)}' : undefined
    const records = [null, kind === 'saturation' ? 1.4 : 1.3, 2].map(amount => {
      const record = structuredClone(preimage)
      if (amount !== null) for (const key of record.composition.clips[0].appearance.keys) key.value.effects!.push({ id: 'new', kind, [kind]: amount } as ShowClipEffect)
      return record
    })
    const consumers = records.map(record => runtime(record, fidelity, source))
    for (const atMs of [0, 1999, 2000, 5999, 6000, 9000, 9999, 20000, 23000, 24999]) {
      const outcomes = consumers.map(consumer => consumer.advanceTo(atMs, { stepMs: 100, forceFullIntermediateRender: true }))
      if (atMs < 20000) continue
      expect(outcomes[1].frame).toEqual(outcomes[2].frame)
      const elapsed = outcomes.map(outcome => Object.fromEntries(Object.entries(outcome.exports).filter(([name]) => name.includes('elapsed'))))
      expect(elapsed[1]).toEqual(elapsed[0]); expect(elapsed[2]).toEqual(elapsed[0])
      if (positive || fidelity === 'fidelity') expect(outcomes[1].frame).toEqual(outcomes[0].frame)
    }
  }
})

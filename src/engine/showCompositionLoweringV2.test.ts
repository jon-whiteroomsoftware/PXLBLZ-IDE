import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import { parseEpe } from './epeImport'
import { nativeDimension } from './loadPattern'
import { buildShowEpeExport } from './showEpeExport'
import { compileShow, type GeneratedShowArtifact } from './showCompiler'
import { showRecordToCompileRecipe, type ShowCompileRecipeSourceLookup } from './showModel'
import { lowerShowCompositionV2ForCompile } from './showCompositionLoweringV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { continuingV1Show, convertibleV1Show, flatV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import { LIBRARIES } from '../pixelblaze/libs'
import type { MapPoint } from './maps/types'

const SOURCE = 'export var calls = 0; export function beforeRender(delta) { calls = calls + 1 } export function render(index) { rgb(index / pixelCount, 0.25, 0.75) }'
const STATEFUL_SOURCE = 'export var calls = 0; export var elapsed = 0; export function beforeRender(delta) { calls = calls + 1; elapsed = elapsed + delta / 1000 } export function render(index) { rgb(elapsed, calls / 100, index / pixelCount) }'
const OUT_SOURCE = 'export var calls = 0; export function beforeRender(delta) { calls = calls + 1 } export function render2D(index, x, y) { rgb(1, x * 0.25, y * 0.25) }'
const IN_SOURCE = 'export var calls = 0; export function beforeRender(delta) { calls = calls + 1 } export function render2D(index, x, y) { rgb(x * 0.25, y * 0.25, 1) }'
const MAP: MapPoint[] = Array.from({ length: 8 }, (_, index) => ({
  sample: [index / 7, 0.5],
  pos: [index / 7, 0.5],
}))

function replay(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity') {
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: MAP, randomSeed: 1034, fidelity })
}

function freeze(result: ReturnType<ReturnType<typeof replay>['renderCurrentFrame']>) {
  return {
    elapsedMs: result.elapsedMs,
    frame: Array.from(result.frame),
    exports: { ...result.exports },
  }
}

describe('lowerShowCompositionV2ForCompile', () => {
  it('derives the existing compiler recipe from global v2 entities without retaining a v1 source snapshot', () => {
    const source = convertibleV1Show()
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: SOURCE } }

    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    const v1Recipe = showRecordToCompileRecipe(source, lookup)
    const v2Recipe = showRecordToCompileRecipe(lowered.show, lowered.lookup)

    expect(v2Recipe).toEqual(v1Recipe)
    expect(lowered.show.composition?.scenes[0].sceneId).toBe('v2-section:0')
    expect(Object.keys(lowered).sort()).toEqual(['lookup', 'show'])
    const artifact = compileShow(v2Recipe, LIBRARIES)
    const exported = buildShowEpeExport(lowered.show, artifact.code, {
      id: 'show-v2-tracer',
      stampedAt: '2026-09-14T00:00:00.000Z',
    })
    const reopened = parseEpe(exported.text)
    expect(reopened).toMatchObject({ name: source.name, stamp: { kind: 'show' } })
    expect(reopened.src).toContain(artifact.code)
  })

  it.each(['fast', 'fidelity'] as const)('preserves compiled output and advancing private state in %s mode', (fidelity) => {
    const source = convertibleV1Show()
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: SOURCE } }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    expect(v2.summary).toEqual(v1.summary)
    expect(v2.code).toBe(v1.code)

    const v1Runtime = replay(v1, fidelity)
    const v2Runtime = replay(v2, fidelity)
    const initialV1 = freeze(v1Runtime.renderCurrentFrame())
    const initialV2 = freeze(v2Runtime.renderCurrentFrame())
    expect(initialV2).toEqual(initialV1)
    const midpointV1 = freeze(v1Runtime.advanceTo(500, { stepMs: 16, forceFullIntermediateRender: true }))
    const midpointV2 = freeze(v2Runtime.advanceTo(500, { stepMs: 16, forceFullIntermediateRender: true }))
    expect(midpointV2).toEqual(midpointV1)
    const prefix = v1.summary.clips.find(clip => clip.id === 'instance')?.prefix
    expect(prefix).toBeTruthy()
    expect(Number(midpointV1.exports[`${prefix}_calls`])).toBeGreaterThan(Number(initialV1.exports[`${prefix}_calls`]))
    const interiorV1 = freeze(v1Runtime.advanceTo(999, { stepMs: 16, forceFullIntermediateRender: true }))
    const interiorV2 = freeze(v2Runtime.advanceTo(999, { stepMs: 16, forceFullIntermediateRender: true }))
    expect(interiorV2).toEqual(interiorV1)
  })

  it.each(['fast', 'fidelity'] as const)('preserves unstamped continuous lifecycle without adding loop reset in %s mode', (fidelity) => {
    const source = continuingV1Show()
    delete source.composition!.executionModel
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    expect(converted.record.composition.executionModel).toBe('continuous')
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: SOURCE } }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    expect(lowered.show.composition?.executionModel).toBeUndefined()
    const v1Recipe = showRecordToCompileRecipe(source, lookup)
    const v2Recipe = showRecordToCompileRecipe(lowered.show, lowered.lookup)
    expect(v2Recipe.deterministicLoopReset).toBeUndefined()
    const v1 = compileShow(v1Recipe, LIBRARIES)
    const v2 = compileShow(v2Recipe, LIBRARIES)
    const left = replay(v1, fidelity)
    const right = replay(v2, fidelity)
    expect(freeze(right.renderCurrentFrame())).toEqual(freeze(left.renderCurrentFrame()))
    for (const atMs of [499, 500, 501, 999, 1_001, 1_250]) {
      const options = { stepMs: 16, forceFullIntermediateRender: true }
      expect(freeze(right.advanceTo(atMs, options))).toEqual(freeze(left.advanceTo(atMs, options)))
    }
  })

  it.each([
    { name: 'shared Continue identity', restartSecond: false, expectedInstances: 1, fidelity: 'fast' },
    { name: 'shared Continue identity', restartSecond: false, expectedInstances: 1, fidelity: 'fidelity' },
    { name: 'fresh Restart identity', restartSecond: true, expectedInstances: 2, fidelity: 'fast' },
    { name: 'fresh Restart identity', restartSecond: true, expectedInstances: 2, fidelity: 'fidelity' },
  ] as const)('preserves flat $name through projection, global lowering, and $fidelity runtime', ({ restartSecond, expectedInstances, fidelity }) => {
    const source = flatV1Show(restartSecond)
    source.scenes.push({ id: 'scene-c', name: 'Finale', durationMs: 500 })
    source.cells[source.cells.length - 1].sceneSpan = restartSecond ? 2 : 3
    const original = structuredClone(source)
    const flatLookup: ShowCompileRecipeSourceLookup = {
      byCellId: restartSecond ? { 'cell-a': STATEFUL_SOURCE, 'cell-b': STATEFUL_SOURCE } : { 'cell-a': STATEFUL_SOURCE },
    }
    const converted = convertShowRecordV1ToV2(source, flatLookup)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    expect(converted.record.composition.patternInstances).toHaveLength(expectedInstances)
    const v2Lookup = {
      byCellId: {},
      byPatternInstanceId: Object.fromEntries(converted.record.composition.patternInstances.map(instance => [instance.id, STATEFUL_SOURCE])),
    }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, v2Lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, flatLookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    expect(source).toEqual(original)
    expect(v2.summary.clips.map(member => member.id)).toEqual(v1.summary.clips.map(member => member.id))
    expect(v2.summary.clips).toHaveLength(expectedInstances)

    const left = replay(v1, fidelity)
    const right = replay(v2, fidelity)
    expect(freeze(right.renderCurrentFrame())).toEqual(freeze(left.renderCurrentFrame()))
    for (const atMs of [499, 500, 501, 999, 1_000, 1_001, 1_499]) {
      const options = { stepMs: 16, forceFullIntermediateRender: true }
      const leftFrame = freeze(left.advanceTo(atMs, options))
      const rightFrame = freeze(right.advanceTo(atMs, options))
      expect(rightFrame.frame).toEqual(leftFrame.frame)
      for (const member of v1.summary.clips) {
        const rightMember = v2.summary.clips.find(candidate => candidate.id === member.id)
        expect(rightMember).toBeTruthy()
        for (const name of ['calls', 'elapsed']) {
          expect(rightFrame.exports[`${rightMember!.prefix}_${name}`]).toEqual(leftFrame.exports[`${member.prefix}_${name}`])
        }
      }
    }
  })

  it.each([
    { name: 'Freeze presentation', patch: { presentation: { mode: 'freeze' as const } }, fidelity: 'fast' },
    { name: 'Freeze presentation', patch: { presentation: { mode: 'freeze' as const } }, fidelity: 'fidelity' },
    { name: 'Blink visibility', patch: { blink: { rateHz: 2, duty: 0.5, phase: 0 } }, fidelity: 'fast' },
    { name: 'Blink visibility', patch: { blink: { rateHz: 2, duty: 0.5, phase: 0 } }, fidelity: 'fidelity' },
  ] as const)('preserves flat time-varying $name frames and state in $fidelity runtime', ({ name, patch, fidelity }) => {
    const source = flatV1Show(false)
    source.scenes.push({ id: 'scene-c', name: 'Finale', durationMs: 500 })
    source.cells[0].sceneSpan = 3
    source.cells[0].viewport = { enabled: true, x: 0, y: 0, width: 1, height: 1, edge: 'hard' }
    Object.assign(source.cells[0], patch)
    const original = structuredClone(source)
    const flatLookup: ShowCompileRecipeSourceLookup = { byCellId: { 'cell-a': STATEFUL_SOURCE } }
    const converted = convertShowRecordV1ToV2(source, flatLookup)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const v2Lookup = {
      byCellId: {},
      byPatternInstanceId: Object.fromEntries(converted.record.composition.patternInstances.map(instance => [instance.id, STATEFUL_SOURCE])),
    }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, v2Lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, flatLookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    expect(source).toEqual(original)
    expect(v2.summary.clips.map(member => member.id)).toEqual(['cell-a'])
    if (name === 'Freeze presentation') {
      expect(v1.summary.specializations.freezeAtEntry.selectedSceneCount).toBeGreaterThan(0)
      expect(v2.summary.specializations.freezeAtEntry.selectedSceneCount).toEqual(v1.summary.specializations.freezeAtEntry.selectedSceneCount)
    }

    const left = replay(v1, fidelity)
    const right = replay(v2, fidelity)
    const leftPrefix = v1.summary.clips[0].prefix
    const rightPrefix = v2.summary.clips[0].prefix
    const frames: number[][] = []
    for (const atMs of [0, 125, 250, 375, 499, 500, 501, 750, 999, 1_000, 1_001, 1_499]) {
      const options = { stepMs: 1, forceFullIntermediateRender: true }
      const leftFrame = freeze(atMs === 0 ? left.renderCurrentFrame() : left.advanceTo(atMs, options))
      const rightFrame = freeze(atMs === 0 ? right.renderCurrentFrame() : right.advanceTo(atMs, options))
      expect(rightFrame.frame).toEqual(leftFrame.frame)
      expect(rightFrame.exports[`${rightPrefix}_calls`]).toEqual(leftFrame.exports[`${leftPrefix}_calls`])
      expect(rightFrame.exports[`${rightPrefix}_elapsed`]).toEqual(leftFrame.exports[`${leftPrefix}_elapsed`])
      frames.push(leftFrame.frame)
    }
    expect(Number(freeze(left.renderCurrentFrame()).exports[`${leftPrefix}_calls`])).toBeGreaterThan(0)
    if (name === 'Freeze presentation') {
      expect(new Set(frames.map(frame => JSON.stringify(frame))).size).toBeGreaterThan(1)
    } else {
      expect(frames.some(frame => frame.every(value => value === 0))).toBe(true)
      expect(frames.some(frame => frame.some(value => value !== 0))).toBe(true)
    }
  })

  it.each(['fast', 'fidelity'] as const)('preserves mapped member state when global lowering changes compiler sections in %s mode', (fidelity) => {
    const source = continuingV1Show()
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: SOURCE } }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    expect(v2.code).not.toBe(v1.code)
    const v1Prefix = v1.summary.clips.find(clip => clip.id === 'instance')?.prefix
    const v2Prefix = v2.summary.clips.find(clip => clip.id === 'instance')?.prefix
    expect(v1Prefix).toBeTruthy()
    expect(v2Prefix).toBeTruthy()

    const left = replay(v1, fidelity)
    const right = replay(v2, fidelity)
    const initialLeft = freeze(left.renderCurrentFrame())
    const initialRight = freeze(right.renderCurrentFrame())
    expect(initialRight.frame).toEqual(initialLeft.frame)
    for (const atMs of [499, 500, 501, 750, 999]) {
      const options = { stepMs: 16, forceFullIntermediateRender: true }
      const leftFrame = freeze(left.advanceTo(atMs, options))
      const rightFrame = freeze(right.advanceTo(atMs, options))
      expect(rightFrame.frame).toEqual(leftFrame.frame)
      expect(rightFrame.exports[`${v2Prefix}_calls`]).toEqual(leftFrame.exports[`${v1Prefix}_calls`])
    }
  })

  it.each(['fast', 'fidelity'] as const)('preserves held opacity, Transform, and Aperture keys at boundaries and interiors in %s mode', (fidelity) => {
    for (const change of [
      (placement: ReturnType<typeof secondSegment>) => { placement.opacity = 0.25 },
      (placement: ReturnType<typeof secondSegment>) => {
        placement.transform = { positionX: 0.2, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
      },
      (placement: ReturnType<typeof secondSegment>) => {
        placement.viewport = { enabled: true, x: 0.2, y: 0, width: 0.6, height: 1 }
      },
    ]) {
      const source = divergentAppearanceShow()
      change(secondSegment(source))
      const before = JSON.stringify(source)
      const converted = convertShowRecordV1ToV2(source)
      expect(converted.status).toBe('converted')
      if (converted.status !== 'converted') continue
      const clip = converted.record.composition.clips[0]
      expect(converted.record.composition.clips).toHaveLength(1)
      expect(clip.appearance.keys.map(key => ({ id: key.id, timeMs: key.timeMs }))).toEqual([
        { id: 'clip:appearance:1', timeMs: 0 },
        { id: 'clip:appearance:2', timeMs: 500 },
      ])
      expect(JSON.parse(JSON.stringify(converted.record))).toEqual(converted.record)
      const lookup = { byCellId: {}, byPatternInstanceId: { instance: OUT_SOURCE }, stageDimension: 2 as const }
      const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
      const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
      const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
      const v1Prefix = v1.summary.clips.find(member => member.id === 'instance')!.prefix
      const v2Prefix = v2.summary.clips.find(member => member.id === 'instance')!.prefix
      const left = replay(v1, fidelity)
      const right = replay(v2, fidelity)
      expect(freeze(right.renderCurrentFrame())).toEqual(freeze(left.renderCurrentFrame()))
      for (const atMs of [249, 499, 500, 501, 750, 999]) {
        const options = { stepMs: 16, forceFullIntermediateRender: true }
        const leftResult = freeze(left.advanceTo(atMs, options))
        const rightResult = freeze(right.advanceTo(atMs, options))
        expect(rightResult.frame).toEqual(leftResult.frame)
        expect(rightResult.exports[`${v2Prefix}_calls`]).toEqual(leftResult.exports[`${v1Prefix}_calls`])
      }
      expect(JSON.stringify(source)).toBe(before)
    }
  })

  it.each(['fast', 'fidelity'] as const)('resets mapped member state across an actual deterministic loop in %s mode', (fidelity) => {
    const source = continuingV1Show()
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: SOURCE } }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    const v1Prefix = v1.summary.clips.find(clip => clip.id === 'instance')!.prefix
    const v2Prefix = v2.summary.clips.find(clip => clip.id === 'instance')!.prefix

    const phase = (artifact: GeneratedShowArtifact, prefix: string) => {
      const runtime = replay(artifact, fidelity)
      runtime.renderCurrentFrame()
      const result = freeze(runtime.advanceLive(250))
      return { frame: result.frame, calls: result.exports[`${prefix}_calls`] }
    }
    const secondLoop = (artifact: GeneratedShowArtifact, prefix: string) => {
      const runtime = replay(artifact, fidelity)
      runtime.renderCurrentFrame()
      runtime.advanceLive(1_000)
      const result = freeze(runtime.advanceLive(250))
      return { frame: result.frame, calls: result.exports[`${prefix}_calls`] }
    }

    expect(secondLoop(v1, v1Prefix)).toEqual(phase(v1, v1Prefix))
    expect(secondLoop(v2, v2Prefix)).toEqual(phase(v2, v2Prefix))
    expect(secondLoop(v2, v2Prefix)).toEqual(secondLoop(v1, v1Prefix))
  })

  it('carries the selected Layout definition, split parameter, and Show repeat scale into derived compiler sections', () => {
    const converted = convertShowRecordV1ToV2(convertibleV1Show())
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    converted.record.zoneLayouts.unshift({
      id: 'unused-layout', name: 'Unused', zones: [], logical: { kind: 'single', zoneIds: ['zone'] },
    })
    converted.record.composition.layoutOccurrences[0].parameters.splitPosition = 0.3
    converted.record.composition.sampleRemap.repeatScale = 2

    const lowered = lowerShowCompositionV2ForCompile(converted.record, { byCellId: {}, byPatternInstanceId: { instance: SOURCE } })

    expect(lowered.show.routingLayouts[0].id).toBe('layout')
    expect(lowered.show.scenes[0]).toMatchObject({
      routingTargets: { splitPosition: 0.3 },
      sampleTargets: { repeatScale: 2 },
    })
  })

  it.each(['fast', 'fidelity'] as const)('keeps narrative Marker edits inert to generated behavior and state in %s mode', (fidelity) => {
    const baseline = convertedRecord()
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: SOURCE } }
    const artifactFor = (record: typeof baseline) => {
      const lowered = lowerShowCompositionV2ForCompile(record, lookup)
      return compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    }
    const baselineArtifact = artifactFor(baseline)
    const variants = [
      { ...structuredClone(baseline), composition: { ...structuredClone(baseline.composition), markers: [] } },
      {
        ...structuredClone(baseline),
        composition: {
          ...structuredClone(baseline.composition),
          markers: baseline.composition.markers.map(marker => ({ ...marker, timeMs: 333, name: 'Moved chapter' })),
        },
      },
      {
        ...structuredClone(baseline),
        composition: {
          ...structuredClone(baseline.composition),
          markers: [...structuredClone(baseline.composition.markers), { id: 'chapter-extra', timeMs: 667, name: 'Extra chapter' }],
        },
      },
    ]
    for (const variant of variants) {
      const artifact = artifactFor(variant)
      expect(artifact.code).toBe(baselineArtifact.code)
      expect(artifact.fxCode).toBe(baselineArtifact.fxCode)
      const left = replay(baselineArtifact, fidelity)
      const right = replay(artifact, fidelity)
      expect(freeze(right.renderCurrentFrame())).toEqual(freeze(left.renderCurrentFrame()))
      for (const atMs of [332, 333, 334, 666, 667, 668]) {
        const options = { stepMs: 16, forceFullIntermediateRender: true }
        expect(freeze(right.advanceTo(atMs, options))).toEqual(freeze(left.advanceTo(atMs, options)))
      }
    }
  })

  it('preserves a property-only carrier through global-time conversion and actual replay', () => {
    const source = convertibleV1Show()
    source.composition!.scenes[0].propertyTracks = [{
      id: 'brightness',
      target: { kind: 'placement-view', placementId: 'clip', property: 'brightness' },
      keyframes: [
        { id: 'dim', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
        { id: 'bright', timeMs: 1_000, value: 1, easing: { curve: 'linear' } },
      ],
    }]
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    expect(converted.record.composition.propertyTracks[0]).toMatchObject({
      target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' },
      keyframes: [{ timeMs: 0 }, { timeMs: 1_000 }],
    })
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: SOURCE } }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    expect(v2.code).toBe(v1.code)

    for (const fidelity of ['fast', 'fidelity'] as const) {
      const left = replay(v1, fidelity)
      const right = replay(v2, fidelity)
      freeze(left.renderCurrentFrame())
      freeze(right.renderCurrentFrame())
      for (const atMs of [250, 500, 750]) {
        const options = { stepMs: 16, forceFullIntermediateRender: true }
        expect(freeze(right.advanceTo(atMs, options))).toEqual(freeze(left.advanceTo(atMs, options)))
      }
    }
  })

  it.each(['fast', 'fidelity'] as const)('activates a Cut-scoped Effect track only for its half-open source contribution in %s mode', (fidelity) => {
    const source = cutScopedEffectTrackShow()
    const before = JSON.stringify(source)
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    expect(converted.record.composition.propertyTracks).toEqual([
      expect.objectContaining({ id: 'gain-track', activeStartMs: 0, activeDurationMs: 500 }),
    ])
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: 'export function render(index) { rgb(1, 1, 1) }' } }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    const left = replay(v1, fidelity)
    const right = replay(v2, fidelity)
    expect(freeze(right.renderCurrentFrame())).toEqual(freeze(left.renderCurrentFrame()))
    const expectations = [
      [250, 0.625], [499, 0.2515], [500, 1], [750, 1], [1_000, 0.5], [1_250, 0.5],
    ] as const
    let previousMs = 0
    for (const [atMs, expected] of expectations) {
      const leftResult = freeze(left.advanceLive(atMs - previousMs))
      const rightResult = freeze(right.advanceLive(atMs - previousMs))
      expect(rightResult).toEqual(leftResult)
      expect(leftResult.frame[0]).toBeCloseTo(expected, fidelity === 'fast' ? 8 : 4)
      previousMs = atMs
    }
    expect(JSON.stringify(source)).toBe(before)
  })

  it('refuses the proposed two-Zone coincident positive-Transition widening at the current compiler boundary', () => {
    const record = convertedRecord()
    record.zones.push({ id: 'zone-b', name: 'Second', nominalPixelCount: 16 })
    record.zoneLayouts[0].logical = { kind: 'split', zoneIds: ['zone', 'zone-b'], axis: 'x' }
    record.composition.layers.push({ id: 'layer:zone-b:main', zoneId: 'zone-b', name: 'Main', rank: 0 })
    record.composition.patternInstances.push(
      { ...record.composition.patternInstances[0], id: 'out-b' },
      { ...record.composition.patternInstances[0], id: 'in-b' },
    )
    record.composition.clips = [
      { ...record.composition.clips[0], id: 'out-a', durationMs: 400 },
      { ...record.composition.clips[0], id: 'in-a', instanceId: 'instance', startMs: 600, durationMs: 400, appearance: appearanceAt(record.composition.clips[0], 600) },
      { ...record.composition.clips[0], id: 'out-b-clip', instanceId: 'out-b', zoneId: 'zone-b', layerId: 'layer:zone-b:main', durationMs: 400 },
      { ...record.composition.clips[0], id: 'in-b-clip', instanceId: 'in-b', zoneId: 'zone-b', layerId: 'layer:zone-b:main', startMs: 600, durationMs: 400, appearance: appearanceAt(record.composition.clips[0], 600) },
    ]
    record.composition.transitions = [
      {
        id: 'transition-a', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live', propertyRamps: [],
        participants: [{ id: 'participant-a', zoneId: 'zone', layerId: 'layer:zone:main', fromClipId: 'out-a', toClipId: 'in-a' }],
      },
      {
        id: 'transition-b', kind: 'wipe', durationMs: 200, easing: { curve: 'linear' }, wipeVariant: 'linear', propertyRamps: [],
        participants: [{ id: 'participant-b', zoneId: 'zone-b', layerId: 'layer:zone-b:main', fromClipId: 'out-b-clip', toClipId: 'in-b-clip' }],
      },
    ]

    expect(() => lowerShowCompositionV2ForCompile(record, {
      byCellId: {}, byPatternInstanceId: { instance: SOURCE, 'out-b': SOURCE, 'in-b': SOURCE },
    })).toThrow('independent render targets')
  })

  it('refuses a Transition-bearing global Clip with later appearance keys instead of lowering only key zero', () => {
    const source = transitionV1Show('crossfade', 'snapshot-live')
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const outgoing = converted.record.composition.clips.find(clip => clip.id === 'out')!
    outgoing.appearance.keys.push({
      ...structuredClone(outgoing.appearance.keys[0]),
      id: 'out:appearance:2',
      timeMs: 200,
      value: { ...structuredClone(outgoing.appearance.keys[0].value), opacity: 0.25 },
    })
    const before = JSON.stringify(converted.record)

    expect(() => lowerShowCompositionV2ForCompile(converted.record, {
      byCellId: {},
      byPatternInstanceId: { 'out-instance': OUT_SOURCE, 'in-instance': IN_SOURCE },
      stageDimension: 2,
    })).toThrow('multi-key Clip appearance with Transitions')
    expect(JSON.stringify(converted.record)).toBe(before)
  })

  it.each([
    ['Clip repeat sampling', (record: ReturnType<typeof convertedRecord>) => { record.composition.clips[0].zoneSampleMode = 'repeat' }, 'repeat-mode'],
    ['Transition property ramps', (record: ReturnType<typeof convertedRecord>) => {
      record.composition.clips = [
        { ...record.composition.clips[0], id: 'from', durationMs: 400 },
        { ...record.composition.clips[0], id: 'to', startMs: 600, durationMs: 400, appearance: appearanceAt(record.composition.clips[0], 600) },
      ]
      record.composition.transitions = [{
        id: 'transition', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' },
        crossfadePolicy: 'snapshot-live',
        participants: [{ id: 'participant', zoneId: 'zone', layerId: 'layer:zone:main', fromClipId: 'from', toClipId: 'to' }],
        propertyRamps: [{ target: { kind: 'clip-opacity', clipId: 'to' }, from: 0 }],
      }]
    }, 'property-ramp'],
  ])('refuses unproved %s instead of dropping it', (_name, change, message) => {
    const record = convertedRecord()
    change(record)
    expect(() => lowerShowCompositionV2ForCompile(record, {
      byCellId: {}, byPatternInstanceId: { instance: SOURCE },
    })).toThrow(message)
  })

  it.each([
    ['crossfade snapshot/live', 'crossfade', 'snapshot-live'],
    ['crossfade live/live', 'crossfade', 'live-live'],
    ['fade through color', 'fade-color', undefined],
    ['wipe', 'wipe', undefined],
    ['dissolve', 'dither', undefined],
    ['portal', 'portal', undefined],
    ['motion', 'motion', undefined],
  ] as const)('preserves %s through converter, derived sections, compiler, Fast, and Precise', (_name, kind, policy) => {
    const source = transitionV1Show(kind, policy)
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const lookup = {
      byCellId: {},
      byPatternInstanceId: { 'out-instance': OUT_SOURCE, 'in-instance': IN_SOURCE },
      stageDimension: 2 as const,
    }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    expect(v2.code).toBe(v1.code)
    expect(v2.summary).toEqual(v1.summary)

    for (const fidelity of ['fast', 'fidelity'] as const) {
      const left = replay(v1, fidelity)
      const right = replay(v2, fidelity)
      expect(freeze(right.renderCurrentFrame())).toEqual(freeze(left.renderCurrentFrame()))
      for (const atMs of [399, 400, 401, 500, 599, 600, 601]) {
        const options = { stepMs: 16, forceFullIntermediateRender: true }
        expect(freeze(right.advanceTo(atMs, options))).toEqual(freeze(left.advanceTo(atMs, options)))
      }
    }
  })
})

function convertedRecord() {
  const result = convertShowRecordV1ToV2(convertibleV1Show())
  if (result.status !== 'converted') throw new Error(result.issues.map(issue => issue.message).join('; '))
  return result.record
}

function appearanceAt(clip: ReturnType<typeof convertedRecord>['composition']['clips'][number], timeMs: number) {
  return { keys: [{ ...structuredClone(clip.appearance.keys[0]), id: `${clip.id}:appearance:${timeMs}`, timeMs }] }
}

function divergentAppearanceShow() {
  const source = continuingV1Show()
  source.id = 'divergent-appearance'
  return source
}

function secondSegment(source: ReturnType<typeof divergentAppearanceShow>) {
  return source.composition!.scenes[1].zones[0].main[0]
}

function cutScopedEffectTrackShow() {
  const source = convertibleV1Show()
  source.id = 'cut-scoped-effect-track'
  source.scenes = [
    { id: 'scene-a', name: 'Tracked', durationMs: 500 },
    { id: 'scene-b', name: 'Absent', durationMs: 500 },
    { id: 'scene-c', name: 'Static re-add', durationMs: 500 },
  ]
  source.transitions = [
    { id: 'cut-a', afterSceneId: 'scene-a', kind: 'cut', durationMs: 0, easing: { curve: 'linear' } },
    { id: 'cut-b', afterSceneId: 'scene-b', kind: 'cut', durationMs: 0, easing: { curve: 'linear' } },
  ]
  source.composition!.durationMs = 1_500
  source.composition!.scenes = [
    {
      sceneId: 'scene-a',
      propertyTracks: [{
        id: 'gain-track',
        target: { kind: 'placement-effect', placementId: 'clip-a', effectId: 'gain', effectKind: 'brightness', parameterId: 'brightness' },
        keyframes: [
          { id: 'gain-start', timeMs: 0, value: 1, easing: { curve: 'linear' } },
          { id: 'gain-end', timeMs: 500, value: 0.25, easing: { curve: 'linear' } },
        ],
      }],
      zones: [{ zoneId: 'zone', main: [{
        id: 'clip-a', instanceId: 'instance', startMs: 0, durationMs: 500,
        view: { mirror: false, phase: 0, brightness: 1 },
        effects: [{ id: 'gain', kind: 'brightness', brightness: 1 }],
      }], overlays: [] }],
    },
    {
      sceneId: 'scene-b',
      zones: [{ zoneId: 'zone', main: [{
        id: 'clip-b', instanceId: 'instance', startMs: 0, durationMs: 500,
        view: { mirror: false, phase: 0, brightness: 1 },
      }], overlays: [] }],
    },
    {
      sceneId: 'scene-c',
      zones: [{ zoneId: 'zone', main: [{
        id: 'clip-c', instanceId: 'instance', startMs: 0, durationMs: 500,
        view: { mirror: false, phase: 0, brightness: 1 },
        effects: [{ id: 'gain', kind: 'brightness', brightness: 0.5 }],
      }], overlays: [] }],
    },
  ]
  return source
}

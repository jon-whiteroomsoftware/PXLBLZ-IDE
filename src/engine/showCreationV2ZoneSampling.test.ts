import { describe, expect, it } from 'vitest'
import type { MapPoint } from './maps/types'
import type { ShowOutputContract } from './personalContentRecords'
import type { GeneratedShowArtifact } from './showCompiler'
import { compileShow } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { createShowV2WithOutputContract } from './showCreationV2'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { createShowWithOutputContract, showRecordToCompileRecipe } from './showModel'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from './showOutputContract'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS } from '@/pixelblaze/stock/patterns'

/**
 * What `zoneSampleMode` costs a fresh Show (#1039).
 *
 * Creating new v2 Shows with `span` rests on the premise that with one Zone
 * `span` and `independent` address the same complete domain - the same premise
 * `showCompositionLoweringV2` states in its own comment before admitting an
 * `independent` participant Transition on the flat route. The premise decides
 * a route, and the route decides the emitter: `independent` keeps the flat
 * emitter, whose bytes are the fresh v1 Show's, while `span` takes the routed
 * one.
 *
 * These cases measure that difference where the consumer sees it - a reopened
 * `.epe` replayed in Fast and Precise over the Show's own declared Stage - so
 * the sampling decision rests on measurement rather than on the comment. The
 * premise holds for the Installation Show's own timeline and fails twice:
 * beyond Show End in both contracts, and from the first frame in Portable.
 */

const INSTALLATION_PIXELS = 60
const PORTABLE_PIXELS = 120
const INSTALLATION = createInstallationShowOutputContract({ outputMapId: null, pixelCount: INSTALLATION_PIXELS })
const PORTABLE = createPortableShowOutputContract({ referenceMapId: null, referencePixelCount: PORTABLE_PIXELS })
const SOURCES = { 'instance-1': DEMOS.TestPattern1D, 'instance-2': DEMOS.CometLoom }
const SHOW_END_MS = 62_000
const STEP_MS = 16

/** The Show's own timeline: before, inside, and after the Crossfade window. */
const TIMELINE_MS = [16_000, 29_984, 30_000, 31_008, 32_000, 45_008, 58_000, 61_968]

type Mode = 'span' | 'independent'

function fresh(contract: ShowOutputContract, mode: Mode) {
  const record = createShowV2WithOutputContract('fresh', 'Fresh Show', contract, 1)
  for (const clip of record.composition.clips) clip.zoneSampleMode = mode
  return record
}

function built(contract: ShowOutputContract, mode: Mode) {
  const record = fresh(contract, mode)
  const prepared = prepareShowV2ForCompile(record, { byCellId: {}, byPatternInstanceId: SOURCES, stageDimension: 2 })
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  // The oracle is what the Controller receives: the exported artifact reopened
  // through its own importer, not the in-memory compile result.
  const exported = buildShowEpeExportV2(record, artifact.code)
  if (exported.status !== 'exported') throw new Error(exported.message)
  return { route: prepared.provenance.route, artifact, source: parseEpe(exported.text).src }
}

function freshV1Artifact(contract: ShowOutputContract) {
  const legacy = createShowWithOutputContract('fresh', 'Fresh Show', contract, 1)
  return compileShow(showRecordToCompileRecipe(legacy, {
    byCellId: { 'cell-1': DEMOS.TestPattern1D, 'cell-2': DEMOS.CometLoom },
    byPatternInstanceId: {},
    stageDimension: 2,
  }), LIBRARIES)
}

/** One map point per declared Stage pixel, as a matching Controller supplies. */
function stage(pixelCount: number, dimension: 1 | 2 | 3): MapPoint[] {
  return Array.from({ length: pixelCount }, (_, index) => {
    const x = index / (pixelCount - 1)
    const sample = dimension === 1 ? [x] : dimension === 2 ? [x, 0.5] : [x, 0.5, 0.25]
    return { sample, pos: [x, 0.5] as [number, number] }
  })
}

function replay(built: { artifact: GeneratedShowArtifact; source: string }, points: ReturnType<typeof stage>, fidelity: 'fast' | 'fidelity') {
  return createFastReplayRuntime({
    code: built.source,
    fxCode: built.artifact.fxCode,
    metadata: built.artifact.metadata,
    dimension: nativeDimension(built.artifact.metadata.renderFns),
  }, { mapPoints: points, randomSeed: 1039, fidelity })
}

/** Each compiled member's own exported scalars, keyed by its authored identity. */
function memberState(result: { exports: Record<string, unknown> }, artifact: GeneratedShowArtifact) {
  const normalized = new Set(artifact.metadata.deterministicReplay?.normalizedBindings ?? [])
  return artifact.summary.clips.map(member => Object.fromEntries(Object.entries(result.exports)
    .filter(([key, value]) => key.startsWith(`${member.prefix}_`) && !normalized.has(key) && (typeof value === 'number' || typeof value === 'boolean'))
    .map(([key, value]) => [key.slice(member.prefix.length + 1), value])))
}

function maxChannelDifference(left: { frame: ArrayLike<number> }, right: { frame: ArrayLike<number> }) {
  return Array.from(left.frame).reduce((largest, value, index) => Math.max(largest, Math.abs(value - right.frame[index])), 0)
}

describe('a fresh Show under each Zone sampling mode', () => {
  it.each([
    ['installation', INSTALLATION],
    ['portable', PORTABLE],
  ] as const)('lowers %s through a different emitter for each mode, and only `independent` keeps the v1 bytes', (_name, contract) => {
    const span = built(contract, 'span')
    const independent = built(contract, 'independent')
    expect([span.route, independent.route]).toEqual(['transition', 'continuous-flat'])
    expect(independent.artifact.code).toBe(freshV1Artifact(contract).code)
    expect(span.artifact.code).not.toBe(independent.artifact.code)
    // The routed emitter names members by runtime instance, the flat one by Clip.
    expect(span.artifact.summary.clips.map(member => member.id)).toEqual(['instance-1', 'instance-2'])
    expect(independent.artifact.summary.clips.map(member => member.id)).toEqual(['clip-1', 'clip-2'])
  })

  it.each(['fast', 'fidelity'] as const)(
    'renders identical Installation output and member state through the Show\'s own timeline in %s',
    fidelity => {
      const span = built(INSTALLATION, 'span')
      const independent = built(INSTALLATION, 'independent')
      const points = stage(INSTALLATION_PIXELS, 1)
      const left = replay(span, points, fidelity)
      const right = replay(independent, points, fidelity)
      const first = [left.renderCurrentFrame(), right.renderCurrentFrame()] as const
      expect(Array.from(first[0].frame)).toEqual(Array.from(first[1].frame))
      expect(memberState(first[0], span.artifact)).toEqual(memberState(first[1], independent.artifact))
      for (const timeMs of TIMELINE_MS) {
        const advance = { stepMs: STEP_MS, forceFullIntermediateRender: true }
        const spanResult = left.advanceTo(timeMs, advance)
        const independentResult = right.advanceTo(timeMs, advance)
        expect(Array.from(spanResult.frame), `frame@${timeMs}`).toEqual(Array.from(independentResult.frame))
        expect(memberState(spanResult, span.artifact), `state@${timeMs}`)
          .toEqual(memberState(independentResult, independent.artifact))
      }
    },
  )

  /**
   * First counterexample. The routed emitter wraps the Show clock at Show End;
   * the flat emitter, and therefore today's fresh Show and every fresh v1 Show,
   * holds its last Clip forever. v1 makes the same switch the moment a second
   * Zone is added, so this is the routed emitter's established behavior arriving
   * one edit earlier - but for a fresh Show it is a change at the Controller.
   */
  it('wraps the Show clock under `span` and never wraps under `independent`', () => {
    const span = built(INSTALLATION, 'span')
    const independent = built(INSTALLATION, 'independent')
    const clock = (source: string) => source.slice(source.indexOf('export function beforeRender')).split('\n')[1].trim()
    expect(clock(span.artifact.code)).toContain(`% ${SHOW_END_MS / 1_000}`)
    expect(clock(independent.artifact.code)).not.toContain('%')

    const points = stage(INSTALLATION_PIXELS, 1)
    const advance = { stepMs: STEP_MS, forceFullIntermediateRender: true }
    const left = replay(span, points, 'fast')
    const right = replay(independent, points, 'fast')
    left.renderCurrentFrame()
    right.renderCurrentFrame()
    // One frame past Show End: `span` is playing Clip 1 again while
    // `independent` is still playing Clip 2, thirty seconds past its end.
    const afterEnd = [left.advanceTo(62_016, advance), right.advanceTo(62_016, advance)] as const
    expect(maxChannelDifference(afterEnd[0], afterEnd[1])).toBeGreaterThan(0)
    expect(memberState(afterEnd[0], span.artifact).map(member => member.elapsed_ms)).toEqual([32_016, 32_000])
    expect(memberState(afterEnd[1], independent.artifact).map(member => member.elapsed_ms)).toEqual([32_000, 32_016])
  })

  /**
   * The same wrap, one frame earlier in Precise: the emulated 16.16 Show clock
   * accumulates about +25 ms over the Show's 3,875 frames, so `span` wraps
   * before nominal Show End. This is the Precise-mode arithmetic the repository
   * measures rather than claims away; it is visible only because one route
   * wraps and the other does not.
   */
  it('reaches that wrap one frame before Show End in Precise', () => {
    const span = built(INSTALLATION, 'span')
    const independent = built(INSTALLATION, 'independent')
    const points = stage(INSTALLATION_PIXELS, 1)
    const advance = { stepMs: STEP_MS, forceFullIntermediateRender: true }
    const left = replay(span, points, 'fidelity')
    const right = replay(independent, points, 'fidelity')
    left.renderCurrentFrame()
    right.renderCurrentFrame()
    const held = [left.advanceTo(61_968, advance), right.advanceTo(61_968, advance)] as const
    expect(Array.from(held[0].frame)).toEqual(Array.from(held[1].frame))
    const wrapped = [left.advanceTo(61_984, advance), right.advanceTo(61_984, advance)] as const
    expect(maxChannelDifference(wrapped[0], wrapped[1])).toBeGreaterThan(0)
  })

  /**
   * Second counterexample, and the smaller one. A Portable Show's reference is
   * a 2D map, so the routed emitter emits `render2D` while the flat emitter
   * keeps the 1D artifact both stock Patterns are written for. The two artifacts
   * disagree on the very first frame, before any Transition or Show End.
   */
  it('changes a Portable Show from a 1D to a 2D artifact under `span`, differing from the first frame', () => {
    const span = built(PORTABLE, 'span')
    const independent = built(PORTABLE, 'independent')
    expect(span.artifact.metadata.renderFns).toMatchObject({ hasRender: false, hasRender2D: true })
    expect(independent.artifact.metadata.renderFns).toMatchObject({ hasRender: true, hasRender2D: false })
    const points = stage(PORTABLE_PIXELS, 2)
    const first = [
      replay(span, points, 'fast').renderCurrentFrame(),
      replay(independent, points, 'fast').renderCurrentFrame(),
    ] as const
    expect(maxChannelDifference(first[0], first[1])).toBeGreaterThan(0)
  })

  /**
   * Third difference, on the mismatched-count path the device notes warn about:
   * `span` addresses the Zone's declared range and reports its nominal pixel
   * count to the Pattern, while the flat artifact adapts to whatever the
   * Controller actually has. A 30-LED Controller running this 60-pixel Show
   * sees different output from the first Clip.
   */
  it('reports the declared Stage count under `span` when the Controller has fewer pixels', () => {
    const span = built(INSTALLATION, 'span')
    const independent = built(INSTALLATION, 'independent')
    const points = stage(30, 1)
    const advance = { stepMs: STEP_MS, forceFullIntermediateRender: true }
    const left = replay(span, points, 'fast')
    const right = replay(independent, points, 'fast')
    left.renderCurrentFrame()
    right.renderCurrentFrame()
    const sampled = [left.advanceTo(16_000, advance), right.advanceTo(16_000, advance)] as const
    expect(memberState(sampled[0], span.artifact)[0].pixelCount).toBe(INSTALLATION_PIXELS)
    expect(memberState(sampled[1], independent.artifact)[0].pixelCount).toBe(30)
    expect(maxChannelDifference(sampled[0], sampled[1])).toBeGreaterThan(0)
  })
})

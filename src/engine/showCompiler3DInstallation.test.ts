import { describe, expect, it } from 'vitest'
import { show3DInstallationFixture } from '../test/show3DInstallationFixture'
import { captureShowStageEditV2 } from './showPreparedStageV2'
import { buildShowV2RouteArtifacts } from './showV2RouteDelivery'
import { parseEpe } from './epeImport'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { compileShow, type GeneratedShowArtifact, type ShowCompileOptions, type ShowRecipe } from './showCompiler'
import { validateShowRecordV2 } from './showCompositionV2'
import { qualifyShowV2PilotArtifacts } from './showV2Pilot'
import { parseShowFileBundle } from './showFileBundle'
import { createCustomMap } from './maps'

type Fixture = ReturnType<typeof show3DInstallationFixture>
type Fidelity = 'fast' | 'fidelity'
const gradient = 'export function render3D(i,x,y,z){rgb(x,y,z)}'

function delivered(fixture: Fixture, options?: ShowCompileOptions, editRecipe?: (recipe: ShowRecipe) => void) {
  expect(validateShowRecordV2(fixture.record)).toEqual([])
  const { prepared } = captureShowStageEditV2(fixture.record, fixture.dependencies)
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared))
  let bundle = prepared.bundle
  if (options || editRecipe) {
    const recipe = structuredClone(bundle.recipe)
    editRecipe?.(recipe)
    bundle = { ...bundle, recipe, artifact: compileShow(recipe, bundle.libraries, options) }
  }
  const delivery = buildShowV2RouteArtifacts(bundle)
  if (delivery.status !== 'ready') throw new Error(delivery.message)
  expect(bundle.presentation.stageDimension).toBe(3)
  expect(bundle.presentation.stageMap?.dim).toBe(3)
  expect(bundle.artifact.metadata.renderFns).toMatchObject({ hasRender: false, hasRender2D: true, hasRender3D: true })
  return { bundle, source: parseEpe(delivery.artifacts.epe.text).src }
}

function replay(source: string, artifact: GeneratedShowArtifact, fixture: Fixture, fidelity: Fidelity) {
  return createFastReplayRuntime({ code: source, fxCode: artifact.fxCode, metadata: artifact.metadata, dimension: nativeDimension(artifact.metadata.renderFns) }, { mapPoints: fixture.points, randomSeed: 1198, fidelity })
}

function assertPixels(pixels: number[][], fixture: Fixture, fidelity: Fidelity, expected: (p: number[], i: number) => number[]) {
  expect(pixels).toHaveLength(960)
  pixels.forEach((pixel, i) => pixel.forEach((channel, c) => {
    expect(channel, `pixel ${i}, channel ${c}`).toBeCloseTo(expected(fixture.points[i].sample, i)[c], fidelity === 'fast' ? 7 : 3)
  }))
}

/** Force multiple holds so shared physical Cut dispatch is exercised. */
function cutClips(fixture: Fixture) {
  for (const clip of [...fixture.record.composition.clips]) {
    clip.durationMs = 1000
    const next = structuredClone(clip)
    next.id += '-next'
    next.startMs = 1000
    next.appearance.keys[0].id += '-next'
    next.appearance.keys[0].timeMs = 1000
    fixture.record.composition.clips.push(next)
  }
}

describe('Installation Stage xyz at the delivered artifact', () => {
  for (const mode of ['span', 'independent'] as const) {
    for (const fidelity of ['fast', 'fidelity'] as const) {
      it.each(['x', 'y', 'z'] as const)(`${mode}/${fidelity} preserves %s on every pixel`, axis => {
        const { record, dependencies, points } = show3DInstallationFixture(`export function render3D(i,x,y,z){hsv(0,0,${axis})}`, mode)
        const capture = captureShowStageEditV2(record, dependencies)
        expect(capture.prepared.status).toBe('ready')
        if (capture.prepared.status !== 'ready') throw new Error(JSON.stringify(capture.prepared))
        const { bundle } = capture.prepared
        expect(bundle.presentation.stageMap?.dim).toBe(3)
        const delivery = buildShowV2RouteArtifacts(bundle)
        expect(delivery.status).toBe('ready')
        if (delivery.status !== 'ready') throw new Error(delivery.message)
        const source = parseEpe(delivery.artifacts.epe.text).src
        expect(bundle.artifact.metadata.renderFns.hasRender3D).toBe(true)
        const runtime = createFastReplayRuntime({ code: source, fxCode: bundle.artifact.fxCode, metadata: bundle.artifact.metadata, dimension: nativeDimension(bundle.artifact.metadata.renderFns) }, { mapPoints: points, randomSeed: 1198, fidelity })
        const { pixels } = runtime.renderCurrentFrame()
        expect(pixels).toHaveLength(960)
        const coordinate = ['x', 'y', 'z'].indexOf(axis)
        expect(new Set(points.map(p => p.sample[coordinate])).size).toBeGreaterThan(1)
        pixels.forEach((pixel, i) => pixel.forEach(channel => expect(Math.abs(channel - points[i].sample[coordinate])).toBeLessThan(fidelity === 'fast' ? 1e-8 : 0.001)))
      })
    }
  }

  for (const fidelity of ['fast', 'fidelity'] as const) {
    it.each(['x', 'y', 'z'] as const)(`general physical dispatch ${fidelity} preserves %s`, axis => {
      const fixture = show3DInstallationFixture(`export function render3D(i,x,y,z){hsv(0,0,${axis})}`)
      cutClips(fixture)
      const { source, bundle } = delivered(fixture, { exactSpecializations: false })
      const runtime = replay(source, bundle.artifact, fixture, fidelity)
      for (const time of [875, 1000, 1125]) {
        assertPixels(runtime.advanceTo(time, { stepMs: 125 }).pixels, fixture, fidelity, p => Array(3).fill(p[['x', 'y', 'z'].indexOf(axis)]))
      }
    })

    it.each([true, false])(`static physical route dispatch exact=%s (${fidelity})`, exactSpecializations => {
      const fixture = show3DInstallationFixture(gradient, 'independent')
      const { source, bundle } = delivered(fixture, { exactSpecializations }, recipe => {
        recipe.sceneSequence = undefined
        recipe.routedSceneSequence = undefined
        recipe.clips.forEach((clip, i) => { clip.zone = fixture.record.zones[i].name })
      })
      assertPixels(replay(source, bundle.artifact, fixture, fidelity).renderCurrentFrame().pixels, fixture, fidelity, p => p)
    })

    it(`shared boundary-latched dispatch refreshes Stage xyz per pixel (${fidelity})`, () => {
      const fixture = show3DInstallationFixture(gradient)
      cutClips(fixture)
      const { source, bundle } = delivered(fixture, { renderKernelSpecialization: false })
      expect(bundle.artifact.summary.specializations.boundaryLatch?.selected).toBe(true)
      const runtime = replay(source, bundle.artifact, fixture, fidelity)
      for (const time of [875, 1000, 1125]) assertPixels(runtime.advanceTo(time, { stepMs: 125 }).pixels, fixture, fidelity, p => p)
    })

    it.each([
      ['priority', 'export function render2D(i,x,y){rgb(1,0,0)}\n' + gradient, (p: number[]) => p],
      ['2D fallback', 'export function render2D(i,x,y){rgb(x,y,0)}', (p: number[]) => [p[0], p[1], 0]],
      ['private transform', 'rotateY(PI/2)\nexport function render3D(i,x,y,z){rgb(x,y,1+z)}', (p: number[]) => [p[2], p[1], 1 - p[0]]],
    ] as const)(`native %s (${fidelity})`, (_, source, expected) => {
      const fixture = show3DInstallationFixture(source)
      const delivery = delivered(fixture)
      assertPixels(replay(delivery.source, delivery.bundle.artifact, fixture, fidelity).renderCurrentFrame().pixels, fixture, fidelity, expected)
    })

    it(`independent index domain survives a reordered physical layout (${fidelity})`, () => {
      const fixture = show3DInstallationFixture('export function render3D(i,x,y,z){rgb(i/max(1,pixelCount-1),y,z)}', 'independent')
      const { record } = fixture
      const laterRanges = [{ start: 0, end: 239 }, { start: 240, end: 639 }, { start: 640, end: 959 }]
      record.zoneLayouts.push({ id: 'reordered', name: 'Reordered', zones: laterRanges.map((range, i) => ({ zoneId: record.zones[(i + 1) % 3].id, ranges: [range] })) })
      record.composition.layoutOccurrences[0].durationMs = 1000
      record.composition.layoutOccurrences.push({ id: 'second-layout', layoutId: 'reordered', startMs: 1000, durationMs: 1000, parameters: {} })
      const { source, bundle } = delivered(fixture)
      const runtime = replay(source, bundle.artifact, fixture, fidelity)
      for (const time of [125, 875, 1000, 1125]) {
        assertPixels(runtime.advanceTo(time, { stepMs: 125 }).pixels, fixture, fidelity, (p, i) => {
          const range = time < 1000 ? { start: Math.floor(i / 320) * 320, end: Math.floor(i / 320) * 320 + 319 } : laterRanges.find(range => i <= range.end)!
          return [(i - range.start) / (range.end - range.start), p[1], p[2]]
        })
      }
    })

    it(`merged span index domain preserves Stage xyz (${fidelity})`, () => {
      const fixture = show3DInstallationFixture('export function render3D(i,x,y,z){rgb(i/max(1,pixelCount-1),y,z)}')
      const { source, bundle } = delivered(fixture, {}, recipe => {
        const zoneNames = fixture.record.zones.map(zone => zone.name)
        recipe.routedSceneSequence = { scenes: [{ holdMs: 2000, placements: zoneNames.map(zoneName => ({ zoneName, clipId: recipe.clips[0].id, zoneMode: 'span', domainZoneNames: zoneNames })) }] }
        recipe.sceneSequence = undefined
      })
      assertPixels(replay(source, bundle.artifact, fixture, fidelity).renderCurrentFrame().pixels, fixture, fidelity, (p, i) => [i / 959, p[1], p[2]])
    })

    it(`native color-map (${fidelity})`, () => {
      const fixture = show3DInstallationFixture('export function render3D(i,x,y,z){rgb(x,x,x)}')
      for (const clip of fixture.record.composition.clips) {
        clip.appearance.keys[0].value.effects = [{ id: 'map', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 1, highlightR: 1, highlightG: 0, highlightB: 0 }]
      }
      const { source, bundle } = delivered(fixture)
      assertPixels(replay(source, bundle.artifact, fixture, fidelity).renderCurrentFrame().pixels, fixture, fidelity, p => [p[0], 0, 1 - p[0]])
    })

    it(`native clip View brightness track (${fidelity})`, () => {
      const fixture = show3DInstallationFixture(gradient)
      for (const clip of fixture.record.composition.clips) {
        fixture.record.composition.propertyTracks.push({ id: `brightness-${clip.id}`, target: { kind: 'clip-view', clipId: clip.id, property: 'brightness' }, activeStartMs: 0, activeDurationMs: 2000, keyframes: [{ id: `${clip.id}-a`, timeMs: 0, value: 0, easing: { curve: 'linear' } }, { id: `${clip.id}-b`, timeMs: 2000, value: 1, easing: { curve: 'linear' } }] })
      }
      const { source, bundle } = delivered(fixture)
      const runtime = replay(source, bundle.artifact, fixture, fidelity)
      for (const time of [125, 500, 1000, 1500, 1875]) assertPixels(runtime.advanceTo(time, { stepMs: 125 }).pixels, fixture, fidelity, p => p.map(c => c * time / 2000))
    })

    it(`native luma-key composites over a lower Layer (${fidelity})`, () => {
      const fixture = show3DInstallationFixture('export function render3D(i,x,y,z){rgb(1,0,0)}')
      fixture.dependencies.patterns = [...fixture.dependencies.patterns, { id: 'keyed', name: 'Keyed', src: 'export function render3D(i,x,y,z){rgb(x,x,x)}', controls: {}, updatedAt: 1 }]
      fixture.record.composition.patternInstances.push({ id: 'keyed-instance', pattern: { kind: 'user', id: 'keyed' }, patternName: 'Keyed', time: { timeScale: 1, timeOffsetMs: 0 } })
      for (const clip of [...fixture.record.composition.clips]) {
        const layerId = `overlay-${clip.zoneId}`
        fixture.record.composition.layers.push({ id: layerId, zoneId: clip.zoneId, name: 'Key', rank: 1 })
        const overlay = structuredClone(clip)
        overlay.id += '-overlay'; overlay.instanceId = 'keyed-instance'; overlay.layerId = layerId
        overlay.appearance.keys[0].id += '-overlay'
        overlay.appearance.keys[0].value.effects = [{ id: 'key', kind: 'luma-key', target: 0, tolerance: 0.25, softness: 0 }]
        fixture.record.composition.clips.push(overlay)
      }
      const { source, bundle } = delivered(fixture)
      assertPixels(replay(source, bundle.artifact, fixture, fidelity).renderCurrentFrame().pixels, fixture, fidelity, p => p[0] <= 0.25 ? [1, 0, 0] : [p[0], p[0], p[0]])
    })

    it.each(['cut', 'live-live', 'snapshot-live', 'fade-color'] as const)(`recipe %s boundary retains xyz (${fidelity})`, policy => {
      const fixture = show3DInstallationFixture(gradient)
      const { source, bundle } = delivered(fixture, {}, recipe => {
        const fromId = recipe.clips[0].id
        recipe.clips.push({ id: 'destination', source: 'export function render3D(i,x,y,z){rgb(0,0,1)}' })
        const placements = (clipId: string) => fixture.record.zones.map(zone => ({ zoneName: zone.name, clipId }))
        recipe.sceneSequence = undefined
        recipe.routedSceneSequence = { scenes: [
          { holdMs: policy === 'cut' ? 1000 : 500, placements: placements(fromId), transitionOut: policy === 'cut'
            ? { kind: 'cut', durationMs: 0 }
            : policy === 'fade-color'
              ? { kind: 'fade-color', durationMs: 500, color: '#000000' }
              : { kind: 'crossfade', durationMs: 500, crossfadePolicy: policy } },
          { holdMs: 1000, placements: placements('destination') },
        ] }
      })
      const runtime = replay(source, bundle.artifact, fixture, fidelity)
      for (const time of [375, 500, 625, 750, 875, 1000, 1125]) {
        assertPixels(runtime.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true }).pixels, fixture, fidelity, p => {
          if (time < (policy === 'cut' ? 1000 : 500)) return p
          if (time >= 1000) return [0, 0, 1]
          const mix = (time - 500) / 500
          if (policy === 'fade-color') return mix < 0.5 ? p.map(c => c * (1 - mix * 2)) : [0, 0, (mix - 0.5) * 2]
          return [p[0] * (1 - mix), p[1] * (1 - mix), p[2] * (1 - mix) + mix]
        })
      }
    })
  }

  it('qualifies, exports and reopens the native record, map and sources', async () => {
    const fixture = show3DInstallationFixture(gradient)
    const { bundle } = delivered(fixture)
    const result = await qualifyShowV2PilotArtifacts(bundle, { appVersion: '1198-test', exportedAt: '2026-10-21T00:00:00.000Z' })
    const file = await parseShowFileBundle(result.pxlshowBytes, { acceptV2: true })
    expect(file.show).toEqual(fixture.record)
    expect(file.maps).toEqual(fixture.dependencies.maps)
    expect(file.patterns).toEqual(fixture.dependencies.patterns)
    if (!('version' in file.show) || file.show.version !== 2) throw new Error('Expected native v2 Show')
    const map = file.maps[0]
    const reopened = { ...fixture, record: file.show, dependencies: { ...fixture.dependencies, patterns: file.patterns, maps: file.maps, stageMap: createCustomMap(map.points!, { id: map.id, name: map.name }) } }
    const imported = delivered(reopened)
    for (const fidelity of ['fast', 'fidelity'] as const) {
      assertPixels(replay(parseEpe(result.epeText).src, bundle.artifact, fixture, fidelity).renderCurrentFrame().pixels, fixture, fidelity, p => p)
      assertPixels(replay(imported.source, imported.bundle.artifact, reopened, fidelity).renderCurrentFrame().pixels, fixture, fidelity, p => p)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { validateInstallationCoverage } from '@/engine/showInstallationCoverage'
import { buildShowEpeExport } from '@/engine/showEpeExport'
import { parseEpe } from '@/engine/epeImport'
import { createPortableShowOutputContract } from '@/engine/showOutputContract'
import { compileShowForArtifact, sourceForShowCell } from '@/engine/showPreviewArtifact'
import { validatePortableShowCompatibility } from '@/engine/showPortableCompatibility'
import { loadPattern, nativeDimension } from '@/engine/loadPattern'
import { createFastReplayRuntime } from '@/engine/fastReplay'
import { createShim } from '@/engine/shim'
import { validateShowComposition } from '@/engine/showCompositionModel'
import { projectShowTimeline } from '@/engine/showModel'
import { SHOW_EASING_OPTIONS, showEasingOptionId } from '@/engine/showEasing'
import { SHOW_VISUAL_TOOLKIT_REGISTRY } from '@/engine/showVisualToolkit'
import { sameShowEffectStructure } from '@/engine/showEffects'
import { getUserDoc } from '@/docs/catalog'
import { DEMOS } from './patterns'
import { SOURCE_STOCK_MAPS } from './maps/stockCatalogue'
import { STOCK_SHOWS } from './shows'

describe('stock Show curriculum (#363)', () => {
  it('ships the stable Learn 100, Learn 200, and showcase catalogue', () => {
    expect(STOCK_SHOWS).toHaveLength(19)
    expect(new Set(STOCK_SHOWS.map((item) => item.id)).size).toBe(STOCK_SHOWS.length)
    expect(STOCK_SHOWS.map((item) => [item.name, item.collection, item.level, item.order])).toEqual([
      ['101 Clips and Crossfade', 'learn', 100, 1],
      ['102 Transitions and Values', 'learn', 100, 2],
      ['103 Effects', 'learn', 100, 3],
      ['104 Portable Zones', 'learn', 100, 4],
      ['105 Built from Basics', 'learn', 100, 5],
      ['201 Scene-local Cuts', 'learn', 200, 1],
      ['202 Layers and Local Animation', 'learn', 200, 2],
      ['203 Dynamic Zone Layouts', 'learn', 200, 3],
      ['204 Installation Mapping', 'learn', 200, 4],
      ['205 Installation Composition', 'learn', 200, 5],
      ['Transform Effects', 'showcases', null, 1],
      ['Distortion Effects', 'showcases', null, 2],
      ['Color and Output Effects', 'showcases', null, 3],
      ['Wipe and Mix Transitions', 'showcases', null, 4],
      ['Shape Reveal Transitions', 'showcases', null, 5],
      ['Motion Transitions', 'showcases', null, 6],
      ['Property Animation', 'showcases', null, 7],
      ['Easing', 'showcases', null, 8],
      ['Redline Installation', 'showcases', null, 10],
    ])
    expect(STOCK_SHOWS.every((item) => item.show.id === item.id)).toBe(true)
    expect(new Set(STOCK_SHOWS.map((item) => `${item.collection}:${item.level}:${item.order}`)).size)
      .toBe(STOCK_SHOWS.length)
  })

  it('ships five single-family reference Shows with semantic example metadata (#506)', () => {
    const referenceShows = STOCK_SHOWS.filter((item) => item.id.startsWith('stock-show-reference-'))

    expect(referenceShows.map((item) => item.id)).toEqual([
      'stock-show-reference-wipe-mix-transitions',
      'stock-show-reference-shape-reveal-transitions',
      'stock-show-reference-motion-transitions',
      'stock-show-reference-property-animation',
      'stock-show-reference-easing',
    ])
    expect(referenceShows.every((item) => item.reference!.examples.length >= 8)).toBe(true)
    expect(referenceShows.every((item) => (item.reference?.patternSlots?.cellIds.length ?? 0) > 0)).toBe(true)
    expect(referenceShows.find((item) => item.id === 'stock-show-reference-property-animation')?.reference?.patternSlots)
      .toMatchObject({
        cellIds: expect.arrayContaining(['cell-animation-speed-zone-2', 'cell-repeat-scale-zone-2']),
        instanceIds: expect.arrayContaining(['instance-animation-speed-b', 'instance-repeat-scale-b']),
      })

    const referenceSection = STOCK_SHOWS.filter((item) => (
      item.id.startsWith('stock-show-showcase-') || item.id.startsWith('stock-show-reference-')
    ) && !['stock-show-showcase-redline-installation'].includes(item.id))
    expect(referenceSection.every((item) => item.reference && item.reference.patternSlots)).toBe(true)
    expect(referenceSection.every((item) => item.note.defaultOpen)).toBe(true)
  })

  it('covers registry variants, eight Wipe directions, all easing curves, and eight Property targets (#506)', () => {
    const item = (id: string) => STOCK_SHOWS.find((candidate) => candidate.id === id)!
    const wipe = item('stock-show-reference-wipe-mix-transitions')
    const shape = item('stock-show-reference-shape-reveal-transitions')
    const motion = item('stock-show-reference-motion-transitions')
    const easing = item('stock-show-reference-easing')
    const property = item('stock-show-reference-property-animation')

    const transitionVariants = (familyId: string) => SHOW_VISUAL_TOOLKIT_REGISTRY
      .find((family) => family.kind === 'transition' && family.id === familyId)!.variants.map((variant) => variant.id)
    expect(new Set(shape.show.transitions?.filter((transition) => transition.kind === 'portal').map((transition) => transition.shape)))
      .toEqual(new Set(transitionVariants('shape-reveal')))
    expect(new Set(motion.show.transitions?.filter((transition) => transition.kind === 'motion').map((transition) => transition.motionVariant)))
      .toEqual(new Set(transitionVariants('motion')))
    expect(wipe.show.transitions?.filter((transition) => transition.kind === 'wipe' && transition.wipeVariant === 'linear')
      .map((transition) => transition.direction)).toEqual([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875])
    expect(easing.show.transitions?.map((transition) => showEasingOptionId(transition.easing)))
      .toEqual(SHOW_EASING_OPTIONS.map((option) => option.id))

    for (const reference of [wipe, shape, motion, easing]) {
      const starts = projectShowTimeline(reference.show).boundaryTransitions.map((transition) => transition.startMs)
      expect(starts.slice(1).map((start, index) => start - starts[index]), reference.name)
        .toEqual(Array.from({ length: starts.length - 1 }, () => 5_000))
    }

    const targets = property.show.composition!.scenes.flatMap((scene) => scene.propertyTracks?.map((track) => track.target) ?? [])
    expect(targets.map((target) => target.kind)).toEqual([
      'instance-time-scale', 'instance-control', 'placement-view', 'placement-view', 'placement-opacity', 'placement-effect',
    ])
    expect(property.show.transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ propertyTransitions: { routing: { splitPosition: expect.anything() } } }),
      expect.objectContaining({ propertyTransitions: { sample: { repeatScale: expect.anything() } } }),
    ]))
  })

  it('places Transition references over one fixed diagnostic backdrop (#506)', () => {
    const references = [
      'stock-show-reference-wipe-mix-transitions',
      'stock-show-reference-shape-reveal-transitions',
      'stock-show-reference-motion-transitions',
      'stock-show-reference-easing',
    ].map((id) => STOCK_SHOWS.find((candidate) => candidate.id === id)!)

    for (const item of references) {
      expect(item.show.composition?.patternInstances).toContainEqual(expect.objectContaining({
        id: 'instance-reference-backdrop',
        patternName: 'Caustics',
      }))
      expect(item.show.composition?.scenes).toHaveLength(item.show.scenes.length)
      expect(item.show.composition?.scenes.every((scene) => (
        scene.zones[0].main.some((placement) => placement.instanceId === 'instance-reference-backdrop')
        && scene.zones[0].overlays[0]?.placements[0]?.opacity === 0.82
      ))).toBe(true)
      expect(item.reference?.patternSlots?.instanceIds.length).toBeGreaterThan(0)
      expect(item.reference?.patternSlots?.instanceIds).not.toContain('instance-reference-backdrop')
    }
  })

  it('gives every Show a complete guide note outside the compiled record', () => {
    for (const item of STOCK_SHOWS) {
      expect(item.note.purpose, item.name).not.toBe('')
      expect(item.note.notice, item.name).not.toBe('')
      expect(item.note.prompts, item.name).toHaveLength(2)
      expect(item.note.guide.documentId, item.name).toBe('show-visual-toolkit')
      expect(item.note.guide.heading, item.name).toMatch(/^[a-z0-9-]+$/)
      const guideHeadings = getUserDoc(item.note.guide.documentId)!.source
        .split('\n')
        .filter((line) => /^#{2,6} /.test(line))
        .map((line) => line.replace(/^#{2,6} /, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
      expect(guideHeadings, item.name).toContain(item.note.guide.heading)
      expect('note' in item.show, item.name).toBe(false)
    }
  })

  it('keeps the first lesson to two Clips and one boundary-owned Crossfade', () => {
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-101-clips-crossfade')!
    expect(item.show.scenes.map((scene) => [scene.name, scene.durationMs])).toEqual([
      ['Water', 8_000], ['Mechanism', 8_000],
    ])
    expect(item.show.cells.map((cell) => cell.patternName)).toEqual(['Caustics', 'ClockworkIris'])
    expect(item.show.transitions).toEqual([
      expect.objectContaining({ afterSceneId: 'water', kind: 'crossfade', durationMs: 3_000 }),
    ])
    expect(item.show.composition).toBeUndefined()
    expect(item.show.zones).toHaveLength(1)
  })

  it('scores Redline as a 60-second five-surface Installation showcase (#503)', () => {
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-redline-installation')!

    expect(item.track).toBe('installation')
    expect(item.show.outputContract).toEqual({
      version: 1,
      kind: 'installation',
      outputMapId: 'redline-stage-2d',
      pixelCount: 2_000,
      resolution: 'fixed',
    })
    expect(item.show.zones.map((zone) => zone.name)).toEqual([
      'Hero panel',
      'Left upper',
      'Left lower',
      'Right upper',
      'Right lower',
    ])
    expect(item.show.zones.map((zone) => zone.nominalPixelCount)).toEqual([800, 300, 300, 300, 300])
    expect(item.show.routingLayouts[0].zones.map((zone) => zone.ranges)).toEqual([
      [{ start: 0, end: 799 }],
      [{ start: 800, end: 1_099 }],
      [{ start: 1_100, end: 1_399 }],
      [{ start: 1_400, end: 1_699 }],
      [{ start: 1_700, end: 1_999 }],
    ])
    expect(projectShowTimeline(item.show).durationMs).toBe(60_000)
    expect(item.show.scenes.map((scene) => [scene.name, scene.durationMs])).toEqual([
      ['Ignition', 7_500],
      ['First lift', 7_500],
      ['Countermotion', 7_500],
      ['First drop', 7_500],
      ['Vacuum', 7_500],
      ['Rebuild', 7_500],
      ['Compression', 7_500],
      ['Peak and release', 7_500],
    ])
    expect(validateInstallationCoverage(item.show)).toMatchObject({ valid: true })
    expect(validateShowComposition(item.show, item.show.composition!)).toEqual([])

    const patternIds = new Set(item.show.composition!.patternInstances.map((instance) => instance.pattern.id))
    expect(patternIds).toEqual(new Set(['RedlineMachine']))
    expect(item.show.composition!.patternInstances[0].controlTargets).toMatchObject({ sliderCyan: 1 })
    expect(item.show.composition!.patternInstances[0].controlTargets).not.toHaveProperty('sliderGuest')
    for (const scene of item.show.composition!.scenes) {
      const targetZones = scene.zones.slice(1)
      expect(new Set(targetZones.map((zone) => zone.main[0]?.instanceId)).size, scene.sceneId).toBe(1)
      expect(new Set(targetZones.map((zone) => JSON.stringify(zone.main[0]?.effects))).size, scene.sceneId)
        .toBeGreaterThanOrEqual(3)
    }

    const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    expect(compiled.artifact!.summary.cost.cpu.patternEvaluations).toEqual({ formula: 'N', basePerPixel: 1 })
    expect(compiled.artifact!.summary.artifactBytes).toBeGreaterThan(0)
    expect(compiled.artifact!.summary.measuredDeviceBudgetBytes).toBeGreaterThan(0)

    const mapPoints = SOURCE_STOCK_MAPS.find((map) => map.id === 'redline-stage-2d')!.resolve(2_000)
    let virtualTime = 0
    const shim = createShim({
      pixelCount: 2_000,
      dimensions: 2,
      mapPoints,
      getVirtualTime: () => virtualTime,
      randomSeed: 503,
    })
    const handle = loadPattern(compiled.artifact!.code, compiled.artifact!.metadata, shim.builtins)
    const sampleIndices = Array.from({ length: 160 }, (_, sampleIndex) => {
      const zoneIndex = sampleIndex % 5
      const zoneStart = zoneIndex === 0 ? 0 : 800 + (zoneIndex - 1) * 300
      const zoneCount = zoneIndex === 0 ? 800 : 300
      return zoneStart + Math.floor((sampleIndex / 5) * 73) % zoneCount
    })
    const frameAt = (deltaMs: number) => {
      virtualTime += deltaMs
      handle.beforeRender(deltaMs)
      return sampleIndices.map((index) => {
        const [x, y] = mapPoints[index].sample
        handle.render2D(index, x, y)
        return shim.capturedPixel()
      })
    }
    const frames = Array.from({ length: 8 }, (_, phraseIndex) => frameAt(phraseIndex === 0 ? 500 : 7_500))
    const signature = (frame: number[][]) => frame
      .map((color) => color.map((channel) => Math.round(channel * 20)).join(','))
      .join('|')

    expect(new Set(frames.map(signature)).size).toBeGreaterThanOrEqual(6)
    expect(frames.every((frame) => frame.some(([r, g, b]) => r + g + b > 0.05))).toBe(true)
    expect(frames.slice(4, 6).some((frame) => frame.some(([r, g, b]) => g > r + 0.1 && b > r + 0.1))).toBe(true)
    expect([...frames.slice(0, 4), ...frames.slice(6)].some((frame) => frame.some(([r, g, b]) => r > g + 0.1 && r > b + 0.1))).toBe(true)
  })

  it('animates Redline continuously in the Precise Show preview', () => {
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-redline-installation')!
    const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()

    const artifact = compiled.artifact!
    const mapPoints = SOURCE_STOCK_MAPS.find((map) => map.id === 'redline-stage-2d')!.resolve(2_000)
    const runtime = createFastReplayRuntime({
      code: artifact.code,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: nativeDimension(artifact.metadata.renderFns),
    }, {
      mapPoints,
      randomSeed: 503,
      fidelity: 'fidelity',
    })

    const first = runtime.renderCurrentFrame()
    const checksums = [first.checksum]
    for (let frame = 0; frame < 6; frame += 1) {
      const result = runtime.advanceLive(100)
      checksums.push(result.checksum)
    }

    expect(new Set(checksums).size).toBeGreaterThanOrEqual(5)
  })

  it('weaves sparse cyan ornaments into Redline outside the cyan breakdown', () => {
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-redline-installation')!
    const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()

    const artifact = compiled.artifact!
    const mapPoints = SOURCE_STOCK_MAPS.find((map) => map.id === 'redline-stage-2d')!.resolve(2_000)
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const runtime = createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension: nativeDimension(artifact.metadata.renderFns),
      }, {
        mapPoints,
        randomSeed: 503,
        fidelity,
      })

      const frames = [2_727, 8_182, 19_091, 24_545, 46_364, 51_818, 57_273]
        .map((timeMs) => runtime.advanceTo(timeMs, { stepMs: 50 }).pixels)
      const cyanCounts = frames.map((pixels) => pixels.filter(([r, g, b]) => (
        g > 0.12 && g > r + 0.08 && b > r + 0.08
      )).length)
      const brightCyanCounts = frames.map((pixels) => pixels.filter(([r, g, b]) => (
        g > 0.45 && g > r + 0.16 && b > r + 0.16
      )).length)
      const redCounts = frames.map((pixels) => pixels.filter(([r, g, b]) => (
        r > 0.12 && r > g + 0.08 && r > b + 0.08
      )).length)

      expect(cyanCounts.filter((count) => count > 15).length, fidelity).toBeGreaterThanOrEqual(5)
      expect(brightCyanCounts.filter((count) => count > 5).length, fidelity).toBeGreaterThanOrEqual(5)
      expect(cyanCounts.every((count) => count < mapPoints.length * 0.04), fidelity).toBe(true)
      expect(redCounts.every((count, index) => count > cyanCounts[index] * 2), fidelity).toBe(true)
    }
  }, 15_000)

  it('ships valid local Main scheduling and typed overlay animation in Learn 200', () => {
    for (const id of ['stock-show-201-scene-local-cuts', 'stock-show-202-layers-local-animation']) {
      const item = STOCK_SHOWS.find((candidate) => candidate.id === id)!
      expect(item.show.composition, item.name).toBeDefined()
      expect(validateShowComposition(item.show, item.show.composition!), item.name).toEqual([])
    }

    const cuts = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-201-scene-local-cuts')!
    expect(cuts.show.composition!.scenes[0].zones[0].main.map((placement) => [placement.startMs, placement.durationMs]))
      .toEqual([[0, 6_000], [6_000, 6_000], [12_000, 6_000]])

    const layered = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-202-layers-local-animation')!
    expect(layered.show.composition!.scenes[0].propertyTracks?.[0]).toMatchObject({
      target: { kind: 'placement-opacity', placementId: 'overlay-signal' },
      keyframes: [
        { timeMs: 3_000, value: 0 }, { timeMs: 5_000, value: 0.72 },
        { timeMs: 11_000, value: 0.72 }, { timeMs: 13_000, value: 0 },
      ],
    })
  })

  it('covers every Effect kind in the three data-driven showcases', () => {
    const kinds = STOCK_SHOWS
      .filter((item) => item.id.startsWith('stock-show-showcase-'))
      .flatMap((item) => item.show.cells.flatMap((cell) => cell.effects?.map((effect) => effect.kind) ?? []))

    expect([...new Set(kinds)].sort()).toEqual([
      'brightness', 'bulge', 'color-map', 'contrast', 'hue', 'invert', 'kaleidoscope', 'opacity',
      'pixelate', 'posterize', 'ripple', 'rotate', 'saturation', 'scale', 'shear', 'swirl',
      'threshold', 'translate', 'wrap',
    ])
  })

  it('moves one Pattern continuously between affine Effect states (#506)', () => {
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-transform-effects')!
    const affineCells = item.show.cells.slice(0, 5)
    const affineTransitions = item.show.transitions!.slice(0, 4)

    expect(affineCells.map((cell) => cell.sceneId)).toEqual([
      'effect-1', 'effect-2', 'effect-3', 'effect-4', 'effect-5',
    ])
    expect(affineCells.slice(1).every((cell) => sameShowEffectStructure(affineCells[0].effects, cell.effects))).toBe(true)
    expect(affineCells[0].effects?.map((effect) => [effect.id, effect.kind])).toEqual([
      ['affine-translate', 'translate'],
      ['affine-scale', 'scale'],
      ['affine-rotate', 'rotate'],
      ['affine-shear', 'shear'],
    ])
    expect(affineTransitions.every((transition) => (
      transition.durationMs === 1_000
      && showEasingOptionId(transition.easing) === 'sine-in-out'
      && Object.keys(transition.propertyTransitions?.effects ?? {}).length > 0
    ))).toBe(true)

    const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.artifact?.summary.cost.cpu.patternEvaluations).toMatchObject({ formula: 'N', basePerPixel: 1 })
    expect(compiled.artifact?.summary.cost.cpu.effects.animatedParametersPerFrame).toBeGreaterThan(0)
    expect(compiled.artifact?.summary.worstInstantRenderersPerPixel).toBe(1)
  })

  it('uses real stock Patterns and satisfies every output contract', () => {
    for (const item of STOCK_SHOWS) {
      expect(item.show.cells.length, item.name).toBeGreaterThan(0)
      for (const cell of item.show.cells) {
        expect(cell.pattern.kind, item.name).toBe('stock')
        expect(DEMOS[cell.pattern.id], `${item.name}: ${cell.pattern.id}`).toBeTypeOf('string')
      }

      if (item.track === 'portable') {
        const compatibility = validatePortableShowCompatibility(
          item.show,
          item.show.cells.map((cell) => ({
            cellId: cell.id,
            patternName: cell.patternName,
            source: sourceForShowCell(cell, []),
          })),
          2,
        )
        expect(compatibility?.compatible, `${item.name}: ${compatibility?.issues.join('; ')}`).toBe(true)
      } else {
        expect(validateInstallationCoverage(item.show), item.name).toMatchObject({ valid: true })
      }
    }
  })

  it('keeps curriculum Pattern clocks slow enough to reveal routing and Scene changes', () => {
    for (const item of STOCK_SHOWS.filter((candidate) => candidate.collection === 'learn')) {
      for (const cell of item.show.cells) {
        expect(cell.adaptations.timeScale, `${item.name}: ${cell.patternName}`).toBeGreaterThan(0)
        expect(cell.adaptations.timeScale, `${item.name}: ${cell.patternName}`).toBeLessThanOrEqual(0.7)
      }
    }
  })

  it('uses representative high-density square Stages for the reviewed Portable compositions', () => {
    for (const id of ['stock-show-101-clips-crossfade', 'stock-show-105-built-from-basics']) {
      const item = STOCK_SHOWS.find((candidate) => candidate.id === id)!
      expect(item.show.outputContract).toMatchObject({
        kind: 'portable-2d',
        referencePixelCount: 2_000,
      })
      expect(item.show.zones.reduce((sum, zone) => sum + zone.nominalPixelCount, 0)).toBe(2_000)
    }
  })

  it('compiles every lesson through the production artifact pipeline', () => {
    for (const item of STOCK_SHOWS) {
      const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
      expect(compiled.error, item.name).toBeNull()
      expect(compiled.artifact?.code.length, item.name).toBeGreaterThan(1_000)
      expect(compiled.artifact?.metadata.renderFns.hasRender2D, item.name).toBe(true)
      expect(compiled.artifact?.summary.cost.code.artifactBytes, item.name).toBeGreaterThan(1_000)
    }
  })

  it('plays distinct routed content after each top-level Scene boundary (#478)', () => {
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-205-installation-composition')!
    const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    const pixelCount = 256
    const mapPoints = Array.from({ length: pixelCount }, (_, index) => ({
      sample: [(index % 16) / 15, Math.floor(index / 16) / 15] as [number, number],
      pos: [(index % 16) / 15, Math.floor(index / 16) / 15] as [number, number],
    }))
    const shim = createShim({ pixelCount, dimensions: 2, mapPoints, getVirtualTime: () => 0, randomSeed: 1 })
    const handle = loadPattern(compiled.artifact!.code, compiled.artifact!.metadata, shim.builtins)
    const sample = () => [0, 100, 200].map((index) => {
      handle.render2D(index, (index % 16) / 15, Math.floor(index / 16) / 15)
      return shim.capturedPixel()
    })

    handle.beforeRender(1_000)
    const establish = sample()
    handle.beforeRender(6_000)
    const develop = sample()
    handle.beforeRender(7_000)
    const resolve = sample()

    expect(develop).not.toEqual(establish)
    expect(resolve).not.toEqual(develop)
    expect(compiled.artifact?.summary.clipCount).toBeGreaterThanOrEqual(12)
  })

  it('keeps Portable logical Zones independent while advancing the Scene schedule (#478)', () => {
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-104-portable-zones')!
    const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    const pixelCount = 1024
    const mapPoints = Array.from({ length: pixelCount }, (_, index) => ({
      sample: [(index % 32) / 31, Math.floor(index / 32) / 31] as [number, number],
      pos: [(index % 32) / 31, Math.floor(index / 32) / 31] as [number, number],
    }))
    const shim = createShim({ pixelCount, dimensions: 2, mapPoints, getVirtualTime: () => 0, randomSeed: 1 })
    const handle = loadPattern(compiled.artifact!.code, compiled.artifact!.metadata, shim.builtins)
    const renderAt = (index: number, x: number, y: number) => {
      handle.render2D(index, x, y)
      return shim.capturedPixel()
    }
    const renderZone = (right: boolean) => [0.1, 0.25, 0.4].map((localX, sampleIndex) => {
      const x = right ? 0.5 + localX * 0.5 : localX * 0.5
      return renderAt(16 * 32 + Math.round(x * 31) + sampleIndex, x, 0.5)
    })

    handle.beforeRender(1_000)
    const firstLeft = renderZone(false)
    const firstRight = renderZone(true)
    handle.beforeRender(8_000)
    const secondLeft = renderZone(false)
    const secondRight = renderZone(true)

    expect(firstLeft).not.toEqual(firstRight)
    expect(secondLeft).not.toEqual(firstLeft)
    expect(secondRight).not.toEqual(firstRight)
  })

  it('exports every lesson as a stamped, importable Show EPE', () => {
    for (const item of STOCK_SHOWS) {
      const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
      const exported = buildShowEpeExport(item.show, compiled.artifact!.code, {
        id: `curriculum-${item.id}`,
        stampedAt: '2026-07-14T00:00:00.000Z',
      })
      const parsed = parseEpe(exported.text)

      expect(parsed.name).toBe(item.name)
      expect(parsed.stamp).toMatchObject({ kind: 'show', id: item.id })
      expect(parsed.src).toContain(`Compiled PXLBLZ Show: ${item.name}`)
    }
  })

  it.each([['plane', 256], ['wide', 1536]] as const)(
    'keeps Portable choreography unchanged on the %s reference output',
    (referenceMapId, referencePixelCount) => {
      for (const item of STOCK_SHOWS.filter((candidate) => candidate.track === 'portable')) {
        const adapted = {
          ...item.show,
          outputContract: createPortableShowOutputContract({ referenceMapId, referencePixelCount }),
          stageMapId: referenceMapId,
        }
        const compiled = compileShowForArtifact(adapted, [], undefined, {}, { stageDimension: 2 })

        expect(compiled.error, item.name).toBeNull()
        expect(adapted.cells, item.name).toEqual(item.show.cells)
        expect(adapted.transitions, item.name).toEqual(item.show.transitions)
      }
    },
  )
})

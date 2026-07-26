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
import { createInstallationCompositionFixture } from '@/engine/showInstallationTestFixture'
import { projectShowTimeline } from '@/engine/showModel'
import { SHOW_EASING_OPTIONS, showEasingOptionId } from '@/engine/showEasing'
import { SHOW_VISUAL_TOOLKIT_REGISTRY } from '@/engine/showVisualToolkit'
import { applyShowColorEffects, sameShowEffectStructure, type ShowRgb } from '@/engine/showEffects'
import { showClipEffectStage } from '@/engine/showEffectAuthoring'
import { getUserDoc } from '@/docs/catalog'
import { DEMOS } from './patterns'
import { SOURCE_STOCK_MAPS } from './maps/stockCatalogue'
import { STOCK_SHOWS, stockShowById } from './shows'

describe('stock Show curriculum (#363)', () => {
  it('ships the stable Learn 100 and showcase catalogue', () => {
    expect(STOCK_SHOWS).toHaveLength(15)
    expect(new Set(STOCK_SHOWS.map((item) => item.id)).size).toBe(STOCK_SHOWS.length)
    expect(STOCK_SHOWS.map((item) => [item.name, item.collection, item.level, item.order])).toEqual([
      ['101 Clips, Cuts, and Blank Time', 'learn', 100, 1],
      ['102 Transitions and Values', 'learn', 100, 2],
      ['103 Clip Transform', 'learn', 100, 3],
      ['104 Effects and Ordering', 'learn', 100, 4],
      ['105 Portable Zones', 'learn', 100, 5],
      ['106 Built from Basics', 'learn', 100, 6],
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
    expect(STOCK_SHOWS.every((item) => !/\bscenes?\b/i.test([
      item.name,
      item.note.purpose,
      item.note.notice,
      ...item.note.prompts,
    ].join(' ')))).toBe(true)
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

  it('reuses one intentional Pattern pair across every Transition reference', () => {
    const references = [
      'stock-show-reference-wipe-mix-transitions',
      'stock-show-reference-shape-reveal-transitions',
      'stock-show-reference-motion-transitions',
      'stock-show-reference-easing',
    ].map((id) => STOCK_SHOWS.find((candidate) => candidate.id === id)!)

    for (const item of references) {
      const composition = item.show.composition!
      expect(composition.patternInstances.map((instance) => instance.patternName), item.name).toEqual([
        'Caustics',
        'TestPattern2D',
        'CompassRose',
      ])
      expect(new Set(composition.scenes.map((scene) => (
        scene.zones[0].overlays[0].placements[0].instanceId
      ))), item.name).toEqual(new Set([
        'instance-reference-content-reference',
        'instance-reference-content-selected',
      ]))

      const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
      expect(compiled.error, item.name).toBeNull()
      expect(compiled.artifact?.summary.clipCount, item.name).toBe(3)
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

  // Casting doctrine agreed 2026-07-25: the approved tiers exclude diagnostic
  // Patterns that "look cheap", HeatShimmerTiles, and everything in the
  // very-expensive tier, whose marginal artifact cost runs 7-11 KB each.
  const EXCLUDED_FROM_LESSONS = [
    'TestPattern1D', 'TestPattern2D', 'TestPattern3D', 'EasedSweep', 'HeatShimmerTiles',
    'PhantomStar', 'ZippyZaps', 'SceneSplice', 'Kishimisu',
    'RedlineMachine', 'RedlineMachinePortable',
  ]
  const FOUNDATION_IDS = [
    'stock-show-101-clips-cuts-blank-time',
    'stock-show-102-transitions-values',
    'stock-show-103-clip-transform',
    'stock-show-104-effects-and-ordering',
    'stock-show-105-portable-zones',
    'stock-show-106-built-from-basics',
  ]
  // Simultaneity is itself the subject from 105 onward, so those two lessons
  // are allowed the second Zone the earlier four must do without.
  const SINGLE_ZONE_IDS = FOUNDATION_IDS.slice(0, 4)
  const foundations = () => FOUNDATION_IDS.map((id) => stockShowById(id)!)
  const lessonPatternNames = (item: (typeof STOCK_SHOWS)[number]) => [
    ...item.show.cells.map((cell) => cell.patternName),
    ...(item.show.composition?.patternInstances.map((instance) => instance.patternName) ?? []),
  ]

  it('casts every foundation lesson from the approved Pattern tiers', () => {
    for (const item of foundations()) {
      expect(item, `${FOUNDATION_IDS.join(', ')} must all exist`).toBeDefined()
      for (const name of lessonPatternNames(item)) {
        expect(EXCLUDED_FROM_LESSONS, `${item.name} casts ${name}`).not.toContain(name)
        expect(DEMOS, item.name).toHaveProperty(name)
      }
    }
  })

  it('exposes no Pattern control targets in the foundation lessons', () => {
    // A control target is a claim that the lesson depends on that value. The
    // foundation lessons depend on none, so they set none and let each Pattern
    // render at its authored defaults.
    for (const item of foundations()) {
      expect(item.show.cells.every((cell) => cell.controlTargets === undefined), item.name).toBe(true)
      expect(
        (item.show.composition?.patternInstances ?? []).every((instance) => instance.controlTargets === undefined),
        item.name,
      ).toBe(true)
    }
  })

  it('uses one shared time scale across each foundation Show', () => {
    for (const item of foundations()) {
      const scales = new Set([
        ...item.show.cells.map((cell) => cell.adaptations.timeScale),
        ...(item.show.composition?.patternInstances.map((instance) => instance.time.timeScale) ?? []),
      ])
      expect(scales.size, `${item.name} time scales: ${[...scales].join(', ')}`).toBe(1)
    }
  })

  it('declares the 44x44 portable reference for every foundation lesson', () => {
    // 1,936 is the largest complete square under SHOW_MAX_OUTPUT_PIXELS; 2,000
    // yields a 45-wide grid with a ragged final row.
    for (const item of foundations()) {
      expect(item.show.outputContract, item.name).toMatchObject({
        kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 1_936,
      })
    }
  })

  it('leaves each foundation lesson compile headroom for session edits', () => {
    // Built-ins are session-editable and every note asks the learner to change
    // something, so a lesson compiled near the ceiling breaks on first use.
    for (const item of foundations()) {
      const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
      expect(compiled.error, item.name).toBeNull()
      const summary = compiled.artifact!.summary
      const ratio = summary.artifactBytes / summary.measuredDeviceBudgetBytes
      expect(ratio, `${item.name} uses ${(ratio * 100).toFixed(1)}% of the device budget`)
        .toBeLessThan(0.6)
    }
  })

  it('spends a second Zone only where the lesson is about simultaneity', () => {
    // Measured: cost scales with simultaneous Zones, not with Pattern variety
    // (~1 KB per sequential reprise). No foundation lesson needs a third.
    for (const item of foundations()) {
      const expected = SINGLE_ZONE_IDS.includes(item.id) ? 1 : 2
      expect(item.show.zones, item.name).toHaveLength(expected)
    }
  })

  it('keeps the first lesson to Cuts, blank time, and an explicit Show End', () => {
    const item = stockShowById('stock-show-101-clips-cuts-blank-time')!
    const composition = item.show.composition!
    const main = [...composition.scenes[0].zones[0].main].sort((a, b) => a.startMs - b.startMs)

    expect(item.show.zones).toHaveLength(1)
    expect(main.map((placement) => [placement.startMs, placement.durationMs])).toEqual([
      [0, 5_000], [5_000, 5_000], [12_000, 4_000],
    ])
    // The Cut is the implicit zero-duration junction where two Clips touch.
    expect(main[0].startMs + main[0].durationMs).toBe(main[1].startMs)
    // Blank time is a real gap, not a dimmed Clip, and renders black.
    expect(main[1].startMs + main[1].durationMs).toBeLessThan(main[2].startMs)
    expect(composition.durationMs).toBe(16_000)
    // No competing mechanism: Cuts only, no Effects, no second Layer.
    expect(composition.transitions ?? []).toEqual([])
    expect(item.show.transitions).toEqual([])
    expect(main.every((placement) => !placement.effects?.length)).toBe(true)
    expect(composition.scenes[0].zones[0].overlays).toEqual([])
  })

  it('gives 102 two Transition families over the center-locked radial pair', () => {
    const item = stockShowById('stock-show-102-transitions-values')!
    const instances = item.show.composition!.patternInstances

    expect(instances.map((instance) => instance.patternName))
      .toEqual(['ClockworkIris', 'EventHorizon', 'SignalMandala'])
    const kinds = (item.show.composition!.transitions ?? []).map((transition) => transition.kind)
    expect(new Set(kinds).size, 'two distinct Transition families').toBe(2)
    expect(kinds).toContain('crossfade')
    // Exactly one legible value ramp. A Layer Transition owns geometry only, so
    // the value change is a Property track owned by the destination Clip.
    const tracks = item.show.composition!.scenes.flatMap((scene) => scene.propertyTracks ?? [])
    expect(tracks).toHaveLength(1)
    expect(tracks[0].target).toMatchObject({ kind: 'placement-view', property: 'brightness' })
  })

  it('keeps 103 on one Pattern instance whose clock never restarts', () => {
    const item = stockShowById('stock-show-103-clip-transform')!
    const composition = item.show.composition!
    const main = [...composition.scenes[0].zones[0].main].sort((a, b) => a.startMs - b.startMs)

    expect(composition.patternInstances.map((instance) => instance.patternName)).toEqual(['CompassRose'])
    expect(new Set(main.map((placement) => placement.instanceId)).size).toBe(1)
    expect(main.length).toBeGreaterThanOrEqual(4)
    // Clip Transform is the only variable: no Effects, no Viewport, no restart.
    expect(main.every((placement) => !placement.effects?.length)).toBe(true)
    expect(main.every((placement) => placement.viewport === undefined)).toBe(true)
    // The opening Reference pose is neutral, and a neutral transform compacts
    // away; every later pose carries an explicit one.
    expect(main[0].transform).toBeUndefined()
    expect(main.slice(1).filter((placement) => placement.transform !== undefined).length)
      .toBeGreaterThanOrEqual(3)
    const poses = main.map((placement) => JSON.stringify([placement.transform, placement.view.mirror]))
    expect(new Set(poses).size, 'each placement shows a distinct pose').toBe(main.length)
  })

  it('proves Effect order in 104 with the same two Effects swapped', () => {
    const item = stockShowById('stock-show-104-effects-and-ordering')!
    const composition = item.show.composition!
    const main = [...composition.scenes[0].zones[0].main].sort((a, b) => a.startMs - b.startMs)

    // One instance, so the Pattern is provably not what changes between Clips.
    expect(composition.patternInstances.map((instance) => instance.patternName)).toEqual(['MetaballGarden'])
    expect(new Set(main.map((placement) => placement.instanceId)).size).toBe(1)

    // The ladder: none, one, two, the same two reversed.
    expect(main.map((placement) => (placement.effects ?? []).map((effect) => effect.kind))).toEqual([
      [], ['threshold'], ['brightness', 'threshold'], ['threshold', 'brightness'],
    ])
    // Distinct ids across the two ordered Clips. The compiler now splits
    // placements whose Effect order conflicts, so this is no longer load-bearing
    // for correctness, but keeping the ids distinct states the lesson's intent
    // and keeps the two Clips independently editable (#363).
    const allIds = main.flatMap((placement) => (placement.effects ?? []).map((effect) => effect.id))
    expect(new Set(allIds).size, 'every Effect id is unique across the Clips').toBe(allIds.length)
    const [thirdEffects, fourthEffects] = [main[2].effects!, main[3].effects!]
    expect(new Set(fourthEffects.map((effect) => effect.kind)))
      .toEqual(new Set(thirdEffects.map((effect) => effect.kind)))
    expect(fourthEffects.map((effect) => effect.kind)).not.toEqual(thirdEffects.map((effect) => effect.kind))

    // Both Effects are Color & output stage, so they can actually be reordered
    // against each other and every pixel carries the difference. A Transform
    // pair cannot teach this: every Pattern here fills the frame, so moving one
    // only reveals a different part of the same texture.
    for (const effect of fourthEffects) {
      expect(showClipEffectStage(effect), effect.id).toBe('color-output')
    }

    // The swap has to change the picture, not just the data. A mid-bright pixel
    // survives the cutoff when the cutoff runs first, and is destroyed when the
    // dim runs first.
    // A pixel near the top of MetaballGarden's measured range still cannot clear
    // the cutoff once it has been dimmed to a quarter, so the wrong order gives
    // no picture at all rather than a subtler one. Measured over the Pattern's
    // real output: Cutoff then Dim lights 27.6% of the Stage, Dim then Cutoff
    // lights 0.0%.
    const sample: ShowRgb = [0.7, 0.7, 0.7]
    const third = applyShowColorEffects(thirdEffects, sample)
    const fourth = applyShowColorEffects(fourthEffects, sample)
    expect(Math.max(...third), 'dim before cutoff destroys even a white pixel').toBe(0)
    expect(Math.min(...fourth), 'cutoff before dim keeps it').toBeGreaterThan(0.2)
  })

  it('swaps 105 across two Zones at one shared Cut without a third Pattern', () => {
    const item = stockShowById('stock-show-105-portable-zones')!
    const composition = item.show.composition!
    const [left, right] = composition.scenes[0].zones

    expect(composition.patternInstances.map((instance) => instance.patternName))
      .toEqual(['RibbonLoom', 'Caustics'])
    expect(item.show.routingLayouts[0].logical).toMatchObject({ kind: 'split', axis: 'x' })

    // Both Zones cut at the same instant, so the Patterns trade sides in one
    // move instead of drifting past each other.
    const cutOf = (zone: typeof left) => {
      const ordered = [...zone.main].sort((a, b) => a.startMs - b.startMs)
      return ordered[0].startMs + ordered[0].durationMs
    }
    expect(cutOf(left)).toBe(cutOf(right))
    expect(cutOf(left)).toBe(7_000)
    expect(left.main.map((placement) => placement.instanceId))
      .toEqual([...right.main].reverse().map((placement) => placement.instanceId))

    // Zones are the whole subject; nothing else competes for attention.
    expect(composition.transitions ?? []).toEqual([])
    expect(composition.scenes[0].propertyTracks ?? []).toEqual([])
    expect([...left.main, ...right.main].every((placement) => (
      !placement.effects?.length && placement.transform === undefined
    ))).toBe(true)
  })

  it('recombines 106 from 101-105 material and nothing newer', () => {
    const item = stockShowById('stock-show-106-built-from-basics')!
    const composition = item.show.composition!
    const [sky, ground] = composition.scenes[0].zones
    const placements = [...sky.main, ...ground.main]

    // One of each, once. A capstone that doubles up on any mechanism stops
    // being a demonstration that few decisions are enough.
    expect((composition.transitions ?? []).map((transition) => transition.kind)).toEqual(['crossfade'])
    expect(composition.scenes[0].propertyTracks).toHaveLength(1)
    expect(placements.filter((placement) => placement.effects?.length).length).toBe(1)
    expect(placements.filter((placement) => placement.transform !== undefined).length).toBe(1)
    expect(placements.every((placement) => placement.viewport === undefined)).toBe(true)
    // No Layers: overlays are 200-level material.
    expect(sky.overlays).toEqual([])
    expect(ground.overlays).toEqual([])

    // Blank time survives in the Ground while the Sky keeps playing.
    const groundMain = [...ground.main].sort((a, b) => a.startMs - b.startMs)
    expect(groundMain[0].startMs + groundMain[0].durationMs).toBeLessThan(groundMain[1].startMs)
    expect(composition.durationMs).toBe(24_000)

    // No instance is placed in two Zones at once: each Zone owns its material,
    // which is also what keeps the compiled artifact affordable.
    const skyInstances = new Set(sky.main.map((placement) => placement.instanceId))
    const groundInstances = new Set(ground.main.map((placement) => placement.instanceId))
    expect([...skyInstances].filter((id) => groundInstances.has(id)), 'no instance spans both Zones')
      .toEqual([])
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
    expect(compiled.artifact!.summary.specializations.frameInvariants[0]).toMatchObject({
      clipId: 'redline-machine',
      selectedCount: expect.any(Number),
    })
    expect(compiled.artifact!.summary.specializations.frameInvariants[0].selectedCount).toBeGreaterThan(0)
    expect(compiled.artifact!.summary.specializations.renderKernels).toMatchObject({
      selected: false,
      reason: 'hardware-profile',
      configurationPlanCount: 18,
      kernelCount: 2,
      avoidedBranchesPerPixel: 16,
    })

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
  }, 30_000)

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

  it('uses one high-density square Stage across the whole foundation level', () => {
    // Every Learn 100 lesson renders on the same 44x44 square, so a learner
    // comparing two lessons is comparing choreography, not resolution.
    for (const item of foundations()) {
      expect(item.show.outputContract, item.id).toMatchObject({
        kind: 'portable-2d',
        referencePixelCount: 1_936,
      })
      expect(item.show.zones.reduce((sum, zone) => sum + zone.nominalPixelCount, 0), item.id).toBe(1_936)
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
  }, 15_000)

  it('plays distinct routed content after each top-level Scene boundary (#478)', () => {
    const show = createInstallationCompositionFixture()
    const compiled = compileShowForArtifact(show, [], undefined, {}, { stageDimension: 2 })
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
    expect(compiled.artifact?.summary.clipCount).toBe(10)
  })

  it('keeps Portable logical Zones independent while advancing the Scene schedule (#478)', () => {
    const item = stockShowById('stock-show-105-portable-zones')!
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
  }, 15_000)

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
    15_000,
  )
})

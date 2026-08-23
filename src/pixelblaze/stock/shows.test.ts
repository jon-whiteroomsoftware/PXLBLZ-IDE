import { describe, expect, it } from 'vitest'
import { validateInstallationCoverage } from '@/engine/showInstallationCoverage'
import { buildShowEpeExport } from '@/engine/showEpeExport'
import { parseEpe } from '@/engine/epeImport'
import { createPortableShowOutputContract } from '@/engine/showOutputContract'
import { compileShowForArtifact, sourceForShowCell } from '@/engine/showPreviewArtifact'
import { validatePortableShowCompatibility } from '@/engine/showPortableCompatibility'
import { loadPattern, nativeDimension } from '@/engine/loadPattern'
import { LIBRARIES } from '@/pixelblaze/libs'
import { bundledPatternSliderNames } from '@/engine/showPatternControls'
import { createFastReplayRuntime } from '@/engine/fastReplay'
import { createShim } from '@/engine/shim'
import { validateShowComposition } from '@/engine/showCompositionModel'
import { validateShowLogicalRouting } from '@/engine/showLogicalRouting'
import { materializeShowGroupOccurrences } from '@/engine/showGroupModel'
import { createInstallationCompositionFixture } from '@/engine/showInstallationTestFixture'
import { normalizeShowTransitionState, projectShowTimeline } from '@/engine/showModel'
import { SHOW_EASING_OPTIONS, showEasingOptionId } from '@/engine/showEasing'
import { SHOW_VISUAL_TOOLKIT_REGISTRY } from '@/engine/showVisualToolkit'
import { applyShowColorEffects, sameShowEffectStructure, type ShowRgb } from '@/engine/showEffects'
import { showClipEffectStage } from '@/engine/showEffectAuthoring'
import { applyShowPatternSlotSelections, restoreShowReferencePatternSlots } from '@/engine/showReferenceShow'
import { DEFAULT_SHOW_CLIP_CORNER_RADIUS } from '@/engine/showClipViewport'
import {
  buildDeliveredShowSourceInventory,
  buildShowArtifactInventoryModel,
  describeShowArtifactPatterns,
} from '@/engine/showSourceInventory'
import { getUserDoc } from '@/docs/catalog'
import { DEMOS } from './patterns'
import { SOURCE_STOCK_MAPS } from './maps/stockCatalogue'
import { STOCK_SHOWS, stockShowById } from './shows'

describe('stock Show curriculum (#363)', () => {
  it('ships the stable Learn 100, Learn 200, Learn 300, and showcase catalogue', () => {
    expect(STOCK_SHOWS).toHaveLength(40)
    expect(new Set(STOCK_SHOWS.map((item) => item.id)).size).toBe(STOCK_SHOWS.length)
    expect(STOCK_SHOWS.map((item) => [item.name, item.collection, item.level, item.order])).toEqual([
      ['100 Getting Around', 'learn', 100, 0],
      ['101 Clips, Cuts, and Blank Time', 'learn', 100, 1],
      ['102 Transitions and Values', 'learn', 100, 2],
      ['103 Clip Transform', 'learn', 100, 3],
      ['104 Effects and Ordering', 'learn', 100, 4],
      ['105 Zones', 'learn', 100, 5],
      ['106 Built from Basics', 'learn', 100, 6],
      ['201 Layers and Property Animation', 'learn', 200, 1],
      ['202 Content and Clip Viewport', 'learn', 200, 2],
      ['203 Pattern Instance Lifecycle', 'learn', 200, 3],
      ['204 Presentation Modes', 'learn', 200, 4],
      ['205 Groups and Linked Reuse', 'learn', 200, 5],
      ['206 Changing Zone Layouts', 'learn', 200, 6],
      ['207 Aperture Shapes and Edges', 'learn', 200, 7],
      ['301 Installation Mapping', 'learn', 300, 1],
      ['302 Installation Composition', 'learn', 300, 2],
      ['303 Compile, Simplify, and Deliver', 'learn', 300, 3],
      ['Transform and Address Effects', 'showcases', null, 1],
      ['Distortion Effects', 'showcases', null, 2],
      ['Color Adjustment Effects', 'showcases', null, 3],
      ['Compositing and Key Effects', 'showcases', null, 4],
      ['Luma Sources', 'showcases', null, 5],
      ['Blend and Fade Transitions', 'showcases', null, 6],
      ['Wipes', 'showcases', null, 7],
      ['Dissolves', 'showcases', null, 8],
      ['Shape Reveals: Geometric', 'showcases', null, 9],
      ['Shape Reveals: Figures', 'showcases', null, 10],
      ['Slide Transitions', 'showcases', null, 11],
      ['Zoom and Spin Transitions', 'showcases', null, 12],
      ['Property Animation', 'showcases', null, 13],
      ['Easing', 'showcases', null, 14],
      ['Aperture Shapes: Geometric', 'showcases', null, 15],
      ['Aperture Icons & Signature', 'showcases', null, 16],
      ['Zone Layouts: Splits & Checker', 'showcases', null, 17],
      ['Zone Layouts: Stripes & Grid', 'showcases', null, 18],
      ['Zone Layouts: Radial', 'showcases', null, 19],
      ['Redline Installation', 'installations', null, 1],
      ['Coronal Mass Ejection Remix', 'portable-shows', null, 1],
      ['Quadrille', 'portable-shows', null, 2],
      ['Overture Installation', 'installations', null, 2],
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

  it('ships the repartitioned single-family reference Shows with semantic example metadata (#506)', () => {
    const referenceShows = STOCK_SHOWS.filter((item) => item.id.startsWith('stock-show-reference-'))

    expect(referenceShows.map((item) => item.id)).toEqual([
      'stock-show-reference-blend-fade-transitions',
      'stock-show-reference-wipe-transitions',
      'stock-show-reference-dissolve-transitions',
      'stock-show-reference-shape-reveal-transitions',
      'stock-show-reference-shape-reveal-figures',
      'stock-show-reference-slide-transitions',
      'stock-show-reference-zoom-spin-transitions',
      'stock-show-reference-property-animation',
      'stock-show-reference-easing',
      'stock-show-reference-aperture-shapes',
      'stock-show-reference-aperture-icons',
    ])
    // The repartition trades everything-matrices for families a viewer can
    // hold in mind; Blend and Fade and Dissolves are the smallest at four.
    expect(referenceShows.every((item) => item.reference!.examples.length >= 4)).toBe(true)
    expect(referenceShows.every((item) => (item.reference?.patternSlots?.cellIds.length ?? 0) > 0)).toBe(true)
    expect(referenceShows.find((item) => item.id === 'stock-show-reference-property-animation')?.reference?.patternSlots)
      .toMatchObject({
        cellIds: expect.arrayContaining(['cell-animation-speed-zone-2', 'cell-repeat-scale-zone-2']),
        instanceIds: [
          'instance-property-comparison',
          'instance-property-comparison-speed',
          'instance-property-comparison-control',
        ],
      })

    const referenceSection = STOCK_SHOWS.filter((item) => (
      item.id.startsWith('stock-show-showcase-') || item.id.startsWith('stock-show-reference-')
    ) && !['stock-show-showcase-redline-installation'].includes(item.id))
    expect(referenceSection.every((item) => item.reference && item.reference.patternSlots)).toBe(true)
    expect(referenceSection.every((item) => item.note.defaultOpen)).toBe(true)
  })

  it('covers wipe variants, every silhouette, the split motion registry, easing curves, and Property targets (#506)', () => {
    const item = (id: string) => STOCK_SHOWS.find((candidate) => candidate.id === id)!
    const wipe = item('stock-show-reference-wipe-transitions')
    const shapeGeometric = item('stock-show-reference-shape-reveal-transitions')
    const shapeFigures = item('stock-show-reference-shape-reveal-figures')
    const slide = item('stock-show-reference-slide-transitions')
    const zoomSpin = item('stock-show-reference-zoom-spin-transitions')
    const dissolve = item('stock-show-reference-dissolve-transitions')
    const easing = item('stock-show-reference-easing')
    const property = item('stock-show-reference-property-animation')

    const transitionVariants = (familyId: string) => SHOW_VISUAL_TOOLKIT_REGISTRY
      .find((family) => family.kind === 'transition' && family.id === familyId)!.variants.map((variant) => variant.id)
    // Silhouettes split across the Geometric and Figures references (#514
    // caught one fifteen-boundary matrix over the activation ceiling);
    // together they still cover the registry.
    expect(new Set([
      ...(shapeGeometric.show.transitions?.filter((transition) => transition.kind === 'portal').map((transition) => transition.shape) ?? []),
      ...(shapeFigures.show.transitions?.filter((transition) => transition.kind === 'portal').map((transition) => transition.shape) ?? []),
    ])).toEqual(new Set(transitionVariants('shape-reveal')))
    expect(new Set(wipe.show.transitions?.filter((transition) => transition.kind === 'wipe').map((transition) => transition.wipeVariant)))
      .toEqual(new Set(transitionVariants('wipe')))
    // Motion variants split across the Slide and Zoom-and-Spin references;
    // together they still cover the registry.
    expect(new Set([
      ...(slide.show.transitions?.filter((transition) => transition.kind === 'motion').map((transition) => transition.motionVariant) ?? []),
      ...(zoomSpin.show.transitions?.filter((transition) => transition.kind === 'motion').map((transition) => transition.motionVariant) ?? []),
    ])).toEqual(new Set(transitionVariants('motion')))
    // Cardinal directions only; diagonals stay continuous inspector edits.
    expect(wipe.show.transitions?.filter((transition) => transition.kind === 'wipe' && transition.wipeVariant === 'linear')
      .map((transition) => transition.direction)).toEqual([0, 0.25, 0.5, 0.75])
    expect(easing.show.transitions?.map((transition) => showEasingOptionId(transition.easing)))
      .toEqual(SHOW_EASING_OPTIONS.map((option) => option.id))

    // Editor pacing: split references lead with a study-tempo exemplar and
    // run every sibling faster. Easing alone stays uniform, because running
    // every curve over an identical duration is its control variable.
    for (const reference of [wipe, shapeGeometric, shapeFigures, slide, zoomSpin, dissolve]) {
      const durations = reference.show.transitions!.map((transition) => transition.durationMs)
      expect(Math.max(...durations.slice(1)), reference.name).toBeLessThan(durations[0])
    }
    {
      const starts = projectShowTimeline(easing.show).boundaryTransitions.map((transition) => transition.startMs)
      const gaps = new Set(starts.slice(1).map((start, index) => start - starts[index]))
      expect(gaps.size).toBe(1)
    }

    const targets = property.show.composition!.scenes.flatMap((scene) => scene.propertyTracks?.map((track) => track.target) ?? [])
    expect(targets.map((target) => target.kind)).toEqual([
      'instance-time-scale', 'instance-control', 'placement-view',
      'placement-transform', 'placement-viewport', 'placement-opacity', 'placement-effect',
    ])
    expect(property.show.transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ propertyTransitions: { routing: { splitPosition: expect.anything() } } }),
      expect.objectContaining({ propertyTransitions: { sample: { repeatScale: expect.anything() } } }),
    ]))
  })

  it('places Transition references over one fixed diagnostic backdrop (#506)', () => {
    const references = [
      'stock-show-reference-blend-fade-transitions',
      'stock-show-reference-wipe-transitions',
      'stock-show-reference-dissolve-transitions',
      'stock-show-reference-shape-reveal-transitions',
      'stock-show-reference-shape-reveal-figures',
      'stock-show-reference-slide-transitions',
      'stock-show-reference-zoom-spin-transitions',
      'stock-show-reference-easing',
    ].map((id) => STOCK_SHOWS.find((candidate) => candidate.id === id)!)

    // Only the families whose Transitions open gaps keep the backdrop (#63);
    // Blend, Wipe, Dissolve, and Easing always cover the frame and drop it.
    const BACKDROP_REFERENCES = new Set([
      'stock-show-reference-shape-reveal-transitions',
      'stock-show-reference-shape-reveal-figures',
      'stock-show-reference-slide-transitions',
      'stock-show-reference-zoom-spin-transitions',
    ])
    for (const item of references) {
      expect(item.show.composition?.scenes).toHaveLength(item.show.scenes.length)
      if (BACKDROP_REFERENCES.has(item.id)) {
        // Murmuration by measurement: the calmest dim voice in the corpus
        // (flux 0.015); the old Caustics backdrop measured 0.53 and fought
        // the comparison running above it.
        expect(item.show.composition?.patternInstances).toContainEqual(expect.objectContaining({
          id: 'instance-reference-backdrop',
          patternName: 'Murmuration',
        }))
        expect(item.show.composition?.scenes.every((scene) => (
          scene.zones[0].main.some((placement) => placement.instanceId === 'instance-reference-backdrop')
          && scene.zones[0].overlays[0]?.placements[0]?.opacity === 0.82
        ))).toBe(true)
      } else {
        expect(item.show.composition?.patternInstances.map((instance) => instance.id), item.name)
          .not.toContain('instance-reference-backdrop')
        expect(item.show.composition?.scenes.every((scene) => (
          scene.zones[0].main.length === 1 && scene.zones[0].overlays.length === 0
        )), item.name).toBe(true)
      }
      expect(item.reference?.patternSlots?.instanceIds.length).toBeGreaterThan(0)
      expect(item.reference?.patternSlots?.instanceIds).not.toContain('instance-reference-backdrop')
    }
  })

  it('reuses one intentional Pattern pair across every Transition reference', { timeout: 30_000 }, () => {
    const references = [
      'stock-show-reference-blend-fade-transitions',
      'stock-show-reference-wipe-transitions',
      'stock-show-reference-dissolve-transitions',
      'stock-show-reference-shape-reveal-transitions',
      'stock-show-reference-shape-reveal-figures',
      'stock-show-reference-slide-transitions',
      'stock-show-reference-zoom-spin-transitions',
      'stock-show-reference-easing',
    ].map((id) => STOCK_SHOWS.find((candidate) => candidate.id === id)!)

    for (const item of references) {
      // The measured diagnostic pair: probed on the 44x44 plane at the 0.32
      // clock, IQPalettes and MetaballGarden are the two calmest
      // equally-bright fields with the widest sustained hue contrast, so
      // every boundary reads as one world replacing another.
      // Blend and Fade recasts its reference side to MetaballsOfFire2D and
      // Wipes to InfinityFlower2D, and Dissolves to WavyBands over
      // GeometryMorphingDemo2D (#63); the backdrop is per family.
      const composition = item.show.composition!
      const RECASTS: Record<string, [string, string]> = {
        'stock-show-reference-blend-fade-transitions': ['MetaballsOfFire2D', 'MetaballGarden'],
        'stock-show-reference-wipe-transitions': ['InfinityFlower2D', 'MetaballGarden'],
        'stock-show-reference-dissolve-transitions': ['WavyBands', 'GeometryMorphingDemo2D'],
      }
      const [referenceSide, selectedSide] = RECASTS[item.id] ?? ['IQPalettes', 'MetaballGarden']
      const hasBackdrop = composition.patternInstances.some((instance) => instance.id === 'instance-reference-backdrop')
      expect(composition.patternInstances.map((instance) => instance.patternName), item.name).toEqual([
        ...(hasBackdrop ? ['Murmuration'] : []),
        referenceSide,
        selectedSide,
      ])
      expect(new Set(composition.scenes.map((scene) => (
        hasBackdrop ? scene.zones[0].overlays[0].placements[0].instanceId : scene.zones[0].main[0].instanceId
      ))), item.name).toEqual(new Set([
        'instance-reference-content-reference',
        'instance-reference-content-selected',
      ]))

      const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
      expect(compiled.error, item.name).toBeNull()
      expect(compiled.artifact?.summary.clipCount, item.name).toBe(hasBackdrop ? 3 : 2)
    }
  })

  it('gives every Show a complete guide note outside the compiled record', () => {
    for (const item of STOCK_SHOWS) {
      expect(item.note.purpose, item.name).not.toBe('')
      expect(item.note.notice, item.name).not.toBe('')
      expect(item.note.prompts, item.name).toHaveLength(2)
      // 100 Getting Around hands off to the Keyboard Shortcuts reference;
      // every concept lesson hands off to the visual toolkit guide.
      expect(
        item.id === 'stock-show-100-getting-around' ? 'keyboard-shortcuts' : 'show-visual-toolkit',
        item.name,
      ).toBe(item.note.guide.documentId)
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
    'stock-show-100-getting-around',
    'stock-show-101-clips-cuts-blank-time',
    'stock-show-102-transitions-values',
    'stock-show-103-clip-transform',
    'stock-show-104-effects-and-ordering',
    'stock-show-105-portable-zones',
    'stock-show-106-built-from-basics',
  ]
  const COMPOSITION_IDS = [
    'stock-show-201-layers-property-animation',
    'stock-show-202-content-clip-viewport',
    'stock-show-203-pattern-instance-lifecycle',
    'stock-show-204-presentation-modes',
    'stock-show-205-groups-linked-reuse',
    'stock-show-206-changing-zone-layouts',
    'stock-show-207-aperture-shapes-edges',
  ]
  const OUTPUT_IDS = [
    'stock-show-301-installation-mapping',
    'stock-show-302-installation-composition',
    'stock-show-303-compile-simplify-deliver',
  ]
  const LESSON_IDS = [...FOUNDATION_IDS, ...COMPOSITION_IDS, ...OUTPUT_IDS]
  // Simultaneity is itself the subject from 105 onward, so those two lessons
  // are allowed the second Zone the earlier five must do without (the 100
  // tour included). At the 200 level simultaneity lives on Layers, so only
  // 206 - where changing routed topology is the lesson - carries a second
  // Zone. The 300 level is about physical ownership, and its banks are Zones
  // by definition.
  const SINGLE_ZONE_IDS = [
    ...FOUNDATION_IDS.slice(0, 5),
    ...COMPOSITION_IDS.slice(0, 5),
    'stock-show-207-aperture-shapes-edges',
    'stock-show-303-compile-simplify-deliver',
  ]
  const lessons = () => LESSON_IDS.map((id) => stockShowById(id)!)
  const lessonPatternNames = (item: (typeof STOCK_SHOWS)[number]) => [
    ...item.show.cells.map((cell) => cell.patternName),
    ...(item.show.composition?.patternInstances.map((instance) => instance.patternName) ?? []),
    ...(item.show.composition?.groupDefinitions ?? []).flatMap((definition) => (
      definition.patternInstances.map((instance) => instance.patternName)
    )),
  ]

  it('casts every lesson from the approved Pattern tiers', () => {
    for (const item of lessons()) {
      expect(item, `${LESSON_IDS.join(', ')} must all exist`).toBeDefined()
      for (const name of lessonPatternNames(item)) {
        expect(EXCLUDED_FROM_LESSONS, `${item.name} casts ${name}`).not.toContain(name)
        expect(DEMOS, item.name).toHaveProperty(name)
      }
    }
  })

  it('exposes no Pattern control targets in the lessons', () => {
    // A control target is a claim that the lesson depends on that value. The
    // curriculum lessons depend on none, so they set none and let each Pattern
    // render at its authored defaults.
    for (const item of lessons()) {
      expect(item.show.cells.every((cell) => cell.controlTargets === undefined), item.name).toBe(true)
      expect(
        (item.show.composition?.patternInstances ?? []).every((instance) => instance.controlTargets === undefined),
        item.name,
      ).toBe(true)
    }
  })

  it('uses one shared time scale across each lesson Show', () => {
    for (const item of lessons()) {
      const scales = new Set([
        ...item.show.cells.map((cell) => cell.adaptations.timeScale),
        ...(item.show.composition?.patternInstances.map((instance) => instance.time.timeScale) ?? []),
        ...(item.show.composition?.groupDefinitions ?? []).flatMap((definition) => (
          definition.patternInstances.map((instance) => instance.time.timeScale)
        )),
      ])
      if (item.id === 'stock-show-301-installation-mapping') {
        // 301 runs each voice at a hand-tuned speed from live review on the
        // rebuilt arch geometry (#835): the calm casting reads as a still
        // image on the big stage at the shared lesson clock.
        expect([...scales].sort(), `${item.name} time scales`).toEqual([1.08, 1.8, 2.84])
        continue
      }
      expect(scales.size, `${item.name} time scales: ${[...scales].join(', ')}`).toBe(1)
    }
  })

  it('declares the 44x44 portable reference for every portable lesson', () => {
    // 1,936 is the largest complete square under SHOW_MAX_OUTPUT_PIXELS; 2,000
    // yields a 45-wide grid with a ragged final row. The 300 level is the
    // deliberate exception: its whole subject is a fixed physical output.
    for (const item of lessons()) {
      if (item.track === 'installation') {
        expect(item.show.outputContract, item.name).toMatchObject(
          item.id === 'stock-show-301-installation-mapping'
            ? { kind: 'installation', outputMapId: 'proscenium-stage-2d', pixelCount: 1_000 }
            : { kind: 'installation', outputMapId: 'redline-stage-2d', pixelCount: 2_000 },
        )
        continue
      }
      expect(item.show.outputContract, item.name).toMatchObject({
        kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 1_936,
      })
    }
  })

  it('leaves each lesson compile headroom for session edits', () => {
    // Built-ins are session-editable and every note asks the learner to change
    // something, so a lesson compiled near the ceiling breaks on first use.
    //
    // The single-mechanism lessons stay well under half the budget. The capstone
    // is the one Show that carries every mechanism at once over two Zones, and
    // measurement puts that baseline alone near 58%: three Patterns, three
    // Transition families, and three value curves cannot also fit under 0.6. Its
    // prompts are deliberately non-structural -- swap a Transition shape, drag a
    // curve -- so the headroom it needs is smaller than the other lessons', and
    // the ceiling here is what that trade actually costs.
    const ceilingFor = (id: string) => (id === 'stock-show-106-built-from-basics' ? 0.8 : 0.6)
    for (const item of lessons()) {
      const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
      expect(compiled.error, item.name).toBeNull()
      const summary = compiled.artifact!.summary
      const ratio = summary.artifactBytes / summary.measuredDeviceBudgetBytes
      expect(ratio, `${item.name} uses ${(ratio * 100).toFixed(1)}% of the device budget`)
        .toBeLessThan(ceilingFor(item.id))
    }
  })

  it('spends a second Zone only where the lesson is about simultaneity', () => {
    // Measured: cost scales with simultaneous Zones, not with Pattern variety
    // (~1 KB per sequential reprise). No portable lesson needs a third; at the
    // 200 level, simultaneity is taught on Layers, so only 206 routes two
    // Zones. The installation lessons own their stages' real surfaces: the
    // Proscenium's three roles and the Redline stage's hero plus four
    // satellites.
    for (const item of lessons()) {
      const expected = SINGLE_ZONE_IDS.includes(item.id) ? 1
        : item.id === 'stock-show-302-installation-composition' ? 5
          : item.id === 'stock-show-301-installation-mapping' ? 3
            : 2
      expect(item.show.zones, item.name).toHaveLength(expected)
    }
  })

  it('keeps the 100 tour furnished for its gestures rather than a concept', () => {
    // The two prompts and the notice need specific furniture: an empty
    // stretch of Layer to double-click, a second Layer row to drag onto, and
    // calm content that never competes with the tools.
    const item = stockShowById('stock-show-100-getting-around')!
    const composition = item.show.composition!
    const zone = composition.scenes[0].zones[0]
    const mainEnd = Math.max(...zone.main.map((entry) => entry.startMs + entry.durationMs))
    expect(composition.durationMs).toBe(16_000)
    expect(mainEnd).toBeLessThanOrEqual(16_000 - 3_000)
    const overlay = zone.overlays[0]
    expect(zone.overlays).toHaveLength(1)
    expect(overlay?.placements).toHaveLength(1)
    // Static half opacity: the overlay is a drag target and zoom landmark,
    // not a Property-animation preview of 201.
    expect(overlay?.placements[0]?.opacity).toBe(0.5)
    expect(item.show.composition!.scenes[0].propertyTracks ?? []).toEqual([])
    expect(item.show.transitions ?? []).toEqual([])
  })

  it('shapes only the 207 aperture: silhouette and edge are the sole variables', () => {
    // Oracle: compile 207 twice - once as authored, once with every subject
    // viewport flattened to the plain rectangle - and drive both runtimes
    // identically. Pixels outside the frame must stay bit-identical at every
    // sampled time; the ellipse may only carve the frame's corners; the Ring
    // must open the center; and the Soft edge must change a boundary pixel
    // that the Hard ring left identical.
    const item = stockShowById('stock-show-207-aperture-shapes-edges')!
    const variant = (mutate: (entry: { id?: string; viewport?: Record<string, unknown> }) => void) => {
      const show = structuredClone(item.show)
      for (const zone of show.composition!.scenes[0].zones) {
        for (const layer of zone.overlays) {
          for (const entry of layer.placements) mutate(entry as { id?: string; viewport?: Record<string, unknown> })
        }
      }
      return show
    }
    // Flatten silhouette only: the Soft edge stays, so every difference
    // against the authored fixture is attributable to shape, never to a
    // simultaneous Hard-versus-Soft change (review P2).
    const flattened = variant((entry) => {
      if (entry.viewport) {
        entry.viewport = {
          enabled: entry.viewport.enabled,
          x: entry.viewport.x, y: entry.viewport.y,
          width: entry.viewport.width, height: entry.viewport.height,
          edge: 'soft',
        }
      }
    })
    // The deliberate Hard passage rendered at the Soft default instead: at
    // t=14 every difference against the authored fixture lies in the feather
    // bands and nowhere else.
    const softened = variant((entry) => {
      if (entry.viewport && entry.viewport.edge === 'hard') {
        const { edge: _edge, ...rest } = entry.viewport
        entry.viewport = rest
      }
    })
    const compiledShaped = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    const compiledFlat = compileShowForArtifact(flattened, [], undefined, {}, { stageDimension: 2 })
    const compiledSoftened = compileShowForArtifact(softened, [], undefined, {}, { stageDimension: 2 })
    expect(compiledShaped.error).toBeNull()
    expect(compiledFlat.error).toBeNull()
    expect(compiledSoftened.error).toBeNull()

    const mapPoints = SOURCE_STOCK_MAPS.find((map) => map.id === 'plane')!.resolve(1_936)
    const runtime = (code: string, metadata: Parameters<typeof loadPattern>[1]) => {
      let virtualTime = 0
      const shim = createShim({
        pixelCount: 1_936, dimensions: 2, mapPoints,
        getVirtualTime: () => virtualTime, randomSeed: 207,
      })
      const handle = loadPattern(code, metadata, shim.builtins)
      return {
        advance(deltaMs: number) {
          virtualTime += deltaMs
          handle.beforeRender(deltaMs)
        },
        sample(index: number) {
          const [x, y] = mapPoints[index].sample
          handle.render2D(index, x, y)
          return shim.capturedPixel()
        },
      }
    }
    const shaped = runtime(compiledShaped.artifact!.code, compiledShaped.artifact!.metadata)
    const flat = runtime(compiledFlat.artifact!.code, compiledFlat.artifact!.metadata)
    const soft = runtime(compiledSoftened.artifact!.code, compiledSoftened.artifact!.metadata)
    const indexAt = (x: number, y: number) => Math.round(y * 43) * 44 + Math.round(x * 43)
    const PIXELS = {
      outside: [indexAt(0.1, 0.1), indexAt(0.9, 0.9)],
      center: [indexAt(0.5, 0.5)],
      frameCorner: [indexAt(0.28, 0.28)],
      // A radial line crossing the Ring's outer boundary region at x=0.5.
      ringBand: [indexAt(0.5, 0.256), indexAt(0.5, 0.279), indexAt(0.5, 0.302)],
    }
    const sampleAll = (deltaMs: number) => {
      shaped.advance(deltaMs)
      flat.advance(deltaMs)
      soft.advance(deltaMs)
      return Object.fromEntries(Object.entries(PIXELS).map(([key, indices]) => [
        key,
        {
          shaped: indices.map((index) => shaped.sample(index)),
          flat: indices.map((index) => flat.sample(index)),
          soft: indices.map((index) => soft.sample(index)),
        },
      ]))
    }

    const rectangle = sampleAll(2_000)   // t=2: all three variants are the plain frame
    const ellipse = sampleAll(4_000)     // t=6: silhouette changes at its Soft default
    const star = sampleAll(4_000)        // t=10: an icon silhouette, still at Soft (#691)
    const ring = sampleAll(4_000)        // t=14: the center opens
    const ringHard = sampleAll(4_000)    // t=18: only the edge hardens

    for (const frame of [rectangle, ellipse, star, ring, ringHard]) {
      expect(frame.outside.shaped).toEqual(frame.outside.flat)
      expect(frame.outside.shaped).toEqual(frame.outside.soft)
    }
    expect(rectangle.center.shaped).toEqual(rectangle.center.flat)
    expect(rectangle.frameCorner.shaped).toEqual(rectangle.frameCorner.flat)
    expect(ellipse.center.shaped).toEqual(ellipse.center.flat)
    expect(ellipse.frameCorner.shaped).not.toEqual(ellipse.frameCorner.flat)
    expect(star.center.shaped).toEqual(star.center.flat)
    expect(star.frameCorner.shaped).not.toEqual(star.frameCorner.flat)
    expect(ring.center.shaped).not.toEqual(ring.center.flat)

    // Before the Hard passage the softened variant is byte-identical to the
    // authored fixture; at t=18 its differences must exist and stay confined
    // to the feather region.
    for (const frame of [rectangle, ellipse, star, ring]) {
      for (const key of ['center', 'frameCorner', 'ringBand'] as const) {
        expect(frame[key].shaped).toEqual(frame[key].soft)
      }
    }
    expect(ringHard.center.shaped).toEqual(ringHard.center.soft)
    expect(ringHard.ringBand.shaped).not.toEqual(ringHard.ringBand.soft)
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
      .toEqual(['EventHorizon', 'ClockworkIris', 'SignalMandala'])
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
    // A mid-range pixel is destroyed when the dim runs first, because it meets
    // the cutoff already lowered, and survives when the cutoff runs first.
    // Measured over the Pattern's real output: Cutoff then Dim lights 27.6% of
    // the Stage, Dim then Cutoff lights 10.3%, at nearly equal mean brightness.
    const sample: ShowRgb = [0.35, 0.35, 0.35]
    const third = applyShowColorEffects(thirdEffects, sample)
    const fourth = applyShowColorEffects(fourthEffects, sample)
    expect(Math.max(...third), 'dim before cutoff drops it under the cutoff').toBe(0)
    expect(Math.min(...fourth), 'cutoff before dim keeps it').toBeGreaterThan(0.2)
  })

  it('carries 105 across split, rings, and pinwheel with both instances continuing (#694, #700)', () => {
    const item = stockShowById('stock-show-105-portable-zones')!
    const composition = item.show.composition!

    // Water voice restored to Caustics (#823): the deterministic-loop
    // contract needs member state that reconstructs exactly at Show End,
    // which IceFloes2D's nested random arrays cannot provide. The #727
    // IceFloes2D measurements (flux 0.097 vs Caustics 0.096) show the
    // split separation survives the restoration.
    expect(composition.patternInstances.map((instance) => instance.patternName))
      .toEqual(['RibbonLoom', 'Caustics'])
    // Three Layouts that render very differently, each reached by a swept
    // routing boundary. The zero-duration Cuts are the materialized
    // canonical boundary records (#823), not a visual treatment.
    expect(item.show.routingLayouts.map((layout) => layout.logical?.kind)).toEqual(['split', 'rings', 'pinwheel'])
    expect(item.show.transitions.map((transition) => [transition.kind, transition.durationMs, transition.layoutId]))
      .toEqual([
        ['cut', 0, undefined],
        ['routing', 1_500, 'layout-rings'],
        ['cut', 0, undefined],
        ['routing', 1_500, 'layout-pinwheel'],
      ])
    expect(item.show.transitions.filter((transition) => transition.kind === 'routing')
      .every((transition) => transition.routingDirection === 'forward')).toBe(true)

    // The rings count exceeds the Zone count: the cycle deals rings modulo
    // Zone order, so the bullseye reads Weave-Water-Weave and the note's
    // added third Zone inherits the spare ring instead of getting no pixels.
    const rings = item.show.routingLayouts[1].logical!
    expect(rings.kind === 'rings' && rings.rings).toBe(3)
    expect(rings.zoneIds).toHaveLength(2)

    // The same two instances serve every interval: geometry changes, Pattern
    // state does not.
    const instancesByScene = composition.scenes.map((sceneItem) => (
      sceneItem.zones.flatMap((zone) => zone.main.map((placementItem) => placementItem.instanceId)).sort()
    ))
    expect(instancesByScene).toEqual([['ribbons', 'water'], ['ribbons', 'water'], ['ribbons', 'water']])
    expect(composition.durationMs).toBe(20_000)

    // Zones and the Layout switch are the whole subject; nothing competes.
    expect(composition.transitions ?? []).toEqual([])
    expect(composition.scenes.every((sceneItem) => (sceneItem.propertyTracks ?? []).length === 0)).toBe(true)
    expect(composition.scenes.flatMap((sceneItem) => sceneItem.zones.flatMap((zone) => zone.main))
      .every((placementItem) => !placementItem.effects?.length && placementItem.transform === undefined)).toBe(true)
  })

  it('declares Try with Pattern slot groups covering every lesson instance (#63)', () => {
    for (const item of lessons()) {
      const groups = item.patternSlots
      expect(groups, item.name).toBeDefined()
      expect(groups!.length, item.name).toBeGreaterThan(0)
      expect(groups!.length, item.name).toBeLessThanOrEqual(4)
      const instances = item.show.composition?.patternInstances ?? []
      const instanceIds = new Set(instances.map((instance) => instance.id))
      const slotted = groups!.flatMap((group) => group.instanceIds)
      expect(new Set(slotted).size, `${item.name} groups are disjoint`).toBe(slotted.length)
      for (const id of slotted) {
        expect(instanceIds.has(id), `${item.name} slot ${id} resolves`).toBe(true)
      }
      // Every top-level instance is swappable, so the pickers mirror the
      // timeline completely. (Group-definition instances, like 205's pulse,
      // are outside the projection machinery and stay authored.)
      expect(slotted.length, `${item.name} covers every instance`).toBe(instances.length)
      // A group swaps one source Pattern as a unit, and every instance of
      // that source lives in that group - so same-source comparisons (203
      // restart, 204 presentation, 303 machine sharing) survive a swap.
      for (const group of groups!) {
        const names = new Set(instances
          .filter((instance) => group.instanceIds.includes(instance.id))
          .map((instance) => instance.patternName))
        expect(names.size, `${item.name} group swaps one source`).toBe(1)
        const [name] = names
        const sameSource = instances
          .filter((instance) => instance.patternName === name)
          .map((instance) => instance.id)
        expect([...group.instanceIds].sort(), `${item.name} ${name} instances swap together`)
          .toEqual(sameSource.sort())
      }
    }
  })

  it('declares every reference Showcase Pattern slot in first-appearance order (#714)', () => {
    const slotPatternNames = (id: string) => {
      const item = STOCK_SHOWS.find((candidate) => candidate.id === id)!
      const instanceNames = new Map(
        item.show.composition?.patternInstances.map((instance) => [instance.id, instance.patternName]) ?? [],
      )
      const cellNames = new Map(item.show.cells.map((cell) => [cell.id, cell.patternName]))
      return item.patternSlots?.map((group) => {
        const names = new Set([
          ...group.instanceIds.map((instanceId) => instanceNames.get(instanceId)),
          ...group.cellIds.map((cellId) => cellNames.get(cellId)),
        ].filter((name): name is string => Boolean(name)))
        expect(names.size, `${item.name} slot swaps one source`).toBe(1)
        return [...names][0]
      })
    }

    expect(slotPatternNames('stock-show-showcase-transform-effects')).toEqual(['TunnelOfSquares2D'])
    expect(slotPatternNames('stock-show-reference-aperture-shapes')).toEqual([
      'MetaballGarden',
      'CompassRose',
    ])
    // Declarations scope the swap surface (#822): the Murmuration backdrop
    // is doctrine-fixed and no longer offers a swap box.
    expect(slotPatternNames('stock-show-reference-blend-fade-transitions')).toEqual([
      'MetaballsOfFire2D',
      'MetaballGarden',
    ])
  })

  it('demonstrates the Rounded box aperture at the true default radius (#823)', () => {
    // The passage's detail text claims "the default radius", so the record
    // must track the engine default rather than pin a stale value; the wide
    // sibling has to stay a clear contrast, not a near-tie.
    const item = stockShowById('stock-show-reference-aperture-shapes')!
    const rounded = (item.show.composition?.scenes ?? []).flatMap((scene) => scene.zones.flatMap((zone) => (
      [...zone.main, ...zone.overlays.flatMap((layer) => layer.placements)]
        .filter((placement) => placement.viewport?.aperture === 'rounded-box')
    )))
    expect(rounded).toHaveLength(2)
    const [base, wide] = rounded
    expect(base.viewport!.cornerRadius).toBe(DEFAULT_SHOW_CLIP_CORNER_RADIUS)
    expect(wide.viewport!.cornerRadius).toBeGreaterThanOrEqual(DEFAULT_SHOW_CLIP_CORNER_RADIUS + 0.15)
  })

  it('holds the Quadrille phrase grid under the legal fade floor (#823)', () => {
    // The score is eight 6.4 s phrases at 75 BPM. Fades EXTEND the compiled
    // timeline, so every fade-out scene holds phrase-minus-fade and each
    // boundary lands on the grid. The 800 ms fade (one beat) is authored
    // intent: the old 1,000 ms normalization floor silently clamped it and
    // de-phased every later boundary until #823 removed the floor - the
    // normalization assertion below is the regression guard.
    const item = stockShowById('stock-show-remix-quadrille')!
    const PHRASE_MS = 6_400
    expect(item.show.composition!.durationMs).toBe(51_200)
    // deterministic-loop stays withheld: the wrap census measured member
    // state drift at Show End, so the stamp waits on engine snapshot
    // support (#841). The loop remains phrase-exact choreography.
    expect(item.show.composition!.executionModel).toBeUndefined()
    const fades = item.show.transitions.filter((transition) => transition.kind === 'crossfade')
    expect(fades).toHaveLength(4)
    for (const fade of fades) {
      expect(fade.durationMs).toBe(800)
      expect(fade.crossfadePolicy).toBe('live-live')
    }
    const renormalized = normalizeShowTransitionState(item.show)
    expect(renormalized.transitions.filter((transition) => transition.kind === 'crossfade')
      .every((transition) => transition.durationMs === 800)).toBe(true)
    // Cumulative scene boundaries (hold + appended fade) stay on the grid,
    // and the whole loop is exactly eight phrases.
    const fadeBySceneId = new Map(item.show.transitions.map((transition) => [transition.afterSceneId, transition]))
    let cursorMs = 0
    for (const scene of item.show.scenes) {
      cursorMs += scene.durationMs + (fadeBySceneId.get(scene.id)?.durationMs ?? 0)
      expect(cursorMs % PHRASE_MS, `${scene.name} boundary sits on the phrase grid`).toBe(0)
    }
    expect(cursorMs).toBe(51_200)
    // The dancer's shaped entrance clock still integrates to exactly half a
    // swell per phrase: hold integral plus the fade tail at the edge rate.
    // Symmetric easings preserve trapezoid integrals.
    const entrance = item.show.composition!.scenes
      .find((scene) => scene.sceneId === 'the-dancer-enters')!
    const clock = (entrance.propertyTracks ?? []).find((track) => track.target.kind === 'instance-time-scale')!
    const frames = clock.keyframes
    let integral = 0
    for (let index = 1; index < frames.length; index += 1) {
      integral += (frames[index].timeMs - frames[index - 1].timeMs) / 1_000
        * (frames[index].value + frames[index - 1].value) / 2
    }
    const EDGE = 0.384
    const fadeMs = fadeBySceneId.get('the-dancer-enters')!.durationMs
    // TURNAROUND is authored to four decimals, so closure is exact to ~2e-5.
    expect(integral + (fadeMs / 1_000) * EDGE).toBeCloseTo(EDGE * (PHRASE_MS / 1_000), 4)
  })

  it('keeps the Property Animation boundary-owned transitions live through normalization (#823)', () => {
    // The note promises nine changing values and names the last two as
    // boundary-owned Property transitions. Cuts cannot own Property
    // transitions (#418), so these two boundaries must be positive-duration
    // records or the normalizer silently reduces the promised 1.8 s ramps
    // to instantaneous steps - which is exactly how the showcase shipped.
    const item = stockShowById('stock-show-reference-property-animation')!
    const normalized = normalizeShowTransitionState(item.show)
    const byId = new Map(normalized.transitions.map((transition) => [transition.id, transition]))
    const split = byId.get('transition-effect-parameter')!
    const repeat = byId.get('transition-split-position')!
    for (const transition of [split, repeat]) {
      expect(transition.kind).not.toBe('cut')
      expect(transition.durationMs).toBeGreaterThan(0)
    }
    expect(split.propertyTransitions?.routing?.splitPosition)
      .toMatchObject({ from: 0.25, durationMs: 1_800 })
    expect(repeat.propertyTransitions?.sample?.repeatScale)
      .toMatchObject({ from: 1, durationMs: 1_800 })
  })

  it('compiles a Property Animation slot swap after removing orphaned controls (#828)', () => {
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-property-animation')!
    const group = item.patternSlots![0]
    const projection = {
      pattern: { kind: 'stock' as const, id: 'TestPattern2D' },
      patternName: 'TestPattern2D',
      ...group,
    }
    expect(bundledPatternSliderNames(DEMOS.TestPattern2D, LIBRARIES)).toEqual(new Set())
    const controlledTrack = item.show.composition?.scenes.flatMap((scene) => scene.propertyTracks ?? [])
      .find((track) => track.id === 'track-pattern-control')
    if (!controlledTrack || controlledTrack.target.kind !== 'instance-control') {
      throw new Error('Expected instance-control track')
    }
    expect(group.instanceIds).toContain(controlledTrack.target.instanceId)
    const projected = applyShowPatternSlotSelections(
      item.show,
      item.patternSlots!,
      { 0: projection.pattern },
      (pattern) => pattern.id,
      (pattern) => bundledPatternSliderNames(DEMOS[pattern.id], LIBRARIES),
    )

    const projectedControlTracks = projected.composition?.scenes.flatMap((scene) => (
      (scene.propertyTracks ?? []).filter((track) => track.target.kind === 'instance-control')
    ))
    expect(projectedControlTracks).toEqual([])
    expect(item.show.composition?.scenes.flatMap((scene) => scene.propertyTracks ?? [])
      .some((track) => track.target.kind === 'instance-control')).toBe(true)

    const compiled = compileShowForArtifact(projected, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    expect(compiled.artifact).not.toBeNull()

    const edited = structuredClone(projected)
    edited.name = 'Edited while projected'
    const unrelatedTrack = edited.composition!.scenes.flatMap((scene) => scene.propertyTracks ?? [])
      .find((track) => track.id === 'track-animation-speed')!
    unrelatedTrack.keyframes[0].value = 0.21
    const restored = restoreShowReferencePatternSlots(edited, item.show, projection)
    expect(restored.name).toBe('Edited while projected')
    expect(restored.composition?.scenes.flatMap((scene) => scene.propertyTracks ?? [])
      .find((track) => track.id === 'track-animation-speed')?.keyframes[0].value).toBe(0.21)
    expect(restored.composition?.scenes.flatMap((scene) => scene.propertyTracks ?? [])
      .find((track) => track.id === 'track-pattern-control')).toEqual(
      item.show.composition?.scenes.flatMap((scene) => scene.propertyTracks ?? [])
        .find((track) => track.id === 'track-pattern-control'),
    )
  })

  it('compiles a Property Animation slot swap while keeping a shared control animation (#828)', () => {
    const item = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-property-animation')!
    const pattern = { kind: 'stock' as const, id: 'Caustics' }
    const authoredTrack = item.show.composition?.scenes.flatMap((scene) => scene.propertyTracks ?? [])
      .find((track) => track.id === 'track-pattern-control')
    if (!authoredTrack || authoredTrack.target.kind !== 'instance-control') {
      throw new Error('Expected instance-control track')
    }
    const authoredInstanceId = authoredTrack.target.instanceId
    const authoredTargets = item.show.composition?.patternInstances
      .find((instance) => instance.id === authoredInstanceId)?.controlTargets

    const projected = applyShowPatternSlotSelections(
      item.show,
      item.patternSlots!,
      { 0: pattern },
      (ref) => ref.id,
      (ref) => bundledPatternSliderNames(DEMOS[ref.id], LIBRARIES),
    )

    expect(projected.composition?.scenes.flatMap((scene) => scene.propertyTracks ?? [])
      .find((track) => track.id === 'track-pattern-control')).toEqual(authoredTrack)
    expect(projected.composition?.patternInstances
      .find((instance) => instance.id === authoredInstanceId)?.controlTargets)
      .toEqual(authoredTargets)
    const compiled = compileShowForArtifact(projected, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    expect(compiled.artifact).not.toBeNull()
  })

  it('opens the Zone rail by default only where Zones are the first-visit subject', () => {
    // 105 introduces Zones, so its rail starts open; every other lesson keeps
    // the collapsed default and the session store remembers the user's choice.
    for (const item of lessons()) {
      expect(item.zonesOpenByDefault ?? false, item.name)
        .toBe(item.id === 'stock-show-105-portable-zones')
    }
  })

  it('recombines 106 from 101-105 material and nothing newer', () => {
    const item = stockShowById('stock-show-106-built-from-basics')!
    const composition = item.show.composition!
    const [sky, ground] = composition.scenes[0].zones
    const placements = [...sky.main, ...ground.main]

    // Every junction is a different Transition family. The capstone's job is to
    // show that a Crossfade is one option among several, not the only one.
    // (Canonical record order, not junction order, since #823.)
    expect((composition.transitions ?? []).map((transition) => transition.kind))
      .toEqual(['dither', 'crossfade', 'portal'])
    expect(placements.filter((placement) => placement.effects?.length).length).toBe(1)
    expect(placements.filter((placement) => placement.transform !== undefined).length).toBe(1)
    expect(placements.every((placement) => placement.viewport === undefined)).toBe(true)
    expect(placements.every((placement) => placement.presentation === undefined)).toBe(true)
    // No Layers: overlays are 200-level material.
    expect(sky.overlays).toEqual([])
    expect(ground.overlays).toEqual([])

    // Every gap in this Show is owned by a Transition rather than left blank, so
    // a gap alone proves nothing: assert each one is exactly consumed. This is
    // what the capstone departs from 101 on, and the copy has to keep matching.
    const byId = new Map(placements.map((placement) => [placement.id, placement]))
    for (const transition of composition.transitions ?? []) {
      const from = byId.get(transition.fromPlacementId)!
      const to = byId.get(transition.toPlacementId)!
      expect(from.startMs + from.durationMs + transition.durationMs, transition.id).toBe(to.startMs)
    }
    const gaps = composition.scenes[0].zones.flatMap((zone) => {
      const ordered = [...zone.main].sort((a, b) => a.startMs - b.startMs)
      return ordered.slice(1).map((placement, index) => (
        placement.startMs - (ordered[index].startMs + ordered[index].durationMs)
      ))
    })
    expect(gaps.filter((gap) => gap > 0)).toHaveLength(composition.transitions!.length)
    expect(composition.durationMs).toBe(30_000)

    // No instance is placed in two Zones at once: each Zone owns its material,
    // which is also what keeps the compiled artifact affordable.
    const skyInstances = new Set(sky.main.map((placement) => placement.instanceId))
    const groundInstances = new Set(ground.main.map((placement) => placement.instanceId))
    expect([...skyInstances].filter((id) => groundInstances.has(id)), 'no instance spans both Zones')
      .toEqual([])
  })

  it('lands 106 on a shared release that reaches black and holds it', () => {
    // The ending is the point of the Show: both Zones dim on the same schedule,
    // all the way to zero rather than to a residual glow, and the last two
    // seconds are held black so the Show reads as finished rather than cut off.
    const item = stockShowById('stock-show-106-built-from-basics')!
    const composition = item.show.composition!
    const tracks = composition.scenes[0].propertyTracks ?? []
    const releases = tracks.filter((track) => track.id.endsWith('-release'))

    expect(releases.map((track) => track.id)).toEqual(['track-ground-release', 'track-sky-release'])
    for (const track of releases) {
      expect(track.keyframes.map((frame) => [frame.timeMs, frame.value]), track.id)
        .toEqual([[24_000, 1], [28_000, 0], [30_000, 0]])
    }
    // Each release owns the closing Clip of its own Zone.
    expect(releases.map((track) => (track.target as { placementId: string }).placementId))
      .toEqual(['clip-ground-return', 'clip-sky-reprise'])
    for (const zone of composition.scenes[0].zones) {
      const ordered = [...zone.main].sort((a, b) => a.startMs - b.startMs)
      const last = ordered[ordered.length - 1]
      expect(last.startMs + last.durationMs, `${zone.zoneId} plays to Show End`).toBe(30_000)
    }

    // The Ground keeps moving into the dark: rotation accelerates out of the
    // Dissolve instead of holding a pose.
    const spin = tracks.find((track) => track.id === 'track-ground-spin')!
    expect(spin.target).toEqual({
      kind: 'placement-transform', placementId: 'clip-ground-return', property: 'rotation',
    })
    expect(spin.keyframes[0]).toMatchObject({ timeMs: 15_000, value: 0, easing: { curve: 'quadratic', direction: 'in' } })
    const finalSpin = spin.keyframes[spin.keyframes.length - 1]
    expect(finalSpin).toMatchObject({ timeMs: 30_000 })
    expect(finalSpin.value).toBeGreaterThan(1)
  })

  // Learn 200: one governing idea per lesson, verified both structurally and
  // by time-sampled output through the production compile + replay path.
  const lessonReplay = (id: string) => {
    const item = stockShowById(id)!
    const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error, item.name).toBeNull()
    const mapPoints = SOURCE_STOCK_MAPS.find((map) => map.id === 'plane')!.resolve(1_936)
    const runtime = createFastReplayRuntime({
      code: compiled.artifact!.code,
      fxCode: compiled.artifact!.fxCode,
      metadata: compiled.artifact!.metadata,
      dimension: nativeDimension(compiled.artifact!.metadata.renderFns),
    }, { mapPoints, randomSeed: 363, fidelity: 'fast' })
    // Frames must be sampled in ascending time order.
    const frameAt = (timeMs: number) => runtime.advanceTo(timeMs, { stepMs: 100 }).pixels.map((px) => [...px])
    return { item, mapPoints, frameAt }
  }
  const luma = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  const meanLuma = (frame: number[][]) => frame.reduce((sum, px) => sum + luma(px), 0) / frame.length
  const frameDiff = (a: number[][], b: number[][]) => a.reduce((sum, px, i) => (
    sum + Math.abs(px[0] - b[i][0]) + Math.abs(px[1] - b[i][1]) + Math.abs(px[2] - b[i][2])
  ), 0) / a.length

  it('drives the whole 201 overlay entrance through one Opacity curve', () => {
    const item = stockShowById('stock-show-201-layers-property-animation')!
    const composition = item.show.composition!
    const zone = composition.scenes[0].zones[0]

    // One continuous Main Clip owns the bed; the swarm lives on an overlay
    // Layer whose placement starts at rest opacity zero. (Overlay recast to
    // ZRanger1's TimeFlies2D, #727: 93% dark vs GlyphRain's 91%, and the
    // measured dip/recovery arc is unchanged.)
    expect(zone.main).toHaveLength(1)
    expect(zone.main[0]).toMatchObject({ instanceId: 'water', startMs: 0, durationMs: 14_000 })
    expect(zone.overlays).toHaveLength(1)
    expect(zone.overlays[0].placements).toHaveLength(1)
    expect(zone.overlays[0].placements[0]).toMatchObject({ instanceId: 'flies', opacity: 0 })

    const tracks = composition.scenes[0].propertyTracks ?? []
    expect(tracks).toHaveLength(1)
    expect(tracks[0].target).toEqual({ kind: 'placement-opacity', placementId: 'clip-flies' })
    expect(tracks[0].keyframes.map((frame) => [frame.timeMs, frame.value])).toEqual([
      [2_000, 0], [4_000, 0.65], [9_000, 0.65], [12_000, 0],
    ])
    // Nothing else competes: no Transitions, Effects, or Transform changes.
    expect(composition.transitions ?? []).toEqual([])
    expect(zone.main[0].effects ?? []).toEqual([])
    expect(zone.overlays[0].placements[0].effects ?? []).toEqual([])
  })

  it('shows the 201 overlay arriving and leaving in sampled output', () => {
    const { frameAt } = lessonReplay('stock-show-201-layers-property-animation')
    const before = frameAt(1_500)
    const during = frameAt(6_500)
    const after = frameAt(13_200)

    // Opacity is a mix: the mostly-black rain measurably recedes the water at
    // the hold, and the bed's own luminance returns once the curve lands.
    expect(meanLuma(during)).toBeLessThan(meanLuma(before) * 0.7)
    expect(meanLuma(after)).toBeGreaterThan(meanLuma(during) * 1.4)
  })

  it('changes exactly one thing per 202 Clip: crop, frame motion, then Content motion', () => {
    const item = stockShowById('stock-show-202-content-clip-viewport')!
    const composition = item.show.composition!
    const zone = composition.scenes[0].zones[0]
    const subjects = zone.overlays[0].placements

    // The dim bed is the lower Layer that makes uncovered pixels legible.
    expect(zone.main[0].view.brightness).toBeLessThan(0.5)
    // Full rose, corner crop, frame glide to center, then Content pan.
    expect(subjects.map((placementItem) => placementItem.id))
      .toEqual(['clip-full', 'clip-frame', 'clip-frame-move', 'clip-content-pan'])
    expect(subjects[0].viewport).toBeUndefined()
    // Width and height only: x and y stay zero, so the crop lands in the corner.
    expect(subjects[1].viewport).toMatchObject({ enabled: true, x: 0, y: 0, width: 0.5, height: 0.5 })
    expect(subjects[2].viewport).toMatchObject({ enabled: true, x: 0, y: 0 })
    // The final frame rests where the glide ends, so the junction is seamless.
    expect(subjects[3].viewport).toMatchObject({ enabled: true, x: 0.25, y: 0.25 })
    // One instance serves all four Clips: the subject never restarts.
    expect(new Set(subjects.map((placementItem) => placementItem.instanceId)).size).toBe(1)

    const tracks = composition.scenes[0].propertyTracks ?? []
    // Canonical track order since #823: the Content pan leads, then the four
    // viewport ramps.
    expect(tracks.map((track) => track.target.kind)).toEqual([
      'placement-transform',
      'placement-viewport', 'placement-viewport',
      'placement-viewport', 'placement-viewport',
    ])
    // The crop animates in: width and height shrink from the full Stage.
    // (Canonical order is by track id: content-pan, frame-height,
    // frame-move-x, frame-move-y, frame-width.)
    expect(tracks[0].target).toMatchObject({ placementId: 'clip-content-pan', property: 'positionX' })
    expect(tracks[1].target).toMatchObject({ placementId: 'clip-frame', property: 'height' })
    expect(tracks[2].target).toMatchObject({ placementId: 'clip-frame-move', property: 'x' })
    expect(tracks[3].target).toMatchObject({ placementId: 'clip-frame-move', property: 'y' })
    expect(tracks[4].target).toMatchObject({ placementId: 'clip-frame', property: 'width' })
    // Every animation starts from the value the previous Clip established -
    // full-Stage frame, corner position, neutral Content - so each junction
    // is seamless.
    expect(tracks[0].keyframes[0].value).toBe(0)
    expect(tracks[1].keyframes[0].value).toBe(1)
    expect(tracks[2].keyframes[0].value).toBe(0)
    expect(tracks[3].keyframes[0].value).toBe(0)
    expect(tracks[4].keyframes[0].value).toBe(1)
  })

  // Heavy lesson replay; loaded machines have pushed it past the 5s default
  // (pre-push flake, #672).
  it('keeps the 202 frame brighter than the uncovered bed in sampled output', { timeout: 30_000 }, () => {
    const { mapPoints, frameAt } = lessonReplay('stock-show-202-content-clip-viewport')
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    const lumaWhere = (frame: number[][], inRegion: (x: number, y: number) => boolean) => average(
      mapPoints.flatMap((point, index) => (inRegion(point.sample[0], point.sample[1]) ? [luma(frame[index])] : [])),
    )
    // t=2 vs t=6: the crop removes the picture outside the half-size corner
    // frame, so that region falls to the dim bed. (Harmonograph is
    // center-weighted, so the framed corner itself carries little light -
    // the crop is proven by what disappears, not by corner brightness.)
    const full = frameAt(2_000)
    const cornered = frameAt(6_000)
    const outsideFrame = (x: number, y: number) => x > 0.55 || y > 0.55
    expect(lumaWhere(cornered, outsideFrame)).toBeLessThan(lumaWhere(full, outsideFrame) * 0.75)
    // t=14: the frame holds the center while Content pans behind it.
    const centered = frameAt(14_000)
    expect(lumaWhere(centered, (x, y) => x > 0.3 && x < 0.7 && y > 0.3 && y < 0.7))
      .toBeGreaterThan(lumaWhere(centered, (x, y) => x < 0.2 || x > 0.8 || y < 0.2 || y > 0.8) * 1.3)
  })

  it('proves 203 instance sharing, restart, and resume in sampled output', () => {
    const item = stockShowById('stock-show-203-pattern-instance-lifecycle')!
    const composition = item.show.composition!
    const main = [...composition.scenes[0].zones[0].main].sort((a, b) => a.startMs - b.startMs)

    // Clip identity and instance identity are separate facts: four Clips,
    // two instances, and the shared one serves the first, second, and last.
    expect(composition.patternInstances.map((instance) => instance.patternName))
      .toEqual(['IQPalettes', 'IQPalettes'])
    expect(main.map((placementItem) => placementItem.instanceId))
      .toEqual(['palette-shared', 'palette-shared', 'palette-fresh', 'palette-shared'])
    expect(main.map((placementItem) => [placementItem.startMs, placementItem.durationMs]))
      .toEqual([[0, 4_000], [4_000, 4_000], [8_000, 4_000], [12_000, 4_000]])

    const { frameAt } = lessonReplay('stock-show-203-pattern-instance-lifecycle')
    const early = frameAt(500)
    const beforeCut = frameAt(3_500)
    const afterCut = frameAt(4_500)
    const beforeFresh = frameAt(7_500)
    const afterFresh = frameAt(8_500)
    const beforeRejoin = frameAt(11_500)
    const rejoined = frameAt(12_500)

    // The Cut changes nothing: both sides share one instance.
    expect(frameDiff(beforeCut, afterCut)).toBeLessThan(frameDiff(early, beforeCut))
    // The fresh instance restarts: its first moments replay the opening.
    expect(frameDiff(afterFresh, early)).toBeLessThan(0.02)
    expect(frameDiff(afterFresh, beforeFresh)).toBeGreaterThan(0.05)
    // Rejoining resumes the paused shared state, not the wall clock.
    expect(frameDiff(rejoined, beforeFresh)).toBeLessThan(frameDiff(rejoined, beforeRejoin))
  })

  it('makes each 204 presentation recognizable in sampled output', () => {
    const item = stockShowById('stock-show-204-presentation-modes')!
    const composition = item.show.composition!
    const main = [...composition.scenes[0].zones[0].main].sort((a, b) => a.startMs - b.startMs)

    expect(main.map((placementItem) => [
      placementItem.id,
      placementItem.presentation?.mode ?? (placementItem.blink ? 'blink' : 'live'),
    ])).toEqual([
      ['clip-live', 'live'],
      ['clip-freeze', 'freeze'],
      ['clip-strobe', 'strobe'],
      ['clip-blink', 'blink'],
      ['clip-stutter', 'live'],
    ])
    // Stutter is instance-owned: only the dedicated instance steps its clock.
    const stuttered = composition.patternInstances.find((instance) => instance.id === 'palette-stuttered')!
    expect(stuttered.time.steppedClock).toEqual({ stepMs: 500 })
    expect(composition.patternInstances.find((instance) => instance.id === 'palette')!.time.steppedClock)
      .toBeUndefined()

    const { frameAt } = lessonReplay('stock-show-204-presentation-modes')
    const liveA = frameAt(1_000)
    const liveB = frameAt(2_000)
    const freezeA = frameAt(3_600)
    const freezeB = frameAt(5_400)
    // Late-window samples: the refresh carries a short settle transient
    // (measured), so hold is asserted well inside one beat and the refresh
    // across windows.
    const strobeA = frameAt(6_600)
    const strobeB = frameAt(6_700)
    const strobeC = frameAt(7_100)
    const blinkOn = frameAt(9_200)
    const blinkOff = frameAt(9_700)
    const stutterA = frameAt(12_100)
    const stutterB = frameAt(12_400)
    const stutterC = frameAt(12_800)

    expect(frameDiff(liveA, liveB)).toBeGreaterThan(0.02)
    expect(frameDiff(freezeA, freezeB)).toBeLessThan(0.001)
    // Strobe holds within a beat and refreshes across one.
    expect(frameDiff(strobeA, strobeB)).toBeLessThan(0.001)
    expect(frameDiff(strobeA, strobeC)).toBeGreaterThan(0.005)
    // Blink gates visibility to black while time continues underneath.
    expect(meanLuma(blinkOff)).toBeLessThan(0.001)
    expect(meanLuma(blinkOn)).toBeGreaterThan(0.05)
    // Stutter holds within a step and snaps across one, with finite pixels
    // from the first window on.
    expect(stutterA.every((px) => px.every((channel) => Number.isFinite(channel)))).toBe(true)
    expect(frameDiff(stutterA, stutterB)).toBeLessThan(0.001)
    expect(frameDiff(stutterB, stutterC)).toBeGreaterThan(0.005)
  })

  it('links both 205 occurrences to one definition with fresh instances', () => {
    const item = stockShowById('stock-show-205-groups-linked-reuse')!
    const composition = item.show.composition!

    expect(composition.groupDefinitions).toHaveLength(1)
    const definition = composition.groupDefinitions![0]
    // A compact multi-Layer phrase: two placements on different Layer
    // offsets, each brought in and out by its own Opacity curve.
    expect(definition.placements.map((placementItem) => placementItem.layerOffset)).toEqual([0, 1])
    expect(definition.propertyTracks?.map((track) => track.target.kind))
      .toEqual(['placement-opacity', 'placement-opacity'])
    expect(composition.groupOccurrences!.map((occurrence) => [occurrence.definitionId, occurrence.startMs]))
      .toEqual([['group-pulse', 2_000], ['group-pulse', 9_000]])
    // The linked duplicate is translated so reuse reads as a second
    // performance rather than a replay of the same pixels.
    const second = composition.groupOccurrences![1]
    expect(Math.abs(second.translationX) + Math.abs(second.translationY)).toBeGreaterThan(0)

    // Each occurrence materializes occurrence-local Pattern instances.
    const materialized = materializeShowGroupOccurrences(composition)
    const pulseInstances = materialized.patternInstances
      .filter((instance) => instance.patternName === 'SignalMandala')
    expect(pulseInstances).toHaveLength(2)
    expect(new Set(pulseInstances.map((instance) => instance.id)).size).toBe(2)
    expect(validateShowComposition(item.show, composition)).toEqual([])
  })

  it('performs the 205 phrase at both occurrence times in sampled output', () => {
    const { frameAt } = lessonReplay('stock-show-205-groups-linked-reuse')
    const firstPulse = frameAt(3_500)
    const betweenPulses = frameAt(7_500)
    const secondPulse = frameAt(10_500)

    expect(frameDiff(firstPulse, betweenPulses)).toBeGreaterThan(0.03)
    expect(frameDiff(secondPulse, betweenPulses)).toBeGreaterThan(0.03)
  })

  it('restates 206 topology across three named Layout intervals', () => {
    const item = stockShowById('stock-show-206-changing-zone-layouts')!

    expect(item.show.zones.map((zone) => zone.name)).toEqual(['Weave', 'Water'])
    expect(item.show.routingLayouts.map((layout) => [layout.name, layout.logical?.kind]))
      .toEqual([['Full Surface', 'single'], ['Moving Split', 'split'], ['Rings', 'rings']])
    // One swept restatement, one atomic one - and no blending Transition
    // anywhere, so topology change stays distinct from blending. The
    // zero-duration Cuts are the materialized canonical boundary records
    // (#823), not a visual treatment.
    expect(item.show.transitions.map((transition) => [transition.kind, transition.durationMs, transition.layoutId]))
      .toEqual([
        ['cut', 0, undefined],
        ['routing', 1_500, 'layout-split'],
        ['cut', 0, undefined],
        ['routing', 0, 'layout-rings'],
      ])
    expect(item.show.transitions[1].routingDirection).toBe('forward')

    // The loom instance continues through every interval; the water joins at
    // the split and stays. Neither ever restarts at a Layout boundary.
    const composition = item.show.composition!
    const instancesByScene = composition.scenes.map((sceneItem) => (
      sceneItem.zones.flatMap((zone) => zone.main.map((placementItem) => placementItem.instanceId))
    ))
    expect(instancesByScene).toEqual([
      ['loom'],
      ['loom', 'water'],
      ['loom', 'water'],
    ])
  })

  it('routes 206 output differently in each Layout interval', () => {
    const { mapPoints, frameAt } = lessonReplay('stock-show-206-changing-zone-layouts')
    const sideContrast = (frame: number[][]) => {
      const left: number[] = []
      const right: number[] = []
      mapPoints.forEach((point, index) => {
        const [x, y] = point.sample
        if (y > 0.4 && y < 0.6) {
          if (x < 0.3) left.push(luma(frame[index]))
          if (x > 0.7) right.push(luma(frame[index]))
        }
      })
      const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
      return Math.abs(average(left) - average(right))
    }
    const radialContrast = (frame: number[][]) => {
      const center: number[] = []
      const edge: number[] = []
      mapPoints.forEach((point, index) => {
        const [x, y] = point.sample
        const radial = Math.hypot(x - 0.5, y - 0.5)
        if (radial < 0.2) center.push(luma(frame[index]))
        if (radial > 0.45) edge.push(luma(frame[index]))
      })
      const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
      return Math.abs(average(center) - average(edge))
    }

    const full = frameAt(2_000)
    const split = frameAt(9_000)
    const rings = frameAt(15_000)
    // Full surface reads as one material; the split puts two materials side
    // by side; rings swaps the contrast to center-versus-edge.
    expect(sideContrast(split)).toBeGreaterThan(sideContrast(full) * 2)
    expect(radialContrast(rings)).toBeGreaterThan(0.05)
    expect(meanLuma(full)).toBeGreaterThan(0.02)
    expect(meanLuma(split)).toBeGreaterThan(0.02)
    expect(meanLuma(rings)).toBeGreaterThan(0.02)
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

  const ZONE_LAYOUT_SHOWCASE_IDS = [
    'stock-show-showcase-zone-layouts-splits',
    'stock-show-showcase-zone-layouts-stripes-grid',
    'stock-show-showcase-zone-layouts-radial',
  ]

  it('covers every logical Zone Layout kind across the Zone Layout showcase trio (#700)', () => {
    const trio = ZONE_LAYOUT_SHOWCASE_IDS.map((id) => stockShowById(id)!)

    // The trio, not any single Show, holds the complete geometry
    // vocabulary: the measured single-Show matrix compiled to 259 KB
    // against the 68 KB activation ceiling, the same wall that split the
    // Shape Reveals references (#514).
    expect(trio.map((item) => item.show.routingLayouts.map((layout) => layout.logical?.kind))).toEqual([
      ['single', 'split', 'soft-split', 'checker'],
      ['single', 'stripes', 'grid'],
      ['single', 'rings', 'wave', 'pinwheel'],
    ])
    for (const item of trio) {
      for (const layout of item.show.routingLayouts) {
        expect(validateShowLogicalRouting(layout.logical!), `${item.name}: ${layout.name}`).toEqual([])
      }
      expect(item.show.scenes, item.name).toHaveLength(item.show.routingLayouts.length)

      // Every boundary is a routing switch; every voice is placed in every
      // passage - including passages whose Layout routes it no pixels, so
      // its clock keeps running and the first partition reveals mid-motion
      // state rather than a restart (review P2); and a Zone never changes
      // instance. Every boundary therefore re-deals geometry without
      // touching Pattern state. Each boundary also carries a materialized
      // zero-duration Cut record (#823) - the canonical default, not a
      // visual treatment.
      const routingSwitches = item.show.transitions.filter((transition) => transition.kind === 'routing')
      const boundaryCuts = item.show.transitions.filter((transition) => transition.kind === 'cut')
      expect(routingSwitches, item.name).toHaveLength(item.show.scenes.length - 1)
      expect(boundaryCuts, item.name).toHaveLength(item.show.scenes.length - 1)
      expect(boundaryCuts.every((transition) => transition.durationMs === 0), item.name).toBe(true)
      expect(item.show.transitions, item.name).toHaveLength(routingSwitches.length + boundaryCuts.length)
      const composition = item.show.composition!
      const zoneIds = item.show.zones.map((zone) => zone.id)
      const instancesByZone = new Map<string, Set<string>>()
      for (const [index, sceneComposition] of composition.scenes.entries()) {
        const routedZoneIds = item.show.routingLayouts[index].logical!.zoneIds
        const placedZoneIds = sceneComposition.zones
          .filter((zone) => zone.main.length > 0)
          .map((zone) => zone.zoneId)
        expect(placedZoneIds, `${item.name}: ${sceneComposition.sceneId}`).toEqual(zoneIds)
        expect(routedZoneIds.every((zoneId) => placedZoneIds.includes(zoneId)), `${item.name}: ${sceneComposition.sceneId}`).toBe(true)
        for (const zone of sceneComposition.zones) {
          for (const entry of zone.main) {
            const seen = instancesByZone.get(zone.zoneId) ?? new Set<string>()
            seen.add(entry.instanceId)
            instancesByZone.set(zone.zoneId, seen)
          }
        }
      }
      expect([...instancesByZone.values()].every((seen) => seen.size === 1), item.name).toBe(true)

      // The reference guide walks the timeline: one example per passage.
      expect(
        item.reference!.examples.map((example) => (example.anchor as { sceneId: string }).sceneId),
        item.name,
      ).toEqual(item.show.scenes.map((sceneItem) => sceneItem.id))
    }

    // The single travelling switch lives in the Radial sibling's entry into
    // rings; every other boundary in the family is atomic.
    const sweeps = trio.flatMap((item) => item.show.transitions.filter((transition) => transition.durationMs > 0))
    expect(sweeps.map((transition) => transition.layoutId)).toEqual(['layout-rings'])
    expect(sweeps[0].routingDirection).toBe('forward')

    // Shared casting: the hero pair opens every sibling, and only the
    // four-voice sibling extends it. (Canonical instance order since #823:
    // ember, garden, rain, tide.)
    expect(trio.map((item) => item.show.composition!.patternInstances.map((instance) => instance.patternName)))
      .toEqual([
        ['IQPalettes', 'MetaballGarden'],
        ['IQPalettes', 'MetaballGarden', 'GlyphRain', 'Caustics'],
        ['IQPalettes', 'MetaballGarden'],
      ])
  })

  it('keeps each Zone Layout showcase inside the activation ceiling with edit headroom (#700)', () => {
    // The reason the vocabulary is a trio: routing render plans price every
    // (Layout, routed Zone) slot, and the notes' prompts invite structural
    // session edits (adding Zones), so each sibling must leave real room.
    for (const id of ZONE_LAYOUT_SHOWCASE_IDS) {
      const item = stockShowById(id)!
      const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
      expect(compiled.error, item.name).toBeNull()
      const summary = compiled.artifact!.summary
      const ratio = summary.artifactBytes / summary.measuredDeviceBudgetBytes
      expect(ratio, `${item.name} uses ${(ratio * 100).toFixed(1)}% of the device budget`).toBeLessThan(0.7)
    }
  })

  it('re-deals the Zone Layout showcase Stages measurably at representative passages (#700)', () => {
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
    const regionLuma = (mapPoints: { sample: number[] }[]) => (frame: number[][], inRegion: (x: number, y: number) => boolean) => average(
      mapPoints.flatMap((point, index) => (inRegion(point.sample[0], point.sample[1]) ? [luma(frame[index])] : [])),
    )

    {
      // Splits & Checker: full 0-4, moving split 4-9, soft split 9-13,
      // checker 13-18.
      const { mapPoints, frameAt } = lessonReplay('stock-show-showcase-zone-layouts-splits')
      const lumaWhere = regionLuma(mapPoints)
      const sideContrast = (frame: number[][]) => Math.abs(
        lumaWhere(frame, (x, y) => x < 0.3 && y > 0.4 && y < 0.6)
        - lumaWhere(frame, (x, y) => x > 0.7 && y > 0.4 && y < 0.6),
      )
      const full = frameAt(2_000)
      const split = frameAt(6_500)
      expect(sideContrast(split)).toBeGreaterThan(sideContrast(full) * 2)
      expect(meanLuma(full)).toBeGreaterThan(0.02)
      expect(meanLuma(split)).toBeGreaterThan(0.02)

      // Differential proof that the opener's unrouted Ember placement is
      // load-bearing (review P2): with it dropped, Ember's first routed
      // frames land elsewhere in its drift, because presentation - routed
      // or not - is what runs an instance clock. The Garden half stays
      // (nearly) identical, so the difference is attributable to Ember.
      const item = stockShowById('stock-show-showcase-zone-layouts-splits')!
      const stripped = structuredClone(item.show)
      stripped.composition!.scenes[0].zones = stripped.composition!.scenes[0].zones
        .map((zone, index) => (index === 0 ? zone : { ...zone, main: [] }))
      const compiledStripped = compileShowForArtifact(stripped, [], undefined, {}, { stageDimension: 2 })
      expect(compiledStripped.error).toBeNull()
      const strippedRuntime = createFastReplayRuntime({
        code: compiledStripped.artifact!.code,
        fxCode: compiledStripped.artifact!.fxCode,
        metadata: compiledStripped.artifact!.metadata,
        dimension: nativeDimension(compiledStripped.artifact!.metadata.renderFns),
      }, { mapPoints, randomSeed: 363, fidelity: 'fast' })
      const strippedSplit = strippedRuntime.advanceTo(6_500, { stepMs: 100 }).pixels.map((px) => [...px])
      const halfDiff = (inHalf: (x: number) => boolean) => {
        const indices = mapPoints.flatMap((point, index) => (inHalf(point.sample[0]) ? [index] : []))
        return indices.reduce((sum, index) => (
          sum
          + Math.abs(split[index][0] - strippedSplit[index][0])
          + Math.abs(split[index][1] - strippedSplit[index][1])
          + Math.abs(split[index][2] - strippedSplit[index][2])
        ), 0) / indices.length
      }
      const emberDiff = halfDiff((x) => x > 0.55)
      expect(emberDiff).toBeGreaterThan(0.02)
      expect(halfDiff((x) => x < 0.45)).toBeLessThan(emberDiff)
    }
    {
      // Stripes & Grid: full 0-4, stripes 4-9, grid 9-15. The Rain cell
      // (x > 0.5, y > 0.5) is the negative-space voice: GlyphRain leaves
      // 82% of its field dark, so its quadrant sits well below each lit
      // neighbour.
      const { mapPoints, frameAt } = lessonReplay('stock-show-showcase-zone-layouts-stripes-grid')
      const lumaWhere = regionLuma(mapPoints)
      const grid = frameAt(12_000)
      const quadrant = (right: boolean, low: boolean) => lumaWhere(grid, (x, y) => (
        (right ? x > 0.55 : x < 0.45) && (low ? y > 0.55 : y < 0.45)
      ))
      const rain = quadrant(true, true)
      expect(rain).toBeLessThan(quadrant(false, false) * 0.7)
      expect(rain).toBeLessThan(quadrant(true, false) * 0.7)
      expect(rain).toBeLessThan(quadrant(false, true) * 0.7)
      expect(meanLuma(grid)).toBeGreaterThan(0.02)
    }
    {
      // Radial: full 0-4, rings 4-9 (swept entry to 5.5), wave 9-13,
      // pinwheel 13-19.
      const { mapPoints, frameAt } = lessonReplay('stock-show-showcase-zone-layouts-radial')
      const lumaWhere = regionLuma(mapPoints)
      const radialContrast = (frame: number[][]) => Math.abs(
        lumaWhere(frame, (x, y) => Math.hypot(x - 0.5, y - 0.5) < 0.15)
        - lumaWhere(frame, (x, y) => Math.hypot(x - 0.5, y - 0.5) > 0.45),
      )
      // No full-versus-rings comparison: MetaballGarden alone is already
      // center-weighted (measured radial contrast 0.47 on the full
      // surface), so the meaningful oracle is the 206-style absolute
      // center-versus-edge contrast inside the rings interval.
      const full = frameAt(2_000)
      const rings = frameAt(7_500)
      expect(radialContrast(rings)).toBeGreaterThan(0.05)
      expect(meanLuma(full)).toBeGreaterThan(0.02)
      expect(meanLuma(rings)).toBeGreaterThan(0.02)
    }
  })

  it('covers every Effect kind across the four Effect showcases', () => {
    // The Compositing and Key reference carries its Effects on overlay
    // placements (they only mean something over a lower Layer), so the
    // census reads cells and composition placements alike. The repartition
    // extends coverage from 19 kinds to all 22, adding luma-key, chroma-key,
    // and vignette.
    const kinds = STOCK_SHOWS
      .filter((item) => item.id.startsWith('stock-show-showcase-'))
      .flatMap((item) => [
        ...item.show.cells.flatMap((cell) => cell.effects?.map((effect) => effect.kind) ?? []),
        ...(item.show.composition?.scenes ?? []).flatMap((scene) => scene.zones.flatMap((zone) => [
          ...zone.main.flatMap((entry) => entry.effects?.map((effect) => effect.kind) ?? []),
          ...zone.overlays.flatMap((layer) => layer.placements.flatMap((entry) => entry.effects?.map((effect) => effect.kind) ?? [])),
        ])),
      ])

    expect([...new Set(kinds)].sort()).toEqual([
      'brightness', 'bulge', 'chroma-key', 'color-map', 'contrast', 'hue', 'invert', 'kaleidoscope',
      'luma-key', 'opacity', 'pixelate', 'posterize', 'ripple', 'rotate', 'saturation', 'scale',
      'shear', 'swirl', 'threshold', 'translate', 'vignette', 'wrap',
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
    // The glides live on destination-span placement-effect Property tracks
    // (#823): each junction is an explicit Cut and the affine parameters
    // ramp, eased, over the first second of the arriving span.
    expect(affineTransitions.every((transition) => transition.kind === 'cut')).toBe(true)
    const affineScenes = item.show.composition!.scenes.slice(1, 5)
    expect(affineScenes.every((scene) => (scene.propertyTracks ?? [])
      .some((track) => track.target.kind === 'placement-effect'))).toBe(true)
    const affineTracks = item.show.composition!.scenes.flatMap((scene) => (scene.propertyTracks ?? [])
      .filter((track) => track.target.kind === 'placement-effect'))
    expect(affineTracks.every((track) => (
      track.keyframes[0].timeMs === 0
      && track.keyframes[track.keyframes.length - 1].timeMs === 1_000
      && track.keyframes.every((frame) => frame.easing !== undefined)
    ))).toBe(true)

    const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.artifact?.summary.cost.cpu.patternEvaluations).toMatchObject({ formula: 'N', basePerPixel: 1 })
    // The cost ledger's animatedParametersPerFrame counts transition-driven
    // parameter animation only, so the track-driven glides read 0 there
    // (#823); the affine stack itself still prices per frame, and track
    // liveness is proven by differential replay during the re-pin.
    expect(compiled.artifact?.summary.cost.cpu.effects.affineOperationsPerFrame).toBe(4)
    expect(compiled.artifact?.summary.worstInstantRenderersPerPixel).toBe(1)
  })

  // The Portable Shows collection ships finished pieces scored over community
  // Patterns. The CME remix is the teaser gesture from
  // scripts/promo/cme-teaser.ts, promoted to a built-in (#704).
  describe('Coronal Mass Ejection remix (#704)', () => {
    const remix = () => stockShowById('stock-show-remix-coronal-mass-ejection')!

    it('ships the teaser gesture: one held CME instance over a 40s deterministic loop', () => {
      const item = remix()
      expect(item.track).toBe('portable')
      expect(item.note.label).toBe('Portable Shows')
      expect([item.note.purpose, item.note.notice].join(' ')).toContain('ZRanger1')
      const show = item.show
      expect(show.name).toBe('Coronal Mass Ejection Remix')
      expect(show.cells).toHaveLength(1)
      expect(show.cells[0]).toMatchObject({
        sceneSpan: 2,
        pattern: { kind: 'stock', id: 'CoronalMassEjection' },
        adaptations: { timeScale: 0.5, timeOffsetMs: 2_450 },
        restartOnEntry: false,
      })
      expect(show.scenes.map((entry) => entry.durationMs)).toEqual([8_000, 32_000])
      expect(show.outputContract).toMatchObject({
        kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 1_936,
      })
      const composition = show.composition!
      expect(composition.executionModel).toBe('deterministic-loop')
      expect(composition.durationMs).toBe(40_000)
      expect(composition.markers?.map((marker) => marker.timeMs))
        .toEqual([0, 8_000, 12_000, 24_000, 28_000, 32_000, 35_000, 36_000])
      expect(composition.patternInstances).toHaveLength(1)
      expect(composition.patternInstances[0].time).toEqual({ timeScale: 0.5, timeOffsetMs: 2_450 })
      expect(validateShowComposition(show, composition)).toEqual([])
    })

    it('scores the gesture on four Property targets and lands every crescendo pulse on a beat', () => {
      const composition = remix().show.composition!
      expect(composition.scenes[0].propertyTracks ?? []).toEqual([])
      const tracks = composition.scenes[1].propertyTracks ?? []
      // Normalization orders tracks by id, matching the saved teaser record.
      expect(tracks.map((track) => [track.id, track.target.kind])).toEqual([
        ['track-brightness', 'placement-view'],
        ['track-rotation', 'placement-transform'],
        ['track-scaleX', 'placement-transform'],
        ['track-scaleY', 'placement-transform'],
        ['track-speed', 'instance-time-scale'],
      ])
      const byId = Object.fromEntries(tracks.map((track) => [track.id, track]))
      // Speed: half-speed intro, cubic build to 1.75x, dead stop on the Stop marker.
      expect(byId['track-speed'].keyframes.map((frame) => [frame.timeMs, frame.value])).toEqual([
        [0, 0.5], [4_000, 0.5], [16_000, 1.75], [20_000, 1.75], [24_000, 0],
      ])
      // Rotation: 1.25 signed turns with continuous angular velocity at each join.
      expect(byId['track-rotation'].keyframes.map((frame) => [frame.timeMs, frame.value])).toEqual([
        [0, 0], [16_000, 0.75], [20_000, 1.125], [24_000, 1.25],
      ])
      // Push-in past sqrt(2) stays ahead of the spin's corner exposure.
      for (const axis of ['track-scaleX', 'track-scaleY'] as const) {
        expect(byId[axis].keyframes.map((frame) => [frame.timeMs, frame.value]))
          .toEqual([[0, 1], [4_000, 1.45]])
      }
      // Brightness: on-beat valleys deepen through the crescendo (times are
      // relative to the 32s Gesture span), then stillness, then black.
      const brightness = byId['track-brightness'].keyframes
      for (const [atMs, depth] of [
        [16_000, 0.05], [17_000, 0.05], [18_000, 0.05], [19_000, 0.05], [20_000, 0.05],
        [21_000, 0.15], [22_200, 0.3], [23_500, 0.5],
      ]) {
        expect(brightness.find((frame) => frame.timeMs === atMs)?.value, `pulse at ${atMs}`).toBe(depth)
      }
      expect(brightness[brightness.length - 1]).toMatchObject({ timeMs: 28_000, value: 0 })
    })

    it('accelerates, pulses, and lands on black in sampled output', { timeout: 30_000 }, () => {
      const { frameAt } = lessonReplay('stock-show-remix-coronal-mass-ejection')
      const intro = frameAt(4_000)
      expect(meanLuma(intro)).toBeGreaterThan(0.005)
      // First crescendo pulse: absolute 24.0-24.15s holds brightness 0.05.
      const beforePulse = frameAt(23_000)
      const pulseValley = frameAt(24_100)
      expect(meanLuma(pulseValley)).toBeLessThan(meanLuma(beforePulse) * 0.4)
      // The fade lands at zero at 36s and the loop tail stays black.
      expect(meanLuma(frameAt(38_000))).toBeLessThanOrEqual(0.001)
    })
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
        // 301's physical stage is exempt from the 0.7 legibility pin: its
        // halfway trade stays legible because the ranges never move, and the
        // hand-tuned speeds (#835) keep the calm casting visibly alive. The
        // instance clamp still bounds it.
        const ceiling = item.id === 'stock-show-301-installation-mapping' ? 4 : 0.7
        expect(cell.adaptations.timeScale, `${item.name}: ${cell.patternName}`).toBeLessThanOrEqual(ceiling)
      }
    }
  })

  it('uses one high-density square Stage across the portable curriculum', () => {
    // Every portable lesson renders on the same 44x44 square, so a learner
    // comparing two lessons is comparing choreography, not resolution. The
    // 300 level renders on its own measured output, and its Zone counts must
    // instead account for every physical LED.
    for (const item of lessons()) {
      if (item.track === 'installation') {
        const contract = item.show.outputContract
        expect(contract.kind, item.id).toBe('installation')
        expect(item.show.zones.reduce((sum, zone) => sum + zone.nominalPixelCount, 0), item.id)
          .toBe(contract.kind === 'installation' ? contract.pixelCount : Number.NaN)
        continue
      }
      expect(item.show.outputContract, item.id).toMatchObject({
        kind: 'portable-2d',
        referencePixelCount: 1_936,
      })
      expect(item.show.zones.reduce((sum, zone) => sum + zone.nominalPixelCount, 0), item.id).toBe(1_936)
    }
  })

  it('routes 301 surfaces by the wiring walk and trades stage and columns at the halfway Cut', () => {
    const item = stockShowById('stock-show-301-installation-mapping')!
    expect(item.show.routingLayouts).toHaveLength(1)
    expect(item.show.routingLayouts[0].zones).toEqual([
      { zoneId: 'zone-1', ranges: [{ start: 250, end: 499 }] },
      { zoneId: 'zone-2', ranges: [{ start: 500, end: 749 }] },
      { zoneId: 'zone-3', ranges: [{ start: 0, end: 249 }, { start: 750, end: 999 }] },
    ])
    expect(validateInstallationCoverage(item.show)).toMatchObject({ valid: true })

    const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    expect(compiled.artifact!.summary).toMatchObject({
      steadyStateRenderersPerController: 3,
      worstInstantRenderersPerController: 3,
      steadyStateRenderersPerPixel: 1,
      worstInstantRenderersPerPixel: 1,
    })
    const mapPoints = SOURCE_STOCK_MAPS.find((map) => map.id === 'proscenium-stage-2d')!.resolve(1_000)
    let virtualTime = 0
    const shim = createShim({
      pixelCount: 1_000,
      dimensions: 2,
      mapPoints,
      getVirtualTime: () => virtualTime,
      randomSeed: 363,
    })
    const handle = loadPattern(compiled.artifact!.code, compiled.artifact!.metadata, shim.builtins)
    // Both columns belong to one Zone, so a sample from each end of the index
    // space (left column, right column) must carry the same voice.
    const groups = { floor: [300, 400, 480], arch: [520, 620, 730], towers: [50, 150, 800, 950] }
    const frameAt = (deltaMs: number) => {
      virtualTime += deltaMs
      handle.beforeRender(deltaMs)
      const render = (index: number) => {
        const [x, y] = mapPoints[index].sample
        handle.render2D(index, x, y)
        return shim.capturedPixel()
      }
      return {
        floor: groups.floor.map(render),
        arch: groups.arch.map(render),
        towers: groups.towers.map(render),
      }
    }

    const establish = frameAt(1_000)
    const traded = frameAt(7_000)

    // Three surfaces run visibly different content, floor and towers change
    // at the trade even though the ranges never move, and every surface stays
    // unmistakably alive in both halves.
    expect(establish.floor).not.toEqual(establish.towers)
    expect(establish.floor).not.toEqual(establish.arch)
    expect(traded.floor).not.toEqual(establish.floor)
    expect(traded.towers).not.toEqual(establish.towers)
    const lit = (group: number[][]) => group.some(([r, g, b]) => r + g + b > 0.05)
    for (const frame of [establish, traded]) {
      expect(lit(frame.floor) && lit(frame.arch) && lit(frame.towers)).toBe(true)
    }
  })

  it('plays all of 302 from one Pattern instance whose voices are adaptations and Effects', () => {
    const item = stockShowById('stock-show-302-installation-composition')!
    expect(item.show.routingLayouts).toHaveLength(1)
    expect(item.show.routingLayouts[0].zones).toEqual([
      { zoneId: 'zone-1', ranges: [{ start: 0, end: 799 }] },
      { zoneId: 'zone-2', ranges: [{ start: 800, end: 1_099 }] },
      { zoneId: 'zone-3', ranges: [{ start: 1_100, end: 1_399 }] },
      { zoneId: 'zone-4', ranges: [{ start: 1_400, end: 1_699 }] },
      { zoneId: 'zone-5', ranges: [{ start: 1_700, end: 1_999 }] },
    ])
    expect(validateInstallationCoverage(item.show)).toMatchObject({ valid: true })
    // The entire Show runs on one instance: every placement in every passage
    // references the single pendulum machine.
    const composition = item.show.composition!
    expect(composition.patternInstances).toHaveLength(1)
    expect(composition.patternInstances[0]).toMatchObject({ id: 'pendulum', patternName: 'Harmonograph' })
    const placementInstances = new Set(composition.scenes.flatMap((scene) => scene.zones
      .flatMap((zone) => zone.main.map((entry) => entry.instanceId))))
    expect(placementInstances).toEqual(new Set(['pendulum']))
    // The hue-wheel quartet arrives as a split Clip in the first passage and
    // then travels: every change beat reassigns the four quarter-turn phases
    // to corners by a different rule (deal, rotate, diagonal swap, rotate
    // back), the second passage staggers the same window a quarter frame per
    // satellite, and the last passage pulses the hero's invert on two
    // scheduled beats.
    const renderScene = composition.scenes.find((scene) => scene.sceneId === 'render')!
    expect(renderScene.zones.slice(1).map((zone) => zone.main.map((entry) => entry.view?.phase ?? 0)))
      .toEqual([[0], [0.5], [0.05], [0.42]])
    const windowsScene = composition.scenes.find((scene) => scene.sceneId === 'windows')!
    expect(windowsScene.zones.slice(1).map((zone) => (
      zone.main[0].effects?.find((effect) => effect.kind === 'translate')
    ))).toMatchObject([{ x: 0 }, { x: 0.25 }, { x: 0.5 }, { x: 0.75 }])
    expect(windowsScene.zones.slice(1).every((zone) => (
      zone.main.every((entry) => entry.effects?.some((effect) => effect.kind === 'wrap'))
    ))).toBe(true)
    // Each segment's phase assignment is a permutation of the same four
    // quarter turns, and consecutive segments never leave a corner's color
    // in place - the wheel itself is choreography. Resting values sit on the
    // placements; the mid-passage rotated assignment lives in the journey
    // tracks' middle stops.
    const answerSceneForPhases = composition.scenes.find((scene) => scene.sceneId === 'answer')!
    const rotated = [1, 2, 3, 4].map((satellite) => {
      const track = windowsScene.propertyTracks!.find((candidate) => (
        candidate.target.kind === 'placement-view' && candidate.target.placementId === `satellite-${satellite}-window`
      ))!
      return track.keyframes[1].value
    })
    const segments = [
      renderScene.zones.slice(1).map((zone) => zone.main[0].view!.phase),
      rotated,
      windowsScene.zones.slice(1).map((zone) => zone.main[0].view!.phase),
      answerSceneForPhases.zones.slice(1).map((zone) => zone.main[0].view!.phase),
    ]
    // The four phases form one split-complementary family, not a
    // full-spectrum quarter-turn spread.
    for (const segment of segments) {
      expect([...segment].sort()).toEqual([0, 0.05, 0.42, 0.5])
    }
    for (let step = 1; step < segments.length; step++) {
      for (let corner = 0; corner < 4; corner++) {
        expect(segments[step][corner], `segment ${step} corner ${corner} moves`)
          .not.toBe(segments[step - 1][corner])
      }
    }
    const answerScene = composition.scenes.find((scene) => scene.sceneId === 'answer')!
    expect(answerScene.zones[0].main[0].effects).toMatchObject([{ kind: 'invert', amount: 0 }])
    expect(answerScene.propertyTracks?.find((track) => (
      track.target.kind === 'placement-effect' && track.target.placementId === 'hero-answer'
    ))).toMatchObject({
      target: { kind: 'placement-effect', placementId: 'hero-answer', effectKind: 'invert', parameterId: 'amount' },
    })
    // Structural voices: rings on Left-upper, six-fold symmetry on
    // Right-upper, persistent from the windows passage onward.
    expect(windowsScene.zones[1].main.every((entry) => entry.effects?.some((effect) => effect.kind === 'ripple'))).toBe(true)
    expect(windowsScene.zones[3].main.every((entry) => entry.effects?.some((effect) => effect.kind === 'kaleidoscope'))).toBe(true)
    expect(answerScene.zones[1].main[0].effects?.some((effect) => effect.kind === 'ripple')).toBe(true)
    expect(answerScene.zones[3].main[0].effects?.some((effect) => effect.kind === 'kaleidoscope')).toBe(true)
    // Every color move glides: each reassigned corner carries a staggered
    // placement-view phase track (3 arrivals + 4 + 4 in windows + 4 here).
    const phaseTracksOf = (sceneId: string) => composition.scenes
      .find((scene) => scene.sceneId === sceneId)!.propertyTracks
      ?.filter((track) => track.target.kind === 'placement-view' && track.target.property === 'phase') ?? []
    expect(phaseTracksOf('render')).toHaveLength(3)
    expect(phaseTracksOf('windows')).toHaveLength(4)
    expect(phaseTracksOf('answer')).toHaveLength(4)
    const staggeredStarts = new Set(phaseTracksOf('answer').map((track) => track.keyframes[0].timeMs))
    expect(staggeredStarts.size).toBe(4)

    const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    expect(compiled.artifact!.summary).toMatchObject({
      steadyStateRenderersPerController: 1,
      worstInstantRenderersPerController: 1,
      steadyStateRenderersPerPixel: 1,
      worstInstantRenderersPerPixel: 1,
    })
    const mapPoints = SOURCE_STOCK_MAPS.find((map) => map.id === 'redline-stage-2d')!.resolve(2_000)
    let virtualTime = 0
    const shim = createShim({
      pixelCount: 2_000,
      dimensions: 2,
      mapPoints,
      getVirtualTime: () => virtualTime,
      randomSeed: 302,
    })
    const handle = loadPattern(compiled.artifact!.code, compiled.artifact!.metadata, shim.builtins)
    // Zone-wide rendering for liveliness (Harmonograph draws thin curves
    // over a dark field, and the posterized pair keeps only ~16% of its
    // pixels lit at rest, so point samples flicker), plus the same local
    // offsets inside each 300-pixel target so corresponding samples compare
    // the one shared render across its per-Zone voices.
    const offsets = [15, 55, 95, 135, 175, 215, 255, 295]
    const bases = [800, 1_100, 1_400, 1_700]
    const frameAt = (deltaMs: number) => {
      virtualTime += deltaMs
      handle.beforeRender(deltaMs)
      const render = (index: number) => {
        const [x, y] = mapPoints[index].sample
        handle.render2D(index, x, y)
        return shim.capturedPixel()
      }
      const all = Array.from({ length: 2_000 }, (_, index) => render(index))
      return {
        hero: all.slice(0, 800),
        satelliteZones: bases.map((base) => all.slice(base, base + 300)),
        satellites: bases.map((base) => offsets.map((offset) => all[base + offset])),
      }
    }

    // Cut junctions add no transition intervals on the 20-second ruler: One
    // render holds 0-6s (quartet from 3s), Quarter windows 6-14s, Answer
    // 14-20s with invert peaks near 16.1s and 18.1s.
    const plain = frameAt(1_500)
    const quartet = frameAt(3_000)     // t=4.5s: phases 0/0.25/0.5/0.75
    const windows = frameAt(5_500)     // t=10s: staggered wrap windows
    const prePulse = frameAt(5_500)    // t=15.5s: answer passage at rest
    const pulse = frameAt(600)         // t=16.1s: first invert peak

    const meanLuminance = (group: number[][]) => (
      group.reduce((sum, [r, g, b]) => sum + r + g + b, 0) / (group.length * 3)
    )
    for (const frame of [plain, quartet, windows, prePulse, pulse]) {
      expect(meanLuminance(frame.hero), 'hero stays lit').toBeGreaterThan(0.01)
      for (const satellite of frame.satelliteZones) {
        expect(meanLuminance(satellite), 'satellites stay lit').toBeGreaterThan(0.01)
      }
    }
    // The quartet phases rotate hue only, so each voice differs from the
    // reference satellite at corresponding local samples of the same frame.
    const [reference, quarter, half, threeQuarter] = quartet.satellites
    expect(quarter).not.toEqual(reference)
    expect(half).not.toEqual(reference)
    expect(threeQuarter).not.toEqual(reference)
    // The staggered windows differ too, and the pulse flips the hero's dark
    // field far more than frame-to-frame drift explains.
    expect(windows.satellites[1]).not.toEqual(windows.satellites[0])
    expect(meanLuminance(pulse.hero)).toBeGreaterThan(meanLuminance(prePulse.hero) + 0.3)
  })

  it('prices the 303 echo honestly: one shared machine, measurable overlay cost', () => {
    const item = stockShowById('stock-show-303-compile-simplify-deliver')!
    const compiled = compileShowForArtifact(item.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()

    // The note claims the compiler reuses one physical machine across the two
    // logical RibbonLoom instances; hold the copy to the compiler's behavior.
    const exported = buildShowEpeExport(item.show, compiled.artifact!.code, {
      id: 'lesson-303-inventory',
      stampedAt: '2026-08-02T00:00:00.000Z',
    })
    const inventory = buildDeliveredShowSourceInventory(
      compiled.artifact!.summary.sourceInventory,
      compiled.artifact!.code,
      exported.source,
    )
    // The compiled artifact pays for exactly one Zone Layout here, whatever
    // the saved definition list holds (#63).
    expect(compiled.artifact!.summary.routedZoneLayoutCount).toBe(1)
    const model = buildShowArtifactInventoryModel(inventory, {
      patterns: describeShowArtifactPatterns(item.show, inventory),
      budgetBytes: compiled.artifact!.summary.measuredDeviceBudgetBytes,
    })
    const loomRow = model.rows.find((row) => row.category === 'pattern' && row.label === 'RibbonLoom')!
    expect(loomRow).toMatchObject({ physicalMachineCount: 1, logicalInstanceCount: 2 })

    // The note's Try-this: deleting the echo must fall out of the inventory
    // as a real, sizable saving rather than a rounding error.
    const stripped = structuredClone(item.show)
    const strippedScene = stripped.composition!.scenes[0]
    strippedScene.zones[0].overlays = []
    strippedScene.propertyTracks = []
    stripped.composition!.patternInstances = stripped.composition!.patternInstances
      .filter((entry) => entry.id !== 'loom-echo')
    const slim = compileShowForArtifact(stripped, [], undefined, {}, { stageDimension: 2 })
    expect(slim.error).toBeNull()
    const savedBytes = compiled.artifact!.summary.artifactBytes - slim.artifact!.summary.artifactBytes
    expect(savedBytes).toBeGreaterThan(4_000)
  })

  it('counts compiled Zone Layouts on the summary (#63)', () => {
    const multi = stockShowById('stock-show-206-changing-zone-layouts')!
    const compiled = compileShowForArtifact(multi.show, [], undefined, {}, { stageDimension: 2 })
    expect(compiled.error).toBeNull()
    expect(compiled.artifact!.summary.routedZoneLayoutCount).toBeGreaterThan(1)
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

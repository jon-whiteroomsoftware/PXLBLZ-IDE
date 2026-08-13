import type {
  ShowBoundaryTransition,
  ShowCell,
  ShowClipEffect,
  ShowClipTransform,
  ShowClipViewport,
  ShowCompositionV1,
  ShowPropertyAnimationTarget,
  ShowPropertyAnimationTrack,
  ShowRecord,
  ShowRoutingLayout,
  ShowScene,
  ShowStructuredEasing,
  ShowZone,
} from '@/engine/personalContentRecords'
import { NEUTRAL_SHOW_CLIP_TRANSFORM } from '@/engine/showClipTransform'
import { SHOW_EASING_OPTIONS } from '@/engine/showEasing'
import { showEffectNumericValue, showEffectParameterNames } from '@/engine/showEffects'
import type { ShowPatternSlotGroup, ShowReferenceGuide } from '@/engine/showReferenceShow'
import { replaceShowBoundaryTransition } from '@/engine/showTransitionAuthoring'
import {
  createShowWithOutputContract,
  extendShowCell,
  normalizeShowTransitionState,
  removeShowBoundaryTransition,
  removeShowClip,
  updateShowBoundaryTransition,
  updateShowCellAdaptations,
  updateShowCellPattern,
  updateShowRoutingSwitch,
  updateShowScene,
} from '@/engine/showModel'
import {
  normalizeShowComposition,
  projectFlatShowToCompositionV1WithCellOrigins,
} from '@/engine/showCompositionModel'
import { addShowPropertyKeyframe, addShowPropertyTrack } from '@/engine/showPropertyAnimation'
import { DEFAULT_SHOW_CLIP_CORNER_RADIUS } from '@/engine/showClipViewport'
import { DEMOS } from './patterns'
import { buildShowToolkitPresentationCatalogue } from '@/engine/showVisualToolkitPresentation'
import {
  createInstallationShowOutputContract,
  createPortableShowOutputContract,
} from '@/engine/showOutputContract'

export type StockShowTrack = 'portable' | 'installation'
export type StockShowCollection = 'learn' | 'showcases' | 'remixes'

export interface StockShowNote {
  label: string
  number?: string
  title: string
  purpose: string
  notice: string
  prompts: readonly [string, string]
  guide: {
    documentId: 'show-visual-toolkit' | 'keyboard-shortcuts'
    heading: string
    label: string
  }
  defaultOpen: boolean
}

export interface StockShow {
  id: string
  /** Earlier source IDs that may still identify compiled Controller artifacts. */
  legacySourceIds?: readonly string[]
  name: string
  track: StockShowTrack
  collection: StockShowCollection
  level: 100 | 200 | 300 | null
  order: number
  lesson: string
  description: string
  note: StockShowNote
  // Zones-focused lessons open the Zone rail on first visit; everything else
  // starts collapsed and the session store remembers the user's choice.
  zonesOpenByDefault?: boolean
  // Try with Pattern: ordered slot groups, one picker each, in timeline
  // order. A group's instances swap together. Same projection machinery as
  // reference patternSlots, without Reference mode.
  patternSlots?: readonly { cellIds: readonly string[]; instanceIds: readonly string[] }[]
  reference?: ShowReferenceGuide
  show: ShowRecord
}

type ClipSpec = {
  zoneId: string
  pattern: string
  timeScale: number
  brightness?: number
  controls?: Record<string, number>
  effects?: ShowClipEffect[]
  restartOnEntry?: boolean
}

type SceneSpec = Pick<ShowScene, 'id' | 'name' | 'durationMs' | 'routingTargets' | 'sampleTargets'> & {
  clips: ClipSpec[]
}

type CatalogueInput = {
  id: string
  title: string
  track: StockShowTrack
  collection: StockShowCollection
  level: 100 | 200 | 300 | null
  order: number
  purpose: string
  notice: string
  prompts: readonly [string, string]
  guideHeading: string
  guideDocumentId?: StockShowNote['guide']['documentId']
  guideLabel?: string
  /** Note rail label; defaults to `Learn <level>` or `Showcases`. */
  noteLabel?: string
  defaultOpen?: boolean
  zonesOpenByDefault?: boolean
  // Ordered Try with Pattern slot groups (timeline order): each inner array
  // is one picker, and its instance ids swap together. Lessons whose concept
  // needs two instances of one Pattern (restart, presentation, and machine
  // sharing comparisons) keep both ids in one group so the swap preserves
  // the demonstration.
  patternSlots?: readonly (readonly string[])[]
  output: { kind: 'portable'; mapId: string; pixelCount: number }
    | { kind: 'installation'; mapId: string; pixelCount: number }
  zones: ShowZone[]
  layouts: ShowRoutingLayout[]
  scenes: SceneSpec[]
  transitions?: ShowBoundaryTransition[]
  composition?: ShowCompositionV1
  reference?: ShowReferenceGuide
}

const UPDATED_AT = 363
// 44 x 44. The largest complete square under SHOW_MAX_OUTPUT_PIXELS (2,000):
// the plane map derives cols = ceil(sqrt(n)), so 2,000 leaves a 45-wide grid
// with a ragged 20-pixel final row.
const PORTABLE_REFERENCE_PIXELS = 1_936
// Foundation lessons share one Show-wide pace instead of tuning each Clip, so
// the timeline reads as choreography rather than per-Clip knob work.
const LESSON_TIME_SCALE = 0.32
const SINE_IN_OUT: ShowStructuredEasing = { curve: 'sine', direction: 'in-out' }
const SINE_OUT: ShowStructuredEasing = { curve: 'sine', direction: 'out' }
const CUBIC_IN_OUT: ShowStructuredEasing = { curve: 'cubic', direction: 'in-out' }
const CUBIC_IN: ShowStructuredEasing = { curve: 'cubic', direction: 'in' }
const CUBIC_OUT: ShowStructuredEasing = { curve: 'cubic', direction: 'out' }
const LINEAR: ShowStructuredEasing = { curve: 'linear' }
const QUADRATIC_IN: ShowStructuredEasing = { curve: 'quadratic', direction: 'in' }
const COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#22c55e']

export const STOCK_SHOWS: StockShow[] = [
  learn100(),
  learn101(), learn102(), learn103(), learn104(), learn105(), learn106(),
  learn201(), learn202(), learn203(), learn204(), learn205(), learn206(), learn207(),
  learn301(), learn302(), learn303(),
  effectShowcase('transform'), effectShowcase('distortion'),
  effectShowcase('color-adjustment'), compositingKeyShowcase(), lumaSourcesShowcase(),
  blendAndFadeTransitionReference(), wipeTransitionReference(), dissolveTransitionReference(),
  shapeRevealGeometricReference(), shapeRevealFigureReference(), slideTransitionReference(), zoomSpinTransitionReference(),
  propertyAnimationReference(), easingReference(), apertureShapesReference(), apertureIconsReference(),
  zoneLayoutShowcase('splits'), zoneLayoutShowcase('bands'), zoneLayoutShowcase('radial'),
  redlineInstallation(),
  remixCoronalMassEjection(),
  quadrilleRemix(),
  overtureRemix(),
]

export function stockShowById(id: string | null | undefined): StockShow | undefined {
  return id ? STOCK_SHOWS.find((item) => item.id === id) : undefined
}

// 100 is the tour: it exists so the learner can move, not so it can teach an
// authoring concept. The content is deliberately furniture - the 101 pair
// carries the main row, GlyphRain (82% dark) sits on a second Layer as a
// drag target and zoom landmark, and the four-second blank tail is the
// double-click target the first prompt needs. The note is deliberately
// non-exhaustive; restraint is part of the course doctrine, and the guide
// handoff points at the Keyboard Shortcuts reference instead of the visual
// toolkit because the tools, not the picture, are the lesson.
function learn100(): StockShow {
  const id = 'stock-show-100-getting-around'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('tour', 'Tour', 16, [clip('zone-1', 'RibbonLoom', LESSON_TIME_SCALE)]),
  ]
  const composition: ShowCompositionV1 = normalizeShowComposition({ scenes, zones }, {
    version: 1,
    // deterministic-loop withheld (#823): the full-scene wrap census could not
    // prove exact Show End reset for this record (member state drift, or a
    // transition-extended timeline the census cannot phase-lock); upgrade
    // path is engine state snapshot/restore (#841).
    patternInstances: [
      instance('ribbons', 'RibbonLoom', LESSON_TIME_SCALE),
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
      instance('glyphs', 'GlyphRain', LESSON_TIME_SCALE),
    ],
    scenes: [{
      sceneId: 'tour',
      zones: [{
        zoneId: 'zone-1',
        main: [
          placement('clip-ribbons', 'ribbons', 0, 6),
          placement('clip-garden', 'garden', 6, 6),
          // Four seconds of empty Layer before Show End: the double-click
          // target the first Try-this asks for.
        ],
        overlays: [{
          id: 'layer-upper',
          name: 'Upper Layer',
          placements: [{ ...placement('clip-glyphs', 'glyphs', 3, 6), opacity: 0.5 }],
        }],
      }],
    }],
    durationMs: 16_000,
  })
  return catalogue({
    id, title: 'Getting Around', track: 'portable', collection: 'learn', level: 100, order: 0,
    purpose: 'This first Show exists to get you familiar with the basics, simplest first.\n'
      + 'Space plays and pauses. Left and Right jump five seconds; A returns to the start.\n'
      + 'The Navigator strip above the timeline shows the whole Show: drag its window to move your view, drag its edges to zoom.\n'
      + 'Double-click an empty stretch of a Layer to place a Clip there. Drag a Clip between rows to move it.\n'
      + 'Whatever you break, Reset restores this lesson exactly.',
    notice: 'Command/Ctrl+wheel also zooms the timeline around the playhead, and Shift+wheel pans it. This tour is deliberately incomplete; the guide below covers everything else.',
    prompts: ['Hold Option/Alt and drag a Clip to pull off an independent copy - the original never moves. Try dropping it on the upper Layer row, then press Reset.', 'Hold Option/Alt while resizing or scrubbing a Clip to temporarily reverse Snap.'],
    guideHeading: 'creating-and-arranging-clips',
    patternSlots: [['ribbons'], ['glyphs'], ['garden']],
    guideDocumentId: 'keyboard-shortcuts',
    guideLabel: 'Read the full shortcut reference',
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 101 pairs sparse linework against a solid field so the Cut, the gap, and Show
// End are all legible without opening Entity Details. No Transition entity, no
// Effect, and no second Layer competes with direct timing.
function learn101(): StockShow {
  const id = 'stock-show-101-clips-cuts-blank-time'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('timeline', 'Timeline', 16, [clip('zone-1', 'RibbonLoom', LESSON_TIME_SCALE)]),
  ]
  const composition: ShowCompositionV1 = normalizeShowComposition({ scenes, zones }, {
    version: 1,
    // deterministic-loop withheld (#823): the full-scene wrap census could not
    // prove exact Show End reset for this record (member state drift, or a
    // transition-extended timeline the census cannot phase-lock); upgrade
    // path is engine state snapshot/restore (#841).
    patternInstances: [
      instance('ribbons', 'RibbonLoom', LESSON_TIME_SCALE),
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
    ],
    scenes: [{
      sceneId: 'timeline',
      zones: [{
        zoneId: 'zone-1',
        overlays: [],
        main: [
          placement('clip-ribbons', 'ribbons', 0, 5),
          // Touching the previous Clip: the Cut is the implicit junction.
          placement('clip-garden', 'garden', 5, 5),
          // Two seconds of blank time before the reprise, which renders black.
          placement('clip-reprise', 'ribbons', 12, 4),
        ],
      }],
    }],
    durationMs: 16_000,
  })
  return catalogue({
    id, title: 'Clips, Cuts, and Blank Time', track: 'portable', collection: 'learn', level: 100, order: 1,
    purpose: 'A Clip occupies a span of Show time on a Layer. Where two Clips touch, the junction between them is a Cut; where none is scheduled, the Show renders black.',
    notice: 'The two seconds before the final Clip are empty on purpose. Blank time is a valid part of the timeline, not a mistake. And edit freely: in any Show, Command/Ctrl+Z undoes and Command/Ctrl+Shift+Z redoes, and Reset restores any of the lessons to their original state.',
    prompts: ['Split the first Clip in half without changing the picture.', 'Drag the last Clip left to close the gap, then back to reopen it.'],
    guideHeading: 'clips-cuts-and-blank-time',
    patternSlots: [['ribbons'], ['garden']],
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 102 casts the two black-cored radial machines so the Crossfade reads as one
// mechanism becoming another rather than two pictures fighting, then wipes into
// a bright full-field mandala so the second family is unmistakable.
function learn102(): StockShow {
  const id = 'stock-show-102-transitions-values'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('passages', 'Passages', 16.5, [clip('zone-1', 'ClockworkIris', LESSON_TIME_SCALE)]),
  ]
  const composition: ShowCompositionV1 = normalizeShowComposition({ scenes, zones }, {
    version: 1,
    // deterministic-loop withheld (#823): member state drifts at the Show
    // End wrap (measured); upgrade path is engine state snapshot/restore (#841).
    patternInstances: [
      instance('iris', 'ClockworkIris', LESSON_TIME_SCALE),
      instance('horizon', 'EventHorizon', LESSON_TIME_SCALE),
      instance('mandala', 'SignalMandala', LESSON_TIME_SCALE),
    ],
    scenes: [{
      sceneId: 'passages',
      propertyTracks: [{
        // The destination owns its brightness; the ramp is a Clip-owned
        // sparkline, separate from the Wipe that exchanges the picture.
        // The Wipe lands on full brightness, then the second half of the Clip
        // settles back. Arriving bright and easing down reads as a deliberate
        // release; arriving dim reads as the Transition having failed.
        id: 'track-mandala-brightness',
        target: { kind: 'placement-view', placementId: 'clip-mandala', property: 'brightness' },
        keyframes: [
          keyframe('mandala-arrive', 12.5, 1),
          keyframe('mandala-hold', 14.5, 1),
          keyframe('mandala-settle', 16.5, 0.45),
        ],
      }],
      zones: [{
        zoneId: 'zone-1',
        overlays: [],
        // A Layer Transition occupies the exact gap between its Clips, so the
        // junction owns real time on the ruler instead of hiding inside a Clip.
        main: [
          placement('clip-iris', 'iris', 0, 5),
          placement('clip-horizon', 'horizon', 7, 4),
          placement('clip-mandala', 'mandala', 12.5, 4),
        ],
      }],
    }],
    transitions: [
      {
        id: 'transition-iris-horizon', fromPlacementId: 'clip-iris', toPlacementId: 'clip-horizon',
        kind: 'crossfade', durationMs: 2_000, easing: SINE_IN_OUT, crossfadePolicy: 'live-live',
      },
      {
        id: 'transition-horizon-mandala', fromPlacementId: 'clip-horizon', toPlacementId: 'clip-mandala',
        kind: 'wipe', durationMs: 1_500, easing: CUBIC_IN_OUT,
        wipeVariant: 'linear', direction: 0, feather: 0.08, edgePolicy: 'dither',
      },
    ],
    durationMs: 16_500,
  })
  return catalogue({
    id, title: 'Transitions and Values', track: 'portable', collection: 'learn', level: 100, order: 2,
    purpose: 'A Transition is its own entity at the junction between two Clips. It owns how the picture changes; the destination Clip still owns the final value.',
    notice: 'Crossfade and Wipe change the picture. The brightness ramp on the last Clip is a separate, Clip-owned curve.',
    prompts: ['Shorten the Crossfade from 2.0 s to 0.5 s.', "Change where the last Clip's brightness settles from 45% to 100%."],
    guideHeading: 'transitions-and-clip-values',
    patternSlots: [['iris'], ['horizon'], ['mandala']],
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 103 reuses one instance of the only radial Pattern with unmistakable
// orientation: its cardinal points and asymmetric sweep make Rotation and
// Mirror visible, which a symmetric mandala could never show. Sharing one
// instance keeps the Pattern clock running so only the pose changes.
function learn103(): StockShow {
  const id = 'stock-show-103-clip-transform'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const poses: Array<[string, string, Partial<ShowClipTransform> | undefined, boolean]> = [
    ['clip-reference', 'Reference', undefined, false],
    ['clip-position', 'Position', { positionX: 0.22, positionY: -0.14 }, false],
    ['clip-rotation', 'Rotation', { rotation: 0.125 }, false],
    ['clip-scale', 'Scale', { scaleX: 0.62, scaleY: 0.62 }, false],
    ['clip-mirror', 'Mirror', undefined, true],
  ]
  const scenes: SceneSpec[] = [
    scene('poses', 'Poses', 15, [clip('zone-1', 'CompassRose', LESSON_TIME_SCALE)]),
  ]
  const composition: ShowCompositionV1 = normalizeShowComposition({ scenes, zones }, {
    version: 1,
    executionModel: 'deterministic-loop',
    patternInstances: [instance('rose', 'CompassRose', LESSON_TIME_SCALE)],
    scenes: [{
      sceneId: 'poses',
      zones: [{
        zoneId: 'zone-1',
        overlays: [],
        main: poses.map(([placementId, , transform, mirror], index) => ({
          ...placement(placementId, 'rose', index * 3, 3),
          view: { mirror, phase: 0, brightness: 1 },
          ...(transform ? { transform: { ...NEUTRAL_SHOW_CLIP_TRANSFORM, ...transform } } : {}),
        })),
      }],
    }],
    durationMs: 15_000,
  })
  return catalogue({
    id, title: 'Clip Transform', track: 'portable', collection: 'learn', level: 100, order: 3,
    purpose: 'A Clip can be moved, turned, resized, or flipped on the Stage. The Pattern inside it keeps playing exactly as before; only where its picture lands changes, and no second copy of the Pattern is started.',
    notice: 'Every Clip here shares one Pattern instance, so the rose keeps turning at the same rate while only its placement changes. A Clip can instead run its own instance on its own clock - that choice gets its own lesson in 203.',
    prompts: ['Center the offset Clip (2) by setting Position back to 0, 0.', 'Rotate the Scale Clip (4) by 72 degrees; because that differs from Clip 3, the timeline gives it its own marker.'],
    guideHeading: 'clip-transform',
    patternSlots: [['rose']],
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 104 teaches ordering with two Color & output Effects rather than two
// Transform Effects, because every stock Pattern here fills the frame: moving
// or turning a full-field texture only reveals a different part of the same
// texture. Brightness and Threshold act on rendered pixels, so the whole Stage
// carries the difference. Both are named exactly as the Effects panel labels
// them, so the note and the screen agree.
//
// The cast is measured, not chosen by eye. Across the 2D catalogue at 44x44,
// MetaballGarden is the only Pattern with real mid-range luminance - 28% of its
// pixels fall between 0.2 and 0.8, against 4-10% for everything else - and a
// luminance Cutoff needs mid-range pixels to bisect. Reusing 101's Pattern is
// the price of a lesson that actually demonstrates its own claim.
//
// Measured on those pixels, the two orders differ in kind rather than in degree.
// Threshold then Brightness lights 27.6% of the Stage at 40%: the whole shape,
// lowered. Brightness then Threshold lights 10.3% at full strength: only pixels
// bright enough to clear a threshold they meet already lowered, so what survives
// is a sparse scatter of white. Their mean brightness is nearly identical (0.110
// against 0.103), which is what makes the difference read as a decision about
// order rather than a brightness knob.
//
// Brightness sits at 40% rather than the 25% that drove Clip 3 to pure black.
// Black was the most pronounced result but read as an empty Clip rather than a
// taught one.
function learn104(): StockShow {
  const id = 'stock-show-104-effects-and-ordering'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  // Distinct Effect ids per Clip, so each Clip's Effects stay independently
  // addressable and the two ordered Clips can never be merged onto one emitted
  // chain (#363).
  const brightness = (id: string): ShowClipEffect => ({ id, kind: 'brightness', brightness: 0.4 })
  const threshold = (id: string): ShowClipEffect => ({ id, kind: 'threshold', threshold: 0.2, amount: 1 })
  const stacks: Array<[string, ShowClipEffect[]]> = [
    ['clip-plain', []],
    ['clip-threshold', [threshold('threshold-alone')]],
    ['clip-brightness-threshold', [brightness('brightness-first'), threshold('threshold-second')]],
    ['clip-threshold-brightness', [threshold('threshold-first'), brightness('brightness-second')]],
  ]
  const scenes: SceneSpec[] = [
    scene('stacks', 'Stacks', 16, [clip('zone-1', 'MetaballGarden', LESSON_TIME_SCALE)]),
  ]
  const composition: ShowCompositionV1 = normalizeShowComposition({ scenes, zones }, {
    version: 1,
    // deterministic-loop withheld (#823): the full-scene wrap census could not
    // prove exact Show End reset for this record (member state drift, or a
    // transition-extended timeline the census cannot phase-lock); upgrade
    // path is engine state snapshot/restore (#841).
    patternInstances: [instance('garden', 'MetaballGarden', LESSON_TIME_SCALE)],
    scenes: [{
      sceneId: 'stacks',
      zones: [{
        zoneId: 'zone-1',
        overlays: [],
        main: stacks.map(([placementId, effects], index) => ({
          ...placement(placementId, 'garden', index * 4, 4),
          ...(effects.length > 0 ? { effects } : {}),
        })),
      }],
    }],
    durationMs: 16_000,
  })
  return catalogue({
    id, title: 'Effects and Ordering', track: 'portable', collection: 'learn', level: 100, order: 4,
    purpose: 'An Effect changes the picture a Clip has already drawn, without editing the Pattern. A Clip holds its Effects as a list, and each one works on the result of the one above it, so the same two Effects in a different order do not give the same picture.',
    notice: 'Clips 3 and 4 carry the same Brightness and the same Threshold, swapped. Clip 3 lowers Brightness first, so only the brightest pixels still clear the Threshold and a sparse scatter survives at full strength. Clip 4 applies Threshold first, so the whole shape survives and Brightness then lowers it. Almost the same amount of light, a completely different picture.',
    prompts: ["On Clip 3, open Brightness's action menu and choose Move later so Brightness runs after Threshold, then watch the whole shape come back.", "Leave the order alone on Clip 3 and lower that Clip's Threshold until more of the shape survives."],
    guideHeading: 'clip-effects',
    patternSlots: [['garden']],
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 105 tells Zones and their Layouts as one story: the same two Patterns
// render as a left/right split, then as a bullseye of rings, then as a
// pinwheel finale. Both boundaries are swept routing changes, so the learner
// twice watches geometry travel while both Pattern clocks run straight
// through. The Zones carry material names rather than positions because only
// the first Layout is positional - the name teaches that Zones own content
// while Layouts own geometry. Rings is 3 over 2 Zones on purpose: the cycle
// deals ring index modulo Zone order, so the bullseye reads Weave-Water-Weave
// and the note's added third Zone inherits the spare ring instead of
// vanishing (rings 2 would strand it with no pixels). 206 goes deeper on
// restating Layouts across a longer arc and contrasts swept with atomic
// switching; the Zone Layouts showcase holds the full geometry vocabulary.
// The water voice is Caustics: unlike the nested random arrays in IceFloes2D,
// its state can be reconstructed exactly at Show End while its moving field
// keeps each re-routed geometry legible.
function learn105(): StockShow {
  const id = 'stock-show-105-portable-zones'
  const zones = logicalZones(['Weave', 'Water'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('split', 'Split', 8, [
      clip('zone-1', 'RibbonLoom', LESSON_TIME_SCALE),
      clip('zone-2', 'Caustics', LESSON_TIME_SCALE),
    ], { splitPosition: 0.5 }),
    scene('rings', 'Rings', 6, [
      clip('zone-1', 'RibbonLoom', LESSON_TIME_SCALE),
      clip('zone-2', 'Caustics', LESSON_TIME_SCALE),
    ]),
    scene('pinwheel', 'Pinwheel', 6, [
      clip('zone-1', 'RibbonLoom', LESSON_TIME_SCALE),
      clip('zone-2', 'Caustics', LESSON_TIME_SCALE),
    ]),
  ]
  const composition: ShowCompositionV1 = normalizeShowComposition({ scenes, zones }, {
    version: 1,
    executionModel: 'deterministic-loop',
    patternInstances: [
      instance('ribbons', 'RibbonLoom', LESSON_TIME_SCALE),
      instance('water', 'Caustics', LESSON_TIME_SCALE),
    ],
    scenes: [
      {
        sceneId: 'split',
        zones: [
          { zoneId: 'zone-1', overlays: [], main: [placement('clip-split-ribbons', 'ribbons', 0, 8)] },
          { zoneId: 'zone-2', overlays: [], main: [placement('clip-split-water', 'water', 0, 8)] },
        ],
      },
      {
        // Same instances on both sides of every boundary: the weave and the
        // water land in each new geometry mid-motion, which is the
        // demonstration.
        sceneId: 'rings',
        zones: [
          { zoneId: 'zone-1', overlays: [], main: [placement('clip-rings-ribbons', 'ribbons', 0, 6)] },
          { zoneId: 'zone-2', overlays: [], main: [placement('clip-rings-water', 'water', 0, 6)] },
        ],
      },
      {
        sceneId: 'pinwheel',
        zones: [
          { zoneId: 'zone-1', overlays: [], main: [placement('clip-pinwheel-ribbons', 'ribbons', 0, 6)] },
          { zoneId: 'zone-2', overlays: [], main: [placement('clip-pinwheel-water', 'water', 0, 6)] },
        ],
      },
    ],
    durationMs: 20_000,
  })
  const transitions: ShowBoundaryTransition[] = [
    // Both switches travel: each new geometry sweeps over the previous one,
    // so geometry visibly changes while both Patterns keep playing.
    {
      id: 'transition-split', afterSceneId: 'split', kind: 'cut', durationMs: 0,
      easing: LINEAR,
    },
    {
      id: 'routing-split-rings', afterSceneId: 'split', kind: 'routing', durationMs: 1_500,
      easing: SINE_IN_OUT, layoutId: 'layout-rings', routingDirection: 'forward',
    },
    {
      id: 'transition-rings', afterSceneId: 'rings', kind: 'cut', durationMs: 0,
      easing: LINEAR,
    },
    {
      id: 'routing-rings-pinwheel', afterSceneId: 'rings', kind: 'routing', durationMs: 1_500,
      easing: SINE_IN_OUT, layoutId: 'layout-pinwheel', routingDirection: 'forward',
    },
  ]
  return catalogue({
    id, title: 'Zones', track: 'portable', collection: 'learn', level: 100, order: 5,
    purpose: 'The Stage can be split into Zones that each render their own Pattern, and a Zone Layout decides which pixels every Zone gets.\n'
      + 'Three Layouts render the same pair very differently here: a left/right split, then a bullseye of rings, then a pinwheel. Each switch re-routes pixels while both Patterns keep playing.\n'
      + "The Layouts lane above the Zone rows shows which Layout owns each stretch of the timeline. Click a chip to change that interval's Routing mode and parameters; the small route markers at its edges are the switches themselves.\n"
      + 'The Zone Map (map icon above the Zone rows) renames, recolors, adds, and deletes Zones. A new Zone joins every Layout: the rings and the pinwheel deal it in, and the fixed split becomes stripes to fit it.',
    notice: 'Nothing restarts at a switch: the weave and the water land in the rings, then in the pinwheel, mid-motion. A Layout switch changes where pixels go, never Pattern state - and both switches here sweep, so you can watch the geometry travel.',
    prompts: ['Select the Pinwheel chip in the Layouts lane and raise its Twist turns - the arms curl tighter while both Patterns play on, because the Layout owns the geometry.', 'Add a third Zone in the Zone Map and give it a Clip. The split becomes stripes to make room; the rings and the pinwheel simply deal the newcomer in.'],
    guideHeading: 'portable-zones',
    guideLabel: 'Read about Zones',
    patternSlots: [['ribbons'], ['water']],
    zonesOpenByDefault: true,
    transitions,
    output: portableOutput(), zones,
    layouts: [
      splitLayout('layout-side-by-side', 'Side by side', zones, 'x'),
      { id: 'layout-rings', name: 'Rings', zones: [], logical: { kind: 'rings', zoneIds: [zones[0].id, zones[1].id], rings: 3 } },
      { id: 'layout-pinwheel', name: 'Pinwheel', zones: [], logical: { kind: 'pinwheel', zoneIds: [zones[0].id, zones[1].id], arms: 6, twist: Math.PI * 2 * 0.75, rotation: 0 } },
    ],
    scenes, composition,
  })
}

// 106 is the capstone, so it spends its budget on recombination rather than on
// new material: every element below was taught in 101-105 and nothing else
// appears. The Sky takes the radial family and the Ground takes the blob family
// that opened 101, so the two Zones stay tellable apart for the whole arc and
// the last lesson closes on the first lesson's Pattern.
function learn106(): StockShow {
  const id = 'stock-show-106-built-from-basics'
  const zones = logicalZones(['Sky', 'Ground'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('arc', 'Arc', 30, [
      clip('zone-1', 'TopographicBloom', LESSON_TIME_SCALE),
      clip('zone-2', 'MetaballGarden', LESSON_TIME_SCALE),
    ]),
  ]
  const composition: ShowCompositionV1 = normalizeShowComposition({ scenes, zones }, {
    version: 1,
    // deterministic-loop withheld (#823): the full-scene wrap census could not
    // prove exact Show End reset for this record (member state drift, or a
    // transition-extended timeline the census cannot phase-lock); upgrade
    // path is engine state snapshot/restore (#841).
    patternInstances: [
      instance('bloom', 'TopographicBloom', LESSON_TIME_SCALE),
      instance('mandala', 'SignalMandala', LESSON_TIME_SCALE),
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
    ],
    scenes: [{
      sceneId: 'arc',
      propertyTracks: [
        // The Ground's arrival. The Dissolve reassembles the garden and this
        // curve takes over the instant it lands: a rotation that starts almost
        // still and accelerates, so the Clip is going fastest as it goes dark.
        {
          id: 'track-ground-spin',
          target: { kind: 'placement-transform', placementId: 'clip-ground-return', property: 'rotation' },
          keyframes: [
            keyframe('spin-still', 15, 0, QUADRATIC_IN),
            keyframe('spin-away', 30, 1.25),
          ],
        },
        // Both Zones release together. The ramp is slow and it reaches zero,
        // not almost-zero, and then two seconds of held black end the Show.
        // Easing governs the segment leaving its keyframe, so the steady
        // release is authored on the 24s keyframe, not the 28s one.
        {
          id: 'track-sky-release',
          target: { kind: 'placement-view', placementId: 'clip-sky-reprise', property: 'brightness' },
          keyframes: [
            keyframe('sky-hold', 24, 1, LINEAR),
            keyframe('sky-dark', 28, 0),
            keyframe('sky-black', 30, 0),
          ],
        },
        {
          id: 'track-ground-release',
          target: { kind: 'placement-view', placementId: 'clip-ground-return', property: 'brightness' },
          keyframes: [
            keyframe('ground-hold', 24, 1, LINEAR),
            keyframe('ground-dark', 28, 0),
            keyframe('ground-black', 30, 0),
          ],
        },
      ],
      // No instance is placed in two Zones at once. Each Zone owns its own
      // material, which reads more clearly and is also the main thing holding
      // this Show's artifact down: a Pattern placed in two Zones has to be
      // emitted twice, and the capstone is already the heaviest lesson.
      zones: [
        {
          zoneId: 'zone-1',
          overlays: [],
          main: [
            placement('clip-sky-bloom', 'bloom', 0, 8),
            // Real gaps: each Transition owns its seconds on the ruler.
            placement('clip-sky-mandala', 'mandala', 11, 8.5),
            placement('clip-sky-reprise', 'bloom', 22.5, 7.5),
          ],
        },
        {
          zoneId: 'zone-2',
          overlays: [],
          main: [
            placement('clip-ground-garden', 'garden', 0, 12.5),
            {
              // The return is the same instance, reassembled by the Dissolve
              // and then turned by its own curve. It carries the only Effect.
              //
              // The zoom is not decoration. A rotating Clip samples outside its
              // own frame at the corners, which renders as a hard jagged edge
              // sweeping through the picture. Measured against a full-field
              // Pattern, that costs up to 18.8% of the Zone at 1.0 and 0.2% at
              // 1.4; 1.5 is the first value that stays clean through a whole
              // turn. A circular Clip Viewport would be the real fix (#591).
              ...placement('clip-ground-return', 'garden', 15, 15),
              transform: { ...NEUTRAL_SHOW_CLIP_TRANSFORM, scaleX: 1.5, scaleY: 1.5 },
              effects: [{ id: 'ground-hue', kind: 'hue', turns: 0.12 }],
            },
          ],
        },
      ],
    }],
    // Three Transitions, deliberately from three different families, because a
    // Crossfade is the least of what a junction can do.
    transitions: [
      {
        id: 'transition-sky-bloom-mandala', fromPlacementId: 'clip-sky-bloom', toPlacementId: 'clip-sky-mandala',
        kind: 'crossfade', durationMs: 3_000, easing: SINE_IN_OUT, crossfadePolicy: 'live-live',
      },
      {
        // Both Sky Patterns are radial, so a circle opening from the center
        // reads as the reprise growing out of the mandala rather than covering it.
        id: 'transition-sky-mandala-reprise', fromPlacementId: 'clip-sky-mandala', toPlacementId: 'clip-sky-reprise',
        kind: 'portal', durationMs: 3_000, easing: SINE_IN_OUT,
        shape: 'circle', revealMode: 'grow-incoming',
        centerX: 0.5, centerY: 0.5, scale: 1, edgePolicy: 'blend', feather: 0.12,
      },
      {
        // The Ground returns to the same Pattern, so a blend would show nothing:
        // both sides are the same pixels. A Dissolve breaks the garden apart and
        // reassembles it, which is visible where a blend would not be.
        id: 'transition-ground-garden-return', fromPlacementId: 'clip-ground-garden', toPlacementId: 'clip-ground-return',
        kind: 'dither', durationMs: 2_500, easing: CUBIC_IN_OUT,
        dissolveVariant: 'coherent-noise', seed: 106, scale: 6, edgePolicy: 'hard',
      },
    ],
    durationMs: 30_000,
  })
  return catalogue({
    id, title: 'Built from Basics', track: 'portable', collection: 'learn', level: 100, order: 6,
    purpose: 'Everything in this Show came from the five lessons before it: Clips, Transitions, value curves, a Clip Transform, one Effect, and two Zones. What is new is that the pieces are timed against each other, so the Sky and the Ground arrive and leave as one gesture rather than two. Every junction here is a Transition rather than a Cut, which is the one deliberate departure from 101.',
    notice: 'Three junctions, three different Transitions: a Crossfade, a circle opening from the center, and a Dissolve that reassembles the Ground. The garden then turns faster and faster while both Zones fade to black together and hold it.',
    prompts: ['Change the circle Transition in the Sky to a different shape and watch the same junction tell a different story.', 'Drag the two release curves apart so the Zones stop fading together, then put them back.'],
    guideHeading: 'building-a-complete-show',
    patternSlots: [['bloom'], ['garden'], ['mandala']],
    output: portableOutput(), zones, layouts: [splitLayout('layout-sky-ground', 'Sky and ground', zones, 'y')], scenes, composition,
  })
}

// 201 casts the sparsest moving Pattern in the 2D catalogue over the calmest
// full field. Measured at the 44x44 reference, ZRanger1's TimeFlies2D leaves
// 93% of the Stage dark (luma under 0.1) while its bugs stay visibly on the move (flux 0.111
// per 200 ms step), and Caustics fills every pixel with continuous motion, so
// the overlay's whole contribution is carried by its Opacity curve: when the
// curve is at zero the water is provably untouched, and everything that
// appears between 2s and 12s belongs to the second Layer. (The slot ran
// GlyphRain, 91% dark, before #727; the swarm is sparser still and the swap
// is measurement-neutral - mid-hold mix 0.098 vs 0.097 mean luminance,
// recovery 1.97x vs 1.99x through the same compile + replay probe.) The peak
// stops at 0.65 because Opacity is a mix, not an addition - at 0.85 the
// mostly-black swarm replaced the water almost completely (measured mean
// luminance fell from 0.24 to 0.065), which read as the bed failing rather
// than a second voice joining.
//
// The four-point curve is deliberate: this lesson is the working proof of the
// multi-keyframe animation editor (#363), so its prompts edit and add
// keyframes on the arrival-hold-departure arc rather than avoiding it.
function learn201(): StockShow {
  const id = 'stock-show-201-layers-property-animation'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('layers', 'Layers', 14, [clip('zone-1', 'Caustics', LESSON_TIME_SCALE)]),
  ]
  const composition: ShowCompositionV1 = {
    version: 1,
    // deterministic-loop withheld (#823): member state drifts at the Show
    // End wrap (measured); upgrade path is engine state snapshot/restore (#841).
    patternInstances: [
      instance('flies', 'TimeFlies2D', LESSON_TIME_SCALE),
      instance('water', 'Caustics', LESSON_TIME_SCALE),
    ],
    scenes: [{
      sceneId: 'layers',
      propertyTracks: [{
        // Arrival, hold, departure. The Clip occupies 2s-12s; the curve, not
        // the Clip boundary, is what the eye sees. Both Pattern clocks keep
        // running the whole time, so fading back in never rewinds the swarm.
        id: 'track-fly-opacity',
        target: { kind: 'placement-opacity', placementId: 'clip-flies' },
        keyframes: [
          keyframe('flies-arrive', 2, 0),
          keyframe('flies-hold', 4, 0.65),
          keyframe('flies-depart', 9, 0.65),
          keyframe('flies-gone', 12, 0),
        ],
      }],
      zones: [{
        zoneId: 'zone-1',
        // The bed never changes. One continuous Clip owns Main for the whole
        // Show so every visible change is attributable to the overlay Layer.
        main: [placement('clip-water', 'water', 0, 14)],
        overlays: [{
          id: 'layer-flies',
          name: 'Firefly overlay',
          placements: [{ ...placement('clip-flies', 'flies', 2, 10), opacity: 0 }],
        }],
      }],
    }],
    durationMs: 14_000,
  }
  return catalogue({
    id, title: 'Layers and Property Animation', track: 'portable', collection: 'learn', level: 200, order: 1,
    purpose: 'Layers blend pixels from different Clips into one picture: whatever a higher Layer draws is mixed over the Layers below it. Here TimeFlies2D plays on a Layer above Caustics, and one animated Opacity curve controls the mix.',
    notice: "The TimeFlies2D Clip starts at 2 s, but its Opacity starts at zero - nothing shows until the curve ramps up to 65%. It holds there, then ramps back to zero by the Clip's end. The Caustics Clip below never changes; the water dims only because the swarm is mixed over it.",
    prompts: ['Open the TimeFlies2D Clip, click the diamond next to Opacity, and drag both 65% keyframes down to 30% - the bugs drop back to a faint flicker over the water.', 'Click Add keyframe and pull the new middle point up to 100% - at 100% TimeFlies2D completely covers Caustics.'],
    guideHeading: 'layers-and-property-animation',
    patternSlots: [['water'], ['flies']],
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 202 teaches the frame (the Clip Viewport) and the picture inside it
// (Content) as two separately movable things.
// Harmonograph is the subject: its smooth continuous curves stay coherent
// while the frame and Content move (CompassRose's radial striations read as
// swimming under X/Y animation - review feedback), and a dimmed
// MetaballGarden bed makes every pixel the frame does not cover read as
// "lower Layer showing through" rather than as a rendering hole. The
// construction changes exactly one thing per Clip: the full picture, then
// the frame shrinking to a half-size corner crop, then the frame gliding to
// the center, then Content panning behind the now-stationary frame. All
// four Clips share one instance so nothing ever restarts at a junction.
function learn202(): StockShow {
  const id = 'stock-show-202-content-clip-viewport'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('viewport', 'Viewport', 16, [clip('zone-1', 'MetaballGarden', LESSON_TIME_SCALE)]),
  ]
  // Soft on purpose: this frame moves, and a travelling hard edge reads as a
  // rendering artifact rather than a frame. Smooth is the default the
  // curriculum teaches; Hard is 207's deliberate exception.
  const frame = { enabled: true, width: 0.5, height: 0.5, edge: 'soft' as const }
  const composition: ShowCompositionV1 = {
    version: 1,
    // deterministic-loop withheld (#823): member state drifts at the Show
    // End wrap (measured); upgrade path is engine state snapshot/restore (#841).
    patternInstances: [
      instance('curve', 'Harmonograph', LESSON_TIME_SCALE),
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
    ],
    scenes: [{
      sceneId: 'viewport',
      propertyTracks: [
        {
          // Then the opposite: the frame holds the center while Content pans
          // underneath it. Starting from neutral keeps the junction seamless.
          id: 'track-content-pan',
          target: { kind: 'placement-transform', placementId: 'clip-content-pan', property: 'positionX' },
          keyframes: [
            keyframe('pan-start', 12.5, 0, SINE_IN_OUT),
            keyframe('pan-east', 15.5, 0.3),
          ],
        },
        {
          id: 'track-frame-height',
          target: { kind: 'placement-viewport', placementId: 'clip-frame', property: 'height' },
          keyframes: [
            keyframe('height-full', 4, 1, SINE_IN_OUT),
            keyframe('height-half', 5.5, 0.5),
          ],
        },
        {
          // The frame glides from the corner to the center; the picture
          // underneath holds still.
          id: 'track-frame-move-x',
          target: { kind: 'placement-viewport', placementId: 'clip-frame-move', property: 'x' },
          keyframes: [
            keyframe('frame-x-corner', 8.5, 0, SINE_IN_OUT),
            keyframe('frame-x-center', 11.5, 0.25),
          ],
        },
        {
          id: 'track-frame-move-y',
          target: { kind: 'placement-viewport', placementId: 'clip-frame-move', property: 'y' },
          keyframes: [
            keyframe('frame-y-corner', 8.5, 0, SINE_IN_OUT),
            keyframe('frame-y-center', 11.5, 0.25),
          ],
        },
        {
          // The crop animates in: the frame shrinks from the full Stage to
          // half size while x and y stay pinned at zero.
          id: 'track-frame-width',
          target: { kind: 'placement-viewport', placementId: 'clip-frame', property: 'width' },
          keyframes: [
            keyframe('width-full', 4, 1, SINE_IN_OUT),
            keyframe('width-half', 5.5, 0.5),
          ],
        },
      ],
      zones: [{
        zoneId: 'zone-1',
        // The bed is deliberately dim so uncovered pixels are obviously the
        // lower Layer rather than black. 0.15 by measurement: the corner crop
        // shows the rose's dimmest quadrant (mean luma 0.17), and a 0.3 bed
        // came within 15% of it, which read as no frame at all.
        main: [{
          ...placement('clip-garden', 'garden', 0, 16),
          view: { mirror: false, phase: 0, brightness: 0.15 },
        }],
        overlays: [{
          id: 'layer-subject',
          name: 'Subject',
          placements: [
            // Establish: the full picture, no frame, so the subject is known
            // before anything crops it.
            { ...placement('clip-full', 'curve', 0, 4), opacity: 1 },
            // Width and height only; x and y stay zero, so the shrinking
            // frame crops the picture to the corner.
            { ...placement('clip-frame', 'curve', 4, 4), opacity: 1, viewport: { ...frame, x: 0, y: 0 } },
            { ...placement('clip-frame-move', 'curve', 8, 4), opacity: 1, viewport: { ...frame, x: 0, y: 0 } },
            { ...placement('clip-content-pan', 'curve', 12, 4), opacity: 1, viewport: { ...frame, x: 0.25, y: 0.25 } },
          ],
        }],
      }],
    }],
    durationMs: 16_000,
  }
  return catalogue({
    id, title: 'Content and Clip Viewport', track: 'portable', collection: 'learn', level: 200, order: 2,
    purpose: 'Think of a Clip as a picture in a frame. The Clip Viewport is the frame: resize it or move it to choose where on the Stage the Clip shows. Content is the picture: slide it underneath and a different part of the Pattern shows through a frame that stays put. Wherever the frame does not cover, the Layer below shows through.',
    notice: 'Four Clips, one change at a time. Harmonograph starts by filling the Stage. The frame then shrinks to half size, cropping the picture to the corner. Next the frame glides to the center. Last, the frame holds still while the picture pans underneath it. Harmonograph never restarts - all four Clips show the same Pattern instance.',
    prompts: ['On the last Clip, drag Content up or down - the frame stays put while a different part of the picture slides into view.', 'On the second Clip, widen the frame until the whole picture fits inside it again.'],
    guideHeading: 'content-and-clip-viewport',
    patternSlots: [['garden'], ['curve']],
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 207 extends 202's frame construction with the shaped apertures from
// #591/#678: a subject behind a half-size frame over a dim bed. The subject
// stays CompassRose (unlike 202's Harmonograph recast): nothing moves here,
// so its striations cannot swim, and its cardinal arms make every
// silhouette's coverage obvious. Shaped
// apertures feather Soft by default and the lesson keeps that default -
// smooth is what people want - so the passages run rectangle, soft ellipse,
// soft ring, and then the one deliberate exception: the same Ring cut Hard.
// The Ring passage is the visceral one - the bed shows straight through its
// center, which no rectangle can do. Everything holds still on purpose:
// motion belongs to 202, and the full silhouette-by-edge matrix belongs to
// the Aperture Shapes reference.
function learn207(): StockShow {
  const id = 'stock-show-207-aperture-shapes-edges'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('silhouettes', 'Silhouettes', 20, [clip('zone-1', 'MetaballGarden', LESSON_TIME_SCALE)]),
  ]
  const frame = { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
  const composition: ShowCompositionV1 = {
    version: 1,
    executionModel: 'deterministic-loop',
    patternInstances: [
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
      instance('rose', 'CompassRose', LESSON_TIME_SCALE),
    ],
    scenes: [{
      sceneId: 'silhouettes',
      zones: [{
        zoneId: 'zone-1',
        main: [{
          ...placement('clip-garden', 'garden', 0, 20),
          view: { mirror: false, phase: 0, brightness: 0.3 },
        }],
        overlays: [{
          id: 'layer-subject',
          name: 'Subject',
          placements: [
            // The 202 recap: the same Soft-feathered frame 202 leaves you
            // with, so the edge treatment is constant from the first passage
            // and silhouette is genuinely the only variable.
            { ...placement('clip-rectangle', 'rose', 0, 4), opacity: 1, viewport: { ...frame, edge: 'soft' } },
            // Shaped apertures keep their Soft default: only the silhouette
            // changes, exactly as it does when an author picks a shape in
            // the inspector.
            { ...placement('clip-ellipse', 'rose', 4, 4), opacity: 1, viewport: { ...frame, aperture: 'ellipse' } },
            // One icon shape shows the catalogue reaches past geometry (#691)
            // without touring it; the full sectioned matrix belongs to the
            // two Aperture references.
            { ...placement('clip-star', 'rose', 8, 4), opacity: 1, viewport: { ...frame, aperture: 'star' } },
            { ...placement('clip-ring', 'rose', 12, 4), opacity: 1, viewport: { ...frame, aperture: 'ring' } },
            // The one deliberate exception: the same Ring cut Hard, so the
            // learner sees what choosing Hard actually means.
            { ...placement('clip-ring-hard', 'rose', 16, 4), opacity: 1, viewport: { ...frame, aperture: 'ring', edge: 'hard' } },
          ],
        }],
      }],
    }],
    durationMs: 20_000,
  }
  return catalogue({
    id, title: 'Aperture Shapes and Edges', track: 'portable', collection: 'learn', level: 200, order: 7,
    purpose: 'The aperture from 202 has a shape of its own. The Clip Viewport picks a silhouette from a catalogue - Geometric shapes like the Ellipse, Diamond, and Ring, Icons like the Heart, Star, and Cloud, and the Signature cats - and every silhouette has an edge: Soft feathering by default, with Hard and Stable Dither as deliberate alternatives. A silhouette can rotate inside its axis-aligned frame, and its Mode can flip from admitting the inside to cutting it out. Shape and edge belong to the Clip, separate from Content and from Effects.',
    notice: 'Nothing moves in this lesson: the frame stays put and only the silhouette changes, Clip by Clip - Rectangle, Ellipse, Star, then Ring. Every edge is the Soft default until the last Clip, which cuts the same Ring with a Hard edge. The Ring makes the comparison easy: the lower Layer shows through its open center, and hardening the edge shows exactly what the feather was smoothing.',
    prompts: ['Rotate the Star, then flip its Mode to Cut out - the frame stays axis-aligned while the silhouette turns, and Cut out removes exactly the pixels Admit was showing.', 'On the last Clip, switch the Hard edge back to Soft, then try Stable Dither: it trades the smooth ramp for a per-pixel speckle that never shimmers.'],
    guideHeading: 'aperture-shapes-and-edges',
    patternSlots: [['garden'], ['rose']],
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 203 needs a source whose state is unmistakable at a glance. Measured across
// the 2D catalogue, IQPalettes drifts further from itself over twelve seconds
// than anything else that stays calm frame to frame (d12s=0.26 at the lesson
// clock), because its whole identity is which palette world it currently
// occupies. A restart therefore reads as the color world snapping back, and a
// shared clock reads as the world staying put across a junction.
function learn203(): StockShow {
  const id = 'stock-show-203-pattern-instance-lifecycle'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('lifecycle', 'Lifecycle', 16, [clip('zone-1', 'IQPalettes', LESSON_TIME_SCALE)]),
  ]
  const composition: ShowCompositionV1 = {
    version: 1,
    // deterministic-loop withheld (#823): member state drifts at the Show
    // End wrap (measured); upgrade path is engine state snapshot/restore (#841).
    patternInstances: [
      instance('palette-fresh', 'IQPalettes', LESSON_TIME_SCALE),
      instance('palette-shared', 'IQPalettes', LESSON_TIME_SCALE),
    ],
    scenes: [{
      sceneId: 'lifecycle',
      zones: [{
        zoneId: 'zone-1',
        main: [
          // A Split: two Clips, one instance, one continuous picture. The Cut
          // at 4s changes nothing on the Stage because the Pattern instance
          // never noticed it.
          placement('clip-opening', 'palette-shared', 0, 4),
          placement('clip-continued', 'palette-shared', 4, 4),
          // An ordinary duplicate: same Pattern, new instance, so the color
          // world restarts from the beginning while the first instance's
          // state lives on unseen.
          placement('clip-duplicate', 'palette-fresh', 8, 4),
          // Rejoining the shared instance: its clock only runs while a Clip
          // presents it (measured: the rejoined frame matches the paused
          // state, not the wall clock), so the world resumes exactly where
          // the duplicate interrupted it.
          placement('clip-rejoined', 'palette-shared', 12, 4),
        ],
        overlays: [],
      }],
    }],
    durationMs: 16_000,
  }
  return catalogue({
    id, title: 'Pattern Instance Lifecycle', track: 'portable', collection: 'learn', level: 200, order: 3,
    purpose: 'A Pattern instance owns its own state and clock. Clips only present it. Two Clips can share one instance so the picture continues across their junction, while a duplicated Clip gets a fresh instance that starts over.',
    notice: 'The junction at 4 s changes nothing: both Clips share one instance. At 8 s the same Pattern restarts from the beginning, because that Clip owns a fresh instance. At 12 s the shared instance returns and resumes exactly where it was interrupted - an instance clock only runs while a Clip presents it.',
    prompts: ['Select the third Clip and rejoin it to the shared Pattern instance, then watch the 8 s junction stop mattering.', 'Make the last Clip independent instead, and compare where its colors land.'],
    guideHeading: 'pattern-instance-lifecycle',
    patternSlots: [['palette-shared', 'palette-fresh']],
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 204 compares five presentations of one drifting palette field. The cast is
// measured, not chosen by eye: IQPalettes carries the strongest full-channel
// motion of the candidates (0.157 mean RGB change over two seconds at the
// lesson clock), and 203 already establishes it as the level's diagnostic
// source. (The cast originally also dodged a lowering defect: before #663 a
// stepped clock rendered its whole first window ahead of the first
// beforeRender delivery, which broke Patterns like Caustics that compute
// render state there. The priming delivery removed that constraint; every
// Pattern is now safe to Stutter.) The Stutter passage owns a second
// instance because Stutter quantizes the Pattern-instance clock itself;
// giving it the shared instance would stutter every other Clip too.
function learn204(): StockShow {
  const id = 'stock-show-204-presentation-modes'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('presentation', 'Presentation', 15, [clip('zone-1', 'IQPalettes', LESSON_TIME_SCALE)]),
  ]
  const composition: ShowCompositionV1 = {
    version: 1,
    // deterministic-loop withheld (#823): member state drifts at the Show
    // End wrap (measured); upgrade path is engine state snapshot/restore (#841).
    patternInstances: [
      instance('palette', 'IQPalettes', LESSON_TIME_SCALE),
      {
        id: 'palette-stuttered',
        pattern: { kind: 'stock', id: 'IQPalettes' },
        patternName: 'IQPalettes',
        time: { timeScale: LESSON_TIME_SCALE, timeOffsetMs: 0, steppedClock: { stepMs: 500 } },
      },
    ],
    scenes: [{
      sceneId: 'presentation',
      zones: [{
        zoneId: 'zone-1',
        main: [
          placement('clip-live', 'palette', 0, 3),
          { ...placement('clip-freeze', 'palette', 3, 3), presentation: { mode: 'freeze' } },
          { ...placement('clip-strobe', 'palette', 6, 3), presentation: { mode: 'strobe', cadenceMs: 400 } },
          { ...placement('clip-blink', 'palette', 9, 3), blink: { rateHz: 1, duty: 0.5, phase: 0 } },
          placement('clip-stutter', 'palette-stuttered', 12, 3),
        ],
        overlays: [],
      }],
    }],
    durationMs: 15_000,
  }
  return catalogue({
    id, title: 'Presentation Modes', track: 'portable', collection: 'learn', level: 200, order: 4,
    purpose: 'Presentation changes how one Clip shows a running Pattern without touching the Pattern itself. Freeze holds the arrival frame, Strobe refreshes it on a fixed beat, and Blink gates visibility on and off while time keeps passing underneath.',
    notice: 'Live, Freeze, Strobe, and Blink all present the same Pattern instance, and its clock never stops. The last Clip is different in kind: Stutter quantizes the instance clock itself, so it owns a second instance.',
    prompts: ['Compare Freeze with Blink: Freeze holds a still picture and Blink hides a moving one. The clock never stops in either, so watch where the colors have gotten to when each Clip ends.', 'Change the Stutter step and watch the whole Clip snap on a different beat.'],
    guideHeading: 'presentation-modes',
    patternSlots: [['palette', 'palette-stuttered']],
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 205 builds one short phrase - a mandala pulse and its smaller offset echo -
// and places it twice. The phrase runs over quiet linework so both occurrences
// stay attributable, the second occurrence is translated so reuse does not
// read as a replay of the same pixels, and each occurrence materializes its
// own Pattern instances so the two pulses never share private state.
function learn205(): StockShow {
  const id = 'stock-show-205-groups-linked-reuse'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('reuse', 'Reuse', 16, [clip('zone-1', 'RibbonLoom', LESSON_TIME_SCALE)]),
  ]
  const composition: ShowCompositionV1 = {
    version: 1,
    executionModel: 'deterministic-loop',
    patternInstances: [instance('loom', 'RibbonLoom', LESSON_TIME_SCALE)],
    scenes: [{
      sceneId: 'reuse',
      zones: [{
        zoneId: 'zone-1',
        main: [placement('clip-loom', 'loom', 0, 16)],
        overlays: [],
      }],
    }],
    groupDefinitions: [{
      id: 'group-pulse',
      name: 'Mandala pulse',
      patternInstances: [instance('pulse', 'SignalMandala', LESSON_TIME_SCALE)],
      placements: [
        { ...placement('pulse-lead', 'pulse', 0, 4), opacity: 0, layerOffset: 0 },
        {
          ...placement('pulse-echo', 'pulse', 1, 3),
          opacity: 0,
          layerOffset: 1,
          transform: { ...NEUTRAL_SHOW_CLIP_TRANSFORM, positionX: 0.2, positionY: -0.14, scaleX: 0.6, scaleY: 0.6 },
        },
      ],
      propertyTracks: [
        {
          id: 'track-pulse-echo',
          target: { kind: 'placement-opacity', placementId: 'pulse-echo' },
          keyframes: [keyframe('echo-in', 1, 0), keyframe('echo-peak', 2.5, 0.55), keyframe('echo-out', 4, 0)],
        },
        {
          id: 'track-pulse-lead',
          target: { kind: 'placement-opacity', placementId: 'pulse-lead' },
          keyframes: [keyframe('lead-in', 0, 0), keyframe('lead-peak', 1.5, 0.9), keyframe('lead-out', 4, 0)],
        },
      ],
    }],
    groupOccurrences: [
      {
        id: 'occurrence-first',
        definitionId: 'group-pulse',
        sceneId: 'reuse',
        zoneId: 'zone-1',
        startMs: 2_000,
        baseLayer: 1,
        translationX: 0,
        translationY: 0,
      },
      {
        // The linked duplicate: same definition, its own fresh instances,
        // moved so reuse reads as a second performance rather than a replay.
        id: 'occurrence-second',
        definitionId: 'group-pulse',
        sceneId: 'reuse',
        zoneId: 'zone-1',
        startMs: 9_000,
        baseLayer: 1,
        translationX: -0.18,
        translationY: 0.12,
      },
    ],
    durationMs: 16_000,
  }
  return catalogue({
    id, title: 'Groups and Linked Reuse', track: 'portable', collection: 'learn', level: 200, order: 5,
    purpose: 'A Group definition is choreography you can reuse. Each occurrence places the whole thing - here a mandala pulse and its smaller echo, across two Layers - and every occurrence gets its own fresh Pattern instances, so linked copies repeat the choreography without sharing private state.',
    notice: 'Both pulses come from one definition. Edit it once and both occurrences change. The second occurrence is moved on the Stage, and its mandala runs on its own instance rather than continuing the first one.',
    prompts: ['Open the Group definition and move the echo one second later - both occurrences pick up the change.', 'Make the second occurrence unique, then change only its echo and compare the two.'],
    guideHeading: 'groups-and-linked-reuse',
    patternSlots: [['loom']],
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 206 restates topology on the same ruler: full surface, an axis-aligned
// split, and rings. The 105 pairing returns because it is already proven to
// separate cleanly at a boundary (re-proven for the IceFloes2D water voice by
// the #727 probe: 83-degree boundary hue contrast at matched luminance); what
// is new here is only the Layout, which is the point. The loom instance runs
// through every interval without restarting, so the learner can see that
// changing the Layout re-routes pixels without touching Pattern state. The
// two boundaries deliberately differ: the first sweeps the new Layout across
// the Stage, the second restates it in one atomic step.
function learn206(): StockShow {
  const id = 'stock-show-206-changing-zone-layouts'
  const zones = logicalZones(['Weave', 'Water'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('full', 'Full surface', 5, [clip('zone-1', 'RibbonLoom', LESSON_TIME_SCALE)]),
    scene('split', 'Split', 6, [
      clip('zone-1', 'RibbonLoom', LESSON_TIME_SCALE),
      clip('zone-2', 'IceFloes2D', LESSON_TIME_SCALE),
    ], { splitPosition: 0.5 }),
    scene('rings', 'Rings', 6, [
      clip('zone-1', 'RibbonLoom', LESSON_TIME_SCALE),
      clip('zone-2', 'IceFloes2D', LESSON_TIME_SCALE),
    ]),
  ]
  const composition: ShowCompositionV1 = {
    version: 1,
    // deterministic-loop withheld (#823): the full-scene wrap census could not
    // prove exact Show End reset for this record (member state drift, or a
    // transition-extended timeline the census cannot phase-lock); upgrade
    // path is engine state snapshot/restore (#841).
    patternInstances: [
      instance('loom', 'RibbonLoom', LESSON_TIME_SCALE),
      instance('water', 'IceFloes2D', LESSON_TIME_SCALE),
    ],
    scenes: [
      {
        sceneId: 'full',
        zones: [
          { zoneId: 'zone-1', main: [placement('clip-full-loom', 'loom', 0, 5)], overlays: [] },
          { zoneId: 'zone-2', main: [], overlays: [] },
        ],
      },
      {
        sceneId: 'split',
        zones: [
          { zoneId: 'zone-1', main: [placement('clip-split-loom', 'loom', 0, 6)], overlays: [] },
          { zoneId: 'zone-2', main: [placement('clip-split-water', 'water', 0, 6)], overlays: [] },
        ],
      },
      {
        sceneId: 'rings',
        zones: [
          { zoneId: 'zone-1', main: [placement('clip-rings-loom', 'loom', 0, 6)], overlays: [] },
          { zoneId: 'zone-2', main: [placement('clip-rings-water', 'water', 0, 6)], overlays: [] },
        ],
      },
    ],
    durationMs: 17_000,
  }
  const transitions: ShowBoundaryTransition[] = [
    { id: 'transition-full', afterSceneId: 'full', kind: 'cut', durationMs: 0, easing: LINEAR },
    // The first restatement travels: the split sweeps in across the Stage,
    // which is Layout motion owned by the routing boundary itself.
    {
      id: 'routing-full-split', afterSceneId: 'full', kind: 'routing', durationMs: 1_500,
      easing: SINE_IN_OUT, layoutId: 'layout-split', routingDirection: 'forward',
    },
    { id: 'transition-split', afterSceneId: 'split', kind: 'cut', durationMs: 0, easing: LINEAR },
    // The second restatement is atomic: zero duration, one step, so the two
    // boundary styles can be compared inside one Show.
    { id: 'routing-split-rings', afterSceneId: 'split', kind: 'routing', durationMs: 0, easing: LINEAR, layoutId: 'layout-rings' },
  ]
  return catalogue({
    id, title: 'Changing Zone Layouts', track: 'portable', collection: 'learn', level: 200, order: 6,
    purpose: 'A Zone Layout can change partway through a Show: this timeline plays full surface, then a split, then rings, one after another. The Zones keep their names and their Patterns; only the geometry that routes pixels to them changes.',
    notice: 'The weave never restarts at a Layout boundary. The first boundary sweeps the split across the Stage; the second switches to Rings in one atomic step. Neither is a visual Transition - pixels are re-routed, not blended.',
    prompts: ['Drag the split position in the middle interval - the Layout owns that geometry, and the Patterns on either side never notice.', 'Insert time before the Rings boundary: the Layout change stays attached to the timeline around it and moves along with it.'],
    guideHeading: 'changing-zone-layouts',
    patternSlots: [['loom'], ['water']],
    output: portableOutput(), zones,
    layouts: [
      { id: 'layout-full', name: 'Full Surface', zones: [], logical: { kind: 'single', zoneIds: [zones[0].id] } },
      { id: 'layout-split', name: 'Moving Split', zones: [], logical: { kind: 'split', zoneIds: [zones[0].id, zones[1].id], axis: 'x' } },
      { id: 'layout-rings', name: 'Rings', zones: [], logical: { kind: 'rings', zoneIds: [zones[0].id, zones[1].id], rings: 2 } },
    ],
    scenes, transitions, composition,
  })
}

// 301 moves the curriculum onto physical output. The Proscenium stage is the
// installation: 1,000 LEDs walked in wiring order - left column 0-249, stage
// field 250-499, arch band 500-749, right column 750-999 - so the Columns
// Zone owns two non-contiguous ranges at opposite ends of the index space,
// the several-ranges case made physical. Casting was probed on this geometry at the
// lesson clock (#705): MetaballGarden, IQPalettes, and CompassRose are three
// calm fields from three hue families - green 134°, warm 31°, blue 236° -
// each unmistakably alive (0.19-0.39 mean luminance, flux ≤ 0.021 per
// 200 ms step). A near-dark voice reads as the coverage fault this lesson
// teaches the learner to diagnose, so quiet center-weighted fields
// (ShapeShifter 0.07, Harmonograph 0.07) were rejected; PlasmaNebula scored
// well standalone but compiles to black through the Show pipeline (#708),
// so the blue voice is the show-proven CompassRose. The halfway trade
// mirrors 105 exactly: stage and columns swap Patterns in one Cut while the
// arch holds and the ranges never move. Unlike the portable lessons, these
// three fields run above the lesson clock: at 0.32 the calm casting reads as
// a still image on the big stage, so each voice carries a hand-tuned speed
// from live review on the rebuilt arch geometry (#835).
function learn301(): StockShow {
  const id = 'stock-show-301-installation-mapping'
  const GARDEN_TIME_SCALE = 1.8
  const PALETTES_TIME_SCALE = 2.84
  const ROSE_TIME_SCALE = 1.08
  const zones = physicalZones(['Stage', 'Arch', 'Columns'], [250, 250, 500])
  const scenes: SceneSpec[] = [
    scene('stage', 'One stage', 14, [
      clip('zone-1', 'MetaballGarden', GARDEN_TIME_SCALE),
      clip('zone-2', 'IQPalettes', PALETTES_TIME_SCALE),
      clip('zone-3', 'CompassRose', ROSE_TIME_SCALE),
    ]),
  ]
  const composition: ShowCompositionV1 = {
    version: 1,
    // deterministic-loop withheld (#823): member state drifts at the Show
    // End wrap (measured); upgrade path is engine state snapshot/restore (#841).
    patternInstances: [
      instance('garden', 'MetaballGarden', GARDEN_TIME_SCALE),
      instance('palettes', 'IQPalettes', PALETTES_TIME_SCALE),
      instance('rose', 'CompassRose', ROSE_TIME_SCALE),
    ],
    scenes: [{
      sceneId: 'stage',
      zones: [
        {
          // The Cut lands at the same instant on stage and columns, so the
          // Patterns trade surfaces in one move while the ranges never change.
          zoneId: 'zone-1',
          overlays: [],
          main: [placement('clip-floor-garden', 'garden', 0, 7), placement('clip-floor-rose', 'rose', 7, 7)],
        },
        {
          zoneId: 'zone-2',
          overlays: [],
          main: [placement('clip-arch-palettes', 'palettes', 0, 14)],
        },
        {
          zoneId: 'zone-3',
          overlays: [],
          main: [placement('clip-towers-rose', 'rose', 0, 7), placement('clip-towers-garden', 'garden', 7, 7)],
        },
      ],
    }],
    durationMs: 14_000,
  }
  return normalizedCatalogue({
    id, title: 'Installation Mapping', track: 'installation', collection: 'learn', level: 300, order: 1,
    purpose: 'An Installation Show gives up portability on purpose. It promises one exact output - this proscenium stage, 1,000 measured LEDs - and in exchange each named Zone owns real pixels: a physical range over the map instead of a share of an abstract surface. Together the ranges must cover the output exactly once.',
    notice: "The ranges restate the installer's walk: left column first, then the stage field, the arch band over the apex, and the right column last. That walk is why the Columns Zone owns two ranges at opposite ends of the index space - 0-249 and 750-999 - one physical role, two stretches of wire. At the halfway junction the stage and the columns trade Patterns while the arch holds; the ranges themselves never move.",
    prompts: ['Open the Columns Zone in the map selector: one Zone, two separate ranges, and selecting its pixels spatially edits the same fact as the numbers.', 'Now break it on purpose - remove a few pixels from one column and watch the coverage diagnostic count the gap. Repair it, or use Reset to restore the pristine lesson.'],
    guideHeading: 'installation-output-and-physical-ranges',
    patternSlots: [['garden'], ['palettes'], ['rose']],
    output: { kind: 'installation', mapId: 'proscenium-stage-2d', pixelCount: 1_000 },
    zones,
    layouts: [physicalLayout('layout-stage', 'Proscenium stage', zones, [
      [[250, 499]], [[500, 749]], [[0, 249], [750, 999]],
    ])],
    scenes,
    composition,
  })
}

// 302 spends its whole variety budget on one Pattern instance: a single
// Harmonograph render drives all five surfaces of the Redline stage (Jon's
// "one clock" brief, #706). Harmonograph over MetaballGarden for the solo:
// livelier motion and the tightest single-hue field in the roster
// (yellow-orange, hue 63°), so placement-phase rotations read as clean new
// colors - phase is compiled as `hsv(h + adapt_phase, ...)` inside the
// shared member's sink, the cheapest voice in the toolkit. The arc
// introduces one tier per junction: geometry alone (the same frame lands as
// a panel and four radial blooms), then free adaptations (the hue-wheel
// quartet at 0/0.25/0.5/0.75, a mirror pair), then Effects (quarter-frame
// translate windows under wrap, a posterize pair), then property animation
// (two timed invert pulses flashing the hero's dark field on the beat).
// Clips split mid-passage so each new voice arrives as its own visible
// event, and from the quartet's arrival the colors never sit still: at each
// change beat the four phases move corners by a different rule - rotate
// clockwise, swap diagonals, rotate back - within a split-complementary
// gold/blue family rather than full-spectrum primaries, and every move GLIDES via
// placement-view phase tracks with staggered starts, so color travels
// around the ring as a wave instead of snapping. That glide is also the
// transition policy: full five-Zone crossfade boundaries measured ~20
// budget points each, while phase tracks are score data on the same single
// machine, so the junctions stay Cuts and the color motion carries the ease.
// Three solo events give single satellites their own moments at different
// times - an iris breath (vignette radius), a slow half-turn spin (rotate
// turns), a posterize crush to two levels - all property tracks over the
// same one machine; trails/persistence effects do not exist in the toolkit
// (Effects are stateless per-frame). The whole Show runs at twice the curriculum clock (0.64,
// still under the 0.7 legibility pin) because a solo Harmonograph at lesson
// speed reads sedate. Junctions are Cuts (crossfading five physical Zones
// measured ~20 budget points per boundary), so the 6/8/6-second holds make
// a 20-second Show, and the artifact inventory prices the whole score at
// one physical machine.
function learn302(): StockShow {
  const id = 'stock-show-302-installation-composition'
  // One shared clock for the whole Show, like every lesson - just faster.
  const SOLO_TIME_SCALE = 0.64
  const zones = physicalZones(
    ['Hero panel', 'Left upper', 'Left lower', 'Right upper', 'Right lower'],
    [800, 300, 300, 300, 300],
  )
  const scenes: SceneSpec[] = [
    scene('render', 'One render', 6, [
      clip('zone-1', 'Harmonograph', SOLO_TIME_SCALE),
      ...zones.slice(1).map((zone) => clip(zone.id, 'Harmonograph', SOLO_TIME_SCALE)),
    ]),
    scene('windows', 'Quarter windows', 8, [
      clip('zone-1', 'Harmonograph', SOLO_TIME_SCALE),
      ...zones.slice(1).map((zone) => clip(zone.id, 'Harmonograph', SOLO_TIME_SCALE)),
    ]),
    scene('answer', 'Answer', 6, [
      clip('zone-1', 'Harmonograph', SOLO_TIME_SCALE),
      ...zones.slice(1).map((zone) => clip(zone.id, 'Harmonograph', SOLO_TIME_SCALE)),
    ]),
  ]
  // The palette quartet in motion. Even quarter turns read as unrelated
  // primaries, so the four phases are instead a split-complementary family
  // drawn from Harmonograph's own gold base (~63°): gold, warm yellow
  // (+0.05), azure (+0.42), and blue-violet (+0.5) - two warms, two cools,
  // one scheme. Satellites sit LU/LL/RU/RL (zone order); each segment
  // reassigns the same four phases to corners by a different rule, so the
  // colors travel at every change beat: the quartet deals clockwise, then
  // rotates one corner clockwise, then swaps diagonals, then rotates back
  // counter-clockwise.
  const GOLD = 0
  const YELLOW = 0.05
  const AZURE = 0.42
  const VIOLET = 0.5
  const QUARTET_SEGMENTS = {
    deal: [GOLD, VIOLET, YELLOW, AZURE],
    rotated: [VIOLET, AZURE, GOLD, YELLOW],
    swapped: [YELLOW, GOLD, AZURE, VIOLET],
    returned: [AZURE, YELLOW, VIOLET, GOLD],
  } as const
  // Every reassignment GLIDES instead of snapping: a phase track sweeps each
  // corner from its previous hue to its next one, starts staggered 0.2s per
  // satellite so the move travels around the ring as a wave. Full five-Zone
  // crossfade boundaries measured ~20 budget points each; these glides are
  // score data on the same single machine, and they turn the change beats
  // themselves into the transition.
  // One phase track per placement carries that passage's whole color
  // journey as (time, value) stops; integer milliseconds because the record
  // validator rejects fractional keyframe times, and 0.2s staggers per
  // satellite so every move travels around the ring as a wave.
  const phaseJourney = (
    placementId: string,
    satellite: number,
    stops: ReadonlyArray<readonly [number, number]>,
  ) => ({
    id: `glide-${placementId}`,
    target: { kind: 'placement-view' as const, placementId, property: 'phase' as const },
    keyframes: stops.map(([seconds, value], index) => ({
      id: `glide-${placementId}-${index}`,
      timeMs: seconds * 1_000 + satellite * 200,
      value,
      easing: SINE_IN_OUT,
    })),
  })
  const journeys = (
    idSuffix: string,
    stopsFor: (satellite: number) => ReadonlyArray<readonly [number, number]>,
  ) => [0, 1, 2, 3].flatMap((satellite) => {
    const stops = stopsFor(satellite)
    return new Set(stops.map(([, value]) => value)).size > 1
      ? [phaseJourney(`satellite-${satellite + 1}-${idSuffix}`, satellite, stops)]
      : []
  })
  // From the windows passage on, two satellites also carry a structural
  // identity so their MOTION reads differently, not just their color: the
  // ripple bends Left-upper into concentric rings, the kaleidoscope folds
  // Right-upper into six-fold symmetry. Both are coordinate warps on the
  // same single render - structure is cheated in the address space, never
  // with a second machine.
  const windowEffects = (satellite: number): ShowClipEffect[] => [
    { id: `window-shift-${satellite + 1}`, kind: 'translate', x: satellite * 0.25, y: 0 },
    { id: `window-wrap-${satellite + 1}`, kind: 'wrap' },
    ...(satellite === 0 ? [{ id: 'rings-1', kind: 'ripple' as const, amount: 0.34, frequency: 5, phase: 0, centerX: 0.5, centerY: 0.5 }] : []),
    ...(satellite === 2 ? [{ id: 'kaleido-3', kind: 'kaleidoscope' as const, amount: 1, segments: 6, rotation: 0, centerX: 0.5, centerY: 0.5 }] : []),
  ]
  const satellitePlacement = (
    placementId: string,
    startSeconds: number,
    durationSeconds: number,
    options: { phase?: number; mirror?: boolean; effects?: ShowClipEffect[] } = {},
  ) => ({
    ...placement(placementId, 'pendulum', startSeconds, durationSeconds),
    view: { mirror: options.mirror ?? false, phase: options.phase ?? 0, brightness: 1 },
    ...(options.effects ? { effects: options.effects } : {}),
  })
  const composition: ShowCompositionV1 = {
    version: 1,
    // deterministic-loop withheld (#823): member state drifts at the Show
    // End wrap (measured); upgrade path is engine state snapshot/restore (#841).
    patternInstances: [
      // The only instance in the Show: one clock, one machine, five surfaces.
      instance('pendulum', 'Harmonograph', SOLO_TIME_SCALE),
    ],
    scenes: [
      {
        sceneId: 'render',
        // Plain for three seconds - geometry is the only difference - then
        // the quartet hues glide in as a staggered wave.
        propertyTracks: journeys('render', (satellite) => [
          [3, 0],
          [4, QUARTET_SEGMENTS.deal[satellite]],
        ]),
        zones: [
          { zoneId: 'zone-1', overlays: [], main: [placement('hero-render', 'pendulum', 0, 6)] },
          ...zones.slice(1).map((zone, satellite) => ({
            zoneId: zone.id,
            overlays: [],
            main: [satellitePlacement(`satellite-${satellite + 1}-render`, 0, 6, {
              phase: QUARTET_SEGMENTS.deal[satellite],
            })],
          })),
        ],
      },
      {
        sceneId: 'windows',
        propertyTracks: [
          // Each satellite's whole color journey for this passage: glide to
          // the rotated corner on arrival, hold, then the diagonal swap.
          ...journeys('window', (satellite) => [
            [0, QUARTET_SEGMENTS.deal[satellite]],
            [1, QUARTET_SEGMENTS.rotated[satellite]],
            [4, QUARTET_SEGMENTS.rotated[satellite]],
            [5, QUARTET_SEGMENTS.swapped[satellite]],
          ]),
          // Two solo events, one satellite at a time: Left-lower's iris
          // breath in the first half, Right-lower's slow half-turn spin in
          // the second.
          {
            id: 'track-iris-breath',
            target: { kind: 'placement-effect' as const, placementId: 'satellite-2-window', effectId: 'iris-2', effectKind: 'vignette' as const, parameterId: 'radius' },
            keyframes: [
              keyframe('iris-open', 0.6, 2),
              keyframe('iris-closed', 1.8, 0.45),
              keyframe('iris-reopen', 3.2, 2),
            ],
          },
          {
            id: 'track-satellite-spin',
            target: { kind: 'placement-effect' as const, placementId: 'satellite-4-window', effectId: 'window-turn-4', effectKind: 'rotate' as const, parameterId: 'turns' },
            keyframes: [
              keyframe('spin-rest', 4.2, 0.25),
              keyframe('spin-half', 7.8, 0.75),
            ],
          },
        ],
        zones: [
          { zoneId: 'zone-1', overlays: [], main: [placement('hero-windows', 'pendulum', 0, 8)] },
          ...zones.slice(1).map((zone, satellite) => ({
            zoneId: zone.id,
            overlays: [],
            main: [satellitePlacement(`satellite-${satellite + 1}-window`, 0, 8, {
              phase: QUARTET_SEGMENTS.swapped[satellite],
              effects: satellite === 1 ? [
                ...windowEffects(satellite),
                // Left-lower's solo iris; its three siblings hold steady.
                { id: 'iris-2', kind: 'vignette' as const, amount: 1, radius: 2, softness: 0.5, centerX: 0.5, centerY: 0.5, aspect: 1 },
              ] : satellite === 3 ? [
                ...windowEffects(satellite),
                { id: 'window-turn-4', kind: 'rotate' as const, turns: 0.25 },
              ] : windowEffects(satellite),
            })],
          })),
        ],
      },
      {
        sceneId: 'answer',
        propertyTracks: [...journeys('answer', (satellite) => [
          [0, QUARTET_SEGMENTS.swapped[satellite]],
          [1, QUARTET_SEGMENTS.returned[satellite]],
        ]), {
          // Right-upper's solo: its posterize crushes to two levels and
          // recovers between the hero's two pulses.
          id: 'track-posterize-crush',
          target: { kind: 'placement-effect' as const, placementId: 'satellite-3-answer', effectId: 'answer-posterize-3', effectKind: 'posterize' as const, parameterId: 'levels' },
          keyframes: [
            keyframe('crush-rest', 0.8, 4),
            keyframe('crush-deep', 2.6, 2),
            keyframe('crush-recover', 4.4, 4),
          ],
        }, {
          id: 'track-hero-pulse',
          target: {
            kind: 'placement-effect',
            placementId: 'hero-answer',
            effectId: 'hero-invert',
            effectKind: 'invert',
            parameterId: 'amount',
          },
          // Two deliberate beats: the dark field snaps to its negative and
          // back, and the whole stage answers while the render never blinks.
          keyframes: [
            keyframe('pulse-rest', 0, 0, LINEAR),
            keyframe('pulse-one-up', 1.9, 0, LINEAR),
            keyframe('pulse-one-peak', 2.1, 1, LINEAR),
            keyframe('pulse-one-down', 2.5, 0, LINEAR),
            keyframe('pulse-two-up', 3.9, 0, LINEAR),
            keyframe('pulse-two-peak', 4.1, 1, LINEAR),
            keyframe('pulse-two-down', 4.5, 0, LINEAR),
          ],
        }],
        zones: [
          {
            zoneId: 'zone-1',
            overlays: [],
            main: [{
              ...placement('hero-answer', 'pendulum', 0, 6),
              effects: [{ id: 'hero-invert', kind: 'invert' as const, amount: 0 }],
            }],
          },
          ...zones.slice(1).map((zone, satellite) => ({
            zoneId: zone.id,
            overlays: [],
            main: [
              satellitePlacement(`satellite-${satellite + 1}-answer`, 0, 6, {
                phase: QUARTET_SEGMENTS.returned[satellite],
                mirror: satellite < 2,
                effects: satellite < 2 ? windowEffects(satellite) : [
                  ...windowEffects(satellite),
                  { id: `answer-posterize-${satellite + 1}`, kind: 'posterize' as const, levels: 4, amount: 1 },
                ],
              }),
            ],
          })),
        ],
      },
    ],
    durationMs: 20_000,
  }
  return normalizedCatalogue({
    id, title: 'Installation Composition', track: 'installation', collection: 'learn', level: 300, order: 2,
    purpose: 'This Show spends its entire variety budget on one Pattern instance: a single Harmonograph render drives all five surfaces of the Redline stage. Geometry deals the first difference - the same frame lands as a panel in the middle and four radial blooms around it - and every further voice costs only a per-Clip adaptation or Effect: a hue phase, a shifted window, a mirror, a posterize, a timed invert.',
    notice: "Halfway through the first passage the satellites split into a four-hue family - gold, warm yellow, azure, blue-violet, a split-complementary scheme built on the render's own base color - by placement phase alone: the compiled artifact adds one number inside the shared hsv call, the cheapest voice in the toolkit. From then on the colors never sit still: at each change beat the four hues glide to new corners by a different rule - a clockwise rotation, a diagonal swap, a rotation back - each glide starting a beat after its neighbour, while shifted windows, a mirrored pair, a posterized pair, and two invert pulses stack onto the same single machine.",
    prompts: ['Drag one satellite window\'s Translate X and watch its quarter-frame slide while the other three hold - four windows into one render.', 'Open the artifact inventory: five surfaces, a dozen Effects, one Harmonograph machine. That single-machine line is the whole lesson.'],
    guideHeading: 'composing-a-fixed-installation',
    patternSlots: [['pendulum']],
    output: { kind: 'installation', mapId: 'redline-stage-2d', pixelCount: 2_000 },
    zones,
    layouts: [physicalLayout('layout-redline-stage', 'Redline stage', zones, [
      [[0, 799]], [[800, 1_099]], [[1_100, 1_399]], [[1_400, 1_699]], [[1_700, 1_999]],
    ])],
    scenes,
    transitions: cutBoundaries(scenes),
    composition,
  })
}

// 303 closes the curriculum at the publication boundary: a Show saves as
// choreography but ships as one ordinary Pixelblaze Pattern, and the artifact
// inventory prices every contributor. The score carries one deliberately
// expensive treatment - the closing weave echo, an independent RibbonLoom
// instance overlaid on the garden. Measured against the real compiler: the
// echo does NOT duplicate the executable (one physical machine serves both
// logical instances, and the slimming tip says so); what it costs is its
// simultaneous overlay structure - 6,421 bytes of render plans and score
// data, 15,894 B (23.2% of budget) with the echo against 9,473 B without.
// Because the echo is independent it also restarts the opening weave from
// its first frame, which is why the treatment earns those bytes; deleting it
// and reading the inventory is the note's measured Try-this.
function learn303(): StockShow {
  const id = 'stock-show-303-compile-simplify-deliver'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('score', 'Score', 16, [clip('zone-1', 'RibbonLoom', LESSON_TIME_SCALE)]),
  ]
  const composition: ShowCompositionV1 = {
    version: 1,
    // deterministic-loop withheld (#823): the full-scene wrap census could not
    // prove exact Show End reset for this record (member state drift, or a
    // transition-extended timeline the census cannot phase-lock); upgrade
    // path is engine state snapshot/restore (#841).
    patternInstances: [
      instance('loom', 'RibbonLoom', LESSON_TIME_SCALE),
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
      // Independent on purpose: a fresh instance restarts the weave from its
      // opening frame and costs a second physical machine, and both facts are
      // the lesson.
      instance('loom-echo', 'RibbonLoom', LESSON_TIME_SCALE),
    ],
    scenes: [{
      sceneId: 'score',
      propertyTracks: [{
        id: 'track-echo-opacity',
        target: { kind: 'placement-opacity', placementId: 'clip-echo' },
        keyframes: [
          keyframe('echo-arrive', 10, 0),
          keyframe('echo-hold', 12, 0.6),
          keyframe('echo-depart', 14, 0.6),
          keyframe('echo-gone', 15.5, 0),
        ],
      }],
      zones: [{
        zoneId: 'zone-1',
        main: [placement('clip-loom', 'loom', 0, 8), placement('clip-garden', 'garden', 8, 8)],
        overlays: [{
          id: 'layer-echo',
          name: 'Weave echo',
          placements: [{ ...placement('clip-echo', 'loom-echo', 10, 5.5), opacity: 0 }],
        }],
      }],
    }],
    durationMs: 16_000,
  }
  return normalizedCatalogue({
    id, title: 'Compile, Simplify, and Deliver', track: 'portable', collection: 'learn', level: 300, order: 3,
    purpose: 'A Show stays editable choreography, but it ships as one ordinary Pixelblaze Pattern. The artifact inventory breaks down what that generated Pattern spends on each Pattern, Effect, and score structure, and its slimming tips name the costs you can actually act on.',
    notice: "The weave echo near the end is an independent RibbonLoom instance - and the inventory shows the compiler reusing one physical machine for both instances rather than shipping a duplicate copy. What the echo really costs is its overlay structure, about six kilobytes of render plans and score data. Independence is also why it restarts the opening weave from its first frame.",
    prompts: ["Open the artifact inventory: RibbonLoom lists one physical machine for two logical instances, and the render-plan row is what the echo's Layer actually costs. Delete the echo Clip and watch the total fall.", 'Undo the deletion, then export the EPE or open the generated code: everything on the timeline ships inside that one ordinary Pattern.'],
    guideHeading: 'compile-simplify-and-deliver',
    patternSlots: [['loom', 'loom-echo'], ['garden']],
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// The Zone Layout showcases hold the complete geometry vocabulary - one
// passage per logical routing kind - split across three sibling Shows the
// way the Shape Reveals references split (#514). The split is measured, not
// stylistic: routing render plans price every (Layout, routed Zone) slot at
// several kilobytes, and the single-Show matrix (nine Layouts, 27 slots)
// compiled to 259 KB against the 68 KB activation ceiling. The trio
// compiles at roughly 61% / 51% / 42% of budget, which leaves the
// session-edit headroom the notes' prompts assume.
// Casting follows the palette-role doctrine: the green garden is the hero
// voice that opens every sibling, warm embers is the counter-voice, and the
// four-voice sibling adds blue water plus the mostly-dark GlyphRain (82%
// dark at the 44x44 reference) as the negative-space voice that keeps
// partitions legible. Every boundary is an atomic routing switch except the
// Radial sibling's entry into rings, the single travelling switch, so both
// switch styles appear across the family.
type ZoneLayoutShowcaseKind = 'splits' | 'bands' | 'radial'

function zoneLayoutShowcase(kind: ZoneLayoutShowcaseKind): StockShow {
  const voiceNames = ['Garden', 'Ember', 'Tide', 'Rain']
  // Zone chip colors restate each voice's rendered hue, so the Zone rail,
  // the Layouts lane, and the Stage agree about who owns what.
  const voiceColors = ['#22c55e', '#f97316', '#38bdf8', '#a78bfa']
  const voiceIds = ['garden', 'ember', 'tide', 'rain']
  const voicePatterns = ['MetaballGarden', 'IQPalettes', 'Caustics', 'GlyphRain']
  type Passage = {
    id: string
    label: string
    seconds: number
    logical: (zoneIds: string[]) => NonNullable<ShowRoutingLayout['logical']>
    sweepMs?: number
    routingTargets?: ShowScene['routingTargets']
    detail: string
  }
  // Every sibling opens on the hero voice alone, so each partition that
  // follows is read against the same reference frame.
  const opener: Passage = {
    id: 'full', label: 'Full surface', seconds: 4,
    logical: (zoneIds) => ({ kind: 'single', zoneIds: [zoneIds[0]] }),
    detail: 'One Zone owns the complete normalized Stage: the hero voice alone, before any partition exists.',
  }
  const configs: Record<ZoneLayoutShowcaseKind, {
    id: string
    title: string
    order: number
    voiceCount: number
    purpose: string
    notice: string
    prompts: [string, string]
    summary: string
    passages: Passage[]
  }> = {
    splits: {
      id: 'stock-show-showcase-zone-layouts-splits',
      title: 'Zone Layouts: Splits & Checker',
      order: 17,
      voiceCount: 2,
      purpose: 'Four ways to hand one Stage to two voices: the full surface, a hard moving split, the same boundary feathered soft, and a 4 x 4 checker. The two Patterns never change - the Layout is the only variable.',
      notice: 'Every boundary is an atomic routing switch, never a visual Transition: pixels are re-dealt in one step while both Pattern clocks run straight through. The soft split is the one Layout without hard ownership - inside its feather band, both neighbours render and blend.',
      prompts: ['Drag the split position on the Moving split interval in the Layouts lane - the boundary is an interval value, and neither Pattern notices it move.', 'Select the Soft split chip and widen its feather - the blend band grows while both voices keep playing.'],
      summary: 'Full surface, moving split, soft split, and checker over two constant voices.',
      passages: [
        opener,
        {
          id: 'moving-split', label: 'Moving split', seconds: 5,          logical: (zoneIds) => ({ kind: 'split', zoneIds: [zoneIds[0], zoneIds[1]], axis: 'x' }),
          routingTargets: { splitPosition: 0.5 },
          detail: 'The first partition: a hard X boundary whose position is an interval value that can also glide at a junction.',
        },
        {
          id: 'soft-split', label: 'Soft split', seconds: 4,          logical: (zoneIds) => ({ kind: 'soft-split', zoneIds: [zoneIds[0], zoneIds[1]], axis: 'x', feather: 0.3 }),
          routingTargets: { splitPosition: 0.5 },
          detail: 'The same boundary feathered: inside the band both Zones render and blend - the one Layout without hard ownership.',
        },
        {
          id: 'checker', label: 'Checker', seconds: 5,          logical: (zoneIds) => ({ kind: 'checker', zoneIds: [zoneIds[0], zoneIds[1]], columns: 4, rows: 4 }),
          detail: 'The two voices alternate across a 4 x 4 board; columns and rows are the Layout parameters.',
        },
      ],
    },
    bands: {
      id: 'stock-show-showcase-zone-layouts-stripes-grid',
      title: 'Zone Layouts: Stripes & Grid',
      order: 18,
      voiceCount: 4,
      purpose: 'One surface dealt to four voices: equal stripes, then a 2 x 2 grid. A green garden, warm embers, blue water, and dark glyph rain never change - only the geometry that routes them does.',
      notice: 'Both boundaries are atomic routing switches: the surface becomes bands, and the bands become cells, in one step each, while all four Pattern clocks run straight through. The dark rain voice is deliberate negative space - its quiet band and cell are what keep the partitions legible.',
      prompts: ['Add a fifth Zone in the Zone Map and give it a Clip - the stripes simply deal it in, and the grid becomes stripes to make room.', 'Solo one Zone across the whole timeline - the same voice owns a band, then a cell.'],
      summary: 'Stripes and a 2 x 2 grid deal four constant voices around the Stage.',
      passages: [
        opener,
        {
          id: 'stripes', label: 'Stripes', seconds: 5,          logical: (zoneIds) => ({ kind: 'stripes', zoneIds: [...zoneIds], axis: 'x' }),
          detail: 'All four voices in equal position-based bands - the Layout the fixed-arity kinds fall back to when a Zone joins.',
        },
        {
          id: 'grid', label: 'Grid', seconds: 6,          logical: (zoneIds) => ({ kind: 'grid', zoneIds: [...zoneIds], columns: 2, rows: 2 }),
          detail: 'One Zone per cell of a 2 x 2 grid; each cell receives its own complete normalized space.',
        },
      ],
    },
    radial: {
      id: 'stock-show-showcase-zone-layouts-radial',
      title: 'Zone Layouts: Radial',
      order: 19,
      voiceCount: 2,
      purpose: 'The radial half of the vocabulary: rings, a wave, and a pinwheel route the same two voices from the center out. The bullseye reads Garden-Ember-Garden because rings cycle through the Zones in order.',
      notice: 'The entry into the rings is the one switch in this family that sweeps, so you can watch the geometry travel; the wave and pinwheel switches are atomic. Neither Pattern ever restarts: a Layout switch changes where pixels go, never Pattern state.',
      prompts: ['Select the Pinwheel chip and raise its Twist turns - the arms curl tighter while both Patterns play on.', 'Give the Rings chip five rings - the bullseye gains bands without touching either Pattern.'],
      summary: 'Rings, a wave, and a pinwheel route two constant voices radially.',
      passages: [
        opener,
        {
          id: 'rings', label: 'Rings', seconds: 5, sweepMs: 1_500,
          logical: (zoneIds) => ({ kind: 'rings', zoneIds: [zoneIds[0], zoneIds[1]], rings: 3 }),
          detail: 'Three concentric rings cycle the two voices into a bullseye - and the one switch that sweeps in rather than restating the topology in a single step.',
        },
        {
          id: 'wave', label: 'Wave', seconds: 4,          logical: (zoneIds) => ({ kind: 'wave', zoneIds: [zoneIds[0], zoneIds[1]], axis: 'x', bands: 4, amplitude: 0.3, frequency: 2.5, phase: 0 }),
          detail: 'Bands displaced by a triangle wave, with amplitude, frequency, and phase as Layout parameters.',
        },
        {
          id: 'pinwheel', label: 'Pinwheel', seconds: 6,          logical: (zoneIds) => ({ kind: 'pinwheel', zoneIds: [zoneIds[0], zoneIds[1]], arms: 6, twist: Math.PI * 2 * 1.35, rotation: 0 }),
          detail: 'The peak: six twisted arms alternate the two voices, with arms, twist, and rotation as Layout parameters.',
        },
      ],
    },
  }
  const config = configs[kind]
  const zones = logicalZones(voiceNames.slice(0, config.voiceCount), PORTABLE_REFERENCE_PIXELS)
    .map((zone, index) => ({ ...zone, color: voiceColors[index] }))
  const zoneIds = zones.map((zone) => zone.id)
  const voices = voiceIds.slice(0, config.voiceCount)
  const scenes: SceneSpec[] = config.passages.map((passage) => scene(
    passage.id,
    passage.label,
    passage.seconds,
    zones.map((zone, index) => clip(zone.id, voicePatterns[index], LESSON_TIME_SCALE)),
    passage.routingTargets,
  ))
  const composition: ShowCompositionV1 = {
    version: 1,
    // deterministic-loop withheld (#823): the full-scene wrap census could not
    // prove exact Show End reset for this record (member state drift, or a
    // transition-extended timeline the census cannot phase-lock); upgrade
    // path is engine state snapshot/restore (#841).
    patternInstances: voices.map((voice, index) => instance(voice, voicePatterns[index], LESSON_TIME_SCALE)),
    scenes: config.passages.map((passage) => ({
      sceneId: passage.id,
      // Every voice is placed in every passage, including passages whose
      // Layout routes it no pixels (review P2): presentation is what runs a
      // Pattern-instance clock, so an unrouted voice keeps playing silently
      // and the first partition reveals mid-motion state instead of a
      // restart. That is the family's central promise.
      zones: zones.map((zone, index) => ({
        zoneId: zone.id,
        overlays: [],
        main: [placement(`clip-${passage.id}-${voices[index]}`, voices[index], 0, passage.seconds)],
      })),
    })),
    durationMs: config.passages.reduce((sum, passage) => sum + passage.seconds, 0) * 1_000,
  }
  const stock = catalogue({
    id: config.id, title: config.title, track: 'portable', collection: 'showcases', level: null, order: config.order,
    purpose: config.purpose, notice: config.notice, prompts: config.prompts,
    guideHeading: 'zone-layouts-reference',
    guideLabel: 'Read about Zone Layouts',
    defaultOpen: true,
    zonesOpenByDefault: true,
    output: portableOutput(), zones,
    layouts: config.passages.map((passage) => ({
      id: `layout-${passage.id}`, name: passage.label, zones: [], logical: passage.logical(zoneIds),
    })),
    scenes, composition,
    reference: {
      summary: config.summary,
      patternSlots: {
        cellIds: config.passages.map((passage) => cellId(passage.id, zoneIds[0])),
        instanceIds: [voices[0]],
      },
      examples: config.passages.map((passage) => ({
        id: `example-${passage.id}`,
        label: passage.label,
        detail: passage.detail,
        anchor: { kind: 'scene' as const, sceneId: passage.id },
      })),
    },
  })
  let show = normalizeShowTransitionState(stock.show)
  config.passages.slice(0, -1).forEach((passage, index) => {
    show = updateShowRoutingSwitch(show, passage.id, `layout-${config.passages[index + 1].id}`)
  })
  if (kind === 'radial') {
    show = updateShowBoundaryTransition(show, 'routing-full', {
      durationMs: config.passages[1].sweepMs,
      easing: SINE_IN_OUT,
      routingDirection: 'forward',
    })
  }
  show = {
    ...show,
    composition: normalizeShowComposition(show, composition),
    updatedAt: UPDATED_AT,
  }
  return { ...stock, show }
}

function redlineInstallation(): StockShow {
  const id = 'stock-show-showcase-redline-installation'
  const zones = physicalZones(
    ['Hero panel', 'Left upper', 'Left lower', 'Right upper', 'Right lower'],
    [800, 300, 300, 300, 300],
  )
  const patternInstances: ShowCompositionV1['patternInstances'] = [
    instance('redline-machine', 'RedlineMachine', 1, {
      sliderIntensity: 1,
      sliderSpeed: 0.5,
      sliderCyan: 1,
    }),
  ]
  const phrases = [
    { id: 'ignition', name: 'Ignition', center: 'redline-machine', targets: 'redline-machine' },
    { id: 'first-lift', name: 'First lift', center: 'redline-machine', targets: 'redline-machine' },
    { id: 'countermotion', name: 'Countermotion', center: 'redline-machine', targets: 'redline-machine' },
    { id: 'first-drop', name: 'First drop', center: 'redline-machine', targets: 'redline-machine' },
    { id: 'vacuum', name: 'Vacuum', center: 'redline-machine', targets: 'redline-machine' },
    { id: 'rebuild', name: 'Rebuild', center: 'redline-machine', targets: 'redline-machine' },
    { id: 'compression', name: 'Compression', center: 'redline-machine', targets: 'redline-machine' },
    { id: 'peak-release', name: 'Peak and release', center: 'redline-machine', targets: 'redline-machine' },
  ]
  const instanceById = new Map(patternInstances.map((item) => [item.id, item]))
  const material = (instanceId: string) => {
    const value = instanceById.get(instanceId)!
    return { pattern: value.pattern.id, controls: value.controlTargets }
  }
  const scenes: SceneSpec[] = phrases.map((phrase) => {
    const center = material(phrase.center)
    const targets = material(phrase.targets)
    return scene(phrase.id, phrase.name, 7.5, [
      clip('zone-1', center.pattern, 1, center.controls),
      ...zones.slice(1).map((zone) => clip(zone.id, targets.pattern, 1, targets.controls)),
    ])
  })
  const targetEffects = (phraseIndex: number, targetIndex: number): ShowClipEffect[] => {
    const rotations = [0, 0.125, -0.125, 0.25]
    const shearX = [-0.14, 0.10, -0.08, 0.16]
    const shearY = [0.08, -0.12, 0.14, -0.06]
    const scales = [0.92, 0.84, 0.88, 0.80]
    return [
      { id: 'target-rotate', kind: 'rotate', turns: rotations[targetIndex] + (phraseIndex % 2 ? 0.0625 : 0) },
      { id: 'target-scale', kind: 'scale', x: scales[targetIndex], y: scales[(targetIndex + phraseIndex) % 4] },
      { id: 'target-shear', kind: 'shear', x: shearX[targetIndex], y: shearY[(targetIndex + phraseIndex) % 4] },
      { id: 'target-wrap', kind: 'wrap' },
    ]
  }
  const scheduledPlacement = (
    placementId: string,
    instanceId: string,
    startMs: number,
    durationMs: number,
    phraseIndex: number,
    targetIndex?: number,
  ): ShowCompositionV1['scenes'][number]['zones'][number]['main'][number] => ({
    id: placementId,
    instanceId,
    startMs,
    durationMs,
    view: { mirror: targetIndex !== undefined && targetIndex % 2 === 1, phase: 0, brightness: 1 },
    ...(targetIndex === undefined ? {} : { effects: targetEffects(phraseIndex, targetIndex) }),
  })
  const targetTiming = (phraseIndex: number, targetIndex: number) => {
    if (phraseIndex === 0) return { startMs: targetIndex * 1_875, durationMs: 1_875 }
    if (phraseIndex === 1) {
      const startMs = targetIndex < 2 ? targetIndex * 1_875 : 3_750
      return { startMs, durationMs: 7_500 - startMs }
    }
    if (phraseIndex === 5) {
      const startMs = targetIndex * 750
      return { startMs, durationMs: 7_500 - startMs }
    }
    return { startMs: 0, durationMs: 7_500 }
  }
  const composition: ShowCompositionV1 = {
    version: 1,
    // deterministic-loop withheld (#823): the full-scene wrap census could not
    // prove exact Show End reset for this record (member state drift, or a
    // transition-extended timeline the census cannot phase-lock); upgrade
    // path is engine state snapshot/restore (#841).
    patternInstances,
    scenes: phrases.map((phrase, phraseIndex) => ({
      sceneId: phrase.id,
      zones: zones.map((zone, zoneIndex) => {
        if (zoneIndex === 0) {
          return {
            zoneId: zone.id,
            main: [scheduledPlacement(`${phrase.id}-center`, phrase.center, 0, 7_500, phraseIndex)],
            overlays: [],
          }
        }
        const targetIndex = zoneIndex - 1
        const timing = targetTiming(phraseIndex, targetIndex)
        return {
          zoneId: zone.id,
          main: [scheduledPlacement(
            `${phrase.id}-target-${targetIndex + 1}`,
            phrase.targets,
            timing.startMs,
            timing.durationMs,
            phraseIndex,
            targetIndex,
          )],
          overlays: [],
        }
      }),
    })),
    durationMs: 60_000,
  }

  return normalizedCatalogue({
    id,
    title: 'Redline Installation',
    track: 'installation',
    collection: 'showcases',
    level: null,
    order: 20,
    purpose: 'A sixty-second club-installation score turns one hero panel and four target arrays into a single rhythmic machine.',
    notice: 'One renderer owns each pixel. Shared target instances and cheap transforms create difference; black space, red pressure, white impact, sparse cyan ornaments, and one cyan takeover create the arc.',
    prompts: ['Solo the four target Zones and compare their shared clock.', 'Jump between First drop, Vacuum, and Peak to compare one canvas with five instruments.'],
    guideHeading: 'ruthlessly-engineered-spectacle',
    defaultOpen: true,
    output: { kind: 'installation', mapId: 'redline-stage-2d', pixelCount: 2_000 },
    zones,
    layouts: [physicalLayout('layout-redline-stage', 'Redline stage', zones, [
      [[0, 799]], [[800, 1_099]], [[1_100, 1_399]], [[1_400, 1_699]], [[1_700, 1_999]],
    ])],
    scenes,
    transitions: cutBoundaries(scenes),
    composition,
  })
}

type TransitionReferenceSpec = {
  id: string
  label: string
  familyId: 'blend' | 'fade' | 'wipe' | 'dissolve' | 'shape-reveal' | 'motion'
  variantId: string
  presetId?: string
  changes?: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>
  /** Hold after this boundary settles, in seconds. Exemplars study; siblings cut. */
  holdSeconds?: number
  /** Transition duration in seconds; defaults to the 1.8s house tempo. */
  transitionSeconds?: number
}

// Every Transition reference shares the measured diagnostic pair. Probed on
// the 44x44 plane at the 0.32 clock, MetaballGarden (green, lum 0.45, flux
// 0.013/200ms) and IQPalettes (warm, lum 0.41, flux 0.016) are the two
// calmest equally-bright fields with the widest sustained hue contrast, so
// every boundary reads as one world replacing another and neither side ever
// looks dead. The backdrop recasts to Murmuration, the calmest dim voice in
// the corpus (flux 0.015); the old Caustics backdrop measured 0.53 flux and
// fought the comparison it was under. Pacing follows the packet's editor
// rule: one slow exemplar per family, then quick cuts of its siblings.

function blendAndFadeTransitionReference(): StockShow {
  const specs: TransitionReferenceSpec[] = [
    { id: 'cut', label: 'Cut', familyId: 'blend', variantId: 'cut', changes: { durationMs: 0 }, holdSeconds: 3 },
    { id: 'crossfade', label: 'Crossfade', familyId: 'blend', variantId: 'crossfade', presetId: 'smooth', holdSeconds: 4, transitionSeconds: 2.5 },
    { id: 'fade-black', label: 'Fade through black', familyId: 'fade', variantId: 'through-color', presetId: 'black', holdSeconds: 2, transitionSeconds: 2 },
    { id: 'fade-white', label: 'Fade through white', familyId: 'fade', variantId: 'through-color', presetId: 'white', holdSeconds: 2, transitionSeconds: 2 },
  ]
  return transitionReferenceShow({
    id: 'stock-show-reference-blend-fade-transitions', title: 'Blend and Fade Transitions', order: 6,
    purpose: 'The junction vocabulary everyone starts with: a bare Cut, one slow Crossfade to study, and the two through-color Fades.',
    notice: 'The Crossfade is the exemplar and takes its time; the Fades pass more quickly because their character is the color they pass through.',
    prompts: ['Stretch the Crossfade and watch the two worlds coexist.', 'Change the Fade color from black to a deep blue in the inspector.'],
    guideHeading: 'blend-and-fade-transition-reference', specs,
  })
}

function wipeTransitionReference(): StockShow {
  const quick = { holdSeconds: 1.5, transitionSeconds: 1 }
  const specs: TransitionReferenceSpec[] = [
    { id: 'wipe-east', label: 'Linear wipe east', familyId: 'wipe', variantId: 'linear', presetId: 'east', holdSeconds: 3, transitionSeconds: 2.5 },
    { id: 'wipe-south', label: 'Linear wipe south', familyId: 'wipe', variantId: 'linear', presetId: 'south', ...quick },
    { id: 'wipe-west', label: 'Linear wipe west', familyId: 'wipe', variantId: 'linear', presetId: 'west', ...quick },
    { id: 'wipe-north', label: 'Linear wipe north', familyId: 'wipe', variantId: 'linear', presetId: 'north', ...quick },
    { id: 'split-out', label: 'Split center out', familyId: 'wipe', variantId: 'split', changes: { wipeMode: 'center-out' }, ...quick },
    { id: 'barn-out', label: 'Barn doors out', familyId: 'wipe', variantId: 'barn-doors', changes: { wipeMode: 'center-out' }, ...quick },
    { id: 'blinds-vertical', label: 'Vertical blinds', familyId: 'wipe', variantId: 'blinds', changes: { orientation: 'vertical' }, ...quick },
    { id: 'clock-cw', label: 'Clock clockwise', familyId: 'wipe', variantId: 'clock', changes: { clockwise: true }, ...quick },
    { id: 'checker', label: 'Checker', familyId: 'wipe', variantId: 'checker', ...quick },
    { id: 'grid', label: 'Grid', familyId: 'wipe', variantId: 'grid', ...quick },
  ]
  return transitionReferenceShow({
    id: 'stock-show-reference-wipe-transitions', title: 'Wipes', order: 7,
    purpose: 'One eastward Linear Wipe slow enough to study its edge, then quick cuts through the other cardinal directions and every patterned Wipe.',
    notice: 'After the exemplar, each sibling changes exactly one idea - direction, split, doors, blinds, clock, checker, grid - at quick-cut tempo. Diagonals and center-in modes stay as inspector edits.',
    prompts: ['Compare hard, dithered, and blended edges on the exemplar Wipe.', 'Stretch any quick cut back into a slow study.'],
    guideHeading: 'wipe-transition-reference', specs,
  })
}

function dissolveTransitionReference(): StockShow {
  const quick = { holdSeconds: 2, transitionSeconds: 1.5 }
  const specs: TransitionReferenceSpec[] = [
    { id: 'dissolve-pixel', label: 'Pixel dissolve', familyId: 'dissolve', variantId: 'pixel', holdSeconds: 3, transitionSeconds: 2.5 },
    { id: 'dissolve-block', label: 'Block dissolve', familyId: 'dissolve', variantId: 'block', ...quick },
    { id: 'dissolve-noise', label: 'Coherent-noise dissolve', familyId: 'dissolve', variantId: 'coherent-noise', ...quick },
    { id: 'dissolve-soft', label: 'Soft-threshold dissolve', familyId: 'dissolve', variantId: 'soft-threshold', ...quick },
  ]
  return transitionReferenceShow({
    id: 'stock-show-reference-dissolve-transitions', title: 'Dissolves', order: 8,
    purpose: 'Four ways to take one picture apart and assemble the next: per-pixel, in blocks, along coherent noise, and through a soft threshold.',
    notice: 'The pixel dissolve is the slow exemplar; the other three differ only in the structure of what crumbles.',
    prompts: ['Change the block dissolve grid in the inspector.', 'Compare coherent-noise with soft-threshold at the same duration.'],
    guideHeading: 'dissolve-transition-reference', specs,
  })
}

// Shape reveals split into Geometric and Figure silhouettes: the #514 census
// caught the recast fifteen-boundary matrix 21 KB over the activation source
// ceiling - portal SDF code scales with silhouette count - and two shorter
// references also attribute faster than one long one.
function shapeRevealShapeSpecs(
  shapes: ReadonlyArray<readonly [string, string]>,
): TransitionReferenceSpec[] {
  return shapes.map(([id, label], index) => ({
    id: `shape-${id}`,
    label: `${label}: ${index % 2 === 0 ? 'grow incoming' : 'shrink outgoing'}`,
    familyId: 'shape-reveal' as const,
    variantId: id,
    changes: { revealMode: index % 2 === 0 ? 'grow-incoming' as const : 'shrink-outgoing' as const },
    holdSeconds: 1.5,
    transitionSeconds: 1.2,
  }))
}

function shapeRevealGeometricReference(): StockShow {
  const specs: TransitionReferenceSpec[] = [
    { id: 'circle-grow', label: 'Circle: grow incoming', familyId: 'shape-reveal', variantId: 'circle', changes: { revealMode: 'grow-incoming' }, holdSeconds: 3, transitionSeconds: 2.5 },
    { id: 'circle-shrink', label: 'Circle: shrink outgoing', familyId: 'shape-reveal', variantId: 'circle', changes: { revealMode: 'shrink-outgoing' }, holdSeconds: 1.5, transitionSeconds: 1.2 },
    ...shapeRevealShapeSpecs([
      ['ellipse', 'Ellipse'], ['box', 'Box'], ['rounded-box', 'Rounded box'],
      ['diamond', 'Diamond'], ['cross', 'Cross'],
    ]),
  ]
  return transitionReferenceShow({
    id: 'stock-show-reference-shape-reveal-transitions', title: 'Shape Reveals: Geometric', order: 9,
    purpose: 'One slow Circle reveal to study, then quick cuts through the geometric silhouettes while the Pattern pair, center, scale, and edge hold steady.',
    notice: 'Circle appears in both reveal modes at study tempo; the remaining silhouettes alternate modes at quick-cut tempo so shape stays the only question. The figure silhouettes have their own reference.',
    prompts: ['Stretch any silhouette back to study tempo.', 'Move the center away from 0.5, 0.5 and compare asymmetric shapes.'],
    guideHeading: 'shape-reveal-transition-reference', specs,
  })
}

function shapeRevealFigureReference(): StockShow {
  const specs: TransitionReferenceSpec[] = [
    { id: 'shape-heart', label: 'Heart: grow incoming', familyId: 'shape-reveal', variantId: 'heart', changes: { revealMode: 'grow-incoming' }, holdSeconds: 3, transitionSeconds: 2.5 },
    ...shapeRevealShapeSpecs([
      ['ring', 'Ring'], ['star', 'Star'], ['crescent', 'Crescent'], ['polygon', 'Regular polygon'],
      ['cloud', 'Cloud'], ['cat-head', 'Cat head'], ['cat-side-profile', 'Side-profile cat'], ['bastet', 'Bastet'],
    ]),
  ]
  return transitionReferenceShow({
    id: 'stock-show-reference-shape-reveal-figures', title: 'Shape Reveals: Figures', order: 10,
    purpose: 'The figurative silhouettes - heart, star, crescent, polygon, cloud, and the three cats - with one slow Heart to study and the rest as quick cuts.',
    notice: 'Same construction as the geometric reference: the pair, center, scale, and edge never move, so the silhouette is the only question.',
    prompts: ['Stretch a cat silhouette to study tempo and watch its edge.', 'Swap the reveal mode on the Bastet silhouette.'],
    guideHeading: 'shape-reveal-figures-reference', specs,
  })
}

function slideTransitionReference(): StockShow {
  const quick = { holdSeconds: 1.5, transitionSeconds: 1 }
  const specs: TransitionReferenceSpec[] = [
    { id: 'cover-east', label: 'Cover east', familyId: 'motion', variantId: 'cover', changes: { direction: 0 }, holdSeconds: 3, transitionSeconds: 2.5 },
    { id: 'reveal-east', label: 'Reveal east', familyId: 'motion', variantId: 'reveal', changes: { direction: 0 }, holdSeconds: 2, transitionSeconds: 1.5 },
    { id: 'push-east', label: 'Push east', familyId: 'motion', variantId: 'push', changes: { direction: 0 }, holdSeconds: 2, transitionSeconds: 1.5 },
    { id: 'cover-south', label: 'Cover south', familyId: 'motion', variantId: 'cover', changes: { direction: 0.25 }, ...quick },
    { id: 'cover-west', label: 'Cover west', familyId: 'motion', variantId: 'cover', changes: { direction: 0.5 }, ...quick },
    { id: 'cover-north', label: 'Cover north', familyId: 'motion', variantId: 'cover', changes: { direction: 0.75 }, ...quick },
  ]
  return transitionReferenceShow({
    id: 'stock-show-reference-slide-transitions', title: 'Slide Transitions', order: 11,
    purpose: 'Cover, Reveal, and Push are the three ways one picture slides over, out from under, or alongside another: one slow Cover, then the family and its directions as quick cuts.',
    notice: 'Cover moves the incoming picture, Reveal moves the outgoing one, Push moves both. After the three-way comparison the directions run at quick-cut tempo; diagonals stay continuous in the inspector.',
    prompts: ['Change a quick Cover to a diagonal direction.', 'Switch Addressing from Clip to Wrap and compare moving edges.'],
    guideHeading: 'slide-transition-reference', specs,
  })
}

function zoomSpinTransitionReference(): StockShow {
  const quick = { holdSeconds: 1.5, transitionSeconds: 1.2 }
  const specs: TransitionReferenceSpec[] = [
    { id: 'content-grow', label: 'Content grow', familyId: 'motion', variantId: 'content-grow', holdSeconds: 3, transitionSeconds: 2.5 },
    { id: 'content-shrink', label: 'Content shrink', familyId: 'motion', variantId: 'content-shrink', ...quick },
    { id: 'zoom-in', label: 'Zoom in', familyId: 'motion', variantId: 'zoom-in', presetId: 'zoom', ...quick },
    { id: 'zoom-out', label: 'Zoom out', familyId: 'motion', variantId: 'zoom-out', presetId: 'zoom', ...quick },
    { id: 'spin-cw', label: 'Spin in clockwise', familyId: 'motion', variantId: 'zoom-in', presetId: 'spin-clockwise', ...quick },
    { id: 'spin-ccw', label: 'Spin in counterclockwise', familyId: 'motion', variantId: 'zoom-in', presetId: 'spin-counterclockwise', ...quick },
    { id: 'zoom-spin-cw', label: 'Zoom and spin clockwise', familyId: 'motion', variantId: 'zoom-in', presetId: 'zoom-spin-clockwise', ...quick },
  ]
  return transitionReferenceShow({
    id: 'stock-show-reference-zoom-spin-transitions', title: 'Zoom and Spin Transitions', order: 12,
    purpose: 'Scaling and spinning arrivals: Content grow at study tempo, then its siblings and the zoom and spin presets as quick cuts.',
    notice: 'Content transitions scale the picture inside its frame; Zoom transitions scale the frame itself; the spin presets differ only in rotation.',
    prompts: ['Compare Content grow with Zoom in at the same duration.', 'Stack zoom-and-spin against plain spin at study tempo.'],
    guideHeading: 'zoom-and-spin-transition-reference', specs,
  })
}

function propertyAnimationReference(): StockShow {
  const id = 'stock-show-reference-property-animation'
  const zones = logicalZones(['A', 'B'], 2_000)
  const properties = [
    ['animation-speed', 'Animation speed'],
    ['pattern-control', 'Public Pattern control'],
    ['brightness', 'Brightness'],
    ['clip-transform', 'Clip Transform'],
    ['clip-viewport', 'Clip Viewport'],
    ['overlay-opacity', 'Overlay opacity'],
    ['effect-parameter', 'Effect parameter'],
    ['split-position', 'Split position'],
    ['repeat-scale', 'Repeat scale'],
  ] as const
  const scenes = properties.map(([sceneId, label]) => scene(
    sceneId,
    label,
    5,
    [clip('zone-1', 'CompassRose', 0.32), clip('zone-2', 'CompassRose', 0.32)],
    { splitPosition: sceneId === 'effect-parameter' ? 0.25 : sceneId === 'split-position' ? 0.75 : 0.5 },
    { repeatScale: sceneId === 'repeat-scale' ? 4 : 1 },
  ))
  const transitions = cutBoundaries(scenes).map((item) => {
    // These two junctions teach boundary-owned Property transitions, and a
    // Cut cannot own one (#418 strips it silently - which is how this
    // showcase shipped with two dead tweens, #823). The carrier is a
    // live-live Crossfade between identical shared instances: visually
    // neutral, so the eased property tween stays the only demonstrated
    // change. The carrier must run the full 1,800 ms - normalization caps a
    // descriptor's duration at its boundary's - but stays linear, since
    // blending identical frames makes the carrier's own easing invisible;
    // a sine carrier measured 3.3 KB heavier and 197 bytes over the #514
    // activation ceiling, and the linear one clears it with ~3 KB headroom.
    if (item.afterSceneId === 'effect-parameter') {
      return boundary('effect-parameter', 'crossfade', 1_800, LINEAR, {
        crossfadePolicy: 'live-live',
        propertyTransitions: {
          routing: { splitPosition: { from: 0.25, durationMs: 1_800, easing: SINE_IN_OUT } },
        },
      })
    }
    if (item.afterSceneId === 'split-position') {
      return boundary('split-position', 'crossfade', 1_800, LINEAR, {
        crossfadePolicy: 'live-live',
        propertyTransitions: {
          sample: { repeatScale: { from: 1, durationMs: 1_800, easing: SINE_IN_OUT } },
        },
      })
    }
    return item
  })
  const track = (
    trackId: string,
    target: ShowPropertyAnimationTrack['target'],
    values: readonly [number, number, number],
  ): ShowPropertyAnimationTrack => ({
    id: trackId,
    target,
    keyframes: [
      keyframe(`${trackId}-start`, 0, values[0]),
      keyframe(`${trackId}-middle`, 2.5, values[1]),
      keyframe(`${trackId}-end`, 5, values[2]),
    ],
  })
  const localTracks = (sceneId: string): ShowPropertyAnimationTrack[] => {
    const instanceId = columnInstanceIds(sceneId).subject
    const placementId = `placement-${sceneId}-a`
    if (sceneId === 'animation-speed') return [track('track-animation-speed', { kind: 'instance-time-scale', instanceId }, [0.12, 0.9, 0.12])]
    if (sceneId === 'pattern-control') return [track('track-pattern-control', { kind: 'instance-control', instanceId, exportName: 'sliderSpeed' }, [0.08, 0.92, 0.08])]
    if (sceneId === 'brightness') return [track('track-brightness', { kind: 'placement-view', placementId, property: 'brightness' }, [0.1, 1, 0.1])]
    if (sceneId === 'clip-transform') return [track('track-clip-transform', { kind: 'placement-transform', placementId, property: 'positionX' }, [-0.25, 0.25, -0.25])]
    if (sceneId === 'clip-viewport') return [track('track-clip-viewport', { kind: 'placement-viewport', placementId, property: 'width' }, [0.9, 0.4, 0.9])]
    if (sceneId === 'overlay-opacity') return [track('track-overlay-opacity', { kind: 'placement-opacity', placementId: 'placement-overlay-opacity-overlay' }, [0, 0.85, 0])]
    if (sceneId === 'effect-parameter') return [track('track-effect-parameter', {
      kind: 'placement-effect', placementId, effectId: 'translate-demo', effectKind: 'translate', parameterId: 'translateX',
    }, [0, -0.35, 0])]
    return []
  }
  // Phase is the one placement-view target left to the inspector: the #514
  // census prices each passage at roughly five kilobytes of generated scene
  // structure, Brightness already demonstrates the placement-view kind, and
  // nine passages is what fits under the activation ceiling.
  // One shared subject and one shared comparison voice instead of a fresh
  // pair per passage: the #514 census caught the per-scene pairs blowing the
  // 256-persistent-global limit (265) and the activation source ceiling.
  // The comparison column runs the same Pattern as the subject, deliberately
  // unanimated - an identical twin on an identical clock - so the animated
  // value is the only difference between the two Zones, and the second
  // member Pattern the census flagged drops out of the artifact entirely.
  // The two clock-perturbing passages get their own scene-local pair
  // (review P2): animating the shared subject's time scale or speed control
  // would permanently advance its clock relative to the twin, so every later
  // passage would compare out-of-phase Patterns and the divergence would
  // grow each loop. Scene-local instances run only while presented, so both
  // columns of those passages first start at the same instant, stay
  // phase-identical twins at every loop, and leave the shared pair's clocks
  // untouched for the other seven passages.
  const patternInstances: ShowCompositionV1['patternInstances'] = [
    instance('instance-property-subject', 'CompassRose', 0.32, { sliderSpeed: 0.08 }),
    instance('instance-property-comparison', 'CompassRose', 0.32, { sliderSpeed: 0.08 }),
    instance('instance-property-subject-speed', 'CompassRose', 0.32, { sliderSpeed: 0.08 }),
    instance('instance-property-comparison-speed', 'CompassRose', 0.32, { sliderSpeed: 0.08 }),
    instance('instance-property-subject-control', 'CompassRose', 0.32, { sliderSpeed: 0.08 }),
    instance('instance-property-comparison-control', 'CompassRose', 0.32, { sliderSpeed: 0.08 }),
    instance('instance-overlay-opacity-overlay', 'SignalMandala', 0.28),
  ]
  const columnInstanceIds = (sceneId: string): { subject: string; comparison: string } => {
    if (sceneId === 'animation-speed') return { subject: 'instance-property-subject-speed', comparison: 'instance-property-comparison-speed' }
    if (sceneId === 'pattern-control') return { subject: 'instance-property-subject-control', comparison: 'instance-property-comparison-control' }
    return { subject: 'instance-property-subject', comparison: 'instance-property-comparison' }
  }
  const composition: ShowCompositionV1 = {
    version: 1,
    // Deterministic loop (review P2): the scene-local pairs accumulate
    // different Pattern time within their passage - that divergence is the
    // demonstration - so on wrap they must reset rather than resume, or the
    // twins re-enter already out of phase on every loop after the first.
    // deterministic-loop withheld (#823): the full-scene wrap census could not
    // prove exact Show End reset for this record (member state drift, or a
    // transition-extended timeline the census cannot phase-lock); upgrade
    // path is engine state snapshot/restore (#841).
    patternInstances,
    scenes: properties.map(([sceneId]) => {
      const mainA = {
        ...placement(`placement-${sceneId}-a`, columnInstanceIds(sceneId).subject, 0, 5),
        ...(sceneId === 'effect-parameter'
          ? { effects: [{ id: 'translate-demo', kind: 'translate' as const, x: 0, y: 0 }] }
          : {}),
        // Soft on purpose: the aperture animates, and animated apertures are
        // never hard-edged (smooth-by-default doctrine).
        ...(sceneId === 'clip-viewport'
          ? { viewport: { enabled: true, x: 0.15, y: 0.15, width: 0.9, height: 0.7, edge: 'soft' as const } }
          : {}),
      }
      return {
        sceneId,
        ...(localTracks(sceneId).length ? { propertyTracks: localTracks(sceneId) } : {}),
        zones: [
          {
            zoneId: 'zone-1',
            main: [mainA],
            overlays: sceneId === 'overlay-opacity' ? [{
              id: 'layer-overlay-opacity',
              name: 'Signal overlay',
              placements: [{
                ...placement('placement-overlay-opacity-overlay', 'instance-overlay-opacity-overlay', 0, 5),
                opacity: 0,
              }],
            }] : [],
          },
          {
            zoneId: 'zone-2',
            main: [placement(`placement-${sceneId}-b`, columnInstanceIds(sceneId).comparison, 0, 5)],
            overlays: [],
          },
        ],
      }
    }),
  }
  return catalogue({
    id, title: 'Property Animation', track: 'portable', collection: 'showcases', level: null, order: 13,
    purpose: 'Nine examples show where values can change over time: Pattern state, placement view, Clip Transform, the Viewport aperture, layering, Effect parameters, routing, and sample remapping. The right Zone runs the same Pattern unanimated, so the animated value is the only difference between the columns.',
    notice: "The first seven examples use Clip-owned sparklines - including a Clip Transform pan and a Soft-edged aperture breathing - while Split position and Repeat scale use boundary-owned Property transitions. The unanimated twin is the control: whatever the columns don't share is the property at work.",
    prompts: ['Open each Clip and compare the highlighted sparkline owner.', 'Change one midpoint value while leaving its endpoints fixed.'],
    guideHeading: 'property-animation-reference', output: portableOutput(), zones,
    defaultOpen: true,
    layouts: [splitLayout('layout-property-split', 'Property split', zones, 'x')], scenes, transitions, composition,
    reference: {
      summary: 'The Stage and timeline highlight one animatable property at a time. Each chooser recasts one Pattern source everywhere it appears; placement and Effect tracks stay attached, while animation tied to a control from the original Pattern yields to the replacement.',
      patternSlots: {
        cellIds: properties.map(([sceneId]) => cellId(sceneId, 'zone-2')),
        instanceIds: [
          'instance-property-comparison',
          'instance-property-comparison-speed',
          'instance-property-comparison-control',
        ],
      },
      examples: [
        ...properties.slice(0, 7).map(([sceneId, label]) => ({
          id: sceneId, label, detail: 'Clip-owned Property sparkline.', anchor: { kind: 'scene' as const, sceneId },
        })),
        { id: 'split-position', label: 'Split position', detail: 'Boundary-owned routing Property transition.', anchor: { kind: 'boundary', transitionId: 'transition-effect-parameter' } },
        { id: 'repeat-scale', label: 'Repeat scale', detail: 'Boundary-owned sample-remap Property transition.', anchor: { kind: 'boundary', transitionId: 'transition-split-position' } },
      ],
    },
  })
}

function easingReference(): StockShow {
  // Uniform tempo is the control here, not monotony: easing is a statement
  // about when progress happens, so every curve must run over an identical
  // duration to be comparable. The holds shorten to two seconds instead.
  const specs: TransitionReferenceSpec[] = SHOW_EASING_OPTIONS.map((option) => ({
    id: `easing-${option.id}`,
    label: option.label,
    familyId: 'wipe',
    variantId: 'linear',
    presetId: 'east',
    changes: { easing: option.easing },
    holdSeconds: 2,
  }))
  return transitionReferenceShow({
    id: 'stock-show-reference-easing', title: 'Easing', order: 14,
    purpose: 'One eastward Linear Wipe holds its Patterns, endpoints, direction, and duration constant while every easing curve changes the timing.',
    notice: 'This isolates easing from Transition geometry. Identical durations are deliberate - easing is when progress happens - and the live header names the current curve and draws its progression.',
    prompts: ['Compare quadratic in with quadratic out.', 'Watch where Steps and Hold curves spend their time.'],
    guideHeading: 'easing-reference', specs,
  })
}

// The two aperture references split the #690 catalogue the way the picker
// sections it: this one carries the geometric silhouettes by edge, its
// Icons & Signature sibling carries the figurative shapes plus rotation and
// the Cut-out mode. Same doctrine as the shape-reveal split: each reference
// stays short enough to attribute, and each compiled artifact stays inside
// the activation budget (#514). The subject, frame, bed, and clocks never
// change, so each passage has exactly one attributable variable. Paced like
// an editor, not a metronome: the ellipse and the ring get study-length
// beats, sibling silhouettes cut past at two seconds, and the dither keeps
// three so its texture reads as stable rather than as noise.
function apertureShapesReference(): StockShow {
  const id = 'stock-show-reference-aperture-shapes'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const frame = { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
  const variants = [
    { id: 'rectangle', label: 'Rectangle', seconds: 3, detail: 'The plain frame, feathered Soft; the Hard cut appears later as the deliberate exception.', viewport: { ...frame, edge: 'soft' as const } },
    { id: 'ellipse', label: 'Ellipse', seconds: 5, detail: 'The inscribed oval at its Soft default; corners of the frame fall away.', viewport: { ...frame, aperture: 'ellipse' as const } },
    { id: 'diamond', label: 'Diamond', seconds: 2, detail: 'The inscribed diamond at its Soft default; edges run corner to corner.', viewport: { ...frame, aperture: 'diamond' as const } },
    // The baseline tracks the engine default so the detail text stays true;
    // the wide sibling stays a clear contrast (#823 - the record used to pin
    // 0.12 under a "default radius" label while the default was 0.25).
    { id: 'rounded-box', label: 'Rounded box', seconds: 2, detail: 'The frame with its corners rounded at the default radius.', viewport: { ...frame, aperture: 'rounded-box' as const, cornerRadius: DEFAULT_SHOW_CLIP_CORNER_RADIUS } },
    { id: 'rounded-box-wide', label: 'Rounded box, wide radius', seconds: 2, detail: 'The same box at a wide corner radius: radius is a shape parameter, not an edge treatment.', viewport: { ...frame, aperture: 'rounded-box' as const, cornerRadius: 0.45 } },
    { id: 'cross', label: 'Cross', seconds: 2, detail: 'The inscribed cross at its Soft default; arm width is its shape parameter.', viewport: { ...frame, aperture: 'cross' as const } },
    { id: 'polygon', label: 'Regular polygon', seconds: 2, detail: 'The inscribed hexagon at its Soft default; Sides is its shape parameter.', viewport: { ...frame, aperture: 'polygon' as const } },
    { id: 'ring-soft', label: 'Ring, Soft edge', seconds: 4, detail: 'An annulus at its Soft default: the bed shows through the center, which no box can do.', viewport: { ...frame, aperture: 'ring' as const, edge: 'soft' as const } },
    { id: 'ring-hard', label: 'Ring, Hard edge', seconds: 2, detail: 'The same Ring cut Hard - the deliberate exception that shows what the feather was doing.', viewport: { ...frame, aperture: 'ring' as const, edge: 'hard' as const } },
    { id: 'ring-dither', label: 'Ring, Stable Dither', seconds: 3, detail: 'The same Ring with a stable dithered edge that survives LED quantization.', viewport: { ...frame, aperture: 'ring' as const, edge: 'dither' as const } },
  ]
  const scenes: SceneSpec[] = variants.map((variant) => (
    scene(variant.id, variant.label, variant.seconds, [clip('zone-1', 'CompassRose', LESSON_TIME_SCALE)])
  ))
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
      instance('rose', 'CompassRose', LESSON_TIME_SCALE),
    ],
    scenes: variants.map((variant) => ({
      sceneId: variant.id,
      zones: [{
        zoneId: 'zone-1',
        main: [{
          ...placement(`bed-${variant.id}`, 'garden', 0, variant.seconds),
          view: { mirror: false, phase: 0, brightness: 0.3 },
        }],
        overlays: [{
          id: `layer-subject-${variant.id}`,
          name: 'Subject',
          placements: [{
            ...placement(`subject-${variant.id}`, 'rose', 0, variant.seconds),
            opacity: 1,
            viewport: variant.viewport,
          }],
        }],
      }],
    })),
    durationMs: variants.reduce((sum, variant) => sum + variant.seconds, 0) * 1_000,
  }
  return catalogue({
    id, title: 'Aperture Shapes: Geometric', track: 'portable', collection: 'showcases', level: null, order: 15,
    purpose: 'Every geometric Clip Viewport silhouette over one held frame, then one silhouette across its three edge treatments. Shaped silhouettes keep their Soft default - smooth is almost always what you want. The subject, bed, frame, and clocks never change, so each passage has exactly one attributable variable. The icon and signature silhouettes, rotation, and the Cut-out mode have their own reference.',
    notice: 'The first seven passages change only the silhouette at its Soft default, the wide-radius passage shows corner radius is shape rather than edge, and the last three hold the Ring while only its edge treatment changes - Soft, then the deliberate Hard cut, then Stable Dither.',
    prompts: ['Swap the subject Pattern and watch every silhouette keep its geometry.', 'Open any passage and drag the corner radius, arm width, sides, or edge softness - the reference values are starting points, not limits.'],
    guideHeading: 'aperture-shapes-reference',
    defaultOpen: true,
    output: portableOutput(), zones, layouts: [singleLayout(zones)],
    scenes,
    transitions: cutBoundaries(scenes),
    composition,
    reference: {
      summary: 'Geometric silhouettes at one frame, then the Ring across Hard, Soft, and Stable Dither.',
      patternSlots: {
        cellIds: variants.map((variant) => cellId(variant.id, 'zone-1')),
        // Declarations scope the generated swap surface (#822): both the
        // garden subject and the rose are intended swappable here.
        instanceIds: ['garden', 'rose'],
      },
      examples: variants.map((variant) => ({
        id: `example-${variant.id}`,
        label: variant.label,
        detail: variant.detail,
        anchor: { kind: 'scene', sceneId: variant.id },
      })),
    },
  })
}

// The figurative half of the #690 aperture catalogue: the icon and signature
// silhouettes at their Soft default, then the two controls the geometric
// reference leaves out - rotation (the silhouette turns while the frame stays
// axis-aligned) and the Cut-out mode (the same boundary, inverted). The heart
// and the cloud get study-length beats; the cats cut past at two seconds.
function apertureIconsReference(): StockShow {
  const id = 'stock-show-reference-aperture-icons'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const frame = { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
  const variants = [
    { id: 'heart', label: 'Heart', seconds: 4, detail: 'The inscribed heart at its Soft default: the first icon, held long enough to study its lobes and point.', viewport: { ...frame, aperture: 'heart' as const } },
    { id: 'star', label: 'Star', seconds: 2, detail: 'A five-point star at its Soft default; Points and Inner radius are its shape parameters.', viewport: { ...frame, aperture: 'star' as const } },
    { id: 'crescent', label: 'Crescent', seconds: 2, detail: 'The crescent at its Soft default; the cutout offset is its shape parameter.', viewport: { ...frame, aperture: 'crescent' as const } },
    { id: 'cloud', label: 'Cloud', seconds: 3, detail: 'The cumulus silhouette: a scalloped crown over a flat base, feathered Soft.', viewport: { ...frame, aperture: 'cloud' as const } },
    { id: 'cat-head', label: 'Cat head', seconds: 2, detail: 'The signature cat head at its Soft default.', viewport: { ...frame, aperture: 'cat-head' as const } },
    { id: 'cat-side-profile', label: 'Side-profile cat', seconds: 2, detail: 'The seated side profile at its Soft default.', viewport: { ...frame, aperture: 'cat-side-profile' as const } },
    { id: 'bastet', label: 'Bastet', seconds: 2, detail: 'The upright Bastet silhouette at its Soft default.', viewport: { ...frame, aperture: 'bastet' as const } },
    { id: 'star-rotated', label: 'Star, rotated', seconds: 3, detail: 'The same star turned inside its frame: rotation is silhouette styling, and the frame stays axis-aligned.', viewport: { ...frame, aperture: 'star' as const, rotation: 0.1 } },
    { id: 'cloud-cut-out', label: 'Cloud, Cut out', seconds: 3, detail: 'The same cloud in Cut-out mode: the silhouette becomes the hole, and the bed shows through it.', viewport: { ...frame, aperture: 'cloud' as const, invert: true } },
  ]
  const scenes: SceneSpec[] = variants.map((variant) => (
    scene(variant.id, variant.label, variant.seconds, [clip('zone-1', 'CompassRose', LESSON_TIME_SCALE)])
  ))
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
      instance('rose', 'CompassRose', LESSON_TIME_SCALE),
    ],
    scenes: variants.map((variant) => ({
      sceneId: variant.id,
      zones: [{
        zoneId: 'zone-1',
        main: [{
          ...placement(`bed-${variant.id}`, 'garden', 0, variant.seconds),
          view: { mirror: false, phase: 0, brightness: 0.3 },
        }],
        overlays: [{
          id: `layer-subject-${variant.id}`,
          name: 'Subject',
          placements: [{
            ...placement(`subject-${variant.id}`, 'rose', 0, variant.seconds),
            opacity: 1,
            viewport: variant.viewport,
          }],
        }],
      }],
    })),
    durationMs: variants.reduce((sum, variant) => sum + variant.seconds, 0) * 1_000,
  }
  return catalogue({
    id, title: 'Aperture Icons & Signature', track: 'portable', collection: 'showcases', level: null, order: 16,
    purpose: 'The icon and signature silhouettes - Heart, Star, Crescent, Cloud, and the three cats - over the same held frame as the geometric reference, then rotation and the Cut-out mode. Shaped silhouettes keep their Soft default, and the subject, bed, frame, and clocks never change, so each passage has exactly one attributable variable.',
    notice: 'The first seven passages change only the silhouette at its Soft default. The last two hold a silhouette and change one control: rotation turns the star while the frame stays axis-aligned, and Cut out inverts the cloud so the silhouette becomes the hole.',
    prompts: ['Drag the rotation on the turned star - the frame never moves, only the silhouette.', "Flip any passage's Mode between Admit inside and Cut out - both sides share one boundary and one feather."],
    guideHeading: 'aperture-icons-and-signature-reference',
    defaultOpen: true,
    output: portableOutput(), zones, layouts: [singleLayout(zones)],
    scenes,
    transitions: cutBoundaries(scenes),
    composition,
    reference: {
      summary: 'Icon and signature silhouettes at one frame, then rotation and the Cut-out mode.',
      patternSlots: {
        cellIds: variants.map((variant) => cellId(variant.id, 'zone-1')),
        instanceIds: ['rose'],
      },
      examples: variants.map((variant) => ({
        id: `example-${variant.id}`,
        label: variant.label,
        detail: variant.detail,
        anchor: { kind: 'scene', sceneId: variant.id },
      })),
    },
  })
}

function transitionReferenceShow(input: {
  id: string
  title: string
  order: number
  purpose: string
  notice: string
  prompts: readonly [string, string]
  guideHeading: string
  specs: TransitionReferenceSpec[]
}): StockShow {
  const zones = logicalZones(['Main'], 2_000)
  const scenes = Array.from({ length: input.specs.length + 1 }, (_, index) => {
    const selected = index % 2 === 1
    const previousExample = index > 0 ? input.specs[index - 1] : null
    const holdSeconds = previousExample?.holdSeconds
      ?? (previousExample?.variantId === 'cut' ? 5 : previousExample ? 3.2 : 3)
    return scene(
      `reference-${index + 1}`,
      index === 0 ? 'Reference' : input.specs[index - 1].label,
      holdSeconds,
      [clip('zone-1', selected ? 'MetaballGarden' : 'IQPalettes', 0.32)],
    )
  })
  const transitions = cutBoundaries(scenes)
  const contentInstanceId = (index: number) => (
    `instance-reference-content-${index % 2 === 0 ? 'reference' : 'selected'}`
  )
  const contentInstanceScenes = scenes.slice(0, 2)
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [
      instance('instance-reference-backdrop', 'Murmuration', 0.18),
      ...contentInstanceScenes.map((item, index) => instance(
        contentInstanceId(index),
        item.clips[0].pattern,
        item.clips[0].timeScale,
      )),
    ],
    scenes: scenes.map((item, index) => ({
      sceneId: item.id,
      zones: [{
        zoneId: 'zone-1',
        main: [{
          ...placement(`placement-reference-backdrop-${index + 1}`, 'instance-reference-backdrop', 0, item.durationMs / 1_000),
          view: { mirror: false, phase: 0, brightness: 0.55 },
        }],
        overlays: [{
          id: `layer-reference-content-${index + 1}`,
          name: 'Transition subject',
          placements: [{
            ...placement(`placement-reference-content-${index + 1}`, contentInstanceId(index), 0, item.durationMs / 1_000),
            opacity: 0.82,
          }],
        }],
      }],
    })),
  }
  const reference: ShowReferenceGuide = {
    summary: 'Each boundary compares two content Patterns over a third quiet moving backdrop; the arrow names which side is incoming, and both content sides are swappable.',
    patternSlots: {
      cellIds: scenes.filter((_, index) => index % 2 === 1).map((item) => cellId(item.id, 'zone-1')),
      // Declarations scope the generated swap surface (#822). Both content
      // sides are swappable; the quiet backdrop is deliberately fixed (the
      // placement doctrine keeps it out of instanceIds), which also removes
      // its previously-offered swap box.
      instanceIds: [contentInstanceId(0), contentInstanceId(1)],
    },
    examples: input.specs.map((spec, index) => ({
      id: spec.id,
      label: spec.label,
      detail: index % 2 === 0 ? 'Reference -> Selected' : 'Selected -> Reference',
      anchor: { kind: 'boundary', transitionId: transitions[index].id },
      ...(spec.changes?.easing ? { easing: spec.changes.easing } : {}),
    })),
  }
  const stock = catalogue({
    id: input.id, title: input.title, track: 'portable', collection: 'showcases', level: null, order: input.order,
    purpose: input.purpose, notice: input.notice, prompts: input.prompts, guideHeading: input.guideHeading,
    defaultOpen: true,
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, transitions, composition, reference,
  })
  const presentation = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
  let show = stock.show
  input.specs.forEach((spec, index) => {
    const item = presentation.find((candidate) => (
      candidate.kind === 'transition' && candidate.familyId === spec.familyId && candidate.variantId === spec.variantId
    ))
    if (!item) throw new Error(`Missing Transition reference item ${spec.familyId}:${spec.variantId}.`)
    const transitionId = transitions[index].id
    show = replaceShowBoundaryTransition(show, transitionId, item, spec.presetId)
    show = updateShowBoundaryTransition(show, transitionId, {
      durationMs: spec.transitionSeconds !== undefined
        ? spec.transitionSeconds * 1_000
        : spec.variantId === 'cut' ? 0 : 1_800,
      easing: SINE_IN_OUT,
      ...spec.changes,
    })
  })
  return { ...stock, show }
}

type ShowcaseKind = 'transform' | 'distortion' | 'color-adjustment'

// Effects references are recast from TestPattern2D to real Patterns that
// still diagnose. CompassRose's cardinal points make translation, rotation,
// and address wrap unmistakable; StainedGlassWeather's leaded panes bend
// visibly under distortion and carry enough distinct hues to expose every
// color adjustment (probe: lum 0.317, flux 0.069 - the calmest bright
// multi-hue source in the corpus). Pacing follows the editor rule: a
// reference beat, one exemplar long enough to study, then quicker cuts.
function effectShowcase(kind: ShowcaseKind): StockShow {
  const affineEffects = (
    values: {
      translate?: { x: number; y: number }
      scale?: { x: number; y: number }
      rotate?: number
      shear?: { x: number; y: number }
    } = {},
  ): ShowClipEffect[] => [
    { id: 'affine-translate', kind: 'translate', x: values.translate?.x ?? 0, y: values.translate?.y ?? 0 },
    { id: 'affine-scale', kind: 'scale', x: values.scale?.x ?? 1, y: values.scale?.y ?? 1 },
    { id: 'affine-rotate', kind: 'rotate', turns: values.rotate ?? 0 },
    { id: 'affine-shear', kind: 'shear', x: values.shear?.x ?? 0, y: values.shear?.y ?? 0 },
  ]
  const configs = {
    transform: {
      id: 'stock-show-showcase-transform-effects', title: 'Transform and Address Effects', order: 1,
      source: 'CompassRose',
      purpose: 'The compass moves continuously between affine Effect states, so each coordinate transformation is visible on its cardinal points; Wrap then changes the address policy rather than a coordinate.',
      notice: 'Translate, Scale, Rotate, and Shear interpolate as one stable Effect stack. Wrap is discrete because it changes where out-of-range samples come from, not where pixels go.',
      prompts: ['Change Rotate from 0.125 to 0.25 turns.', 'Move Wrap before Translate and compare the result.'] as const,
      heading: 'transform-and-address-effects',
      rows: [
        ['Reference', affineEffects(), 3],
        ['Translate', affineEffects({ translate: { x: 0.18, y: -0.12 } }), 4],
        ['Scale', affineEffects({ scale: { x: 0.68, y: 0.82 } }), 3],
        ['Rotate', affineEffects({ rotate: 0.125 }), 3],
        ['Shear', affineEffects({ shear: { x: 0.28, y: 0 } }), 3],
        ['Wrap', [{ id: 'translate', kind: 'translate', x: 0.28, y: 0 }, { id: 'wrap', kind: 'wrap' }], 3],
      ] as Array<[string, ShowClipEffect[], number]>,
    },
    distortion: {
      id: 'stock-show-showcase-distortion-effects', title: 'Distortion Effects', order: 2,
      source: 'StainedGlassWeather',
      purpose: 'Distortions remap where a Clip samples its Pattern. The leaded panes of the glass bend, ripple, and shatter, so the shape, center, and strength of each remap stays readable.',
      notice: 'The Ripple is the slow exemplar; the others cut past more quickly because their silhouettes differ at a glance. Every distortion here samples the same unhurried glass.',
      prompts: ['Move the Swirl center to 0.25, 0.50.', 'Reduce Kaleidoscope segments from 6 to 3.'] as const,
      heading: 'distortion-effects',
      rows: [
        ['Reference', [], 3],
        ['Ripple', [{ id: 'ripple', kind: 'ripple', amount: 0.32, frequency: 4, phase: 0, centerX: 0.5, centerY: 0.5 }], 4],
        ['Swirl', [{ id: 'swirl', kind: 'swirl', amount: 0.36, radius: 0.72, centerX: 0.5, centerY: 0.5 }], 2.5],
        ['Bulge', [{ id: 'bulge', kind: 'bulge', amount: 0.42, radius: 0.58, centerX: 0.5, centerY: 0.5 }], 2.5],
        ['Pixelate', [{ id: 'pixelate', kind: 'pixelate', amount: 0.85, columns: 12, rows: 12 }], 2.5],
        ['Kaleidoscope', [{ id: 'kaleidoscope', kind: 'kaleidoscope', amount: 1, segments: 6, rotation: 0, centerX: 0.5, centerY: 0.5 }], 2.5],
      ] as Array<[string, ShowClipEffect[], number]>,
    },
    'color-adjustment': {
      id: 'stock-show-showcase-color-adjustment-effects', title: 'Color Adjustment Effects', order: 3,
      source: 'StainedGlassWeather',
      purpose: 'Color adjustments change a rendered Clip without changing its geometry. The glass carries every hue at once, so each operation identifies itself in a single look.',
      notice: 'A long reference beat establishes the true colors, then each adjustment cuts past quickly. Opacity fades toward black beside Brightness for comparison; the key Effects live in the Compositing and Key reference, where a lower Layer gives them something to reveal.',
      prompts: ['Compare Contrast against Brightness on the same pane.', 'Change Posterize from 4 levels to 2.'] as const,
      heading: 'color-adjustment-effects',
      rows: [
        ['Reference', [], 4],
        ['Brightness', [{ id: 'brightness', kind: 'brightness', brightness: 0.45 }], 2],
        // Opacity on a single Layer fades toward the black background - a
        // color-family dim, honestly at home beside Brightness. Its
        // over-a-lower-Layer story lives in the Compositing reference.
        ['Opacity', [{ id: 'opacity', kind: 'opacity', opacity: 0.45 }], 2],
        ['Hue', [{ id: 'hue', kind: 'hue', turns: 0.25 }], 2],
        ['Saturation', [{ id: 'saturation', kind: 'saturation', saturation: 0.25 }], 2],
        ['Contrast', [{ id: 'contrast', kind: 'contrast', contrast: 0.72 }], 2],
        ['Invert', [{ id: 'invert', kind: 'invert', amount: 1 }], 2],
        ['Threshold', [{ id: 'threshold', kind: 'threshold', threshold: 0.52, amount: 1 }], 2],
        ['Posterize', [{ id: 'posterize', kind: 'posterize', levels: 4, amount: 1 }], 2],
        ['Color map', [{ id: 'color-map', kind: 'color-map', amount: 1, shadowR: 0.0745, shadowG: 0.0471, shadowB: 0.1686, highlightR: 0.3098, highlightG: 1, highlightB: 0.8824 }], 2],
      ] as Array<[string, ShowClipEffect[], number]>,
    },
  } satisfies Record<ShowcaseKind, {
    id: string; title: string; order: number; source: string; purpose: string; notice: string;
    prompts: readonly [string, string]; heading: string; rows: Array<[string, ShowClipEffect[], number]>
  }>
  const config = configs[kind]
  const zones = logicalZones(['Main'], 2_000)
  const scenes = config.rows.map(([name, effects, seconds], index) => scene(
    `effect-${index + 1}`,
    name,
    seconds + (kind === 'transform' && index > 0 && index < 5 ? 1 : 0),
    [clip('zone-1', config.source, 0.35, undefined, 0.90, effects.length ? effects : undefined)],
  ))
  let composition: ShowCompositionV1 | undefined
  if (kind === 'transform') {
    const affineInstanceId = 'instance-transform-effects'
    const wrapInstanceId = 'instance-wrap-effect'
    const affinePlacementId = 'clip-affine-effects'
    const placementId = (index: number) => (
      index === 0
        ? affinePlacementId
        : index < 5
          ? `${affinePlacementId}--span-effect-${index + 1}`
          : 'clip-wrap-effect'
    )
    composition = {
      version: 1,
      executionModel: 'deterministic-loop',
      patternInstances: [
        instance(affineInstanceId, config.source, 0.35),
        instance(wrapInstanceId, config.source, 0.35),
      ],
      scenes: scenes.map((item, index) => ({
        sceneId: item.id,
        zones: [{
          zoneId: 'zone-1',
          overlays: [],
          main: [{
            ...placement(placementId(index), index < 5 ? affineInstanceId : wrapInstanceId, 0, item.durationMs / 1_000),
            ...(index > 0 && index < 5 ? { logicalClipId: affinePlacementId } : {}),
            view: { mirror: false, phase: 0, brightness: 0.9 },
            effects: (index < 5 ? config.rows[0][1] : config.rows[index][1]).map((effect) => ({ ...effect })),
          }],
        }],
      })),
      durationMs: scenes.reduce((sum, item) => sum + item.durationMs, 0),
    }
    for (let index = 1; index < 5; index += 1) {
      const fromEffects = config.rows[index - 1][1]
      const toEffects = config.rows[index][1]
      for (const [effectIndex, toEffect] of toEffects.entries()) {
        const fromEffect = fromEffects[effectIndex]
        if (!fromEffect || fromEffect.id !== toEffect.id || fromEffect.kind !== toEffect.kind) continue
        for (const parameter of showEffectParameterNames(toEffect)) {
          const parameterId = parameter === 'x'
            ? toEffect.kind === 'translate' ? 'translateX' : toEffect.kind === 'scale' ? 'scaleX' : 'shearX'
            : parameter === 'y'
              ? toEffect.kind === 'translate' ? 'translateY' : toEffect.kind === 'scale' ? 'scaleY' : 'shearY'
              : parameter
          const from = showEffectNumericValue(fromEffect, parameter)
          const to = showEffectNumericValue(toEffect, parameter)
          if (from === to) continue
          const trackId = `track-effect-${index + 1}-${toEffect.id}-${parameterId}`
          const next = addShowPropertyTrack({ scenes }, composition, scenes[index].id, {
            id: trackId,
            target: {
              kind: 'placement-effect',
              placementId: placementId(index),
              effectId: toEffect.id,
              effectKind: toEffect.kind,
              parameterId,
            },
            keyframes: [
              { id: `${trackId}-start`, timeMs: 0, value: from, easing: SINE_IN_OUT },
              { id: `${trackId}-end`, timeMs: 1_000, value: to, easing: LINEAR },
            ],
          })
          if (next === composition) throw new Error(`Transform Effect track rejected: ${trackId}`)
          composition = next
        }
      }
    }
    composition = normalizeShowComposition({ scenes, zones }, composition)
  }
  return catalogue({
    id: config.id, title: config.title, track: 'portable', collection: 'showcases', level: null, order: config.order,
    purpose: config.purpose, notice: config.notice, prompts: config.prompts, guideHeading: config.heading,
    defaultOpen: true, output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes,
    transitions: cutBoundaries(scenes),
    ...(composition ? { composition } : {}),
    reference: {
      summary: 'One Pattern stays constant while each Effect in this family changes the rendered result.',
      // Composition-backed effect showcases (#823) swap their instances with
      // the same slot: the declared scope must name them or the legacy
      // reference fallback swaps cells only and the timeline never relabels.
      patternSlots: {
        cellIds: scenes.map((item) => cellId(item.id, 'zone-1')),
        instanceIds: composition ? composition.patternInstances.map((instance) => instance.id) : [],
      },
      examples: scenes.map((item, index) => ({
        id: `${kind}-${index + 1}`,
        label: item.name,
        detail: index === 0 ? 'Unmodified Pattern reference.' : `${item.name} applied in isolation.`,
        anchor: { kind: 'scene', sceneId: item.id },
      })),
    },
  })
}

// Compositing and key Effects only mean something over a lower Layer, and
// each one is only unmistakable on the subject that shows it at maximum
// contrast (#821). A dim warm IQPalettes bed runs underneath throughout.
// Grayscale Luma Rings (#819) carry the opacity pair and Luma Key - on a
// grayscale subject the luma matte IS the image. Chroma Key rides DoomFire,
// whose orange body carves out while its black field and yellow cores stay.
// Vignette closes the frame over luma-keyed marching waves so the bed stays
// present, and the waves' own controls animate under a held key. The finale
// stacks thin keyed rings over keyed waves over the bed - the documented
// N + U1 + U2 three-layer content-key stack.
//
// Every luma key targets true black (#833): tolerance clears only the black
// field and softness turns the source's own gray ramp into gradient
// opacity. The earlier mid-gray thresholds (tolerance 0.45/0.35) behaved as
// hard keep-the-white mattes and left a gray fringe wherever an antialiased
// edge crossed the cut, which is why the stack finale was dropped in #821;
// on black the same stack blends seamlessly.
function compositingKeyShowcase(): StockShow {
  const id = 'stock-show-showcase-compositing-key-effects'
  const zones = logicalZones(['Main'], 2_000)
  const RINGS_LUMA_KEY: ShowClipEffect = { id: 'luma-key', kind: 'luma-key', target: 0, tolerance: 0.05, softness: 0.35 }
  const WAVES_LUMA_KEY: ShowClipEffect = { id: 'luma-key', kind: 'luma-key', target: 0, tolerance: 0.05, softness: 0.4 }
  // DoomFire's orange body is the chroma target; its black field stays
  // opaque and its yellow-white cores survive, so the carve-out reads as
  // fire with the bed burning through it.
  const FIRE_CHROMA_KEY: ShowClipEffect = { id: 'chroma-key', kind: 'chroma-key', color: '#ff8800', tolerance: 0.28, softness: 0.15 }
  const VIGNETTE: ShowClipEffect = { id: 'vignette', kind: 'vignette', amount: 1, radius: 0.3, softness: 0.25, centerX: 0.5, centerY: 0.5, aspect: 1 }
  interface CompositeRow {
    name: string
    detail: string
    seconds: number
    subject: 'rings' | 'ringsCrisp' | 'fire' | 'waves'
    effects: ShowClipEffect[]
    bedEffects?: ShowClipEffect[]
    placementOpacity?: number
    fadeTrack?: boolean
    angleTrack?: boolean
    finale?: boolean
  }
  const rows: CompositeRow[] = [
    { name: 'Reference', detail: 'Grayscale rings fully opaque; the bed is invisible beneath them.', seconds: 3, subject: 'rings', effects: [] },
    // Two opacities, taught side by side: placement opacity is the
    // source-over weight (the bed genuinely glows through), while the
    // Opacity Effect fades the captured source toward black. A static
    // toward-black opacity reads as mere dimming, so the Effect beat is an
    // animated fade-out - motion is what makes "fading away, and the bed
    // does not return" legible (Jon review round 3).
    { name: 'Layer Opacity', detail: 'The Layer thins over what is beneath: the warm bed glows through everywhere.', seconds: 3, subject: 'rings', effects: [], placementOpacity: 0.34 },
    { name: 'Animated Opacity', detail: 'The Layer opacity rides a Property track from full to nothing: the rings dissolve into the bed.', seconds: 3, subject: 'rings', effects: [], fadeTrack: true },
    { name: 'Luma Key', detail: 'The key targets black: the ring gaps vanish and every gray edge becomes gradient opacity over the bed.', seconds: 3.5, subject: 'rings', effects: [RINGS_LUMA_KEY] },
    { name: 'Chroma Key', detail: 'Orange vanishes: the flame bodies carve out and the bed burns through them.', seconds: 3.5, subject: 'fire', effects: [FIRE_CHROMA_KEY] },
    { name: 'Vignette', detail: 'The frame closes to black at the edges while keyed waves march over the bed.', seconds: 3, subject: 'waves', effects: [WAVES_LUMA_KEY, VIGNETTE], bedEffects: [{ ...VIGNETTE, id: 'vignette-bed' }] },
    // The ender shows what makes Luma sources special: their own controls
    // animate like any other property. The waves' Angle sweeps a full turn
    // while the key holds (Jon direction, round 4).
    // Slow half-turn sweep with a gentle two-cycle pulse on Width and
    // Spacing (Jon, round 5): the bands breathe while they wheel, riding
    // the family's phase-continuity contract (#819).
    { name: 'Animated Angle', detail: "The waves' own Angle, Width, and Spacing animate under a held key - Luma controls are ordinary properties.", seconds: 5, subject: 'waves', effects: [WAVES_LUMA_KEY], angleTrack: true },
    // The stack finale returns (#833): with every key on black the three
    // layers blend as gradient opacity instead of fringing.
    { name: 'Layered', detail: 'Luma on Luma: thin keyed rings over keyed sine waves over the bed - every key on black.', seconds: 3.5, subject: 'ringsCrisp', effects: [RINGS_LUMA_KEY], finale: true },
  ]
  const subjectPattern = { rings: 'LumaRings', ringsCrisp: 'LumaRings', fire: 'DoomFireV20_2D', waves: 'LumaStripes' } as const
  const subjectInstanceId = { rings: 'composite-rings', ringsCrisp: 'composite-rings-crisp', fire: 'composite-fire', waves: 'composite-waves' } as const
  const subjectTimeScale = { rings: 1, ringsCrisp: 1, fire: 1, waves: 1 } as const
  const scenes = rows.map((row, index) => scene(
    `composite-${index + 1}`,
    row.name,
    row.seconds,
    [clip('zone-1', subjectPattern[row.subject], subjectTimeScale[row.subject], undefined, 0.9)],
  ))
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [
      instance('composite-bed', 'IQPalettes', 0.2),
      instance('composite-rings', 'LumaRings', 1),
      // The finale's own rings: narrow Width keeps them thin so the waves
      // read between them; full-scale Feather keeps the ring profile a long
      // gray ramp, which is what the black key turns into gradient opacity.
      // A near-binary source (the old crisp Feather 0.2 tuning) leaves the
      // key nothing to ramp on and reverts to a hard cutout (Jon, #833).
      instance('composite-rings-crisp', 'LumaRings', 1, { sliderFeather: 0.6, sliderWidth: 0.3 }),
      // Full pace and tall flames: the fire enters on a cut and must be
      // roaring, not smoldering, by mid-beat.
      instance('composite-fire', 'DoomFireV20_2D', 1, { sliderFlameHeight: 0.85, sliderSpeed: 0.7 }),
      // Sine waves marching down the screen: full Feather is the sine
      // profile, Angle 0 travels from the top, tightened Spacing.
      instance('composite-waves', 'LumaStripes', 1, {
        sliderFeather: 1, sliderAngle: 0, sliderSpacing: 0.3, sliderWidth: 0.5, sliderLoopInterval: 0.3,
      }),
    ],
    scenes: scenes.map((item, index) => {
      const row = rows[index]
      const subjectLayer = {
        id: `layer-subject-${index + 1}`,
        name: 'Subject',
        placements: [{
          ...placement(`subject-${index + 1}`, subjectInstanceId[row.subject], 0, item.durationMs / 1_000),
          opacity: row.placementOpacity ?? 1,
          ...(row.effects.length ? { effects: row.effects } : {}),
        }],
      }
      // The finale keeps the rings Subject on top and slides the keyed
      // waves between it and the bed; overlays list top-most first.
      const middleLayer = row.finale
        ? [{
            id: `layer-middle-${index + 1}`,
            name: 'Keyed waves',
            placements: [{
              ...placement(`middle-${index + 1}`, 'composite-waves', 0, item.durationMs / 1_000),
              opacity: 1,
              effects: [WAVES_LUMA_KEY],
            }],
          }]
        : []
      return {
        sceneId: item.id,
        ...(row.angleTrack ? {
          propertyTracks: [
            {
              id: `track-angle-${index + 1}`,
              target: {
                kind: 'instance-control' as const,
                instanceId: 'composite-waves',
                exportName: 'sliderAngle',
              },
              keyframes: [
                keyframe(`angle-start-${index + 1}`, 0, 0, LINEAR),
                keyframe(`angle-turn-${index + 1}`, item.durationMs / 1_000, 0.5, LINEAR),
              ],
            },
            {
              id: `track-spacing-${index + 1}`,
              target: {
                kind: 'instance-control' as const,
                instanceId: 'composite-waves',
                exportName: 'sliderSpacing',
              },
              keyframes: [
                keyframe(`spacing-a-${index + 1}`, 0, 0.3),
                keyframe(`spacing-b-${index + 1}`, 1.25, 0.55),
                keyframe(`spacing-c-${index + 1}`, 2.5, 0.3),
                keyframe(`spacing-d-${index + 1}`, 3.75, 0.55),
                keyframe(`spacing-e-${index + 1}`, 5, 0.3),
              ],
            },
            {
              id: `track-width-${index + 1}`,
              target: {
                kind: 'instance-control' as const,
                instanceId: 'composite-waves',
                exportName: 'sliderWidth',
              },
              keyframes: [
                keyframe(`width-a-${index + 1}`, 0, 0.5),
                keyframe(`width-b-${index + 1}`, 1.25, 0.68),
                keyframe(`width-c-${index + 1}`, 2.5, 0.5),
                keyframe(`width-d-${index + 1}`, 3.75, 0.68),
                keyframe(`width-e-${index + 1}`, 5, 0.5),
              ],
            },
          ],
        } : {}),
        ...(row.fadeTrack ? {
          propertyTracks: [{
            id: `track-fade-${index + 1}`,
            target: {
              kind: 'placement-opacity' as const,
              placementId: `subject-${index + 1}`,
            },
            keyframes: [
              keyframe(`fade-hold-${index + 1}`, 0.6, 1),
              keyframe(`fade-out-${index + 1}`, item.durationMs / 1_000 - 0.4, 0.05),
            ],
          }],
        } : {}),
        zones: [{
          zoneId: 'zone-1',
          main: [{
            ...placement(`bed-${index + 1}`, 'composite-bed', 0, item.durationMs / 1_000),
            view: { mirror: false, phase: 0, brightness: 0.4 },
            // The vignette beat closes the WHOLE frame: the bed carries the
            // same iris as the waves, otherwise the un-vignetted bed bleeds
            // full-bright at the edges through the keyed troughs.
            ...(row.bedEffects ? { effects: row.bedEffects } : {}),
          }],
          overlays: [subjectLayer, ...middleLayer],
        }],
      }
    }),
    durationMs: rows.reduce((sum, row) => sum + row.seconds, 0) * 1_000,
  }
  return catalogue({
    id, title: 'Compositing and Key Effects', track: 'portable', collection: 'showcases', level: null, order: 4,
    purpose: "Opacity, Luma Key, Chroma Key, and Vignette decide which of a Clip's pixels reach the mix, so they only mean something over a lower Layer. A warm bed runs underneath the whole reference; every pixel these Effects remove shows the bed instead.",
    notice: "Each Effect rides the subject that shows it best: grayscale Luma Rings for the opacity pair and Luma Key - the matte is the image - DoomFire for Chroma Key, and luma-keyed marching waves under the closing Vignette. Every key targets black, so gray edges blend as gradient opacity. The waves' own Angle, Width, and Spacing animate under a held key, then the finale stacks thin keyed rings over keyed waves over the bed: Luma on Luma.",
    prompts: ['Raise the Luma Key tolerance until only the brightest ring cores survive.', 'Point the Chroma Key at the fire\u2019s yellow instead and watch the cores vanish.'],
    guideHeading: 'compositing-and-key-effects',
    defaultOpen: true,
    output: portableOutput(), zones, layouts: [singleLayout(zones)],
    scenes,
    transitions: cutBoundaries(scenes),
    composition,
    reference: {
      summary: 'A constant warm bed under keyed subjects; each Effect decides which subject pixels reach the mix, ending with thin keyed rings over keyed waves over the bed - every key on black.',
      patternSlots: { cellIds: scenes.map((item) => cellId(item.id, 'zone-1')), instanceIds: ['composite-rings', 'composite-rings-crisp', 'composite-fire', 'composite-waves'] },
      examples: scenes.map((item, index) => ({
        id: `composite-${index + 1}`,
        label: item.name,
        detail: rows[index].detail,
        anchor: { kind: 'scene', sceneId: item.id },
      })),
    },
  })
}


// The Luma family (#819) as an inventory with pace (#822): one beat per
// member, bare for the first half, then a single animated property chosen
// for that member's character. Family controls are favored over generic
// clip transforms - Lean, Fold, Spacing, and pace are what make these
// Patterns different - and every animation is an ordinary Property track.
function lumaSourcesShowcase(): StockShow {
  const id = 'stock-show-showcase-luma-sources'
  const zones = logicalZones(['Main'], 2_000)
  type LumaTrackSpec =
    | { kind: 'control'; exportName: string; keyframes: Array<[number, number]> }
    | { kind: 'transform'; property: keyof ShowClipTransform; keyframes: Array<[number, number]> }
    | { kind: 'time-scale'; keyframes: Array<[number, number]> }
  interface LumaRow {
    name: string
    pattern: string
    detail: string
    // Base pace; a time-scale track replaces this while active, so a beat
    // that ramps pace must start its ramp at the base value to keep the
    // bare half genuinely bare.
    timeScale?: number
    // Non-animated authored controls that shape the beat's bare look.
    controls?: Record<string, number>
    tracks: LumaTrackSpec[]
  }
  // Each beat: 2 s bare, then the animation takes the second 2 s.
  const rows: LumaRow[] = [
    {
      name: 'Stripes', pattern: 'LumaStripes',
      detail: 'Width fattens the bands from thin lines into broad bars.',
      tracks: [{ kind: 'control', exportName: 'sliderWidth', keyframes: [[2, 0.4], [4, 0.85]] }],
    },
    {
      name: 'Sine Waves', pattern: 'LumaStripes',
      detail: 'Lean tips the smooth swells into breaking sawtooth waves.',
      controls: { sliderFeather: 1, sliderSpacing: 0.35 },
      tracks: [{ kind: 'control', exportName: 'sliderLean', keyframes: [[2, 0.5], [4, 1]] }],
    },
    {
      name: 'Chevron', pattern: 'LumaChevron',
      detail: 'Fold breathes from fine herringbone to broad chevrons.',
      tracks: [{ kind: 'control', exportName: 'sliderFold', keyframes: [[2, 0.25], [4, 0.9]] }],
    },
    {
      name: 'Rings', pattern: 'LumaRings',
      detail: 'Spacing pours the rings tighter, then relaxes them wide.',
      tracks: [{ kind: 'control', exportName: 'sliderSpacing', keyframes: [[2, 0.5], [3, 0.2], [4, 0.6]] }],
    },
    {
      name: 'Pinwheel', pattern: 'LumaPinwheel',
      detail: 'The hub glides off-center while the spokes keep turning.',
      tracks: [{ kind: 'transform', property: 'positionX', keyframes: [[2, 0], [4, 0.35]] }],
    },
    {
      name: 'Dots', pattern: 'LumaDots',
      detail: 'The marching lattice slowly wheels a quarter turn.',
      tracks: [{ kind: 'transform', property: 'rotation', keyframes: [[2, 0], [4, 0.25]] }],
    },
    {
      name: 'Weave', pattern: 'LumaWeave',
      detail: 'Pace ramps the interference shimmer from languid to boiling.',
      timeScale: 0.6,
      tracks: [{ kind: 'time-scale', keyframes: [[2, 0.6], [4, 2.5]] }],
    },
    {
      name: 'Spiral', pattern: 'LumaSpiral',
      detail: 'A slow zoom into the winding closes the set.',
      tracks: [
        { kind: 'transform', property: 'scaleX', keyframes: [[2, 1], [4, 1.9]] },
        { kind: 'transform', property: 'scaleY', keyframes: [[2, 1], [4, 1.9]] },
      ],
    },
  ]
  const scenes = rows.map((row, index) => scene(
    `luma-${index + 1}`,
    row.name,
    4,
    [clip('zone-1', row.pattern, row.timeScale ?? 1, undefined, 0.9)],
  ))
  const instanceId = (row: LumaRow) => `luma-${row.name.replace(/[^A-Za-z0-9]+/g, '')}`
  const composition: ShowCompositionV1 = {
    version: 1,
    // An instance-control Property track requires the control to be
    // authored on the instance; seed each animated control at its bare-half
    // value.
    patternInstances: rows.map((row) => {
      const controlTargets = {
        ...(row.controls ?? {}),
        ...Object.fromEntries(row.tracks.flatMap((spec) => (
          spec.kind === 'control' ? [[spec.exportName, spec.keyframes[0][1]]] : []
        ))),
      }
      return instance(instanceId(row), row.pattern, row.timeScale ?? 1, Object.keys(controlTargets).length ? controlTargets : undefined)
    }),
    scenes: scenes.map((item, index) => {
      const row = rows[index]
      const placementId = `luma-clip-${index + 1}`
      const tracks = row.tracks.map((spec, trackIndex) => ({
        id: `track-luma-${index + 1}-${trackIndex}`,
        target: spec.kind === 'control'
          ? { kind: 'instance-control' as const, instanceId: instanceId(row), exportName: spec.exportName }
          : spec.kind === 'transform'
            ? { kind: 'placement-transform' as const, placementId, property: spec.property }
            : { kind: 'instance-time-scale' as const, instanceId: instanceId(row) },
        keyframes: spec.keyframes.map(([seconds, value], keyframeIndex) => (
          keyframe(`kf-${index + 1}-${trackIndex}-${keyframeIndex}`, seconds, value)
        )),
      }))
      return {
        sceneId: item.id,
        propertyTracks: tracks,
        zones: [{
          zoneId: 'zone-1',
          overlays: [],
          main: [placement(placementId, instanceId(row), 0, item.durationMs / 1_000)],
        }],
      }
    }),
    durationMs: rows.length * 4_000,
  }
  return catalogue({
    id, title: 'Luma Sources', track: 'portable', collection: 'showcases', level: null, order: 5,
    purpose: 'The seven Luma Patterns are grayscale key sources with one shared control set. Each gets one beat: bare first, then a single animated property chosen for its character - the family controls are ordinary animatable properties.',
    notice: 'Stripes fattens Width, Sine Waves tips Lean into breaking sawtooths, Chevron breathes Fold, Rings pours Spacing, Pinwheel glides off-center, Dots wheels its lattice, Weave boils its pace, and Spiral zooms its winding. Grayscale throughout: keying them is the Compositing and Key reference\u2019s job.',
    prompts: ['Drag any beat\u2019s animated control yourself and feel the same range.', 'Add a Luma Key over any beat and watch the field become a matte.'],
    guideHeading: 'luma-sources',
    defaultOpen: true,
    output: portableOutput(), zones, layouts: [singleLayout(zones)],
    scenes,
    transitions: cutBoundaries(scenes),
    composition,
    reference: {
      summary: 'Seven grayscale key sources, one beat each: bare, then brought alive by one animated property.',
      // One representative swap slot instead of one per member: swapping
      // family members defeats an inventory, and seven boxes crowd the
      // reference header (Jon review). The Pinwheel beat hosts it because
      // its glide is a clip-transform track, which any replacement pattern
      // supports (#828 tracks the control-track swap failure).
      patternSlots: {
        cellIds: [cellId(scenes[rows.findIndex((row) => row.name === 'Pinwheel')].id, 'zone-1')],
        instanceIds: [instanceId(rows.find((row) => row.name === 'Pinwheel')!)],
      },
      examples: scenes.map((item, index) => ({
        id: `luma-${index + 1}`,
        label: item.name,
        detail: rows[index].detail,
        anchor: { kind: 'scene', sceneId: item.id },
      })),
    },
  })
}


// --- Remixes -----------------------------------------------------------------
// Finished pieces scored over community Patterns, shipped beside Learn and
// Showcases. The CME remix is the v2 teaser gesture, ported from
// scripts/promo/cme-teaser.ts (#704): the flat record and every Property track
// are rebuilt through the same engine operations the script used, so the
// shipped Show matches the published teaser exactly.

type RemixKeyframe = { timeMs: number; value: number; easing: ShowStructuredEasing }

/** One on-beat brightness stab: fast drop, held dark floor, smooth recovery. */
function remixPulse(atMs: number, depth: number, holdMs = 150, recoverMs = 500): RemixKeyframe[] {
  return [
    { timeMs: atMs - 100, value: 1, easing: CUBIC_OUT },
    { timeMs: atMs, value: depth, easing: LINEAR },
    { timeMs: atMs + holdMs, value: depth, easing: SINE_IN_OUT },
    { timeMs: atMs + holdMs + recoverMs, value: 1, easing: LINEAR },
  ]
}

function remixTrack(
  flat: Pick<ShowRecord, 'scenes'>,
  composition: ShowCompositionV1,
  sceneId: string,
  trackId: string,
  target: ShowPropertyAnimationTarget,
  keyframes: RemixKeyframe[],
): ShowCompositionV1 {
  const mustEdit = (label: string, previous: ShowCompositionV1, next: ShowCompositionV1) => {
    // A rejected engine edit returns its input; a silent rejection here would
    // ship a Show missing part of its score, so fail loudly at module load
    // (the catalogue census compiles and validates every entry in CI).
    if (next === previous) throw new Error(`CME remix edit rejected: ${label}`)
    return next
  }
  const [first, second, ...rest] = keyframes
  let next = mustEdit(`${trackId} (track)`, composition, addShowPropertyTrack(flat, composition, sceneId, {
    id: trackId,
    target,
    keyframes: [first, second].map((keyframe, index) => ({ id: `${trackId}-kf-${index + 1}`, ...keyframe })),
  }))
  rest.forEach((keyframe, index) => {
    next = mustEdit(`${trackId} kf@${keyframe.timeMs}`, next, addShowPropertyKeyframe(flat, next, sceneId, trackId, {
      id: `${trackId}-kf-${index + 3}`,
      ...keyframe,
    }))
  })
  return next
}

function remixCoronalMassEjection(): StockShow {
  const id = 'stock-show-remix-coronal-mass-ejection'
  const name = 'Coronal Mass Ejection PXLBLZ remix'
  const INTRO_MS = 8_000
  /** 36s gesture plus two bars of black before the loop restarts. */
  const DURATION_MS = 40_000
  /**
   * Chosen so the frozen final frame lands in the red/orange band of
   * t1 = time(.2). The Show elapsed pattern-time is close to two full 13.1s
   * hue cycles, so this offset warms the opening frames too.
   */
  const TIME_OFFSET_MS = 2_450

  // Flat record: two segments cut at the 8s bar line, one CME cell held across
  // the junction so the Pattern clock never restarts. The Intro is untouched
  // half-speed CME; the Gesture span owns every Property track.
  let flat = createShowWithOutputContract(id, name, createPortableShowOutputContract({
    referenceMapId: 'plane', referencePixelCount: PORTABLE_REFERENCE_PIXELS,
  }))
  flat = updateShowScene(flat, 'scene-1', { name: 'Intro', durationMs: INTRO_MS })
  flat = updateShowScene(flat, 'scene-2', { name: 'Gesture', durationMs: DURATION_MS - INTRO_MS })
  flat = removeShowBoundaryTransition(flat, 'transition-scene-1')
  flat = removeShowClip(flat, flat.cells[1].id)
  const cellId = flat.cells[0].id
  flat = updateShowCellPattern(flat, cellId, {
    pattern: { kind: 'stock', id: 'CoronalMassEjection' },
    patternName: 'CoronalMassEjection',
  })
  flat = updateShowCellAdaptations(flat, cellId, { timeScale: 0.5, timeOffsetMs: TIME_OFFSET_MS })
  flat = extendShowCell(flat, cellId, 2)

  const projection = projectFlatShowToCompositionV1WithCellOrigins(flat, {
    byCellId: { [cellId]: DEMOS.CoronalMassEjection },
    stageDimension: 2,
  })
  let composition: ShowCompositionV1 = {
    ...projection.composition,
    executionModel: 'deterministic-loop',
    durationMs: DURATION_MS,
    markers: [
      { id: 'marker-intro', timeMs: 0, name: 'Intro - half speed' },
      { id: 'marker-rotation', timeMs: 8_000, name: 'Rotation begins' },
      { id: 'marker-accel', timeMs: 12_000, name: 'Accelerando' },
      { id: 'marker-crescendo', timeMs: 24_000, name: 'Crescendo - pulses' },
      { id: 'marker-winddown', timeMs: 28_000, name: 'Wind-down' },
      { id: 'marker-stop', timeMs: 32_000, name: 'Stop' },
      { id: 'marker-fade', timeMs: 35_000, name: 'Fade' },
      { id: 'marker-black', timeMs: 36_000, name: 'Black' },
    ],
  }
  const gesture = composition.scenes.find((candidate) => candidate.sceneId === 'scene-2')
  const placementId = gesture?.zones[0]?.main[0]?.id
  const instanceId = composition.patternInstances[0]?.id
  if (!placementId || !instanceId || composition.patternInstances.length !== 1) {
    throw new Error('CME remix projection did not produce one held instance with a Gesture placement')
  }

  // All track times below are relative to the 32s Gesture span (absolute time
  // minus the 8s Intro). Speed: half speed, long cubic build to 1.75x, hold,
  // land at 0 on the Stop marker.
  composition = remixTrack(flat, composition, 'scene-2', 'track-speed',
    { kind: 'instance-time-scale', instanceId },
    [
      { timeMs: 0, value: 0.5, easing: LINEAR },
      { timeMs: 4_000, value: 0.5, easing: CUBIC_IN },
      { timeMs: 16_000, value: 1.75, easing: LINEAR },
      { timeMs: 20_000, value: 1.75, easing: CUBIC_OUT },
      { timeMs: 24_000, value: 0, easing: LINEAR },
    ])
  // Rotation in signed turns. Quadratic ease-in reads as motion within ~2s of
  // the cut; the later values keep angular velocity continuous at every join.
  composition = remixTrack(flat, composition, 'scene-2', 'track-rotation',
    { kind: 'placement-transform', placementId, property: 'rotation' },
    [
      { timeMs: 0, value: 0, easing: QUADRATIC_IN },
      { timeMs: 16_000, value: 0.75, easing: LINEAR },
      { timeMs: 20_000, value: 1.125, easing: CUBIC_OUT },
      { timeMs: 24_000, value: 1.25, easing: LINEAR },
    ])
  // Scale: push-in to 1.45 (> sqrt(2)) fast enough to stay ahead of the
  // quadratic rotation corner exposure at every instant; holds thereafter.
  for (const axis of ['scaleX', 'scaleY'] as const) {
    composition = remixTrack(flat, composition, 'scene-2', `track-${axis}`,
      { kind: 'placement-transform', placementId, property: axis },
      [
        { timeMs: 0, value: 1, easing: QUADRATIC_IN },
        { timeMs: 4_000, value: 1.45, easing: LINEAR },
      ])
  }
  // Brightness: on-beat pulses through the crescendo, spreading apart and
  // softening through the wind-down; still through the hold; fade to black.
  composition = remixTrack(flat, composition, 'scene-2', 'track-brightness',
    { kind: 'placement-view', placementId, property: 'brightness' },
    [
      { timeMs: 0, value: 1, easing: LINEAR },
      ...[16_000, 17_000, 18_000, 19_000, 20_000].flatMap((atMs) => remixPulse(atMs, 0.05)),
      ...remixPulse(21_000, 0.15),
      ...remixPulse(22_200, 0.3),
      ...remixPulse(23_500, 0.5, 100, 400),
      { timeMs: 27_000, value: 1, easing: SINE_OUT },
      { timeMs: 28_000, value: 0, easing: LINEAR },
    ])

  composition = normalizeShowComposition(flat, composition)
  const show: ShowRecord = { ...flat, composition, updatedAt: UPDATED_AT }
  const note: StockShowNote = {
    label: 'Remixes',
    title: 'Coronal Mass Ejection',
    purpose: 'One Pattern, one 40-second gesture. ZRanger1\'s Coronal Mass Ejection opens at half speed; '
      + 'rotation eases in, speed and spin accelerate together into a crescendo of on-beat brightness pulses, '
      + 'then everything winds down to a dead stop, holds two beats, and fades to black.',
    notice: 'The Pattern is ZRanger1\'s Coronal Mass Ejection 2D, shipped as-is. Every motion beyond its own '
      + 'animation is choreography: speed, rotation, scale, and brightness Property tracks over one held Clip. '
      + 'Remixes are finished pieces rather than lessons, so read the tracks like a score.',
    prompts: [
      'Scrub the crescendo between the 24s and 28s markers: each brightness pulse lands on a beat, and the valleys deepen as the spin accelerates.',
      'Drag the speed track\'s final keyframe up from zero and the dead stop becomes a slow-motion ending.',
    ],
    guide: {
      documentId: 'show-visual-toolkit',
      heading: 'property-animation',
      label: 'Read property animation',
    },
    defaultOpen: true,
  }
  return {
    id, legacySourceIds: ['teaser-cme-01'], name,
    track: 'portable', collection: 'remixes', level: null, order: 1,
    lesson: note.title, description: note.purpose, note, show,
  }
}

// Quadrille (#832): a slow four-quarter build for two held instances. Wavy
// Bands is the substrate voice; Line Dancer 2D is held inside its full-field
// bloom by choreography alone. The dancer's look rides an internal swell,
// zoom = wave(time(0.075)) - one full cycle every 4.9152 s of member time.
// The musical clock is 75 BPM: bar 3.2 s, scene phrase 6.4 s (two bars; Jon
// halved the original four-bar phrase to move the build twice as fast while
// leaving every pattern clock untouched). At the shared EDGE rate the
// dancer covers exactly HALF a swell per phrase, so phrases alternate
// bloom-entry and lace-entry - an A/B pair - and the shaped clock holds the
// full bloom on the dancer's entrance phrase.
//
// The four quarters are Viewport frames in ONE Zone, not routed Zones: a
// quarter-frame Viewport plus a half-scale Transform squeezes the full
// pattern into its quarter. Routing switches price every (Layout, routed
// Zone) slot across all unrolled scenes - the routed draft compiled to
// 170 KB against the 68 KB activation ceiling. Unrolled emission also prices
// every placement arm and every track expression, so the show spends its
// placements deliberately: the mirrored mandala is four arms only while it
// IS the beat, and from the lace onward the ground is one full-frame
// placement. Pose algebra (probed, exact): mirror and rotation compose
// upstream of position, so the NE reflection is mirror + the NW position,
// and the two south reflections take rotation 0.5 + the SE position.
//
// The lace key is a chroma key on black, not a luma key: the dancer's
// saturated blues sit near zero Rec.709 luma even when fully lit, and only
// RGB distance from black separates lit color from true gaps.
function quadrilleRemix(): StockShow {
  const id = 'stock-show-remix-quadrille'
  const zones = logicalZones(['Stage'], PORTABLE_REFERENCE_PIXELS)
  const layouts = [singleLayout(zones)]
  const PHRASE = 6.4
  // Phrase-fraction seconds are binary-inexact; keyframes must land on whole ms.
  const kf = (id: string, seconds: number, value: number, easing: ShowStructuredEasing = SINE_IN_OUT) => (
    { id, timeMs: Math.round(seconds * 1_000), value, easing }
  )
  const DWELL = 0.16
  // Half a swell per phrase at a constant rate; every clock's boundary value.
  const EDGE = 0.384
  // Solves 4.4(EDGE+DWELL)/2 + 0.3(DWELL+T) + 0.3(T+EDGE) + 0.8xEDGE
  // = 2.4576 for the shaped clock's whip peak: a long decelerating glide
  // into the bloom, one whip, and the shared edge tail.
  const TURNAROUND = 1.3173
  const LACE_KEY: ShowClipEffect = { id: 'lace-key', kind: 'chroma-key', color: '#000000', tolerance: 0.06, softness: 0.06 }
  const HUE_TILT: ShowClipEffect = { id: 'hue-tilt', kind: 'hue', turns: 0.35 }
  type Quadrant = 'nw' | 'ne' | 'sw' | 'se'
  // Hard rectangle predicates include both endpoints. End the low halves one
  // 16.16 quantum before 0.5 so every Controller coordinate belongs to
  // exactly one quarter while the high halves still begin at 0.5.
  const LOWER_HALF = 0.5 - (1 / 65_536)
  const FRAMES: Record<Quadrant, { x: number; y: number; width: number; height: number }> = {
    nw: { x: 0, y: 0, width: LOWER_HALF, height: LOWER_HALF },
    ne: { x: 0.5, y: 0, width: 0.5, height: LOWER_HALF },
    sw: { x: 0, y: 0.5, width: LOWER_HALF, height: 0.5 },
    se: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
  }
  // The mandala poses: every quarter reflects its neighbours across the
  // center seams, so four echoes of one live frame read as a folded image.
  const POSES: Record<Quadrant, { mirror: boolean; rotation: number; positionX: number; positionY: number }> = {
    nw: { mirror: false, rotation: 0, positionX: -0.25, positionY: -0.25 },
    ne: { mirror: true, rotation: 0, positionX: -0.25, positionY: -0.25 },
    sw: { mirror: true, rotation: 0.5, positionX: 0.25, positionY: 0.25 },
    se: { mirror: false, rotation: 0.5, positionX: 0.25, positionY: 0.25 },
  }
  interface QuadrantOptions { rotationDelta?: number; effects?: ShowClipEffect[] }
  const quadrant = (placementId: string, instanceId: string, q: Quadrant, options: QuadrantOptions = {}) => {
    const pose = POSES[q]
    return {
      ...placement(placementId, instanceId, 0, PHRASE),
      view: { mirror: pose.mirror, phase: 0, brightness: 1 },
      transform: {
        positionX: pose.positionX, positionY: pose.positionY,
        rotation: pose.rotation + (options.rotationDelta ?? 0),
        scaleX: 0.5, scaleY: 0.5,
      },
      viewport: { enabled: true, ...FRAMES[q], edge: 'hard' as const },
      ...(options.effects ? { effects: options.effects } : {}),
    }
  }
  const fullBands = (placementId: string, options: { rotation?: number; effects?: ShowClipEffect[] } = {}) => ({
    ...placement(placementId, 'bands', 0, PHRASE),
    ...(options.rotation ? { transform: { positionX: 0, positionY: 0, rotation: options.rotation, scaleX: 1, scaleY: 1 } } : {}),
    ...(options.effects ? { effects: options.effects } : {}),
  })
  const layer = (placementEntry: ReturnType<typeof quadrant> | (ReturnType<typeof placement> & { effects?: ShowClipEffect[] })) => ({
    id: `layer-${placementEntry.id}`, name: 'Quarter', placements: [{ ...placementEntry, opacity: 1 }],
  })
  // The dancer's shaped clock for its entrance: glide from the shared edge
  // rate into the slow dwell that holds the bloom, whip through the swell's
  // structured half, and return to the edge rate before the crossfade
  // window. Every clock in the show meets its boundaries at EDGE, so
  // whichever transition arm owns a fade, the dancer runs 0.384x through it
  // and the per-phrase half-swell integral survives every boundary.
  // Symmetric easings preserve the ramp integrals.
  const dancerClock = (sceneId: string) => ({
    id: `clock-${sceneId}`,
    target: { kind: 'instance-time-scale' as const, instanceId: 'dancer' },
    keyframes: [
      kf(`clock-${sceneId}-a`, 0, EDGE, LINEAR),
      kf(`clock-${sceneId}-b`, 4.4, DWELL, SINE_IN_OUT),
      kf(`clock-${sceneId}-c`, 5, TURNAROUND, SINE_IN_OUT),
      kf(`clock-${sceneId}-d`, 5.6, EDGE, LINEAR),
    ],
  })
  // Laced scenes run the swell continuously at EDGE: the lace breathes
  // through each phrase over the bands while phase closure stays exact.
  // Unrolled emission restates instance tracks in every arm, so these
  // two-keyframe holds also collapse what shaped ternary chains would cost.
  const constantClock = (sceneId: string, holdSeconds: number) => ({
    id: `clock-${sceneId}`,
    target: { kind: 'instance-time-scale' as const, instanceId: 'dancer' },
    keyframes: [
      kf(`clock-${sceneId}-a`, 0, EDGE, LINEAR),
      kf(`clock-${sceneId}-b`, holdSeconds, EDGE, LINEAR),
    ],
  })
  const holdTrack = (trackId: string, exportName: string, value: number, endSeconds: number) => ({
    id: trackId,
    target: { kind: 'instance-control' as const, instanceId: 'dancer', exportName },
    keyframes: [kf(`${trackId}-a`, 0, value, LINEAR), kf(`${trackId}-b`, endSeconds, value, LINEAR)],
  })
  const turnTrack = (trackId: string, placementId: string, startSeconds: number, from: number) => ({
    id: trackId,
    target: { kind: 'placement-transform' as const, placementId, property: 'rotation' as const },
    keyframes: [
      kf(`${trackId}-a`, startSeconds, from, LINEAR),
      kf(`${trackId}-b`, startSeconds + 1.4, from + 0.25, LINEAR),
    ],
  })
  const quadrilleSceneIds = ['first-light', 'four-mirrors', 'the-dancer-enters', 'lace-and-turns', 'all-four-dance', 'rejoined'] as const
  const quadrilleSceneNames = ['First light', 'Four mirrors', 'The dancer enters', 'Lace and turns', 'All four dance', 'Rejoined']
  const featured = ['WavyBands', 'WavyBands', 'LineDancer2D', 'LineDancer2D', 'LineDancer2D', 'LineDancer2D']
  // Crossfades EXTEND the compiled timeline: a scene holds its full duration
  // and the fade is appended after it. Scenes that fade out therefore hold
  // 5.6 s so hold + fade lands each boundary exactly on the 6.4 s phrase
  // grid. The 800 ms fade is one beat at 75 BPM and is legal: the old
  // 1,000 ms normalization floor was a #318 vestige that silently clamped
  // these fades and de-phased the grid until #823 removed it. Lace and
  // turns and All four dance are double phrases; the finale holds one full
  // phrase and ends the loop on its shimmer.
  const HOLDS = [PHRASE, 5.6, 5.6, 12, 12, PHRASE]
  const quadrilleScenes: SceneSpec[] = quadrilleSceneIds.map((sceneId, index) => scene(
    sceneId, quadrilleSceneNames[index], HOLDS[index],
    [clip('zone-1', featured[index], featured[index] === 'WavyBands' ? 0.6 : DWELL)],
  ))
  const composition: ShowCompositionV1 = {
    version: 1,
    // deterministic-loop withheld (#823): member state drifts at the Show
    // End wrap (measured); upgrade path is engine state snapshot/restore (#841).
    patternInstances: [
      instance('bands', 'WavyBands', 0.6),
      {
        ...instance('dancer', 'LineDancer2D', EDGE, { sliderSpeed: 1, sliderTwist: 0.66, sliderReflections: 0 }),
        // wave() rises from zero, so the bloom (zoom near 0) sits at member
        // time 0 mod the 4.9152 s swell. The seek centers the entrance
        // phrase's dwell on the swell's zero, less the measured member time
        // the entrance fade advances the clock before the scene's local
        // zero. Calibrated against the rendered bloom window (#832) under
        // the old 1,000 ms fade clamp; +77 ms re-lands the same swell phase
        // now that the authored 800 ms fades compile true (#823):
        // the entry advances 200 ms earlier, so member time drops
        // 0.2 x 0.384 = 76.8 ms.
        time: { timeScale: EDGE, timeOffsetMs: 3_829 },
      },
    ],
    scenes: [
      {
        sceneId: quadrilleSceneIds[0],
        zones: [{ zoneId: 'zone-1', overlays: [], main: [fullBands(`bands-${quadrilleSceneIds[0]}`)] }],
      },
      {
        sceneId: quadrilleSceneIds[1],
        zones: [{
          zoneId: 'zone-1',
          overlays: (['ne', 'sw', 'se'] as const).map((q) => layer(quadrant(`bands-${quadrilleSceneIds[1]}-${q}`, 'bands', q))),
          main: [quadrant(`bands-${quadrilleSceneIds[1]}-nw`, 'bands', 'nw')],
        }],
      },
      {
        sceneId: quadrilleSceneIds[2],
        propertyTracks: [dancerClock(quadrilleSceneIds[2])],
        zones: [{
          zoneId: 'zone-1',
          overlays: [
            layer(quadrant(`dancer-${quadrilleSceneIds[2]}-ne`, 'dancer', 'ne')),
            layer(quadrant(`dancer-${quadrilleSceneIds[2]}-sw`, 'dancer', 'sw')),
            layer(quadrant(`bands-${quadrilleSceneIds[2]}-se`, 'bands', 'se')),
          ],
          main: [quadrant(`bands-${quadrilleSceneIds[2]}-nw`, 'bands', 'nw')],
        }],
      },
      {
        // Double phrase. First: the dancers put on their lace and the
        // mirrored ground unfolds into one continuous field. Second: a wave
        // of turns - the whole ground wheels a slow quarter while each lace
        // quarter takes its own.
        sceneId: quadrilleSceneIds[3],
        propertyTracks: [
          constantClock(quadrilleSceneIds[3], 12),
          {
            id: 'turn-ground',
            target: { kind: 'placement-transform' as const, placementId: `bands-${quadrilleSceneIds[3]}`, property: 'rotation' as const },
            keyframes: [kf('turn-ground-a', 6.4, 0, LINEAR), kf('turn-ground-b', 12, 0.25, LINEAR)],
          },
          turnTrack('turn-ne', `lace-${quadrilleSceneIds[3]}-ne`, 8, 0),
          turnTrack('turn-sw', `lace-${quadrilleSceneIds[3]}-sw`, 9.6, 0.5),
        ],
        zones: [{
          zoneId: 'zone-1',
          overlays: [
            layer(quadrant(`lace-${quadrilleSceneIds[3]}-ne`, 'dancer', 'ne', { effects: [LACE_KEY] })),
            layer(quadrant(`lace-${quadrilleSceneIds[3]}-sw`, 'dancer', 'sw', { effects: [LACE_KEY] })),
          ],
          main: [fullBands(`bands-${quadrilleSceneIds[3]}`)],
        }],
      },
      {
        // Double phrase. The four quarters all wear lace now; the dancer's
        // reflections climb a fold per bar through the first phrase,
        // snapping on the bar line, and the five-fold dance holds through
        // the second. The twist deepens smoothly underneath.
        sceneId: quadrilleSceneIds[4],
        propertyTracks: [
          constantClock(quadrilleSceneIds[4], 12),
          {
            id: 'reflection-steps',
            target: { kind: 'instance-control' as const, instanceId: 'dancer', exportName: 'sliderReflections' },
            keyframes: [
              kf('refl-a', 0, 0, LINEAR), kf('refl-b', 3.15, 0, LINEAR),
              kf('refl-c', 3.2, 0.35, LINEAR), kf('refl-d', 6.35, 0.35, LINEAR),
              kf('refl-e', 6.4, 0.7, LINEAR),
            ],
          },
          {
            id: 'twist-deepen',
            target: { kind: 'instance-control' as const, instanceId: 'dancer', exportName: 'sliderTwist' },
            keyframes: [kf('twist-a', 0, 0.66, LINEAR), kf('twist-b', 5.6, 0.85, LINEAR)],
          },
        ],
        zones: [{
          zoneId: 'zone-1',
          overlays: [
            layer(quadrant(`lace-${quadrilleSceneIds[4]}-nw`, 'dancer', 'nw', { rotationDelta: 0.25, effects: [LACE_KEY] })),
            layer(quadrant(`lace-${quadrilleSceneIds[4]}-ne`, 'dancer', 'ne', { rotationDelta: 0.25, effects: [LACE_KEY] })),
            layer(quadrant(`lace-${quadrilleSceneIds[4]}-sw`, 'dancer', 'sw', { rotationDelta: 0.25, effects: [LACE_KEY] })),
            layer(quadrant(`lace-${quadrilleSceneIds[4]}-se`, 'dancer', 'se', { rotationDelta: 0.25, effects: [LACE_KEY] })),
          ],
          main: [fullBands(`bands-${quadrilleSceneIds[4]}`, { rotation: 0.25, effects: [HUE_TILT] })],
        }],
      },
      {
        // The quarters rejoin: one full-surface laced bloom over the turned
        // ground, ending the loop on the shimmer.
        sceneId: quadrilleSceneIds[5],
        propertyTracks: [
          constantClock(quadrilleSceneIds[5], PHRASE),
          holdTrack('reflection-final', 'sliderReflections', 0.7, PHRASE),
          holdTrack('twist-final', 'sliderTwist', 0.85, PHRASE),
        ],
        zones: [{
          zoneId: 'zone-1',
          overlays: [layer({ ...placement(`lace-${quadrilleSceneIds[5]}`, 'dancer', 0, PHRASE), effects: [LACE_KEY] })],
          main: [fullBands(`bands-${quadrilleSceneIds[5]}`, { rotation: 0.25 })],
        }],
      },
    ],
    durationMs: 8 * PHRASE * 1_000,
  }
  // Placements span exactly their scene's hold; the appended fades render
  // from the segment machinery, not from placement windows.
  composition.scenes.forEach((sceneEntry, index) => {
    const holdMs = Math.round(HOLDS[index] * 1_000)
    for (const zoneEntry of sceneEntry.zones) {
      for (const main of zoneEntry.main) main.durationMs = holdMs
      for (const layerEntry of zoneEntry.overlays) {
        for (const overlay of layerEntry.placements) overlay.durationMs = holdMs
      }
    }
  })
  // The first fold lands ON the beat: solo to mirrors is an atomic cut of
  // the same live frame, so nothing visually jumps but the geometry. Later
  // boundaries fade, and each fade-out scene holds 5.6 s; the folding cut
  // means First light holds the full phrase.
  const transitions: ShowBoundaryTransition[] = quadrilleSceneIds.slice(0, -1).map((sceneId, index) => (
    index === 0
      ? boundary(sceneId, 'cut', 0, LINEAR)
      : boundary(sceneId, 'crossfade', 800, SINE_IN_OUT, { crossfadePolicy: 'live-live' })
  ))
  return catalogue({
    id, title: 'Quadrille', track: 'portable', collection: 'remixes', level: null, order: 2,
    noteLabel: 'Remixes',
    purpose: 'Two Patterns, four quarters, eight phrases at 75 BPM. ZRanger1\'s Wavy Bands is the substrate; '
      + 'Line Dancer 2D rides one internal swell, held in its full-field bloom for its entrance and breathing '
      + 'in and out of its lace thereafter. The stage folds into mirrored quarters, the dancers claim theirs, '
      + 'put on lace, turn, and the quarters finally rejoin - every one an echo of the same two live instances.',
    notice: 'Line Dancer\'s changing looks ride one internal swell. A shaped time track holds its entrance '
      + 'inside the bloom, and every phrase advances the swell by exactly half a cycle, so the phrases pair '
      + 'A/B - bloom-led, then lace-led - all the way to the loop. The loop is choreography, not an edit to '
      + 'the Pattern. Never more than two Pattern instances play: each quarter is a Viewport-framed placement '
      + 'of one of them, and the lace is a chroma key on black over the bands beneath.',
    prompts: [
      'Scrub toward any phrase boundary: the lace shimmer is the dancer\'s own filigree, and each fade crosses it at the shared edge rate.',
      'Open the artifact inventory: two Patterns, one machine each, serve every quarter on the stage.',
    ],
    guideHeading: 'property-animation',
    guideLabel: 'Read property animation',
    defaultOpen: true,
    output: portableOutput(), zones, layouts, scenes: quadrilleScenes, transitions, composition,
  })
}

// Overture (#840): the Proscenium stage performs its own opening night at
// 128 BPM. The governing law is that light only travels the architecture's
// paths - around the arch band, up the columns, out of the apex - and every
// mechanism is the cheap end of the ladder. THREE shared grayscale instances
// carry the whole hour: two LumaMarquee chases (the gold house chase and the
// lone cyan surge) and one LumaRings, whose soft wide rings play velvet
// stage body, apex bloom, and the closing ghost lamp purely through
// placement windows, tints, and scale. Colors are placement color-map
// tints, chase reversal is the placement mirror (an index mirror on the
// Zone's wiring walk, swapped on bar lines where the symmetric bulb
// lattice makes it seamless), and the surge bolts address the Columns
// Zone's local raster halves (column A on top, column B below) with hard
// Viewport frames. Zero property tracks. The eight musical phrases live inside four
// compiled scenes - unrolled emission prices every scene-zone arm, so
// phrase changes that only reschedule ownership use scene-local placement
// windows instead of new scenes - and every boundary is an on-beat Cut
// except the bought curtain wipe into Curtain up.
function overtureRemix(): StockShow {
  const id = 'stock-show-remix-overture'
  // 128 BPM: bar 1.875 s, four-bar phrase 7.5 s, eight phrases = 60 s.
  const BAR = 1.875
  const zones = physicalZones(['Stage', 'Arch', 'Columns'], [250, 250, 500])
  const layouts = [physicalLayout('layout-stage', 'Proscenium stage', zones, [
    [[250, 499]], [[500, 749]], [[0, 249], [750, 999]],
  ])]
  // Palette roles as color-map tints over grayscale sources: marquee gold
  // carries identity, velvet warms the stage interior, white appears only at
  // the peak, and the cyan surge intrudes exactly once.
  const tint = (tintId: string, highlight: [number, number, number], shadow: [number, number, number] = [0, 0, 0]): ShowClipEffect => ({
    id: tintId, kind: 'color-map', amount: 1,
    shadowR: shadow[0], shadowG: shadow[1], shadowB: shadow[2],
    highlightR: highlight[0], highlightG: highlight[1], highlightB: highlight[2],
  })
  const GOLD = tint('tint-gold', [1, 0.72, 0.22])
  const GOLD_DIM = tint('tint-gold-dim', [0.55, 0.38, 0.1])
  const VELVET = tint('tint-velvet', [0.62, 0.1, 0.16], [0.05, 0, 0.02])
  const CYAN = tint('tint-cyan', [0.25, 0.95, 1])
  // The peak's hot red: brighter than the velvet body, still the same
  // family. White never appears - it read as an unearned voice (#840).
  const SCARLET = tint('tint-scarlet', [1, 0.26, 0.16])
  const GHOST = tint('tint-ghost', [1, 0.88, 0.6])
  const BLOOM_KEY: ShowClipEffect = { id: 'bloom-key', kind: 'chroma-key', color: '#000000', tolerance: 0.08, softness: 0.1 }
  // The Columns Zone's local raster stacks column A above column B, so hard
  // half-frame Viewports address one column each.
  const COLUMN_A: ShowClipViewport = { enabled: true, x: 0, y: 0, width: 1, height: 0.5, edge: 'hard' }
  const COLUMN_B: ShowClipViewport = { enabled: true, x: 0, y: 0.5, width: 1, height: 0.5, edge: 'hard' }
  // The ghost lamp: a small soft window at center stage over the shared
  // rings, so the last light left in the theater visibly breathes.
  const LAMP: ShowClipViewport = { enabled: true, x: 0.36, y: 0.33, width: 0.28, height: 0.34, aperture: 'ellipse', edge: 'soft', feather: 0.1 }
  type PlacementExtras = {
    mirror?: boolean; phase?: number; brightness?: number
    viewport?: ShowClipViewport
    transform?: Partial<ShowClipTransform>
    effects?: ShowClipEffect[]
    startBars?: number; durationBars?: number
  }
  const put = (placementId: string, instanceId: string, extras: PlacementExtras = {}) => {
    // Bar fractions of 1.875 s can land off the whole-millisecond grid the
    // record validator requires. Round both endpoints, then take the
    // difference, so a rounded window can never overhang the scene end.
    const startMs = Math.round((extras.startBars ?? 0) * BAR * 1_000)
    const endMs = Math.round(((extras.startBars ?? 0) + (extras.durationBars ?? 4)) * BAR * 1_000)
    return {
      id: placementId, instanceId, startMs, durationMs: endMs - startMs,
      view: { mirror: extras.mirror ?? false, phase: extras.phase ?? 0, brightness: extras.brightness ?? 1 },
      ...(extras.viewport ? { viewport: extras.viewport } : {}),
      ...(extras.transform
        ? { transform: { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1, ...extras.transform } }
        : {}),
      ...(extras.effects ? { effects: extras.effects } : {}),
    }
  }
  const layer = (name: string, ...placements: Array<ReturnType<typeof put>>) => ({
    id: `layer-${placements[0].id}`, name, placements: placements.map((entry) => ({ ...entry, opacity: 1 })),
  })
  // Four compiled scenes: 8 + 8 + 2 + 8 bars. Jon's live-review pacing cut
  // (#840) halved the original twelve-bar opening: the arch solo holds two
  // bars, the columns slam in for two, and the countermotion block takes the
  // back four, so every change lands harder and the complementary colors
  // arrive inside the first phrase pair.
  const sceneIds = ['the-circuits', 'curtain-up', 'the-surge', 'the-house'] as const
  const sceneNames = ['The circuits', 'Curtain up', 'The surge', 'The house']
  const SCENE_BARS = [8, 8, 2, 8]
  const featured = ['LumaMarquee', 'LumaRings', 'LumaMarquee', 'LumaRings']
  const featuredZone = ['zone-2', 'zone-1', 'zone-3', 'zone-1']
  const overtureScenes: SceneSpec[] = sceneIds.map((sceneId, index) => scene(
    sceneId, sceneNames[index], SCENE_BARS[index] * BAR,
    [clip(featuredZone[index], featured[index], 1)],
  ))
  const composition: ShowCompositionV1 = {
    version: 1,
    // deterministic-loop withheld (#823): the full-scene wrap census could not
    // prove exact Show End reset for this record (member state drift, or a
    // transition-extended timeline the census cannot phase-lock); upgrade
    // path is engine state snapshot/restore (#841).
    patternInstances: [
      // One bulb-pitch step per bar; four bulbs around any run. Spacing is
      // tuned so the pitch is exactly 0.25: at every bar boundary the chase
      // phase is zero and the bulb set sits symmetric about the run's
      // midpoint, so a placement mirror swap on the bar line reverses the
      // chase with no visible jump (#840, Jon's smooth-reversal note).
      instance('marquee', 'LumaMarquee', 1, {
        sliderLoopInterval: 0.1875, sliderDirection: 1, sliderSpacing: 0.2347,
        sliderWidth: 0.3, sliderFeather: 0.18, sliderLean: 0.5,
      }),
      // The one intruder: a lone comet that crosses a whole run in two bars.
      instance('surge', 'LumaMarquee', 1, {
        sliderLoopInterval: 0.375, sliderDirection: 1, sliderSpacing: 1,
        sliderWidth: 0.1, sliderFeather: 0.3, sliderLean: 0.9,
      }),
      // Soft wide rings, one breath per bar: the velvet body, the apex
      // bloom, and the ghost lamp are all windows onto this one surface.
      instance('rings', 'LumaRings', 1, {
        sliderLoopInterval: 0.1875, sliderDirection: 1, sliderSpacing: 0.55,
        sliderWidth: 0.45, sliderFeather: 0.8, sliderLean: 0.5,
      }),
    ],
    scenes: [
      {
        // Phrases 1-2, all in red and gold (the first cyan waits for the
        // arch blip past 19 s). Ignition: one gold chase circles the dark
        // arch for two bars. Entrance: the columns slam in wearing the
        // curtain's velvet - the wiring's own canon, A then B. Countermotion
        // at bar 4: the colors trade places (arch to velvet, columns to
        // gold) and the arch reverses; at bar 6 the columns smoothly reverse
        // too - the mirror swap lands on a bar line where the symmetric
        // bulb lattice makes the reversal seamless - while the velvet glows
        // behind the opening as anticipation.
        sceneId: sceneIds[0],
        zones: [
          {
            zoneId: 'zone-1', overlays: [],
            main: [put('stage-anticipation', 'rings', { startBars: 4, durationBars: 4, brightness: 0.35, effects: [VELVET] })],
          },
          {
            zoneId: 'zone-2', overlays: [],
            main: [
              put('arch-ignition', 'marquee', { durationBars: 4, effects: [GOLD] }),
              put('arch-reversed', 'marquee', { startBars: 4, durationBars: 4, mirror: true, effects: [VELVET] }),
            ],
          },
          {
            zoneId: 'zone-3', overlays: [],
            main: [
              put('cols-canon', 'marquee', { startBars: 2, durationBars: 2, effects: [VELVET] }),
              put('cols-forward', 'marquee', { startBars: 4, durationBars: 2, effects: [GOLD] }),
              put('cols-reversed', 'marquee', { startBars: 6, durationBars: 2, mirror: true, effects: [GOLD] }),
            ],
          },
        ],
      },
      {
        // Phrases 4-5, entered through the bought curtain wipe. Curtain up:
        // the stage ignites - velvet at full depth with a gold bloom keyed
        // over it - while the marquee doubles its bulbs with a phase-offset
        // twin. One world: the bloom lifts to the apex and the same live
        // rings pour out of it across arch and stage together.
        sceneId: sceneIds[1],
        zones: [
          {
            zoneId: 'zone-1',
            overlays: [layer(
              // The bloom arrives WITH one-world on the existing bar-4 edge:
              // the curtain phrase is pure velvet, then the apex pours.
              'Bloom',
              put('bloom-apex', 'rings', { startBars: 4, durationBars: 4, transform: { positionY: -0.55, scaleX: 1.6, scaleY: 1.6 }, effects: [BLOOM_KEY, GOLD] }),
            )],
            main: [put('stage-velvet', 'rings', { durationBars: 8, brightness: 0.8, effects: [VELVET] })],
          },
          {
            zoneId: 'zone-2', overlays: [],
            main: [
              put('arch-steady', 'marquee', { durationBars: 3.25, effects: [GOLD] }),
              // The blip: one flash of the intruder at the end of the gold
              // hold - the surge's only warning shot. It ends on the bar-4
              // edge the one-world rings already own, so the whole event
              // costs a single new time-edge in the unrolled score (#840).
              put('arch-blip', 'marquee', { startBars: 3.25, durationBars: 0.75, effects: [CYAN] }),
              // The red chase takes one-world; the gold apex rings - the
              // arch's best look - are saved for the finale (#840 review).
              put('arch-redchase', 'marquee', { startBars: 4, durationBars: 4, effects: [SCARLET] }),
            ],
          },
          {
            zoneId: 'zone-3', overlays: [],
            main: [
              put('cols-hold', 'marquee', { durationBars: 4, effects: [GOLD_DIM] }),
              // The columns turn ember red for the whole one-world passage,
              // entering on the existing bar-4 edge for free.
              put('cols-ember', 'marquee', { startBars: 4, durationBars: 4, effects: [VELVET] }),
            ],
          },
        ],
      },
      {
        // Phrase 6. The cut from full voice IS the short: the theater goes
        // black and one cyan bolt runs the wiring walk end to end - up
        // column A, across the stage, over the arch, down column B. (The
        // two warm bars this scene once opened with duplicated the
        // one-world tail for +9 KB; the harder drop reads better, #840.)
        sceneId: sceneIds[2],
        zones: [
          {
            zoneId: 'zone-1', overlays: [],
            main: [put('surge-stage-bolt', 'surge', { startBars: 0.5, durationBars: 0.5, effects: [CYAN] })],
          },
          {
            zoneId: 'zone-2', overlays: [],
            main: [put('surge-arch-bolt', 'surge', { startBars: 1, durationBars: 0.5, effects: [CYAN] })],
          },
          {
            zoneId: 'zone-3',
            overlays: [layer('Bolt out', put('surge-colB-bolt', 'surge', { startBars: 1.5, durationBars: 0.5, viewport: COLUMN_B, effects: [CYAN] }))],
            main: [put('surge-colA-bolt', 'surge', { durationBars: 0.5, viewport: COLUMN_A, effects: [CYAN] })],
          },
        ],
      },
      {
        // Phrases 7-8. Full house: every surface at full voice - doubled
        // marquee breaking white, the counter-scrolling twins, the bloom
        // over the velvet. Ghost light: one last full bar, then the theater
        // goes dark except a single warm lamp breathing at center stage,
        // and the loop hands it back to the circuit test.
        sceneId: sceneIds[3],
        zones: [
          {
            zoneId: 'zone-1',
            overlays: [layer('Bloom', put('house-bloom', 'rings', { durationBars: 5, effects: [BLOOM_KEY, SCARLET] }))],
            main: [
              put('house-velvet', 'rings', { durationBars: 5, effects: [VELVET] }),
              put('ghost-lamp', 'rings', { startBars: 5, durationBars: 3, viewport: LAMP, effects: [GHOST] }),
            ],
          },
          {
            // The finale arch wears the gold apex rings - the arch's best
            // look, saved for last - while the stage burns scarlet beneath.
            // White never earned a voice in this palette (#840 live review).
            zoneId: 'zone-2', overlays: [],
            main: [put('house-arch', 'rings', { durationBars: 5, transform: { positionY: -0.5, scaleX: 1.6, scaleY: 1.6 }, effects: [GOLD] })],
          },
          {
            zoneId: 'zone-3', overlays: [],
            main: [put('house-cols', 'marquee', { durationBars: 5, mirror: true, effects: [GOLD] })],
          },
        ],
      },
    ],
    durationMs: 26 * BAR * 1_000,
  }
  // Every boundary is an on-beat Cut - including the curtain, which lands as
  // a snap to full light. A 900 ms curtain wipe measured +33 KB of unrolled
  // boundary emission on this routed stage (#840), a third of the whole
  // budget, so the transition luxury goes back on the shelf: the cut IS the
  // reveal.
  const transitions: ShowBoundaryTransition[] = cutBoundaries(overtureScenes)
  return normalizedCatalogue({
    id, title: 'Overture', track: 'installation', collection: 'remixes', level: null, order: 3,
    noteLabel: 'Remixes',
    purpose: 'The building is the performer. Three grayscale Luma instances play a 1,000-LED proscenium at '
      + '128 BPM, and every light event travels the architecture\'s own paths: the marquee chases the arch '
      + 'band\'s wiring, the columns climb as the walk\'s built-in canon, blooms pour out of the apex, and '
      + 'one cyan surge runs the whole installer\'s walk before the house comes up and the ghost light ends '
      + 'the night.',
    notice: 'Every color is a placement tint over grayscale sources, and every reversal is a placement '
      + 'mirror on the Zone\'s wiring walk, landing on bar lines where the symmetric bulb lattice makes '
      + 'the swap seamless. One rings surface plays velvet body, apex bloom, and the closing ghost lamp '
      + 'through nothing but placement windows and scale. The per-column choreography addresses the Columns Zone\'s local '
      + 'raster - column A is its top half, column B its bottom - through hard Viewport frames. No property '
      + 'tracks anywhere: the score only schedules ownership, and the patterns carry all the motion on '
      + 'exact bar-locked loops.',
    prompts: [
      'Watch the surge phrase: the bolt crosses column A, the stage, the arch, and column B in the exact order the installer wired them.',
      'Open any marquee placement: one instance serves the arch and both columns, in both colors and both directions of travel.',
    ],
    guideHeading: 'installation-output-and-physical-ranges',
    guideLabel: 'Read installation mapping',
    defaultOpen: true,
    output: { kind: 'installation', mapId: 'proscenium-stage-2d', pixelCount: 1_000 },
    zones, layouts, scenes: overtureScenes, transitions, composition,
  })
}

function normalizedCatalogue(input: CatalogueInput): StockShow {
  const stock = catalogue(input)
  if (!stock.show.composition) return stock
  return {
    ...stock,
    show: {
      ...stock.show,
      composition: normalizeShowComposition(stock.show, stock.show.composition),
    },
  }
}

function catalogue(input: CatalogueInput): StockShow {
  const name = input.level ? `${input.level + input.order} ${input.title}` : input.title
  const transitions = input.transitions ?? []
  const scenes: ShowScene[] = input.scenes.map((item) => ({
    id: item.id, name: item.name, durationMs: item.durationMs,
    ...(item.routingTargets ? { routingTargets: item.routingTargets } : {}),
    ...(item.sampleTargets ? { sampleTargets: item.sampleTargets } : {}),
  }))
  const cells: ShowCell[] = input.scenes.flatMap((item) => item.clips.map((source) => ({
    id: cellId(item.id, source.zoneId), zoneId: source.zoneId, sceneId: item.id, sceneSpan: 1,
    pattern: { kind: 'stock', id: source.pattern }, patternName: source.pattern,
    adaptations: { mirror: false, phase: 0, brightness: source.brightness ?? 1, timeScale: source.timeScale },
    restartOnEntry: source.restartOnEntry ?? false,
    ...(source.controls ? { controlTargets: source.controls } : {}),
    ...(source.effects ? { effects: source.effects } : {}),
  })))
  const outputContract = input.output.kind === 'portable'
    ? createPortableShowOutputContract({ referenceMapId: input.output.mapId, referencePixelCount: input.output.pixelCount })
    : createInstallationShowOutputContract({ outputMapId: input.output.mapId, pixelCount: input.output.pixelCount })
  const show: ShowRecord = {
    id: input.id, name, scenes, zones: input.zones, cells, routingLayouts: input.layouts,
    transitions, stageMapId: input.output.mapId, outputContract,
    ...(input.composition ? { composition: input.composition } : {}), updatedAt: UPDATED_AT,
  }
  // The reference's declared patternSlots scope the swap surface: generated
  // groups that touch none of the declared cells or instances are dropped,
  // so a showcase can expose one representative slot instead of one box per
  // unique Pattern (#822 - seven boxes crowded the Luma Sources header).
  const declaredSlots = input.reference?.patternSlots
  const patternSlots = input.reference
    ? showcasePatternSlotsInFirstAppearance(show).filter((group) => (
        !declaredSlots
        || group.instanceIds.some((id) => declaredSlots.instanceIds.includes(id))
        || group.cellIds.some((id) => declaredSlots.cellIds.includes(id))
      ))
    : input.patternSlots?.map((instanceIds) => ({ cellIds: [], instanceIds }))
  const number = input.level ? String(input.level + input.order) : undefined
  const note: StockShowNote = {
    label: input.noteLabel ?? (input.level ? `Learn ${input.level}` : 'Showcases'),
    ...(number ? { number } : {}), title: input.title, purpose: input.purpose, notice: input.notice,
    prompts: input.prompts,
    guide: {
      documentId: input.guideDocumentId ?? 'show-visual-toolkit',
      heading: input.guideHeading,
      label: input.guideLabel ?? `Read ${input.title.toLowerCase()}`,
    },
    defaultOpen: input.defaultOpen ?? input.collection === 'learn',
  }
  return {
    id: input.id, name, track: input.track, collection: input.collection, level: input.level, order: input.order,
    lesson: input.title, description: input.purpose, note,
    ...(input.zonesOpenByDefault ? { zonesOpenByDefault: true } : {}),
    ...(patternSlots?.length ? { patternSlots } : {}),
    ...(input.reference ? { reference: input.reference } : {}), show,
  }
}

function showcasePatternSlotsInFirstAppearance(show: ShowRecord): ShowPatternSlotGroup[] {
  const instances = new Map(
    show.composition?.patternInstances.map((instance) => [instance.id, instance]) ?? [],
  )
  const cellIdsByPattern = new Map<string, string[]>()
  const instanceIdsByPattern = new Map<string, string[]>()
  const patternKey = (pattern: ShowCell['pattern']) => `${pattern.kind}:${pattern.id}`

  for (const cell of show.cells) {
    const key = patternKey(cell.pattern)
    const ids = cellIdsByPattern.get(key) ?? []
    ids.push(cell.id)
    cellIdsByPattern.set(key, ids)
  }
  for (const instance of instances.values()) {
    const key = patternKey(instance.pattern)
    const ids = instanceIdsByPattern.get(key) ?? []
    ids.push(instance.id)
    instanceIdsByPattern.set(key, ids)
  }

  const orderedPatternKeys: string[] = []
  const seen = new Set<string>()
  const addPattern = (pattern: ShowCell['pattern'] | undefined) => {
    if (!pattern) return
    const key = patternKey(pattern)
    if (seen.has(key)) return
    seen.add(key)
    orderedPatternKeys.push(key)
  }

  if (show.composition) {
    for (const scene of show.composition.scenes) {
      for (const zone of scene.zones) {
        const placements = [
          ...zone.main,
          ...zone.overlays.flatMap((layer) => layer.placements),
        ]
        for (const placement of placements) addPattern(instances.get(placement.instanceId)?.pattern)
      }
    }
  } else {
    for (const cell of show.cells) addPattern(cell.pattern)
  }

  return orderedPatternKeys.map((key) => ({
    cellIds: cellIdsByPattern.get(key) ?? [],
    instanceIds: instanceIdsByPattern.get(key) ?? [],
  }))
}

function scene(
  id: string,
  name: string,
  seconds: number,
  clips: ClipSpec[],
  routingTargets?: ShowScene['routingTargets'],
  sampleTargets?: ShowScene['sampleTargets'],
): SceneSpec {
  return {
    id, name, durationMs: seconds * 1_000, clips,
    ...(routingTargets ? { routingTargets } : {}),
    ...(sampleTargets ? { sampleTargets } : {}),
  }
}

function clip(zoneId: string, pattern: string, timeScale: number, controls?: Record<string, number>, brightness = 1, effects?: ShowClipEffect[]): ClipSpec {
  return { zoneId, pattern, timeScale, brightness, ...(controls ? { controls } : {}), ...(effects ? { effects } : {}) }
}

function boundary(afterSceneId: string, kind: Exclude<ShowBoundaryTransition['kind'], 'routing'>, durationMs: number, easing: ShowStructuredEasing, extra: Partial<ShowBoundaryTransition> = {}): ShowBoundaryTransition {
  return { id: `transition-${afterSceneId}`, afterSceneId, kind, durationMs, easing, ...extra }
}

function cutBoundaries(scenes: SceneSpec[]): ShowBoundaryTransition[] {
  return scenes.slice(0, -1).map((item) => boundary(item.id, 'cut', 0, LINEAR))
}

function logicalZones(names: string[], pixelCount: number): ShowZone[] {
  const base = Math.floor(pixelCount / names.length)
  return names.map((name, index) => ({
    id: `zone-${index + 1}`, name,
    nominalPixelCount: index === names.length - 1 ? pixelCount - base * index : base,
    color: COLORS[index % COLORS.length],
  }))
}

function physicalZones(names: string[], counts: number[]): ShowZone[] {
  return names.map((name, index) => ({ id: `zone-${index + 1}`, name, nominalPixelCount: counts[index], color: COLORS[index % COLORS.length] }))
}

function singleLayout(zones: ShowZone[]): ShowRoutingLayout {
  return { id: 'layout-main', name: 'Main', zones: [], logical: { kind: 'single', zoneIds: [zones[0].id] } }
}

function splitLayout(id: string, name: string, zones: ShowZone[], axis: 'x' | 'y'): ShowRoutingLayout {
  return { id, name, zones: [], logical: { kind: 'split', zoneIds: [zones[0].id, zones[1].id], axis } }
}

function physicalLayout(id: string, name: string, zones: ShowZone[], ranges: Array<Array<[number, number]>>): ShowRoutingLayout {
  return { id, name, zones: zones.map((zone, index) => ({ zoneId: zone.id, ranges: ranges[index].map(([start, end]) => ({ start, end })) })) }
}

function portableOutput(): CatalogueInput['output'] {
  return { kind: 'portable', mapId: 'plane', pixelCount: PORTABLE_REFERENCE_PIXELS }
}

function cellId(sceneId: string, zoneId: string): string {
  return `cell-${sceneId}-${zoneId}`
}

function instance(id: string, pattern: string, timeScale: number, controlTargets?: Record<string, number>): ShowCompositionV1['patternInstances'][number] {
  return { id, pattern: { kind: 'stock', id: pattern }, patternName: pattern, time: { timeScale, timeOffsetMs: 0 }, ...(controlTargets ? { controlTargets } : {}) }
}

function placement(id: string, instanceId: string, startSeconds: number, durationSeconds: number) {
  return {
    id, instanceId, startMs: startSeconds * 1_000, durationMs: durationSeconds * 1_000,
    view: { mirror: false, phase: 0, brightness: 1 },
  }
}

function keyframe(id: string, seconds: number, value: number, easing: ShowStructuredEasing = SINE_IN_OUT) {
  return { id, timeMs: seconds * 1_000, value, easing }
}

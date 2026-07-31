import type {
  ShowBoundaryTransition,
  ShowCell,
  ShowClipEffect,
  ShowClipTransform,
  ShowCompositionV1,
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
import type { ShowReferenceGuide } from '@/engine/showReferenceShow'
import { replaceShowBoundaryTransition } from '@/engine/showTransitionAuthoring'
import { updateShowBoundaryTransition } from '@/engine/showModel'
import { buildShowToolkitPresentationCatalogue } from '@/engine/showVisualToolkitPresentation'
import {
  createInstallationShowOutputContract,
  createPortableShowOutputContract,
} from '@/engine/showOutputContract'

export type StockShowTrack = 'portable' | 'installation'
export type StockShowCollection = 'learn' | 'showcases'

export interface StockShowNote {
  label: string
  number?: string
  title: string
  purpose: string
  notice: string
  prompts: readonly [string, string]
  guide: {
    documentId: 'show-visual-toolkit'
    heading: string
    label: string
  }
  defaultOpen: boolean
}

export interface StockShow {
  id: string
  name: string
  track: StockShowTrack
  collection: StockShowCollection
  level: 100 | 200 | null
  order: number
  lesson: string
  description: string
  note: StockShowNote
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
  level: 100 | 200 | null
  order: number
  purpose: string
  notice: string
  prompts: readonly [string, string]
  guideHeading: string
  defaultOpen?: boolean
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
const CUBIC_IN_OUT: ShowStructuredEasing = { curve: 'cubic', direction: 'in-out' }
const LINEAR: ShowStructuredEasing = { curve: 'linear' }
const QUADRATIC_IN: ShowStructuredEasing = { curve: 'quadratic', direction: 'in' }
const COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#22c55e']
const CARDINAL_DIRECTIONS = [
  { id: 'east', label: 'east', turns: 0 },
  { id: 'south', label: 'south', turns: 0.25 },
  { id: 'west', label: 'west', turns: 0.5 },
  { id: 'north', label: 'north', turns: 0.75 },
] as const

export const STOCK_SHOWS: StockShow[] = [
  learn101(), learn102(), learn103(), learn104(), learn105(), learn106(),
  learn201(), learn202(), learn203(), learn204(), learn205(), learn206(),
  effectShowcase('transform'), effectShowcase('distortion'), effectShowcase('color-output'),
  wipeAndMixTransitionReference(), shapeRevealTransitionReference(), motionTransitionReference(),
  propertyAnimationReference(), easingReference(),
  redlineInstallation(),
]

export function stockShowById(id: string | null | undefined): StockShow | undefined {
  return id ? STOCK_SHOWS.find((item) => item.id === id) : undefined
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
  const composition: ShowCompositionV1 = {
    version: 1,
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
  }
  return catalogue({
    id, title: 'Clips, Cuts, and Blank Time', track: 'portable', collection: 'learn', level: 100, order: 1,
    purpose: 'A Clip occupies a span of Show time on a Layer. Where two Clips touch, the junction between them is a Cut; where none is scheduled, the Show renders black.',
    notice: 'The two seconds before the final Clip are empty on purpose. Blank time is a valid part of the timeline, not a mistake.',
    prompts: ['Split the first Clip in half without changing the picture.', 'Drag the last Clip left to close the gap, then back to reopen it.'],
    guideHeading: 'clips-cuts-and-blank-time',
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
  const composition: ShowCompositionV1 = {
    version: 1,
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
        kind: 'crossfade', durationMs: 2_000, easing: SINE_IN_OUT,
      },
      {
        id: 'transition-horizon-mandala', fromPlacementId: 'clip-horizon', toPlacementId: 'clip-mandala',
        kind: 'wipe', durationMs: 1_500, easing: CUBIC_IN_OUT,
        direction: 0, feather: 0.08, edgePolicy: 'dither',
      },
    ],
    durationMs: 16_500,
  }
  return catalogue({
    id, title: 'Transitions and Values', track: 'portable', collection: 'learn', level: 100, order: 2,
    purpose: 'A Transition is its own entity at the junction between two Clips. It owns how the picture changes; the destination Clip still owns the values it arrives at.',
    notice: 'The Crossfade and the Wipe change the picture. The brightness ramp on the last Clip is a separate, Clip-owned curve.',
    prompts: ['Shorten the Crossfade from 2.0 s to 0.5 s.', "Change where the last Clip's brightness settles from 45% to 100%."],
    guideHeading: 'transitions-and-clip-values',
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
  const composition: ShowCompositionV1 = {
    version: 1,
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
  }
  return catalogue({
    id, title: 'Clip Transform', track: 'portable', collection: 'learn', level: 100, order: 3,
    purpose: 'A Clip can be moved, turned, resized, or flipped on the Stage. The Pattern inside it keeps playing exactly as before; only where its picture lands changes, and no second copy of the Pattern is started.',
    notice: 'Every Clip here shares one Pattern instance, so the rose keeps turning at the same rate while only its placement changes.',
    prompts: ['Center the offset Clip (2) by setting Position back to 0, 0.', 'Rotate the Scale Clip (4) by 72 degrees; because that differs from Clip 3, the timeline gives it its own marker.'],
    guideHeading: 'clip-transform',
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
  const composition: ShowCompositionV1 = {
    version: 1,
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
  }
  return catalogue({
    id, title: 'Effects and Ordering', track: 'portable', collection: 'learn', level: 100, order: 4,
    purpose: 'An Effect changes the picture a Clip has already drawn, without editing the Pattern. A Clip holds its Effects as a list, and each one works on the result of the one above it, so the same two Effects in a different order do not give the same picture.',
    notice: 'Clips 3 and 4 carry the same Brightness and the same Threshold, swapped. Clip 3 lowers Brightness first, so only the brightest pixels still clear the Threshold and a sparse scatter survives at full strength. Clip 4 applies Threshold first, so the whole shape survives and Brightness then lowers it. Almost the same amount of light, a completely different picture.',
    prompts: ["On Clip 3, open Brightness's action menu and choose Move later so Brightness runs after Threshold, then watch the whole shape come back.", "Leave the order alone on Clip 3 and lower that Clip's Threshold until more of the shape survives."],
    guideHeading: 'clip-effects',
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 105 pairs woven linework against a soft liquid field so the split reads as a
// boundary between two different pictures rather than one picture with a seam.
// Two instances serve all four Clips: the swap at the halfway Cut is a change of
// side, not a second pair of Patterns, which is also what keeps the artifact
// small enough for two Zones to be affordable.
function learn105(): StockShow {
  const id = 'stock-show-105-portable-zones'
  const zones = logicalZones(['Left', 'Right'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('sides', 'Sides', 14, [
      clip('zone-1', 'RibbonLoom', LESSON_TIME_SCALE),
      clip('zone-2', 'Caustics', LESSON_TIME_SCALE),
    ]),
  ]
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [
      instance('ribbons', 'RibbonLoom', LESSON_TIME_SCALE),
      instance('water', 'Caustics', LESSON_TIME_SCALE),
    ],
    scenes: [{
      sceneId: 'sides',
      zones: [
        {
          zoneId: 'zone-1',
          overlays: [],
          main: [placement('clip-left-ribbons', 'ribbons', 0, 7), placement('clip-left-water', 'water', 7, 7)],
        },
        {
          // The Cut lands at the same instant in both Zones, so the two Patterns
          // trade sides in one move instead of drifting past each other.
          zoneId: 'zone-2',
          overlays: [],
          main: [placement('clip-right-water', 'water', 0, 7), placement('clip-right-ribbons', 'ribbons', 7, 7)],
        },
      ],
    }],
    durationMs: 14_000,
  }
  return catalogue({
    id, title: 'Portable Zones', track: 'portable', collection: 'learn', level: 100, order: 5,
    purpose: 'A Zone is a named part of the Stage that holds its share of whatever surface the Show ends up on. Each Zone runs its own Clip, so two Patterns play side by side without either one being told how many LEDs it got.',
    notice: 'The split never moves. At the halfway Cut the two Patterns simply trade sides, and each Zone keeps its own row on the timeline.',
    prompts: ["The two Clips in each Zone touch, and that junction is a real entity rather than a seam. Drag three seconds off the end of the second Clip, then click the junction and give it a two-second Crossfade.", 'Now drag the second Clip later. The Crossfade travels with it rather than staying put, because the junction belongs to the pair of Clips and not to a moment on the ruler.'],
    guideHeading: 'portable-zones',
    output: portableOutput(), zones, layouts: [splitLayout('layout-side-by-side', 'Side by side', zones, 'x')], scenes, composition,
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
  const composition: ShowCompositionV1 = {
    version: 1,
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
        kind: 'crossfade', durationMs: 3_000, easing: SINE_IN_OUT,
      },
      {
        // Both Sky Patterns are radial, so a circle opening from the center
        // reads as the reprise growing out of the mandala rather than covering it.
        id: 'transition-sky-mandala-reprise', fromPlacementId: 'clip-sky-mandala', toPlacementId: 'clip-sky-reprise',
        kind: 'portal', durationMs: 3_000, easing: SINE_IN_OUT,
        shape: 'circle', revealMode: 'grow-incoming',
        centerX: 0.5, centerY: 0.5, featherPolicy: 'blend', feather: 0.12,
      },
      {
        // The Ground returns to the same Pattern, so a blend would show nothing:
        // both sides are the same pixels. A Dissolve breaks the garden apart and
        // reassembles it, which is visible where a blend would not be.
        id: 'transition-ground-garden-return', fromPlacementId: 'clip-ground-garden', toPlacementId: 'clip-ground-return',
        kind: 'dither', durationMs: 2_500, easing: CUBIC_IN_OUT,
        dissolveVariant: 'coherent-noise', seed: 106,
      },
    ],
    durationMs: 30_000,
  }
  return catalogue({
    id, title: 'Built from Basics', track: 'portable', collection: 'learn', level: 100, order: 6,
    purpose: 'Everything in this Show came from the five lessons before it: Clips, Transitions, value curves, a Clip Transform, one Effect, and two Zones. What is new is that the pieces are timed against each other, so the Sky and the Ground arrive and leave as one gesture rather than two. Every junction here is a Transition rather than a Cut, which is the one deliberate departure from 101.',
    notice: 'Three junctions, three different Transitions: a Crossfade, a circle opening from the center, and a Dissolve that reassembles the Ground. The garden then turns faster and faster while both Zones fade to black together and hold it.',
    prompts: ['Change the circle Transition in the Sky to a different shape and watch the same junction tell a different story.', 'Drag the two release curves apart so the Zones stop fading together, then put them back.'],
    guideHeading: 'building-a-complete-show',
    output: portableOutput(), zones, layouts: [splitLayout('layout-sky-ground', 'Sky and ground', zones, 'y')], scenes, composition,
  })
}

// 201 casts the sparsest moving Pattern in the 2D catalogue over the calmest
// full field. Measured at the 44x44 reference, GlyphRain leaves 82% of the
// Stage dark while still visibly moving, and Caustics fills every pixel with
// continuous motion, so the overlay's whole contribution is carried by its
// Opacity curve: when the curve is at zero the water is provably untouched,
// and everything that appears between 2s and 12s belongs to the second Layer.
// The peak stops at 0.65 because Opacity is a mix, not an addition - at 0.85
// the mostly-black rain replaced the water almost completely (measured mean
// luminance fell from 0.24 to 0.06), which read as the bed failing rather
// than a second voice joining.
function learn201(): StockShow {
  const id = 'stock-show-201-layers-property-animation'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('layers', 'Layers', 14, [clip('zone-1', 'Caustics', LESSON_TIME_SCALE)]),
  ]
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [
      instance('water', 'Caustics', LESSON_TIME_SCALE),
      instance('glyphs', 'GlyphRain', LESSON_TIME_SCALE),
    ],
    scenes: [{
      sceneId: 'layers',
      propertyTracks: [{
        // Arrival, hold, departure. The Clip occupies 2s-12s; the curve, not
        // the Clip boundary, is what the eye sees. Both Pattern clocks keep
        // running the whole time, so fading back in never rewinds the rain.
        id: 'track-glyph-opacity',
        target: { kind: 'placement-opacity', placementId: 'clip-glyphs' },
        keyframes: [
          keyframe('glyphs-arrive', 2, 0),
          keyframe('glyphs-hold', 4, 0.65),
          keyframe('glyphs-depart', 9, 0.65),
          keyframe('glyphs-gone', 12, 0),
        ],
      }],
      zones: [{
        zoneId: 'zone-1',
        // The bed never changes. One continuous Clip owns Main for the whole
        // Show so every visible change is attributable to the overlay Layer.
        main: [placement('clip-water', 'water', 0, 14)],
        overlays: [{
          id: 'layer-glyphs',
          name: 'Glyph overlay',
          placements: [{ ...placement('clip-glyphs', 'glyphs', 2, 10), opacity: 0 }],
        }],
      }],
    }],
    durationMs: 14_000,
  }
  return catalogue({
    id, title: 'Layers and Property Animation', track: 'portable', collection: 'learn', level: 200, order: 1,
    purpose: 'Layers let two Clips contribute to the same pixels at the same time. The glyphs arrive, hold, and leave without any extra Clips, because a Property curve animates their Opacity inside the one Clip that owns them.',
    notice: 'The water Clip never changes - Opacity is a mix, so as the glyphs rise the water recedes, and when the curve returns to zero the water is exactly where its own clock says. The entrance and exit are the curve, not Clip edges.',
    prompts: ['Drag the peak Opacity keyframe from 65% down to 30% and watch the glyphs become a tint instead of a voice.', 'Move the departure keyframe from 9 s to 11 s so the glyphs hold longer before they leave.'],
    guideHeading: 'layers-and-property-animation',
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 202 needs the learner to predict two different rectangles: where the Pattern
// is sampled (Content) and where the Clip is allowed to draw (the Viewport
// aperture). CompassRose is the one Pattern whose cardinal points make a pan
// direction unmistakable, and a dimmed MetaballGarden bed makes every pixel
// the aperture does not cover read as "lower Layer showing through" rather
// than as a rendering hole.
function learn202(): StockShow {
  const id = 'stock-show-202-content-clip-viewport'
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('viewport', 'Viewport', 16, [clip('zone-1', 'MetaballGarden', LESSON_TIME_SCALE)]),
  ]
  const aperture = { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
      instance('rose', 'CompassRose', LESSON_TIME_SCALE),
    ],
    scenes: [{
      sceneId: 'viewport',
      propertyTracks: [
        {
          // Content pans behind a stationary frame: the aperture holds still
          // while the sampled field slides west to east underneath it.
          id: 'track-content-pan',
          target: { kind: 'placement-transform', placementId: 'clip-content-pan', property: 'positionX' },
          keyframes: [
            keyframe('pan-west', 5, -0.22),
            keyframe('pan-east', 10, 0.22),
          ],
        },
        {
          // Then the frame moves while Content holds still: the same rose
          // stays put and the aperture slides across it.
          id: 'track-aperture-slide',
          target: { kind: 'placement-viewport', placementId: 'clip-aperture', property: 'x' },
          keyframes: [
            keyframe('aperture-west', 10, 0.05),
            keyframe('aperture-east', 16, 0.45),
          ],
        },
      ],
      zones: [{
        zoneId: 'zone-1',
        // The bed is deliberately dim so uncovered pixels are obviously the
        // lower Layer rather than black.
        main: [{
          ...placement('clip-garden', 'garden', 0, 16),
          view: { mirror: false, phase: 0, brightness: 0.3 },
        }],
        overlays: [{
          id: 'layer-subject',
          name: 'Subject',
          placements: [
            // Establish: the full rose, no aperture, so the subject is known
            // before anything clips it.
            { ...placement('clip-establish', 'rose', 0, 5), opacity: 1 },
            {
              ...placement('clip-content-pan', 'rose', 5, 5),
              opacity: 1,
              viewport: { ...aperture },
              transform: { ...NEUTRAL_SHOW_CLIP_TRANSFORM, positionX: -0.22 },
            },
            {
              ...placement('clip-aperture', 'rose', 10, 6),
              opacity: 1,
              viewport: { ...aperture, x: 0.05 },
            },
          ],
        }],
      }],
    }],
    durationMs: 16_000,
  }
  return catalogue({
    id, title: 'Content and Clip Viewport', track: 'portable', collection: 'learn', level: 200, order: 2,
    purpose: 'Content and the Clip Viewport are two different rectangles. Content decides where the Pattern is sampled; the Viewport is an aperture that decides where the Clip may draw. Wherever the aperture does not cover, the Layer below shows through.',
    notice: 'The middle Clip pans Content behind a frame that never moves. The last Clip does the opposite: the rose holds still and the aperture slides across it.',
    prompts: ['On the middle Clip, drag Content up or down and watch the frame stay put while different parts of the rose pass behind it.', 'On the last Clip, widen the aperture until the whole rose fits inside it again.'],
    guideHeading: 'content-and-clip-viewport',
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
    patternInstances: [
      instance('palette-shared', 'IQPalettes', LESSON_TIME_SCALE),
      instance('palette-fresh', 'IQPalettes', LESSON_TIME_SCALE),
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
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 204 compares five presentations of one drifting palette field. The cast is
// measured, not chosen by eye: IQPalettes carries the strongest full-channel
// motion among the Patterns that are safe to Stutter (0.157 mean RGB change
// over two seconds at the lesson clock), and 203 already establishes it as
// the level's diagnostic source. Caustics moves harder but is excluded: the
// stepped clock's documented contract renders before the first beforeRender
// delivery, and Caustics computes its render state there, so its whole first
// Stutter window comes out non-finite. The Stutter passage owns a second
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
    prompts: ['Compare Freeze with Blink: one holds a picture, the other hides a moving one, and the colors land somewhere different when each ends.', 'Change the Stutter step and watch the whole Clip snap on a different beat.'],
    guideHeading: 'presentation-modes',
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
          id: 'track-pulse-lead',
          target: { kind: 'placement-opacity', placementId: 'pulse-lead' },
          keyframes: [keyframe('lead-in', 0, 0), keyframe('lead-peak', 1.5, 0.9), keyframe('lead-out', 4, 0)],
        },
        {
          id: 'track-pulse-echo',
          target: { kind: 'placement-opacity', placementId: 'pulse-echo' },
          keyframes: [keyframe('echo-in', 1, 0), keyframe('echo-peak', 2.5, 0.55), keyframe('echo-out', 4, 0)],
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
    purpose: 'A Group definition is choreography you can reuse. Each occurrence places the whole phrase - here a pulse and its echo across two Layers - and every occurrence gets its own fresh Pattern instances, so linked copies repeat the moves without sharing private state.',
    notice: 'Both pulses are one definition. Edit the phrase once and both occurrences change; the second is translated, and its mandala runs on its own instance rather than continuing the first one.',
    prompts: ['Open the Group definition and move the echo one second later - both occurrences pick up the change.', 'Make the second occurrence unique, then change only its echo and compare the two.'],
    guideHeading: 'groups-and-linked-reuse',
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

// 206 restates topology on the same ruler: full surface, an axis-aligned
// split, and rings. The 105 pairing returns because it is already proven to
// separate cleanly at a boundary; what is new here is only the Layout, which
// is the point. The loom instance runs through every interval without
// restarting, so the learner can see that changing the Layout re-routes
// pixels without touching Pattern state. The two boundaries deliberately
// differ: the first sweeps the new Layout across the Stage, the second
// restates it in one atomic step.
function learn206(): StockShow {
  const id = 'stock-show-206-changing-zone-layouts'
  const zones = logicalZones(['Weave', 'Water'], PORTABLE_REFERENCE_PIXELS)
  const scenes: SceneSpec[] = [
    scene('full', 'Full surface', 5, [clip('zone-1', 'RibbonLoom', LESSON_TIME_SCALE)]),
    scene('split', 'Split', 6, [
      clip('zone-1', 'RibbonLoom', LESSON_TIME_SCALE),
      clip('zone-2', 'Caustics', LESSON_TIME_SCALE),
    ], { splitPosition: 0.5 }),
    scene('rings', 'Rings', 6, [
      clip('zone-1', 'RibbonLoom', LESSON_TIME_SCALE),
      clip('zone-2', 'Caustics', LESSON_TIME_SCALE),
    ]),
  ]
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [
      instance('loom', 'RibbonLoom', LESSON_TIME_SCALE),
      instance('water', 'Caustics', LESSON_TIME_SCALE),
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
    // The first restatement travels: the split sweeps in across the Stage,
    // which is Layout motion owned by the routing boundary itself.
    {
      id: 'routing-full-split', afterSceneId: 'full', kind: 'routing', durationMs: 1_500,
      easing: SINE_IN_OUT, layoutId: 'layout-split', routingDirection: 'forward',
    },
    // The second restatement is atomic: zero duration, one step, so the two
    // boundary styles can be compared inside one Show.
    { id: 'routing-split-rings', afterSceneId: 'split', kind: 'routing', durationMs: 0, easing: LINEAR, layoutId: 'layout-rings' },
  ]
  return catalogue({
    id, title: 'Changing Zone Layouts', track: 'portable', collection: 'learn', level: 200, order: 6,
    purpose: 'A Zone Layout can be restated partway through a Show: the same ruler carries full surface, a split, and rings as sequential intervals. Zones keep their names and Patterns; only the geometry that routes pixels to them changes.',
    notice: 'The weave never restarts at a Layout boundary. The first boundary sweeps the split across the Stage; the second switches to Rings in one atomic step. Neither is a visual Transition - pixels are re-routed, not blended.',
    prompts: ['Drag the split position in the middle interval - the Layout owns that geometry, and the Patterns on either side never notice.', 'Insert time before the Rings boundary: the Layout change moves atomically with the intervals around it.'],
    guideHeading: 'changing-zone-layouts',
    output: portableOutput(), zones,
    layouts: [
      { id: 'layout-full', name: 'Full Surface', zones: [], logical: { kind: 'single', zoneIds: [zones[0].id] } },
      { id: 'layout-split', name: 'Moving Split', zones: [], logical: { kind: 'split', zoneIds: [zones[0].id, zones[1].id], axis: 'x' } },
      { id: 'layout-rings', name: 'Rings', zones: [], logical: { kind: 'rings', zoneIds: [zones[0].id, zones[1].id], rings: 2 } },
    ],
    scenes, transitions, composition,
  })
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
  }

  return catalogue({
    id,
    title: 'Redline Installation',
    track: 'installation',
    collection: 'showcases',
    level: null,
    order: 10,
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
}

function wipeAndMixTransitionReference(): StockShow {
  const linearDirections = [
    ['east', 'East'], ['south-east', 'South-east'], ['south', 'South'], ['south-west', 'South-west'],
    ['west', 'West'], ['north-west', 'North-west'], ['north', 'North'], ['north-east', 'North-east'],
  ] as const
  const specs: TransitionReferenceSpec[] = [
    { id: 'cut', label: 'Cut', familyId: 'blend', variantId: 'cut', changes: { durationMs: 0 } },
    { id: 'crossfade', label: 'Crossfade', familyId: 'blend', variantId: 'crossfade', presetId: 'smooth' },
    { id: 'fade-black', label: 'Fade through black', familyId: 'fade', variantId: 'through-color', presetId: 'black' },
    { id: 'fade-white', label: 'Fade through white', familyId: 'fade', variantId: 'through-color', presetId: 'white' },
    ...linearDirections.map(([id, label]) => ({
      id: `wipe-${id}`, label: `Linear wipe ${label.toLowerCase()}`, familyId: 'wipe' as const,
      variantId: 'linear', presetId: id,
    })),
    { id: 'split-out', label: 'Split center out', familyId: 'wipe', variantId: 'split', changes: { wipeMode: 'center-out' } },
    { id: 'split-in', label: 'Split center in', familyId: 'wipe', variantId: 'split', changes: { wipeMode: 'center-in' } },
    { id: 'barn-out', label: 'Barn doors out', familyId: 'wipe', variantId: 'barn-doors', changes: { wipeMode: 'center-out' } },
    { id: 'barn-in', label: 'Barn doors in', familyId: 'wipe', variantId: 'barn-doors', changes: { wipeMode: 'center-in' } },
    { id: 'blinds-vertical', label: 'Vertical blinds', familyId: 'wipe', variantId: 'blinds', changes: { orientation: 'vertical' } },
    { id: 'blinds-horizontal', label: 'Horizontal blinds', familyId: 'wipe', variantId: 'blinds', changes: { orientation: 'horizontal' } },
    { id: 'clock-cw', label: 'Clock clockwise', familyId: 'wipe', variantId: 'clock', changes: { clockwise: true } },
    { id: 'clock-ccw', label: 'Clock counterclockwise', familyId: 'wipe', variantId: 'clock', changes: { clockwise: false } },
    { id: 'checker', label: 'Checker', familyId: 'wipe', variantId: 'checker' },
    { id: 'grid', label: 'Grid', familyId: 'wipe', variantId: 'grid' },
    { id: 'dissolve-pixel', label: 'Pixel dissolve', familyId: 'dissolve', variantId: 'pixel' },
    { id: 'dissolve-block', label: 'Block dissolve', familyId: 'dissolve', variantId: 'block' },
    { id: 'dissolve-noise', label: 'Coherent-noise dissolve', familyId: 'dissolve', variantId: 'coherent-noise' },
    { id: 'dissolve-soft', label: 'Soft-threshold dissolve', familyId: 'dissolve', variantId: 'soft-threshold' },
  ]
  return transitionReferenceShow({
    id: 'stock-show-reference-wipe-mix-transitions', title: 'Wipe and Mix Transitions', order: 4,
    purpose: 'One pair of Patterns compares blends, fades, directional Wipes, patterned Wipes, and Dissolves without changing the subject.',
    notice: 'Direction and discrete modes are shown semantically; continuous parameter permutations remain editable in the inspector.',
    prompts: ['Try the same catalogue with a radial Pattern.', 'Compare hard, dithered, and blended edges on one Wipe.'],
    guideHeading: 'wipe-and-mix-transition-reference', specs,
  })
}

function shapeRevealTransitionReference(): StockShow {
  const shapes = [
    ['ellipse', 'Ellipse'], ['box', 'Box'], ['rounded-box', 'Rounded box'], ['diamond', 'Diamond'],
    ['cross', 'Cross'], ['ring', 'Ring'], ['heart', 'Heart'], ['star', 'Star'], ['crescent', 'Crescent'],
    ['polygon', 'Regular polygon'], ['cat-head', 'Cat head'], ['cat-side-profile', 'Side-profile cat'], ['bastet', 'Bastet'],
  ] as const
  const specs: TransitionReferenceSpec[] = [
    { id: 'circle-grow', label: 'Circle: grow incoming', familyId: 'shape-reveal', variantId: 'circle', changes: { revealMode: 'grow-incoming' } },
    { id: 'circle-shrink', label: 'Circle: shrink outgoing', familyId: 'shape-reveal', variantId: 'circle', changes: { revealMode: 'shrink-outgoing' } },
    ...shapes.map(([id, label], index) => ({
      id: `shape-${id}`,
      label: `${label}: ${index % 2 === 0 ? 'grow incoming' : 'shrink outgoing'}`,
      familyId: 'shape-reveal' as const,
      variantId: id,
      changes: { revealMode: index % 2 === 0 ? 'grow-incoming' as const : 'shrink-outgoing' as const },
    })),
  ]
  return transitionReferenceShow({
    id: 'stock-show-reference-shape-reveal-transitions', title: 'Shape Reveal Transitions', order: 5,
    purpose: 'The shape-reveal family compares every supported silhouette while holding the Pattern pair, center, scale, edge, and timing steady.',
    notice: 'Circle appears in both reveal modes; the remaining silhouettes alternate modes so shape and direction stay legible without a full cross-product.',
    prompts: ['Change every shape to shrink outgoing.', 'Move the center away from 0.5, 0.5 and compare asymmetric shapes.'],
    guideHeading: 'shape-reveal-transition-reference', specs,
  })
}

function motionTransitionReference(): StockShow {
  const specs: TransitionReferenceSpec[] = [
    ...(['cover', 'reveal', 'push'] as const).flatMap((variantId) => CARDINAL_DIRECTIONS.map((direction) => ({
      id: `${variantId}-${direction.id}`,
      label: `${variantId[0].toUpperCase()}${variantId.slice(1)} ${direction.label}`,
      familyId: 'motion' as const,
      variantId,
      changes: { direction: direction.turns },
    }))),
    { id: 'content-grow', label: 'Content grow', familyId: 'motion', variantId: 'content-grow' },
    { id: 'content-shrink', label: 'Content shrink', familyId: 'motion', variantId: 'content-shrink' },
    { id: 'zoom-in', label: 'Zoom in', familyId: 'motion', variantId: 'zoom-in', presetId: 'zoom' },
    { id: 'spin-cw', label: 'Spin in clockwise', familyId: 'motion', variantId: 'zoom-in', presetId: 'spin-clockwise' },
    { id: 'spin-ccw', label: 'Spin in counterclockwise', familyId: 'motion', variantId: 'zoom-in', presetId: 'spin-counterclockwise' },
    { id: 'zoom-spin-cw', label: 'Zoom and spin clockwise', familyId: 'motion', variantId: 'zoom-in', presetId: 'zoom-spin-clockwise' },
    { id: 'zoom-spin-ccw', label: 'Zoom and spin counterclockwise', familyId: 'motion', variantId: 'zoom-in', presetId: 'zoom-spin-counterclockwise' },
    { id: 'zoom-out', label: 'Zoom out', familyId: 'motion', variantId: 'zoom-out', presetId: 'zoom' },
  ]
  return transitionReferenceShow({
    id: 'stock-show-reference-motion-transitions', title: 'Motion Transitions', order: 6,
    purpose: 'Cover, Reveal, Push, content scaling, and zoom/spin transitions share one fixed pair so motion semantics remain easy to compare.',
    notice: 'Directional motion uses four cardinal examples; diagonal values remain available as continuous direction edits.',
    prompts: ['Change cardinal motion to diagonal directions.', 'Switch Addressing from Clip to Wrap and compare moving edges.'],
    guideHeading: 'motion-transition-reference', specs,
  })
}

function propertyAnimationReference(): StockShow {
  const id = 'stock-show-reference-property-animation'
  const zones = logicalZones(['A', 'B'], 2_000)
  const properties = [
    ['animation-speed', 'Animation speed'],
    ['pattern-control', 'Public Pattern control'],
    ['brightness', 'Brightness'],
    ['phase', 'Phase'],
    ['overlay-opacity', 'Overlay opacity'],
    ['effect-parameter', 'Effect parameter'],
    ['split-position', 'Split position'],
    ['repeat-scale', 'Repeat scale'],
  ] as const
  const scenes = properties.map(([sceneId, label]) => scene(
    sceneId,
    label,
    5,
    [clip('zone-1', 'CompassRose', 0.32), clip('zone-2', 'TestPattern2D', 0.32)],
    { splitPosition: sceneId === 'effect-parameter' ? 0.25 : sceneId === 'split-position' ? 0.75 : 0.5 },
    { repeatScale: sceneId === 'repeat-scale' ? 4 : 1 },
  ))
  const transitions = cutBoundaries(scenes).map((item) => {
    if (item.afterSceneId === 'effect-parameter') {
      return boundary('effect-parameter', 'crossfade', 1_800, SINE_IN_OUT, {
        propertyTransitions: {
          routing: { splitPosition: { from: 0.25, durationMs: 1_800, easing: SINE_IN_OUT } },
        },
      })
    }
    if (item.afterSceneId === 'split-position') {
      return boundary('split-position', 'crossfade', 1_800, SINE_IN_OUT, {
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
    const instanceId = `instance-${sceneId}-a`
    const placementId = `placement-${sceneId}-a`
    if (sceneId === 'animation-speed') return [track('track-animation-speed', { kind: 'instance-time-scale', instanceId }, [0.12, 0.9, 0.12])]
    if (sceneId === 'pattern-control') return [track('track-pattern-control', { kind: 'instance-control', instanceId, exportName: 'sliderSpeed' }, [0.08, 0.92, 0.08])]
    if (sceneId === 'brightness') return [track('track-brightness', { kind: 'placement-view', placementId, property: 'brightness' }, [0.1, 1, 0.1])]
    if (sceneId === 'phase') return [track('track-phase', { kind: 'placement-view', placementId, property: 'phase' }, [0, 1, 0])]
    if (sceneId === 'overlay-opacity') return [track('track-overlay-opacity', { kind: 'placement-opacity', placementId: 'placement-overlay-opacity-overlay' }, [0, 0.85, 0])]
    if (sceneId === 'effect-parameter') return [track('track-effect-parameter', {
      kind: 'placement-effect', placementId, effectId: 'translate-demo', effectKind: 'translate', parameterId: 'translateX',
    }, [-0.35, 0.35, -0.35])]
    return []
  }
  const patternInstances: ShowCompositionV1['patternInstances'] = properties.flatMap(([sceneId]) => [
    instance(`instance-${sceneId}-a`, 'CompassRose', 0.32, sceneId === 'pattern-control' ? { sliderSpeed: 0.08 } : undefined),
    instance(`instance-${sceneId}-b`, 'TestPattern2D', 0.32),
  ])
  patternInstances.push(instance('instance-overlay-opacity-overlay', 'SignalMandala', 0.28))
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances,
    scenes: properties.map(([sceneId]) => {
      const mainA = {
        ...placement(`placement-${sceneId}-a`, `instance-${sceneId}-a`, 0, 5),
        ...(sceneId === 'effect-parameter'
          ? { effects: [{ id: 'translate-demo', kind: 'translate' as const, x: -0.35, y: 0 }] }
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
            main: [placement(`placement-${sceneId}-b`, `instance-${sceneId}-b`, 0, 5)],
            overlays: [],
          },
        ],
      }
    }),
  }
  return catalogue({
    id, title: 'Property Animation', track: 'portable', collection: 'showcases', level: null, order: 7,
    purpose: 'Eight examples show where values can change over time: Pattern state, placement view, layering, Effect parameters, routing, and sample remapping.',
    notice: 'The first six examples use Clip-owned sparklines; Split position and Repeat scale use boundary-owned Property transitions.',
    prompts: ['Open each Clip and compare the highlighted sparkline owner.', 'Change one midpoint value while leaving its endpoints fixed.'],
    guideHeading: 'property-animation-reference', output: portableOutput(), zones,
    defaultOpen: true,
    layouts: [splitLayout('layout-property-split', 'Property split', zones, 'x')], scenes, transitions, composition,
    reference: {
      summary: 'The Stage and timeline highlight one animatable property at a time. Try with Pattern replaces the constant comparison Pattern while the animated subject and its Property track stay intact.',
      patternSlots: {
        cellIds: properties.map(([sceneId]) => cellId(sceneId, 'zone-2')),
        instanceIds: properties.map(([sceneId]) => `instance-${sceneId}-b`),
      },
      examples: [
        ...properties.slice(0, 6).map(([sceneId, label]) => ({
          id: sceneId, label, detail: 'Clip-owned Property sparkline.', anchor: { kind: 'scene' as const, sceneId },
        })),
        { id: 'split-position', label: 'Split position', detail: 'Boundary-owned routing Property transition.', anchor: { kind: 'boundary', transitionId: 'transition-effect-parameter' } },
        { id: 'repeat-scale', label: 'Repeat scale', detail: 'Boundary-owned sample-remap Property transition.', anchor: { kind: 'boundary', transitionId: 'transition-split-position' } },
      ],
    },
  })
}

function easingReference(): StockShow {
  const specs: TransitionReferenceSpec[] = SHOW_EASING_OPTIONS.map((option) => ({
    id: `easing-${option.id}`,
    label: option.label,
    familyId: 'wipe',
    variantId: 'linear',
    presetId: 'east',
    changes: { easing: option.easing },
  }))
  return transitionReferenceShow({
    id: 'stock-show-reference-easing', title: 'Easing', order: 8,
    purpose: 'One eastward Linear Wipe holds its Patterns, endpoints, direction, and duration constant while every easing curve changes the timing.',
    notice: 'This isolates easing from Transition geometry. The live header names the current curve and draws its progression.',
    prompts: ['Compare quadratic in with quadratic out.', 'Watch where Steps and Hold curves spend their time.'],
    guideHeading: 'easing-reference', specs,
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
    const holdSeconds = previousExample?.variantId === 'cut' ? 5 : previousExample ? 3.2 : 3
    return scene(
      `reference-${index + 1}`,
      index === 0 ? 'Reference' : input.specs[index - 1].label,
      holdSeconds,
      [clip('zone-1', selected ? 'CompassRose' : 'TestPattern2D', 0.32)],
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
      instance('instance-reference-backdrop', 'Caustics', 0.18),
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
    summary: 'Each boundary compares the fixed diagnostic reference with the selected Pattern over a quiet moving backdrop; the arrow names which side is incoming.',
    patternSlots: {
      cellIds: scenes.filter((_, index) => index % 2 === 1).map((item) => cellId(item.id, 'zone-1')),
      instanceIds: [contentInstanceId(1)],
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
      durationMs: spec.variantId === 'cut' ? 0 : 1_800,
      easing: SINE_IN_OUT,
      ...spec.changes,
    })
  })
  return { ...stock, show }
}

type ShowcaseKind = 'transform' | 'distortion' | 'color-output'

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
      id: 'stock-show-showcase-transform-effects', title: 'Transform Effects', order: 1, duration: 5,
      purpose: 'The same diagnostic Pattern moves continuously between affine Effect states, making each coordinate transformation visible.',
      notice: 'Translate, Scale, Rotate, and Shear interpolate as one stable Effect stack. Wrap is discrete because it changes address policy rather than a numeric coordinate.',
      prompts: ['Change Rotate from 0.125 to 0.25 turns.', 'Move Wrap before Translate and compare the result.'] as const,
      heading: 'transform-effects',
      rows: [
        ['Reference', affineEffects()],
        ['Translate', affineEffects({ translate: { x: 0.18, y: -0.12 } })],
        ['Scale', affineEffects({ scale: { x: 0.68, y: 0.82 } })],
        ['Rotate', affineEffects({ rotate: 0.125 })],
        ['Shear', affineEffects({ shear: { x: 0.28, y: 0 } })],
        ['Wrap', [{ id: 'translate', kind: 'translate', x: 0.28, y: 0 }, { id: 'wrap', kind: 'wrap' }]],
      ] as Array<[string, ShowClipEffect[]]>,
    },
    distortion: {
      id: 'stock-show-showcase-distortion-effects', title: 'Distortion Effects', order: 2, duration: 5,
      purpose: 'Distortions remap where a Clip samples its Pattern. A known grid reveals the shape, center, and strength of each remap.',
      notice: 'The orbiting white marker makes temporal continuity visible even while space is distorted.',
      prompts: ['Move the Swirl center to 0.25, 0.50.', 'Reduce Kaleidoscope segments from 6 to 3.'] as const,
      heading: 'distortion-effects',
      rows: [
        ['Reference', []], ['Ripple', [{ id: 'ripple', kind: 'ripple', amount: 0.32, frequency: 4, phase: 0, centerX: 0.5, centerY: 0.5 }]],
        ['Swirl', [{ id: 'swirl', kind: 'swirl', amount: 0.36, radius: 0.72, centerX: 0.5, centerY: 0.5 }]],
        ['Bulge', [{ id: 'bulge', kind: 'bulge', amount: 0.42, radius: 0.58, centerX: 0.5, centerY: 0.5 }]],
        ['Pixelate', [{ id: 'pixelate', kind: 'pixelate', amount: 0.85, columns: 12, rows: 12 }]],
        ['Kaleidoscope', [{ id: 'kaleidoscope', kind: 'kaleidoscope', amount: 1, segments: 6, rotation: 0, centerX: 0.5, centerY: 0.5 }]],
      ] as Array<[string, ShowClipEffect[]]>,
    },
    'color-output': {
      id: 'stock-show-showcase-color-output-effects', title: 'Color and Output Effects', order: 3, duration: 4,
      purpose: 'Color and output Effects change a rendered Clip without changing its geometry. Known RGB corners make each operation easier to identify.',
      notice: 'Opacity and brightness look related on black, but opacity also matters when the Clip is layered over another image.',
      prompts: ['Compare Opacity and Brightness over a temporary overlay.', 'Change Posterize from 4 levels to 2.'] as const,
      heading: 'color-and-output-effects',
      rows: [
        ['Reference', []], ['Opacity', [{ id: 'opacity', kind: 'opacity', opacity: 0.45 }]],
        ['Brightness', [{ id: 'brightness', kind: 'brightness', brightness: 0.45 }]], ['Hue', [{ id: 'hue', kind: 'hue', turns: 0.25 }]],
        ['Saturation', [{ id: 'saturation', kind: 'saturation', saturation: 0.25 }]], ['Contrast', [{ id: 'contrast', kind: 'contrast', contrast: 0.72 }]],
        ['Invert', [{ id: 'invert', kind: 'invert', amount: 1 }]], ['Threshold', [{ id: 'threshold', kind: 'threshold', threshold: 0.52, amount: 1 }]],
        ['Posterize', [{ id: 'posterize', kind: 'posterize', levels: 4, amount: 1 }]],
        ['Color map', [{ id: 'color-map', kind: 'color-map', amount: 1, shadowR: 0.0745, shadowG: 0.0471, shadowB: 0.1686, highlightR: 0.3098, highlightG: 1, highlightB: 0.8824 }]],
      ] as Array<[string, ShowClipEffect[]]>,
    },
  } satisfies Record<ShowcaseKind, {
    id: string; title: string; order: number; duration: number; purpose: string; notice: string;
    prompts: readonly [string, string]; heading: string; rows: Array<[string, ShowClipEffect[]]>
  }>
  const config = configs[kind]
  const zones = logicalZones(['Main'], 2_000)
  const scenes = config.rows.map(([name, effects], index) => scene(
    `effect-${index + 1}`,
    name,
    kind === 'transform' && index < 4 ? config.duration - 1 : config.duration,
    [clip('zone-1', 'TestPattern2D', 0.35, undefined, 0.90, effects.length ? effects : undefined)],
  ))
  const transitions = kind === 'transform'
    ? scenes.slice(0, -1).map((item, index) => (
        index < 4
          ? effectTweenBoundary(item, scenes[index + 1], config.rows[index][1], config.rows[index + 1][1])
          : boundary(item.id, 'cut', 0, LINEAR)
      ))
    : cutBoundaries(scenes)
  return catalogue({
    id: config.id, title: config.title, track: 'portable', collection: 'showcases', level: null, order: config.order,
    purpose: config.purpose, notice: config.notice, prompts: config.prompts, guideHeading: config.heading,
    defaultOpen: true, output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes,
    transitions,
    reference: {
      summary: 'One Pattern stays constant while each Effect in this family changes the rendered result.',
      patternSlots: { cellIds: scenes.map((item) => cellId(item.id, 'zone-1')), instanceIds: [] },
      examples: scenes.map((item, index) => ({
        id: `${kind}-${index + 1}`,
        label: item.name,
        detail: index === 0 ? 'Unmodified Pattern reference.' : `${item.name} applied in isolation.`,
        anchor: { kind: 'scene', sceneId: item.id },
      })),
    },
  })
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
  const number = input.level ? String(input.level + input.order) : undefined
  const note: StockShowNote = {
    label: input.level ? `Learn ${input.level}` : 'Showcases',
    ...(number ? { number } : {}), title: input.title, purpose: input.purpose, notice: input.notice,
    prompts: input.prompts,
    guide: { documentId: 'show-visual-toolkit', heading: input.guideHeading, label: `Read ${input.title.toLowerCase()}` },
    defaultOpen: input.defaultOpen ?? input.collection === 'learn',
  }
  return {
    id: input.id, name, track: input.track, collection: input.collection, level: input.level, order: input.order,
    lesson: input.title, description: input.purpose, note, ...(input.reference ? { reference: input.reference } : {}), show,
  }
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

function effectTweenBoundary(
  source: SceneSpec,
  destination: SceneSpec,
  fromEffects: ShowClipEffect[],
  toEffects: ShowClipEffect[],
): ShowBoundaryTransition {
  const destinationCellId = cellId(destination.id, destination.clips[0].zoneId)
  const effects = Object.fromEntries(toEffects.flatMap((toEffect, index) => {
    const fromEffect = fromEffects[index]
    if (!fromEffect || fromEffect.id !== toEffect.id || fromEffect.kind !== toEffect.kind) return []
    const parameters = Object.fromEntries(showEffectParameterNames(toEffect).flatMap((parameter) => {
      const from = showEffectNumericValue(fromEffect, parameter)
      const to = showEffectNumericValue(toEffect, parameter)
      return from === to ? [] : [[parameter, {
        fromByCellId: { [destinationCellId]: from },
        durationMs: 1_000,
        easing: SINE_IN_OUT,
      }]]
    }))
    return Object.keys(parameters).length > 0 ? [[toEffect.id, parameters]] : []
  }))
  return boundary(source.id, 'crossfade', 1_000, SINE_IN_OUT, {
    propertyTransitions: { effects },
  })
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

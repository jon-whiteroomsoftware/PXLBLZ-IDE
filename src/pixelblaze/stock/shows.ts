import type {
  ShowBoundaryTransition,
  ShowCell,
  ShowClipEffect,
  ShowCompositionV1,
  ShowPropertyAnimationTrack,
  ShowRecord,
  ShowRoutingLayout,
  ShowScene,
  ShowTransitionEasing,
  ShowZone,
} from '@/engine/personalContentRecords'
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

type SceneSpec = Pick<ShowScene, 'id' | 'name' | 'durationMs' | 'routingTargets'> & {
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
}

const UPDATED_AT = 363
const SINE_IN_OUT: ShowTransitionEasing = { curve: 'sine', direction: 'in-out' }
const CUBIC_IN_OUT: ShowTransitionEasing = { curve: 'cubic', direction: 'in-out' }
const LINEAR: ShowTransitionEasing = { curve: 'linear' }
const COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#22c55e']

export const STOCK_SHOWS: StockShow[] = [
  learn101(), learn102(), learn103(), learn104(), learn105(),
  learn201(), learn202(), learn203(), learn204(), learn205(),
  effectShowcase('transform'), effectShowcase('distortion'), effectShowcase('color-output'),
]

export function stockShowById(id: string | null | undefined): StockShow | undefined {
  return id ? STOCK_SHOWS.find((item) => item.id === id) : undefined
}

function learn101(): StockShow {
  const id = 'stock-show-101-clips-crossfade'
  const zones = logicalZones(['Main'], 2_000)
  const scenes: SceneSpec[] = [
    scene('water', 'Water', 8, [clip('zone-1', 'Caustics', 0.35, { sliderSpeed: 0.30, sliderDensity: 0.36, sliderSharpness: 0.30, sliderTint: 0.52 })]),
    scene('mechanism', 'Mechanism', 8, [clip('zone-1', 'ClockworkIris', 0.35, { sliderSpeed: 0.28, sliderAperture: 0.58, sliderTeeth: 0.45, sliderColor: 0.10 })]),
  ]
  return catalogue({
    id, title: 'Clips and Crossfade', track: 'portable', collection: 'learn', level: 100, order: 1,
    purpose: 'Two Patterns become one timed composition. Each Clip owns what plays; the boundary between them owns how the picture changes.',
    notice: 'The Crossfade is a separate timeline entity, not a property hidden inside either Clip.',
    prompts: ['Shorten the Crossfade from 3.0 s to 1.0 s.', 'Replace Clockwork Iris with a Pattern that moves differently.'],
    guideHeading: 'clips-scenes-and-boundaries',
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes,
    transitions: [boundary('water', 'crossfade', 3_000, SINE_IN_OUT)],
  })
}

function learn102(): StockShow {
  const id = 'stock-show-102-transitions-values'
  const zones = logicalZones(['Main'], 2_000)
  const scenes: SceneSpec[] = [
    scene('sweep', 'Sweep', 7, [clip('zone-1', 'EasedSweep', 0.40, undefined, 0.70)]),
    scene('compass', 'Compass', 7, [clip('zone-1', 'CompassRose', 0.32, { sliderSpeed: 0.30, sliderPoints: 0.42, sliderSweep: 0.62, sliderHue: 0.58 }, 1)]),
    scene('bloom', 'Bloom', 7, [clip('zone-1', 'TopographicBloom', 0.30, { sliderSpeed: 0.28, sliderLayers: 0.82, sliderSpacing: 0.48, sliderColor: 0.30 }, 0.82)]),
  ]
  const compassId = cellId('compass', 'zone-1')
  const bloomId = cellId('bloom', 'zone-1')
  return catalogue({
    id, title: 'Transitions and Values', track: 'portable', collection: 'learn', level: 100, order: 2,
    purpose: 'Boundaries can change the picture and interpolate Clip values at the same time. This Show uses two Transition families and two compact value ramps.',
    notice: 'Brightness and speed belong to the destination Clip; the boundary only describes how the old value reaches the new one.',
    prompts: ['Reverse the Wipe direction.', 'Change Bloom brightness to 0.45 and compare the ramp.'],
    guideHeading: 'transitions-and-clip-values',
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes,
    transitions: [
      boundary('sweep', 'wipe', 1_200, CUBIC_IN_OUT, {
        direction: 0, feather: 0.08, edgePolicy: 'dither',
        propertyTransitions: { brightness: { fromByCellId: { [compassId]: 0.70 }, durationMs: 1_200, easing: CUBIC_IN_OUT } },
      }),
      boundary('compass', 'fade-color', 1_400, SINE_IN_OUT, {
        color: '#10131a',
        propertyTransitions: { timeScale: { fromByCellId: { [bloomId]: 0.32 }, durationMs: 1_400, easing: SINE_IN_OUT } },
      }),
    ],
  })
}

function learn103(): StockShow {
  const id = 'stock-show-103-effects'
  const zones = logicalZones(['Main'], 2_000)
  const specs: Array<[string, string, ShowClipEffect[]?]> = [
    ['reference', 'Reference', undefined],
    ['frame', 'Frame', [
      { id: 'translate', kind: 'translate', x: 0.12, y: -0.08 },
      { id: 'scale', kind: 'scale', x: 0.78, y: 0.78 },
    ]],
    ['ripple', 'Ripple', [{ id: 'ripple', kind: 'ripple', amount: 0.32, frequency: 4, phase: 0, centerX: 0.5, centerY: 0.5 }]],
    ['color', 'Color', [
      { id: 'hue', kind: 'hue', turns: 0.18 },
      { id: 'contrast', kind: 'contrast', contrast: 0.72 },
    ]],
  ]
  const scenes = specs.map(([sceneId, name, effects]) => scene(sceneId, name, 6, [clip('zone-1', 'TestPattern2D', 0.35, undefined, 0.90, effects)]))
  return catalogue({
    id, title: 'Effects', track: 'portable', collection: 'learn', level: 100, order: 3,
    purpose: 'Effects transform a Clip after its Pattern renders. Reusing one known Pattern makes operation order and spatial change easier to see.',
    notice: 'The Reference Scene and every effected Scene share the same Pattern.',
    prompts: ['Swap the order of Translate and Scale.', 'Set Ripple amount to zero, then bring it back gradually.'],
    guideHeading: 'clip-effects',
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes,
    transitions: cutBoundaries(scenes),
  })
}

function learn104(): StockShow {
  const id = 'stock-show-104-portable-zones'
  const zones = logicalZones(['Left', 'Right'], 2_000)
  const iris = { sliderSpeed: 0.30, sliderAperture: 0.62, sliderColor: 0.10 }
  const scenes: SceneSpec[] = [
    scene('separate', 'Separate', 8, [clip('zone-1', 'EasedSweep', 0.42), clip('zone-2', 'ClockworkIris', 0.30, iris)]),
    scene('exchange', 'Exchange', 8, [clip('zone-1', 'ClockworkIris', 0.30, iris), clip('zone-2', 'EasedSweep', 0.42)]),
  ]
  return catalogue({
    id, title: 'Portable Zones', track: 'portable', collection: 'learn', level: 100, order: 4,
    purpose: 'Portable Zones divide a normalized surface without depending on a specific LED count. Each Zone can run its own Pattern instance and clock.',
    notice: 'The Zone overlay stays fixed while the two Patterns exchange sides.',
    prompts: ['Turn off one Zone in the Stage preview.', 'Move the Split from 0.50 to 0.35.'],
    guideHeading: 'portable-zones',
    output: portableOutput(), zones, layouts: [splitLayout('layout-side-by-side', 'Side by side', zones, 'x')], scenes,
    transitions: [boundary('separate', 'crossfade', 1_200, SINE_IN_OUT)],
  })
}

function learn105(): StockShow {
  const id = 'stock-show-105-built-from-basics'
  const zones = logicalZones(['Sky', 'Signal', 'Ground'], 2_000)
  const scenes: SceneSpec[] = [
    scene('gather', 'Gather', 10, [
      clip('zone-1', 'Caustics', 0.25, { sliderSpeed: 0.25 }, 0.75),
      clip('zone-2', 'EasedSweep', 0.35, undefined, 0.75),
      clip('zone-3', 'ClockworkIris', 0.24, { sliderSpeed: 0.24 }, 0.75),
    ]),
    scene('drive', 'Drive', 10, [
      clip('zone-1', 'NeonCircuitBoard', 0.30, { sliderSpeed: 0.30, sliderDensity: 0.10 }, 1),
      clip('zone-2', 'CompassRose', 0.26, { sliderSpeed: 0.26, sliderSweep: 0.72 }, 1, [{ id: 'signal-hue', kind: 'hue', turns: 0.08 }]),
      clip('zone-3', 'ShapeShifter', 0.24, { sliderSpeed: 0.24, sliderShape: 0.12 }, 1),
    ]),
    scene('resolve', 'Resolve', 10, [
      clip('zone-1', 'TopographicBloom', 0.24, { sliderSpeed: 0.24 }, 0.78),
      clip('zone-2', 'EasedSweep', 0.30, undefined, 0.78),
      clip('zone-3', 'Caustics', 0.22, { sliderSpeed: 0.22 }, 0.78, [{ id: 'ground-scale', kind: 'scale', x: 0.88, y: 0.88 }]),
    ]),
  ]
  return catalogue({
    id, title: 'Built from Basics', track: 'portable', collection: 'learn', level: 100, order: 5,
    purpose: 'A complete short Show can come from Clips, two Transitions, a few Effects, and one static Zone Layout. Complexity comes from sequencing simple decisions rather than maximizing every control.',
    notice: 'Each passage has one dominant change even though three Zones are active.',
    prompts: ['Mute the Signal Zone and watch how the composition loses its beat.', 'Replace the final Crossfade with a Wipe.'],
    guideHeading: 'building-a-complete-show',
    output: { kind: 'portable', mapId: 'wide', pixelCount: 2_000 }, zones,
    layouts: [{ id: 'layout-three-bands', name: 'Three bands', zones: [], logical: { kind: 'stripes', zoneIds: zones.map((zone) => zone.id), axis: 'y' } }], scenes,
    transitions: [
      brightnessBoundary('gather', 'wipe', 1_400, CUBIC_IN_OUT, scenes[1], 0.75, { direction: 0, feather: 0.08, edgePolicy: 'dither' }),
      brightnessBoundary('drive', 'crossfade', 2_000, SINE_IN_OUT, scenes[2], 1),
    ],
  })
}

function learn201(): StockShow {
  const id = 'stock-show-201-scene-local-cuts'
  const zones = logicalZones(['Main'], 2_000)
  const scenes = [scene('three-beats', 'Three beats', 18, [clip('zone-1', 'EasedSweep', 0.42)])]
  const instances = [
    instance('sweep', 'EasedSweep', 0.42),
    instance('iris', 'ClockworkIris', 0.30, { sliderAperture: 0.58 }),
    instance('caustics', 'Caustics', 0.30, { sliderSpeed: 0.26 }),
  ]
  const composition: ShowCompositionV1 = {
    version: 1, patternInstances: instances,
    scenes: [{ sceneId: 'three-beats', zones: [{ zoneId: 'zone-1', overlays: [], main: [
      placement('main-sweep', 'sweep', 0, 6), placement('main-iris', 'iris', 6, 6), placement('main-caustics', 'caustics', 12, 6),
    ] }] }],
  }
  return catalogue({
    id, title: 'Scene-local Cuts', track: 'portable', collection: 'learn', level: 200, order: 1,
    purpose: 'A Scene can contain its own sequence of Main Clips. The global timeline stays simple while the Scene editor carries the internal beats.',
    notice: 'The three local Clips are mutually exclusive and completely cover the Scene.',
    prompts: ['Drag the second Cut one second earlier.', 'Change the final Clip to continue its clock instead of restarting.'],
    guideHeading: 'scene-local-main-clips', output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

function learn202(): StockShow {
  const id = 'stock-show-202-layers-local-animation'
  const zones = logicalZones(['Main'], 2_000)
  const scenes = [scene('signal-water', 'Signal over water', 16, [clip('zone-1', 'Caustics', 0.28, { sliderSpeed: 0.24, sliderSharpness: 0.28 })])]
  const tracks: ShowPropertyAnimationTrack[] = [{
    id: 'track-signal-opacity', target: { kind: 'placement-opacity', placementId: 'overlay-signal' },
    keyframes: [
      keyframe('opacity-0', 3, 0), keyframe('opacity-in', 5, 0.72), keyframe('opacity-hold', 11, 0.72), keyframe('opacity-out', 13, 0),
    ],
  }]
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [
      instance('water', 'Caustics', 0.28, { sliderSpeed: 0.24, sliderSharpness: 0.28 }),
      instance('signal', 'SignalMandala', 0.28),
    ],
    scenes: [{ sceneId: 'signal-water', propertyTracks: tracks, zones: [{ zoneId: 'zone-1',
      main: [placement('main-water', 'water', 0, 16)],
      overlays: [{ id: 'layer-signal', name: 'Signal', placements: [{
        ...placement('overlay-signal', 'signal', 3, 10), opacity: 0,
        effects: [{ id: 'signal-scale', kind: 'scale', x: 0.76, y: 0.76 }, { id: 'signal-hue', kind: 'hue', turns: 0.08 }],
      }] }],
    }] }],
  }
  return catalogue({
    id, title: 'Layers and Local Animation', track: 'portable', collection: 'learn', level: 200, order: 2,
    purpose: 'Overlay layers let more than one Pattern contribute to a Scene. Local keyframes animate a typed property without creating more global Scenes.',
    notice: 'The overlay exists only from 3-13 seconds, while its opacity controls how it enters and leaves that interval.',
    prompts: ['Raise the peak opacity from 0.72 to 1.0.', 'Drag the overlay into a new layer and compare the stacking order.'],
    guideHeading: 'scene-layers-and-local-animation', output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes, composition,
  })
}

function learn203(): StockShow {
  const id = 'stock-show-203-dynamic-zone-layouts'
  const zones = logicalZones(['A', 'B'], 2_000)
  const pair = () => [clip('zone-1', 'ClockworkIris', 0.30), clip('zone-2', 'Caustics', 0.30)]
  const scenes = [
    scene('narrow-a', 'Narrow A', 8, pair(), { splitPosition: 0.35 }),
    scene('wide-a', 'Wide A', 8, pair(), { splitPosition: 0.65 }),
    scene('turn', 'Turn', 8, pair(), { splitPosition: 0.65 }),
  ]
  return catalogue({
    id, title: 'Dynamic Zone Layouts', track: 'portable', collection: 'learn', level: 200, order: 3,
    purpose: 'Zone names describe ownership; Zone Layouts describe geometry. The same two Zones can move or adopt a different arrangement without replacing their Patterns.',
    notice: 'The first boundary animates one layout parameter; the second chooses another named layout.',
    prompts: ['Change the first split targets to 0.20 and 0.80.', 'Toggle the Zone overlay before the Horizontal switch.'],
    guideHeading: 'dynamic-zone-layouts', output: portableOutput(), zones,
    layouts: [splitLayout('layout-vertical', 'Vertical', zones, 'x'), splitLayout('layout-horizontal', 'Horizontal', zones, 'y')], scenes,
    transitions: [
      boundary('narrow-a', 'crossfade', 1_800, SINE_IN_OUT, { propertyTransitions: { routing: { splitPosition: { from: 0.35, durationMs: 1_800, easing: SINE_IN_OUT } } } }),
      boundary('wide-a', 'crossfade', 1_200, SINE_IN_OUT),
      { id: 'routing-wide-a', afterSceneId: 'wide-a', kind: 'routing', durationMs: 0, easing: LINEAR, layoutId: 'layout-horizontal' },
    ],
  })
}

function learn204(): StockShow {
  const id = 'stock-show-204-installation-mapping'
  const zones = physicalZones(['Left bank', 'Right bank'], [80, 80])
  const scenes = [scene('two-banks', 'Two banks', 14, [
    clip('zone-1', 'EasedSweep', 0.38),
    clip('zone-2', 'ClockworkIris', 0.28, { sliderAperture: 0.62, sliderColor: 0.10 }),
  ])]
  return catalogue({
    id, title: 'Installation Mapping', track: 'installation', collection: 'learn', level: 200, order: 4,
    purpose: 'An Installation Show promises one fixed map and LED count. Physical ranges assign measured LEDs to named Zones.',
    notice: "The two 80-pixel banks come from the custom map's actual index order, not a normalized left/right split.",
    prompts: ['Turn on the Zone overlay and compare it with the physical ranges.', 'Solo the Right bank without pausing playback.'],
    guideHeading: 'installation-output-and-physical-ranges', output: installationOutput(), zones,
    layouts: [physicalLayout('layout-banks', 'Two banks', zones, [[[0, 79]], [[80, 159]]])], scenes,
  })
}

function learn205(): StockShow {
  const id = 'stock-show-205-installation-composition'
  const zones = physicalZones(['Top pair', 'Upper middle', 'Lower middle', 'Bottom pair'], [40, 40, 40, 40])
  const scenes: SceneSpec[] = [
    scene('wake', 'Wake', 10, [
      clip('zone-1', 'EasedSweep', 0.35, undefined, 0.72), clip('zone-2', 'Caustics', 0.35, undefined, 0.72),
      clip('zone-3', 'Caustics', 0.35, undefined, 0.72), clip('zone-4', 'EasedSweep', 0.35, undefined, 0.72),
    ]),
    scene('answer', 'Answer', 10, [
      clip('zone-1', 'CompassRose', 0.30), clip('zone-2', 'ClockworkIris', 0.30, undefined, 1, [{ id: 'hue-plus', kind: 'hue', turns: 0.08 }]),
      clip('zone-3', 'ClockworkIris', 0.30, undefined, 1, [{ id: 'hue-minus', kind: 'hue', turns: -0.08 }]), clip('zone-4', 'CompassRose', 0.30),
    ]),
    scene('settle', 'Settle', 10, [
      clip('zone-1', 'TopographicBloom', 0.26, undefined, 0.78, [{ id: 'scale-top', kind: 'scale', x: 0.86, y: 0.86 }]),
      clip('zone-2', 'Caustics', 0.26, undefined, 0.78), clip('zone-3', 'Caustics', 0.26, undefined, 0.78),
      clip('zone-4', 'TopographicBloom', 0.26, undefined, 0.78, [{ id: 'scale-bottom', kind: 'scale', x: 0.86, y: 0.86 }]),
    ]),
  ]
  return catalogue({
    id, title: 'Installation Composition', track: 'installation', collection: 'learn', level: 200, order: 5,
    purpose: 'A fixed installation can group non-contiguous LEDs into meaningful physical units and choreograph them as one composition.',
    notice: 'Each row-pair Zone owns two separate index ranges while the compiler still guarantees complete, non-overlapping coverage.',
    prompts: ['Solo one row pair and inspect its two physical ranges.', 'Reverse the first Wipe direction.'],
    guideHeading: 'composing-a-fixed-installation', output: installationOutput(), zones,
    layouts: [physicalLayout('layout-row-pairs', 'Row pairs', zones, [
      [[0, 19], [80, 99]], [[20, 39], [100, 119]], [[40, 59], [120, 139]], [[60, 79], [140, 159]],
    ])], scenes,
    transitions: [
      brightnessBoundary('wake', 'wipe', 1_500, CUBIC_IN_OUT, scenes[1], 0.72, { direction: 0.75, feather: 0.08, edgePolicy: 'dither' }),
      brightnessBoundary('answer', 'crossfade', 2_000, SINE_IN_OUT, scenes[2], 1),
    ],
  })
}

type ShowcaseKind = 'transform' | 'distortion' | 'color-output'

function effectShowcase(kind: ShowcaseKind): StockShow {
  const configs = {
    transform: {
      id: 'stock-show-showcase-transform-effects', title: 'Transform Effects', order: 1, duration: 5,
      purpose: 'The same diagnostic Pattern passes through each affine Effect in isolation. Cuts make before-and-after comparison immediate.',
      notice: 'Wrap becomes useful after a transform moves samples outside the source domain.',
      prompts: ['Change Rotate from 0.125 to 0.25 turns.', 'Move Wrap before Translate and compare the result.'] as const,
      heading: 'transform-effects',
      rows: [
        ['Reference', []], ['Translate', [{ id: 'translate', kind: 'translate', x: 0.18, y: -0.12 }]],
        ['Rotate', [{ id: 'rotate', kind: 'rotate', turns: 0.125 }]], ['Scale', [{ id: 'scale', kind: 'scale', x: 0.68, y: 0.82 }]],
        ['Shear', [{ id: 'shear', kind: 'shear', x: 0.28, y: 0 }]],
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
  const scenes = config.rows.map(([name, effects], index) => scene(`effect-${index + 1}`, name, config.duration, [
    clip('zone-1', 'TestPattern2D', 0.35, undefined, 0.90, effects.length ? effects : undefined),
  ]))
  return catalogue({
    id: config.id, title: config.title, track: 'portable', collection: 'showcases', level: null, order: config.order,
    purpose: config.purpose, notice: config.notice, prompts: config.prompts, guideHeading: config.heading,
    defaultOpen: kind === 'transform', output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes,
    transitions: cutBoundaries(scenes),
  })
}

function catalogue(input: CatalogueInput): StockShow {
  const name = input.level ? `${input.level + input.order} ${input.title}` : input.title
  const transitions = input.transitions ?? []
  const scenes: ShowScene[] = input.scenes.map((item) => ({
    id: item.id, name: item.name, durationMs: item.durationMs,
    ...(item.routingTargets ? { routingTargets: item.routingTargets } : {}),
    ...(transitionOut(item.id, transitions) ? { transitionOut: transitionOut(item.id, transitions) } : {}),
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
    routingSwitches: transitions.flatMap((item) => item.kind === 'routing' && item.layoutId
      ? [{ afterSceneId: item.afterSceneId, layoutId: item.layoutId }]
      : []),
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
    lesson: input.title, description: input.purpose, note, show,
  }
}

function scene(id: string, name: string, seconds: number, clips: ClipSpec[], routingTargets?: ShowScene['routingTargets']): SceneSpec {
  return { id, name, durationMs: seconds * 1_000, clips, ...(routingTargets ? { routingTargets } : {}) }
}

function clip(zoneId: string, pattern: string, timeScale: number, controls?: Record<string, number>, brightness = 1, effects?: ShowClipEffect[]): ClipSpec {
  return { zoneId, pattern, timeScale, brightness, ...(controls ? { controls } : {}), ...(effects ? { effects } : {}) }
}

function boundary(afterSceneId: string, kind: Exclude<ShowBoundaryTransition['kind'], 'routing'>, durationMs: number, easing: ShowTransitionEasing, extra: Partial<ShowBoundaryTransition> = {}): ShowBoundaryTransition {
  return { id: `transition-${afterSceneId}`, afterSceneId, kind, durationMs, easing, ...extra }
}

function brightnessBoundary(afterSceneId: string, kind: 'wipe' | 'crossfade', durationMs: number, easing: ShowTransitionEasing, destination: SceneSpec, from: number, extra: Partial<ShowBoundaryTransition> = {}): ShowBoundaryTransition {
  return boundary(afterSceneId, kind, durationMs, easing, {
    ...extra,
    propertyTransitions: {
      ...extra.propertyTransitions,
      brightness: {
        fromByCellId: Object.fromEntries(destination.clips.map((item) => [cellId(destination.id, item.zoneId), from])),
        durationMs, easing,
      },
    },
  })
}

function cutBoundaries(scenes: SceneSpec[]): ShowBoundaryTransition[] {
  return scenes.slice(0, -1).map((item) => boundary(item.id, 'cut', 0, LINEAR))
}

function transitionOut(sceneId: string, transitions: ShowBoundaryTransition[]): ShowScene['transitionOut'] | undefined {
  const item = transitions.find((candidate) => candidate.afterSceneId === sceneId && candidate.kind !== 'routing')
  if (!item || item.kind === 'routing') return undefined
  return {
    kind: item.kind, durationMs: item.durationMs, color: item.color, direction: item.direction,
    feather: item.feather, edgePolicy: item.edgePolicy, shape: item.shape, centerX: item.centerX, centerY: item.centerY,
    scale: item.scale, featherPolicy: item.featherPolicy,
  }
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
  return { kind: 'portable', mapId: 'plane', pixelCount: 2_000 }
}

function installationOutput(): CatalogueInput['output'] {
  return { kind: 'installation', mapId: 'sunflower-pucks-2d', pixelCount: 160 }
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

function keyframe(id: string, seconds: number, value: number) {
  return { id, timeMs: seconds * 1_000, value, easing: SINE_IN_OUT }
}

import type {
  ShowBoundaryTransition,
  ShowCell,
  ShowClipEffect,
  ShowCompositionV1,
  ShowPropertyAnimationTrack,
  ShowRecord,
  ShowRoutingLayout,
  ShowScene,
  ShowStructuredEasing,
  ShowZone,
} from '@/engine/personalContentRecords'
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
const SINE_IN_OUT: ShowStructuredEasing = { curve: 'sine', direction: 'in-out' }
const CUBIC_IN_OUT: ShowStructuredEasing = { curve: 'cubic', direction: 'in-out' }
const LINEAR: ShowStructuredEasing = { curve: 'linear' }
const COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#22c55e']
const CARDINAL_DIRECTIONS = [
  { id: 'east', label: 'east', turns: 0 },
  { id: 'south', label: 'south', turns: 0.25 },
  { id: 'west', label: 'west', turns: 0.5 },
  { id: 'north', label: 'north', turns: 0.75 },
] as const

export const STOCK_SHOWS: StockShow[] = [
  learn101(), learn102(), learn103(), learn104(), learn105(),
  learn201(), learn202(), learn203(), learn204(), learn205(),
  effectShowcase('transform'), effectShowcase('distortion'), effectShowcase('color-output'),
  wipeAndMixTransitionReference(), shapeRevealTransitionReference(), motionTransitionReference(),
  propertyAnimationReference(), easingReference(),
  redlineInstallation(),
]

export function stockShowById(id: string | null | undefined): StockShow | undefined {
  return id ? STOCK_SHOWS.find((item) => item.id === id) : undefined
}

function learn101(): StockShow {
  const id = 'stock-show-101-clips-crossfade'
  const zones = logicalZones(['Main'], 2_000)
  const scenes: SceneSpec[] = [
    scene('mandala', 'Mandala', 8, [clip('zone-1', 'SignalMandala', 0.35, { sliderSpeed: 0.45, sliderSpokes: 0.48, sliderRings: 0.36, sliderColor: 0.64 })]),
    scene('compass', 'Compass', 8, [clip('zone-1', 'CompassRose', 0.35, { sliderSpeed: 0.30, sliderPoints: 0.42, sliderSweep: 0.62, sliderHue: 0.10 })]),
  ]
  return catalogue({
    id, title: 'Clips and Crossfade', track: 'portable', collection: 'learn', level: 100, order: 1,
    purpose: 'Two Patterns become one timed composition. Each Clip owns what plays; the boundary between them owns how the picture changes.',
    notice: 'The Crossfade is a separate timeline entity, not a property hidden inside either Clip.',
    prompts: ['Shorten the Crossfade from 3.0 s to 1.0 s.', 'Replace Compass Rose with a Pattern that moves differently.'],
    guideHeading: 'clips-scenes-and-boundaries',
    output: portableOutput(), zones, layouts: [singleLayout(zones)], scenes,
    transitions: [boundary('mandala', 'crossfade', 3_000, SINE_IN_OUT)],
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
    notice: 'The first six examples use Scene-local sparklines; Split position and Repeat scale use boundary-owned Property transitions.',
    prompts: ['Open each Scene and compare the highlighted sparkline owner.', 'Change one midpoint value while leaving its endpoints fixed.'],
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
          id: sceneId, label, detail: 'Scene-local Property sparkline.', anchor: { kind: 'scene' as const, sceneId },
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

function brightnessBoundary(afterSceneId: string, kind: 'wipe' | 'crossfade', durationMs: number, easing: ShowStructuredEasing, destination: SceneSpec, from: number, extra: Partial<ShowBoundaryTransition> = {}): ShowBoundaryTransition {
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

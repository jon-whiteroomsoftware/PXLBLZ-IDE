// Native v2 stock Show catalogue (#1040).
//
// Every entry here is authored directly as a v2 record — explicit Clips,
// Layers, Transition relationships, Layout occurrences, independent animation
// and chapter Markers — and validates and compiles without the v1 converter.
// This is the authoring source the catalogue moves to when #1039 activates v2;
// production still reads the pinned legacy builder in `shows.ts` until then.
//
// The port is mechanical: timing, Patterns, instances, sharing, appearance,
// effects, animation curves and Layout routing are the choreography the legacy
// catalogue already shipped, restated in v2 vocabulary. No Show was redesigned,
// retimed or re-tuned, and no Show was added or retired. Each show function
// keeps the legacy builder's design rationale in its comment so the reason a
// lesson looks the way it does survives the cutover.
//
// `shows.ts` stays the independent pinned legacy input the parity harness
// converts, so `npm run show:v2-native-parity` compares this builder's output
// against converted legacy records rather than two outputs of one builder.
// #1042 retires the legacy builder after migration.
import type { ShowClipEffect, ShowStructuredEasing } from '@/engine/personalContentRecords'
import type { ShowRecordV2, ShowTransitionV2 } from '@/engine/showCompositionV2'
import {
  CUBIC_IN,
  CUBIC_IN_OUT,
  CUBIC_OUT,
  LESSON_TIME_SCALE,
  LINEAR,
  PORTABLE_REFERENCE_PIXELS,
  QUADRATIC_IN,
  SINE_IN_OUT,
  SINE_OUT,
  chapter,
  clip,
  groupClip,
  groupLayer,
  installationOutputContract,
  instance,
  layerTransition,
  logicalLayout,
  logicalZones,
  mainLayer,
  mainLayerId,
  marker,
  nativeShowV2,
  occurrence,
  offsetInstance,
  overlayLayer,
  overlayLayerId,
  physicalLayout,
  physicalZones,
  portableOutputContract,
  propertyKey,
  propertyTrack,
  singleLayout,
  splitLayout,
  steppedInstance,
  transfer,
  wholeOutputTransition,
} from './showsV2Authoring'

/**
 * The native v2 catalogue in the same order the pinned legacy catalogue lists
 * it, so census, capacity and Gallery ordering compare row for row.
 */
export const STOCK_SHOWS_V2: readonly ShowRecordV2[] = [
  learn100V2(),
  learn101V2(), learn102V2(), learn103V2(), learn104V2(), learn105V2(), learn106V2(),
  learn201V2(), learn202V2(), learn203V2(), learn204V2(), learn205V2(), learn206V2(), learn207V2(),
  learn301V2(), learn302V2(), learn303V2(),
  transformEffectsShowcaseV2(), distortionEffectsShowcaseV2(),
  colorAdjustmentEffectsShowcaseV2(), compositingKeyShowcaseV2(), lumaSourcesShowcaseV2(),
  blendAndFadeTransitionReferenceV2(), wipeTransitionReferenceV2(), dissolveTransitionReferenceV2(),
  shapeRevealGeometricReferenceV2(), shapeRevealFigureReferenceV2(), slideTransitionReferenceV2(), zoomSpinTransitionReferenceV2(),
  propertyAnimationReferenceV2(), easingReferenceV2(), apertureShapesReferenceV2(), apertureIconsReferenceV2(),
  zoneLayoutSplitsShowcaseV2(), zoneLayoutBandsShowcaseV2(), zoneLayoutRadialShowcaseV2(),
  redlineInstallationV2(),
  remixCoronalMassEjectionV2(),
  quadrilleRemixV2(),
  overtureRemixV2(),
]

export function stockShowV2ById(id: string | null | undefined): ShowRecordV2 | undefined {
  return id ? STOCK_SHOWS_V2.find(record => record.id === id) : undefined
}

// 100 is the tour: it exists so the learner can move, not so it can teach an
// authoring concept. The content is deliberately furniture - the 101 pair
// carries the main row, GlyphRain (82% dark) sits on a second Layer as a
// drag target and zoom landmark, and the four-second blank tail is the
// double-click target the first prompt needs. The note is deliberately
// non-exhaustive; restraint is part of the course doctrine, and the guide
// handoff points at the Keyboard Shortcuts reference instead of the visual
// toolkit because the tools, not the picture, are the lesson.
function learn100V2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-100-getting-around',
    name: '100 Getting Around',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 16_000,
    patternInstances: [
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
      instance('glyphs', 'GlyphRain', LESSON_TIME_SCALE),
      instance('ribbons', 'RibbonLoom', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1'), overlayLayer('zone-1', 1, 'Upper Layer')],
    clips: [
      clip('clip-ribbons', 'ribbons', 'zone-1', mainLayerId('zone-1'), 0, 6_000),
      clip('clip-glyphs', 'glyphs', 'zone-1', overlayLayerId('zone-1', 1), 3_000, 6_000, { opacity: 0.5 }),
      clip('clip-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 6_000, 6_000),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 16_000),
    ],
  })
}

// 101 pairs sparse linework against a solid field so the Cut, the gap, and Show
// End are all legible without opening Entity Details. No Transition entity, no
// Effect, and no second Layer competes with direct timing.
function learn101V2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-101-clips-cuts-blank-time',
    name: '101 Clips, Cuts, and Blank Time',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 16_000,
    patternInstances: [
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
      instance('ribbons', 'RibbonLoom', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1')],
    clips: [
      clip('clip-ribbons', 'ribbons', 'zone-1', mainLayerId('zone-1'), 0, 5_000),
      clip('clip-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 5_000, 5_000),
      clip('clip-reprise', 'ribbons', 'zone-1', mainLayerId('zone-1'), 12_000, 4_000),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 16_000),
    ],
  })
}

// 102 casts the two black-cored radial machines so the Crossfade reads as one
// mechanism becoming another rather than two pictures fighting, then wipes into
// a bright full-field mandala so the second family is unmistakable.
function learn102V2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-102-transitions-values',
    name: '102 Transitions and Values',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 16_500,
    patternInstances: [
      instance('horizon', 'EventHorizon', LESSON_TIME_SCALE),
      instance('iris', 'ClockworkIris', LESSON_TIME_SCALE),
      instance('mandala', 'SignalMandala', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1')],
    clips: [
      clip('clip-iris', 'iris', 'zone-1', mainLayerId('zone-1'), 0, 5_000),
      clip('clip-horizon', 'horizon', 'zone-1', mainLayerId('zone-1'), 7_000, 4_000),
      clip('clip-mandala', 'mandala', 'zone-1', mainLayerId('zone-1'), 12_500, 4_000),
    ],
    transitions: [
      layerTransition('transition-horizon-mandala', 'wipe', 'zone-1', mainLayerId('zone-1'), 'clip-horizon', 'clip-mandala', 1_500, CUBIC_IN_OUT, { wipeVariant: 'linear', direction: 0, feather: 0.08, edgePolicy: 'dither' }),
      layerTransition('transition-iris-horizon', 'crossfade', 'zone-1', mainLayerId('zone-1'), 'clip-iris', 'clip-horizon', 2_000, SINE_IN_OUT, { crossfadePolicy: 'live-live' }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 16_500),
    ],
    propertyTracks: [
      propertyTrack('track-mandala-brightness', { kind: 'clip-view', clipId: 'clip-mandala', property: 'brightness' }, 0, 16_500, [
        propertyKey('mandala-arrive', 12_500, 1),
        propertyKey('mandala-hold', 14_500, 1),
        propertyKey('mandala-settle', 16_500, 0.45),
      ]),
    ],
  })
}

// 103 reuses one instance of the only radial Pattern with unmistakable
// orientation: its cardinal points and asymmetric sweep make Rotation and
// Mirror visible, which a symmetric mandala could never show. Sharing one
// instance keeps the Pattern clock running so only the pose changes.
function learn103V2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-103-clip-transform',
    name: '103 Clip Transform',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'deterministic-loop',
    showEndMs: 15_000,
    patternInstances: [
      instance('rose', 'CompassRose', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1')],
    clips: [
      clip('clip-reference', 'rose', 'zone-1', mainLayerId('zone-1'), 0, 3_000),
      clip('clip-position', 'rose', 'zone-1', mainLayerId('zone-1'), 3_000, 3_000, { transform: { positionX: 0.22, positionY: -0.14, rotation: 0, scaleX: 1, scaleY: 1 } }),
      clip('clip-rotation', 'rose', 'zone-1', mainLayerId('zone-1'), 6_000, 3_000, { transform: { positionX: 0, positionY: 0, rotation: 0.125, scaleX: 1, scaleY: 1 } }),
      clip('clip-scale', 'rose', 'zone-1', mainLayerId('zone-1'), 9_000, 3_000, { transform: { positionX: 0, positionY: 0, rotation: 0, scaleX: 0.62, scaleY: 0.62 } }),
      clip('clip-mirror', 'rose', 'zone-1', mainLayerId('zone-1'), 12_000, 3_000, { view: { mirror: true } }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 15_000),
    ],
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
function learn104V2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-104-effects-and-ordering',
    name: '104 Effects and Ordering',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 16_000,
    patternInstances: [
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1')],
    clips: [
      clip('clip-plain', 'garden', 'zone-1', mainLayerId('zone-1'), 0, 4_000),
      clip('clip-threshold', 'garden', 'zone-1', mainLayerId('zone-1'), 4_000, 4_000, { effects: [{ id: 'threshold-alone', kind: 'threshold', threshold: 0.2, amount: 1 }] }),
      clip('clip-brightness-threshold', 'garden', 'zone-1', mainLayerId('zone-1'), 8_000, 4_000, { effects: [{ id: 'brightness-first', kind: 'brightness', brightness: 0.4 }, { id: 'threshold-second', kind: 'threshold', threshold: 0.2, amount: 1 }] }),
      clip('clip-threshold-brightness', 'garden', 'zone-1', mainLayerId('zone-1'), 12_000, 4_000, { effects: [{ id: 'threshold-first', kind: 'threshold', threshold: 0.2, amount: 1 }, { id: 'brightness-second', kind: 'brightness', brightness: 0.4 }] }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 16_000),
    ],
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
function learn105V2(): ShowRecordV2 {
  const zones = logicalZones(['Weave', 'Water'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-105-portable-zones',
    name: '105 Zones',
    zones,
    zoneLayouts: [splitLayout('layout-side-by-side', 'Side by side', zones, 'x'), logicalLayout('layout-rings', 'Rings', { kind: 'rings', zoneIds: ['zone-1', 'zone-2'], rings: 3 }), logicalLayout('layout-pinwheel', 'Pinwheel', { kind: 'pinwheel', zoneIds: ['zone-1', 'zone-2'], arms: 6, twist: 4.71238898038469, rotation: 0 })],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'deterministic-loop',
    showEndMs: 20_000,
    patternInstances: [
      instance('ribbons', 'RibbonLoom', LESSON_TIME_SCALE),
      instance('water', 'Caustics', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1'), mainLayer('zone-2')],
    clips: [
      clip('clip-split-ribbons', 'ribbons', 'zone-1', mainLayerId('zone-1'), 0, 8_000),
      clip('clip-split-water', 'water', 'zone-2', mainLayerId('zone-2'), 0, 8_000),
      clip('clip-rings-ribbons', 'ribbons', 'zone-1', mainLayerId('zone-1'), 8_000, 6_000),
      clip('clip-rings-water', 'water', 'zone-2', mainLayerId('zone-2'), 8_000, 6_000),
      clip('clip-pinwheel-ribbons', 'ribbons', 'zone-1', mainLayerId('zone-1'), 14_000, 6_000),
      clip('clip-pinwheel-water', 'water', 'zone-2', mainLayerId('zone-2'), 14_000, 6_000),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-side-by-side', 0, 8_000, { splitPosition: 0.5 }),
      occurrence(2, 'layout-rings', 8_000, 6_000, {}, transfer('routing-split-rings', 1, 1_500, 'forward', SINE_IN_OUT)),
      occurrence(3, 'layout-pinwheel', 14_000, 6_000, {}, transfer('routing-rings-pinwheel', 2, 1_500, 'forward', SINE_IN_OUT)),
    ],
    markers: [
      chapter('scene-marker:split', 0, 'Split'),
      chapter('scene-marker:rings', 8_000, 'Rings'),
      chapter('scene-marker:pinwheel', 14_000, 'Pinwheel'),
    ],
  })
}

// 106 is the capstone, so it spends its budget on recombination rather than on
// new material: every element below was taught in 101-105 and nothing else
// appears. The Sky takes the radial family and the Ground takes the blob family
// that opened 101, so the two Zones stay tellable apart for the whole arc and
// the last lesson closes on the first lesson's Pattern.
function learn106V2(): ShowRecordV2 {
  const zones = logicalZones(['Sky', 'Ground'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-106-built-from-basics',
    name: '106 Built from Basics',
    zones,
    zoneLayouts: [splitLayout('layout-sky-ground', 'Sky and ground', zones, 'y')],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 30_000,
    patternInstances: [
      instance('bloom', 'TopographicBloom', LESSON_TIME_SCALE),
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
      instance('mandala', 'SignalMandala', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1'), mainLayer('zone-2')],
    clips: [
      clip('clip-ground-garden', 'garden', 'zone-2', mainLayerId('zone-2'), 0, 12_500),
      clip('clip-sky-bloom', 'bloom', 'zone-1', mainLayerId('zone-1'), 0, 8_000),
      clip('clip-sky-mandala', 'mandala', 'zone-1', mainLayerId('zone-1'), 11_000, 8_500),
      clip('clip-ground-return', 'garden', 'zone-2', mainLayerId('zone-2'), 15_000, 15_000, { transform: { positionX: 0, positionY: 0, rotation: 0, scaleX: 1.5, scaleY: 1.5 }, effects: [{ id: 'ground-hue', kind: 'hue', turns: 0.12 }] }),
      clip('clip-sky-reprise', 'bloom', 'zone-1', mainLayerId('zone-1'), 22_500, 7_500),
    ],
    transitions: [
      layerTransition('transition-ground-garden-return', 'dither', 'zone-2', mainLayerId('zone-2'), 'clip-ground-garden', 'clip-ground-return', 2_500, CUBIC_IN_OUT, { dissolveVariant: 'coherent-noise', seed: 106, scale: 6, edgePolicy: 'hard' }),
      layerTransition('transition-sky-bloom-mandala', 'crossfade', 'zone-1', mainLayerId('zone-1'), 'clip-sky-bloom', 'clip-sky-mandala', 3_000, SINE_IN_OUT, { crossfadePolicy: 'live-live' }),
      layerTransition('transition-sky-mandala-reprise', 'portal', 'zone-1', mainLayerId('zone-1'), 'clip-sky-mandala', 'clip-sky-reprise', 3_000, SINE_IN_OUT, { shape: 'circle', revealMode: 'grow-incoming', centerX: 0.5, centerY: 0.5, scale: 1, edgePolicy: 'blend', feather: 0.12 }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-sky-ground', 0, 30_000),
    ],
    propertyTracks: [
      propertyTrack('track-ground-release', { kind: 'clip-view', clipId: 'clip-ground-return', property: 'brightness' }, 0, 30_000, [
        propertyKey('ground-hold', 24_000, 1, LINEAR),
        propertyKey('ground-dark', 28_000, 0),
        propertyKey('ground-black', 30_000, 0),
      ]),
      propertyTrack('track-ground-spin', { kind: 'clip-transform', clipId: 'clip-ground-return', property: 'rotation' }, 0, 30_000, [
        propertyKey('spin-still', 15_000, 0, QUADRATIC_IN),
        propertyKey('spin-away', 30_000, 1.25),
      ]),
      propertyTrack('track-sky-release', { kind: 'clip-view', clipId: 'clip-sky-reprise', property: 'brightness' }, 0, 30_000, [
        propertyKey('sky-hold', 24_000, 1, LINEAR),
        propertyKey('sky-dark', 28_000, 0),
        propertyKey('sky-black', 30_000, 0),
      ]),
    ],
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
function learn201V2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-201-layers-property-animation',
    name: '201 Layers and Property Animation',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 14_000,
    patternInstances: [
      instance('flies', 'TimeFlies2D', LESSON_TIME_SCALE),
      instance('water', 'Caustics', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1'), overlayLayer('zone-1', 1, 'Firefly overlay')],
    clips: [
      clip('clip-water', 'water', 'zone-1', mainLayerId('zone-1'), 0, 14_000),
      clip('clip-flies', 'flies', 'zone-1', overlayLayerId('zone-1', 1), 2_000, 10_000, { opacity: 0 }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 14_000),
    ],
    propertyTracks: [
      propertyTrack('track-fly-opacity', { kind: 'clip-opacity', clipId: 'clip-flies' }, 0, 14_000, [
        propertyKey('flies-arrive', 2_000, 0),
        propertyKey('flies-hold', 4_000, 0.65),
        propertyKey('flies-depart', 9_000, 0.65),
        propertyKey('flies-gone', 12_000, 0),
      ]),
    ],
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
function learn202V2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-202-content-clip-viewport',
    name: '202 Content and Clip Viewport',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 16_000,
    patternInstances: [
      instance('curve', 'Harmonograph', LESSON_TIME_SCALE),
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1'), overlayLayer('zone-1', 1, 'Subject')],
    clips: [
      clip('clip-full', 'curve', 'zone-1', overlayLayerId('zone-1', 1), 0, 4_000),
      clip('clip-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 0, 16_000, { view: { brightness: 0.15 } }),
      clip('clip-frame', 'curve', 'zone-1', overlayLayerId('zone-1', 1), 4_000, 4_000, { aperture: { enabled: true, width: 0.5, height: 0.5, edge: 'soft', x: 0, y: 0 } }),
      clip('clip-frame-move', 'curve', 'zone-1', overlayLayerId('zone-1', 1), 8_000, 4_000, { aperture: { enabled: true, width: 0.5, height: 0.5, edge: 'soft', x: 0, y: 0 } }),
      clip('clip-content-pan', 'curve', 'zone-1', overlayLayerId('zone-1', 1), 12_000, 4_000, { aperture: { enabled: true, width: 0.5, height: 0.5, edge: 'soft', x: 0.25, y: 0.25 } }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 16_000),
    ],
    propertyTracks: [
      propertyTrack('track-content-pan', { kind: 'clip-transform', clipId: 'clip-content-pan', property: 'positionX' }, 0, 16_000, [
        propertyKey('pan-start', 12_500, 0),
        propertyKey('pan-east', 15_500, 0.3),
      ]),
      propertyTrack('track-frame-height', { kind: 'clip-aperture', clipId: 'clip-frame', property: 'height' }, 0, 16_000, [
        propertyKey('height-full', 4_000, 1),
        propertyKey('height-half', 5_500, 0.5),
      ]),
      propertyTrack('track-frame-move-x', { kind: 'clip-aperture', clipId: 'clip-frame-move', property: 'x' }, 0, 16_000, [
        propertyKey('frame-x-corner', 8_500, 0),
        propertyKey('frame-x-center', 11_500, 0.25),
      ]),
      propertyTrack('track-frame-move-y', { kind: 'clip-aperture', clipId: 'clip-frame-move', property: 'y' }, 0, 16_000, [
        propertyKey('frame-y-corner', 8_500, 0),
        propertyKey('frame-y-center', 11_500, 0.25),
      ]),
      propertyTrack('track-frame-width', { kind: 'clip-aperture', clipId: 'clip-frame', property: 'width' }, 0, 16_000, [
        propertyKey('width-full', 4_000, 1),
        propertyKey('width-half', 5_500, 0.5),
      ]),
    ],
  })
}

// 203 needs a source whose state is unmistakable at a glance. ShapeShifter
// continuously melts five analytic silhouettes into one another, so its whole
// identity is which form it currently occupies. A restart therefore reads as
// the form snapping back, and a shared clock reads as the form staying put
// across a junction.
function learn203V2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-203-pattern-instance-lifecycle',
    name: '203 Pattern Instance Lifecycle',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 16_000,
    patternInstances: [
      instance('palette-fresh', 'ShapeShifter', LESSON_TIME_SCALE),
      instance('palette-shared', 'ShapeShifter', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1')],
    clips: [
      clip('clip-opening', 'palette-shared', 'zone-1', mainLayerId('zone-1'), 0, 4_000),
      clip('clip-continued', 'palette-shared', 'zone-1', mainLayerId('zone-1'), 4_000, 4_000),
      clip('clip-duplicate', 'palette-fresh', 'zone-1', mainLayerId('zone-1'), 8_000, 4_000),
      clip('clip-rejoined', 'palette-shared', 'zone-1', mainLayerId('zone-1'), 12_000, 4_000),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 16_000),
    ],
  })
}

// 204 compares five presentations of one drifting field. The cast is
// Kishimisu, Jon's choice (#1097). (The cast originally also dodged a
// lowering defect: before #663 a stepped clock rendered its whole first
// window ahead of the first beforeRender delivery, which broke Patterns like
// Caustics that compute render state there. The priming delivery removed that
// constraint; every Pattern is now safe to Stutter.) The Stutter passage owns
// a second instance because Stutter quantizes the Pattern-instance clock
// itself; giving it the shared instance would stutter every other Clip too.
function learn204V2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-204-presentation-modes',
    name: '204 Presentation Modes',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 15_000,
    patternInstances: [
      instance('palette', 'Kishimisu', LESSON_TIME_SCALE),
      steppedInstance('palette-stuttered', 'Kishimisu', LESSON_TIME_SCALE, 500),
    ],
    layers: [mainLayer('zone-1')],
    clips: [
      clip('clip-live', 'palette', 'zone-1', mainLayerId('zone-1'), 0, 3_000),
      clip('clip-freeze', 'palette', 'zone-1', mainLayerId('zone-1'), 3_000, 3_000, { presentation: { mode: 'freeze' } }),
      clip('clip-strobe', 'palette', 'zone-1', mainLayerId('zone-1'), 6_000, 3_000, { presentation: { mode: 'strobe', cadenceMs: 400 } }),
      clip('clip-blink', 'palette', 'zone-1', mainLayerId('zone-1'), 9_000, 3_000, { blink: { rateHz: 1, duty: 0.5, phase: 0 } }),
      clip('clip-stutter', 'palette-stuttered', 'zone-1', mainLayerId('zone-1'), 12_000, 3_000),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 15_000),
    ],
  })
}

// 205 builds one short phrase - a mandala pulse and its smaller offset echo -
// and places it twice. The phrase runs over quiet linework so both occurrences
// stay attributable, the second occurrence is translated so reuse does not
// read as a replay of the same pixels, and each occurrence materializes its
// own Pattern instances so the two pulses never share private state.
function learn205V2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-205-groups-linked-reuse',
    name: '205 Groups and Linked Reuse',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'deterministic-loop',
    showEndMs: 16_000,
    patternInstances: [
      instance('loom', 'RibbonLoom', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1'), overlayLayer('zone-1', 1, 'Layer 1'), overlayLayer('zone-1', 2, 'Layer 2')],
    clips: [
      clip('clip-loom', 'loom', 'zone-1', mainLayerId('zone-1'), 0, 16_000),
    ],
    // One definition, two occurrences. The lesson is that repeating a Group
    // repeats its choreography without minting another runtime, so each
    // occurrence binds the definition's single slot to its own explicit
    // runtime ID and both keep the same local opacity swell.
    groupDefinitions: [{
      id: 'group-pulse',
      name: 'Mandala pulse',
      patternInstances: [instance('pulse', 'SignalMandala', LESSON_TIME_SCALE)],
      layers: [groupLayer('group-pulse', 0), groupLayer('group-pulse', 1)],
      clips: [
        groupClip('pulse-lead', 'pulse', 'group-pulse:layer:0', 0, 4_000, { opacity: 0 }),
        groupClip('pulse-echo', 'pulse', 'group-pulse:layer:1', 1_000, 3_000, {
          opacity: 0,
          transform: { positionX: 0.2, positionY: -0.14, rotation: 0, scaleX: 0.6, scaleY: 0.6 },
        }),
      ],
      transitions: [],
      propertyTracks: [
        propertyTrack('track-pulse-echo', { kind: 'clip-opacity', clipId: 'pulse-echo' }, 0, 4_000, [
          propertyKey('echo-in', 1_000, 0),
          propertyKey('echo-peak', 2_500, 0.55),
          propertyKey('echo-out', 4_000, 0),
        ]),
        propertyTrack('track-pulse-lead', { kind: 'clip-opacity', clipId: 'pulse-lead' }, 0, 4_000, [
          propertyKey('lead-in', 0, 0),
          propertyKey('lead-peak', 1_500, 0.9),
          propertyKey('lead-out', 4_000, 0),
        ]),
      ],
    }],
    groupOccurrences: [
      {
        id: 'occurrence-first',
        definitionId: 'group-pulse',
        layoutOccurrenceId: 'layout-occurrence:1',
        zoneId: 'zone-1',
        startMs: 2_000,
        translationX: 0,
        translationY: 0,
        holds: [],
        instanceBindings: { pulse: 'occurrence-first:pulse' },
        trackActivation: { startMs: 0, durationMs: 16_000 },
        layerBindings: [
          { definitionLayerId: 'group-pulse:layer:0', layerId: overlayLayerId('zone-1', 1) },
          { definitionLayerId: 'group-pulse:layer:1', layerId: overlayLayerId('zone-1', 2) },
        ],
      },
      {
        id: 'occurrence-second',
        definitionId: 'group-pulse',
        layoutOccurrenceId: 'layout-occurrence:1',
        zoneId: 'zone-1',
        startMs: 9_000,
        translationX: -0.18,
        translationY: 0.12,
        holds: [],
        instanceBindings: { pulse: 'occurrence-second:pulse' },
        trackActivation: { startMs: 0, durationMs: 16_000 },
        layerBindings: [
          { definitionLayerId: 'group-pulse:layer:0', layerId: overlayLayerId('zone-1', 1) },
          { definitionLayerId: 'group-pulse:layer:1', layerId: overlayLayerId('zone-1', 2) },
        ],
      },
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 16_000),
    ],
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
function learn206V2(): ShowRecordV2 {
  const zones = logicalZones(['Weave', 'Water'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-206-changing-zone-layouts',
    name: '206 Changing Zone Layouts',
    zones,
    zoneLayouts: [singleLayout(zones, 'layout-full', 'Full Surface'), splitLayout('layout-split', 'Moving Split', zones, 'x'), logicalLayout('layout-rings', 'Rings', { kind: 'rings', zoneIds: ['zone-1', 'zone-2'], rings: 2 })],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 17_000,
    patternInstances: [
      instance('loom', 'RibbonLoom', LESSON_TIME_SCALE),
      instance('water', 'IceFloes2D', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1'), mainLayer('zone-2')],
    clips: [
      clip('clip-full-loom', 'loom', 'zone-1', mainLayerId('zone-1'), 0, 5_000),
      clip('clip-split-loom', 'loom', 'zone-1', mainLayerId('zone-1'), 5_000, 6_000),
      clip('clip-split-water', 'water', 'zone-2', mainLayerId('zone-2'), 5_000, 6_000),
      clip('clip-rings-loom', 'loom', 'zone-1', mainLayerId('zone-1'), 11_000, 6_000),
      clip('clip-rings-water', 'water', 'zone-2', mainLayerId('zone-2'), 11_000, 6_000),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-full', 0, 5_000),
      occurrence(2, 'layout-split', 5_000, 6_000, { splitPosition: 0.5 }, transfer('routing-full-split', 1, 1_500, 'forward', SINE_IN_OUT)),
      occurrence(3, 'layout-rings', 11_000, 6_000),
    ],
    markers: [
      chapter('scene-marker:full', 0, 'Full surface'),
      chapter('scene-marker:split', 5_000, 'Split'),
      chapter('scene-marker:rings', 11_000, 'Rings'),
    ],
  })
}

// 207 extends 202's frame construction with shaped apertures: MagneticFilaments
// behind a half-size frame over a dim NeonCircuitBoard bed (#848). The frame
// stays fixed while the silhouette changes through Rectangle, Ellipse, Star,
// and Ring. Soft is the default; the final Ring uses Hard for comparison.
// The full silhouette-by-edge matrix belongs to the Aperture Shapes reference.
function learn207V2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-207-aperture-shapes-edges',
    name: '207 Aperture Shapes and Edges',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'deterministic-loop',
    showEndMs: 20_000,
    patternInstances: [
      instance('garden', 'NeonCircuitBoard', LESSON_TIME_SCALE),
      instance('rose', 'MagneticFilaments', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1'), overlayLayer('zone-1', 1, 'Subject')],
    clips: [
      clip('clip-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 0, 20_000, { view: { brightness: 0.3 } }),
      clip('clip-rectangle', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 0, 4_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, edge: 'soft' } }),
      clip('clip-ellipse', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 4_000, 4_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'ellipse' } }),
      clip('clip-star', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 8_000, 4_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'star' } }),
      clip('clip-ring', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 12_000, 4_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'ring' } }),
      clip('clip-ring-hard', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 16_000, 4_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'ring', edge: 'hard' } }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 20_000),
    ],
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
function learn301V2(): ShowRecordV2 {
  const zones = physicalZones(['Stage', 'Arch', 'Columns'], [250, 250, 500])
  return nativeShowV2({
    id: 'stock-show-301-installation-mapping',
    name: '301 Installation Mapping',
    zones,
    zoneLayouts: [physicalLayout('layout-stage', 'Proscenium stage', zones, [[[250, 499]], [[500, 749]], [[0, 249], [750, 999]]])],
    stageMapId: 'proscenium-stage-2d',
    outputContract: installationOutputContract('proscenium-stage-2d', 1_000),
    executionModel: 'continuous',
    showEndMs: 14_000,
    patternInstances: [
      instance('garden', 'MetaballGarden', 1.8),
      instance('palettes', 'IQPalettes', 2.84),
      instance('rose', 'CompassRose', 1.08),
    ],
    layers: [mainLayer('zone-1'), mainLayer('zone-2'), mainLayer('zone-3')],
    clips: [
      clip('clip-arch-palettes', 'palettes', 'zone-2', mainLayerId('zone-2'), 0, 14_000),
      clip('clip-floor-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 0, 7_000),
      clip('clip-towers-rose', 'rose', 'zone-3', mainLayerId('zone-3'), 0, 7_000),
      clip('clip-floor-rose', 'rose', 'zone-1', mainLayerId('zone-1'), 7_000, 7_000),
      clip('clip-towers-garden', 'garden', 'zone-3', mainLayerId('zone-3'), 7_000, 7_000),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-stage', 0, 14_000),
    ],
  })
}

// 302 spends its whole variety budget on one Pattern instance: a single
// Mandelbrot render drives all five surfaces of the Redline stage (#848).
// Geometry, placement adaptations, Effects, and property animation supply
// the variation while all placements share one clock and one machine.
// The existing phase journeys, 0.64 clock, and 6/8/6-second holds are retained.
function learn302V2(): ShowRecordV2 {
  const zones = physicalZones(['Hero panel', 'Left upper', 'Left lower', 'Right upper', 'Right lower'], [800, 300, 300, 300, 300])
  return nativeShowV2({
    id: 'stock-show-302-installation-composition',
    name: '302 Installation Composition',
    zones,
    zoneLayouts: [physicalLayout('layout-redline-stage', 'Redline stage', zones, [[[0, 799]], [[800, 1_099]], [[1_100, 1_399]], [[1_400, 1_699]], [[1_700, 1_999]]])],
    stageMapId: 'redline-stage-2d',
    outputContract: installationOutputContract('redline-stage-2d', 2_000),
    executionModel: 'continuous',
    showEndMs: 20_000,
    patternInstances: [
      instance('pendulum', 'Mandelbrot2D', 0.64),
    ],
    layers: [mainLayer('zone-1'), mainLayer('zone-2'), mainLayer('zone-3'), mainLayer('zone-4'), mainLayer('zone-5')],
    clips: [
      clip('hero-render', 'pendulum', 'zone-1', mainLayerId('zone-1'), 0, 6_000),
      clip('satellite-1-render', 'pendulum', 'zone-2', mainLayerId('zone-2'), 0, 6_000),
      clip('satellite-2-render', 'pendulum', 'zone-3', mainLayerId('zone-3'), 0, 6_000, { view: { phase: 0.5 } }),
      clip('satellite-3-render', 'pendulum', 'zone-4', mainLayerId('zone-4'), 0, 6_000, { view: { phase: 0.05 } }),
      clip('satellite-4-render', 'pendulum', 'zone-5', mainLayerId('zone-5'), 0, 6_000, { view: { phase: 0.42 } }),
      clip('hero-windows', 'pendulum', 'zone-1', mainLayerId('zone-1'), 6_000, 8_000),
      clip('satellite-1-window', 'pendulum', 'zone-2', mainLayerId('zone-2'), 6_000, 8_000, { view: { phase: 0.05 }, effects: [{ id: 'window-shift-1', kind: 'translate', x: 0, y: 0 }, { id: 'window-wrap-1', kind: 'wrap' }, { id: 'rings-1', kind: 'ripple', amount: 0.34, frequency: 5, phase: 0, centerX: 0.5, centerY: 0.5 }] }),
      clip('satellite-2-window', 'pendulum', 'zone-3', mainLayerId('zone-3'), 6_000, 8_000, { effects: [{ id: 'window-shift-2', kind: 'translate', x: 0.25, y: 0 }, { id: 'window-wrap-2', kind: 'wrap' }, { id: 'iris-2', kind: 'vignette', amount: 1, radius: 2, softness: 0.5, centerX: 0.5, centerY: 0.5, aspect: 1 }] }),
      clip('satellite-3-window', 'pendulum', 'zone-4', mainLayerId('zone-4'), 6_000, 8_000, { view: { phase: 0.42 }, effects: [{ id: 'window-shift-3', kind: 'translate', x: 0.5, y: 0 }, { id: 'window-wrap-3', kind: 'wrap' }, { id: 'kaleido-3', kind: 'kaleidoscope', amount: 1, segments: 6, rotation: 0, centerX: 0.5, centerY: 0.5 }] }),
      clip('satellite-4-window', 'pendulum', 'zone-5', mainLayerId('zone-5'), 6_000, 8_000, { view: { phase: 0.5 }, effects: [{ id: 'window-shift-4', kind: 'translate', x: 0.75, y: 0 }, { id: 'window-wrap-4', kind: 'wrap' }, { id: 'window-turn-4', kind: 'rotate', turns: 0.25 }] }),
      clip('hero-answer', 'pendulum', 'zone-1', mainLayerId('zone-1'), 14_000, 6_000, { effects: [{ id: 'hero-invert', kind: 'invert', amount: 0 }] }),
      clip('satellite-1-answer', 'pendulum', 'zone-2', mainLayerId('zone-2'), 14_000, 6_000, { view: { mirror: true, phase: 0.42 }, effects: [{ id: 'window-shift-1', kind: 'translate', x: 0, y: 0 }, { id: 'window-wrap-1', kind: 'wrap' }, { id: 'rings-1', kind: 'ripple', amount: 0.34, frequency: 5, phase: 0, centerX: 0.5, centerY: 0.5 }] }),
      clip('satellite-2-answer', 'pendulum', 'zone-3', mainLayerId('zone-3'), 14_000, 6_000, { view: { mirror: true, phase: 0.05 }, effects: [{ id: 'window-shift-2', kind: 'translate', x: 0.25, y: 0 }, { id: 'window-wrap-2', kind: 'wrap' }] }),
      clip('satellite-3-answer', 'pendulum', 'zone-4', mainLayerId('zone-4'), 14_000, 6_000, { view: { phase: 0.5 }, effects: [{ id: 'window-shift-3', kind: 'translate', x: 0.5, y: 0 }, { id: 'window-wrap-3', kind: 'wrap' }, { id: 'kaleido-3', kind: 'kaleidoscope', amount: 1, segments: 6, rotation: 0, centerX: 0.5, centerY: 0.5 }, { id: 'answer-posterize-3', kind: 'posterize', levels: 4, amount: 1 }] }),
      clip('satellite-4-answer', 'pendulum', 'zone-5', mainLayerId('zone-5'), 14_000, 6_000, { effects: [{ id: 'window-shift-4', kind: 'translate', x: 0.75, y: 0 }, { id: 'window-wrap-4', kind: 'wrap' }, { id: 'answer-posterize-4', kind: 'posterize', levels: 4, amount: 1 }] }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-redline-stage', 0, 20_000),
    ],
    propertyTracks: [
      propertyTrack('glide-satellite-2-render', { kind: 'clip-view', clipId: 'satellite-2-render', property: 'phase' }, 0, 6_000, [
        propertyKey('glide-satellite-2-render-0', 3_200, 0),
        propertyKey('glide-satellite-2-render-1', 4_200, 0.5),
      ]),
      propertyTrack('glide-satellite-3-render', { kind: 'clip-view', clipId: 'satellite-3-render', property: 'phase' }, 0, 6_000, [
        propertyKey('glide-satellite-3-render-0', 3_400, 0),
        propertyKey('glide-satellite-3-render-1', 4_400, 0.05),
      ]),
      propertyTrack('glide-satellite-4-render', { kind: 'clip-view', clipId: 'satellite-4-render', property: 'phase' }, 0, 6_000, [
        propertyKey('glide-satellite-4-render-0', 3_600, 0),
        propertyKey('glide-satellite-4-render-1', 4_600, 0.42),
      ]),
      propertyTrack('glide-satellite-1-window', { kind: 'clip-view', clipId: 'satellite-1-window', property: 'phase' }, 6_000, 8_000, [
        propertyKey('glide-satellite-1-window-0', 6_000, 0),
        propertyKey('glide-satellite-1-window-1', 7_000, 0.5),
        propertyKey('glide-satellite-1-window-2', 10_000, 0.5),
        propertyKey('glide-satellite-1-window-3', 11_000, 0.05),
      ]),
      propertyTrack('glide-satellite-2-window', { kind: 'clip-view', clipId: 'satellite-2-window', property: 'phase' }, 6_000, 8_000, [
        propertyKey('glide-satellite-2-window-0', 6_200, 0.5),
        propertyKey('glide-satellite-2-window-1', 7_200, 0.42),
        propertyKey('glide-satellite-2-window-2', 10_200, 0.42),
        propertyKey('glide-satellite-2-window-3', 11_200, 0),
      ]),
      propertyTrack('glide-satellite-3-window', { kind: 'clip-view', clipId: 'satellite-3-window', property: 'phase' }, 6_000, 8_000, [
        propertyKey('glide-satellite-3-window-0', 6_400, 0.05),
        propertyKey('glide-satellite-3-window-1', 7_400, 0),
        propertyKey('glide-satellite-3-window-2', 10_400, 0),
        propertyKey('glide-satellite-3-window-3', 11_400, 0.42),
      ]),
      propertyTrack('glide-satellite-4-window', { kind: 'clip-view', clipId: 'satellite-4-window', property: 'phase' }, 6_000, 8_000, [
        propertyKey('glide-satellite-4-window-0', 6_600, 0.42),
        propertyKey('glide-satellite-4-window-1', 7_600, 0.05),
        propertyKey('glide-satellite-4-window-2', 10_600, 0.05),
        propertyKey('glide-satellite-4-window-3', 11_600, 0.5),
      ]),
      propertyTrack('track-iris-breath', { kind: 'clip-effect', clipId: 'satellite-2-window', effectId: 'iris-2', effectKind: 'vignette', parameterId: 'radius' }, 6_000, 8_000, [
        propertyKey('iris-open', 6_600, 2),
        propertyKey('iris-closed', 7_800, 0.45),
        propertyKey('iris-reopen', 9_200, 2),
      ]),
      propertyTrack('track-satellite-spin', { kind: 'clip-effect', clipId: 'satellite-4-window', effectId: 'window-turn-4', effectKind: 'rotate', parameterId: 'turns' }, 6_000, 8_000, [
        propertyKey('spin-rest', 10_200, 0.25),
        propertyKey('spin-half', 13_800, 0.75),
      ]),
      propertyTrack('glide-satellite-1-answer', { kind: 'clip-view', clipId: 'satellite-1-answer', property: 'phase' }, 14_000, 6_000, [
        propertyKey('glide-satellite-1-answer-0', 14_000, 0.05),
        propertyKey('glide-satellite-1-answer-1', 15_000, 0.42),
      ]),
      propertyTrack('glide-satellite-2-answer', { kind: 'clip-view', clipId: 'satellite-2-answer', property: 'phase' }, 14_000, 6_000, [
        propertyKey('glide-satellite-2-answer-0', 14_200, 0),
        propertyKey('glide-satellite-2-answer-1', 15_200, 0.05),
      ]),
      propertyTrack('glide-satellite-3-answer', { kind: 'clip-view', clipId: 'satellite-3-answer', property: 'phase' }, 14_000, 6_000, [
        propertyKey('glide-satellite-3-answer-0', 14_400, 0.42),
        propertyKey('glide-satellite-3-answer-1', 15_400, 0.5),
      ]),
      propertyTrack('glide-satellite-4-answer', { kind: 'clip-view', clipId: 'satellite-4-answer', property: 'phase' }, 14_000, 6_000, [
        propertyKey('glide-satellite-4-answer-0', 14_600, 0.5),
        propertyKey('glide-satellite-4-answer-1', 15_600, 0),
      ]),
      propertyTrack('track-hero-pulse', { kind: 'clip-effect', clipId: 'hero-answer', effectId: 'hero-invert', effectKind: 'invert', parameterId: 'amount' }, 14_000, 6_000, [
        propertyKey('pulse-rest', 14_000, 0, LINEAR),
        propertyKey('pulse-one-up', 15_900, 0, LINEAR),
        propertyKey('pulse-one-peak', 16_100, 1, LINEAR),
        propertyKey('pulse-one-down', 16_500, 0, LINEAR),
        propertyKey('pulse-two-up', 17_900, 0, LINEAR),
        propertyKey('pulse-two-peak', 18_100, 1, LINEAR),
        propertyKey('pulse-two-down', 18_500, 0, LINEAR),
      ]),
      propertyTrack('track-posterize-crush', { kind: 'clip-effect', clipId: 'satellite-3-answer', effectId: 'answer-posterize-3', effectKind: 'posterize', parameterId: 'levels' }, 14_000, 6_000, [
        propertyKey('crush-rest', 14_800, 4),
        propertyKey('crush-deep', 16_600, 2),
        propertyKey('crush-recover', 18_400, 4),
      ]),
    ],
    markers: [
      chapter('scene-marker:render', 0, 'One render'),
      chapter('scene-marker:windows', 6_000, 'Quarter windows'),
      chapter('scene-marker:answer', 14_000, 'Answer'),
    ],
  })
}

// 303 demonstrates the delivery cost of a separate TopographicBloom echo
// over ShapeShifter (#848). The echo has its own clock; the artifact inventory
// distinguishes its configured use from compiled code and overlay structure.
function learn303V2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-303-compile-simplify-deliver',
    name: '303 Compile, Simplify, and Deliver',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 16_000,
    patternInstances: [
      instance('garden', 'ShapeShifter', LESSON_TIME_SCALE),
      instance('loom', 'TopographicBloom', LESSON_TIME_SCALE),
      instance('loom-echo', 'TopographicBloom', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1'), overlayLayer('zone-1', 1, 'Bloom echo')],
    clips: [
      clip('clip-loom', 'loom', 'zone-1', mainLayerId('zone-1'), 0, 8_000),
      clip('clip-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 8_000, 8_000),
      clip('clip-echo', 'loom-echo', 'zone-1', overlayLayerId('zone-1', 1), 10_000, 5_500, { opacity: 0 }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 16_000),
    ],
    propertyTracks: [
      propertyTrack('track-echo-opacity', { kind: 'clip-opacity', clipId: 'clip-echo' }, 0, 16_000, [
        propertyKey('echo-arrive', 10_000, 0),
        propertyKey('echo-hold', 12_000, 0.6),
        propertyKey('echo-depart', 14_000, 0.6),
        propertyKey('echo-gone', 15_500, 0),
      ]),
    ],
  })
}

// Effects references are recast from TestPattern2D to real Patterns that
// still diagnose. CompassRose's cardinal points make translation, rotation,
// and address wrap unmistakable; Mandelbrot2D's coastline bends visibly
// under distortion; BlueHolidayCandle2D's flame carries a few clear hues
// that expose every color adjustment. Pacing follows the editor rule: a
// reference beat, one exemplar long enough to study, then quicker cuts.
function transformEffectsShowcaseV2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], 2_000)
  return nativeShowV2({
    id: 'stock-show-showcase-transform-effects',
    name: 'Transform and Address Effects',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 23_000,
    patternInstances: [
      instance('instance-transform-effects', 'TunnelOfSquares2D', 0.35),
      instance('instance-wrap-effect', 'TunnelOfSquares2D', 0.35),
    ],
    layers: [mainLayer('zone-1')],
    clips: [
      clip('clip-affine-effects', 'instance-transform-effects', 'zone-1', mainLayerId('zone-1'), 0, 20_000, { view: { brightness: 0.9 }, effects: [{ id: 'affine-translate', kind: 'translate', x: 0, y: 0 }, { id: 'affine-scale', kind: 'scale', x: 1, y: 1 }, { id: 'affine-rotate', kind: 'rotate', turns: 0 }, { id: 'affine-shear', kind: 'shear', x: 0, y: 0 }] }),
      clip('clip-wrap-effect', 'instance-wrap-effect', 'zone-1', mainLayerId('zone-1'), 20_000, 3_000, { view: { brightness: 0.9 }, effects: [{ id: 'translate', kind: 'translate', x: 0.28, y: 0 }, { id: 'wrap', kind: 'wrap' }] }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 23_000),
    ],
    propertyTracks: [
      propertyTrack('track-effect-2-affine-translate-translateX', { kind: 'clip-effect', clipId: 'clip-affine-effects', effectId: 'affine-translate', effectKind: 'translate', parameterId: 'translateX' }, 3_000, 5_000, [
        propertyKey('track-effect-2-affine-translate-translateX-start', 3_000, 0),
        propertyKey('track-effect-2-affine-translate-translateX-end', 4_000, 0.18, LINEAR),
      ]),
      propertyTrack('track-effect-2-affine-translate-translateY', { kind: 'clip-effect', clipId: 'clip-affine-effects', effectId: 'affine-translate', effectKind: 'translate', parameterId: 'translateY' }, 3_000, 5_000, [
        propertyKey('track-effect-2-affine-translate-translateY-start', 3_000, 0),
        propertyKey('track-effect-2-affine-translate-translateY-end', 4_000, -0.12, LINEAR),
      ]),
      propertyTrack('track-effect-3-affine-scale-scaleX', { kind: 'clip-effect', clipId: 'clip-affine-effects', effectId: 'affine-scale', effectKind: 'scale', parameterId: 'scaleX' }, 8_000, 4_000, [
        propertyKey('track-effect-3-affine-scale-scaleX-start', 8_000, 1),
        propertyKey('track-effect-3-affine-scale-scaleX-end', 9_000, 0.68, LINEAR),
      ]),
      propertyTrack('track-effect-3-affine-scale-scaleY', { kind: 'clip-effect', clipId: 'clip-affine-effects', effectId: 'affine-scale', effectKind: 'scale', parameterId: 'scaleY' }, 8_000, 4_000, [
        propertyKey('track-effect-3-affine-scale-scaleY-start', 8_000, 1),
        propertyKey('track-effect-3-affine-scale-scaleY-end', 9_000, 0.82, LINEAR),
      ]),
      propertyTrack('track-effect-3-affine-translate-translateX', { kind: 'clip-effect', clipId: 'clip-affine-effects', effectId: 'affine-translate', effectKind: 'translate', parameterId: 'translateX' }, 8_000, 4_000, [
        propertyKey('track-effect-3-affine-translate-translateX-start', 8_000, 0.18),
        propertyKey('track-effect-3-affine-translate-translateX-end', 9_000, 0, LINEAR),
      ]),
      propertyTrack('track-effect-3-affine-translate-translateY', { kind: 'clip-effect', clipId: 'clip-affine-effects', effectId: 'affine-translate', effectKind: 'translate', parameterId: 'translateY' }, 8_000, 4_000, [
        propertyKey('track-effect-3-affine-translate-translateY-start', 8_000, -0.12),
        propertyKey('track-effect-3-affine-translate-translateY-end', 9_000, 0, LINEAR),
      ]),
      propertyTrack('track-effect-4-affine-rotate-turns', { kind: 'clip-effect', clipId: 'clip-affine-effects', effectId: 'affine-rotate', effectKind: 'rotate', parameterId: 'turns' }, 12_000, 4_000, [
        propertyKey('track-effect-4-affine-rotate-turns-start', 12_000, 0),
        propertyKey('track-effect-4-affine-rotate-turns-end', 13_000, 0.125, LINEAR),
      ]),
      propertyTrack('track-effect-4-affine-scale-scaleX', { kind: 'clip-effect', clipId: 'clip-affine-effects', effectId: 'affine-scale', effectKind: 'scale', parameterId: 'scaleX' }, 12_000, 4_000, [
        propertyKey('track-effect-4-affine-scale-scaleX-start', 12_000, 0.68),
        propertyKey('track-effect-4-affine-scale-scaleX-end', 13_000, 1, LINEAR),
      ]),
      propertyTrack('track-effect-4-affine-scale-scaleY', { kind: 'clip-effect', clipId: 'clip-affine-effects', effectId: 'affine-scale', effectKind: 'scale', parameterId: 'scaleY' }, 12_000, 4_000, [
        propertyKey('track-effect-4-affine-scale-scaleY-start', 12_000, 0.82),
        propertyKey('track-effect-4-affine-scale-scaleY-end', 13_000, 1, LINEAR),
      ]),
      propertyTrack('track-effect-5-affine-rotate-turns', { kind: 'clip-effect', clipId: 'clip-affine-effects', effectId: 'affine-rotate', effectKind: 'rotate', parameterId: 'turns' }, 16_000, 4_000, [
        propertyKey('track-effect-5-affine-rotate-turns-start', 16_000, 0.125),
        propertyKey('track-effect-5-affine-rotate-turns-end', 17_000, 0, LINEAR),
      ]),
      propertyTrack('track-effect-5-affine-shear-shearX', { kind: 'clip-effect', clipId: 'clip-affine-effects', effectId: 'affine-shear', effectKind: 'shear', parameterId: 'shearX' }, 16_000, 4_000, [
        propertyKey('track-effect-5-affine-shear-shearX-start', 16_000, 0),
        propertyKey('track-effect-5-affine-shear-shearX-end', 17_000, 0.28, LINEAR),
      ]),
    ],
    markers: [
      chapter('scene-marker:effect-1', 0, 'Reference'),
      chapter('scene-marker:effect-2', 3_000, 'Translate'),
      chapter('scene-marker:effect-3', 8_000, 'Scale'),
      chapter('scene-marker:effect-4', 12_000, 'Rotate'),
      chapter('scene-marker:effect-5', 16_000, 'Shear'),
      chapter('scene-marker:effect-6', 20_000, 'Wrap'),
    ],
  })
}

// Distortion sibling of the Effects showcase family; see the note above.
function distortionEffectsShowcaseV2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], 2_000)
  return nativeShowV2({
    id: 'stock-show-showcase-distortion-effects',
    name: 'Distortion Effects',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 17_000,
    patternInstances: [
      instance('instance-distortion-effects', 'Mandelbrot2D', 0.35),
    ],
    layers: [mainLayer('zone-1')],
    clips: [
      clip('clip-distortion-effect-1', 'instance-distortion-effects', 'zone-1', mainLayerId('zone-1'), 0, 3_000, { view: { brightness: 0.9 } }),
      clip('clip-distortion-effect-2', 'instance-distortion-effects', 'zone-1', mainLayerId('zone-1'), 3_000, 4_000, { view: { brightness: 0.9 }, effects: [{ id: 'ripple', kind: 'ripple', amount: 0.32, frequency: 4, phase: 0, centerX: 0.5, centerY: 0.5 }] }),
      clip('clip-distortion-effect-3', 'instance-distortion-effects', 'zone-1', mainLayerId('zone-1'), 7_000, 2_500, { view: { brightness: 0.9 }, effects: [{ id: 'swirl', kind: 'swirl', amount: 0.36, radius: 0.72, centerX: 0.5, centerY: 0.5 }] }),
      clip('clip-distortion-effect-4', 'instance-distortion-effects', 'zone-1', mainLayerId('zone-1'), 9_500, 2_500, { view: { brightness: 0.9 }, effects: [{ id: 'bulge', kind: 'bulge', amount: 0.42, radius: 0.58, centerX: 0.5, centerY: 0.5 }] }),
      clip('clip-distortion-effect-5', 'instance-distortion-effects', 'zone-1', mainLayerId('zone-1'), 12_000, 2_500, { view: { brightness: 0.9 }, effects: [{ id: 'pixelate', kind: 'pixelate', amount: 0.85, columns: 12, rows: 12 }] }),
      clip('clip-distortion-effect-6', 'instance-distortion-effects', 'zone-1', mainLayerId('zone-1'), 14_500, 2_500, { view: { brightness: 0.9 }, effects: [{ id: 'kaleidoscope', kind: 'kaleidoscope', amount: 1, segments: 6, rotation: 0, centerX: 0.5, centerY: 0.5 }] }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 17_000),
    ],
    markers: [
      chapter('scene-marker:effect-1', 0, 'Reference'),
      chapter('scene-marker:effect-2', 3_000, 'Ripple'),
      chapter('scene-marker:effect-3', 7_000, 'Swirl'),
      chapter('scene-marker:effect-4', 9_500, 'Bulge'),
      chapter('scene-marker:effect-5', 12_000, 'Pixelate'),
      chapter('scene-marker:effect-6', 14_500, 'Kaleidoscope'),
    ],
  })
}

// Color-adjustment sibling of the Effects showcase family; see the note above.
function colorAdjustmentEffectsShowcaseV2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], 2_000)
  return nativeShowV2({
    id: 'stock-show-showcase-color-adjustment-effects',
    name: 'Color Adjustment Effects',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 22_000,
    patternInstances: [
      instance('instance-color-adjustment-effects', 'BlueHolidayCandle2D', 0.35),
    ],
    layers: [mainLayer('zone-1')],
    clips: [
      clip('clip-color-adjustment-effect-1', 'instance-color-adjustment-effects', 'zone-1', mainLayerId('zone-1'), 0, 4_000, { view: { brightness: 0.9 } }),
      clip('clip-color-adjustment-effect-2', 'instance-color-adjustment-effects', 'zone-1', mainLayerId('zone-1'), 4_000, 2_000, { view: { brightness: 0.9 }, effects: [{ id: 'brightness', kind: 'brightness', brightness: 0.45 }] }),
      clip('clip-color-adjustment-effect-3', 'instance-color-adjustment-effects', 'zone-1', mainLayerId('zone-1'), 6_000, 2_000, { view: { brightness: 0.9 }, effects: [{ id: 'opacity', kind: 'opacity', opacity: 0.45 }] }),
      clip('clip-color-adjustment-effect-4', 'instance-color-adjustment-effects', 'zone-1', mainLayerId('zone-1'), 8_000, 2_000, { view: { brightness: 0.9 }, effects: [{ id: 'hue', kind: 'hue', turns: 0.25 }] }),
      clip('clip-color-adjustment-effect-5', 'instance-color-adjustment-effects', 'zone-1', mainLayerId('zone-1'), 10_000, 2_000, { view: { brightness: 0.9 }, effects: [{ id: 'saturation', kind: 'saturation', saturation: 0.25 }] }),
      clip('clip-color-adjustment-effect-6', 'instance-color-adjustment-effects', 'zone-1', mainLayerId('zone-1'), 12_000, 2_000, { view: { brightness: 0.9 }, effects: [{ id: 'contrast', kind: 'contrast', contrast: 0.72 }] }),
      clip('clip-color-adjustment-effect-7', 'instance-color-adjustment-effects', 'zone-1', mainLayerId('zone-1'), 14_000, 2_000, { view: { brightness: 0.9 }, effects: [{ id: 'invert', kind: 'invert', amount: 1 }] }),
      clip('clip-color-adjustment-effect-8', 'instance-color-adjustment-effects', 'zone-1', mainLayerId('zone-1'), 16_000, 2_000, { view: { brightness: 0.9 }, effects: [{ id: 'threshold', kind: 'threshold', threshold: 0.52, amount: 1 }] }),
      clip('clip-color-adjustment-effect-9', 'instance-color-adjustment-effects', 'zone-1', mainLayerId('zone-1'), 18_000, 2_000, { view: { brightness: 0.9 }, effects: [{ id: 'posterize', kind: 'posterize', levels: 4, amount: 1 }] }),
      clip('clip-color-adjustment-effect-10', 'instance-color-adjustment-effects', 'zone-1', mainLayerId('zone-1'), 20_000, 2_000, { view: { brightness: 0.9 }, effects: [{ id: 'color-map', kind: 'color-map', amount: 1, shadowR: 0.0745, shadowG: 0.0471, shadowB: 0.1686, highlightR: 0.3098, highlightG: 1, highlightB: 0.8824 }] }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 22_000),
    ],
    markers: [
      chapter('scene-marker:effect-1', 0, 'Reference'),
      chapter('scene-marker:effect-2', 4_000, 'Brightness'),
      chapter('scene-marker:effect-3', 6_000, 'Opacity'),
      chapter('scene-marker:effect-4', 8_000, 'Hue'),
      chapter('scene-marker:effect-5', 10_000, 'Saturation'),
      chapter('scene-marker:effect-6', 12_000, 'Contrast'),
      chapter('scene-marker:effect-7', 14_000, 'Invert'),
      chapter('scene-marker:effect-8', 16_000, 'Threshold'),
      chapter('scene-marker:effect-9', 18_000, 'Posterize'),
      chapter('scene-marker:effect-10', 20_000, 'Color map'),
    ],
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
function compositingKeyShowcaseV2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], 2_000)
  return nativeShowV2({
    id: 'stock-show-showcase-compositing-key-effects',
    name: 'Compositing and Key Effects',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 27_500,
    patternInstances: [
      instance('composite-bed', 'IQPalettes', 0.2),
      instance('composite-rings', 'LumaRings', 1),
      instance('composite-rings-crisp', 'LumaRings', 1, { sliderFeather: 0.6, sliderWidth: 0.3 }),
      instance('composite-fire', 'DoomFireV20_2D', 1, { sliderFlameHeight: 0.85, sliderSpeed: 0.7 }),
      instance('composite-waves', 'LumaStripes', 1, { sliderFeather: 1, sliderAngle: 0, sliderSpacing: 0.3, sliderWidth: 0.5, sliderLoopInterval: 0.3 }),
    ],
    layers: [mainLayer('zone-1'), overlayLayer('zone-1', 1, 'Keyed waves'), overlayLayer('zone-1', 2, 'Subject')],
    clips: [
      clip('bed-1', 'composite-bed', 'zone-1', mainLayerId('zone-1'), 0, 3_000, { view: { brightness: 0.4 } }),
      clip('subject-1', 'composite-rings', 'zone-1', overlayLayerId('zone-1', 2), 0, 3_000),
      clip('bed-2', 'composite-bed', 'zone-1', mainLayerId('zone-1'), 3_000, 3_000, { view: { brightness: 0.4 } }),
      clip('subject-2', 'composite-rings', 'zone-1', overlayLayerId('zone-1', 2), 3_000, 3_000, { opacity: 0.34 }),
      clip('bed-3', 'composite-bed', 'zone-1', mainLayerId('zone-1'), 6_000, 3_000, { view: { brightness: 0.4 } }),
      clip('subject-3', 'composite-rings', 'zone-1', overlayLayerId('zone-1', 2), 6_000, 3_000),
      clip('bed-4', 'composite-bed', 'zone-1', mainLayerId('zone-1'), 9_000, 3_500, { view: { brightness: 0.4 } }),
      clip('subject-4', 'composite-rings', 'zone-1', overlayLayerId('zone-1', 2), 9_000, 3_500, { effects: [{ id: 'luma-key', kind: 'luma-key', target: 0, tolerance: 0.05, softness: 0.35 }] }),
      clip('bed-5', 'composite-bed', 'zone-1', mainLayerId('zone-1'), 12_500, 3_500, { view: { brightness: 0.4 } }),
      clip('subject-5', 'composite-fire', 'zone-1', overlayLayerId('zone-1', 2), 12_500, 3_500, { effects: [{ id: 'chroma-key', kind: 'chroma-key', color: '#ff8800', tolerance: 0.28, softness: 0.15 }] }),
      clip('bed-6', 'composite-bed', 'zone-1', mainLayerId('zone-1'), 16_000, 3_000, { view: { brightness: 0.4 }, effects: [{ id: 'vignette-bed', kind: 'vignette', amount: 1, radius: 0.3, softness: 0.25, centerX: 0.5, centerY: 0.5, aspect: 1 }] }),
      clip('subject-6', 'composite-waves', 'zone-1', overlayLayerId('zone-1', 2), 16_000, 3_000, { effects: [{ id: 'luma-key', kind: 'luma-key', target: 0, tolerance: 0.05, softness: 0.4 }, { id: 'vignette', kind: 'vignette', amount: 1, radius: 0.3, softness: 0.25, centerX: 0.5, centerY: 0.5, aspect: 1 }] }),
      clip('bed-7', 'composite-bed', 'zone-1', mainLayerId('zone-1'), 19_000, 5_000, { view: { brightness: 0.4 } }),
      clip('subject-7', 'composite-waves', 'zone-1', overlayLayerId('zone-1', 2), 19_000, 5_000, { effects: [{ id: 'luma-key', kind: 'luma-key', target: 0, tolerance: 0.05, softness: 0.4 }] }),
      clip('bed-8', 'composite-bed', 'zone-1', mainLayerId('zone-1'), 24_000, 3_500, { view: { brightness: 0.4 } }),
      clip('middle-8', 'composite-waves', 'zone-1', overlayLayerId('zone-1', 1), 24_000, 3_500, { effects: [{ id: 'luma-key', kind: 'luma-key', target: 0, tolerance: 0.05, softness: 0.4 }] }),
      clip('subject-8', 'composite-rings-crisp', 'zone-1', overlayLayerId('zone-1', 2), 24_000, 3_500, { effects: [{ id: 'luma-key', kind: 'luma-key', target: 0, tolerance: 0.05, softness: 0.35 }] }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 27_500),
    ],
    propertyTracks: [
      propertyTrack('track-fade-3', { kind: 'clip-opacity', clipId: 'subject-3' }, 6_000, 3_000, [
        propertyKey('fade-hold-3', 6_600, 1),
        propertyKey('fade-out-3', 8_600, 0.05),
      ]),
      propertyTrack('track-angle-7', { kind: 'instance-control', instanceId: 'composite-waves', exportName: 'sliderAngle' }, 19_000, 5_000, [
        propertyKey('angle-start-7', 19_000, 0, LINEAR),
        propertyKey('angle-turn-7', 24_000, 0.5, LINEAR),
      ]),
      propertyTrack('track-spacing-7', { kind: 'instance-control', instanceId: 'composite-waves', exportName: 'sliderSpacing' }, 19_000, 5_000, [
        propertyKey('spacing-a-7', 19_000, 0.3),
        propertyKey('spacing-b-7', 20_250, 0.55),
        propertyKey('spacing-c-7', 21_500, 0.3),
        propertyKey('spacing-d-7', 22_750, 0.55),
        propertyKey('spacing-e-7', 24_000, 0.3),
      ]),
      propertyTrack('track-width-7', { kind: 'instance-control', instanceId: 'composite-waves', exportName: 'sliderWidth' }, 19_000, 5_000, [
        propertyKey('width-a-7', 19_000, 0.5),
        propertyKey('width-b-7', 20_250, 0.68),
        propertyKey('width-c-7', 21_500, 0.5),
        propertyKey('width-d-7', 22_750, 0.68),
        propertyKey('width-e-7', 24_000, 0.5),
      ]),
    ],
    markers: [
      chapter('scene-marker:composite-1', 0, 'Reference'),
      chapter('scene-marker:composite-2', 3_000, 'Layer Opacity'),
      chapter('scene-marker:composite-3', 6_000, 'Animated Opacity'),
      chapter('scene-marker:composite-4', 9_000, 'Luma Key'),
      chapter('scene-marker:composite-5', 12_500, 'Chroma Key'),
      chapter('scene-marker:composite-6', 16_000, 'Vignette'),
      chapter('scene-marker:composite-7', 19_000, 'Animated Angle'),
      chapter('scene-marker:composite-8', 24_000, 'Layered'),
    ],
  })
}

// The Luma family (#819) as an inventory with pace (#822): one beat per
// member, bare for the first half, then a single animated property chosen
// for that member's character. Family controls are favored over generic
// clip transforms - Lean, Fold, Spacing, and pace are what make these
// Patterns different - and every animation is an ordinary Property track.
function lumaSourcesShowcaseV2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], 2_000)
  return nativeShowV2({
    id: 'stock-show-showcase-luma-sources',
    name: 'Luma Sources',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 32_000,
    patternInstances: [
      instance('luma-Stripes', 'LumaStripes', 1, { sliderWidth: 0.4 }),
      instance('luma-SineWaves', 'LumaStripes', 1, { sliderFeather: 1, sliderSpacing: 0.35, sliderLean: 0.5 }),
      instance('luma-Chevron', 'LumaChevron', 1, { sliderFold: 0.25 }),
      instance('luma-Rings', 'LumaRings', 1, { sliderSpacing: 0.5 }),
      instance('luma-Pinwheel', 'LumaPinwheel', 1),
      instance('luma-Dots', 'LumaDots', 1),
      instance('luma-Weave', 'LumaWeave', 0.6),
      instance('luma-Spiral', 'LumaSpiral', 1),
    ],
    layers: [mainLayer('zone-1')],
    clips: [
      clip('luma-clip-1', 'luma-Stripes', 'zone-1', mainLayerId('zone-1'), 0, 4_000),
      clip('luma-clip-2', 'luma-SineWaves', 'zone-1', mainLayerId('zone-1'), 4_000, 4_000),
      clip('luma-clip-3', 'luma-Chevron', 'zone-1', mainLayerId('zone-1'), 8_000, 4_000),
      clip('luma-clip-4', 'luma-Rings', 'zone-1', mainLayerId('zone-1'), 12_000, 4_000),
      clip('luma-clip-5', 'luma-Pinwheel', 'zone-1', mainLayerId('zone-1'), 16_000, 4_000),
      clip('luma-clip-6', 'luma-Dots', 'zone-1', mainLayerId('zone-1'), 20_000, 4_000),
      clip('luma-clip-7', 'luma-Weave', 'zone-1', mainLayerId('zone-1'), 24_000, 4_000),
      clip('luma-clip-8', 'luma-Spiral', 'zone-1', mainLayerId('zone-1'), 28_000, 4_000),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 32_000),
    ],
    propertyTracks: [
      propertyTrack('track-luma-1-0', { kind: 'instance-control', instanceId: 'luma-Stripes', exportName: 'sliderWidth' }, 0, 4_000, [
        propertyKey('kf-1-0-0', 2_000, 0.4),
        propertyKey('kf-1-0-1', 4_000, 0.85),
      ]),
      propertyTrack('track-luma-2-0', { kind: 'instance-control', instanceId: 'luma-SineWaves', exportName: 'sliderLean' }, 4_000, 4_000, [
        propertyKey('kf-2-0-0', 6_000, 0.5),
        propertyKey('kf-2-0-1', 8_000, 1),
      ]),
      propertyTrack('track-luma-3-0', { kind: 'instance-control', instanceId: 'luma-Chevron', exportName: 'sliderFold' }, 8_000, 4_000, [
        propertyKey('kf-3-0-0', 10_000, 0.25),
        propertyKey('kf-3-0-1', 12_000, 0.9),
      ]),
      propertyTrack('track-luma-4-0', { kind: 'instance-control', instanceId: 'luma-Rings', exportName: 'sliderSpacing' }, 12_000, 4_000, [
        propertyKey('kf-4-0-0', 14_000, 0.5),
        propertyKey('kf-4-0-1', 15_000, 0.2),
        propertyKey('kf-4-0-2', 16_000, 0.6),
      ]),
      propertyTrack('track-luma-5-0', { kind: 'clip-transform', clipId: 'luma-clip-5', property: 'positionX' }, 16_000, 4_000, [
        propertyKey('kf-5-0-0', 18_000, 0),
        propertyKey('kf-5-0-1', 20_000, 0.35),
      ]),
      propertyTrack('track-luma-6-0', { kind: 'clip-transform', clipId: 'luma-clip-6', property: 'rotation' }, 20_000, 4_000, [
        propertyKey('kf-6-0-0', 22_000, 0),
        propertyKey('kf-6-0-1', 24_000, 0.25),
      ]),
      propertyTrack('track-luma-7-0', { kind: 'instance-time-scale', instanceId: 'luma-Weave' }, 24_000, 4_000, [
        propertyKey('kf-7-0-0', 26_000, 0.6),
        propertyKey('kf-7-0-1', 28_000, 2.5),
      ]),
      propertyTrack('track-luma-8-0', { kind: 'clip-transform', clipId: 'luma-clip-8', property: 'scaleX' }, 28_000, 4_000, [
        propertyKey('kf-8-0-0', 30_000, 1),
        propertyKey('kf-8-0-1', 32_000, 1.9),
      ]),
      propertyTrack('track-luma-8-1', { kind: 'clip-transform', clipId: 'luma-clip-8', property: 'scaleY' }, 28_000, 4_000, [
        propertyKey('kf-8-1-0', 30_000, 1),
        propertyKey('kf-8-1-1', 32_000, 1.9),
      ]),
    ],
    markers: [
      chapter('scene-marker:luma-1', 0, 'Stripes'),
      chapter('scene-marker:luma-2', 4_000, 'Sine Waves'),
      chapter('scene-marker:luma-3', 8_000, 'Chevron'),
      chapter('scene-marker:luma-4', 12_000, 'Rings'),
      chapter('scene-marker:luma-5', 16_000, 'Pinwheel'),
      chapter('scene-marker:luma-6', 20_000, 'Dots'),
      chapter('scene-marker:luma-7', 24_000, 'Weave'),
      chapter('scene-marker:luma-8', 28_000, 'Spiral'),
    ],
  })
}

/** One passage of a Transition reference: a Clip, and the junction after it. */
interface TransitionReferenceSpecV2 {
  /** Chapter name for the passage this Clip opens. */
  label: string
  /** How long this Clip holds before its junction. */
  holdMs: number
  /**
   * The junction after this Clip, merged over `junctionDefaults`. Omitting it
   * is a Cut: the next Clip starts exactly where this one ends, and no
   * Transition record exists to carry settings.
   */
  junction?: Partial<TransitionReferenceJunctionV2>
}

interface TransitionReferenceJunctionV2 {
  kind: ShowTransitionV2['kind']
  durationMs: number
  easing: ShowStructuredEasing
  settings: Record<string, unknown>
}

/**
 * The shared shape of every Transition reference Show. One Zone, one Layer, two
 * Pattern instances alternating so each junction exchanges one world for
 * another, and one chapter per passage. Timing is derived, never authored
 * twice: each Clip starts where the previous junction finishes, and Show End is
 * the last Clip's end.
 */
function transitionReferenceShowV2(input: {
  id: string
  name: string
  referencePattern: string
  selectedPattern: string
  junctionDefaults?: Partial<TransitionReferenceJunctionV2>
  specs: readonly TransitionReferenceSpecV2[]
}): ShowRecordV2 {
  const zones = logicalZones(['Main'], 2_000)
  const starts: number[] = []
  let running = 0
  for (const spec of input.specs) {
    starts.push(running)
    running += spec.holdMs + (spec.junction ? { ...input.junctionDefaults, ...spec.junction }.durationMs ?? 0 : 0)
  }
  const clipId = (position: number) => `placement-reference-content-${position + 1}`
  return nativeShowV2({
    id: input.id,
    name: input.name,
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: starts[starts.length - 1] + input.specs[input.specs.length - 1].holdMs,
    patternInstances: [
      instance('instance-reference-content-reference', input.referencePattern, LESSON_TIME_SCALE),
      instance('instance-reference-content-selected', input.selectedPattern, LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1')],
    clips: input.specs.map((spec, position) => clip(
      clipId(position),
      position % 2 === 0 ? 'instance-reference-content-reference' : 'instance-reference-content-selected',
      'zone-1', mainLayerId('zone-1'), starts[position], spec.holdMs,
    )),
    transitions: input.specs.flatMap((spec, position) => {
      if (!spec.junction) return []
      const junction = { ...input.junctionDefaults, ...spec.junction }
      if (junction.kind === undefined || junction.durationMs === undefined) {
        throw new Error(`Transition reference "${input.id}" junction ${position + 1} has no kind or duration.`)
      }
      return [layerTransition(
        `transition-reference-${position + 1}`, junction.kind, 'zone-1', mainLayerId('zone-1'),
        clipId(position), clipId(position + 1), junction.durationMs,
        junction.easing ?? SINE_IN_OUT, junction.settings ?? {},
      )]
    }),
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, starts[starts.length - 1] + input.specs[input.specs.length - 1].holdMs),
    ],
    markers: input.specs.map((spec, position) => (
      chapter(`scene-marker:reference-${position + 1}`, starts[position], spec.label)
    )),
  })
}

// Every Transition reference shares the measured diagnostic pair. Probed on
// the 44x44 plane at the 0.32 clock, MetaballGarden (green, lum 0.45, flux
// 0.013/200ms) and IQPalettes (warm, lum 0.41, flux 0.016) are the two
// calmest equally-bright fields with the widest sustained hue contrast, so
// every boundary reads as one world replacing another and neither side ever
// looks dead. Several references recast the pair by eye (#63). Pacing
// follows the packet's editor rule: one slow exemplar per family, then
// quick cuts of its siblings.
function blendAndFadeTransitionReferenceV2(): ShowRecordV2 {
  return transitionReferenceShowV2({
    id: 'stock-show-reference-blend-fade-transitions',
    name: 'Blend and Fade Transitions',
    referencePattern: 'MetaballsOfFire2D',
    selectedPattern: 'MetaballGarden',
    junctionDefaults: { easing: SINE_IN_OUT },
    specs: [
      { label: 'Reference', holdMs: 3_000 },
      { label: 'Cut', holdMs: 3_000, junction: { kind: 'crossfade', durationMs: 2_500, settings: { crossfadePolicy: 'snapshot-live' } } },
      { label: 'Crossfade', holdMs: 4_000, junction: { kind: 'fade-color', durationMs: 2_000, settings: { color: '#000000' } } },
      { label: 'Fade through black', holdMs: 2_000, junction: { kind: 'fade-color', durationMs: 2_000, settings: { color: '#ffffff' } } },
      { label: 'Fade through white', holdMs: 2_000 },
    ],
  })
}

// Wipe sibling of the Transition reference family; see the diagnostic-pair note above.
function wipeTransitionReferenceV2(): ShowRecordV2 {
  return transitionReferenceShowV2({
    id: 'stock-show-reference-wipe-transitions',
    name: 'Wipes',
    referencePattern: 'InfinityFlower2D',
    selectedPattern: 'MetaballGarden',
    junctionDefaults: { kind: 'wipe', easing: SINE_IN_OUT },
    specs: [
      { label: 'Reference', holdMs: 3_000, junction: { durationMs: 2_500, settings: { feather: 0, wipeVariant: 'linear', direction: 0, edgePolicy: 'hard' } } },
      { label: 'Linear wipe east', holdMs: 3_000, junction: { durationMs: 1_000, settings: { feather: 0, wipeVariant: 'linear', direction: 0.25, edgePolicy: 'hard' } } },
      { label: 'Linear wipe south', holdMs: 1_500, junction: { durationMs: 1_000, settings: { feather: 0, wipeVariant: 'linear', direction: 0.5, edgePolicy: 'hard' } } },
      { label: 'Linear wipe west', holdMs: 1_500, junction: { durationMs: 1_000, settings: { feather: 0, wipeVariant: 'linear', direction: 0.75, edgePolicy: 'hard' } } },
      { label: 'Linear wipe north', holdMs: 1_500, junction: { durationMs: 1_000, settings: { feather: 0, wipeVariant: 'split', wipeMode: 'center-out', orientation: 'vertical', edgePolicy: 'hard' } } },
      { label: 'Split center out', holdMs: 1_500, junction: { durationMs: 1_000, settings: { feather: 0, wipeVariant: 'barn-doors', wipeMode: 'center-out', centerX: 0.5, centerY: 0.5, edgePolicy: 'hard' } } },
      { label: 'Barn doors out', holdMs: 1_500, junction: { durationMs: 1_000, settings: { feather: 0, wipeVariant: 'blinds', orientation: 'vertical', count: 8, phase: 0, edgePolicy: 'hard' } } },
      { label: 'Vertical blinds', holdMs: 1_500, junction: { durationMs: 1_000, settings: { feather: 0, wipeVariant: 'clock', centerX: 0.5, centerY: 0.5, phase: 0, clockwise: true, edgePolicy: 'hard' } } },
      { label: 'Clock clockwise', holdMs: 1_500, junction: { durationMs: 1_000, settings: { feather: 0, wipeVariant: 'checker', count: 8, edgePolicy: 'hard' } } },
      { label: 'Checker', holdMs: 1_500, junction: { durationMs: 1_000, settings: { feather: 0, wipeVariant: 'grid', count: 8, edgePolicy: 'hard' } } },
      { label: 'Grid', holdMs: 1_500 },
    ],
  })
}

// Dissolve sibling of the Transition reference family; see the diagnostic-pair note above.
function dissolveTransitionReferenceV2(): ShowRecordV2 {
  return transitionReferenceShowV2({
    id: 'stock-show-reference-dissolve-transitions',
    name: 'Dissolves',
    referencePattern: 'WavyBands',
    selectedPattern: 'GeometryMorphingDemo2D',
    junctionDefaults: { kind: 'dither', easing: SINE_IN_OUT },
    specs: [
      { label: 'Reference', holdMs: 3_000, junction: { durationMs: 2_500, settings: { dissolveVariant: 'pixel', seed: 0, edgePolicy: 'dither' } } },
      { label: 'Pixel dissolve', holdMs: 3_000, junction: { durationMs: 1_500, settings: { dissolveVariant: 'block', seed: 0, blockSize: 8, edgePolicy: 'dither' } } },
      { label: 'Block dissolve', holdMs: 2_000, junction: { durationMs: 1_500, settings: { dissolveVariant: 'coherent-noise', seed: 0, scale: 6, edgePolicy: 'hard' } } },
      { label: 'Coherent-noise dissolve', holdMs: 2_000, junction: { durationMs: 1_500, settings: { dissolveVariant: 'soft-threshold', seed: 0, scale: 6, softness: 0.15, edgePolicy: 'dither' } } },
      { label: 'Soft-threshold dissolve', holdMs: 2_000 },
    ],
  })
}

// Geometric Shape Reveal sibling of the Transition reference family.
function shapeRevealGeometricReferenceV2(): ShowRecordV2 {
  return transitionReferenceShowV2({
    id: 'stock-show-reference-shape-reveal-transitions',
    name: 'Shape Reveals: Geometric',
    referencePattern: 'IridescentFibers',
    selectedPattern: 'MagneticFilaments',
    junctionDefaults: { kind: 'portal', easing: SINE_IN_OUT },
    specs: [
      { label: 'Reference', holdMs: 3_000, junction: { durationMs: 2_500, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'grow-incoming', edgePolicy: 'dither', shape: 'circle', scale: 1, aspect: 1, rotation: 0 } } },
      { label: 'Circle: grow incoming', holdMs: 3_000, junction: { durationMs: 1_200, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'shrink-outgoing', edgePolicy: 'dither', shape: 'circle', scale: 1, aspect: 1, rotation: 0 } } },
      { label: 'Circle: shrink outgoing', holdMs: 1_500, junction: { durationMs: 1_200, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'grow-incoming', edgePolicy: 'dither', shape: 'ellipse', scale: 1, aspect: 1.5, rotation: 0 } } },
      { label: 'Ellipse: grow incoming', holdMs: 1_500, junction: { durationMs: 1_200, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'shrink-outgoing', edgePolicy: 'dither', shape: 'box', scale: 1, aspect: 1, rotation: 0 } } },
      { label: 'Box: shrink outgoing', holdMs: 1_500, junction: { durationMs: 1_200, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'grow-incoming', edgePolicy: 'dither', shape: 'rounded-box', scale: 1, aspect: 1, rotation: 0, cornerRadius: 0.3 } } },
      { label: 'Rounded box: grow incoming', holdMs: 1_500, junction: { durationMs: 1_200, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'shrink-outgoing', edgePolicy: 'dither', shape: 'diamond', scale: 1, rotation: 0, spin: 0 } } },
      { label: 'Diamond: shrink outgoing', holdMs: 1_500, junction: { durationMs: 1_200, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'grow-incoming', edgePolicy: 'dither', shape: 'cross', scale: 1, aspect: 1, rotation: 0, crossWidth: 0.32 } } },
      { label: 'Cross: grow incoming', holdMs: 1_500 },
    ],
  })
}

// Figure Shape Reveal sibling of the Transition reference family.
function shapeRevealFigureReferenceV2(): ShowRecordV2 {
  return transitionReferenceShowV2({
    id: 'stock-show-reference-shape-reveal-figures',
    name: 'Shape Reveals: Figures',
    referencePattern: 'MetaballsOfFire2D',
    selectedPattern: 'GlyphRain',
    junctionDefaults: { kind: 'portal', easing: SINE_IN_OUT },
    specs: [
      { label: 'Reference', holdMs: 3_000, junction: { durationMs: 3_750, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'shrink-outgoing', edgePolicy: 'dither', shape: 'heart', scale: 1, aspect: 1, rotation: 0 } } },
      { label: 'Heart: shrink outgoing', holdMs: 2_000, junction: { durationMs: 3_600, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'grow-incoming', edgePolicy: 'dither', shape: 'heart', scale: 1, aspect: 1, rotation: 0 } } },
      { label: 'Heart: grow incoming', holdMs: 1_000, junction: { durationMs: 3_600, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'shrink-outgoing', edgePolicy: 'dither', shape: 'ring', scale: 1, ringWidth: 0.12 } } },
      { label: 'Ring: shrink outgoing', holdMs: 1_000, junction: { durationMs: 3_600, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'grow-incoming', edgePolicy: 'dither', shape: 'ring', scale: 1, ringWidth: 0.12 } } },
      { label: 'Ring: grow incoming', holdMs: 1_000, junction: { durationMs: 3_600, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'shrink-outgoing', edgePolicy: 'dither', shape: 'star', scale: 1, aspect: 1, rotation: 0, starPoints: 5, starInner: 0.38 } } },
      { label: 'Star: shrink outgoing', holdMs: 1_000, junction: { durationMs: 3_600, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'grow-incoming', edgePolicy: 'dither', shape: 'star', scale: 1, aspect: 1, rotation: 0, starPoints: 5, starInner: 0.38 } } },
      { label: 'Star: grow incoming', holdMs: 1_000, junction: { durationMs: 3_600, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'shrink-outgoing', edgePolicy: 'dither', shape: 'crescent', scale: 1, aspect: 1, rotation: 0, crescentOffset: 0.45 } } },
      { label: 'Crescent: shrink outgoing', holdMs: 1_000, junction: { durationMs: 3_600, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'grow-incoming', edgePolicy: 'dither', shape: 'crescent', scale: 1, aspect: 1, rotation: 0, crescentOffset: 0.45 } } },
      { label: 'Crescent: grow incoming', holdMs: 1_000, junction: { durationMs: 3_600, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'shrink-outgoing', edgePolicy: 'dither', shape: 'polygon', scale: 1, aspect: 1, rotation: 0, polygonSides: 6 } } },
      { label: 'Regular polygon: shrink outgoing', holdMs: 1_000, junction: { durationMs: 3_600, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'grow-incoming', edgePolicy: 'dither', shape: 'polygon', scale: 1, aspect: 1, rotation: 0, polygonSides: 6 } } },
      { label: 'Regular polygon: grow incoming', holdMs: 1_000, junction: { durationMs: 3_600, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'shrink-outgoing', edgePolicy: 'dither', shape: 'cat-head', scale: 1, aspect: 1, rotation: 0 } } },
      { label: 'Cat head: shrink outgoing', holdMs: 1_000, junction: { durationMs: 3_600, settings: { feather: 0, centerX: 0.5, centerY: 0.5, featherPolicy: 'dither', revealMode: 'grow-incoming', edgePolicy: 'dither', shape: 'cat-head', scale: 1, aspect: 1, rotation: 0 } } },
      { label: 'Cat head: grow incoming', holdMs: 1_000 },
    ],
  })
}

// Slide sibling of the Transition reference family.
function slideTransitionReferenceV2(): ShowRecordV2 {
  return transitionReferenceShowV2({
    id: 'stock-show-reference-slide-transitions',
    name: 'Slide Transitions',
    referencePattern: 'ClockworkIris',
    selectedPattern: 'CompassRose',
    junctionDefaults: { kind: 'motion', easing: SINE_IN_OUT },
    specs: [
      { label: 'Reference', holdMs: 3_000, junction: { durationMs: 2_500, settings: { motionVariant: 'cover', direction: 0, anchorX: 0.5, anchorY: 0.5, contentScale: 0.01, rotation: 0, spinDirection: 'clockwise', addressPolicy: 'clip', edgePolicy: 'hard' } } },
      { label: 'Cover east', holdMs: 3_000, junction: { durationMs: 1_500, settings: { motionVariant: 'reveal', direction: 0, anchorX: 0.5, anchorY: 0.5, contentScale: 0.01, rotation: 0, spinDirection: 'clockwise', addressPolicy: 'clip', edgePolicy: 'hard' } } },
      { label: 'Reveal east', holdMs: 2_000, junction: { durationMs: 1_500, settings: { motionVariant: 'push', direction: 0, anchorX: 0.5, anchorY: 0.5, contentScale: 0.01, rotation: 0, spinDirection: 'clockwise', addressPolicy: 'clip', edgePolicy: 'hard' } } },
      { label: 'Push east', holdMs: 2_000, junction: { durationMs: 1_000, settings: { motionVariant: 'cover', direction: 0.25, anchorX: 0.5, anchorY: 0.5, contentScale: 0.01, rotation: 0, spinDirection: 'clockwise', addressPolicy: 'clip', edgePolicy: 'hard' } } },
      { label: 'Cover south', holdMs: 1_500, junction: { durationMs: 1_000, settings: { motionVariant: 'cover', direction: 0.5, anchorX: 0.5, anchorY: 0.5, contentScale: 0.01, rotation: 0, spinDirection: 'clockwise', addressPolicy: 'clip', edgePolicy: 'hard' } } },
      { label: 'Cover west', holdMs: 1_500, junction: { durationMs: 1_000, settings: { motionVariant: 'cover', direction: 0.75, anchorX: 0.5, anchorY: 0.5, contentScale: 0.01, rotation: 0, spinDirection: 'clockwise', addressPolicy: 'clip', edgePolicy: 'hard' } } },
      { label: 'Cover north', holdMs: 1_500 },
    ],
  })
}

// Zoom and spin sibling of the Transition reference family.
function zoomSpinTransitionReferenceV2(): ShowRecordV2 {
  return transitionReferenceShowV2({
    id: 'stock-show-reference-zoom-spin-transitions',
    name: 'Zoom and Spin Transitions',
    referencePattern: 'Caustics',
    selectedPattern: 'GlyphRain',
    junctionDefaults: { kind: 'motion', easing: SINE_IN_OUT },
    specs: [
      { label: 'Reference', holdMs: 3_000, junction: { durationMs: 2_500, settings: { motionVariant: 'content-grow', direction: 0, anchorX: 0.5, anchorY: 0.5, contentScale: 0.01, rotation: 0, spinDirection: 'clockwise', addressPolicy: 'clip', edgePolicy: 'hard' } } },
      { label: 'Content grow', holdMs: 3_000, junction: { durationMs: 1_200, settings: { motionVariant: 'content-shrink', direction: 0, anchorX: 0.5, anchorY: 0.5, contentScale: 0.01, rotation: 0, spinDirection: 'clockwise', addressPolicy: 'clip', edgePolicy: 'hard' } } },
      { label: 'Content shrink', holdMs: 1_500, junction: { durationMs: 1_200, settings: { motionVariant: 'zoom-in', direction: 0, anchorX: 0.5, anchorY: 0.5, contentScale: 0.2, rotation: 0, spinDirection: 'clockwise', addressPolicy: 'clip', edgePolicy: 'hard' } } },
      { label: 'Zoom in', holdMs: 1_500, junction: { durationMs: 1_200, settings: { motionVariant: 'zoom-out', direction: 0, anchorX: 0.5, anchorY: 0.5, contentScale: 0.2, rotation: 0, spinDirection: 'clockwise', addressPolicy: 'clip', edgePolicy: 'hard' } } },
      { label: 'Zoom out', holdMs: 1_500, junction: { durationMs: 1_200, settings: { motionVariant: 'zoom-in', direction: 0, anchorX: 0.5, anchorY: 0.5, contentScale: 0.01, rotation: 1, spinDirection: 'clockwise', addressPolicy: 'clip', edgePolicy: 'hard' } } },
      { label: 'Spin in clockwise', holdMs: 1_500, junction: { durationMs: 1_200, settings: { motionVariant: 'zoom-in', direction: 0, anchorX: 0.5, anchorY: 0.5, contentScale: 0.01, rotation: 1, spinDirection: 'counterclockwise', addressPolicy: 'clip', edgePolicy: 'hard' } } },
      { label: 'Spin in counterclockwise', holdMs: 1_500, junction: { durationMs: 1_200, settings: { motionVariant: 'zoom-in', direction: 0, anchorX: 0.35, anchorY: 0.65, contentScale: 0.25, rotation: 0.5, spinDirection: 'clockwise', addressPolicy: 'clip', edgePolicy: 'hard' } } },
      { label: 'Zoom and spin clockwise', holdMs: 1_500 },
    ],
  })
}

// One passage per animated Property target, plus the two boundary-owned scalar
// ramps: the split-position and repeat-scale carriers a whole-output Transition
// owns rather than a Clip.
function propertyAnimationReferenceV2(): ShowRecordV2 {
  const zones = logicalZones(['A', 'B'], 2_000)
  return nativeShowV2({
    id: 'stock-show-reference-property-animation',
    name: 'Property Animation',
    zones,
    zoneLayouts: [splitLayout('layout-property-split', 'Property split', zones, 'x')],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 48_600,
    patternInstances: [
      instance('instance-property-subject', 'LineDancer2D', 0.2, { sliderSpeed: 0.02 }),
      instance('instance-property-subject-speed', 'LineDancer2D', 0.2, { sliderSpeed: 0.02 }),
      instance('instance-property-comparison-speed', 'LineDancer2D', 0.2, { sliderSpeed: 0.02 }),
      instance('instance-property-subject-control', 'LineDancer2D', 0.2, { sliderSpeed: 0.02 }),
      instance('instance-property-comparison-control', 'LineDancer2D', 0.2, { sliderSpeed: 0.02 }),
      instance('instance-overlay-opacity-overlay', 'SignalMandala', 0.28),
    ],
    layers: [mainLayer('zone-1'), overlayLayer('zone-1', 1, 'Signal overlay'), mainLayer('zone-2')],
    clips: [
      clip('placement-animation-speed-a', 'instance-property-subject-speed', 'zone-1', mainLayerId('zone-1'), 0, 5_000),
      clip('placement-animation-speed-b', 'instance-property-comparison-speed', 'zone-2', mainLayerId('zone-2'), 0, 5_000),
      clip('placement-pattern-control-a', 'instance-property-subject-control', 'zone-1', mainLayerId('zone-1'), 5_000, 5_000),
      clip('placement-pattern-control-b', 'instance-property-comparison-control', 'zone-2', mainLayerId('zone-2'), 5_000, 5_000),
      clip('placement-brightness-a', 'instance-property-subject', 'zone-1', mainLayerId('zone-1'), 10_000, 5_000),
      clip('placement-brightness-b', 'instance-property-subject', 'zone-2', mainLayerId('zone-2'), 10_000, 5_000),
      clip('placement-clip-transform-a', 'instance-property-subject', 'zone-1', mainLayerId('zone-1'), 15_000, 5_000),
      clip('placement-clip-transform-b', 'instance-property-subject', 'zone-2', mainLayerId('zone-2'), 15_000, 5_000),
      clip('placement-clip-viewport-a', 'instance-property-subject', 'zone-1', mainLayerId('zone-1'), 20_000, 5_000, { aperture: { enabled: true, x: 0.15, y: 0.15, width: 0.9, height: 0.7, edge: 'soft' } }),
      clip('placement-clip-viewport-b', 'instance-property-subject', 'zone-2', mainLayerId('zone-2'), 20_000, 5_000),
      clip('placement-overlay-opacity-a', 'instance-property-subject', 'zone-1', mainLayerId('zone-1'), 25_000, 5_000),
      clip('placement-overlay-opacity-b', 'instance-property-subject', 'zone-2', mainLayerId('zone-2'), 25_000, 5_000),
      clip('placement-overlay-opacity-overlay', 'instance-overlay-opacity-overlay', 'zone-1', overlayLayerId('zone-1', 1), 25_000, 5_000, { opacity: 0 }),
      clip('placement-effect-parameter-a', 'instance-property-subject', 'zone-1', mainLayerId('zone-1'), 30_000, 5_000, { effects: [{ id: 'translate-demo', kind: 'translate', x: 0, y: 0 }] }),
      clip('placement-effect-parameter-b', 'instance-property-subject', 'zone-2', mainLayerId('zone-2'), 30_000, 5_000),
      clip('placement-split-position-a', 'instance-property-subject', 'zone-1', mainLayerId('zone-1'), 36_800, 5_000),
      clip('placement-split-position-b', 'instance-property-subject', 'zone-2', mainLayerId('zone-2'), 36_800, 5_000),
      clip('placement-repeat-scale-a', 'instance-property-subject', 'zone-1', mainLayerId('zone-1'), 43_600, 5_000),
      clip('placement-repeat-scale-b', 'instance-property-subject', 'zone-2', mainLayerId('zone-2'), 43_600, 5_000),
    ],
    transitions: [
      wholeOutputTransition('transition-effect-parameter', 'crossfade', 35_000, ['placement-effect-parameter-a', 'placement-effect-parameter-b'], ['placement-split-position-a', 'placement-split-position-b'], 1_800, LINEAR, { crossfadePolicy: 'live-live' }, [{ target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: 'layout-occurrence:3' }, from: 0.25, durationMs: 1_800, easing: LINEAR }]),
      wholeOutputTransition('transition-split-position', 'crossfade', 41_800, ['placement-split-position-a', 'placement-split-position-b'], ['placement-repeat-scale-a', 'placement-repeat-scale-b'], 1_800, LINEAR, { crossfadePolicy: 'live-live' }, [{ target: { kind: 'show-repeat-scale' }, from: 1, durationMs: 1_800, easing: LINEAR }]),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-property-split', 0, 30_000, { splitPosition: 0.5 }),
      occurrence(2, 'layout-property-split', 30_000, 6_800, { splitPosition: 0.25 }),
      occurrence(3, 'layout-property-split', 36_800, 6_800, { splitPosition: 0.75 }),
      occurrence(4, 'layout-property-split', 43_600, 5_000, { splitPosition: 0.5 }),
    ],
    propertyTracks: [
      propertyTrack('track-animation-speed', { kind: 'instance-time-scale', instanceId: 'instance-property-subject-speed' }, 0, 5_000, [
        propertyKey('track-animation-speed-start', 0, 0.06, LINEAR),
        propertyKey('track-animation-speed-middle', 2_500, 0.36, LINEAR),
        propertyKey('track-animation-speed-end', 5_000, 0.06, LINEAR),
      ]),
      propertyTrack('track-pattern-control', { kind: 'instance-control', instanceId: 'instance-property-subject-control', exportName: 'sliderSpeed' }, 5_000, 5_000, [
        propertyKey('track-pattern-control-start', 5_000, 0.02, LINEAR),
        propertyKey('track-pattern-control-middle', 7_500, 0.22, LINEAR),
        propertyKey('track-pattern-control-end', 10_000, 0.02, LINEAR),
      ]),
      propertyTrack('track-brightness', { kind: 'clip-view', clipId: 'placement-brightness-a', property: 'brightness' }, 10_000, 5_000, [
        propertyKey('track-brightness-start', 10_000, 0.1, LINEAR),
        propertyKey('track-brightness-middle', 12_500, 1, LINEAR),
        propertyKey('track-brightness-end', 15_000, 0.1, LINEAR),
      ]),
      propertyTrack('track-clip-transform', { kind: 'clip-transform', clipId: 'placement-clip-transform-a', property: 'positionX' }, 15_000, 5_000, [
        propertyKey('track-clip-transform-start', 15_000, -0.25, LINEAR),
        propertyKey('track-clip-transform-middle', 17_500, 0.25, LINEAR),
        propertyKey('track-clip-transform-end', 20_000, -0.25, LINEAR),
      ]),
      propertyTrack('track-clip-viewport', { kind: 'clip-aperture', clipId: 'placement-clip-viewport-a', property: 'width' }, 20_000, 5_000, [
        propertyKey('track-clip-viewport-start', 20_000, 0.9, LINEAR),
        propertyKey('track-clip-viewport-middle', 22_500, 0.4, LINEAR),
        propertyKey('track-clip-viewport-end', 25_000, 0.9, LINEAR),
      ]),
      propertyTrack('track-overlay-opacity', { kind: 'clip-opacity', clipId: 'placement-overlay-opacity-overlay' }, 25_000, 5_000, [
        propertyKey('track-overlay-opacity-start', 25_000, 0, LINEAR),
        propertyKey('track-overlay-opacity-middle', 27_500, 0.85, LINEAR),
        propertyKey('track-overlay-opacity-end', 30_000, 0, LINEAR),
      ]),
      propertyTrack('track-effect-parameter', { kind: 'clip-effect', clipId: 'placement-effect-parameter-a', effectId: 'translate-demo', effectKind: 'translate', parameterId: 'translateX' }, 30_000, 6_800, [
        propertyKey('track-effect-parameter-start', 30_000, 0, LINEAR),
        propertyKey('track-effect-parameter-middle', 32_500, -0.35, LINEAR),
        propertyKey('track-effect-parameter-end', 35_000, 0, LINEAR),
      ]),
      propertyTrack('show-repeat-scale:held', { kind: 'show-repeat-scale' }, 0, 48_600, [
        propertyKey('show-repeat-scale:held:0', 0, 1, { curve: 'hold', at: 1 }),
        propertyKey('show-repeat-scale:held:1', 43_600, 4, { curve: 'hold', at: 1 }),
      ]),
    ],
    markers: [
      chapter('scene-marker:animation-speed', 0, 'Animation speed'),
      chapter('scene-marker:pattern-control', 5_000, 'Public Pattern control'),
      chapter('scene-marker:brightness', 10_000, 'Brightness'),
      chapter('scene-marker:clip-transform', 15_000, 'Clip Transform'),
      chapter('scene-marker:clip-viewport', 20_000, 'Clip Viewport'),
      chapter('scene-marker:overlay-opacity', 25_000, 'Overlay opacity'),
      chapter('scene-marker:effect-parameter', 30_000, 'Effect parameter'),
      chapter('scene-marker:split-position', 36_800, 'Split position'),
      chapter('scene-marker:repeat-scale', 43_600, 'Repeat scale'),
    ],
  })
}

// One Wipe per easing curve and direction at a fixed 1.8s tempo, so the curves
// are compared against each other rather than against different durations.
function easingReferenceV2(): ShowRecordV2 {
  return transitionReferenceShowV2({
    id: 'stock-show-reference-easing',
    name: 'Easing',
    referencePattern: 'IQPalettes',
    selectedPattern: 'MetaballGarden',
    junctionDefaults: { kind: 'wipe', durationMs: 1_800, settings: { feather: 0, wipeVariant: 'linear', direction: 0, edgePolicy: 'hard' } },
    specs: [
      { label: 'Reference', holdMs: 3_000, junction: { easing: LINEAR } },
      { label: 'linear', holdMs: 2_000, junction: { easing: QUADRATIC_IN } },
      { label: 'quadratic in', holdMs: 2_000, junction: { easing: { curve: 'quadratic', direction: 'out' } } },
      { label: 'quadratic out', holdMs: 2_000, junction: { easing: { curve: 'quadratic', direction: 'in-out' } } },
      { label: 'quadratic in/out', holdMs: 2_000, junction: { easing: CUBIC_IN } },
      { label: 'cubic in', holdMs: 2_000, junction: { easing: CUBIC_OUT } },
      { label: 'cubic out', holdMs: 2_000, junction: { easing: CUBIC_IN_OUT } },
      { label: 'cubic in/out', holdMs: 2_000, junction: { easing: { curve: 'sine', direction: 'in' } } },
      { label: 'sine in', holdMs: 2_000, junction: { easing: SINE_OUT } },
      { label: 'sine out', holdMs: 2_000, junction: { easing: SINE_IN_OUT } },
      { label: 'sine in/out', holdMs: 2_000, junction: { easing: { curve: 'cubic-bezier', x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 } } },
      { label: 'CSS ease', holdMs: 2_000, junction: { easing: { curve: 'cubic-bezier', x1: 0.42, y1: 0, x2: 1, y2: 1 } } },
      { label: 'CSS ease in', holdMs: 2_000, junction: { easing: { curve: 'cubic-bezier', x1: 0, y1: 0, x2: 0.58, y2: 1 } } },
      { label: 'CSS ease out', holdMs: 2_000, junction: { easing: { curve: 'cubic-bezier', x1: 0.42, y1: 0, x2: 0.58, y2: 1 } } },
      { label: 'CSS ease in/out', holdMs: 2_000, junction: { easing: { curve: 'steps', steps: 4, position: 'end' } } },
      { label: '4 steps', holdMs: 2_000, junction: { easing: { curve: 'steps', steps: 4, position: 'start' } } },
      { label: '4 steps from start', holdMs: 2_000, junction: { easing: { curve: 'hold', at: 0.5 } } },
      { label: 'Hold until halfway', holdMs: 2_000, junction: { easing: { curve: 'back', direction: 'in', overshoot: 1.70158 } } },
      { label: 'back in', holdMs: 2_000, junction: { easing: { curve: 'back', direction: 'out', overshoot: 1.70158 } } },
      { label: 'back out', holdMs: 2_000, junction: { easing: { curve: 'back', direction: 'in-out', overshoot: 1.70158 } } },
      { label: 'back in/out', holdMs: 2_000 },
    ],
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
function apertureShapesReferenceV2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-reference-aperture-shapes',
    name: 'Aperture Shapes: Geometric',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 27_000,
    patternInstances: [
      instance('garden', 'Caustics', LESSON_TIME_SCALE),
      instance('rose', 'Harmonograph', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1'), overlayLayer('zone-1', 1, 'Subject')],
    clips: [
      clip('bed-rectangle', 'garden', 'zone-1', mainLayerId('zone-1'), 0, 3_000, { view: { brightness: 0.3 } }),
      clip('subject-rectangle', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 0, 3_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, edge: 'soft' } }),
      clip('bed-ellipse', 'garden', 'zone-1', mainLayerId('zone-1'), 3_000, 5_000, { view: { brightness: 0.3 } }),
      clip('subject-ellipse', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 3_000, 5_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'ellipse' } }),
      clip('bed-diamond', 'garden', 'zone-1', mainLayerId('zone-1'), 8_000, 2_000, { view: { brightness: 0.3 } }),
      clip('subject-diamond', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 8_000, 2_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'diamond' } }),
      clip('bed-rounded-box', 'garden', 'zone-1', mainLayerId('zone-1'), 10_000, 2_000, { view: { brightness: 0.3 } }),
      clip('subject-rounded-box', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 10_000, 2_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'rounded-box', cornerRadius: 0.25 } }),
      clip('bed-rounded-box-wide', 'garden', 'zone-1', mainLayerId('zone-1'), 12_000, 2_000, { view: { brightness: 0.3 } }),
      clip('subject-rounded-box-wide', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 12_000, 2_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'rounded-box', cornerRadius: 0.45 } }),
      clip('bed-cross', 'garden', 'zone-1', mainLayerId('zone-1'), 14_000, 2_000, { view: { brightness: 0.3 } }),
      clip('subject-cross', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 14_000, 2_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'cross' } }),
      clip('bed-polygon', 'garden', 'zone-1', mainLayerId('zone-1'), 16_000, 2_000, { view: { brightness: 0.3 } }),
      clip('subject-polygon', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 16_000, 2_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'polygon' } }),
      clip('bed-ring-soft', 'garden', 'zone-1', mainLayerId('zone-1'), 18_000, 4_000, { view: { brightness: 0.3 } }),
      clip('subject-ring-soft', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 18_000, 4_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'ring', edge: 'soft' } }),
      clip('bed-ring-hard', 'garden', 'zone-1', mainLayerId('zone-1'), 22_000, 2_000, { view: { brightness: 0.3 } }),
      clip('subject-ring-hard', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 22_000, 2_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'ring', edge: 'hard' } }),
      clip('bed-ring-dither', 'garden', 'zone-1', mainLayerId('zone-1'), 24_000, 3_000, { view: { brightness: 0.3 } }),
      clip('subject-ring-dither', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 24_000, 3_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'ring', edge: 'dither' } }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 27_000),
    ],
    markers: [
      chapter('scene-marker:rectangle', 0, 'Rectangle'),
      chapter('scene-marker:ellipse', 3_000, 'Ellipse'),
      chapter('scene-marker:diamond', 8_000, 'Diamond'),
      chapter('scene-marker:rounded-box', 10_000, 'Rounded box'),
      chapter('scene-marker:rounded-box-wide', 12_000, 'Rounded box, wide radius'),
      chapter('scene-marker:cross', 14_000, 'Cross'),
      chapter('scene-marker:polygon', 16_000, 'Regular polygon'),
      chapter('scene-marker:ring-soft', 18_000, 'Ring, Soft edge'),
      chapter('scene-marker:ring-hard', 22_000, 'Ring, Hard edge'),
      chapter('scene-marker:ring-dither', 24_000, 'Ring, Stable Dither'),
    ],
  })
}

// The figurative half of the #690 aperture catalogue: the icon and signature
// silhouettes at their Soft default, then the two controls the geometric
// reference leaves out - rotation (the silhouette turns while the frame stays
// axis-aligned) and the Cut-out mode (the same boundary, inverted). The heart
// and the cloud get study-length beats; the cats cut past at two seconds.
function apertureIconsReferenceV2(): ShowRecordV2 {
  const zones = logicalZones(['Main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-reference-aperture-icons',
    name: 'Aperture Icons & Signature',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 23_000,
    patternInstances: [
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
      instance('rose', 'Kishimisu', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1'), overlayLayer('zone-1', 1, 'Subject')],
    clips: [
      clip('bed-heart', 'garden', 'zone-1', mainLayerId('zone-1'), 0, 4_000, { view: { brightness: 0.3 } }),
      clip('subject-heart', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 0, 4_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'heart' } }),
      clip('bed-star', 'garden', 'zone-1', mainLayerId('zone-1'), 4_000, 2_000, { view: { brightness: 0.3 } }),
      clip('subject-star', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 4_000, 2_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'star' } }),
      clip('bed-crescent', 'garden', 'zone-1', mainLayerId('zone-1'), 6_000, 2_000, { view: { brightness: 0.3 } }),
      clip('subject-crescent', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 6_000, 2_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'crescent' } }),
      clip('bed-cloud', 'garden', 'zone-1', mainLayerId('zone-1'), 8_000, 3_000, { view: { brightness: 0.3 } }),
      clip('subject-cloud', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 8_000, 3_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'cloud' } }),
      clip('bed-cat-head', 'garden', 'zone-1', mainLayerId('zone-1'), 11_000, 2_000, { view: { brightness: 0.3 } }),
      clip('subject-cat-head', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 11_000, 2_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'cat-head' } }),
      clip('bed-cat-side-profile', 'garden', 'zone-1', mainLayerId('zone-1'), 13_000, 2_000, { view: { brightness: 0.3 } }),
      clip('subject-cat-side-profile', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 13_000, 2_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'cat-side-profile' } }),
      clip('bed-bastet', 'garden', 'zone-1', mainLayerId('zone-1'), 15_000, 2_000, { view: { brightness: 0.3 } }),
      clip('subject-bastet', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 15_000, 2_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'bastet' } }),
      clip('bed-star-rotated', 'garden', 'zone-1', mainLayerId('zone-1'), 17_000, 3_000, { view: { brightness: 0.3 } }),
      clip('subject-star-rotated', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 17_000, 3_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'star', rotation: 0.1 } }),
      clip('bed-cloud-cut-out', 'garden', 'zone-1', mainLayerId('zone-1'), 20_000, 3_000, { view: { brightness: 0.3 } }),
      clip('subject-cloud-cut-out', 'rose', 'zone-1', overlayLayerId('zone-1', 1), 20_000, 3_000, { aperture: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'cloud', invert: true } }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 23_000),
    ],
    markers: [
      chapter('scene-marker:heart', 0, 'Heart'),
      chapter('scene-marker:star', 4_000, 'Star'),
      chapter('scene-marker:crescent', 6_000, 'Crescent'),
      chapter('scene-marker:cloud', 8_000, 'Cloud'),
      chapter('scene-marker:cat-head', 11_000, 'Cat head'),
      chapter('scene-marker:cat-side-profile', 13_000, 'Side-profile cat'),
      chapter('scene-marker:bastet', 15_000, 'Bastet'),
      chapter('scene-marker:star-rotated', 17_000, 'Star, rotated'),
      chapter('scene-marker:cloud-cut-out', 20_000, 'Cloud, Cut out'),
    ],
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
// Each sibling holds its hero Pattern against IQPalettes; #848 recasts
// Splits to CoronalMassEjection and Radial to Harmonograph. The four-voice
// sibling retains MetaballGarden, Caustics, and GlyphRain. Every boundary is
// an atomic routing switch except the Radial sibling's entry into rings, the
// single travelling switch, so both switch styles appear across the family.
//
// These three are the Shows whose v1 Pattern placements ran inside intervals
// where their Zone was unrouted. #1036 retired that silent runtime use, so
// their v2 resource ledger and later state legitimately differ from v1; the
// 47-record conversion report measures the difference.
function zoneLayoutSplitsShowcaseV2(): ShowRecordV2 {
  const zones = [{ id: 'zone-1', name: 'Garden', nominalPixelCount: 968, color: '#22c55e' }, { id: 'zone-2', name: 'Ember', nominalPixelCount: 968, color: '#f97316' }]
  return nativeShowV2({
    id: 'stock-show-showcase-zone-layouts-splits',
    name: 'Zone Layouts: Splits & Checker',
    zones,
    zoneLayouts: [singleLayout(zones, 'layout-full', 'Full surface'), splitLayout('layout-moving-split', 'Moving split', zones, 'x'), logicalLayout('layout-soft-split', 'Soft split', { kind: 'soft-split', zoneIds: ['zone-1', 'zone-2'], axis: 'x', feather: 0.3 }), logicalLayout('layout-checker', 'Checker', { kind: 'checker', zoneIds: ['zone-1', 'zone-2'], columns: 4, rows: 4 })],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 18_000,
    patternInstances: [
      instance('ember', 'IQPalettes', LESSON_TIME_SCALE),
      instance('garden', 'CoronalMassEjection', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1'), mainLayer('zone-2')],
    clips: [
      clip('clip-full-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 0, 4_000),
      clip('clip-moving-split-ember--layout-1', 'ember', 'zone-2', mainLayerId('zone-2'), 4_000, 5_000),
      clip('clip-moving-split-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 4_000, 5_000),
      clip('clip-soft-split-ember', 'ember', 'zone-2', mainLayerId('zone-2'), 9_000, 4_000),
      clip('clip-soft-split-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 9_000, 4_000),
      clip('clip-checker-ember', 'ember', 'zone-2', mainLayerId('zone-2'), 13_000, 5_000),
      clip('clip-checker-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 13_000, 5_000),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-full', 0, 4_000),
      occurrence(2, 'layout-moving-split', 4_000, 5_000, { splitPosition: 0.5 }),
      occurrence(3, 'layout-soft-split', 9_000, 4_000, { splitPosition: 0.5 }),
      occurrence(4, 'layout-checker', 13_000, 5_000),
    ],
    markers: [
      chapter('scene-marker:full', 0, 'Full surface'),
      chapter('scene-marker:moving-split', 4_000, 'Moving split'),
      chapter('scene-marker:soft-split', 9_000, 'Soft split'),
      chapter('scene-marker:checker', 13_000, 'Checker'),
    ],
  })
}

// Stripes and grid sibling of the Zone Layout showcase family; see the note above.
function zoneLayoutBandsShowcaseV2(): ShowRecordV2 {
  const zones = [{ id: 'zone-1', name: 'Garden', nominalPixelCount: 484, color: '#22c55e' }, { id: 'zone-2', name: 'Ember', nominalPixelCount: 484, color: '#f97316' }, { id: 'zone-3', name: 'Tide', nominalPixelCount: 484, color: '#38bdf8' }, { id: 'zone-4', name: 'Rain', nominalPixelCount: 484, color: '#a78bfa' }]
  return nativeShowV2({
    id: 'stock-show-showcase-zone-layouts-stripes-grid',
    name: 'Zone Layouts: Stripes & Grid',
    zones,
    zoneLayouts: [singleLayout(zones, 'layout-full', 'Full surface'), logicalLayout('layout-stripes', 'Stripes', { kind: 'stripes', zoneIds: ['zone-1', 'zone-2', 'zone-3', 'zone-4'], axis: 'x' }), logicalLayout('layout-grid', 'Grid', { kind: 'grid', zoneIds: ['zone-1', 'zone-2', 'zone-3', 'zone-4'], columns: 2, rows: 2 })],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 15_000,
    patternInstances: [
      instance('ember', 'IQPalettes', LESSON_TIME_SCALE),
      instance('garden', 'MetaballGarden', LESSON_TIME_SCALE),
      instance('rain', 'GlyphRain', LESSON_TIME_SCALE),
      instance('tide', 'Caustics', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1'), mainLayer('zone-2'), mainLayer('zone-3'), mainLayer('zone-4')],
    clips: [
      clip('clip-full-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 0, 4_000),
      clip('clip-stripes-ember--layout-1', 'ember', 'zone-2', mainLayerId('zone-2'), 4_000, 5_000),
      clip('clip-stripes-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 4_000, 5_000),
      clip('clip-stripes-rain--layout-1', 'rain', 'zone-4', mainLayerId('zone-4'), 4_000, 5_000),
      clip('clip-stripes-tide--layout-1', 'tide', 'zone-3', mainLayerId('zone-3'), 4_000, 5_000),
      clip('clip-grid-ember', 'ember', 'zone-2', mainLayerId('zone-2'), 9_000, 6_000),
      clip('clip-grid-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 9_000, 6_000),
      clip('clip-grid-rain', 'rain', 'zone-4', mainLayerId('zone-4'), 9_000, 6_000),
      clip('clip-grid-tide', 'tide', 'zone-3', mainLayerId('zone-3'), 9_000, 6_000),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-full', 0, 4_000),
      occurrence(2, 'layout-stripes', 4_000, 5_000),
      occurrence(3, 'layout-grid', 9_000, 6_000),
    ],
    markers: [
      chapter('scene-marker:full', 0, 'Full surface'),
      chapter('scene-marker:stripes', 4_000, 'Stripes'),
      chapter('scene-marker:grid', 9_000, 'Grid'),
    ],
  })
}

// Radial sibling of the Zone Layout showcase family; see the note above.
function zoneLayoutRadialShowcaseV2(): ShowRecordV2 {
  const zones = [{ id: 'zone-1', name: 'Garden', nominalPixelCount: 968, color: '#22c55e' }, { id: 'zone-2', name: 'Ember', nominalPixelCount: 968, color: '#f97316' }]
  return nativeShowV2({
    id: 'stock-show-showcase-zone-layouts-radial',
    name: 'Zone Layouts: Radial',
    zones,
    zoneLayouts: [singleLayout(zones, 'layout-full', 'Full surface'), logicalLayout('layout-rings', 'Rings', { kind: 'rings', zoneIds: ['zone-1', 'zone-2'], rings: 3 }), logicalLayout('layout-wave', 'Wave', { kind: 'wave', zoneIds: ['zone-1', 'zone-2'], axis: 'x', bands: 4, amplitude: 0.3, frequency: 2.5, phase: 0 }), logicalLayout('layout-pinwheel', 'Pinwheel', { kind: 'pinwheel', zoneIds: ['zone-1', 'zone-2'], arms: 6, twist: 8.482300164692441, rotation: 0 })],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 19_000,
    patternInstances: [
      instance('ember', 'IQPalettes', LESSON_TIME_SCALE),
      instance('garden', 'Harmonograph', LESSON_TIME_SCALE),
    ],
    layers: [mainLayer('zone-1'), mainLayer('zone-2')],
    clips: [
      clip('clip-full-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 0, 4_000),
      clip('clip-rings-ember--layout-1', 'ember', 'zone-2', mainLayerId('zone-2'), 4_000, 5_000),
      clip('clip-rings-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 4_000, 5_000),
      clip('clip-wave-ember', 'ember', 'zone-2', mainLayerId('zone-2'), 9_000, 4_000),
      clip('clip-wave-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 9_000, 4_000),
      clip('clip-pinwheel-ember', 'ember', 'zone-2', mainLayerId('zone-2'), 13_000, 6_000),
      clip('clip-pinwheel-garden', 'garden', 'zone-1', mainLayerId('zone-1'), 13_000, 6_000),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-full', 0, 4_000),
      occurrence(2, 'layout-rings', 4_000, 5_000, {}, transfer('routing-full', 1, 1_500, 'forward', SINE_IN_OUT)),
      occurrence(3, 'layout-wave', 9_000, 4_000),
      occurrence(4, 'layout-pinwheel', 13_000, 6_000),
    ],
    markers: [
      chapter('scene-marker:full', 0, 'Full surface'),
      chapter('scene-marker:rings', 4_000, 'Rings'),
      chapter('scene-marker:wave', 9_000, 'Wave'),
      chapter('scene-marker:pinwheel', 13_000, 'Pinwheel'),
    ],
  })
}

// The Redline installation Stage: one panel in the middle and four radial
// blooms around it, all driven from a single Harmonograph render. Eight
// seven-and-a-half-second phrases score the whole minute; the surrounding
// blooms are the same machine posed four ways, so the phrase and target
// indices — not per-Clip tuning — own every pose and entry.
function redlineInstallationV2(): ShowRecordV2 {
  const zones = physicalZones(['Hero panel', 'Left upper', 'Left lower', 'Right upper', 'Right lower'], [800, 300, 300, 300, 300])
  const phrases = [
    ['ignition', 'Ignition'], ['first-lift', 'First lift'], ['countermotion', 'Countermotion'],
    ['first-drop', 'First drop'], ['vacuum', 'Vacuum'], ['rebuild', 'Rebuild'],
    ['compression', 'Compression'], ['peak-release', 'Peak and release'],
  ] as const
  const PHRASE_MS = 7_500
  const ROTATIONS = [0, 0.125, -0.125, 0.25]
  const SCALES = [0.92, 0.84, 0.88, 0.8]
  const SHEAR_X = [-0.14, 0.1, -0.08, 0.16]
  const SHEAR_Y = [0.08, -0.12, 0.14, -0.06]
  // Odd phrases add an eighth turn, and the y coefficients walk one step per
  // phrase, so a bloom never repeats the pose it held in the previous phrase.
  const targetEffects = (phraseIndex: number, targetIndex: number): ShowClipEffect[] => [
    { id: 'target-rotate', kind: 'rotate', turns: ROTATIONS[targetIndex] + (phraseIndex % 2 ? 0.0625 : 0) },
    { id: 'target-scale', kind: 'scale', x: SCALES[targetIndex], y: SCALES[(targetIndex + phraseIndex) % 4] },
    { id: 'target-shear', kind: 'shear', x: SHEAR_X[targetIndex], y: SHEAR_Y[(targetIndex + phraseIndex) % 4] },
    { id: 'target-wrap', kind: 'wrap' },
  ]
  // Ignition deals the blooms in one at a time and drops each again; the first
  // lift and the rebuild stagger their entries but hold to the phrase end;
  // every other phrase runs all four for the whole phrase.
  const targetTiming = (phraseIndex: number, targetIndex: number): { startMs: number; durationMs: number } => {
    if (phraseIndex === 0) return { startMs: targetIndex * 1_875, durationMs: 1_875 }
    if (phraseIndex === 1) {
      const startMs = targetIndex < 2 ? targetIndex * 1_875 : 3_750
      return { startMs, durationMs: PHRASE_MS - startMs }
    }
    if (phraseIndex === 5) {
      const startMs = targetIndex * 750
      return { startMs, durationMs: PHRASE_MS - startMs }
    }
    return { startMs: 0, durationMs: PHRASE_MS }
  }
  return nativeShowV2({
    id: 'stock-show-showcase-redline-installation',
    name: 'Redline Installation',
    zones,
    zoneLayouts: [physicalLayout('layout-redline-stage', 'Redline stage', zones, [[[0, 799]], [[800, 1_099]], [[1_100, 1_399]], [[1_400, 1_699]], [[1_700, 1_999]]])],
    stageMapId: 'redline-stage-2d',
    outputContract: installationOutputContract('redline-stage-2d', 2_000),
    executionModel: 'continuous',
    showEndMs: phrases.length * PHRASE_MS,
    patternInstances: [
      instance('redline-machine', 'RedlineMachine', 1, { sliderIntensity: 1, sliderSpeed: 0.5, sliderCyan: 1 }),
    ],
    layers: zones.map(zone => mainLayer(zone.id)),
    clips: phrases.flatMap(([phraseId], phraseIndex) => {
      const phraseStartMs = phraseIndex * PHRASE_MS
      return [
        clip(`${phraseId}-center`, 'redline-machine', 'zone-1', mainLayerId('zone-1'), phraseStartMs, PHRASE_MS),
        ...[0, 1, 2, 3].map(targetIndex => {
          const timing = targetTiming(phraseIndex, targetIndex)
          return clip(
            `${phraseId}-target-${targetIndex + 1}`, 'redline-machine',
            `zone-${targetIndex + 2}`, mainLayerId(`zone-${targetIndex + 2}`),
            phraseStartMs + timing.startMs, timing.durationMs,
            {
              ...(targetIndex % 2 === 1 ? { view: { mirror: true } } : {}),
              effects: targetEffects(phraseIndex, targetIndex),
            },
          )
        }),
      ]
    }),
    layoutOccurrences: [
      occurrence(1, 'layout-redline-stage', 0, phrases.length * PHRASE_MS),
    ],
    markers: phrases.map(([phraseId, name], phraseIndex) => (
      chapter(`scene-marker:${phraseId}`, phraseIndex * PHRASE_MS, name)
    )),
  })
}

// The Coronal Mass Ejection remix. Its instance clock carries a calibrated
// offset so the flare lands on the intended Pattern-clock phase, and its eight
// general-purpose Markers stay general: only the two Scene labels are chapters.
function remixCoronalMassEjectionV2(): ShowRecordV2 {
  const zones = logicalZones(['main'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-remix-coronal-mass-ejection',
    name: 'Coronal Mass Ejection Remix',
    zones,
    zoneLayouts: [physicalLayout('layout-1', 'Default', zones, [[[0, 1_935]]], { kind: 'single', zoneIds: ['zone-1'] })],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'deterministic-loop',
    showEndMs: 40_000,
    patternInstances: [
      offsetInstance('cell-1', 'CoronalMassEjection', 0.5, 2_450),
    ],
    layers: [mainLayer('zone-1')],
    clips: [
      clip('placement-cell-1-scene-1', 'cell-1', 'zone-1', mainLayerId('zone-1'), 0, 8_000),
      clip('placement-cell-1-scene-2', 'cell-1', 'zone-1', mainLayerId('zone-1'), 8_000, 32_000),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-1', 0, 40_000),
    ],
    propertyTracks: [
      propertyTrack('track-brightness', { kind: 'clip-view', clipId: 'placement-cell-1-scene-2', property: 'brightness' }, 8_000, 32_000, [
        propertyKey('track-brightness-kf-1', 8_000, 1, LINEAR),
        propertyKey('track-brightness-kf-2', 23_900, 1, CUBIC_OUT),
        propertyKey('track-brightness-kf-3', 24_000, 0.05, LINEAR),
        propertyKey('track-brightness-kf-4', 24_150, 0.05),
        propertyKey('track-brightness-kf-5', 24_650, 1, LINEAR),
        propertyKey('track-brightness-kf-6', 24_900, 1, CUBIC_OUT),
        propertyKey('track-brightness-kf-7', 25_000, 0.05, LINEAR),
        propertyKey('track-brightness-kf-8', 25_150, 0.05),
        propertyKey('track-brightness-kf-9', 25_650, 1, LINEAR),
        propertyKey('track-brightness-kf-10', 25_900, 1, CUBIC_OUT),
        propertyKey('track-brightness-kf-11', 26_000, 0.05, LINEAR),
        propertyKey('track-brightness-kf-12', 26_150, 0.05),
        propertyKey('track-brightness-kf-13', 26_650, 1, LINEAR),
        propertyKey('track-brightness-kf-14', 26_900, 1, CUBIC_OUT),
        propertyKey('track-brightness-kf-15', 27_000, 0.05, LINEAR),
        propertyKey('track-brightness-kf-16', 27_150, 0.05),
        propertyKey('track-brightness-kf-17', 27_650, 1, LINEAR),
        propertyKey('track-brightness-kf-18', 27_900, 1, CUBIC_OUT),
        propertyKey('track-brightness-kf-19', 28_000, 0.05, LINEAR),
        propertyKey('track-brightness-kf-20', 28_150, 0.05),
        propertyKey('track-brightness-kf-21', 28_650, 1, LINEAR),
        propertyKey('track-brightness-kf-22', 28_900, 1, CUBIC_OUT),
        propertyKey('track-brightness-kf-23', 29_000, 0.15, LINEAR),
        propertyKey('track-brightness-kf-24', 29_150, 0.15),
        propertyKey('track-brightness-kf-25', 29_650, 1, LINEAR),
        propertyKey('track-brightness-kf-26', 30_100, 1, CUBIC_OUT),
        propertyKey('track-brightness-kf-27', 30_200, 0.3, LINEAR),
        propertyKey('track-brightness-kf-28', 30_350, 0.3),
        propertyKey('track-brightness-kf-29', 30_850, 1, LINEAR),
        propertyKey('track-brightness-kf-30', 31_400, 1, CUBIC_OUT),
        propertyKey('track-brightness-kf-31', 31_500, 0.5, LINEAR),
        propertyKey('track-brightness-kf-32', 31_600, 0.5),
        propertyKey('track-brightness-kf-33', 32_000, 1, LINEAR),
        propertyKey('track-brightness-kf-34', 35_000, 1, SINE_OUT),
        propertyKey('track-brightness-kf-35', 36_000, 0, LINEAR),
      ]),
      propertyTrack('track-rotation', { kind: 'clip-transform', clipId: 'placement-cell-1-scene-2', property: 'rotation' }, 8_000, 32_000, [
        propertyKey('track-rotation-kf-1', 8_000, 0, QUADRATIC_IN),
        propertyKey('track-rotation-kf-2', 24_000, 0.75, LINEAR),
        propertyKey('track-rotation-kf-3', 28_000, 1.125, CUBIC_OUT),
        propertyKey('track-rotation-kf-4', 32_000, 1.25, LINEAR),
      ]),
      propertyTrack('track-scaleX', { kind: 'clip-transform', clipId: 'placement-cell-1-scene-2', property: 'scaleX' }, 8_000, 32_000, [
        propertyKey('track-scaleX-kf-1', 8_000, 1, QUADRATIC_IN),
        propertyKey('track-scaleX-kf-2', 12_000, 1.45, LINEAR),
      ]),
      propertyTrack('track-scaleY', { kind: 'clip-transform', clipId: 'placement-cell-1-scene-2', property: 'scaleY' }, 8_000, 32_000, [
        propertyKey('track-scaleY-kf-1', 8_000, 1, QUADRATIC_IN),
        propertyKey('track-scaleY-kf-2', 12_000, 1.45, LINEAR),
      ]),
      propertyTrack('track-speed', { kind: 'instance-time-scale', instanceId: 'cell-1' }, 8_000, 32_000, [
        propertyKey('track-speed-kf-1', 8_000, 0.5, LINEAR),
        propertyKey('track-speed-kf-2', 12_000, 0.5, CUBIC_IN),
        propertyKey('track-speed-kf-3', 24_000, 1.75, LINEAR),
        propertyKey('track-speed-kf-4', 28_000, 1.75, CUBIC_OUT),
        propertyKey('track-speed-kf-5', 32_000, 0, LINEAR),
      ]),
    ],
    markers: [
      marker('marker-intro', 0, 'Intro - half speed'),
      chapter('scene-marker:scene-1', 0, 'Intro'),
      marker('marker-rotation', 8_000, 'Rotation begins'),
      chapter('scene-marker:scene-2', 8_000, 'Gesture'),
      marker('marker-accel', 12_000, 'Accelerando'),
      marker('marker-crescendo', 24_000, 'Crescendo - pulses'),
      marker('marker-winddown', 28_000, 'Wind-down'),
      marker('marker-stop', 32_000, 'Stop'),
      marker('marker-fade', 35_000, 'Fade'),
      marker('marker-black', 36_000, 'Black'),
    ],
  })
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
function quadrilleRemixV2(): ShowRecordV2 {
  const zones = logicalZones(['Stage'], PORTABLE_REFERENCE_PIXELS)
  return nativeShowV2({
    id: 'stock-show-remix-quadrille',
    name: 'Quadrille',
    zones,
    zoneLayouts: [singleLayout(zones)],
    stageMapId: 'plane',
    outputContract: portableOutputContract(),
    executionModel: 'continuous',
    showEndMs: 51_200,
    patternInstances: [
      instance('bands', 'WavyBands', 0.6),
      offsetInstance('dancer', 'LineDancer2D', 0.384, 3_829, { sliderSpeed: 1, sliderTwist: 0.66, sliderReflections: 0 }),
    ],
    layers: [mainLayer('zone-1'), overlayLayer('zone-1', 1, 'Quarter'), overlayLayer('zone-1', 2, 'Quarter'), overlayLayer('zone-1', 3, 'Quarter'), overlayLayer('zone-1', 4, 'Quarter')],
    clips: [
      clip('bands-first-light', 'bands', 'zone-1', mainLayerId('zone-1'), 0, 6_400),
      clip('bands-four-mirrors-ne', 'bands', 'zone-1', overlayLayerId('zone-1', 4), 6_400, 5_600, { view: { mirror: true }, transform: { positionX: -0.25, positionY: -0.25, rotation: 0, scaleX: 0.5, scaleY: 0.5 }, aperture: { enabled: true, x: 0.5, y: 0, width: 0.5, height: 0.4999847412109375, edge: 'hard' } }),
      clip('bands-four-mirrors-nw', 'bands', 'zone-1', mainLayerId('zone-1'), 6_400, 5_600, { transform: { positionX: -0.25, positionY: -0.25, rotation: 0, scaleX: 0.5, scaleY: 0.5 }, aperture: { enabled: true, x: 0, y: 0, width: 0.4999847412109375, height: 0.4999847412109375, edge: 'hard' } }),
      clip('bands-four-mirrors-se', 'bands', 'zone-1', overlayLayerId('zone-1', 2), 6_400, 5_600, { transform: { positionX: 0.25, positionY: 0.25, rotation: 0.5, scaleX: 0.5, scaleY: 0.5 }, aperture: { enabled: true, x: 0.5, y: 0.5, width: 0.5, height: 0.5, edge: 'hard' } }),
      clip('bands-four-mirrors-sw', 'bands', 'zone-1', overlayLayerId('zone-1', 3), 6_400, 5_600, { view: { mirror: true }, transform: { positionX: 0.25, positionY: 0.25, rotation: 0.5, scaleX: 0.5, scaleY: 0.5 }, aperture: { enabled: true, x: 0, y: 0.5, width: 0.4999847412109375, height: 0.5, edge: 'hard' } }),
      clip('bands-the-dancer-enters-nw', 'bands', 'zone-1', mainLayerId('zone-1'), 12_800, 5_600, { transform: { positionX: -0.25, positionY: -0.25, rotation: 0, scaleX: 0.5, scaleY: 0.5 }, aperture: { enabled: true, x: 0, y: 0, width: 0.4999847412109375, height: 0.4999847412109375, edge: 'hard' } }),
      clip('bands-the-dancer-enters-se', 'bands', 'zone-1', overlayLayerId('zone-1', 2), 12_800, 5_600, { transform: { positionX: 0.25, positionY: 0.25, rotation: 0.5, scaleX: 0.5, scaleY: 0.5 }, aperture: { enabled: true, x: 0.5, y: 0.5, width: 0.5, height: 0.5, edge: 'hard' } }),
      clip('dancer-the-dancer-enters-ne', 'dancer', 'zone-1', overlayLayerId('zone-1', 4), 12_800, 5_600, { view: { mirror: true }, transform: { positionX: -0.25, positionY: -0.25, rotation: 0, scaleX: 0.5, scaleY: 0.5 }, aperture: { enabled: true, x: 0.5, y: 0, width: 0.5, height: 0.4999847412109375, edge: 'hard' } }),
      clip('dancer-the-dancer-enters-sw', 'dancer', 'zone-1', overlayLayerId('zone-1', 3), 12_800, 5_600, { view: { mirror: true }, transform: { positionX: 0.25, positionY: 0.25, rotation: 0.5, scaleX: 0.5, scaleY: 0.5 }, aperture: { enabled: true, x: 0, y: 0.5, width: 0.4999847412109375, height: 0.5, edge: 'hard' } }),
      clip('bands-lace-and-turns', 'bands', 'zone-1', mainLayerId('zone-1'), 19_200, 12_000),
      clip('lace-lace-and-turns-ne', 'dancer', 'zone-1', overlayLayerId('zone-1', 4), 19_200, 12_000, { view: { mirror: true }, transform: { positionX: -0.25, positionY: -0.25, rotation: 0, scaleX: 0.5, scaleY: 0.5 }, aperture: { enabled: true, x: 0.5, y: 0, width: 0.5, height: 0.4999847412109375, edge: 'hard' }, effects: [{ id: 'lace-key', kind: 'chroma-key', color: '#000000', tolerance: 0.06, softness: 0.06 }] }),
      clip('lace-lace-and-turns-sw', 'dancer', 'zone-1', overlayLayerId('zone-1', 3), 19_200, 12_000, { view: { mirror: true }, transform: { positionX: 0.25, positionY: 0.25, rotation: 0.5, scaleX: 0.5, scaleY: 0.5 }, aperture: { enabled: true, x: 0, y: 0.5, width: 0.4999847412109375, height: 0.5, edge: 'hard' }, effects: [{ id: 'lace-key', kind: 'chroma-key', color: '#000000', tolerance: 0.06, softness: 0.06 }] }),
      clip('bands-all-four-dance', 'bands', 'zone-1', mainLayerId('zone-1'), 32_000, 12_000, { transform: { positionX: 0, positionY: 0, rotation: 0.25, scaleX: 1, scaleY: 1 }, effects: [{ id: 'hue-tilt', kind: 'hue', turns: 0.35 }] }),
      clip('lace-all-four-dance-ne', 'dancer', 'zone-1', overlayLayerId('zone-1', 3), 32_000, 12_000, { view: { mirror: true }, transform: { positionX: -0.25, positionY: -0.25, rotation: 0.25, scaleX: 0.5, scaleY: 0.5 }, aperture: { enabled: true, x: 0.5, y: 0, width: 0.5, height: 0.4999847412109375, edge: 'hard' }, effects: [{ id: 'lace-key', kind: 'chroma-key', color: '#000000', tolerance: 0.06, softness: 0.06 }] }),
      clip('lace-all-four-dance-nw', 'dancer', 'zone-1', overlayLayerId('zone-1', 4), 32_000, 12_000, { transform: { positionX: -0.25, positionY: -0.25, rotation: 0.25, scaleX: 0.5, scaleY: 0.5 }, aperture: { enabled: true, x: 0, y: 0, width: 0.4999847412109375, height: 0.4999847412109375, edge: 'hard' }, effects: [{ id: 'lace-key', kind: 'chroma-key', color: '#000000', tolerance: 0.06, softness: 0.06 }] }),
      clip('lace-all-four-dance-se', 'dancer', 'zone-1', overlayLayerId('zone-1', 1), 32_000, 12_000, { transform: { positionX: 0.25, positionY: 0.25, rotation: 0.75, scaleX: 0.5, scaleY: 0.5 }, aperture: { enabled: true, x: 0.5, y: 0.5, width: 0.5, height: 0.5, edge: 'hard' }, effects: [{ id: 'lace-key', kind: 'chroma-key', color: '#000000', tolerance: 0.06, softness: 0.06 }] }),
      clip('lace-all-four-dance-sw', 'dancer', 'zone-1', overlayLayerId('zone-1', 2), 32_000, 12_000, { view: { mirror: true }, transform: { positionX: 0.25, positionY: 0.25, rotation: 0.75, scaleX: 0.5, scaleY: 0.5 }, aperture: { enabled: true, x: 0, y: 0.5, width: 0.4999847412109375, height: 0.5, edge: 'hard' }, effects: [{ id: 'lace-key', kind: 'chroma-key', color: '#000000', tolerance: 0.06, softness: 0.06 }] }),
      clip('bands-rejoined', 'bands', 'zone-1', mainLayerId('zone-1'), 44_800, 6_400, { transform: { positionX: 0, positionY: 0, rotation: 0.25, scaleX: 1, scaleY: 1 } }),
      clip('lace-rejoined', 'dancer', 'zone-1', overlayLayerId('zone-1', 4), 44_800, 6_400, { effects: [{ id: 'lace-key', kind: 'chroma-key', color: '#000000', tolerance: 0.06, softness: 0.06 }] }),
    ],
    transitions: [
      wholeOutputTransition('transition-four-mirrors', 'crossfade', 12_000, ['bands-four-mirrors-ne', 'bands-four-mirrors-nw', 'bands-four-mirrors-se', 'bands-four-mirrors-sw'], ['bands-the-dancer-enters-nw', 'bands-the-dancer-enters-se', 'dancer-the-dancer-enters-ne', 'dancer-the-dancer-enters-sw'], 800, SINE_IN_OUT, { crossfadePolicy: 'live-live' }),
      wholeOutputTransition('transition-the-dancer-enters', 'crossfade', 18_400, ['bands-the-dancer-enters-nw', 'bands-the-dancer-enters-se', 'dancer-the-dancer-enters-ne', 'dancer-the-dancer-enters-sw'], ['bands-lace-and-turns', 'lace-lace-and-turns-ne', 'lace-lace-and-turns-sw'], 800, SINE_IN_OUT, { crossfadePolicy: 'live-live' }),
      wholeOutputTransition('transition-lace-and-turns', 'crossfade', 31_200, ['bands-lace-and-turns', 'lace-lace-and-turns-ne', 'lace-lace-and-turns-sw'], ['bands-all-four-dance', 'lace-all-four-dance-ne', 'lace-all-four-dance-nw', 'lace-all-four-dance-se', 'lace-all-four-dance-sw'], 800, SINE_IN_OUT, { crossfadePolicy: 'live-live' }),
      wholeOutputTransition('transition-all-four-dance', 'crossfade', 44_000, ['bands-all-four-dance', 'lace-all-four-dance-ne', 'lace-all-four-dance-nw', 'lace-all-four-dance-se', 'lace-all-four-dance-sw'], ['bands-rejoined', 'lace-rejoined'], 800, SINE_IN_OUT, { crossfadePolicy: 'live-live' }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-main', 0, 51_200),
    ],
    propertyTracks: [
      propertyTrack('clock-the-dancer-enters', { kind: 'instance-time-scale', instanceId: 'dancer' }, 12_800, 6_400, [
        propertyKey('clock-the-dancer-enters-a', 12_800, 0.384, LINEAR),
        propertyKey('clock-the-dancer-enters-b', 17_200, 0.16),
        propertyKey('clock-the-dancer-enters-c', 17_800, 1.3173),
        propertyKey('clock-the-dancer-enters-d', 18_400, 0.384, LINEAR),
      ]),
      propertyTrack('clock-lace-and-turns', { kind: 'instance-time-scale', instanceId: 'dancer' }, 19_200, 12_800, [
        propertyKey('clock-lace-and-turns-a', 19_200, 0.384, LINEAR),
        propertyKey('clock-lace-and-turns-b', 31_200, 0.384, LINEAR),
      ]),
      propertyTrack('turn-ground', { kind: 'clip-transform', clipId: 'bands-lace-and-turns', property: 'rotation' }, 18_400, 13_600, [
        propertyKey('turn-ground-a', 25_600, 0, LINEAR),
        propertyKey('turn-ground-b', 31_200, 0.25, LINEAR),
      ]),
      propertyTrack('turn-ne', { kind: 'clip-transform', clipId: 'lace-lace-and-turns-ne', property: 'rotation' }, 18_400, 13_600, [
        propertyKey('turn-ne-a', 27_200, 0, LINEAR),
        propertyKey('turn-ne-b', 28_600, 0.25, LINEAR),
      ]),
      propertyTrack('turn-sw', { kind: 'clip-transform', clipId: 'lace-lace-and-turns-sw', property: 'rotation' }, 18_400, 13_600, [
        propertyKey('turn-sw-a', 28_800, 0.5, LINEAR),
        propertyKey('turn-sw-b', 30_200, 0.75, LINEAR),
      ]),
      propertyTrack('clock-all-four-dance', { kind: 'instance-time-scale', instanceId: 'dancer' }, 32_000, 12_800, [
        propertyKey('clock-all-four-dance-a', 32_000, 0.384, LINEAR),
        propertyKey('clock-all-four-dance-b', 44_000, 0.384, LINEAR),
      ]),
      propertyTrack('reflection-steps', { kind: 'instance-control', instanceId: 'dancer', exportName: 'sliderReflections' }, 32_000, 12_800, [
        propertyKey('refl-a', 32_000, 0, LINEAR),
        propertyKey('refl-b', 35_150, 0, LINEAR),
        propertyKey('refl-c', 35_200, 0.35, LINEAR),
        propertyKey('refl-d', 38_350, 0.35, LINEAR),
        propertyKey('refl-e', 38_400, 0.7, LINEAR),
      ]),
      propertyTrack('twist-deepen', { kind: 'instance-control', instanceId: 'dancer', exportName: 'sliderTwist' }, 32_000, 12_800, [
        propertyKey('twist-a', 32_000, 0.66, LINEAR),
        propertyKey('twist-b', 37_600, 0.85, LINEAR),
      ]),
      propertyTrack('clock-rejoined', { kind: 'instance-time-scale', instanceId: 'dancer' }, 44_800, 6_400, [
        propertyKey('clock-rejoined-a', 44_800, 0.384, LINEAR),
        propertyKey('clock-rejoined-b', 51_200, 0.384, LINEAR),
      ]),
      propertyTrack('reflection-final', { kind: 'instance-control', instanceId: 'dancer', exportName: 'sliderReflections' }, 44_800, 6_400, [
        propertyKey('reflection-final-a', 44_800, 0.7, LINEAR),
        propertyKey('reflection-final-b', 51_200, 0.7, LINEAR),
      ]),
      propertyTrack('twist-final', { kind: 'instance-control', instanceId: 'dancer', exportName: 'sliderTwist' }, 44_800, 6_400, [
        propertyKey('twist-final-a', 44_800, 0.85, LINEAR),
        propertyKey('twist-final-b', 51_200, 0.85, LINEAR),
      ]),
    ],
    markers: [
      chapter('scene-marker:first-light', 0, 'First light'),
      chapter('scene-marker:four-mirrors', 6_400, 'Four mirrors'),
      chapter('scene-marker:the-dancer-enters', 12_800, 'The dancer enters'),
      chapter('scene-marker:lace-and-turns', 19_200, 'Lace and turns'),
      chapter('scene-marker:all-four-dance', 32_000, 'All four dance'),
      chapter('scene-marker:rejoined', 44_800, 'Rejoined'),
    ],
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
function overtureRemixV2(): ShowRecordV2 {
  const zones = physicalZones(['Stage', 'Arch', 'Columns'], [250, 250, 500])
  return nativeShowV2({
    id: 'stock-show-remix-overture',
    name: 'Overture Installation',
    zones,
    zoneLayouts: [physicalLayout('layout-stage', 'Proscenium stage', zones, [[[250, 499]], [[500, 749]], [[0, 249], [750, 999]]])],
    stageMapId: 'proscenium-stage-2d',
    outputContract: installationOutputContract('proscenium-stage-2d', 1_000),
    executionModel: 'continuous',
    showEndMs: 48_750,
    patternInstances: [
      instance('marquee', 'LumaMarquee', 1, { sliderLoopInterval: 0.1875, sliderDirection: 1, sliderSpacing: 0.2347, sliderWidth: 0.3, sliderFeather: 0.18, sliderLean: 0.5 }),
      instance('rings', 'LumaRings', 1, { sliderLoopInterval: 0.1875, sliderDirection: 1, sliderSpacing: 0.55, sliderWidth: 0.45, sliderFeather: 0.8, sliderLean: 0.5 }),
      instance('surge', 'LumaMarquee', 1, { sliderLoopInterval: 0.375, sliderDirection: 1, sliderSpacing: 1, sliderWidth: 0.1, sliderFeather: 0.3, sliderLean: 0.9 }),
    ],
    layers: [mainLayer('zone-1'), overlayLayer('zone-1', 1, 'Bloom'), mainLayer('zone-2'), mainLayer('zone-3'), overlayLayer('zone-3', 1, 'Bolt out')],
    clips: [
      clip('arch-ignition', 'marquee', 'zone-2', mainLayerId('zone-2'), 0, 7_500, { effects: [{ id: 'tint-gold', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 0.72, highlightB: 0.22 }] }),
      clip('cols-canon', 'marquee', 'zone-3', mainLayerId('zone-3'), 3_750, 3_750, { effects: [{ id: 'tint-velvet', kind: 'color-map', amount: 1, shadowR: 0.05, shadowG: 0, shadowB: 0.02, highlightR: 0.62, highlightG: 0.1, highlightB: 0.16 }] }),
      clip('arch-reversed', 'marquee', 'zone-2', mainLayerId('zone-2'), 7_500, 7_500, { view: { mirror: true }, effects: [{ id: 'tint-velvet', kind: 'color-map', amount: 1, shadowR: 0.05, shadowG: 0, shadowB: 0.02, highlightR: 0.62, highlightG: 0.1, highlightB: 0.16 }] }),
      clip('cols-forward', 'marquee', 'zone-3', mainLayerId('zone-3'), 7_500, 3_750, { effects: [{ id: 'tint-gold', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 0.72, highlightB: 0.22 }] }),
      clip('stage-anticipation', 'rings', 'zone-1', mainLayerId('zone-1'), 7_500, 7_500, { view: { brightness: 0.35 }, effects: [{ id: 'tint-velvet', kind: 'color-map', amount: 1, shadowR: 0.05, shadowG: 0, shadowB: 0.02, highlightR: 0.62, highlightG: 0.1, highlightB: 0.16 }] }),
      clip('cols-reversed', 'marquee', 'zone-3', mainLayerId('zone-3'), 11_250, 3_750, { view: { mirror: true }, effects: [{ id: 'tint-gold', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 0.72, highlightB: 0.22 }] }),
      clip('arch-steady', 'marquee', 'zone-2', mainLayerId('zone-2'), 15_000, 6_094, { effects: [{ id: 'tint-gold', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 0.72, highlightB: 0.22 }] }),
      clip('cols-hold', 'marquee', 'zone-3', mainLayerId('zone-3'), 15_000, 7_500, { effects: [{ id: 'tint-gold-dim', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 0.55, highlightG: 0.38, highlightB: 0.1 }] }),
      clip('stage-velvet', 'rings', 'zone-1', mainLayerId('zone-1'), 15_000, 15_000, { view: { brightness: 0.8 }, effects: [{ id: 'tint-velvet', kind: 'color-map', amount: 1, shadowR: 0.05, shadowG: 0, shadowB: 0.02, highlightR: 0.62, highlightG: 0.1, highlightB: 0.16 }] }),
      clip('arch-blip', 'marquee', 'zone-2', mainLayerId('zone-2'), 21_094, 1_406, { effects: [{ id: 'tint-cyan', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 0.25, highlightG: 0.95, highlightB: 1 }] }),
      clip('arch-redchase', 'marquee', 'zone-2', mainLayerId('zone-2'), 22_500, 7_500, { effects: [{ id: 'tint-scarlet', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 0.26, highlightB: 0.16 }] }),
      clip('bloom-apex', 'rings', 'zone-1', overlayLayerId('zone-1', 1), 22_500, 7_500, { transform: { positionX: 0, positionY: -0.55, rotation: 0, scaleX: 1.6, scaleY: 1.6 }, effects: [{ id: 'bloom-key', kind: 'chroma-key', color: '#000000', tolerance: 0.08, softness: 0.1 }, { id: 'tint-gold', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 0.72, highlightB: 0.22 }] }),
      clip('cols-ember', 'marquee', 'zone-3', mainLayerId('zone-3'), 22_500, 7_500, { effects: [{ id: 'tint-velvet', kind: 'color-map', amount: 1, shadowR: 0.05, shadowG: 0, shadowB: 0.02, highlightR: 0.62, highlightG: 0.1, highlightB: 0.16 }] }),
      clip('surge-colA-bolt', 'surge', 'zone-3', mainLayerId('zone-3'), 30_000, 938, { aperture: { enabled: true, x: 0, y: 0, width: 1, height: 0.5, edge: 'hard' }, effects: [{ id: 'tint-cyan', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 0.25, highlightG: 0.95, highlightB: 1 }] }),
      clip('surge-stage-bolt', 'surge', 'zone-1', mainLayerId('zone-1'), 30_938, 937, { effects: [{ id: 'tint-cyan', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 0.25, highlightG: 0.95, highlightB: 1 }] }),
      clip('surge-arch-bolt', 'surge', 'zone-2', mainLayerId('zone-2'), 31_875, 938, { effects: [{ id: 'tint-cyan', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 0.25, highlightG: 0.95, highlightB: 1 }] }),
      clip('surge-colB-bolt', 'surge', 'zone-3', overlayLayerId('zone-3', 1), 32_813, 937, { aperture: { enabled: true, x: 0, y: 0.5, width: 1, height: 0.5, edge: 'hard' }, effects: [{ id: 'tint-cyan', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 0.25, highlightG: 0.95, highlightB: 1 }] }),
      clip('house-arch', 'rings', 'zone-2', mainLayerId('zone-2'), 33_750, 9_375, { transform: { positionX: 0, positionY: -0.5, rotation: 0, scaleX: 1.6, scaleY: 1.6 }, effects: [{ id: 'tint-gold', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 0.72, highlightB: 0.22 }] }),
      clip('house-bloom', 'rings', 'zone-1', overlayLayerId('zone-1', 1), 33_750, 9_375, { effects: [{ id: 'bloom-key', kind: 'chroma-key', color: '#000000', tolerance: 0.08, softness: 0.1 }, { id: 'tint-scarlet', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 0.26, highlightB: 0.16 }] }),
      clip('house-cols', 'marquee', 'zone-3', mainLayerId('zone-3'), 33_750, 9_375, { view: { mirror: true }, effects: [{ id: 'tint-gold', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 0.72, highlightB: 0.22 }] }),
      clip('house-velvet', 'rings', 'zone-1', mainLayerId('zone-1'), 33_750, 9_375, { effects: [{ id: 'tint-velvet', kind: 'color-map', amount: 1, shadowR: 0.05, shadowG: 0, shadowB: 0.02, highlightR: 0.62, highlightG: 0.1, highlightB: 0.16 }] }),
      clip('ghost-lamp', 'rings', 'zone-1', mainLayerId('zone-1'), 43_125, 5_625, { aperture: { enabled: true, x: 0.36, y: 0.33, width: 0.28, height: 0.34, aperture: 'ellipse', edge: 'soft', feather: 0.1 }, effects: [{ id: 'tint-ghost', kind: 'color-map', amount: 1, shadowR: 0, shadowG: 0, shadowB: 0, highlightR: 1, highlightG: 0.88, highlightB: 0.6 }] }),
    ],
    layoutOccurrences: [
      occurrence(1, 'layout-stage', 0, 48_750),
    ],
    markers: [
      chapter('scene-marker:the-circuits', 0, 'The circuits'),
      chapter('scene-marker:curtain-up', 15_000, 'Curtain up'),
      chapter('scene-marker:the-surge', 30_000, 'The surge'),
      chapter('scene-marker:the-house', 33_750, 'The house'),
    ],
  })
}

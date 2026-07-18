// Pattern field/shading incidence census for issue #540.
// Run the focused report test with:
// npx vitest run test/perf-harness/issue540.test.ts

import { DEMOS } from '../../src/pixelblaze/stock/patterns'
import {
  buildPatternFieldCensus,
  patternFieldControlExports,
  type PatternFieldCensusReview,
} from './showPatternFieldCensus'
import coronalMassEjectionSource from './fixtures/issue540/CoronalMassEjection2D.js?raw'
import lineDancerSource from './fixtures/issue540/LineDancer2D.js?raw'
import mandelbrotSource from './fixtures/issue540/Mandelbrot2D.js?raw'

const expensiveInseparablePatterns = new Set([
  'AuroraSphere',
  'CrystalLattice3D',
  'EventHorizon',
  'Harmonograph',
  'IridescentFibers',
  'Kishimisu',
  'LavaLamp3D',
  'MandelbulbHeartbeat',
  'MoireCathedral',
  'Murmuration',
  'NebulaSphere',
  'NeonCircuitBoard',
  'NeonSquircles',
  'Orrery3D',
  'PhantomStar',
  'PlasmaNebula',
  'RedlineMachine',
  'RibbonLoom',
  'SceneSplice',
  'SceneSplice3D',
  'ShaderShowcase',
  'StarNestReimagined',
  'TempestVolume3D',
  'ZippyZaps',
])

const candidateReviews: Record<string, PatternFieldCensusReview> = {
  Caustics: candidate({
    coverage: 'none',
    fieldControls: ['sliderDensity', 'sliderSharpness', 'sliderSpeed'],
    shadingControls: ['sliderTint'],
    producerOperationScore: 120,
    notes: 'Voronoi plus coherent-noise light intensity is one reusable scalar; HSV tinting is cheap.',
  }),
  GyroidGlow3D: candidate({
    coverage: 'exact-alpha',
    fieldControls: ['sliderScale', 'sliderSpeed'],
    shadingControls: ['sliderColor', 'sliderThickness'],
    producerOperationScore: 75,
    notes: 'Six trigonometric terms produce scalar gyroid distance g; surface, ribs, and color derive from g and coordinates.',
  }),
  KaleidoBloom: candidate({
    coverage: 'exact-alpha',
    fieldControls: ['sliderBreathe', 'sliderSpeed', 'sliderZoom'],
    shadingControls: ['sliderColorSpread'],
    producerOperationScore: 44,
    notes: 'Repeated dot/ring SDF union produces one distance; radial rainbow shading is independent and cheap.',
  }),
  MagneticFilaments: candidate({
    coverage: 'exact-alpha',
    fieldControls: [],
    shadingControls: ['sliderContrast', 'sliderGlow', 'sliderSpacing'],
    mixedControls: ['sliderSpeed'],
    producerOperationScore: 54,
    notes: 'Three inverse-distance charges produce signed scalar f; contour bands and small analytic cores shade it.',
  }),
  MetaballGarden: candidate({
    coverage: 'exact-alpha',
    fieldControls: ['sliderBlobCount', 'sliderSpeed'],
    shadingControls: ['sliderPalette'],
    mixedControls: ['sliderSoftness'],
    producerOperationScore: 80,
    notes: 'Three to five inverse-square blobs produce scalar density f; skin, rim, veins, and palette derive from f.',
  }),
  ShapeShifter: candidate({
    coverage: 'exact-alpha',
    fieldControls: ['sliderShape', 'sliderSpeed'],
    shadingControls: ['sliderColor', 'sliderContours', 'sliderFeather'],
    producerOperationScore: 85,
    notes: 'Two analytic SDF evaluations blend to one signed distance; fill, glow, bands, and color are downstream shading.',
  }),
  TopographicBloom: candidate({
    coverage: 'exact-alpha',
    fieldControls: [],
    shadingControls: ['sliderColor', 'sliderSpacing'],
    mixedControls: ['sliderLayers', 'sliderSpeed'],
    producerOperationScore: 76,
    notes: 'Four circle SDFs and smooth unions produce one signed distance; contours, fill, edge, and hue consume it.',
  }),
}

function candidate(
  review: Pick<PatternFieldCensusReview, 'coverage' | 'fieldControls' | 'shadingControls' | 'producerOperationScore' | 'notes'>
    & Partial<Pick<PatternFieldCensusReview, 'mixedControls'>>,
): PatternFieldCensusReview {
  return {
    geometry: 'expensive',
    shading: 'separable',
    renderPurity: 'pure',
    mixedControls: [],
    timeDependencies: ['beforeRender frame state'],
    stateDependencies: [],
    expectedConsumerMultiplicity: 2,
    ...review,
  }
}

function reviewedNegative(name: string, source: string): PatternFieldCensusReview {
  const expensive = expensiveInseparablePatterns.has(name)
  return {
    geometry: expensive ? 'expensive' : 'cheap',
    shading: 'inseparable',
    coverage: 'none',
    renderPurity: 'indeterminate',
    fieldControls: [],
    shadingControls: [],
    mixedControls: patternFieldControlExports(source),
    timeDependencies: /\bbeforeRender\s*\(/.test(source) ? ['beforeRender frame state'] : [],
    stateDependencies: [],
    expectedConsumerMultiplicity: 1,
    producerOperationScore: 0,
    notes: expensive
      ? 'Reviewed negative: expensive work produces multiple coupled values or accumulates color directly; no exact scalar split.'
      : 'Reviewed negative: no distinct expensive scalar producer whose reuse would repay capture and replay.',
  }
}

const bundledPatterns = Object.entries(DEMOS)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, source]) => ({
    id: `bundled:${name}`,
    name,
    provenance: 'bundled' as const,
    sourceRef: `src/pixelblaze/stock/patterns/${name}.js`,
    source,
    review: candidateReviews[name] ?? reviewedNegative(name, source),
  }))

const communityPatterns = [
  {
    id: 'community:electromage:coronal-mass-ejection-2d',
    name: 'Coronal Mass Ejection 2D',
    provenance: 'community' as const,
    sourceRef: 'https://electromage.com/patterns/',
    source: coronalMassEjectionSource,
    review: {
      ...reviewedNegative('Coronal Mass Ejection 2D', coronalMassEjectionSource),
      geometry: 'expensive' as const,
      renderPurity: 'render-mutating' as const,
      notes: 'Noise produces a reusable brightness scalar, but render writes undeclared global scratch; it is not contract-safe without refactoring.',
    },
  },
  {
    id: 'community:electromage:line-dancer-2d',
    name: 'Line Dancer 2D',
    provenance: 'community' as const,
    sourceRef: 'https://electromage.com/patterns/',
    source: lineDancerSource,
    review: {
      ...reviewedNegative('Line Dancer 2D', lineDancerSource),
      renderPurity: 'render-mutating' as const,
      notes: 'Polar geometry and brightness remain coupled, and the kal helper writes global coordinate scratch during render.',
    },
  },
  {
    id: 'community:electromage:mandelbrot-set-2d',
    name: 'Mandelbrot Set 2D',
    provenance: 'community' as const,
    sourceRef: 'https://electromage.com/patterns/',
    source: mandelbrotSource,
    review: {
      ...reviewedNegative('Mandelbrot Set 2D', mandelbrotSource),
      geometry: 'expensive' as const,
      coverage: 'exact-empty' as const,
      renderPurity: 'render-mutating' as const,
      notes: 'Escape iteration is an ideal scalar and exact empty mask, but undeclared x2/y2 mutate global scratch; a trivial localization would make it a future candidate.',
    },
  },
]

export const issue540Report = buildPatternFieldCensus([...bundledPatterns, ...communityPatterns], {
  minimumCandidateCount: 3,
  minimumCandidateRatio: 0.1,
  minimumProducerOperationScore: 40,
})

if (process.env.ISSUE540_REPORT) {
  console.log(JSON.stringify(issue540Report, null, 2))
}

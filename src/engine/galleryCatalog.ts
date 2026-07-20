import { DEMO_AUTHORS, DEMOS } from '@/pixelblaze/stock/patterns'
import { matchesLens, matchesQuery, nativeDim, type DimLens } from './dimLens'

export interface GalleryPattern {
  name: string
  slug: string
  src: string
  dim: 1 | 2 | 3
  authors?: string[]
  sections: string[]
}

export interface GalleryFilter {
  lens: DimLens
  category: string
  query: string
}

export const GALLERY_ALL_CATEGORY = 'Everything'

export const OPENGL_DEMOS = ['Kishimisu', 'NeonSquircles', 'ZippyZaps', 'IQPalettes', 'PhantomStar', 'IridescentFibers']
export const BRAND_NEW_DEMOS = ['PlasmaNebula', 'Caustics', 'ShaderShowcase']

// Everything whose native renderer is render3D, regardless of cost class.
// TestPattern3D stays with the other diagnostic patterns.
export const THREE_D_DEMOS = [
  'AuroraSphere',
  'CorePulse3D',
  'CrystalLattice3D',
  'CrystalRain3D',
  'GyroidGlow3D',
  'HelixForge3D',
  'KineticSculpture',
  'LatticeWarp3D',
  'LavaLamp3D',
  'MandelbulbHeartbeat',
  'NebulaShells3D',
  'NebulaSphere',
  'Orrery3D',
  'SceneSplice3D',
  'ShoalScatter3D',
  'TempestVolume3D',
  'VoxelFireflies3D',
]

// Pixelblaze-native sketches built around cheap fields, SDFs, and 3D math that
// should scale better than direct shader ports.
export const FPS_FRIENDLY_DEMOS = [
  'KaleidoBloom',
  'CompassRose',
  'HeatShimmerTiles',
  'MagneticFilaments',
  'MetaballGarden',
  'MoireCathedral',
  'NeonCircuitBoard',
  'RibbonLoom',
  'SignalMandala',
  'StainedGlassWeather',
  'TopographicBloom',
  'ShapeShifter',
  'EventHorizon',
  'ClockworkIris',
  'SceneSplice',
]

// 1D effects that lean on rhythm and emergence rather than the usual chases and
// crawls.
export const LIVING_1D_DEMOS = ['PulseLoom', 'FireflyChoir', 'CometLoom', 'MetroLines', 'ImpactEngine', 'StandingWaveOrgan', 'EmberSpire', 'PendulumWave', 'RivalryRing']

// Minimal patterns - one per render dimensionality - for visually verifying
// 1D / 2D / 3D preview behavior.
export const TEST_PATTERNS = ['EasedSweep', 'TestPattern1D', 'TestPattern2D', 'TestPattern3D']

const DEMO_NAMES = Object.keys(DEMOS).sort()
const GROUPED_DEMOS = new Set([
  ...OPENGL_DEMOS,
  ...BRAND_NEW_DEMOS,
  ...THREE_D_DEMOS,
  ...FPS_FRIENDLY_DEMOS,
  ...LIVING_1D_DEMOS,
  ...TEST_PATTERNS,
])

const demoSectionNames = (names: string[]) =>
  names.filter((n) => DEMO_NAMES.includes(n)).sort((a, b) => a.localeCompare(b))

export const DEMO_SECTIONS: { label: string; names: string[] }[] = [
  { label: 'ShaderToy Ports', names: demoSectionNames(OPENGL_DEMOS) },
  { label: 'Old Favorites', names: DEMO_NAMES.filter((n) => !GROUPED_DEMOS.has(n)) },
  { label: 'FPS Heavyweights', names: demoSectionNames(BRAND_NEW_DEMOS) },
  { label: 'FPS Friendly', names: demoSectionNames(FPS_FRIENDLY_DEMOS) },
  { label: '3D', names: demoSectionNames(THREE_D_DEMOS) },
  { label: 'Living 1D', names: demoSectionNames(LIVING_1D_DEMOS) },
  { label: 'Test Patterns', names: demoSectionNames(TEST_PATTERNS) },
]

export const GALLERY_CATEGORIES = [
  GALLERY_ALL_CATEGORY,
  ...DEMO_SECTIONS.map((section) => section.label),
]

export function patternSlug(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

export const GALLERY_PATTERNS: GalleryPattern[] = DEMO_NAMES.map((name) => {
  const sections = DEMO_SECTIONS.filter((section) => section.names.includes(name)).map((section) => section.label)
  return {
    name,
    slug: patternSlug(name),
    src: DEMOS[name],
    dim: nativeDim(DEMOS[name]),
    ...(DEMO_AUTHORS[name]?.length ? { authors: DEMO_AUTHORS[name] } : {}),
    sections,
  }
})

export function galleryPatternBySlug(slug: string): GalleryPattern | undefined {
  return GALLERY_PATTERNS.find((pattern) => pattern.slug === slug)
}

export function filterGalleryPatterns(
  patterns: readonly GalleryPattern[],
  filter: GalleryFilter,
): GalleryPattern[] {
  return patterns.filter((pattern) => {
    const categoryMatches =
      filter.category === GALLERY_ALL_CATEGORY || pattern.sections.includes(filter.category)
    return (
      matchesLens(pattern.dim, filter.lens) &&
      categoryMatches &&
      matchesQuery(pattern.name, filter.query)
    )
  })
}

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
export const BRAND_NEW_DEMOS = ['PlasmaNebula', 'Caustics', 'ShaderShowcase', 'RedlineMachinePortable']

// ZRanger1's original Patterns with at least three favorites in the public
// Pixelblaze Pattern Library as of 2026-08-06. Favorites break the primary tie
// by downloads, and third-party remixes are excluded. Distinct published
// versions remain distinct entries unless one strictly supersedes the other:
// Doom Fire v2.0 carries every v1 control plus Wind, so v1 is not shipped
// (#63). Keep this declared popularity order rather than alphabetizing the
// author folder.
export const ZRANGER1_DEMOS = [
  'Oasis',
  'LineDancer2D',
  'CoronalMassEjection',
  'PerlinKaleidoscope2D',
  'VoronoiMix2D',
  'DoomFireV20_2D',
  'Bouncer3D',
  'RealWorldLights',
  'WavyBands',
  'PerlinFireWindTunnel',
  'IceFloes2D',
  'Stacker',
  'FastPaletteBlending',
  'MultisegmentDemo',
  'Mandelbrot2D',
  'Newfire',
  'BlueHolidayCandle2D',
  'Stairmaster2D',
  'AllLasersFire',
  'CrawlingSpider2D',
  'BubbleColumn',
  'Raindrops2D',
  'TunnelOfSquares2D',
  'InfinityFlower2D',
  'GeometryMorphingDemo2D',
  'BlueHolidayStar2D',
  'CyclicCellularAutomata2D',
  'CellularAutomata1D',
  'MetaballsOfFire2D',
  'Butterfly2D',
  'TimeFlies2D',
  'CarriesHolidayStar2D',
]

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
  'HeatShimmerTiles',
  'MagneticFilaments',
  'MetaballGarden',
  'MoireCathedral',
  'NeonCircuitBoard',
  'RibbonLoom',
  'StainedGlassWeather',
  'SceneSplice',
]

// Patterns organized around a center point and a circular focus: dials, rings,
// mandalas, and orbital fields.
export const RADIAL_DEMOS = [
  'ClockworkIris',
  'CompassRose',
  'EventHorizon',
  'ShapeShifter',
  'SignalMandala',
  'TopographicBloom',
]

// 1D effects that lean on rhythm and emergence rather than the usual chases and
// crawls.
export const LIVING_1D_DEMOS = ['PulseLoom', 'FireflyChoir', 'CometLoom', 'MetroLines', 'ImpactEngine', 'StandingWaveOrgan', 'EmberSpire', 'PendulumWave', 'RivalryRing']

// The Luma family (#819): grayscale tiling key-source Patterns sharing one
// control ontology. Show ingredients rather than finished pieces, so like
// Test Patterns they live in the rail but never in the gallery.
export const LUMA_DEMOS = [
  'LumaStripes',
  'LumaChevron',
  'LumaRings',
  'LumaPinwheel',
  'LumaDots',
  'LumaWeave',
  'LumaSpiral',
  'LumaMarquee',
]

// Minimal patterns - one per render dimensionality - for visually verifying
// 1D / 2D / 3D preview behavior.
export const TEST_PATTERNS = [
  'AnalogWiggleFinder',
  'EasedSweep',
  'MapAlignmentDiagnostic',
  'TestPattern1D',
  'TestPattern2D',
  'TestPattern3D',
]

const DEMO_NAMES = Object.keys(DEMOS).sort()
const GROUPED_DEMOS = new Set([
  ...OPENGL_DEMOS,
  ...BRAND_NEW_DEMOS,
  ...ZRANGER1_DEMOS,
  ...THREE_D_DEMOS,
  ...FPS_FRIENDLY_DEMOS,
  ...RADIAL_DEMOS,
  ...LIVING_1D_DEMOS,
  ...LUMA_DEMOS,
  ...TEST_PATTERNS,
])

const demoSectionNames = (names: string[]) =>
  names.filter((n) => DEMO_NAMES.includes(n)).sort((a, b) => a.localeCompare(b))

export const DEMO_SECTIONS: { label: string; names: string[] }[] = [
  { label: 'ZRanger1', names: ZRANGER1_DEMOS.filter((name) => DEMO_NAMES.includes(name)) },
  { label: 'ShaderToy Ports', names: demoSectionNames(OPENGL_DEMOS) },
  { label: 'FPS Heavyweights', names: demoSectionNames(BRAND_NEW_DEMOS) },
  // FPS Friendly doubles as the catch-all: any pattern not claimed by another
  // group lands here rather than disappearing from the gallery and rail.
  { label: 'FPS Friendly', names: demoSectionNames([...FPS_FRIENDLY_DEMOS, ...DEMO_NAMES.filter((n) => !GROUPED_DEMOS.has(n))]) },
  { label: 'Radial', names: demoSectionNames(RADIAL_DEMOS) },
  { label: '3D', names: demoSectionNames(THREE_D_DEMOS) },
  { label: 'Living 1D', names: demoSectionNames(LIVING_1D_DEMOS) },
  { label: 'Luma Sources', names: demoSectionNames(LUMA_DEMOS) },
  { label: 'Test Patterns', names: demoSectionNames(TEST_PATTERNS) },
]

// Utility sections: present in the pattern rail, absent from the gallery.
// These are ingredients and diagnostics, not finished pieces.
const NON_GALLERY_SECTIONS = new Set(['Test Patterns', 'Luma Sources'])

const GALLERY_SECTIONS = DEMO_SECTIONS.filter((section) => !NON_GALLERY_SECTIONS.has(section.label))

export const GALLERY_CATEGORIES = [
  GALLERY_ALL_CATEGORY,
  ...GALLERY_SECTIONS.map((section) => section.label),
]

export function patternSlug(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

export interface GalleryDirectory {
  label: string
  slug: string
}

export function galleryDirectorySlug(label: string): string {
  return label
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

export const GALLERY_DIRECTORIES: GalleryDirectory[] = GALLERY_SECTIONS.map((section) => ({
  label: section.label,
  slug: galleryDirectorySlug(section.label),
}))

export function galleryDirectoryBySlug(slug: string): GalleryDirectory | undefined {
  return GALLERY_DIRECTORIES.find((directory) => directory.slug === slug)
}

export const STOCK_PATTERNS: GalleryPattern[] = DEMO_NAMES.map((name) => {
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

export const GALLERY_PATTERNS = STOCK_PATTERNS.filter(
  (pattern) => !pattern.sections.some((section) => NON_GALLERY_SECTIONS.has(section)),
)

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

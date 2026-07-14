export type ShowDistortionCandidateId =
  | 'ripple'
  | 'swirl'
  | 'stretch'
  | 'bulge'
  | 'pinch'
  | 'pixelate'
  | 'kaleidoscope'
  | 'glitch'

export type ShowDistortionRecommendation = 'ship' | 'covered-by-affine' | 'defer'
export type ShowDistortionQualityPolicy = 'cheap' | 'smooth'

export interface ShowDistortionOperationEstimate {
  scalar: number
  floor: number
  trig: number
  sqrt: number
  atan2: number
}

export interface ShowDistortionCandidate {
  id: ShowDistortionCandidateId
  label: string
  recommendation: ShowDistortionRecommendation
  qualityPolicy: ShowDistortionQualityPolicy
  rationale: string
  operations: ShowDistortionOperationEstimate
  generatedSource: string
  sample: (x: number, y: number) => readonly [number, number]
}

export interface ShowDistortionBenchmarkResult {
  id: ShowDistortionCandidateId
  recommendation: ShowDistortionRecommendation
  qualityPolicy: ShowDistortionQualityPolicy
  generatedCodeBytes: number
  operations: ShowDistortionOperationEstimate
  previewChecksum: string
  /** Populated only by the representative-device harness. */
  representativeHardwareFps: number | null
}

const TAU = Math.PI * 2

export const SHOW_DISTORTION_CANDIDATES: readonly ShowDistortionCandidate[] = [
  {
    id: 'ripple',
    label: 'Ripple',
    recommendation: 'ship',
    qualityPolicy: 'smooth',
    rationale: 'A bounded radial wave animates continuously and keeps one source sample per output pixel.',
    operations: { scalar: 18, floor: 0, trig: 1, sqrt: 1, atan2: 0 },
    generatedSource: 'r=hypot(x-.5,y-.5); d=.08*sin((r*8+.125)*PI2); x+=(x-.5)*d/max(r,.000001); y+=(y-.5)*d/max(r,.000001)',
    sample: (x, y) => radialOffset(x, y, 0.08 * Math.sin((Math.hypot(x - 0.5, y - 0.5) * 8 + 0.125) * TAU)),
  },
  {
    id: 'swirl',
    label: 'Swirl',
    recommendation: 'ship',
    qualityPolicy: 'smooth',
    rationale: 'A radius-bounded angular warp is continuous, predictable under animation, and visually distinct from Rotate.',
    operations: { scalar: 22, floor: 0, trig: 2, sqrt: 1, atan2: 0 },
    generatedSource: 'dx=x-.5;dy=y-.5;r=hypot(dx,dy);a=.75*pow(max(0,1-r/.7),2)*PI2;x=.5+dx*cos(a)-dy*sin(a);y=.5+dx*sin(a)+dy*cos(a)',
    sample: (x, y) => {
      const dx = x - 0.5
      const dy = y - 0.5
      const radius = Math.hypot(dx, dy)
      const angle = 0.75 * Math.max(0, 1 - radius / 0.7) ** 2 * TAU
      return [0.5 + dx * Math.cos(angle) - dy * Math.sin(angle), 0.5 + dx * Math.sin(angle) + dy * Math.cos(angle)]
    },
  },
  {
    id: 'stretch',
    label: 'Stretch',
    recommendation: 'covered-by-affine',
    qualityPolicy: 'cheap',
    rationale: 'Scale and Shear already cover the useful continuous stretch vocabulary with lower code and runtime cost.',
    operations: { scalar: 4, floor: 0, trig: 0, sqrt: 0, atan2: 0 },
    generatedSource: 'x=.5+(x-.5)/1.6;y=.5+(y-.5)/.75',
    sample: (x, y) => [0.5 + (x - 0.5) / 1.6, 0.5 + (y - 0.5) / 0.75],
  },
  {
    id: 'bulge',
    label: 'Bulge',
    recommendation: 'ship',
    qualityPolicy: 'smooth',
    rationale: 'Bulge and Pinch share one stable radial-warp implementation and differ only by the signed Amount preset.',
    operations: { scalar: 17, floor: 0, trig: 0, sqrt: 1, atan2: 0 },
    generatedSource: 'dx=x-.5;dy=y-.5;r=hypot(dx,dy);s=1+.65*pow(max(0,1-r/.7),2);x=.5+dx/s;y=.5+dy/s',
    sample: (x, y) => radialScale(x, y, 0.65),
  },
  {
    id: 'pinch',
    label: 'Pinch',
    recommendation: 'ship',
    qualityPolicy: 'smooth',
    rationale: 'Pinch is the negative Amount preset of the selected radial-warp implementation, not a second runtime.',
    operations: { scalar: 17, floor: 0, trig: 0, sqrt: 1, atan2: 0 },
    generatedSource: 'dx=x-.5;dy=y-.5;r=hypot(dx,dy);s=1-.65*pow(max(0,1-r/.7),2);x=.5+dx/max(.05,s);y=.5+dy/max(.05,s)',
    sample: (x, y) => radialScale(x, y, -0.65),
  },
  {
    id: 'pixelate',
    label: 'Pixelate',
    recommendation: 'ship',
    qualityPolicy: 'cheap',
    rationale: 'Two floor calls provide a deliberate low-resolution look with no extra Pattern samples or temporal instability.',
    operations: { scalar: 8, floor: 2, trig: 0, sqrt: 0, atan2: 0 },
    generatedSource: 'x=(floor(x*12)+.5)/12;y=(floor(y*10)+.5)/10',
    sample: (x, y) => [(Math.floor(x * 12) + 0.5) / 12, (Math.floor(y * 10) + 0.5) / 10],
  },
  {
    id: 'kaleidoscope',
    label: 'Kaleidoscope',
    recommendation: 'ship',
    qualityPolicy: 'smooth',
    rationale: 'Folded polar coordinates produce a strong signature effect while retaining one Pattern sample per pixel.',
    operations: { scalar: 19, floor: 1, trig: 2, sqrt: 1, atan2: 1 },
    generatedSource: 'dx=x-.5;dy=y-.5;r=hypot(dx,dy);a=abs(frac((atan2(dy,dx)/PI2+.125)*6)-.5)/6;x=.5+r*cos(a*PI2);y=.5+r*sin(a*PI2)',
    sample: (x, y) => {
      const dx = x - 0.5
      const dy = y - 0.5
      const radius = Math.hypot(dx, dy)
      const turn = positiveFraction((Math.atan2(dy, dx) / TAU + 0.125) * 6)
      const angle = Math.abs(turn - 0.5) / 6 * TAU
      return [0.5 + radius * Math.cos(angle), 0.5 + radius * Math.sin(angle)]
    },
  },
  {
    id: 'glitch',
    label: 'Glitch',
    recommendation: 'defer',
    qualityPolicy: 'cheap',
    rationale: 'Deterministic scanline jumps are cheap but visually style-specific and discontinuous when animated.',
    operations: { scalar: 13, floor: 3, trig: 1, sqrt: 0, atan2: 0 },
    generatedSource: 'band=floor(y*12);shift=frac(sin((band+7)*91.7)*43758.5)-.5;x=frac(x+shift*.18)',
    sample: (x, y) => {
      const band = Math.floor(y * 12)
      const shift = positiveFraction(Math.sin((band + 7) * 91.7) * 43_758.5) - 0.5
      return [positiveFraction(x + shift * 0.18), y]
    },
  },
]

export function benchmarkShowDistortionCandidates(): ShowDistortionBenchmarkResult[] {
  return SHOW_DISTORTION_CANDIDATES.map((candidate) => ({
    id: candidate.id,
    recommendation: candidate.recommendation,
    qualityPolicy: candidate.qualityPolicy,
    generatedCodeBytes: new TextEncoder().encode(candidate.generatedSource).byteLength,
    operations: { ...candidate.operations },
    previewChecksum: previewChecksum(candidate),
    representativeHardwareFps: null,
  }))
}

function previewChecksum(candidate: ShowDistortionCandidate): string {
  let hash = 0x811c9dc5
  for (let row = 0; row < 16; row += 1) {
    for (let column = 0; column < 16; column += 1) {
      const [x, y] = candidate.sample(column / 15, row / 15)
      for (const value of [x, y]) {
        const quantized = Math.round(value * 1_000_000)
        hash ^= quantized
        hash = Math.imul(hash, 0x01000193) >>> 0
      }
    }
  }
  return hash.toString(16).padStart(8, '0')
}

function radialOffset(x: number, y: number, offset: number): readonly [number, number] {
  const dx = x - 0.5
  const dy = y - 0.5
  const radius = Math.max(0.000001, Math.hypot(dx, dy))
  return [x + dx * offset / radius, y + dy * offset / radius]
}

function radialScale(x: number, y: number, amount: number): readonly [number, number] {
  const dx = x - 0.5
  const dy = y - 0.5
  const radius = Math.hypot(dx, dy)
  const scale = Math.max(0.05, 1 + amount * Math.max(0, 1 - radius / 0.7) ** 2)
  return [0.5 + dx / scale, 0.5 + dy / scale]
}

function positiveFraction(value: number): number {
  return value - Math.floor(value)
}

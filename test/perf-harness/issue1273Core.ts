// Pure pieces of the #1273 Wrappers hardware probe. No I/O.
//
// The probe pushes today's Slow-mo wrapper (src/engine/slowMo.ts) to a bench
// Controller. Everything the probe adds lives here, harness-only: the Dreamy
// slider export, the alternative slider names, an effective-mode read-back and
// the small probe Patterns that record what each slider handler receives.

import { emitSlowMoWrapper, type SlowMoPlan, type SlowMoSettings, SLOW_MO_SPEED_SLIDER } from '../../src/engine/slowMo'
import { PIXELBLAZE_ARRAY_HEADER_WORDS, PIXELBLAZE_VM_ARRAY_WORDS } from '../../src/engine/showVmResourceLedger'

const P = '__pxlblz_slowmo_'

/** The five FPS versions, in (position, dreamy) order. */
export const FPS_VERSIONS = [
  { key: 'U', label: 'unwrapped', settings: null },
  { key: 'D', label: 'defaults', settings: { position: 1, dreamy: 0 } },
  { key: 'S', label: 'Slow-mo only', settings: { position: 0.5, dreamy: 0 } },
  { key: 'R', label: 'Dreamy only', settings: { position: 1, dreamy: 0.5 } },
  { key: 'B', label: 'both', settings: { position: 0.5, dreamy: 0.5 } },
] as const satisfies ReadonlyArray<{ key: string; label: string; settings: SlowMoSettings | null }>

export type FpsVersionKey = (typeof FPS_VERSIONS)[number]['key']

/** Slider export names the label question compares. */
export const SLIDER_NAMES = {
  current: SLOW_MO_SPEED_SLIDER,
  plainSpeed: 'sliderSlowMo',
  prefixedSpeed: 'sliderPxlblzSlowMo',
  plainDreamy: 'sliderDreamy',
  prefixedDreamy: 'sliderPxlblzDreamy',
} as const

export interface Variant {
  code: string
  plan: SlowMoPlan | null
  /** Exported variables the runner reads back to prove the mode that ran. */
  readback: string[]
}

/** Dreamy export in the emitter's own units: decay = 10000 * v^2 ms. */
export function dreamySliderExport(name: string): string {
  return `export function ${name}(v) { v = clamp(v,0,1); ${P}decay = 10000*v*v }`
}

/** Slow-mo as an amount (decision 30): 0 is full speed, 1 is 1/16. */
export function amountSpeedSliderExport(name: string): string {
  return `export function ${name}(a) { ${P}position = 1 - clamp(a,0,1) }`
}

/** Copy the wrapper's effective settings into exported variables once per
 * frame, so getVars shows the mode that actually ran. */
export function withEffectiveReadback(code: string): string {
  const head = 'export function beforeRender(delta) {\n'
  if (code.split(head).length !== 2) throw new Error('wrapped code has no unique beforeRender header')
  return `export var probePos = -1, probeDecay = -1\n${code.replace(
    head,
    `${head}  probePos = ${P}position; probeDecay = ${P}decay\n`,
  )}`
}

/** Remove today's speed slider export, keeping the handler as a plain function. */
export function withoutCurrentSpeedExport(code: string): string {
  const exported = `export function ${SLOW_MO_SPEED_SLIDER}(`
  if (code.split(exported).length !== 2) throw new Error('wrapped code has no unique speed slider export')
  return code.replace(exported, `function ${SLOW_MO_SPEED_SLIDER}(`)
}

export interface VariantOptions {
  /** Add the Dreamy slider under this name. Default `sliderDreamy`. */
  dreamySlider?: string | null
  /** Replace today's speed export with an amount slider under this name. */
  amountSpeedSlider?: string | null
}

/** One FPS or hand-test version. `settings: null` is the unwrapped source. */
export function buildVariant(
  source: string,
  settings: SlowMoSettings | null,
  pixelCount: number,
  options: VariantOptions = {},
): Variant {
  if (!settings) return { code: source, plan: null, readback: [] }
  const wrapped = emitSlowMoWrapper(source, settings, pixelCount)
  if (wrapped.plan.declined) return { code: source, plan: wrapped.plan, readback: [] }
  let code = withEffectiveReadback(wrapped.code)
  if (options.amountSpeedSlider) {
    code = `${withoutCurrentSpeedExport(code)}\n${amountSpeedSliderExport(options.amountSpeedSlider)}`
  }
  const dreamy = options.dreamySlider === undefined ? SLIDER_NAMES.plainDreamy : options.dreamySlider
  if (dreamy) code = `${code}\n${dreamySliderExport(dreamy)}`
  return { code, plan: wrapped.plan, readback: ['probePos', 'probeDecay'] }
}

/** A handler that records its calls: `got<i>` holds the last argument
 * (sentinel 12345 until called) and `n<i>` counts calls. */
function recordingSlider(name: string, index: number): string {
  return `export var got${index} = 12345, n${index} = 0
export function ${name}(v) { got${index} = v; n${index} += 1 }`
}

const RECORDING_RENDER = (count: number, idleBrightness: number) => `
export function beforeRender(delta) { t1 = time(0.1) }
var t1 = 0
export function render2D(index, x, y) {
  var band = floor(x * ${count})
  var v = 0
${Array.from({ length: count }, (_, i) => `  if (band == ${i}) v = got${i} == 12345 ? 0.05 : clamp(got${i},0,1)`).join('\n')}
  hsv(band / ${count} + t1 * 0.1, 1, ${idleBrightness} + 0.8 * v * (y < v))
}
export function render(index) { render2D(index, index / pixelCount, 0.5) }`

/** Q3 and Q6: every name form, each recording what it receives. Vertical
 * bands show each slider's last value as a fill height. */
export function sliderProbeSource(names: readonly string[], salt = '', idleBrightness = 0.1): string {
  return `// #1273 slider probe${salt ? ` ${salt}` : ''}\n${names.map(recordingSlider).join('\n')}${RECORDING_RENDER(names.length, idleBrightness)}\n`
}

export const LABEL_PROBE_NAMES = [
  SLIDER_NAMES.current,
  SLIDER_NAMES.plainSpeed,
  SLIDER_NAMES.prefixedSpeed,
  SLIDER_NAMES.plainDreamy,
  SLIDER_NAMES.prefixedDreamy,
] as const

export type SurvivalCase = 'a' | 'b' | 'c'
export type SurvivalStep = 'initial' | 'rewrite' | 'restore'

// A single allocation one word above the budget, including its header.
export const OVER_BUDGET_PROBE_SOURCE = `var levels = array(${PIXELBLAZE_VM_ARRAY_WORDS + 1 - PIXELBLAZE_ARRAY_HEADER_WORDS})
export function render(index) { rgb(levels[index], 0, 0) }
`

/** Q4 sources. A and B start on the Pattern; (c) keeps A, removes B and adds
 * C, and its restore step brings B back under its exact original name. */
export function survivalSource(kase: SurvivalCase, step: SurvivalStep): { source: string; sliders: string[] } {
  const A = SLIDER_NAMES.plainSpeed
  const B = SLIDER_NAMES.plainDreamy
  const C = SLIDER_NAMES.prefixedDreamy
  if (step === 'initial' || kase === 'a') return { source: sliderProbeSource([A, B], 'survival v1'), sliders: [A, B] }
  if (kase === 'b') return { source: sliderProbeSource([A, B], 'survival v2 changed code', 0.2), sliders: [A, B] }
  if (step === 'rewrite') return { source: sliderProbeSource([A, C], 'survival v2 B removed C added'), sliders: [A, C] }
  return { source: sliderProbeSource([A, C, B], 'survival v3 B restored'), sliders: [A, C, B] }
}

/** The previous readback leaves the rewritten target active. Park before restoring it. */
export async function restoreSurvivalSliders<SaveResult, ReadBack>(
  park: () => Promise<void>,
  save: (source: string) => Promise<SaveResult>,
  readBack: (sliders: string[]) => Promise<ReadBack>,
) {
  const restore = survivalSource('c', 'restore')
  await park()
  const restoreSave = await save(restore.source)
  return {
    restoreSave,
    restoreSliders: restore.sliders,
    afterRestore: await readBack(restore.sliders),
  }
}

export interface FpsFrame { at: number; fps: number }
export interface FpsSummary { n: number; mean: number; min: number; max: number }

/** Only frames that arrive inside [from, to] count. Zero is a real report. */
export function summarizeFreshFps(frames: readonly FpsFrame[], from: number, to: number): FpsSummary | null {
  const values = frames.filter((f) => f.at >= from && f.at <= to).map((f) => f.fps)
  if (values.length === 0) return null
  return {
    n: values.length,
    mean: values.reduce((sum, v) => sum + v, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
  }
}

/** Decision 12: wrapped at defaults within 10% of unwrapped. */
export function defaultsVerdict(unwrappedMean: number, defaultsMean: number): { ratio: number; pass: boolean } {
  const ratio = defaultsMean / unwrappedMean
  return { ratio, pass: ratio >= 0.9 }
}

export interface ControllerSnapshot {
  activeProgramId?: string
  brightness?: number
  pixelCount?: number
  mapSha256?: string
  programs: Array<{ id: string; name: string }>
}

export interface BenchBaseline extends ControllerSnapshot {
  ip: string
  config?: Pick<ControllerSnapshot, 'activeProgramId' | 'brightness' | 'pixelCount'>
  map?: { sha256: string }
}

/** CLI snapshots have top-level fields. The original bench record nests config and map. */
export function restoreBaselineSnapshot(baseline: BenchBaseline): ControllerSnapshot & { activeProgramId: string } {
  const activeProgramId = baseline.activeProgramId ?? baseline.config?.activeProgramId
  const mapSha256 = baseline.mapSha256 ?? baseline.map?.sha256
  if (!activeProgramId) throw new Error('Baseline did not record the active Pattern')
  if (!mapSha256) throw new Error('Baseline did not record the map hash')
  return {
    activeProgramId,
    brightness: baseline.brightness ?? baseline.config?.brightness,
    pixelCount: baseline.pixelCount ?? baseline.config?.pixelCount,
    mapSha256,
    programs: baseline.programs,
  }
}

/** Restore check: every baseline field, and the saved list by id and name. */
export function compareRestore(before: ControllerSnapshot, after: ControllerSnapshot): { ok: boolean; differences: string[] } {
  const differences: string[] = []
  for (const field of ['activeProgramId', 'brightness', 'pixelCount', 'mapSha256'] as const) {
    if (before[field] !== after[field]) differences.push(`${field}: ${String(before[field])} -> ${String(after[field])}`)
  }
  const key = (p: { id: string; name: string }) => `${p.id}\t${p.name}`
  const afterKeys = new Set(after.programs.map(key))
  const beforeKeys = new Set(before.programs.map(key))
  for (const p of before.programs) if (!afterKeys.has(key(p))) differences.push(`missing ${p.id} ${p.name}`)
  for (const p of after.programs) if (!beforeKeys.has(key(p))) differences.push(`extra ${p.id} ${p.name}`)
  return { ok: differences.length === 0, differences }
}

/** Refuse any write that targets a Pattern the run started with. */
export function assertProbeTarget(id: string, baselineIds: ReadonlySet<string>): void {
  if (baselineIds.has(id)) throw new Error(`refusing a write to baseline Pattern ${id}`)
}

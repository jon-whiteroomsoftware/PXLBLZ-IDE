export interface FixtureSource {
  source: string
  description: string
  sourceLabel: string
}

export const routeTransitionFixtureNames = [
  'plain-wipe',
  'plain-dither',
  'pattern-wipe',
  'pattern-dither',
  'pattern-crossfade-baseline',
  'pattern-decimate',
] as const

export type RouteTransitionFixtureName = typeof routeTransitionFixtureNames[number]

export function isRouteTransitionFixtureName(
  fixture: string,
): fixture is RouteTransitionFixtureName {
  return routeTransitionFixtureNames.includes(fixture as RouteTransitionFixtureName)
}

export function routeTransitionFixtureList(): string {
  return routeTransitionFixtureNames.join(', ')
}

export function buildRouteTransitionFixtureSource(fixture: string): FixtureSource | null {
  if (!isRouteTransitionFixtureName(fixture)) return null

  switch (fixture) {
    case 'plain-wipe':
      return {
        source: routeTransitionSource({ renderer: 'plain', transition: 'wipe' }),
        description: 'route transition: plain red -> green wipe; each pixel calls exactly one member renderer',
        sourceLabel: 'Hand-written #332 route-transition source',
      }
    case 'plain-dither':
      return {
        source: routeTransitionSource({ renderer: 'plain', transition: 'dither' }),
        description: 'route transition: plain red -> green dither dissolve; each pixel calls exactly one member renderer',
        sourceLabel: 'Hand-written #332 route-transition source',
      }
    case 'pattern-wipe':
      return {
        source: routeTransitionSource({ renderer: 'pattern', transition: 'wipe' }),
        description: 'route transition: running warm chase -> cool bands wipe; each pixel calls exactly one member renderer',
        sourceLabel: 'Hand-written #332 running-pattern route source',
      }
    case 'pattern-dither':
      return {
        source: routeTransitionSource({ renderer: 'pattern', transition: 'dither' }),
        description: 'route transition: running warm chase -> cool bands dither dissolve; each pixel calls exactly one member renderer',
        sourceLabel: 'Hand-written #332 running-pattern route source',
      }
    case 'pattern-crossfade-baseline':
      return {
        source: routeTransitionSource({ renderer: 'pattern', transition: 'crossfade' }),
        description: 'baseline: running warm chase -> cool bands crossfade; every transition pixel calls both member renderers',
        sourceLabel: 'Hand-written #332 both-renderer baseline source',
      }
    case 'pattern-decimate':
      return {
        source: decimateSource(),
        description: 'negative-cost adaptation probe: evaluate one running pattern for every 4-pixel block and hold block color',
        sourceLabel: 'Hand-written #332 decimation source',
      }
  }
}

type RendererKind = 'plain' | 'pattern'
type TransitionKind = 'wipe' | 'dither' | 'crossfade'

function routeTransitionSource({
  renderer,
  transition,
}: {
  renderer: RendererKind
  transition: TransitionKind
}): string {
  const memberRenders = renderer === 'plain' ? plainMemberRenders() : patternMemberRenders()
  const transitionRender = transition === 'crossfade'
    ? crossfadeRender()
    : routeRender(transition)

  return `
export var seconds = 0
export var progress = 0
export var frames = 0
export var calls = 0
export var last = 0
export var callsA = 0
export var callsB = 0
export var lastA = 0
export var lastB = 0

var aT = 0
var bT = 0
var captureR = 0
var captureG = 0
var captureB = 0

function cycleProgress(seconds) {
  var cycle = seconds - floor(seconds / 6) * 6
  var p = cycle / 4
  if (p > 1) {
    p = 1
  }
  return p
}

function hash01(index) {
  return frac((index + 1) * 0.61803398875)
}

function captureRgb(r, g, b) {
  captureR = r
  captureG = g
  captureB = b
}

function clearCapture() {
  captureR = 0
  captureG = 0
  captureB = 0
}

function emitCapture() {
  rgb(captureR, captureG, captureB)
}

function beforeA(delta) {
  aT = aT + delta * 0.001
}

function beforeB(delta) {
  bT = bT + delta * 0.001
}

${memberRenders}

export function beforeRender(delta) {
  last = calls
  lastA = callsA
  lastB = callsB
  calls = 0
  callsA = 0
  callsB = 0
  frames = frames + 1
  seconds = seconds + delta * 0.001
  progress = cycleProgress(seconds)
  beforeA(delta)
  beforeB(delta)
}

${transitionRender}
`
}

function plainMemberRenders(): string {
  return `
function renderA(index) {
  calls = calls + 1
  callsA = callsA + 1
  captureRgb(1, 0, 0)
}

function renderB(index) {
  calls = calls + 1
  callsB = callsB + 1
  captureRgb(0, 1, 0)
}
`
}

function patternMemberRenders(): string {
  return `
function renderA(index) {
  calls = calls + 1
  callsA = callsA + 1
  var x = index / pixelCount
  var v = 0.18 + 0.82 * wave(aT * 0.85 + x * 3.0)
  var spark = wave(aT * 2.2 + x * 12.0)
  captureRgb(v, v * (0.18 + spark * 0.45), 0.02)
}

function renderB(index) {
  calls = calls + 1
  callsB = callsB + 1
  var x = index / pixelCount
  var v = 0.16 + 0.84 * wave(bT * 0.55 - x * 4.0)
  var stripe = wave(bT * 1.4 + x * 9.0)
  captureRgb(0.02, v * (0.22 + stripe * 0.38), v)
}
`
}

function routeRender(transition: 'wipe' | 'dither'): string {
  const chooser = transition === 'wipe'
    ? 'var chooseB = x < progress'
    : 'var chooseB = hash01(index) < progress'

  return `
export function render(index) {
  clearCapture()
  var x = index / pixelCount
  ${chooser}
  if (chooseB) {
    renderB(index)
  } else {
    renderA(index)
  }
  emitCapture()
}
`
}

function crossfadeRender(): string {
  return `
export function render(index) {
  clearCapture()
  renderA(index)
  var r0 = captureR
  var g0 = captureG
  var b0 = captureB
  clearCapture()
  renderB(index)
  rgb(
    r0 * (1 - progress) + captureR * progress,
    g0 * (1 - progress) + captureG * progress,
    b0 * (1 - progress) + captureB * progress
  )
}
`
}

function decimateSource(): string {
  return `
export var seconds = 0
export var progress = 0
export var frames = 0
export var calls = 0
export var last = 0
export var heldPixels = 4

var heldR = 0
var heldG = 0
var heldB = 0
var lastBlock = -1

function renderSource(index) {
  calls = calls + 1
  var x = index / pixelCount
  var v = 0.16 + 0.84 * wave(seconds * 0.75 + x * 5.0)
  heldR = v
  heldG = v * wave(seconds * 1.2 + x * 8.0)
  heldB = 0.04
}

export function beforeRender(delta) {
  last = calls
  calls = 0
  lastBlock = -1
  frames = frames + 1
  seconds = seconds + delta * 0.001
  progress = frac(seconds / 6)
}

export function render(index) {
  var block = floor(index / heldPixels)
  if (block != lastBlock) {
    lastBlock = block
    renderSource(block * heldPixels)
  }
  rgb(heldR, heldG, heldB)
}
`
}

// #561: per-pixel member pixelCount writes are frame-invariant whenever the
// member's virtual pixel count is provably uniform across every arm that can
// invoke it; the scheduler's per-frame write is then sufficient.
import { compileShow, type ShowRecipe } from './showCompiler'

const SOURCE = 'export function render(index) { hsv(index / pixelCount, 1, 0.8) }'

function routeRecipe(overrides: { unequalRepeat?: boolean } = {}): ShowRecipe {
  const zones = overrides.unequalRepeat
    ? [
        { id: 'a', name: 'a', ranges: [{ start: 0, end: 31 }] },
        { id: 'b', name: 'b', ranges: [{ start: 32, end: 63 }] },
        { id: 'c', name: 'c', ranges: [{ start: 64, end: 79 }] },
      ]
    : [
        { id: 'a', name: 'a', ranges: [{ start: 0, end: 31 }] },
        { id: 'b', name: 'b', ranges: [{ start: 32, end: 63 }] },
      ]
  return overrides.unequalRepeat
    ? {
        clips: [
          { id: 'wide', source: SOURCE, zones: ['b', 'c'], zoneMode: 'repeat' },
          { id: 'solo', source: SOURCE, zone: 'a' },
        ],
        zones,
      }
    : {
        clips: [
          { id: 'left', source: SOURCE, zone: 'a' },
          { id: 'right', source: SOURCE, zone: 'b' },
        ],
        zones,
      }
}

function sceneRecipe(): ShowRecipe {
  const stageZone = { id: 'stage', name: 'stage', ranges: [{ start: 0, end: 63 }] }
  return {
    clips: [{ id: 'a', source: SOURCE }, { id: 'b', source: SOURCE }],
    zones: [stageZone],
    routingLayouts: [{ id: 'stage', name: 'stage', zones: [stageZone] }],
    routedSceneSequence: {
      scenes: [
        {
          holdMs: 8_000,
          placements: [{ placementId: 'p0', zoneName: 'stage', clipId: 'a' }],
          transitionOut: { kind: 'crossfade', durationMs: 2_000 },
        },
        { holdMs: 8_000, placements: [{ placementId: 'p1', zoneName: 'stage', clipId: 'b' }] },
      ],
    },
    loopDurationMs: 18_000,
  }
}

function renderBody(expandedCode: string): string {
  const start = expandedCode.indexOf('export function render')
  expect(start).toBeGreaterThanOrEqual(0)
  return expandedCode.slice(start)
}

describe('per-pixel pixelCount constant-write hoisting (#561)', () => {
  it('drops the per-pixel write for uniform route members and keeps the scheduler write', () => {
    const artifact = compileShow(routeRecipe(), {})
    const body = renderBody(artifact.expandedCode)
    expect(body).not.toMatch(/__pxlblz_show_c\d+_pixelCount = \d+/)
    // The per-frame scheduler write remains.
    const beforeRender = artifact.expandedCode.slice(
      artifact.expandedCode.indexOf('export function beforeRender'),
      artifact.expandedCode.indexOf('export function render'),
    )
    expect(beforeRender).toMatch(/__pxlblz_show_c\d+_pixelCount = 32/)
  })

  it('keeps the per-pixel write for repeat members over unequal zone lengths', () => {
    const artifact = compileShow(routeRecipe({ unequalRepeat: true }), {})
    const body = renderBody(artifact.expandedCode)
    // The repeat member serves 32- and 16-pixel zones in one frame.
    expect(body).toMatch(/__pxlblz_show_c0_pixelCount = 32/)
    expect(body).toMatch(/__pxlblz_show_c0_pixelCount = 16/)
    // The uniform solo member still hoists.
    expect(body).not.toMatch(/__pxlblz_show_c1_pixelCount = /)
  })

  it('drops the per-pixel write in routed scene arms for uniform members', () => {
    const artifact = compileShow(sceneRecipe(), {})
    const body = renderBody(artifact.expandedCode)
    expect(body).not.toMatch(/__pxlblz_show_c\d+_pixelCount = 64/)
    const beforeRender = artifact.expandedCode.slice(
      artifact.expandedCode.indexOf('export function beforeRender'),
      artifact.expandedCode.indexOf('export function render'),
    )
    expect(beforeRender).toMatch(/__pxlblz_show_c\d+_pixelCount = 64/)
  })

  it('restores the previous emission under the benchmark counterfactual option', () => {
    const artifact = compileShow(routeRecipe(), {}, { pixelCountWriteHoisting: false })
    const body = renderBody(artifact.expandedCode)
    expect(body).toMatch(/__pxlblz_show_c\d+_pixelCount = 32/)
  })
})

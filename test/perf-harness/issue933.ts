// #933 hardware fixture: a per-pixel Pattern in the ShaderToy-port shape
// the pass targets (no stock Pattern carries a per-pixel integer pow; the
// census in issue933.test.ts pins that). Six sites: three hoisted k = 3,
// two hoisted k = 4, one plain-name k = 2.
import { lowerShowMemberPow } from '../../src/engine/showMemberPowLowering'

export const ISSUE933_PIXEL_COUNT = 256

export const ISSUE933_FIXTURE = `export var t = 0
export function beforeRender(delta) {
  t = (t + delta / 4000) % 1
}
export function render2D(index, x, y) {
  var dx = x - 0.5
  var dy = y - 0.5
  var d = hypot(dx, dy)
  var r = pow(abs(dx) * 2, 3) + pow(wave(d * 3 - t), 4) * 0.5
  var g = pow(d, 2) * pow(abs(dx + dy), 4)
  var b = pow(wave(x + t), 3) + pow(abs(dy) * 2, 3) * 0.5
  rgb(clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1))
}
`

export function issue933Candidates() {
  const lowered = lowerShowMemberPow(ISSUE933_FIXTURE)
  return {
    exact: ISSUE933_FIXTURE,
    lowered: lowered.source,
    rewrittenSites: lowered.rewrittenSites,
    hoistedTemps: lowered.hoistedTemps,
    skipped: lowered.skipped,
  }
}

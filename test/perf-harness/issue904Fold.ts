// Stage-2 hand-fold for issue #904 (epic #903): the mechanical identity-blend
// fold applied to compiled fixture artifacts, ahead of the real compiler pass.
//
// The fold is exact by 16.16 arithmetic identity, not approximation:
// `e * (1)` is exact (multiply by 1.0 has no rounding), `(1 - (1))` is exactly
// zero, and `B * 0` is exactly zero, so
// `B = e * (1) + B * (1 - (1))`  ===  `B = e`  for every input word.
// The dead `var B = 0` initializer then loses its only reader; a bare `var B`
// keeps identical semantics because firmware defaults every value to zero.

const BLEND_LINE = /^(\s*)([A-Za-z_$][\w$]*) = (.+?) \* \(1\) \+ \2 \* \(1 - \(1\)\)$/gm

export interface FoldResult {
  code: string
  blendCount: number
  initCount: number
  targets: string[]
}

export function foldIdentityBlends(source: string): FoldResult {
  const targets: string[] = []
  let blendCount = 0
  let code = source.replace(BLEND_LINE, (_match, indent: string, target: string, value: string) => {
    blendCount += 1
    if (!targets.includes(target)) targets.push(target)
    return `${indent}${target} = ${value}`
  })
  let initCount = 0
  for (const target of targets) {
    const init = `var ${target} = 0`
    if (code.includes(init)) {
      code = code.replace(init, `var ${target}`)
      initCount += 1
    }
  }
  return { code, blendCount, initCount, targets }
}

/** Wave-2 fixtures that carry identity-blend lines (counted offline, 2026-08-29). */
export const FOLD_FIXTURE_IDS = ['hsv-steady-state', 'effect-tax', 'five-pattern-acceptance'] as const
export const FOLD_EXPECTED_BLENDS: Record<(typeof FOLD_FIXTURE_IDS)[number], number> = {
  'hsv-steady-state': 6,
  'effect-tax': 6,
  'five-pattern-acceptance': 18,
}

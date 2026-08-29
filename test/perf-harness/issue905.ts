// Stage-1 measurement for issue #905 (epic #903): hand-dedup the generated
// transition arm ahead of the real pass.
//
// The from/to arms of a same-zone live/live crossfade each recompute the
// identical route index and zone-local coordinates per pixel, and the #904
// fold left pass-through copy chains in single-placement capture wrappers.
// Every rewrite below is exact by construction: it replaces reads of a
// local with reads of another local that provably holds the same value and
// removes the then-dead definitions. No arithmetic changes.
//
// Scoping note that shapes the whole transform (and the eventual pass):
// mangled `__pxlblz_` names are REUSED across generated helper functions
// (`__pxlblz_p` appears as a distinct local in four different helpers of
// this fixture), so a global rename corrupts sibling arms — the device
// compiler rejects the result with "Undefined symbol". The transform
// therefore matches the complete adjacent duplicate prologue in one
// pattern and renames only within the enclosing brace-balanced block.
//
// The fixture is the wave-2 HSV pair on one stage zone with the timing
// inverted: 1 s holds, 8 s crossfades, so ~84% of the loop runs the
// transition arm and paired medians price the arm itself.

import { hsvSteadyStateRecipe } from './issue555'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { compileShow, type GeneratedShowArtifact } from '../../src/engine/showCompiler'

export function transitionHeavyRecipe() {
  const steady = hsvSteadyStateRecipe()
  return {
    ...steady,
    routedSceneSequence: {
      scenes: [
        {
          holdMs: 1_000,
          placements: [{ placementId: 'cheap', zoneName: 'stage', clipId: 'hsv-cheap' }],
          transitionOut: { kind: 'crossfade' as const, durationMs: 8_000 },
        },
        {
          holdMs: 1_000,
          placements: [{ placementId: 'heavy', zoneName: 'stage', clipId: 'hsv-heavy' }],
          transitionOut: { kind: 'crossfade' as const, durationMs: 8_000 },
        },
        {
          holdMs: 1_000,
          placements: [{ placementId: 'coda', zoneName: 'stage', clipId: 'hsv-cheap' }],
        },
      ],
    },
    loopDurationMs: 19_000,
  }
}

export function buildTransitionHeavyArtifact(): GeneratedShowArtifact {
  return compileShow(transitionHeavyRecipe(), LIBRARIES)
}

export interface DedupResult {
  code: string
  dedupedArms: number
  wrapperCopyChains: number
}

// The complete duplicate transition-arm prologue, exactly as emitted: two
// identical guarded route decodes, the combined guard, and two identical
// zone-coordinate pairs. One match carries every name involved.
const ARM_PROLOGUE = new RegExp(
  'var (__pxlblz_\\w+) = -1\\n'
  + '(\\s*)if \\((index >= 0 && index <= \\d+)\\) \\1 = index - 0\\n'
  + '(\\s*)var (__pxlblz_\\w+) = -1\\n'
  + '\\s*if \\(\\3\\) \\5 = index - 0\\n'
  + '(\\s*)if \\(\\1 >= 0 && \\5 >= 0\\) \\{\\n'
  + '(\\s*)var (__pxlblz_\\w+) = \\((\\1) % (\\d+)\\) \\/ (\\d+)\\n'
  + '\\s*var (__pxlblz_\\w+) = floor\\(\\1 \\/ \\10\\) \\/ (\\d+)\\n'
  + '\\s*var (__pxlblz_\\w+) = \\(\\5 % \\10\\) \\/ \\11\\n'
  + '\\s*var (__pxlblz_\\w+) = floor\\(\\5 \\/ \\10\\) \\/ \\13\\n',
)

const WRAPPER_COPY_CHAIN = new RegExp(
  '  var (__pxlblz_\\w+)\\n'
  + '  var (__pxlblz_\\w+)\\n'
  + '  var (__pxlblz_\\w+)\\n'
  + '  (__pxlblz_\\w+\\(index(?:, x, y)?\\))\\n'
  + '  \\1 = (__pxlblz_\\w+)\\n'
  + '  \\2 = (__pxlblz_\\w+)\\n'
  + '  \\3 = (__pxlblz_\\w+)\\n'
  + '  (__pxlblz_\\w+) = \\1\\n'
  + '  (__pxlblz_\\w+) = \\2\\n'
  + '  (__pxlblz_\\w+) = \\3\\n',
  'g',
)

/** Rename `from` to `to` between `start` and the end of the enclosing block. */
function renameWithinBlock(code: string, start: number, renames: Array<[string, string]>): string {
  let depth = 0
  let end = code.length
  for (let index = start; index < code.length; index += 1) {
    const character = code[index]
    if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth < 0) {
        end = index
        break
      }
    }
  }
  let region = code.slice(start, end)
  for (const [from, to] of renames) {
    region = region.replace(new RegExp(`\\b${from}\\b`, 'g'), to)
  }
  return code.slice(0, start) + region + code.slice(end)
}

/** Remove per-pixel work that recomputes a value another local already holds. */
export function dedupTransitionArms(source: string): DedupResult {
  let code = source
  let dedupedArms = 0
  for (;;) {
    const match = ARM_PROLOGUE.exec(code)
    if (!match) break
    const [whole, first, indentA, guard, , second, indentIf, indentVar, coordX, , width, divX, coordY, divY, dupX, dupY] = match
    const replacement = `var ${first} = -1\n`
      + `${indentA}if (${guard}) ${first} = index - 0\n`
      + `${indentIf.replace('\n', '')}if (${first} >= 0) {\n`
      + `${indentVar}var ${coordX} = (${first} % ${width}) / ${divX}\n`
      + `${indentVar}var ${coordY} = floor(${first} / ${width}) / ${divY}\n`
    const start = match.index
    code = code.slice(0, start) + replacement + code.slice(start + whole.length)
    code = renameWithinBlock(code, start + replacement.length, [
      [second, first],
      [dupX, coordX],
      [dupY, coordY],
    ])
    dedupedArms += 1
  }

  // Wrapper copy chains: the #904-folded accumulator locals are pure
  // pass-throughs; write the member RGB straight to the capture globals.
  // The rewrite stays inside its own match, so name reuse cannot leak.
  let wrapperCopyChains = 0
  code = code.replace(WRAPPER_COPY_CHAIN, (...args) => {
    const [, , , , call, srcA, srcB, srcC, dstA, dstB, dstC] = args as string[]
    wrapperCopyChains += 1
    return `  ${call}\n  ${dstA} = ${srcA}\n  ${dstB} = ${srcB}\n  ${dstC} = ${srcC}\n`
  })

  return { code, dedupedArms, wrapperCopyChains }
}

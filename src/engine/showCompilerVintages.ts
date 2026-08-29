// #570: named historical compiler pin sets. A historical census or golden
// records numbers produced by the Transpiler of its day; every later
// emission pass that would drift those numbers must be disabled when the
// census re-runs. Before this table, each census hand-enumerated its pins
// and a missed one was a shipped test bug (the #536 byte-drift came from
// exactly that). Now a new pass that drifts a census adds its counterfactual
// to the affected set here - one edit, every consumer inherits it.
//
// The sets are descriptive, not chronological: a census pins exactly the
// passes measured to drift its recorded numbers, nothing more, so the
// recorded expectations stay verifiable as written.
import type { ShowCompileOptions } from './showCompiler'

export const COMPILER_VINTAGES = {
  /** #514 no-emission resource census (pre-#559/#566). */
  'issue-514-resource-census': {
    hsvCaptureChainSpecialization: false,
    inlineCallHoisting: false,
  },
  /** #525 motion-representation census (pre-#559/#566/#904/#907). */
  'issue-525-motion-census': {
    hsvCaptureChainSpecialization: false,
    inlineCallHoisting: false,
    identityBlendFold: false,
    hsvSharedChainLaneScoping: false,
  },
  /** #536 score-representation census (pre-wave-2 emission diet). */
  'issue-536-score-census': {
    colorCoefficientHoisting: false,
    capturePrologueSimplification: false,
    pixelCountWriteHoisting: false,
    hsvCaptureChainSpecialization: false,
    inlineCallHoisting: false,
  },
  /** #513 Redline frame-invariant plan census (pre-#565/#566: helper
   * inlining and inline call-subtree hoisting both change the candidate
   * set the census pinned). */
  'issue-513-frame-invariant-plan': {
    helperCallInlining: false,
    inlineCallHoisting: false,
  },
  /** #542 score baseline census (pre-wave-2 emission diet, pre-#904/#907). */
  'issue-542-score-census': {
    hsvCaptureChainSpecialization: false,
    inlineCallHoisting: false,
    helperCallInlining: false,
    identityBlendFold: false,
    hsvSharedChainLaneScoping: false,
  },
  /** Motion-transition sharing goldens (pre-#559/#566/#904/#907). */
  'motion-transition-sharing': {
    hsvCaptureChainSpecialization: false,
    inlineCallHoisting: false,
    identityBlendFold: false,
    hsvSharedChainLaneScoping: false,
  },
} satisfies Record<string, ShowCompileOptions>

export type CompilerVintage = keyof typeof COMPILER_VINTAGES

export function compilerVintageOptions(vintage: CompilerVintage): ShowCompileOptions {
  return { ...COMPILER_VINTAGES[vintage] }
}

import type {
  ControllerInput,
  ControllerProfile,
  ControllerWrapperOutcome,
  ControllerWrapperType,
  GlobalInputUse,
} from './controllerProfile'
import { readStoredArtifactSignature } from './controllerProfilePassRecipe'
import { savedControllerWrapperOutcome, type ControllerPushRecord } from './controllerPushRecord'

type AppliedWrapperTag = { wrapper: ControllerWrapperType | 'power' | 'bright'; state: 'applied' }

/** One tag on a saved program row (#1277). Tags describe what the saved bytes
 *  carry, read only from the program's stored push record, never from the
 *  current profile switches. */
export type WrapperTagModel =
  | AppliedWrapperTag
  | { wrapper: 'binding'; state: 'applied'; label: string }
  | { wrapper: ControllerWrapperType; state: 'skipped'; reason: string }

export type WrapperSkip = NonNullable<ControllerWrapperOutcome['skipped'][ControllerWrapperType]>

export interface WrapperTagEvidence {
  record: ControllerPushRecord | undefined
  /** The program displayed on the row. An outcome stored for another program
   *  is not evidence for this one. */
  programId: string
  kind: 'pattern' | 'show'
}

export const WRAPPER_TAG_LABELS: Record<ControllerWrapperType | 'power' | 'bright', string> = {
  'slow-mo': 'slow-mo',
  dreamy: 'dreamy',
  power: 'power',
  bright: 'bright',
}

const TIMING_ORDER: readonly ControllerWrapperType[] = ['slow-mo', 'dreamy']
const STRUCTURAL_SKIP = "Skipped: this Pattern's code can't take a Wrapper."

/** Profile-page tags: applied timing Wrappers in stored order, skipped ones
 *  (Slow-mo, Dreamy), Power limit, Brightness, then per-Pattern bindings.
 *  A Show never carries a timing tag. */
export function describeWrapperTags({ record, programId, kind }: WrapperTagEvidence): WrapperTagModel[] {
  if (!record) return []
  const tags: WrapperTagModel[] = []
  const outcome = kind === 'show' ? undefined : savedControllerWrapperOutcome(record, programId)
  if (outcome) {
    for (const wrapper of outcome.applied) tags.push({ wrapper, state: 'applied' })
    for (const wrapper of TIMING_ORDER) {
      const skip = outcome.skipped[wrapper]
      if (skip && !outcome.applied.includes(wrapper)) {
        tags.push({ wrapper, state: 'skipped', reason: formatWrapperSkipReason(skip) })
      }
    }
  }
  const transforms = savedTransforms(record)
  if (transforms.includes('power-cap')) tags.push({ wrapper: 'power', state: 'applied' })
  if (transforms.includes('hardware-brightness')) tags.push({ wrapper: 'bright', state: 'applied' })
  for (const label of bindingTags(record)) tags.push({ wrapper: 'binding', state: 'applied', label })
  return tags
}

/** Picker form (#1280): applied Wrappers only. No skipped tag and no binding. */
export function appliedWrapperTags(evidence: WrapperTagEvidence): AppliedWrapperTag[] {
  return describeWrapperTags(evidence).filter(
    (tag): tag is AppliedWrapperTag => tag.state === 'applied' && tag.wrapper !== 'binding',
  )
}

export function formatWrapperSkipReason(skip: WrapperSkip): string {
  if (skip.reason === 'array-budget' && skip.neededWords !== undefined && skip.freeWords !== undefined) {
    const count = (value: number) => value.toLocaleString('en-US')
    return `Skipped: not enough memory. Needs ${count(skip.neededWords)} array words, ${count(skip.freeWords)} free.`
  }
  return STRUCTURAL_SKIP
}

interface StoredSignature {
  transforms: Array<{ type: string; inputId?: string; mode?: string; maxDuty?: number }>
  inputs: Array<{ id: string; pin: number; signal: string }>
  bindings: Array<{ inputId: string; target: { name: string } }>
}

function storedSignature(record: ControllerPushRecord): StoredSignature | undefined {
  if (!record.profileSignature) return undefined
  const stored = readStoredArtifactSignature(record.profileSignature)
  return stored.kind === 'recognized' ? JSON.parse(stored.normalized) as StoredSignature : undefined
}

/** Transforms baked into the saved bytes. A record carrying `transforms` is
 *  read from that field alone (I1). A legacy record with no `transforms` field
 *  falls back to the Power limit and Brightness settings in its recognized
 *  stored signature, as the earlier profile icons did. */
function savedTransforms(record: ControllerPushRecord): readonly string[] {
  if (Object.prototype.hasOwnProperty.call(record, 'transforms')) {
    return Array.isArray(record.transforms) ? record.transforms : []
  }
  const signature = storedSignature(record)
  if (!signature) return []
  const transforms: string[] = []
  for (const transform of signature.transforms) {
    if (transform.type === 'power-cap' && (transform.maxDuty ?? -1) >= 0) transforms.push('power-cap')
    if (
      transform.type === 'hardware-brightness'
      && transform.mode === 'multiply-output'
      && signature.inputs.some((input) => input.id === transform.inputId && input.signal === 'analog')
      && !signature.bindings.some((binding) => binding.inputId === transform.inputId)
    ) transforms.push('hardware-brightness')
  }
  return transforms
}

/** "IO<pin> → <target>" for each binding in the recognized stored signature. */
export function bindingTags(record: ControllerPushRecord): string[] {
  const signature = storedSignature(record)
  if (!signature) return []
  return signature.bindings.flatMap((binding) => {
    const input = signature.inputs.find((candidate) => candidate.id === binding.inputId)
    return input ? [`IO${input.pin} → ${binding.target.name}`] : []
  })
}

/** DOM id for a saved program row. Distinct program ids give distinct ids. */
export function savedRowDomId(programId: string): string {
  const escaped = Array.from(programId, (char) => (
    /[A-Za-z0-9-]/.test(char) ? char : `_${char.codePointAt(0)!.toString(16)}_`
  )).join('')
  return `saved-program-${escaped}`
}

export const TIMING_WRAPPER_NAMES: Record<ControllerWrapperType, string> = {
  'slow-mo': 'Slow-mo',
  dreamy: 'Dreamy',
}

export const WRAPPER_INPUT_NAMES: Record<GlobalInputUse, string> = {
  'hardware-brightness': 'Brightness',
  ...TIMING_WRAPPER_NAMES,
}

export function wrapperEnabled(profile: ControllerProfile, type: ControllerWrapperType): boolean {
  return profile.globalTransforms.some((transform) => transform.type === type && transform.enabled)
}

/** The assigned input and the scope shared by the Wrapper row and input card. */
export function wrapperRowSource(
  profile: ControllerProfile,
  type: ControllerWrapperType,
  patternNames: Readonly<Record<string, string>> = {},
): { input: ControllerInput; scope: string } | null {
  const transform = profile.globalTransforms.find((entry) => entry.type === type && entry.enabled)
  if (transform?.type !== type) return null
  const input = profile.inputs.find(({ id }) => id === transform.inputId)
  if (!input) return null
  const exceptions = new Set(profile.patternBindings
    .filter(({ inputId }) => inputId === input.id)
    .map(({ patternId }) => patternNames[patternId]?.trim() || patternId))
  const scope = exceptions.size
    ? `every Pattern except ${[...exceptions].join(', ')}`
    : 'every Pattern'
  return { input, scope }
}

export function wrapperBindingChoices(profile: ControllerProfile, type: ControllerWrapperType) {
  const assigned = new Map<string, GlobalInputUse>()
  const brightness = brightnessRowInput(profile)
  if (brightness) assigned.set(brightness.id, 'hardware-brightness')
  for (const wrapper of TIMING_ORDER) {
    if (wrapper === type) continue
    const source = wrapperRowSource(profile, wrapper)
    if (source) assigned.set(source.input.id, wrapper)
  }
  return profile.inputs.filter(({ signal }) => signal === 'analog').map((input) => {
    const current = assigned.get(input.id)
    return {
      id: input.id,
      label: `IO${input.pin} ${input.name}${current ? ` (now ${WRAPPER_INPUT_NAMES[current]})` : ''}`,
    }
  })
}

export function brightnessRowInput(profile: ControllerProfile): ControllerInput | null {
  const brightness = profile.globalTransforms.find(
    (transform) => transform.type === 'hardware-brightness' && transform.enabled,
  )
  if (brightness?.type !== 'hardware-brightness') return null
  return profile.inputs.find((input) => input.id === brightness.inputId) ?? null
}

export function skippedProgramIdsByWrapper(
  rows: readonly WrapperTagEvidence[],
  profile: ControllerProfile,
): Record<ControllerWrapperType, string[]> {
  const result: Record<ControllerWrapperType, string[]> = { 'slow-mo': [], dreamy: [] }
  const enabled = TIMING_ORDER.filter((wrapper) => wrapperEnabled(profile, wrapper))
  if (enabled.length === 0) return result

  for (const row of rows) {
    if (row.kind !== 'pattern') continue
    const outcome = savedControllerWrapperOutcome(row.record, row.programId)
    if (!outcome) continue
    for (const wrapper of enabled) {
      if (outcome.skipped[wrapper] && !outcome.applied.includes(wrapper)) {
        result[wrapper].push(row.programId)
      }
    }
  }
  return result
}

export function showsTimingLine(profile: ControllerProfile, showCount: number): string | null {
  if (showCount === 0) return null
  const names = TIMING_ORDER
    .filter((type) => wrapperEnabled(profile, type))
    .map((type) => TIMING_WRAPPER_NAMES[type])
  return names.length ? `Shows keep their own timing: no ${names.join(' or ')}.` : null
}

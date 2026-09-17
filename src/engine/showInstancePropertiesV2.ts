import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import type { ShowPatternInstance, ShowPatternRef } from './personalContentRecords'
import type { ResolvedShowPatternReplacementV2 } from './showClipsV2'

/**
 * Trusted resolved Pattern metadata for the control check. It comes from the
 * caller's captured bundle boundary, never from the request (specification
 * section 6); the command layer's own context satisfies this shape.
 */
export interface ShowInstancePropertyDependenciesV2 {
  resolvePattern?: (reference: ShowPatternRef) =>
    | { status: 'ready'; replacement: ResolvedShowPatternReplacementV2 }
    | { status: 'refused'; message: string }
}

export interface ShowInstancePropertiesResultV2 {
  status: 'changed' | 'unchanged' | 'refused'
  record: ShowRecordV2
  code?: string
  message?: string
  affectedInstanceIds?: string[]
  affectedClipIds?: string[]
}

/** An explicit stutter request: one positive step, or `null` to clear it. */
function steppedClockRequest(value: unknown): { status: 'absent' } | { status: 'clear' } | { status: 'set'; stepMs: number } | { status: 'invalid' } {
  if (value === undefined) return { status: 'absent' }
  if (value === null) return { status: 'clear' }
  if (typeof value !== 'object' || Array.isArray(value)) return { status: 'invalid' }
  const fields = value as Record<string, unknown>
  const stepMs = fields.stepMs
  return Object.keys(fields).length === 1 && typeof stepMs === 'number' && Number.isFinite(stepMs) && stepMs > 0
    ? { status: 'set', stepMs }
    : { status: 'invalid' }
}

/**
 * Write Pattern-instance values shared by every Clip on that runtime. This is
 * the single owner for `patternInstances[*]` scalar values: it consumes an
 * immutable preimage, applies only the requested fields, validates one complete
 * candidate, and reports every effective Clip on the instance.
 *
 * `update_clips.instance_properties` and the editor's
 * `admitShowV2PilotInstanceProperties` wrapper both call it, so the command and
 * the route cannot write a Pattern instance two different ways. The command
 * descriptor does not yet expose `stepped_clock`, so only the editor supplies
 * that key today; the owner validates it here rather than trusting either caller.
 */
export function writeShowInstancePropertiesV2(
  record: ShowRecordV2,
  clipId: string,
  properties: Record<string, unknown>,
  dependencies: ShowInstancePropertyDependenciesV2 | undefined,
): ShowInstancePropertiesResultV2 {
  const clip = record.composition.clips.find(candidate => candidate.id === clipId)
  if (!clip) return { status: 'refused', record, code: 'unknown-id', message: `no Clip has id "${clipId}".` }
  const source = record.composition.patternInstances.find(instance => instance.id === clip.instanceId)
  if (!source) return { status: 'refused', record, code: 'unknown-id', message: `Clip "${clipId}" has no Pattern instance.` }
  const stepped = steppedClockRequest(properties.stepped_clock)
  if (stepped.status === 'invalid') {
    return { status: 'refused', record, code: 'invalid-argument', message: 'stepped_clock must be null or one positive stepMs.' }
  }
  const controls = properties.controls as Record<string, number> | undefined
  if (controls && Object.keys(controls).length > 0) {
    const resolver = dependencies?.resolvePattern
    if (!resolver) {
      return { status: 'refused', record, code: 'missing-dependency', message: 'setting instance controls needs trusted resolved Pattern metadata.' }
    }
    const resolved = resolver(source.pattern)
    if (resolved.status === 'refused') return { status: 'refused', record, code: 'missing-dependency', message: resolved.message }
    const declared = new Set(resolved.replacement.exportedSliders.map(control => control.exportName))
    const unknown = Object.keys(controls).find(name => !declared.has(name))
    if (unknown !== undefined) {
      return {
        status: 'refused', record, code: 'unknown-control',
        message: `Pattern "${source.patternName}" does not export a slider named "${unknown}". Exported sliders: ${[...declared].join(', ') || 'none'}.`,
      }
    }
  }
  const next = structuredClone(record)
  const instance = next.composition.patternInstances.find(candidate => candidate.id === source.id)!
  if (controls) {
    instance.controlTargets = { ...(instance.controlTargets ?? {}), ...controls }
  }
  if (properties.time_scale !== undefined) instance.time.timeScale = properties.time_scale as number
  if (properties.time_offset_ms !== undefined) instance.time.timeOffsetMs = properties.time_offset_ms as number
  if (properties.evaluation !== undefined) instance.evaluationPolicy = properties.evaluation as ShowPatternInstance['evaluationPolicy']
  if (stepped.status === 'clear') delete instance.time.steppedClock
  else if (stepped.status === 'set') instance.time.steppedClock = { stepMs: stepped.stepMs }
  if (JSON.stringify(instance) === JSON.stringify(source)) return { status: 'unchanged', record }
  const resultIssue = validateShowRecordV2(next)[0]
  if (resultIssue) return { status: 'refused', record, code: 'invalid-result', message: `${resultIssue.path}: ${resultIssue.message}` }
  const effective = materializeShowGroupsV2(next)
  return {
    status: 'changed',
    record: next,
    affectedInstanceIds: [source.id],
    affectedClipIds: effective.composition.clips.filter(candidate => candidate.instanceId === source.id).map(candidate => candidate.id).sort(),
  }
}

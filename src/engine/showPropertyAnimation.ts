import { applyShowEasing, emitShowEasingExpression, validateShowEasing } from './showEasing'
import {
  showClipEffectParameterValue,
  showClipEffectParameters,
} from './showEffectAuthoring'
import type {
  ShowCompositionV1,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowPropertyAnimationKeyframe,
  ShowPropertyAnimationTarget,
  ShowPropertyAnimationTrack,
  ShowRecord,
  ShowSceneComposition,
  ShowStructuredEasing,
} from './personalContentRecords'

export type ShowPropertyAnimationValidationCode =
  | 'duplicate-track-id'
  | 'duplicate-keyframe-id'
  | 'duplicate-target'
  | 'missing-scene'
  | 'missing-instance'
  | 'missing-control'
  | 'missing-placement'
  | 'missing-effect'
  | 'effect-identity-mismatch'
  | 'missing-effect-parameter'
  | 'not-finite'
  | 'not-integer'
  | 'out-of-bounds'
  | 'unordered-keyframes'
  | 'too-few-keyframes'
  | 'invalid-easing'

export interface ShowPropertyAnimationValidationIssue {
  path: string
  code: ShowPropertyAnimationValidationCode
  message: string
}

interface NumericConstraint {
  min: number
  max: number
  integer?: boolean
}

/** Exact retained source-curve interval carried only by v2 and transient compiler records. */
export interface ShowPropertyCurveSegment {
  baseValue: number
  deltaValue: number
  easing: ShowStructuredEasing
  sourceDurationMs: number
  elapsedOffsetMs: number
}

export type ShowCompilerPropertyAnimationKeyframe = ShowPropertyAnimationKeyframe & {
  curveSegment?: ShowPropertyCurveSegment
}

export type ShowCompilerPropertyAnimationTrack = Omit<ShowPropertyAnimationTrack, 'keyframes'> & {
  keyframes: ShowCompilerPropertyAnimationKeyframe[]
}

/** Evaluate one authored track in Scene-local milliseconds. */
export function evaluateShowPropertyTrack(track: ShowCompilerPropertyAnimationTrack, atMs: number): number {
  const keyframes = [...track.keyframes].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
  if (keyframes.length === 0) return 0
  const exact = keyframes.find(keyframe => keyframe.timeMs === atMs)
  if (exact?.curveSegment) return exact.value
  if (atMs <= keyframes[0].timeMs) return keyframes[0].value
  const last = keyframes[keyframes.length - 1]
  if (atMs >= last.timeMs) return last.value
  const rightIndex = keyframes.findIndex((keyframe) => keyframe.timeMs > atMs)
  const left = keyframes[Math.max(0, rightIndex - 1)]
  const right = keyframes[rightIndex]
  if (left.curveSegment) {
    const segment = left.curveSegment
    const progress = (segment.elapsedOffsetMs + atMs - left.timeMs) / segment.sourceDurationMs
    return segment.baseValue + segment.deltaValue * applyShowEasing(segment.easing, progress)
  }
  const progress = (atMs - left.timeMs) / Math.max(1, right.timeMs - left.timeMs)
  const eased = applyShowEasing(left.easing, progress)
  return left.value + (right.value - left.value) * eased
}

/** Emit the exact evaluator used by generated Show code. */
export function emitShowPropertyTrackExpression(
  track: ShowCompilerPropertyAnimationTrack,
  atMsExpression: string,
): string {
  const keyframes = [...track.keyframes].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
  if (keyframes.length === 0) return '0'
  if (keyframes.length === 1) return String(keyframes[0].value)
  let expression = String(keyframes[keyframes.length - 1].value)
  for (let index = keyframes.length - 2; index >= 0; index -= 1) {
    const left = keyframes[index]
    const right = keyframes[index + 1]
    const retained = left.curveSegment
    const progress = retained
      ? `(${retained.elapsedOffsetMs} + ((${atMsExpression}) - ${left.timeMs})) / ${retained.sourceDurationMs}`
      : `((${atMsExpression}) - ${left.timeMs}) / ${right.timeMs - left.timeMs}`
    const eased = emitShowEasingExpression(retained?.easing ?? left.easing, progress)
    let segmentExpression = retained
      ? `(${retained.baseValue} + (${retained.deltaValue}) * ${eased})`
      : `(${left.value} + (${right.value - left.value}) * ${eased})`
    if (retained && index > 0) segmentExpression = `((${atMsExpression}) == ${left.timeMs} ? ${left.value} : ${segmentExpression})`
    expression = `((${atMsExpression}) < ${right.timeMs} ? ${segmentExpression} : ${expression})`
  }
  return `((${atMsExpression}) <= ${keyframes[0].timeMs} ? ${keyframes[0].value} : ${expression})`
}

export function normalizeShowPropertyTracks(
  tracks: readonly ShowPropertyAnimationTrack[] | null | undefined,
): ShowPropertyAnimationTrack[] | undefined {
  if (tracks == null) return undefined
  return [...structuredClone(tracks)]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((track) => ({
      ...track,
      keyframes: track.keyframes.sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id)),
    }))
}

export function validateShowPropertyTracks(
  show: Pick<ShowRecord, 'scenes'>,
  composition: ShowCompositionV1,
): ShowPropertyAnimationValidationIssue[] {
  const issues: ShowPropertyAnimationValidationIssue[] = []
  const sceneById = new Map(show.scenes.map((scene) => [scene.id, scene]))
  const instanceById = new Map(composition.patternInstances.map((instance) => [instance.id, instance]))
  const trackIds = new Set<string>()
  const keyframeIds = new Set<string>()

  composition.scenes.forEach((sceneComposition, sceneIndex) => {
    const scenePath = `scenes[${sceneIndex}]`
    const scene = sceneById.get(sceneComposition.sceneId)
    const placementById = scenePlacementMap(sceneComposition)
    const targetKeys = new Set<string>()
    for (const [trackIndex, track] of (sceneComposition.propertyTracks ?? []).entries()) {
      const trackPath = `${scenePath}.propertyTracks[${trackIndex}]`
      if (trackIds.has(track.id)) addIssue(issues, `${trackPath}.id`, 'duplicate-track-id', `Property track id "${track.id}" is duplicated.`)
      trackIds.add(track.id)
      const targetKey = propertyTargetKey(track.target)
      if (targetKeys.has(targetKey)) addIssue(issues, `${trackPath}.target`, 'duplicate-target', 'A Scene can author only one track for the same property target.')
      targetKeys.add(targetKey)
      if (!scene) addIssue(issues, `${scenePath}.sceneId`, 'missing-scene', `Scene "${sceneComposition.sceneId}" does not exist.`)
      const constraint = validateTarget(issues, `${trackPath}.target`, track.target, instanceById, placementById)
      if (track.keyframes.length < 2) {
        addIssue(issues, `${trackPath}.keyframes`, 'too-few-keyframes', 'An animated property track needs at least two keyframes.')
      }
      track.keyframes.forEach((keyframe, keyframeIndex) => {
        const keyframePath = `${trackPath}.keyframes[${keyframeIndex}]`
        if (keyframeIds.has(keyframe.id)) addIssue(issues, `${keyframePath}.id`, 'duplicate-keyframe-id', `Keyframe id "${keyframe.id}" is duplicated.`)
        keyframeIds.add(keyframe.id)
        validateKeyframe(issues, keyframePath, keyframe, scene?.durationMs, constraint)
        const previous = track.keyframes[keyframeIndex - 1]
        if (previous && keyframe.timeMs <= previous.timeMs) {
          addIssue(issues, `${keyframePath}.timeMs`, 'unordered-keyframes', 'Keyframe times must be strictly increasing in authored order.')
        }
      })
    }
  })
  return issues
}

export function propertyTargetKey(target: ShowPropertyAnimationTarget): string {
  if (target.kind === 'instance-time-scale') return `${target.kind}:${target.instanceId}`
  if (target.kind === 'instance-control') return `${target.kind}:${target.instanceId}:${target.exportName}`
  if (target.kind === 'placement-opacity') return `${target.kind}:${target.placementId}`
  if (target.kind === 'placement-view') return `${target.kind}:${target.placementId}:${target.property}`
  if (target.kind === 'placement-transform') return `${target.kind}:${target.placementId}:${target.property}`
  if (target.kind === 'placement-viewport') return `${target.kind}:${target.placementId}:${target.property}`
  return `${target.kind}:${target.placementId}:${target.effectId}:${target.effectKind}:${target.parameterId}`
}

function validateTarget(
  issues: ShowPropertyAnimationValidationIssue[],
  path: string,
  target: ShowPropertyAnimationTarget,
  instanceById: Map<string, ShowCompositionV1['patternInstances'][number]>,
  placementById: Map<string, ShowMainPlacement | ShowOverlayPlacement>,
): NumericConstraint | undefined {
  if (target.kind === 'instance-time-scale') {
    if (!instanceById.has(target.instanceId)) addIssue(issues, `${path}.instanceId`, 'missing-instance', `Pattern instance "${target.instanceId}" does not exist.`)
    return { min: 0, max: 4 }
  }
  if (target.kind === 'instance-control') {
    const instance = instanceById.get(target.instanceId)
    if (!instance) addIssue(issues, `${path}.instanceId`, 'missing-instance', `Pattern instance "${target.instanceId}" does not exist.`)
    else if (!(target.exportName in (instance.controlTargets ?? {}))) addIssue(issues, `${path}.exportName`, 'missing-control', `Pattern instance "${target.instanceId}" has no authored control "${target.exportName}".`)
    return { min: 0, max: 1 }
  }
  const placement = placementById.get(target.placementId)
  if (!placement) {
    addIssue(issues, `${path}.placementId`, 'missing-placement', `Placement "${target.placementId}" does not exist in this Scene.`)
    return undefined
  }
  if (target.kind === 'placement-opacity') {
    return { min: 0, max: 1 }
  }
  if (target.kind === 'placement-view') return { min: 0, max: 1 }
  if (target.kind === 'placement-transform') {
    if (target.property === 'scaleX' || target.property === 'scaleY') return { min: 0.01, max: 8 }
    if (target.property === 'rotation') return { min: -8, max: 8 }
    return { min: -4, max: 4 }
  }
  if (target.kind === 'placement-viewport') {
    if (target.property === 'width' || target.property === 'height') return { min: 0.01, max: 8 }
    return { min: -4, max: 4 }
  }
  const effect = placement.effects?.find((candidate) => candidate.id === target.effectId)
  if (!effect) {
    addIssue(issues, `${path}.effectId`, 'missing-effect', `Effect "${target.effectId}" does not exist on placement "${target.placementId}".`)
    return undefined
  }
  if (effect.kind !== target.effectKind) {
    addIssue(issues, `${path}.effectKind`, 'effect-identity-mismatch', `Effect "${target.effectId}" is ${effect.kind}, not ${target.effectKind}.`)
    return undefined
  }
  const descriptor = showClipEffectParameters(effect).find((candidate) => candidate.id === target.parameterId)
  if (!descriptor || descriptor.kind !== 'number' || typeof showClipEffectParameterValue(effect, descriptor.id) !== 'number') {
    addIssue(issues, `${path}.parameterId`, 'missing-effect-parameter', `Effect "${target.effectId}" has no numeric parameter "${target.parameterId}".`)
    return undefined
  }
  return {
    min: descriptor.min ?? Number.NEGATIVE_INFINITY,
    max: descriptor.max ?? Number.POSITIVE_INFINITY,
    integer: descriptor.step === 1,
  }
}

function validateKeyframe(
  issues: ShowPropertyAnimationValidationIssue[],
  path: string,
  keyframe: ShowPropertyAnimationKeyframe,
  sceneDurationMs: number | undefined,
  constraint: NumericConstraint | undefined,
): void {
  if (!Number.isFinite(keyframe.timeMs)) addIssue(issues, `${path}.timeMs`, 'not-finite', 'Keyframe time must be finite.')
  else if (!Number.isInteger(keyframe.timeMs)) addIssue(issues, `${path}.timeMs`, 'not-integer', 'Keyframe time must use whole milliseconds.')
  else if (keyframe.timeMs < 0 || (sceneDurationMs !== undefined && keyframe.timeMs > sceneDurationMs)) {
    addIssue(issues, `${path}.timeMs`, 'out-of-bounds', 'Keyframe time must stay inside its Scene.')
  }
  if (!Number.isFinite(keyframe.value)) addIssue(issues, `${path}.value`, 'not-finite', 'Keyframe value must be finite.')
  else if (constraint && (keyframe.value < constraint.min || keyframe.value > constraint.max)) {
    addIssue(issues, `${path}.value`, 'out-of-bounds', `Keyframe value must be between ${constraint.min} and ${constraint.max}.`)
  } else if (constraint?.integer && !Number.isInteger(keyframe.value)) {
    addIssue(issues, `${path}.value`, 'not-integer', 'This Effect parameter requires a whole-number value.')
  }
  if (!validateShowEasing(keyframe.easing).valid) {
    addIssue(issues, `${path}.easing`, 'invalid-easing', 'Keyframe easing is invalid.')
  }
}

function scenePlacementMap(scene: ShowSceneComposition): Map<string, ShowMainPlacement | ShowOverlayPlacement> {
  return new Map(scene.zones.flatMap((zone) => [
    ...zone.main.map((placement) => [placement.id, placement] as const),
    ...zone.overlays.flatMap((layer) => layer.placements.map((placement) => [placement.id, placement] as const)),
  ]))
}

function addIssue(
  issues: ShowPropertyAnimationValidationIssue[],
  path: string,
  code: ShowPropertyAnimationValidationCode,
  message: string,
): void {
  issues.push({ path, code, message })
}

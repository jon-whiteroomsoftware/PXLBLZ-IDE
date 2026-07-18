export type ShowScoreIdentityValue =
  | null
  | boolean
  | number
  | string
  | readonly ShowScoreIdentityValue[]
  | { readonly [key: string]: ShowScoreIdentityValue }

export interface ShowScoreCompatibilityInput {
  outputDimension: 1 | 2 | 3
  routingLayoutCount: number
  logicalZoneCount: number
  routingSwitchCount: number
  routingPropertyRampCount: number
  placementPropertyTrackCount: number
  transitionRampCount: number
  freezeAtEntryCount: number
}

export interface ShowScoreSceneInput {
  sceneIndex: number
  routingIdentity: ShowScoreIdentityValue
  placements: Array<{
    patternInstanceId: string
    memberId: string
    [key: string]: ShowScoreIdentityValue
  }>
}

export interface ShowScoreBoundaryInput {
  boundaryIndex: number
  startMs: number
  durationMs: number
  fromSceneIndex: number
  toSceneIndex: number
  transition: {
    family: string
    programIdentity: ShowScoreIdentityValue
    easingIdentity: string
    parameters: number[]
  }
}

export interface ShowScorePlanInput {
  compatibility: ShowScoreCompatibilityInput
  scenes: ShowScoreSceneInput[]
  boundaries: ShowScoreBoundaryInput[]
  loopDurationMs?: number
}

export type ShowScoreIncompatibilityReason =
  | 'output-dimension'
  | 'routing-layout-count'
  | 'logical-zone-count'
  | 'routing-switch'
  | 'routing-property-ramp'
  | 'placement-property-track'
  | 'transition-ramp'
  | 'freeze-at-entry'
  | 'scene-reference'

export interface PlannedShowScoreBoundary {
  boundaryIndex: number
  startMs: number
  durationMs: number
  fromStack: number
  toStack: number
  kernel: number
  easing: number
  parameters: number[]
}

export type ShowScoreCadence =
  | { kind: 'regular'; firstBoundaryMs: number; periodMs: number }
  | { kind: 'explicit'; boundaryStartsMs: number[] }

export type ShowScorePlan = {
  status: 'incompatible'
  reason: ShowScoreIncompatibilityReason
} | {
  status: 'compatible'
  stackPlanCount: number
  kernelCount: number
  easingCount: number
  stackPlanIndexByScene: number[]
  stackPlanIdentities: string[]
  kernelIdentities: string[]
  easingIdentities: string[]
  boundaries: PlannedShowScoreBoundary[]
  cadence: ShowScoreCadence
  initialization: {
    timing: 'regular-cadence' | 'explicit-boundaries'
    loopBehavior: 'modulo-show-duration'
    loopDurationMs: number
    generatedGlobals: 1
    arrayWords: number
    assignmentCount: number
    operationCount: number
  }
}

export function buildShowScorePlan(input: ShowScorePlanInput): ShowScorePlan {
  const incompatibility = compatibilityReason(input.compatibility)
  if (incompatibility) return { status: 'incompatible', reason: incompatibility }

  const stackPlanIdentities: string[] = []
  const stackPlanByIdentity = new Map<string, number>()
  const stackPlanByScene = new Map<number, number>()
  for (const scene of input.scenes) {
    const identity = canonicalShowScoreIdentity({
      routing: scene.routingIdentity,
      placements: scene.placements,
    })
    let planIndex = stackPlanByIdentity.get(identity)
    if (planIndex === undefined) {
      planIndex = stackPlanIdentities.length
      stackPlanIdentities.push(identity)
      stackPlanByIdentity.set(identity, planIndex)
    }
    stackPlanByScene.set(scene.sceneIndex, planIndex)
  }

  const kernelIdentities: string[] = []
  const kernelByIdentity = new Map<string, number>()
  const easingIdentities: string[] = []
  const easingByIdentity = new Map<string, number>()
  const boundaries: PlannedShowScoreBoundary[] = []
  for (const boundary of input.boundaries) {
    const fromStack = stackPlanByScene.get(boundary.fromSceneIndex)
    const toStack = stackPlanByScene.get(boundary.toSceneIndex)
    if (fromStack === undefined || toStack === undefined) {
      return { status: 'incompatible', reason: 'scene-reference' }
    }
    const kernelIdentity = canonicalShowScoreIdentity({
      family: boundary.transition.family,
      program: boundary.transition.programIdentity,
    })
    let kernel = kernelByIdentity.get(kernelIdentity)
    if (kernel === undefined) {
      kernel = kernelIdentities.length
      kernelIdentities.push(kernelIdentity)
      kernelByIdentity.set(kernelIdentity, kernel)
    }
    let easing = easingByIdentity.get(boundary.transition.easingIdentity)
    if (easing === undefined) {
      easing = easingIdentities.length
      easingIdentities.push(boundary.transition.easingIdentity)
      easingByIdentity.set(boundary.transition.easingIdentity, easing)
    }
    boundaries.push({
      boundaryIndex: boundary.boundaryIndex,
      startMs: boundary.startMs,
      durationMs: boundary.durationMs,
      fromStack,
      toStack,
      kernel,
      easing,
      parameters: [...boundary.transition.parameters],
    })
  }

  const cadence = recognizeBoundaryCadence(boundaries.map((boundary) => boundary.startMs))
  const fieldsPerBoundary = cadence.kind === 'regular' ? 5 : 6
  const parameterCount = boundaries.reduce((sum, boundary) => sum + boundary.parameters.length, 0)
  const elementCount = boundaries.length * fieldsPerBoundary + parameterCount
  const loopDurationMs = input.loopDurationMs
    ?? boundaries.reduce((maximum, boundary) => Math.max(maximum, boundary.startMs + boundary.durationMs), 0)

  return {
    status: 'compatible',
    stackPlanCount: stackPlanIdentities.length,
    kernelCount: kernelIdentities.length,
    easingCount: easingIdentities.length,
    stackPlanIndexByScene: input.scenes.map((scene) => stackPlanByScene.get(scene.sceneIndex)!),
    stackPlanIdentities,
    kernelIdentities,
    easingIdentities,
    boundaries,
    cadence,
    initialization: {
      timing: cadence.kind === 'regular' ? 'regular-cadence' : 'explicit-boundaries',
      loopBehavior: 'modulo-show-duration',
      loopDurationMs,
      generatedGlobals: 1,
      arrayWords: elementCount + 4,
      assignmentCount: elementCount,
      operationCount: 0,
    },
  }
}

export function canonicalShowScoreIdentity(value: ShowScoreIdentityValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Show score identity requires finite numbers.')
    return JSON.stringify(Object.is(value, -0) ? 0 : value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalShowScoreIdentity).join(',')}]`
  const record = value as { readonly [key: string]: ShowScoreIdentityValue }
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalShowScoreIdentity(record[key])}`
  )).join(',')}}`
}

function compatibilityReason(input: ShowScoreCompatibilityInput): ShowScoreIncompatibilityReason | null {
  if (input.outputDimension !== 2) return 'output-dimension'
  if (input.routingLayoutCount !== 1) return 'routing-layout-count'
  if (input.logicalZoneCount !== 1) return 'logical-zone-count'
  if (input.routingSwitchCount > 0) return 'routing-switch'
  if (input.routingPropertyRampCount > 0) return 'routing-property-ramp'
  if (input.placementPropertyTrackCount > 0) return 'placement-property-track'
  if (input.transitionRampCount > 0) return 'transition-ramp'
  if (input.freezeAtEntryCount > 0) return 'freeze-at-entry'
  return null
}

function recognizeBoundaryCadence(startsMs: number[]): ShowScoreCadence {
  if (startsMs.length < 2) return { kind: 'explicit', boundaryStartsMs: [...startsMs] }
  const periodMs = startsMs[1] - startsMs[0]
  if (periodMs <= 0 || startsMs.some((start, index) => index > 0 && start - startsMs[index - 1] !== periodMs)) {
    return { kind: 'explicit', boundaryStartsMs: [...startsMs] }
  }
  return { kind: 'regular', firstBoundaryMs: startsMs[0], periodMs }
}

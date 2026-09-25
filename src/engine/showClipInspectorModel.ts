import type {
  ShowClipBlink,
  ShowClipPresentation,
  ShowClipTransform,
  ShowClipViewport,
  ShowClipEffect,
  ShowClipEvaluationPolicy,
  ShowLightShutter,
  ShowPatternRef,
  ShowPlacementView,
  ShowSteppedClock,
} from './personalContentRecords'

export type ShowClipInspectorScope = 'global' | 'scene-main' | 'scene-overlay'

export type ShowClipInspectorOwner =
  | { kind: 'global'; cellId: string }
  | { kind: 'scene-main'; sceneId: string; zoneId: string; placementId: string }
  | { kind: 'scene-overlay'; sceneId: string; zoneId: string; layerId: string; placementId: string }

export interface ShowClipInspectorCapabilities {
  pattern: true
  simulation: true
  view: true
  effects: true
  patternControls: true
  structural: boolean
  localTiming: boolean
  layerAssignment: boolean
  placementOpacity: boolean
  localActions: boolean
  propertyAnimation: 'boundary-ramp' | 'local-keyframes'
}

export interface ShowClipInspectorSimulation {
  timeScale: number
  timeOffsetMs: number
  lightShutter?: ShowLightShutter
  steppedClock?: ShowSteppedClock
  controlTargets?: Record<string, number>
}

export interface ShowClipInspectorValue {
  scope: ShowClipInspectorScope
  owner: ShowClipInspectorOwner
  pattern: ShowPatternRef
  patternName: string
  evaluationPolicy: ShowClipEvaluationPolicy
  presentation: ShowClipPresentation
  blink?: ShowClipBlink
  simulation: ShowClipInspectorSimulation
  view: ShowPlacementView
  transform: ShowClipTransform
  viewport: ShowClipViewport
  effects: ShowClipEffect[]
  placementId?: string
  instanceId?: string
  layerId?: string
  local?: {
    startMs: number
    durationMs: number
    opacity?: number
  }
}

export interface ShowClipInspectorPatch {
  pattern?: { ref: ShowPatternRef; name: string }
  evaluationPolicy?: ShowClipEvaluationPolicy
  presentation?: ShowClipPresentation
  blink?: ShowClipBlink | null
  simulation?: Partial<ShowClipInspectorSimulation>
  view?: Partial<ShowPlacementView>
  transform?: Partial<ShowClipTransform>
  viewport?: Partial<ShowClipViewport>
  effects?: ShowClipEffect[]
  local?: Partial<NonNullable<ShowClipInspectorValue['local']>>
  entryPolicy?: 'continue' | 'restart'
}

const COMMON_CAPABILITIES = {
  pattern: true,
  simulation: true,
  view: true,
  effects: true,
  patternControls: true,
} as const

export function showClipInspectorCapabilities(scope: ShowClipInspectorScope): ShowClipInspectorCapabilities {
  if (scope === 'global') {
    return {
      ...COMMON_CAPABILITIES,
      structural: true,
      localTiming: false,
      layerAssignment: false,
      placementOpacity: false,
      localActions: false,
      propertyAnimation: 'boundary-ramp',
    }
  }
  return {
    ...COMMON_CAPABILITIES,
    structural: false,
    localTiming: true,
    layerAssignment: scope === 'scene-overlay',
    placementOpacity: true,
    localActions: true,
    propertyAnimation: 'local-keyframes',
  }
}

export function normalizeShowClipEvaluationPolicy(
  policy: ShowClipEvaluationPolicy | undefined,
): ShowClipEvaluationPolicy {
  return policy === 'freeze-at-entry' || policy === 'rolling-refresh' ? policy : 'live'
}

import type {
  ShowCompositionV1,
  ShowPatternInstance,
  ShowRecord,
} from './personalContentRecords'
import { addShowMainClip } from './showCompositionModel'
import { projectShowTimeline } from './showModel'

export type ShowMainClipAddPlan =
  | {
      enabled: true
      code: 'ready'
      sceneId: string
      localStartMs: number
      durationMs: number
    }
  | {
      enabled: false
      code: 'invalid-time' | 'transition' | 'missing-owner' | 'occupied' | 'no-space'
      reason: string
    }

export interface ShowMainClipAddLocation {
  zoneId: string
  globalTimeMs: number
  defaultDurationMs?: number
}

export function planShowMainClipAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: ShowMainClipAddLocation,
): ShowMainClipAddPlan {
  if (!Number.isFinite(input.globalTimeMs)) {
    return { enabled: false, code: 'invalid-time', reason: 'Choose a time inside the Show.' }
  }

  const globalTimeMs = Math.round(input.globalTimeMs)
  const timeline = projectShowTimeline(show)
  if (globalTimeMs < 0 || globalTimeMs >= timeline.durationMs) {
    return { enabled: false, code: 'invalid-time', reason: 'Choose a time before Show End.' }
  }

  if (timeline.transitions.some((transition) => (
    globalTimeMs >= transition.startMs && globalTimeMs < transition.endMs
  ))) {
    return { enabled: false, code: 'transition', reason: 'A Clip cannot begin inside a Transition.' }
  }

  const sceneRange = timeline.scenes.find((scene) => (
    globalTimeMs >= scene.startMs && globalTimeMs < scene.endMs
  ))
  const sceneComposition = sceneRange
    ? composition.scenes.find((scene) => scene.sceneId === sceneRange.sceneId)
    : undefined
  const zone = sceneComposition?.zones.find((candidate) => candidate.zoneId === input.zoneId)
  if (!sceneRange || !zone) {
    return { enabled: false, code: 'missing-owner', reason: 'The selected Zone has no Layer at the playhead.' }
  }

  const localStartMs = globalTimeMs - sceneRange.startMs
  if (zone.main.some((placement) => (
    localStartMs >= placement.startMs
    && localStartMs < placement.startMs + placement.durationMs
  ))) {
    return { enabled: false, code: 'occupied', reason: 'The selected Layer already has a Clip at the playhead.' }
  }

  const nextObstructionMs = zone.main
    .filter((placement) => placement.startMs > localStartMs)
    .reduce((nearest, placement) => Math.min(nearest, placement.startMs), sceneRange.scene.durationMs)
  const availableMs = nextObstructionMs - localStartMs
  if (availableMs < 1) {
    return { enabled: false, code: 'no-space', reason: 'There is no empty time on the selected Layer.' }
  }

  const defaultDurationMs = Math.max(1, Math.round(input.defaultDurationMs ?? 5_000))
  return {
    enabled: true,
    code: 'ready',
    sceneId: sceneRange.sceneId,
    localStartMs,
    durationMs: Math.min(defaultDurationMs, availableMs),
  }
}

export function addShowMainClipAtGlobalTime(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: ShowMainClipAddLocation & {
    instance: ShowPatternInstance
    placementId: string
  },
): ShowCompositionV1 {
  const plan = planShowMainClipAtGlobalTime(show, composition, input)
  if (!plan.enabled) return composition

  return addShowMainClip(show, composition, {
    sceneId: plan.sceneId,
    zoneId: input.zoneId,
    instance: input.instance,
    placement: {
      id: input.placementId,
      instanceId: input.instance.id,
      startMs: plan.localStartMs,
      durationMs: plan.durationMs,
      view: { mirror: false, phase: 0, brightness: 1 },
    },
  })
}

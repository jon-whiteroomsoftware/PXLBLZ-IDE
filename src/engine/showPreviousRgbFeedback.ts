import type { ShowOutputEffect } from './personalContentRecords'

export const DEFAULT_SHOW_TRAILS_RETENTION = 15 / 16

export function normalizeShowOutputEffects(
  effects: readonly ShowOutputEffect[] | null | undefined,
): ShowOutputEffect[] {
  const trails = (effects ?? []).find((effect) => effect.kind === 'trails')
  if (!trails) return []
  const retention = Number.isFinite(trails.retention)
    ? Math.max(0, Math.min(1, trails.retention))
    : DEFAULT_SHOW_TRAILS_RETENTION
  return [{ id: trails.id || 'trails', kind: 'trails', retention }]
}

export interface PreviousRgbFeedbackState {
  ownerToken: number
  invalidationToken: number
  previousElapsedMs: number
  ready: boolean
}

export interface PreviousRgbFeedbackStep {
  mode: 'seed' | 'feedback'
  invalidation: 'owner-changed' | 'semantic-change' | 'time-rewind' | null
  state: PreviousRgbFeedbackState
}

export function createPreviousRgbFeedbackState(): PreviousRgbFeedbackState {
  return {
    ownerToken: -1,
    invalidationToken: -1,
    previousElapsedMs: -1,
    ready: false,
  }
}

export function stepPreviousRgbFeedback(
  state: PreviousRgbFeedbackState,
  input: { ownerToken: number; invalidationToken: number; elapsedMs: number },
): PreviousRgbFeedbackStep {
  const elapsedMs = Math.max(0, input.elapsedMs)
  const invalidation = input.ownerToken !== state.ownerToken
    ? 'owner-changed' as const
    : input.invalidationToken !== state.invalidationToken
      ? 'semantic-change' as const
      : elapsedMs < state.previousElapsedMs
        ? 'time-rewind' as const
        : null
  const next = {
    ownerToken: input.ownerToken,
    invalidationToken: input.invalidationToken,
    previousElapsedMs: elapsedMs,
    ready: invalidation ? false : state.ready,
  }
  return { mode: next.ready ? 'feedback' : 'seed', invalidation, state: next }
}

export function completePreviousRgbFrame(
  state: PreviousRgbFeedbackState,
): PreviousRgbFeedbackState {
  return { ...state, ready: true }
}

export type PreviousRgbColor = [number, number, number]

/** Linear-RGB light-trail composite: live light is never dimmed by history. */
export function applyPreviousRgbDecay(
  live: PreviousRgbColor,
  previous: PreviousRgbColor,
  retention: number,
): PreviousRgbColor {
  const normalizedRetention = Number.isFinite(retention)
    ? Math.max(0, Math.min(1, retention))
    : 0
  return live.map((channel, index) => Math.max(
    Math.max(0, Math.min(1, channel)),
    Math.max(0, Math.min(1, previous[index])) * normalizedRetention,
  )) as PreviousRgbColor
}

export type PreviousRgbTransitionConflictPolicy =
  | 'suspend-clear'
  | 'force-live-live'
  | 'author-choice'

export interface PreviousRgbTransitionConflictDecision {
  policy: PreviousRgbTransitionConflictPolicy
  transitionMode: 'snapshot-live' | 'live-live' | 'unresolved'
  feedbackMode: 'continuous' | 'suspend-clear' | 'unresolved'
  blocksCompilation: boolean
  additionalArrayWords: 0
  disclosure: string
}

export function resolvePreviousRgbTransitionConflict(
  policy: PreviousRgbTransitionConflictPolicy,
  hasRequiredSnapshot: boolean,
): PreviousRgbTransitionConflictDecision {
  if (!hasRequiredSnapshot) {
    return {
      policy,
      transitionMode: 'live-live',
      feedbackMode: 'continuous',
      blocksCompilation: false,
      additionalArrayWords: 0,
      disclosure: 'No required Transition snapshot overlaps the previous-RGB lifetime.',
    }
  }
  if (policy === 'suspend-clear') {
    return {
      policy,
      transitionMode: 'snapshot-live',
      feedbackMode: 'suspend-clear',
      blocksCompilation: false,
      additionalArrayWords: 0,
      disclosure: 'The required Transition snapshot owns the RGB arena; Trails suspend and reseed after the boundary.',
    }
  }
  if (policy === 'force-live-live') {
    return {
      policy,
      transitionMode: 'live-live',
      feedbackMode: 'continuous',
      blocksCompilation: false,
      additionalArrayWords: 0,
      disclosure: 'Trails keep the RGB arena; the boundary uses live/live rendering instead of a snapshot.',
    }
  }
  return {
    policy,
    transitionMode: 'unresolved',
    feedbackMode: 'unresolved',
    blocksCompilation: true,
    additionalArrayWords: 0,
    disclosure: 'The author must choose Transition snapshot continuity or Trails continuity.',
  }
}

export type PreviousRgbSeekPolicy = 'reconstruct-history' | 'clear-at-target'

export function describePreviousRgbSeek(
  policy: PreviousRgbSeekPolicy,
  targetMs: number,
  stepMs: number,
): {
  policy: PreviousRgbSeekPolicy
  feedbackFrames: number
  preservesHistory: boolean
  seedsAtTarget: boolean
} {
  if (policy === 'clear-at-target') {
    return {
      policy,
      feedbackFrames: 0,
      preservesHistory: false,
      seedsAtTarget: true,
    }
  }
  const normalizedTarget = Number.isFinite(targetMs) ? Math.max(0, targetMs) : 0
  const normalizedStep = Number.isFinite(stepMs) ? Math.max(Number.EPSILON, stepMs) : 1_000 / 60
  return {
    policy,
    feedbackFrames: Math.ceil(normalizedTarget / normalizedStep - 1e-9),
    preservesHistory: true,
    seedsAtTarget: false,
  }
}

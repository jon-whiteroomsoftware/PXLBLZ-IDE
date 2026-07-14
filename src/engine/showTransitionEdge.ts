import type { ShowTransitionEdgePolicy } from './personalContentRecords'

export interface ShowTransitionEdgeResult {
  mode: 'outgoing' | 'incoming' | 'blend'
  mix: number
}

export function normalizeShowTransitionEdgePolicy(
  policy: ShowTransitionEdgePolicy | undefined,
  feather: number,
): ShowTransitionEdgePolicy {
  if (policy === 'hard' || policy === 'dither' || policy === 'blend') return policy
  return feather > 0 ? 'dither' : 'hard'
}

export function evaluateShowTransitionEdge(input: {
  position: number
  progress: number
  feather: number
  policy: ShowTransitionEdgePolicy
  hash: number
}): ShowTransitionEdgeResult {
  const progress = clamp01(input.progress)
  const feather = clamp01(input.feather)
  if (input.policy === 'hard' || feather === 0) {
    return input.position < progress ? { mode: 'incoming', mix: 1 } : { mode: 'outgoing', mix: 0 }
  }
  const mix = clamp01((progress + feather / 2 - input.position) / feather)
  if (mix <= 0) return { mode: 'outgoing', mix: 0 }
  if (mix >= 1) return { mode: 'incoming', mix: 1 }
  if (input.policy === 'blend') return { mode: 'blend', mix }
  return input.hash < mix ? { mode: 'incoming', mix: 1 } : { mode: 'outgoing', mix: 0 }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

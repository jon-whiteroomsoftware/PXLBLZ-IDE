import { applyShowEasing } from './showEasing'
import type { ShowRoutingDirection, ShowTransitionEasing } from './personalContentRecords'

export function selectRoutingTransferLayout(
  progress: number,
  position: number,
  easing: ShowTransitionEasing,
  direction: ShowRoutingDirection,
): 'source' | 'destination' {
  if (progress <= 0) return 'source'
  if (progress >= 1) return 'destination'
  const threshold = applyShowEasing(easing, progress)
  const normalizedPosition = Math.max(0, Math.min(1, position))
  const directedPosition = direction === 'reverse' ? 1 - normalizedPosition : normalizedPosition
  return directedPosition < threshold ? 'destination' : 'source'
}

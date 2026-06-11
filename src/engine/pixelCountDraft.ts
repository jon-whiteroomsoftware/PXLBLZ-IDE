import { clampPixelCount } from '@/engine/camera'

export function sanitizePixelCountDraft(value: string): string {
  return value.replace(/\D/g, '')
}

export function parsePixelCountDraft(value: string): number | null {
  const parsed = parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return clampPixelCount(parsed)
}

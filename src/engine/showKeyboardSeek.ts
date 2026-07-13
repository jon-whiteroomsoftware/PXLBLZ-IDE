export function showKeyboardSeekStepMs(heldForMs: number): number {
  const elapsed = Math.max(0, heldForMs)
  if (elapsed >= 1_500) return 5_000
  if (elapsed >= 500) return 2_000
  return 1_000
}

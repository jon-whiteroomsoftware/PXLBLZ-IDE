export function formatShowTime(timeMs: number): string {
  const tenths = Math.max(0, Math.round((Number.isFinite(timeMs) ? timeMs : 0) / 100))
  const minutes = Math.floor(tenths / 600)
  const seconds = Math.floor((tenths % 600) / 10)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths % 10}`
}

export function formatShowClipIdentity(startMs: number, patternName: string): string {
  return `${formatShowIdentityTime(startMs)}: ${patternName}`
}

export function formatShowBoundaryIdentity(startMs: number, incomingPatternNames: string[]): string {
  const [primary, ...additional] = incomingPatternNames
  if (!primary) return formatShowIdentityTime(startMs)
  return `${formatShowClipIdentity(startMs, primary)}${additional.length > 0 ? ` + ${additional.length}` : ''}`
}

function formatShowIdentityTime(timeMs: number): string {
  const tenths = Math.max(0, Math.round((Number.isFinite(timeMs) ? timeMs : 0) / 100))
  const minutes = Math.floor(tenths / 600)
  const seconds = Math.floor((tenths % 600) / 10)
  const secondsAndTenths = `${minutes > 0 ? String(seconds).padStart(2, '0') : seconds}.${tenths % 10}`
  return minutes > 0 ? `${minutes}:${secondsAndTenths}` : secondsAndTenths
}

/** Finite diagnostic input; unrestricted utterances and dialogue are not qualified. */
export interface AgentResizeIntent { clipId: string; durationMs: number }
export function parseAgentResizeIntent(value: unknown): AgentResizeIntent | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 2 || !Object.prototype.hasOwnProperty.call(record, 'clipId') || !Object.prototype.hasOwnProperty.call(record, 'durationMs')
    || typeof record.clipId !== 'string' || !record.clipId || !Number.isSafeInteger(record.durationMs) || (record.durationMs as number) <= 0) return undefined
  return { clipId: record.clipId, durationMs: record.durationMs as number }
}
export function sameAgentResizeIntent(expected: AgentResizeIntent, value: unknown): boolean {
  const actual = parseAgentResizeIntent(value)
  return !!actual && actual.clipId === expected.clipId && actual.durationMs === expected.durationMs
}

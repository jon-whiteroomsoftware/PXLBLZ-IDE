// Pure analysis for the Controller Save probe (#1268). No I/O.

export interface ProgramKey {
  id: string
  name: string
}

/** The longest stretch in [from, to] with no inbound frame. The window edges
 * count as boundaries, so silence before the first frame or after the last
 * one inside the window is included. */
export function maxInboundGapMs(inboundAt: readonly number[], from: number, to: number): number {
  let previous = from
  let longest = 0
  for (const at of inboundAt) {
    if (at < from) continue
    if (at > to) break
    longest = Math.max(longest, at - previous)
    previous = at
  }
  return Math.max(longest, to - previous)
}

/** Compare a read-back with the starting list after removing the probe's own ids.
 * Returns the probe ids that are missing and any change to unrelated Patterns. */
export function compareReadBack(
  starting: readonly ProgramKey[],
  readBack: readonly ProgramKey[],
  expectedProbeIds: readonly string[],
): { missingProbeIds: string[]; unexpected: ProgramKey[]; lost: ProgramKey[] } {
  const probe = new Set(expectedProbeIds)
  const key = (program: ProgramKey) => `${program.id}\t${program.name}`
  const listedIds = new Set(readBack.map((program) => program.id))
  const startingKeys = new Set(starting.map(key))
  const unrelated = readBack.filter((program) => !probe.has(program.id))
  const unrelatedKeys = new Set(unrelated.map(key))
  return {
    missingProbeIds: expectedProbeIds.filter((id) => !listedIds.has(id)),
    unexpected: unrelated.filter((program) => !startingKeys.has(key(program))),
    lost: starting.filter((program) => !probe.has(program.id) && !unrelatedKeys.has(key(program))),
  }
}

/** Deterministic, compression-resistant filler so a probe source has realistic
 * stored size. Emitted as a trailing comment, so it never changes bytecode. */
export function sourcePadding(bytes: number, seed = 1268): string {
  if (bytes <= 0) return ''
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let state = seed >>> 0
  let body = ''
  while (body.length < bytes) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    body += alphabet[state % alphabet.length]
    if (body.length % 96 === 95) body += '\n// '
  }
  return `\n// ${body}\n`
}

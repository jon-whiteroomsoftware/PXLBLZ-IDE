// Pure analysis for the Controller Save probe (#1268). No I/O.

import { FrameFlag, MessageType } from '../../src/engine/PixelblazeConnection'

export interface ProgramKey {
  id: string
  name: string
}

/** Only the last source frame counts as the end of the upload. */
export function isFinalSaveFrame(frame: Uint8Array): boolean {
  return frame.length >= 2 && frame[0] === MessageType.putSourceCode && (frame[1] & FrameFlag.last) !== 0
}

/** Report the firmware's flash-write reply, including an explicit rejection. */
export function readSaveAcknowledgement(text: string): boolean | undefined {
  if (!text.includes('"saveProgramSourceFile"')) return undefined
  try {
    const reply = JSON.parse(text) as { saveProgramSourceFile?: unknown } | null
    const acknowledged = reply?.saveProgramSourceFile
    return typeof acknowledged === 'boolean' ? acknowledged : undefined
  } catch {
    return undefined
  }
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

import {
  parsePxlblzBanner,
  stripPxlblzBanner,
  type ParsedPxlblzBanner,
} from './artifactStamp'
import { decodePbp } from './pbpEncode'

export interface RecoveredSavedProgram {
  programId: string
  deviceName: string
  sourceCode: string | null
  stamp: ParsedPxlblzBanner | null
}

export type SavedProgramRecoveryResult =
  | { ok: true; value: RecoveredSavedProgram }
  | { ok: false; error: { kind: 'undecodable'; message: string } }

/** Decode one raw `/p/{id}` PBP blob into the information Studio can recover.
 *  IDE banners are parsed before being removed from source so a later import gets
 *  clean editable code and durable provenance as separate values. */
export function recoverSavedProgram(
  programId: string,
  bytes: Uint8Array,
): SavedProgramRecoveryResult {
  let decoded
  try {
    decoded = decodePbp(bytes)
  } catch {
    decoded = null
  }
  if (!decoded) {
    return {
      ok: false,
      error: {
        kind: 'undecodable',
        message: `Saved program ${programId} is not a readable PBP blob.`,
      },
    }
  }

  const storedSource = decoded.sourceCode || null
  const stamp = storedSource ? parsePxlblzBanner(storedSource) : null
  return {
    ok: true,
    value: {
      programId,
      deviceName: decoded.name,
      sourceCode: storedSource ? stripPxlblzBanner(storedSource) : null,
      stamp,
    },
  }
}

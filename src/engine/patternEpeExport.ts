import { makeProgramId } from './bytecodePush'
import { epeFilenameStem } from './showEpeExport'

export interface PatternEpeExport {
  filename: string
  text: string
}

// The .epe id is the pattern's durable identity: devices overwrite in place on
// a same-id push, and the pattern library's upload flow keys on it the same
// way. Deriving it deterministically from a seed (the Studio record id) means
// re-downloading the same Pattern always yields the same id, so a later
// library upload replaces the entry instead of duplicating it.
export function stableProgramIdForSeed(seed: string): string {
  let h = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    h = (h ^ seed.charCodeAt(i)) >>> 0
    h = Math.imul(h, 16777619) >>> 0
  }
  const rng = () => {
    h = (h + 0x6d2b79f5) >>> 0
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return makeProgramId(rng)
}

// Package one stamped flat Pattern artifact as a genuine .epe — the same
// { name, id, sources.main, preview } envelope Show exports and the
// Pixelblaze editor use — so a downloaded Pattern can go straight to the
// pattern library or another controller without a re-export round trip.
export function buildPatternEpeExport(
  name: string,
  stampedSource: string,
  options: { id?: string; idSeed?: string; preview?: string } = {},
): PatternEpeExport {
  const trimmed = name.trim() || 'Pattern'
  const id = options.id ?? (options.idSeed ? stableProgramIdForSeed(options.idSeed) : makeProgramId())
  return {
    filename: `${epeFilenameStem(trimmed, 'pattern')}.epe`,
    text: JSON.stringify({
      name: trimmed,
      id,
      sources: { main: stampedSource },
      preview: options.preview ?? '',
    }, null, 2),
  }
}

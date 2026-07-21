import { makeProgramId } from './bytecodePush'
import { epeFilenameStem } from './showEpeExport'

export interface PatternEpeExport {
  filename: string
  text: string
}

// Package one stamped flat Pattern artifact as a genuine .epe — the same
// { name, id, sources.main, preview } envelope Show exports and the
// Pixelblaze editor use — so a downloaded Pattern can go straight to the
// pattern library or another controller without a re-export round trip.
export function buildPatternEpeExport(
  name: string,
  stampedSource: string,
  options: { id?: string; preview?: string } = {},
): PatternEpeExport {
  const trimmed = name.trim() || 'Pattern'
  return {
    filename: `${epeFilenameStem(trimmed, 'pattern')}.epe`,
    text: JSON.stringify({
      name: trimmed,
      id: options.id ?? makeProgramId(),
      sources: { main: stampedSource },
      preview: options.preview ?? '',
    }, null, 2),
  }
}

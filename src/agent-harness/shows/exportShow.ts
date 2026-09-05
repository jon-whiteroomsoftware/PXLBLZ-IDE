// Provenance: pxlblz-v3 src/shows/exportShow.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Bridge from an agent-authored ShowRecord document to runnable artifacts:
// the v2-IDE-importable .epe and the bare generated Pattern source. Pure
// logic — the CLI is a thin wrapper.
import { buildShowEpeExport } from '@/engine/showEpeExport'
import {
  compileShowDocument,
  prepareShowDocument,
  type InlinePattern,
  type ShowEvaluationOptions,
  type ShowIssue,
} from './evaluate.js'

export interface ExportShowOptions extends ShowEvaluationOptions {
  /** Provenance stamp time; inject for deterministic output. */
  stampedAt?: Date | string
  /** .epe program id; injected for deterministic output, random otherwise. */
  epeId?: string
}

export type ExportShowResult =
  | { ok: false; errors: ShowIssue[] }
  | {
      ok: true
      /** Suggested .epe filename from the Show's own name. */
      epeFilename: string
      /** IDE-importable .epe file content. */
      epeText: string
      /** Documented, stamped generated Pattern source (paste anywhere). */
      source: string
      artifactBytes: number
      artifactBudgetRatio: number
      artifactBlocker?: string
    }

export function exportShowDocument(
  input: unknown,
  inlinePatterns: InlinePattern[] = [],
  options: ExportShowOptions = {},
): ExportShowResult {
  const compiled = compileShowDocument(input, inlinePatterns, {
    stageDimension: options.stageDimension,
    targetPixelCount: options.targetPixelCount,
  })
  if (!compiled.ok) return { ok: false, errors: compiled.errors }

  // compileShowDocument already validated the document, so this re-parse
  // only recovers the typed record for the exporter.
  const prepared = prepareShowDocument(input, inlinePatterns)
  if ('errors' in prepared) return { ok: false, errors: prepared.errors }

  const epe = buildShowEpeExport(prepared.prepared.show, compiled.code, {
    stampedAt: options.stampedAt,
    id: options.epeId,
  })
  return {
    ok: true,
    epeFilename: epe.filename,
    epeText: epe.text,
    source: epe.source,
    artifactBytes: compiled.summary.artifactBytes,
    artifactBudgetRatio: compiled.summary.artifactBudgetRatio,
    ...(compiled.artifactBlocker ? { artifactBlocker: compiled.artifactBlocker } : {}),
  }
}

// Provenance: pxlblz-v3 src/shows/exportShow.ts at 9ecd481f, re-authored onto the
// version-2 record for #1039 (see src/agent-harness/PROVENANCE.md).
// Bridge from an agent-authored `ShowRecordV2` to runnable artifacts: the
// IDE-importable `.epe` and the bare generated Pattern source. Pure logic — the
// CLI is a thin wrapper. Both come from the production v2 exporters, so a
// reopened artifact is the one the editor would have produced.
import { buildShowEpeExportV2 } from '@/engine/showEpeExportV2'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
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
    }

export function exportShowDocument(
  input: unknown,
  inlinePatterns: InlinePattern[] = [],
  options: ExportShowOptions = {},
): ExportShowResult {
  const compiled = compileShowDocument(input, inlinePatterns, options)
  if (!compiled.ok) return { ok: false, errors: compiled.errors }

  // compileShowDocument already validated the document, so this re-parse only
  // recovers the typed record for the exporter.
  const prepared = prepareShowDocument(input, inlinePatterns)
  if ('errors' in prepared) return { ok: false, errors: prepared.errors }

  const epe = buildShowEpeExportV2(prepared.prepared.show as ShowRecordV2, compiled.code, {
    userMaps: [...(options.maps ?? [])],
    ...(options.stampedAt !== undefined ? { stampedAt: options.stampedAt } : {}),
    ...(options.epeId !== undefined ? { id: options.epeId } : {}),
  })
  if (epe.status === 'refused') {
    return { ok: false, errors: [{ code: 'delivery', message: epe.message }] }
  }
  return {
    ok: true,
    epeFilename: epe.filename,
    epeText: epe.text,
    source: epe.source,
    artifactBytes: compiled.summary.artifactBytes,
    artifactBudgetRatio: compiled.summary.artifactBudgetRatio,
  }
}

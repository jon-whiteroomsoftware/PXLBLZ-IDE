// Provenance: pxlblz-v3 src/grammar/openShow.ts at 9ecd481f, re-authored onto the
// version-2 vocabulary for #1039 (see src/agent-harness/PROVENANCE.md).
// Opening a Show document for grammar editing: tier-0 validation, then the
// compact Clip listing an agent addresses Clips through. Pure logic — the MCP
// session tools are thin wrappers over these functions.
//
// There is no normalization step. A v2 record is already the one representation
// the commands read, so opening validates and lists; it never rewrites the
// caller's record into a second shape.
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import {
  parseShowDocument,
  validateAuthoringShowDocument,
  validateShowDocument,
  type InlinePattern,
  type ShowEvaluationOptions,
  type ShowIssue,
} from '../shows/evaluate.js'
import { clipSites, timelineOf } from './support.js'
import type { GrammarIssue, ShowClipListing, ShowGrammarDocument } from './types.js'

function openIssue(issue: ShowIssue): GrammarIssue {
  return {
    code: 'open-failed',
    message: `[${issue.code}] ${issue.message}`,
    ...(issue.path ? { path: issue.path } : {}),
  }
}

export type OpenShowResult =
  | { ok: true; document: ShowGrammarDocument; listing: ShowClipListing; warnings: ShowIssue[] }
  | { ok: false; issues: GrammarIssue[] }

/** Validate a v2 Show document for editing and return its Clip listing. */
export function openShowDocument(
  input: unknown,
  inlinePatterns: InlinePattern[] = [],
  options: ShowEvaluationOptions = {},
  policy: { authoringValidation?: boolean } = {},
): OpenShowResult {
  const parsed = parseShowDocument(input)
  if ('error' in parsed) return { ok: false, issues: [openIssue(parsed.error)] }

  const validate = policy.authoringValidation ? validateAuthoringShowDocument : validateShowDocument
  const validation = validate(parsed.document, inlinePatterns, options)
  if (!validation.valid) return { ok: false, issues: validation.errors.map(openIssue) }

  const document: ShowGrammarDocument = structuredClone({
    show: parsed.document as ShowRecordV2,
    inlinePatterns,
    options,
    ...(policy.authoringValidation ? { authoringValidation: true as const } : {}),
  })
  return { ok: true, document, listing: projectClipListing(document), warnings: validation.warnings }
}

/** The compact listing: every Layer, and every Clip with its identity and range. */
export function projectClipListing(document: ShowGrammarDocument): ShowClipListing {
  const timeline = timelineOf(document)
  return {
    showEndMs: timeline.showEndMs,
    layers: timeline.rows.flatMap((row) => row.layers.map((layer) => ({
      layerId: layer.id,
      zoneId: row.zoneId,
      zoneName: row.zoneName,
      name: layer.name,
      rank: layer.rank,
    }))),
    clips: clipSites(timeline).map((site) => ({
      clipId: site.item.id,
      instanceId: site.item.instanceId,
      patternName: site.item.patternName,
      zoneId: site.zoneId,
      zoneName: site.zoneName,
      layerId: site.layerId,
      layerName: site.layerName,
      layerRank: site.layerRank,
      startMs: site.item.startMs,
      endMs: site.item.endMs,
      durationMs: site.item.durationMs,
      entryPolicy: site.item.entryPolicy,
      ...(site.item.groupOccurrenceId ? { groupOccurrenceId: site.item.groupOccurrenceId } : {}),
    })),
  }
}

// Provenance: pxlblz-v3 src/grammar/openShow.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Opening a Show document for grammar editing: tier-0 validation, then
// normalization to the composition shape (the editor's projection), then the
// compact clip listing an agent addresses clips through. Pure logic — the MCP
// session tools are thin wrappers over these functions.
import type { ShowCompositionV1, ShowRecord } from '@/engine/personalContentRecords'
import { projectFlatShowToCompositionV1WithCellOrigins } from '@/engine/showCompositionModel'
import { projectShowTimeline } from '@/engine/showModel'
import { sourceForShowCell } from '@/engine/showPreviewArtifact'
import { projectShowUnifiedTimeline } from '@/engine/showUnifiedTimelineProjection'
import {
  parseShowDocument,
  prepareShowDocument,
  validateAuthoringShowDocument,
  validateShowDocument,
  type InlinePattern,
  type ShowEvaluationOptions,
  type ShowIssue,
} from '../shows/evaluate.js'
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

/**
 * Validate and normalize a Show document for editing. A Show carrying only the
 * flat cell grid gets the same projected composition the v2 editor edits
 * through; a Show that already has a composition keeps it untouched.
 */
export function openShowDocument(
  input: unknown,
  inlinePatterns: InlinePattern[] = [],
  options: ShowEvaluationOptions = {},
  policy: { authoringValidation?: boolean } = {},
): OpenShowResult {
  const validate = policy.authoringValidation ? validateAuthoringShowDocument : validateShowDocument
  const validation = validate(input, inlinePatterns, options)
  if (!validation.valid) return { ok: false, issues: validation.errors.map(openIssue) }

  const prepared = prepareShowDocument(input, inlinePatterns, options)
  const parsed = parseShowDocument(input)
  if ('error' in parsed) return { ok: false, issues: [openIssue(parsed.error)] }
  const show = parsed.document as ShowRecord
  if ('errors' in prepared && (!policy.authoringValidation || !show.composition)) return { ok: false, issues: prepared.errors.map(openIssue) }
  const userPatterns = 'prepared' in prepared ? prepared.prepared.userPatterns : []
  let composition = show.composition as ShowCompositionV1 | undefined | null
  if (!composition) {
    if (policy.authoringValidation && 'prepared' in prepared && prepared.prepared.unresolved.length) return {
      ok: false,
      issues: [{ code: 'open-failed', message: 'Flat Show projection needs the unavailable Pattern source; supply exact metadata before opening.' }],
    }
    try {
      const projection = projectFlatShowToCompositionV1WithCellOrigins(show, {
        byCellId: Object.fromEntries(
          show.cells.map((cell) => [cell.id, sourceForShowCell(cell, userPatterns)]),
        ),
        stageDimension: options.stageDimension ?? 2,
      })
      composition = { ...projection.composition, executionModel: 'deterministic-loop' }
    } catch (cause) {
      return {
        ok: false,
        issues: [{
          code: 'open-failed',
          message: `The flat Show could not be projected to a composition: ${
            cause instanceof Error ? cause.message : String(cause)}`,
        }],
      }
    }
  }

  const document: ShowGrammarDocument = structuredClone({
    show: { ...show, composition },
    inlinePatterns,
    options,
    ...(policy.authoringValidation ? { authoringValidation: true as const } : {}),
  })
  const normalized = validate(document.show, document.inlinePatterns, document.options)
  if (!normalized.valid) return { ok: false, issues: normalized.errors.map(openIssue) }
  return { ok: true, document, listing: projectClipListing(document), warnings: normalized.warnings }
}

/** The compact clip listing: every clip with its id, Zone, layer, and range. */
export function projectClipListing(document: ShowGrammarDocument): ShowClipListing {
  const composition = document.show.composition as ShowCompositionV1
  const timeline = projectShowUnifiedTimeline(document.show, composition)
  const sceneNameById = new Map(document.show.scenes.map((scene) => [scene.id, scene.name]))
  return {
    durationMs: timeline.durationMs,
    scenes: projectShowTimeline(document.show).scenes.map((scene) => ({
      sceneId: scene.sceneId,
      name: sceneNameById.get(scene.sceneId) ?? scene.sceneId,
      startMs: scene.startMs,
      endMs: scene.endMs,
    })),
    clips: timeline.zones.flatMap((zone) =>
      zone.layers.flatMap((layer) =>
        layer.clips.map((clip) => ({
          clipId: clip.id,
          startPlacementId: clip.startPlacementId,
          instanceId: clip.instanceId,
          patternName: clip.patternName,
          zoneId: zone.id,
          zoneName: zone.name,
          layer: { kind: clip.kind, index: clip.layerIndex },
          sceneId: clip.sceneId,
          startMs: clip.startMs,
          endMs: clip.endMs,
          durationMs: clip.durationMs,
        })),
      ),
    ),
  }
}

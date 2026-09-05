// Provenance: pxlblz-v3 src/grammar/openShow.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Opening a Show document for grammar editing: tier-0 validation, then
// normalization to the composition shape (the editor's projection), then the
// compact clip listing an agent addresses clips through. Pure logic — the MCP
// session tools are thin wrappers over these functions.
import type { ShowCompositionV1 } from '@/engine/personalContentRecords'
import { projectFlatShowToCompositionV1WithCellOrigins } from '@/engine/showCompositionModel'
import { projectShowTimeline } from '@/engine/showModel'
import { sourceForShowCell } from '@/engine/showPreviewArtifact'
import { projectShowUnifiedTimeline } from '@/engine/showUnifiedTimelineProjection'
import {
  prepareShowDocument,
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
  | { ok: true; document: ShowGrammarDocument; listing: ShowClipListing }
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
): OpenShowResult {
  const prepared = prepareShowDocument(input, inlinePatterns, options)
  if ('errors' in prepared) return { ok: false, issues: prepared.errors.map(openIssue) }

  const validation = validateShowDocument(input, inlinePatterns, options)
  if (!validation.valid) return { ok: false, issues: validation.errors.map(openIssue) }

  const { show, userPatterns } = prepared.prepared
  let composition = show.composition as ShowCompositionV1 | undefined | null
  if (!composition) {
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

  const document: ShowGrammarDocument = {
    show: { ...show, composition },
    inlinePatterns,
    options,
  }
  return { ok: true, document, listing: projectClipListing(document) }
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

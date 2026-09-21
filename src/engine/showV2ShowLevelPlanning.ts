import { clampPixelCount } from './camera'
import type { ShowRecordV2 } from './showCompositionV2'
import { DEFAULT_SHOW_TRAILS_RETENTION, normalizeShowOutputEffects } from './showPreviousRgbFeedback'
import type { SetShowOutputTrailsInput } from './showOutputEffectAuthoring'
import { SHOW_MAX_OUTPUT_PIXELS } from './showVmResourceLedger'
import {
  showV2OutputContractCommand,
  showV2TrailsCommand,
  type ShowV2ShowMetadataCommand,
} from './showV2ShowPropertiesEditorModel'

export interface ShowV2SetShowEndIntent {
  kind: 'set-show-end'
  showEndMs: number
}

export type ShowV2SetShowEndPlan =
  | { kind: 'intent'; intent: ShowV2SetShowEndIntent }
  | { kind: 'no-op' }
  | { kind: 'refuse' }

export function planShowV2SetShowEnd(record: ShowRecordV2, durationMs: number): ShowV2SetShowEndPlan {
  const showEndMs = Math.round(durationMs)
  if (!Number.isSafeInteger(showEndMs) || showEndMs <= 0) return { kind: 'refuse' }
  if (showEndMs === record.composition.showEndMs) return { kind: 'no-op' }
  return { kind: 'intent', intent: { kind: 'set-show-end', showEndMs } }
}

export type ShowV2ShowMetadataPlan =
  | { kind: 'intent'; intent: ShowV2ShowMetadataCommand }
  | { kind: 'no-op' }
  | { kind: 'refuse' }

export function planShowV2TrailsEdit(record: ShowRecordV2, input: SetShowOutputTrailsInput): ShowV2ShowMetadataPlan {
  if (!input || typeof input.enabled !== 'boolean') return { kind: 'refuse' }
  const current = normalizeShowOutputEffects(record.outputEffects).find((effect) => effect.kind === 'trails')
  if (!input.enabled) {
    if (!current) return { kind: 'no-op' }
    return { kind: 'intent', intent: showV2TrailsCommand({ enabled: false }) }
  }
  const retention = Number.isFinite(input.retention)
    ? Math.max(0, Math.min(1, input.retention as number))
    : current?.retention ?? DEFAULT_SHOW_TRAILS_RETENTION
  if (current && current.retention === retention) return { kind: 'no-op' }
  return { kind: 'intent', intent: showV2TrailsCommand({ enabled: true, retention }) }
}

export function planShowV2PortableReferenceEdit(
  record: ShowRecordV2,
  referenceMapId: string | null,
  referencePixelCount: number,
): ShowV2ShowMetadataPlan {
  if (record.outputContract.kind !== 'portable-2d') return { kind: 'refuse' }
  if (referenceMapId !== null && typeof referenceMapId !== 'string') return { kind: 'refuse' }
  if (typeof referenceMapId === 'string' && referenceMapId.length > 200) return { kind: 'refuse' }
  const mapId = referenceMapId?.trim() ? referenceMapId.trim() : null
  const pixelCount = Math.min(SHOW_MAX_OUTPUT_PIXELS, clampPixelCount(referencePixelCount))
  if (record.outputContract.referenceMapId === mapId && record.outputContract.referencePixelCount === pixelCount) {
    return { kind: 'no-op' }
  }
  return { kind: 'intent', intent: showV2OutputContractCommand({ kind: 'portable-2d', pixelCount, mapId }) }
}

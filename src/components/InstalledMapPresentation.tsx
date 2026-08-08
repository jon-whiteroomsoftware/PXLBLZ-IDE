import { useMemo } from 'react'
import type { InstalledMapPresentation as InstalledMapPresentationView } from '@/engine/installedMapObservation'
import {
  buildStudioMapFingerprintCandidates,
  type StudioMapFingerprintCandidate,
} from '@/engine/mapFingerprint'
import type { MapRecord } from '@/engine/personalContentRecords'

/** How a row spends width on the installed map's point count.
 *
 *  `points` spells it out ("· 256 points"). Suits a full-width row with width to
 *  spare, like the Controller profile's summary list.
 *
 *  `mismatch` shows nothing while the map's point count agrees with the device's
 *  pixel count, and an amber `256≠300` chip when it doesn't. The live Controller
 *  panel uses this: it already reports `pixel count` one band below, so the spelled-out
 *  count is duplication — and in a 352px popover that duplication cost the *name* every
 *  pixel it had (#757). A disagreement is the one case worth the room, because the
 *  firmware silently drops a mismatched map (#204).
 */
export type InstalledMapCountDisplay =
  | { mode: 'points' }
  | { mode: 'mismatch'; pixelCount: number | null }

const POINTS_COUNT: InstalledMapCountDisplay = { mode: 'points' }

export function useInstalledMapCandidates(
  userMaps: MapRecord[],
  pointCount: number | null,
): StudioMapFingerprintCandidate[] {
  return useMemo(
    () => pointCount === null
      ? []
      : buildStudioMapFingerprintCandidates({ userMaps, pixelCount: pointCount }),
    [pointCount, userMaps],
  )
}

export function InstalledMapPresentation({
  presentation,
  className = '',
  count = POINTS_COUNT,
}: {
  presentation: InstalledMapPresentationView
  className?: string
  count?: InstalledMapCountDisplay
}) {
  if (presentation.kind === 'state') {
    return <span className={className}>{presentation.label}</span>
  }

  const dimensionLabel = `${presentation.dimension}D`
  // Only a *known* device pixel count can disagree; a null one is unread, not a conflict.
  const mismatch = count.mode === 'mismatch'
    && count.pixelCount != null
    && count.pixelCount !== presentation.pointCount
  const mismatchLabel = mismatch
    ? `Map has ${presentation.pointCount} points but the Controller has ${count.pixelCount} pixels`
    : undefined

  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 ${className}`}
      data-testid="installed-map-presentation"
    >
      <span
        className={`min-w-0 truncate ${mismatch ? 'text-amber-400' : ''}`}
        title={presentation.name}
        data-testid="installed-map-name"
        data-layout-allow="overflow-x"
      >
        {presentation.name}
      </span>
      <span
        className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase leading-none tracking-wide ${
          mismatch ? 'border-amber-400/45 text-amber-400' : 'border-zinc-700 text-zinc-400'
        }`}
        title={`Installed map dimension: ${dimensionLabel}`}
        aria-label={`Installed map dimension: ${dimensionLabel}`}
      >
        {dimensionLabel}
      </span>
      {count.mode === 'points' && (
        <span className="shrink-0 text-zinc-500">
          · {presentation.pointCount} {presentation.pointCount === 1 ? 'point' : 'points'}
        </span>
      )}
      {mismatch && (
        <span
          className="shrink-0 rounded border border-amber-400/45 px-1.5 py-0.5 text-[9px] font-medium leading-none tabular-nums text-amber-400"
          title={mismatchLabel}
          aria-label={mismatchLabel}
          data-testid="installed-map-count-mismatch"
        >
          {presentation.pointCount}≠{count.pixelCount}
        </span>
      )}
    </span>
  )
}

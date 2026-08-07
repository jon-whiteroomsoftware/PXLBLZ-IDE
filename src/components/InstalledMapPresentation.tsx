import { useMemo } from 'react'
import type { InstalledMapPresentation as InstalledMapPresentationView } from '@/engine/installedMapObservation'
import {
  buildStudioMapFingerprintCandidates,
  type StudioMapFingerprintCandidate,
} from '@/engine/mapFingerprint'
import type { MapRecord } from '@/engine/personalContentRecords'

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
}: {
  presentation: InstalledMapPresentationView
  className?: string
}) {
  if (presentation.kind === 'state') {
    return <span className={className}>{presentation.label}</span>
  }

  const dimensionLabel = `${presentation.dimension}D`
  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 ${className}`}
      data-testid="installed-map-presentation"
    >
      <span className="min-w-0 truncate" title={presentation.name}>
        {presentation.name}
      </span>
      <span
        className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-[9px] font-medium uppercase leading-none tracking-wide text-zinc-400"
        title={`Installed map dimension: ${dimensionLabel}`}
        aria-label={`Installed map dimension: ${dimensionLabel}`}
      >
        {dimensionLabel}
      </span>
      <span className="shrink-0 text-zinc-500">
        · {presentation.pointCount} {presentation.pointCount === 1 ? 'point' : 'points'}
      </span>
    </span>
  )
}

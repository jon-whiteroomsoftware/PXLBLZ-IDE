import { clampPixelCount } from './camera'
import type {
  InstallationShowOutputContract,
  Portable2DShowOutputContract,
  ShowOutputContract,
} from './personalContentRecords'
import { SHOW_MAX_OUTPUT_PIXELS } from './showVmResourceLedger'

const PORTABLE_COMPATIBILITY: Portable2DShowOutputContract['compatibility'] = {
  dimensions: [2],
  mapClass: 'continuous-surface',
  resolution: 'variable',
}

export const MAX_PORTABLE_PREVIEW_PIXELS = SHOW_MAX_OUTPUT_PIXELS

export function createPortableShowOutputContract(input: {
  referenceMapId: string | null
  referencePixelCount: number
}): Portable2DShowOutputContract {
  return {
    version: 1,
    kind: 'portable-2d',
    referenceMapId: normalizeMapId(input.referenceMapId),
    referencePixelCount: Math.min(
      MAX_PORTABLE_PREVIEW_PIXELS,
      clampPixelCount(input.referencePixelCount),
    ),
    compatibility: { ...PORTABLE_COMPATIBILITY, dimensions: [2] },
  }
}

export function createInstallationShowOutputContract(input: {
  outputMapId: string | null
  pixelCount: number
}): InstallationShowOutputContract {
  return {
    version: 1,
    kind: 'installation',
    outputMapId: normalizeMapId(input.outputMapId),
    pixelCount: Math.min(SHOW_MAX_OUTPUT_PIXELS, clampPixelCount(input.pixelCount)),
    resolution: 'fixed',
  }
}

export function normalizeShowOutputContract(value: unknown): ShowOutputContract | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Record<string, unknown>
  if (candidate.version !== 1) return undefined
  if (candidate.kind === 'portable-2d') {
    return createPortableShowOutputContract({
      referenceMapId: typeof candidate.referenceMapId === 'string' ? candidate.referenceMapId : null,
      referencePixelCount: numericPixelCount(candidate.referencePixelCount),
    })
  }
  if (candidate.kind === 'installation') {
    return {
      version: 1,
      kind: 'installation',
      outputMapId: normalizeMapId(typeof candidate.outputMapId === 'string' ? candidate.outputMapId : null),
      pixelCount: clampPixelCount(numericPixelCount(candidate.pixelCount)),
      resolution: 'fixed',
    }
  }
  return undefined
}

export function requireShowOutputContract(value: unknown, showId: string): ShowOutputContract {
  const outputContract = normalizeShowOutputContract(value)
  if (!outputContract) throw new Error(`Show ${showId} is missing a valid output contract`)
  return outputContract
}

export function resolveShowOutputMapSelection(
  mapId: string | null,
  requestedPixelCount: number,
  maps: ReadonlyArray<{ id: string; fixedPixelCount?: number }>,
): { mapId: string | null; pixelCount: number; pixelCountLocked: boolean } {
  const selected = mapId ? maps.find((map) => map.id === mapId) : undefined
  const fixedPixelCount = selected?.fixedPixelCount
  return {
    mapId: normalizeMapId(mapId),
    pixelCount: Math.min(SHOW_MAX_OUTPUT_PIXELS, clampPixelCount(fixedPixelCount ?? requestedPixelCount)),
    pixelCountLocked: fixedPixelCount !== undefined,
  }
}

function numericPixelCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 1
}

function normalizeMapId(value: string | null): string | null {
  return value?.trim() || null
}

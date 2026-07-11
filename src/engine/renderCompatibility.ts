import type { RenderFns } from './loadPattern'

export type MapDimension = 1 | 2 | 3
export type RendererDimension = 1 | 2 | 3
export type RendererName = 'render' | 'render2D' | 'render3D'

export interface RenderCompatibility {
  mapDim: MapDimension
  renderer: RendererName | null
  rendererDim: RendererDimension | null
  description: string | null
}

export type FirmwareRendererSupport = 'supported' | 'unsupported' | 'unknown'

export interface HardwareRenderPlan {
  compatibility: RenderCompatibility
  adapterRequired: boolean
  firmwareSupport: FirmwareRendererSupport
  reason: string | null
}

const RENDERER_DIMENSION: Record<RendererName, RendererDimension> = {
  render: 1,
  render2D: 2,
  render3D: 3,
}

const PREFERENCE: Record<MapDimension, RendererName[]> = {
  1: ['render', 'render3D', 'render2D'],
  2: ['render2D', 'render3D', 'render'],
  3: ['render3D', 'render2D', 'render'],
}

function isAvailable(renderer: RendererName, renderFns: RenderFns): boolean {
  if (renderer === 'render') return renderFns.hasRender
  if (renderer === 'render2D') return renderFns.hasRender2D
  return renderFns.hasRender3D
}

function coordinateList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`
}

function describeAdaptation(
  mapDim: MapDimension,
  renderer: RendererName,
  rendererDim: RendererDimension,
): string | null {
  if (mapDim === rendererDim) return null
  const coordinates = ['x', 'y', 'z']
  if (rendererDim > mapDim) {
    const missing = coordinates.slice(mapDim, rendererDim)
    return `Using ${renderer} with a ${mapDim}D map; missing ${coordinateList(missing)} ${missing.length === 1 ? 'is' : 'are'} 0.5.`
  }
  const dropped = coordinates.slice(rendererDim, mapDim)
  return `Using ${renderer} with a ${mapDim}D map; ${coordinateList(dropped)} ${dropped.length === 1 ? 'is' : 'are'} dropped.`
}

/** Pixelblaze firmware-3.66 renderer preference for an installed map dimension. */
export function selectRenderCompatibility(
  mapDim: MapDimension,
  renderFns: RenderFns | undefined,
): RenderCompatibility {
  if (!renderFns) return { mapDim, renderer: null, rendererDim: null, description: null }
  const renderer = PREFERENCE[mapDim].find((candidate) => isAvailable(candidate, renderFns)) ?? null
  if (!renderer) return { mapDim, renderer: null, rendererDim: null, description: null }
  const rendererDim = RENDERER_DIMENSION[renderer]
  return {
    mapDim,
    renderer,
    rendererDim,
    description: describeAdaptation(mapDim, renderer, rendererDim),
  }
}

/** Whether the Controller reports the renderer-selection behavior added in 3.66. */
export function supportsRendererMatrix(firmwareVersion: string | undefined): boolean | null {
  if (!firmwareVersion) return null
  const match = /^v?(\d+)\.(\d+)/i.exec(firmwareVersion.trim())
  if (!match) return null
  const major = Number(match[1])
  const minor = Number(match[2])
  return major > 3 || (major === 3 && minor >= 66)
}

/**
 * Plans the downloaded artifact against the Controller's installed map. A
 * centered higher-dimensional fallback becomes an exact-arity adapter, so it
 * is compatible even before the firmware matrix existed. Lower-dimensional
 * fallback still relies on that matrix and therefore needs 3.66+.
 */
export function planHardwareRenderer(
  mapDim: MapDimension,
  renderFns: RenderFns,
  firmwareVersion: string | undefined,
): HardwareRenderPlan {
  const compatibility = selectRenderCompatibility(mapDim, renderFns)
  const adapterRequired =
    compatibility.rendererDim !== null && compatibility.rendererDim > mapDim
  if (!compatibility.renderer || compatibility.rendererDim === null) {
    return {
      compatibility,
      adapterRequired: false,
      firmwareSupport: 'unsupported',
      reason: 'The Pattern does not define a renderer the Controller can run.',
    }
  }

  const matrixSupport = supportsRendererMatrix(firmwareVersion)
  if (mapDim === 1) {
    if (matrixSupport === false) {
      return {
        compatibility,
        adapterRequired,
        firmwareSupport: 'unsupported',
        reason: 'True 1D maps require Pixelblaze firmware 3.66 or newer.',
      }
    }
    if (matrixSupport === null) {
      return {
        compatibility,
        adapterRequired,
        firmwareSupport: 'unknown',
        reason: 'The Controller firmware is unknown, so true 1D map support cannot be confirmed.',
      }
    }
  }

  const usesUnadaptedFallback = compatibility.rendererDim < mapDim
  if (usesUnadaptedFallback && matrixSupport === false) {
    return {
      compatibility,
      adapterRequired,
      firmwareSupport: 'unsupported',
      reason: 'This cross-dimensional renderer fallback requires Pixelblaze firmware 3.66 or newer.',
    }
  }
  if (usesUnadaptedFallback && matrixSupport === null) {
    return {
      compatibility,
      adapterRequired,
      firmwareSupport: 'unknown',
      reason: 'The Controller firmware is unknown, so cross-dimensional renderer fallback cannot be confirmed.',
    }
  }

  return {
    compatibility,
    adapterRequired,
    firmwareSupport: 'supported',
    reason: null,
  }
}

/** Drops extra map coordinates or supplies missing center-space coordinates. */
export function adaptSampleForRenderer(
  sample: number[],
  rendererDim: RendererDimension,
): number[] {
  return Array.from({ length: rendererDim }, (_, index) => sample[index] ?? 0.5)
}

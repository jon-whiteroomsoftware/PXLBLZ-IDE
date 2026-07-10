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

/** Drops extra map coordinates or supplies missing center-space coordinates. */
export function adaptSampleForRenderer(
  sample: number[],
  rendererDim: RendererDimension,
): number[] {
  return Array.from({ length: rendererDim }, (_, index) => sample[index] ?? 0.5)
}

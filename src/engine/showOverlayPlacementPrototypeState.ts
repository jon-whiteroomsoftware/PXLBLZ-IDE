// PROTOTYPE ONLY: pure in-memory state for the #458 Scene x Zone layer study.
// This is deliberately not the persisted Show composition schema.

export interface OverlayGeometry {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface PrototypeOverlayLayer {
  id: string
  name: string
}

export interface PrototypePlacement {
  id: string
  label: string
  patternName: string
  role: 'main' | 'overlay'
  zoneName: string
  layerId?: string
  start: number
  duration: number
  opacity: number
  effects: string[]
  geometry: OverlayGeometry
  instancePolicy: 'Continue' | 'Restart'
}

export interface OverlayPrototypeState {
  sceneName: string
  zoneName: string
  sceneDuration: number
  nextOverlayNumber: number
  nextLayerNumber: number
  selectedPlacementId: string
  selectedLayerId: string
  snapGuideSeconds?: number
  layers: PrototypeOverlayLayer[]
  placements: PrototypePlacement[]
}

const MIN_DURATION = 0.25
const LANE_HEIGHT = 32
const LANE_HYSTERESIS = 14

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const rounded = (value: number) => Math.round(value * 100) / 100

export function createNeonOrchardOverlayState(): OverlayPrototypeState {
  return {
    sceneName: 'Orchard Wake',
    zoneName: 'Canopy',
    sceneDuration: 8,
    nextOverlayNumber: 5,
    nextLayerNumber: 4,
    selectedPlacementId: 'overlay-2',
    selectedLayerId: 'layer-signal',
    layers: [
      { id: 'layer-glass', name: 'Glass' },
      { id: 'layer-signal', name: 'Signal' },
      { id: 'layer-ground', name: 'Ground echo' },
    ],
    placements: [
      main('main-1', 'Neon Beds', 'Neon Orchard', 0, 2.4),
      main('main-2', 'Pulse Canopy', 'Pulse Canopy', 2.4, 3.4),
      main('main-3', 'Orchard Dusk', 'Neon Orchard', 5.8, 2.2),
      overlay('overlay-1', 'Glass Moths', 'Spark Veil', 'layer-glass', 1.1, 3.5, 0.72, ['Bloom', 'Prism'], { x: 0.08, y: 0.13, width: 0.5, height: 0.4, rotation: -8 }),
      overlay('overlay-4', 'Moth Return', 'Spark Veil', 'layer-glass', 6.2, 1.4, 0.66, ['Bloom'], { x: 0.18, y: 0.16, width: 0.42, height: 0.35, rotation: 5 }),
      overlay('overlay-2', 'Signal Fruit', 'Comet Loom', 'layer-signal', 3.3, 2.7, 0.84, ['Kaleidoscope'], { x: 0.52, y: 0.23, width: 0.34, height: 0.5, rotation: 12 }),
      overlay('overlay-3', 'Ground Echo', 'Ripple Field', 'layer-ground', 4.4, 2.7, 0.58, ['Threshold', 'Posterize', 'Bloom'], { x: 0.2, y: 0.64, width: 0.66, height: 0.26, rotation: 0 }),
    ],
  }
}

function main(id: string, label: string, patternName: string, start: number, duration: number): PrototypePlacement {
  return {
    id,
    label,
    patternName,
    role: 'main',
    zoneName: 'Canopy',
    start,
    duration,
    opacity: 1,
    effects: [],
    geometry: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    instancePolicy: id === 'main-3' ? 'Continue' : 'Restart',
  }
}

function overlay(
  id: string,
  label: string,
  patternName: string,
  layerId: string,
  start: number,
  duration: number,
  opacity: number,
  effects: string[],
  geometry: OverlayGeometry,
): PrototypePlacement {
  return { id, label, patternName, role: 'overlay', zoneName: 'Canopy', layerId, start, duration, opacity, effects, geometry, instancePolicy: 'Restart' }
}

function intervalsOverlap(aStart: number, aDuration: number, bStart: number, bDuration: number) {
  return aStart < bStart + bDuration && aStart + aDuration > bStart
}

function layerNeighbours(state: OverlayPrototypeState, id: string, layerId: string) {
  return state.placements.filter((item) => item.role === 'overlay' && item.id !== id && item.layerId === layerId)
}

function isLegalStart(state: OverlayPrototypeState, id: string, layerId: string, start: number, duration: number) {
  return start >= 0 && start + duration <= state.sceneDuration
    && layerNeighbours(state, id, layerId).every((item) => !intervalsOverlap(start, duration, item.start, item.duration))
}

function nearestLegalStart(state: OverlayPrototypeState, id: string, layerId: string, proposedStart: number, duration: number) {
  const desired = rounded(clamp(proposedStart, 0, state.sceneDuration - duration))
  if (isLegalStart(state, id, layerId, desired, duration)) return { start: desired, snapped: false }

  const neighbours = layerNeighbours(state, id, layerId)
  const candidates = [0, state.sceneDuration - duration, ...neighbours.flatMap((item) => [item.start - duration, item.start + item.duration])]
    .map(rounded)
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .filter((candidate) => isLegalStart(state, id, layerId, candidate, duration))
    .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired))

  return candidates.length ? { start: candidates[0], snapped: true } : undefined
}

export function selectOverlayPlacement(state: OverlayPrototypeState, id: string): OverlayPrototypeState {
  const item = state.placements.find((placement) => placement.id === id)
  if (!item) return state
  return { ...state, selectedPlacementId: id, selectedLayerId: item.layerId ?? state.selectedLayerId, snapGuideSeconds: undefined }
}

export function selectOverlayLayer(state: OverlayPrototypeState, layerId: string): OverlayPrototypeState {
  return state.layers.some((layer) => layer.id === layerId) ? { ...state, selectedLayerId: layerId } : state
}

export function setPlacementInstancePolicy(
  state: OverlayPrototypeState,
  id: string,
  instancePolicy: PrototypePlacement['instancePolicy'],
): OverlayPrototypeState {
  if (!state.placements.some((placement) => placement.id === id)) return state
  return {
    ...state,
    placements: state.placements.map((placement) => placement.id === id ? { ...placement, instancePolicy } : placement),
  }
}

export function addOverlayLayer(state: OverlayPrototypeState): OverlayPrototypeState {
  const id = `layer-${state.nextLayerNumber}`
  return {
    ...state,
    nextLayerNumber: state.nextLayerNumber + 1,
    selectedLayerId: id,
    layers: [{ id, name: `Overlay ${state.nextLayerNumber}` }, ...state.layers],
  }
}

export function addOverlayClip(state: OverlayPrototypeState, layerId = state.selectedLayerId, proposedStart = 2.25): OverlayPrototypeState {
  if (!state.layers.some((layer) => layer.id === layerId)) return state
  const id = `overlay-${state.nextOverlayNumber}`
  const timing = nearestLegalStart(state, id, layerId, proposedStart, 1.5)
  if (!timing) return state
  const placement = overlay(id, `New clip ${state.nextOverlayNumber}`, 'Portal Bloom', layerId, timing.start, 1.5, 0.75, ['Bloom'], { x: 0.3, y: 0.28, width: 0.4, height: 0.36, rotation: 0 })
  return {
    ...state,
    nextOverlayNumber: state.nextOverlayNumber + 1,
    selectedPlacementId: id,
    selectedLayerId: layerId,
    snapGuideSeconds: timing.snapped ? timing.start : undefined,
    placements: [...state.placements, placement],
  }
}

export function moveOverlayClip(state: OverlayPrototypeState, id: string, move: { proposedStart: number; targetLayerId?: string }): OverlayPrototypeState {
  const item = state.placements.find((placement) => placement.id === id && placement.role === 'overlay')
  if (!item?.layerId) return state
  const targetLayerId = move.targetLayerId ?? item.layerId
  if (!state.layers.some((layer) => layer.id === targetLayerId)) return state
  const timing = nearestLegalStart(state, id, targetLayerId, move.proposedStart, item.duration)
  if (!timing) return state
  return {
    ...state,
    selectedPlacementId: id,
    selectedLayerId: targetLayerId,
    snapGuideSeconds: timing.snapped ? timing.start : undefined,
    placements: state.placements.map((placement) => placement.id === id ? { ...placement, start: timing.start, layerId: targetLayerId } : placement),
  }
}

export function resizeOverlayClip(state: OverlayPrototypeState, id: string, edge: 'start' | 'end', deltaSeconds: number): OverlayPrototypeState {
  const item = state.placements.find((placement) => placement.id === id && placement.role === 'overlay')
  if (!item?.layerId) return state
  const neighbours = layerNeighbours(state, id, item.layerId)
  let start = item.start
  let end = item.start + item.duration
  if (edge === 'start') {
    const previousEnd = Math.max(0, ...neighbours.filter((other) => other.start < item.start).map((other) => other.start + other.duration))
    start = clamp(item.start + deltaSeconds, previousEnd, end - MIN_DURATION)
  } else {
    const nextStart = Math.min(state.sceneDuration, ...neighbours.filter((other) => other.start >= end).map((other) => other.start))
    end = clamp(end + deltaSeconds, start + MIN_DURATION, nextStart)
  }
  start = rounded(start)
  end = rounded(end)
  return {
    ...state,
    selectedPlacementId: id,
    snapGuideSeconds: edge === 'start' ? start : end,
    placements: state.placements.map((placement) => placement.id === id ? { ...placement, start, duration: rounded(end - start) } : placement),
  }
}

export function resolveLayerDrag(layers: PrototypeOverlayLayer[], initialLayerId: string, deltaY: number): string {
  const initialIndex = layers.findIndex((layer) => layer.id === initialLayerId)
  if (initialIndex < 0 || Math.abs(deltaY) < LANE_HYSTERESIS) return initialLayerId
  const direction = Math.sign(deltaY)
  const steps = 1 + Math.floor((Math.abs(deltaY) - LANE_HYSTERESIS) / LANE_HEIGHT)
  return layers[clamp(initialIndex + direction * steps, 0, layers.length - 1)]?.id ?? initialLayerId
}

export function reorderOverlayLayer(state: OverlayPrototypeState, layerId: string, direction: -1 | 1): OverlayPrototypeState {
  const index = state.layers.findIndex((layer) => layer.id === layerId)
  const swapIndex = clamp(index + direction, 0, state.layers.length - 1)
  if (index < 0 || index === swapIndex) return state
  const layers = [...state.layers]
  ;[layers[index], layers[swapIndex]] = [layers[swapIndex], layers[index]]
  return { ...state, selectedLayerId: layerId, layers }
}

export function duplicateOverlayPlacement(state: OverlayPrototypeState, id: string): OverlayPrototypeState {
  const original = state.placements.find((item) => item.id === id && item.role === 'overlay')
  if (!original?.layerId) return state
  const duplicateId = `overlay-${state.nextOverlayNumber}`
  const timing = nearestLegalStart(state, duplicateId, original.layerId, original.start + original.duration + 0.25, original.duration)
  if (timing) {
    const duplicate = { ...original, id: duplicateId, label: `${original.label} copy`, start: timing.start, geometry: { ...original.geometry } }
    return { ...state, nextOverlayNumber: state.nextOverlayNumber + 1, selectedPlacementId: duplicateId, snapGuideSeconds: timing.start, placements: [...state.placements, duplicate] }
  }
  const withLayer = addOverlayLayer(state)
  const duplicate = { ...original, id: duplicateId, label: `${original.label} copy`, layerId: withLayer.selectedLayerId, geometry: { ...original.geometry } }
  return { ...withLayer, nextOverlayNumber: state.nextOverlayNumber + 1, selectedPlacementId: duplicateId, placements: [...state.placements, duplicate] }
}

export function removeOverlayPlacement(state: OverlayPrototypeState, id: string): OverlayPrototypeState {
  const remaining = state.placements.filter((item) => !(item.id === id && item.role === 'overlay'))
  const fallback = remaining.find((item) => item.layerId === state.selectedLayerId) ?? remaining[0]
  return { ...state, selectedPlacementId: fallback?.id ?? '', placements: remaining }
}

export function summarizeOverlayCost(state: OverlayPrototypeState): { peakSources: number; overlayCount: number; effectPasses: number } {
  const overlays = state.placements.filter((item) => item.role === 'overlay')
  const boundaries = [...new Set(state.placements.flatMap((item) => [item.start, item.start + item.duration]))]
  const peakSources = Math.max(...boundaries.map((time) => state.placements.filter((item) => item.start <= time && item.start + item.duration > time).length))
  return { peakSources, overlayCount: overlays.length, effectPasses: overlays.reduce((total, item) => total + item.effects.length, 0) }
}

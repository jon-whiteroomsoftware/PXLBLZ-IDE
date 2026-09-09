import type { ShowRecord } from '@/engine/personalContentRecords'
import { showOverlayLayerFixture } from './showOverlayLayerFixture'

/** Boundary-touching Clips and two Layouts, reusing the shared preservation Show. */
export function showBoundaryCommandFixture() {
  const show = showOverlayLayerFixture()
  const composition = show.composition!
  composition.scenes[0].zones[0].main[0].durationMs = 12000
  composition.scenes[0].zones[0].main.find(clip => clip.id === 'clip-c')!.durationMs = 8000
  composition.scenes[1].zones[0].main = [{ id: 'boundary-right', instanceId: 'instance-a', startMs: 0, durationMs: 4000, view: { mirror: false, phase: 0, brightness: 1 } }]
  composition.groupOccurrences![0].startMs = 10000
  show.routingLayouts.push({ ...structuredClone(show.routingLayouts[0]), id: 'layout-2', name: 'Second Layout' })
  return show
}

export const BOUNDARY_PARAMETER_CASES: Array<{ kind: string; sets: Array<[string, unknown]> }> = [
      { kind: 'wipe', sets: [['direction', 0.25], ['wipeVariant', 'blinds'], ['count', 5], ['phase', 0.25], ['edgePolicy', 'blend'], ['orientation', 'vertical'], ['wipeVariant', 'split'], ['wipeMode', 'center-in'], ['wipeVariant', 'clock'], ['clockwise', false]] },
      { kind: 'fade-color', sets: [['color', '#ff8800']] },
      { kind: 'dither', sets: [['dissolveVariant', 'soft-threshold'], ['softness', 0.3], ['scale', 4], ['dissolveVariant', 'block'], ['seed', 7], ['blockSize', 12]] },
      { kind: 'portal', sets: [['shape', 'ring'], ['shape', 'rounded-box'], ['shape', 'cross'], ['shape', 'crescent'], ['shape', 'polygon'], ['shape', 'diamond'], ['shape', 'star'], ['featherPolicy', 'blend']] },
      { kind: 'motion', sets: [['motionVariant', 'push'], ['motionVariant', 'zoom-in']] },
      { kind: 'crossfade', sets: [['crossfadePolicy', 'live-live']] },
]

const ALL_TRANSITION_FIELDS: Record<string, unknown> = {
  crossfadePolicy: 'snapshot-live', feather: 0.4, color: '#ff8800',
  dissolveVariant: 'block', shape: 'star', motionVariant: 'push', featherPolicy: 'blend',
  centerX: 0.4, centerY: 0.6, aspect: 1.2, rotation: 0.1, revealMode: 'grow-incoming',
  anchorX: 0.3, anchorY: 0.7, contentScale: 1.1, spinDirection: 'clockwise',
  addressPolicy: 'wrap', starPoints: 6, starInner: 0.4, wipeVariant: 'blinds',
  wipeMode: 'center-in', orientation: 'vertical', count: 4, phase: 0.2, clockwise: false,
  edgePolicy: 'blend', seed: 9, blockSize: 12, scale: 5, softness: 0.25, direction: 0.3,
  ringWidth: 0.15, cornerRadius: 0.2, crossWidth: 0.3, crescentOffset: 0.4, polygonSides: 7,
  spin: 0.5,
  propertyTransitions: { brightness: { durationMs: 500, easing: { curve: 'linear' } } },
}

export function withAllTransitionFields(record: ShowRecord): ShowRecord {
  return {
    ...record,
    transitions: record.transitions?.map((candidate) => candidate.id === 'transition-scene-1'
      ? { ...candidate, ...ALL_TRANSITION_FIELDS }
      : candidate),
  } as ShowRecord
}


/** Finite kind/variant pairs exposed by the existing Transition toolkit. */
export const BOUNDARY_VARIANT_CASES = [
  { kind: 'crossfade', familyId: 'blend', variants: ['crossfade'] },
  { kind: 'fade-color', familyId: 'fade', variants: ['through-color'] },
  { kind: 'wipe', familyId: 'wipe', variants: ['linear', 'split', 'barn-doors', 'blinds', 'clock', 'checker', 'grid'] },
  { kind: 'dither', familyId: 'dissolve', variants: ['pixel', 'block', 'coherent-noise', 'soft-threshold'] },
  { kind: 'portal', familyId: 'shape-reveal', variants: ['circle', 'ellipse', 'box', 'rounded-box', 'diamond', 'cross', 'ring', 'heart', 'star', 'crescent', 'polygon', 'cloud', 'cat-head', 'cat-side-profile', 'bastet'] },
  { kind: 'motion', familyId: 'motion', variants: ['cover', 'reveal', 'push', 'content-grow', 'content-shrink', 'zoom-in', 'zoom-out'] },
].flatMap(({ kind, familyId, variants }) => variants.map(variant => ({ kind, familyId, variant })))

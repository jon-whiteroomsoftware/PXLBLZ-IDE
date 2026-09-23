import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { createDefaultShow } from '../engine/showModel'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import type { ShowRecord } from '../engine/personalContentRecords'
import type { ShowRecordV2 } from '../engine/showCompositionV2'

/** The measured #1091 v1 probe: three 4-second Scenes and one 1-second carrier. */
export function transitionClipRampProbeV1(): ShowRecord {
  const show = createDefaultShow('ramp-probe', 'Ramp probe', 1)
  show.scenes = [1, 2, 3].map(index => ({ id: `scene-${index}`, name: `Scene ${index}`, durationMs: 4000 }))
  const zoneId = show.zones[0].id
  const patterns = ['TestPattern1D', 'CometLoom', 'CellularAutomata1D']
  show.cells = show.scenes.map((scene, index) => ({
    id: `cell-${index + 1}`, zoneId, sceneId: scene.id, sceneSpan: 1,
    pattern: { kind: 'stock' as const, id: patterns[index] }, patternName: patterns[index],
    adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 }, restartOnEntry: false,
  }))
  show.transitions = [{
    id: 'xfade', afterSceneId: 'scene-1', kind: 'crossfade', durationMs: 1000,
    easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
    propertyTransitions: {
      timeScale: { fromByCellId: { 'cell-2': 1 }, durationMs: 400, easing: { curve: 'sine', direction: 'in-out' } },
      brightness: { fromByCellId: { 'cell-2': 0.2 } },
    },
  }]
  return show
}

export function convertTransitionClipRampProbe(show: ShowRecord = transitionClipRampProbeV1()): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(show, {
    byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])),
  })
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  return converted.record
}

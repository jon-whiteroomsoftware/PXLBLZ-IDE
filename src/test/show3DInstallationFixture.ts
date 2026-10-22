import { createShowV2WithOutputContract } from '../engine/showCreationV2'
import { validateShowRecordV2 } from '../engine/showCompositionV2'
import { createCustomMap } from '../engine/maps'
import type { ShowPreparedStageDependenciesV2 } from '../engine/showPreparedStageV2'

/** Synthetic Stage: sample and position deliberately agree on every axis. */
export function show3DInstallationFixture(source: string, mode: 'span' | 'independent' = 'span') {
  const coordinates = Array.from({ length: 960 }, (_, i) => [
    (i % 12) / 11, (Math.floor(i / 12) % 10) / 9, Math.floor(i / 120) / 7,
  ])
  const map = { id: 'lattice', name: 'Lattice', dim: 3 as const, generator: 'custom', params: {}, points: coordinates, updatedAt: 1 }
  const record = createShowV2WithOutputContract('stage-3d', 'Synthetic volume', {
    version: 1, kind: 'installation', outputMapId: map.id, pixelCount: 960, resolution: 'fixed',
  }, 1)
  record.stageMapId = map.id
  record.zones = ['Front', 'Middle', 'Back'].map((name, i) => ({ id: `zone-${i}`, name, nominalPixelCount: 320, color: '#38bdf8' }))
  record.zoneLayouts = [{ id: 'layout', name: 'Physical', zones: record.zones.map((zone, i) => ({ zoneId: zone.id, ranges: [{ start: i * 320, end: i * 320 + 319 }] })) }]
  record.composition.showEndMs = 2000
  record.composition.patternInstances = record.zones.map((_, i) => ({ id: `instance-${i}`, pattern: { kind: 'user', id: `pattern-${i}` }, patternName: `Probe ${i}`, time: { timeScale: 1, timeOffsetMs: 0 } }))
  record.composition.layers = record.zones.map(zone => ({ id: `main-${zone.id}`, zoneId: zone.id, name: 'Main', rank: 0 }))
  record.composition.clips = record.zones.map((zone, i) => ({
    id: `clip-${i}`, instanceId: `instance-${i}`, zoneId: zone.id, layerId: `main-${zone.id}`, startMs: 0, durationMs: 2000,
    zoneSampleMode: mode, entryPolicy: 'continue',
    appearance: { keys: [{ id: `key-${i}`, timeMs: 0, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] },
  }))
  record.composition.transitions = []
  record.composition.propertyTracks = []
  record.composition.layoutOccurrences = [{ id: 'layout-occurrence', layoutId: 'layout', startMs: 0, durationMs: 2000, parameters: {} }]
  const dependencies: ShowPreparedStageDependenciesV2 = {
    patterns: record.zones.map((_, i) => ({ id: `pattern-${i}`, name: `Probe ${i}`, src: source, controls: {}, updatedAt: 1 })),
    maps: [map], libraries: [], profiles: [], stageMap: createCustomMap(coordinates, { id: map.id, name: map.name }),
  }
  const invalid = validateShowRecordV2(record)
  if (invalid.length) throw new Error(JSON.stringify(invalid))
  const points = coordinates.map(p => ({ sample: p, pos: p as [number, number, number] }))
  return { record, dependencies, points }
}

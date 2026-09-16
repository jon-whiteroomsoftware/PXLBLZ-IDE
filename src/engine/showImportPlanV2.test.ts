import { describe, expect, it } from 'vitest'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2 } from './showCompositionV2'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from './showFileBundle'
import { applyShowImportPlanV2, planShowImportV2 } from './showImportPlanV2'
import { compileShowV2PilotArtifact } from './showV2Pilot'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import type { LibraryRecord, MapRecord, PatternRecord } from './personalContentRecords'

function v2Show() {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  converted.record.composition.patternInstances[0].pattern = { kind: 'user', id: 'pattern' }
  converted.record.composition.patternInstances[0].patternName = 'Pulse pattern'
  return converted.record
}

const pattern = (src = 'export function render(index) { Pulse.wave(index) }'): PatternRecord => ({
  id: 'pattern', name: 'Pulse pattern', src, controls: {}, updatedAt: 1,
})
const pulse = (src = 'export function wave(v) { return v }'): LibraryRecord => ({
  id: 'pulse', name: 'Pulse', src, updatedAt: 1,
})

function usePatternForEveryInstance(show: ReturnType<typeof v2Show>): void {
  for (const instance of [
    ...show.composition.patternInstances,
    ...show.composition.groupDefinitions.flatMap(definition => definition.patternInstances),
  ]) {
    instance.pattern = { kind: 'user', id: 'pattern' }
    instance.patternName = 'Imported pattern'
  }
}

function renderImportedRedChannel(
  applied: ReturnType<typeof applyShowImportPlanV2>,
  destination: { patterns: PatternRecord[]; maps: MapRecord[]; libraries: LibraryRecord[] },
): number {
  const assets = {
    patterns: [...destination.patterns, ...applied.newPatterns],
    maps: [...destination.maps, ...applied.newMaps],
    libraries: [...destination.libraries, ...applied.newLibraries],
  }
  const artifact = compileShowV2PilotArtifact(applied.show, assets)
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, {
    mapPoints: [{ sample: [0.5], pos: [0.5, 0.5] }],
    randomSeed: 1044,
    fidelity: 'fast',
  })
  return runtime.advanceLive(16).pixels[0][0]
}

describe('v2 ordinary Show import planning', () => {
  it('exports only reachable Libraries, reopens, and remaps Pattern and Library conflicts consistently', async () => {
    const show = v2Show()
    const validationIssues = validateShowRecordV2(show)
    if (validationIssues.length > 0) throw new Error(JSON.stringify(validationIssues))
    const built = buildShowFileBundle(show, {
      patterns: [pattern()], maps: [],
      libraries: [pulse(), { id: 'unused', name: 'Unused', src: 'export function nope() {}', updatedAt: 1 }],
    }, { appVersion: '1044-test', exportedAt: '2026-09-15T00:00:00.000Z' })
    expect(built.bundle.libraries.map(item => item.name)).toEqual(['Pulse'])
    const reopened = await parseShowFileBundle(await serializeShowFileBundle(built.bundle), { acceptV2: true })
    if (reopened.version !== 2) throw new Error('Expected v2 bundle')
    const ids = ['show-copy', 'library-copy', 'pattern-copy']
    const plan = planShowImportV2(reopened, {
      patterns: [pattern()], maps: [], showNames: [],
      libraries: [pulse('export function wave(v) { return 1 - v }')],
    }, { createId: () => ids.shift()!, now: 99 })

    expect(plan.libraryNamespaceRemap).toEqual({ Pulse: 'Pulse2' })
    const applied = applyShowImportPlanV2(plan)
    expect(applied.show.id).toBe('show-copy')
    expect(applied.show.composition.patternInstances[0].pattern).toEqual({ kind: 'user', id: 'pattern-copy' })
    expect(applied.newPatterns).toEqual([expect.objectContaining({ id: 'pattern-copy', src: expect.stringContaining('Pulse2.wave') })])
    expect(applied.newLibraries).toEqual([expect.objectContaining({ id: 'library-copy', name: 'Pulse2' })])
    expect(show.composition.patternInstances[0].pattern).toEqual({ kind: 'user', id: 'pattern' })
  })

  it('remaps Group-owned Pattern, explicit runtime binding, and custom Map conflicts as one import candidate', async () => {
    const show = v2Show()
    show.composition.layers.push({
      id: 'group-target-layer', zoneId: show.zones[0].id, name: 'Group target',
      rank: Math.max(...show.composition.layers.map(layer => layer.rank)) + 1,
    })
    const { zoneId: _zoneId, ...groupClip } = structuredClone(show.composition.clips[0])
    show.composition.groupDefinitions = [{
      id: 'group',
      name: 'Group',
      patternInstances: [{
        ...structuredClone(show.composition.patternInstances[0]),
        id: 'group-instance',
        pattern: { kind: 'user', id: 'group-pattern' },
        patternName: 'Group pattern',
      }],
      layers: [{ id: 'group-layer', name: 'Group layer', rank: 0 }],
      clips: [{ ...groupClip, id: 'group-clip', instanceId: 'group-instance', layerId: 'group-layer' }],
      transitions: [],
      propertyTracks: [],
    }]
    show.composition.groupOccurrences = [{
      id: 'group-use',
      definitionId: 'group',
      layoutOccurrenceId: show.composition.layoutOccurrences[0].id,
      zoneId: show.zones[0].id,
      startMs: 0,
      translationX: 0,
      translationY: 0,
      instanceBindings: { 'group-instance': 'group-runtime' },
      layerBindings: [{ definitionLayerId: 'group-layer', layerId: 'group-target-layer' }],
    }]
    show.stageMapId = 'custom-map'
    show.outputContract = {
      version: 1,
      kind: 'installation',
      outputMapId: 'custom-map',
      pixelCount: 2,
      resolution: 'fixed',
    }
    const groupPattern = pattern('export function render(index) { Pulse.wave(index) }')
    groupPattern.id = 'group-pattern'
    groupPattern.name = 'Group pattern'
    const customMap: MapRecord = {
      id: 'custom-map', name: 'Custom Map', dim: 2, generator: 'custom', params: {},
      points: [[0, 0], [1, 1]], updatedAt: 1,
    }
    const validationIssues = validateShowRecordV2(show)
    if (validationIssues.length > 0) throw new Error(JSON.stringify(validationIssues))
    const built = buildShowFileBundle(show, {
      patterns: [pattern(), groupPattern],
      maps: [customMap],
      libraries: [pulse()],
    }, { appVersion: '1044-test', exportedAt: '2026-09-15T00:00:00.000Z' })
    const reopened = await parseShowFileBundle(await serializeShowFileBundle(built.bundle), { acceptV2: true })
    if (reopened.version !== 2) throw new Error('Expected v2 bundle')
    const ids = ['show-copy', 'library-copy', 'top-pattern-copy', 'group-pattern-copy', 'map-copy']
    const plan = planShowImportV2(reopened, {
      patterns: [pattern(), { ...groupPattern, src: 'export function render() { hsv(0, 0, 0) }' }],
      maps: [{ ...customMap, points: [[0, 0], [1, 0]] }],
      libraries: [pulse('export function wave(v) { return 1 - v }')],
      showNames: [],
    }, { createId: () => ids.shift()!, now: 99 })

    const applied = applyShowImportPlanV2(plan)
    expect(applied.show.stageMapId).toBe('map-copy')
    expect(applied.show.outputContract).toMatchObject({ outputMapId: 'map-copy' })
    expect(applied.show.composition.groupDefinitions[0].patternInstances[0].pattern)
      .toEqual({ kind: 'user', id: 'group-pattern-copy' })
    expect(applied.show.composition.groupOccurrences[0].instanceBindings)
      .toEqual({ 'group-instance': 'group-runtime' })
    expect(applied.newPatterns).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'group-pattern-copy', src: expect.stringContaining('Pulse2.wave') }),
    ]))
    expect(applied.newMaps).toEqual([expect.objectContaining({ id: 'map-copy' })])
  })

  it('refuses a missing transitive Library before returning any writes', () => {
    const show = v2Show()
    const direct = pulse('export function wave(v) { Missing.helper(v); return v }')
    expect(() => buildShowFileBundle(show, { patterns: [pattern()], maps: [], libraries: [direct] }, {
      appVersion: '1044-test',
    })).toThrow(expect.objectContaining({ code: 'missing_user_library' }))
  })

  it('copies matching Libraries whose transitive dependency is remapped and preserves imported behavior', () => {
    const show = v2Show()
    usePatternForEveryInstance(show)
    const importedPattern = pattern('export function render(index) { rgb(LibraryC.wave(index), 0, 0) }')
    const importedA: LibraryRecord = {
      id: 'library-a', name: 'LibraryA',
      src: 'function wave(v) { return LibraryB.helper(v) }', updatedAt: 1,
    }
    const importedB: LibraryRecord = {
      id: 'library-b', name: 'LibraryB',
      src: 'function helper(v) { return 0.25 }', updatedAt: 1,
    }
    const importedC: LibraryRecord = {
      id: 'library-c', name: 'LibraryC',
      src: 'function wave(v) { return LibraryA.wave(v) }', updatedAt: 1,
    }
    const bundle = buildShowFileBundle(show, {
      patterns: [importedPattern], maps: [], libraries: [importedA, importedB, importedC],
    }, { appVersion: '1044-test' }).bundle
    const destination = {
      patterns: [structuredClone(importedPattern)], maps: [],
      libraries: [
        structuredClone(importedA),
        { ...structuredClone(importedB), src: 'function helper(v) { return 0.75 }' },
        structuredClone(importedC),
      ],
      showNames: [],
    }
    const before = structuredClone(destination)
    let nextId = 0

    const plan = planShowImportV2(bundle, destination, { createId: () => `copy-${nextId++}`, now: 99 })

    expect(destination).toEqual(before)
    expect(plan.libraryNamespaceRemap).toEqual({
      LibraryB: 'LibraryB2',
      LibraryA: 'LibraryA2',
      LibraryC: 'LibraryC2',
    })
    expect(plan.libraries.reused).toEqual([])
    const applied = applyShowImportPlanV2(plan)
    expect(applied.newLibraries).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'LibraryB2', src: importedB.src }),
      expect.objectContaining({ name: 'LibraryA2', src: expect.stringContaining('LibraryB2.helper') }),
      expect.objectContaining({ name: 'LibraryC2', src: expect.stringContaining('LibraryA2.wave') }),
    ]))
    expect(applied.newPatterns).toEqual([
      expect.objectContaining({ src: expect.stringContaining('LibraryC2.wave') }),
    ])
    expect(renderImportedRedChannel(applied, destination)).toBeCloseTo(0.25, 12)
  })

  it('reserves retained bundled Library names before allocating conflict copies', () => {
    const show = v2Show()
    usePatternForEveryInstance(show)
    const importedPattern = pattern('export function render(index) { rgb(Pulse.wave(index), 0, 0) }')
    const importedPulse = pulse('function wave(v) { return Pulse2.helper(v) }')
    const retainedPulse2: LibraryRecord = {
      id: 'pulse-2', name: 'Pulse2',
      src: 'function helper(v) { return 0.25 }', updatedAt: 1,
    }
    const bundle = buildShowFileBundle(show, {
      patterns: [importedPattern], maps: [], libraries: [importedPulse, retainedPulse2],
    }, { appVersion: '1044-test' }).bundle
    const destination = {
      patterns: [structuredClone(importedPattern)], maps: [],
      libraries: [{ ...structuredClone(importedPulse), src: 'function wave(v) { return 0.75 }' }],
      showNames: [],
    }
    const before = structuredClone(destination)
    let nextId = 0

    const plan = planShowImportV2(bundle, destination, { createId: () => `copy-${nextId++}`, now: 99 })

    expect(destination).toEqual(before)
    expect(plan.libraryNamespaceRemap).toEqual({ Pulse: 'Pulse3' })
    expect(plan.libraries.added).toEqual([{ id: 'pulse-2', name: 'Pulse2' }])
    expect(plan.libraries.copied).toEqual([
      expect.objectContaining({ id: 'pulse', targetName: 'Pulse3' }),
    ])
    const applied = applyShowImportPlanV2(plan)
    expect(applied.newLibraries.map(item => item.name).sort()).toEqual(['Pulse2', 'Pulse3'])
    expect(applied.newLibraries.find(item => item.name === 'Pulse3')?.src).toContain('Pulse2.helper')
    expect(applied.newPatterns).toEqual([
      expect.objectContaining({ src: expect.stringContaining('Pulse3.wave') }),
    ])
    expect(renderImportedRedChannel(applied, destination)).toBeCloseTo(0.25, 12)
  })

  it('refuses an incomplete bundled Library graph without mutating the destination', () => {
    const show = v2Show()
    usePatternForEveryInstance(show)
    const importedPattern = pattern('export function render(index) { rgb(LibraryA.wave(index), 0, 0) }')
    const importedA: LibraryRecord = {
      id: 'library-a', name: 'LibraryA',
      src: 'function wave(v) { return LibraryB.helper(v) }', updatedAt: 1,
    }
    const importedB: LibraryRecord = {
      id: 'library-b', name: 'LibraryB',
      src: 'function helper(v) { return v }', updatedAt: 1,
    }
    const complete = buildShowFileBundle(show, {
      patterns: [importedPattern], maps: [], libraries: [importedA, importedB],
    }, { appVersion: '1044-test' }).bundle
    const incomplete = { ...complete, libraries: complete.libraries.filter(item => item.name !== 'LibraryB') }
    const destination = {
      patterns: [structuredClone(importedPattern)], maps: [], libraries: [structuredClone(importedA)], showNames: [],
    }
    const before = structuredClone(destination)

    expect(() => planShowImportV2(incomplete, destination)).toThrow('missing Library "LibraryB"')
    expect(destination).toEqual(before)
  })
})

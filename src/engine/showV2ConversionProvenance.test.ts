import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ShowRecord } from './personalContentRecords'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { LIBRARIES } from '../pixelblaze/libs'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { compileShowForArtifact } from './showPreviewArtifact'
import { cloneValidShowRecordV2 } from './showDocument'
import { editShowTransitionV2 } from './showTransitionsV2'
import { editShowLayoutIntervalsV2, type ShowLayoutEditIntentV2 } from './showLayoutIntervalsV2'
import { projectShowEditorTimelineV2 } from './showEditorTimelinePresentation'
import { projectShowEditorRoutingTransfersV2 } from './showEditorInspectorPresentation'

/**
 * Conversion provenance for the #1065 tracer.
 *
 * Jon approved two narrow metadata extensions so the original editor can keep
 * drawing exactly what it drew on v1: which of v1's two Transition families a
 * converted v2 Transition came from, and the identity and settings of a v1
 * zero-duration routing switch. Both are inert: the compiled program must not
 * move, and no command may author either one.
 */

interface CorpusCase {
  key: string
  source: ShowRecord
}

const manifest = JSON.parse(readFileSync(
  new URL('../../e2e/fixtures/showEditorEquivalence.json', import.meta.url),
  'utf8',
)) as { version: 1; corpus: CorpusCase[] }

function convert(source: ShowRecord): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(source, {
    byCellId: Object.fromEntries(source.cells.map(cell => {
      if (cell.pattern.kind !== 'stock') throw new Error(`${source.id}: non-stock flat dependency`)
      const patternSource = DEMOS[resolveStockPatternId(cell.pattern.id)]
      if (!patternSource) throw new Error(`${source.id}: missing stock source ${cell.pattern.id}`)
      return [cell.id, patternSource]
    })),
  })
  if (result.status !== 'converted') throw new Error(`${source.id} refused: ${JSON.stringify(result.issues)}`)
  return result.record
}

function corpusCase(key: string): ShowRecord {
  const found = manifest.corpus.find(entry => entry.key === key)
  if (!found) throw new Error(`Missing oracle case "${key}"`)
  return found.source
}

/** The same record with every accepted conversion-metadata field removed. */
function withoutConversionMetadata(record: ShowRecordV2): ShowRecordV2 {
  const stripped = structuredClone(record)
  for (const transition of stripped.composition.transitions) delete transition.origin
  for (const occurrence of stripped.composition.layoutOccurrences) delete occurrence.incomingSwitch
  for (const marker of stripped.composition.markers) delete marker.origin
  return stripped
}

function compiledSource(record: ShowRecordV2): string {
  const instances = [
    ...record.composition.patternInstances,
    ...record.composition.groupDefinitions.flatMap(definition => definition.patternInstances),
  ]
  const byPatternInstanceId = Object.fromEntries(instances.flatMap(instance => {
    if (instance.pattern.kind !== 'stock') return []
    const source = DEMOS[resolveStockPatternId(instance.pattern.id)]
    return source === undefined ? [] : [[instance.id, source]]
  }))
  const prepared = prepareShowV2ForCompile(
    record,
    { byCellId: {}, byPatternInstanceId, stageDimension: 2 },
    { libraries: LIBRARIES },
  )
  if (prepared.status !== 'ready') {
    throw new Error(prepared.issues.map(issue => `${issue.path}: ${issue.message}`).join('; '))
  }
  return compileShow(prepared.recipe, LIBRARIES).code
}

describe('v1 Transition conversion provenance', () => {
  it('marks a converted v1 boundary Transition and a converted v1 Layer Transition differently', () => {
    const boundary = convert(corpusCase('fresh')).composition.transitions
    expect(boundary.map(transition => [transition.id, transition.origin])).toEqual([
      ['transition-scene-1', 'converted-boundary-transition'],
    ])

    const layer = convert(corpusCase('stock-lesson')).composition.transitions
    expect(layer.map(transition => [transition.id, transition.origin]).sort()).toEqual([
      ['transition-horizon-mandala', 'converted-layer-transition'],
      ['transition-iris-horizon', 'converted-layer-transition'],
    ])
  })

  it('keeps a converted boundary Transition distinguishable even at Layer participant scope', () => {
    // The fresh pair's crossfade converts to `participants` scope, so structure
    // alone cannot recover which of v1's two panels owns that junction.
    const [transition] = convert(corpusCase('fresh')).composition.transitions
    expect(transition.wholeOutput).toBeUndefined()
    expect(transition.participants).toHaveLength(1)
    expect(transition.origin).toBe('converted-boundary-transition')
  })

  it('preserves every other authored Transition setting exactly', () => {
    const source = corpusCase('stock-lesson')
    const converted = convert(source)
    for (const authored of source.composition!.transitions!) {
      const target = converted.composition.transitions.find(candidate => candidate.id === authored.id)!
      const { fromPlacementId: _from, toPlacementId: _to, ...settings } = authored
      const { participants: _p, propertyRamps: _r, origin: _o, ...targetSettings } = target
      expect(targetSettings).toEqual(settings)
    }
  })
})

describe('v1 zero-duration routing switch identity', () => {
  const converted = convert(corpusCase('installation-layouts'))
  const ordered = [...converted.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs)

  it('preserves the switch identity and only the settings v1 authored', () => {
    const rings = ordered[2]
    expect(rings.incomingTransfer).toBeUndefined()
    expect(rings.incomingSwitch).toEqual({
      origin: 'converted-routing-cut',
      id: 'routing-split-rings',
      fromOccurrenceId: ordered[1].id,
      easing: { curve: 'linear' },
    })
    // v1 authored no `routingDirection` on this switch, so nothing is invented.
    expect(rings.incomingSwitch).not.toHaveProperty('direction')
  })

  it('leaves a positive routing transfer as a timed transfer object', () => {
    expect(ordered[1].incomingSwitch).toBeUndefined()
    expect(ordered[1].incomingTransfer).toMatchObject({
      id: 'routing-full-split',
      durationMs: 1_500,
      direction: 'forward',
      easing: { curve: 'sine', direction: 'in-out' },
    })
  })

  it('gives the existing timeline lane and routing panel the second switch back', () => {
    const view = projectShowEditorTimelineV2(converted)
    expect(view.layoutIntervals.map(interval => interval.incomingTransfer?.id ?? null))
      .toEqual([null, 'routing-full-split', 'routing-split-rings'])

    const transfers = projectShowEditorRoutingTransfersV2(converted)
    expect(transfers['routing-split-rings']).toMatchObject({
      id: 'routing-split-rings',
      layoutId: 'layout-rings',
      durationMs: 0,
      easing: { curve: 'linear' },
      direction: 'forward',
      directionAuthored: false,
    })
    expect(transfers['routing-full-split']).toMatchObject({
      durationMs: 1_500,
      directionAuthored: true,
    })
  })
})

describe('conversion metadata is inert', () => {
  for (const entry of manifest.corpus) {
    it(`compiles "${entry.key}" to the identical program with and without the metadata`, () => {
      const converted = convert(entry.source)
      expect(compiledSource(converted)).toBe(compiledSource(withoutConversionMetadata(converted)))
    })
  }

  it('compiles the routing-switch case to the identical program on both record versions', () => {
    // The Installation case is the one the converter change touches and the one
    // oracle case the v1 artifact compiler accepts without a reference map, so
    // it is the available end-to-end check that preserving the zero-duration
    // switch did not move playback.
    const source = corpusCase('installation-layouts')
    const v1 = compileShowForArtifact(source, [], undefined, LIBRARIES)
    expect(v1.error).toBeNull()
    expect(v1.artifact!.code).toBe(compiledSource(convert(source)))
  })
})

describe('conversion metadata survives persistence and fails closed', () => {
  const converted = convert(corpusCase('installation-layouts'))
  const fresh = convert(corpusCase('fresh'))

  it('round-trips unchanged through the persisted record validator', () => {
    expect(validateShowRecordV2(converted)).toEqual([])
    expect(cloneValidShowRecordV2(JSON.parse(JSON.stringify(converted)))).toEqual(converted)
    expect(cloneValidShowRecordV2(JSON.parse(JSON.stringify(fresh)))).toEqual(fresh)
  })

  it('refuses an unknown Transition origin value', () => {
    const forged = JSON.parse(JSON.stringify(fresh))
    forged.composition.transitions[0].origin = 'converted-something-else'
    expect(() => cloneValidShowRecordV2(forged)).toThrow()
  })

  it('refuses an unknown or malformed routing-switch shape', () => {
    const unknownOrigin = JSON.parse(JSON.stringify(converted))
    unknownOrigin.composition.layoutOccurrences[2].incomingSwitch.origin = 'authored'
    expect(() => cloneValidShowRecordV2(unknownOrigin)).toThrow()

    const timed = JSON.parse(JSON.stringify(converted))
    timed.composition.layoutOccurrences[2].incomingSwitch.durationMs = 250
    expect(() => cloneValidShowRecordV2(timed)).toThrow()
  })

  it('refuses a switch that is not owned by the preceding occurrence', () => {
    const dangling = structuredClone(converted)
    dangling.composition.layoutOccurrences[2].incomingSwitch!.fromOccurrenceId = 'layout-occurrence:9'
    expect(validateShowRecordV2(dangling).map(issue => issue.code)).toContain('missing-reference')
  })

  it('refuses a switch that shadows a transfer identity', () => {
    const collision = structuredClone(converted)
    collision.composition.layoutOccurrences[2].incomingSwitch!.id = 'routing-full-split'
    expect(validateShowRecordV2(collision).length).toBeGreaterThan(0)
  })

  it('refuses a switch and a timed transfer on the same occurrence', () => {
    const both = structuredClone(converted)
    both.composition.layoutOccurrences[2].incomingTransfer = {
      id: 'extra-transfer',
      fromOccurrenceId: both.composition.layoutOccurrences[1].id,
      durationMs: 500,
      direction: 'forward',
    }
    expect(validateShowRecordV2(both).length).toBeGreaterThan(0)
  })
})

describe('commands cannot forge conversion provenance', () => {
  const fresh = convert(corpusCase('fresh'))

  it('refuses an inserted Transition that carries conversion provenance', () => {
    const base = structuredClone(fresh)
    const [existing] = base.composition.transitions
    const reset = editShowTransitionV2(base, { kind: 'reset-to-cut', transitionId: existing.id })
    expect(reset.status).toBe('changed')
    const cutRecord = reset.record
    const forged = editShowTransitionV2(cutRecord, {
      kind: 'insert',
      transition: { ...structuredClone(existing), id: 'forged', origin: 'converted-boundary-transition' },
    })
    expect(forged.status).toBe('refused')
    expect(forged).toMatchObject({ code: 'invalid-intent' })
  })

  it('refuses a settings edit that changes or clears provenance', () => {
    const [existing] = fresh.composition.transitions
    const cleared = editShowTransitionV2(fresh, {
      kind: 'update-transition',
      transition: (() => { const next = structuredClone(existing); delete next.origin; return next })(),
    })
    expect(cleared).toMatchObject({ status: 'refused', code: 'invalid-intent' })

    const swapped = editShowTransitionV2(fresh, {
      kind: 'update-transition',
      transition: { ...structuredClone(existing), origin: 'converted-layer-transition' },
    })
    expect(swapped).toMatchObject({ status: 'refused', code: 'invalid-intent' })
  })

  it('preserves provenance through an ordinary settings edit', () => {
    const [existing] = fresh.composition.transitions
    const edited = editShowTransitionV2(fresh, {
      kind: 'update-transition',
      transition: { ...structuredClone(existing), crossfadePolicy: 'live-live' },
    })
    expect(edited.status).toBe('changed')
    expect(edited.record.composition.transitions[0]).toMatchObject({
      crossfadePolicy: 'live-live',
      origin: 'converted-boundary-transition',
    })
  })

  it('drops a superseded switch when an authored transfer replaces it, and never mints one', () => {
    const converted = convert(corpusCase('installation-layouts'))
    const ordered = [...converted.composition.layoutOccurrences].sort((a, b) => a.startMs - b.startMs)
    const result = editShowLayoutIntervalsV2(converted, {
      kind: 'set-transfer',
      occurrenceId: ordered[2].id,
      transfer: { id: 'authored-transfer', durationMs: 1_000, direction: 'forward', easing: { curve: 'linear' } },
    })
    expect(result.status).toBe('changed')
    const target = result.record.composition.layoutOccurrences.find(entry => entry.id === ordered[2].id)!
    expect(target.incomingSwitch).toBeUndefined()
    expect(target.incomingTransfer?.durationMs).toBe(1_000)
    expect(result.record.composition.layoutOccurrences.some(entry => entry.incomingSwitch
      && entry.id !== ordered[2].id && entry.incomingSwitch.origin !== 'converted-routing-cut')).toBe(false)
  })
})

describe('inert metadata changes no Layout command outcome (metamorphic)', () => {
  const converted = convert(corpusCase('installation-layouts'))
  const stripped = withoutConversionMetadata(converted)
  const ordered = [...converted.composition.layoutOccurrences].sort((a, b) => a.startMs - b.startMs)

  const intents: Array<[string, ShowLayoutEditIntentV2]> = [
    ['remove the switch-owning occurrence', { kind: 'remove', occurrenceId: ordered[2].id }],
    ['remove the occurrence the switch points back at', { kind: 'remove', occurrenceId: ordered[1].id }],
    ['remove the first occurrence', { kind: 'remove', occurrenceId: ordered[0].id }],
    ['move the switch boundary', { kind: 'move', occurrenceId: ordered[2].id, startMs: 12_000 }],
    ['insert ahead of the switch', { kind: 'insert', occurrenceId: 'inserted', atMs: 9_000, layoutId: 'layout-full' }],
    ['duplicate the occurrence before the switch', {
      kind: 'duplicate', occurrenceId: ordered[1].id, newOccurrenceId: 'duplicated',
    }],
    ['select a different Layout', { kind: 'select-layout', occurrenceId: ordered[2].id, layoutId: 'layout-full' }],
  ]

  for (const [label, intent] of intents) {
    it(`gives the same outcome for "${label}" with and without the metadata`, () => {
      const withMetadata = editShowLayoutIntervalsV2(converted, intent)
      const without = editShowLayoutIntervalsV2(stripped, intent)

      expect(withMetadata.status).toBe(without.status)
      if (withMetadata.status === 'refused' && without.status === 'refused') {
        expect(withMetadata.code).toBe(without.code)
        expect(withMetadata.message).toBe(without.message)
      }
      expect(withMetadata.affectedLayoutOccurrenceIds).toEqual(without.affectedLayoutOccurrenceIds)
      expect(withMetadata.affectedTransitionIds).toEqual(without.affectedTransitionIds)
      expect(withMetadata.affectedTrackIds).toEqual(without.affectedTrackIds)
      expect(withMetadata.removedLayoutOccurrenceIds).toEqual(without.removedLayoutOccurrenceIds)
      // Playback identity: the two records differ only by inert provenance.
      expect(withoutConversionMetadata(withMetadata.record)).toEqual(without.record)

      const ids = new Set(withMetadata.record.composition.layoutOccurrences.map(entry => entry.id))
      for (const occurrence of withMetadata.record.composition.layoutOccurrences) {
        if (!occurrence.incomingSwitch) continue
        expect(ids.has(occurrence.incomingSwitch.fromOccurrenceId)).toBe(true)
        expect(occurrence.incomingTransfer).toBeUndefined()
      }
      expect(validateShowRecordV2(withMetadata.record)).toEqual([])
    })
  }

  it('does not refuse a removal that the record without metadata accepts', () => {
    // The specific fault the earlier draft introduced: treating inert
    // provenance as owned transfer data made this removal refuse.
    const result = editShowLayoutIntervalsV2(converted, { kind: 'remove', occurrenceId: ordered[2].id })
    expect(result.status).toBe('changed')
    expect(result.record.composition.layoutOccurrences.some(entry => entry.incomingSwitch)).toBe(false)
  })
})

describe('a native v2 record without conversion metadata keeps its normal behavior', () => {
  it('leaves Transitions and Layout occurrences exactly as authored', () => {
    const native = withoutConversionMetadata(convert(corpusCase('installation-layouts')))
    expect(validateShowRecordV2(native)).toEqual([])
    const view = projectShowEditorTimelineV2(native)
    expect(view.layoutIntervals.map(interval => interval.incomingTransfer?.id ?? null))
      .toEqual([null, 'routing-full-split', null])
    expect(Object.keys(projectShowEditorRoutingTransfersV2(native))).toEqual(['routing-full-split'])
  })
})

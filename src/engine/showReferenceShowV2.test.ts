import { describe, expect, it } from 'vitest'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { stockShowById } from '@/pixelblaze/stock/shows'
import { stockShowCatalogueById, type ShowPatternSlotGroupV2 } from '@/pixelblaze/stock/showCatalogueV2'
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { compileLibraries } from './libraries'
import { bundledPatternSliderNames } from './showPatternControls'
import { sourceForShowPatternRef } from './showPreviewArtifact'
import type { ShowPatternRef } from './personalContentRecords'
import type { ShowRecordV2 } from './showCompositionV2'
import { validateShowRecordV2 } from './showCompositionV2'
import {
  applyShowPatternSlotSelections,
  type ShowPatternSlotGroup,
} from './showReferenceShow'
import {
  applyShowPatternSlotSelectionsV2,
  showPatternSlotRemovedControlNamesV2,
} from './showReferenceShowV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'

const CAUSTICS: ShowPatternRef = { kind: 'stock', id: 'Caustics' }
const RIBBON_LOOM: ShowPatternRef = { kind: 'stock', id: 'RibbonLoom' }

function patternNameFor(ref: ShowPatternRef): string | undefined {
  if (ref.kind === 'stock') return resolveStockPatternId(ref.id)
  return undefined
}

function exportedSliderNamesFor(ref: ShowPatternRef): ReadonlySet<string> | null {
  try {
    return bundledPatternSliderNames(
      sourceForShowPatternRef(ref, []),
      compileLibraries(LIBRARIES, []),
    )
  } catch {
    return null
  }
}

function normalizeKeyOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeKeyOrder)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))
        .map(([key, entry]) => [key, normalizeKeyOrder(entry)]),
    )
  }
  return value
}

function slotGroupsFor(id: string): readonly ShowPatternSlotGroup[] {
  const stock = stockShowById(id)
  if (!stock?.patternSlots) throw new Error(`missing v1 slot groups for ${id}`)
  return stock.patternSlots
}

function slotGroupsV2For(id: string): readonly ShowPatternSlotGroupV2[] {
  const stock = stockShowCatalogueById(id)
  if (!stock?.patternSlots) throw new Error(`missing v2 slot groups for ${id}`)
  return stock.patternSlots
}

function convertedOracle(id: string, selections: Readonly<Record<number, ShowPatternRef>>): ShowRecordV2 {
  const stock = stockShowById(id)
  if (!stock) throw new Error(`missing v1 stock show ${id}`)
  const projected = applyShowPatternSlotSelections(
    stock.show,
    slotGroupsFor(id),
    selections,
    patternNameFor,
    exportedSliderNamesFor,
  )
  const cleaned = structuredClone(projected)
  // v1's forfeiture leaves a present-but-undefined executionModel key, which the
  // V1 schema (type string) refuses; drop it only in that case. Absence maps to
  // the converter's continuous default, matching v2's forfeiture.
  if (cleaned.composition && cleaned.composition.executionModel === undefined) {
    delete cleaned.composition.executionModel
  }
  const converted = convertShowRecordV1ToV2(cleaned, {
    byCellId: Object.fromEntries(
      cleaned.cells.map((cell) => {
        if (cell.pattern.kind !== 'stock') throw new Error(`${id}: non-stock flat dependency`)
        const source = DEMOS[resolveStockPatternId(cell.pattern.id)]
        if (!source) throw new Error(`${id}: missing stock source ${cell.pattern.id}`)
        return [cell.id, source]
      }),
    ),
  })
  if (converted.status !== 'converted') {
    throw new Error(`${id} refused: ${JSON.stringify(converted.issues)}`)
  }
  expect(validateShowRecordV2(converted.record), `${id} converted`).toEqual([])
  return converted.record
}

function nativeProjected(
  id: string,
  selections: Readonly<Record<number, ShowPatternRef>>,
): { native: ShowRecordV2; projected: ShowRecordV2 } {
  const native = structuredClone(stockShowV2ById(id))
  if (!native) throw new Error(`missing native v2 stock show ${id}`)
  const projected = applyShowPatternSlotSelectionsV2(
    native,
    slotGroupsV2For(id),
    selections,
    patternNameFor,
    exportedSliderNamesFor,
  )
  expect(validateShowRecordV2(projected), `${id} projected`).toEqual([])
  return { native, projected }
}

function instanceView(record: ShowRecordV2): unknown {
  return record.composition.patternInstances.map((instance) => ({
    id: instance.id,
    pattern: instance.pattern,
    patternName: instance.patternName,
    controlTargets: instance.controlTargets,
  }))
}

function instanceControlTracks(record: ShowRecordV2): unknown {
  return record.composition.propertyTracks.filter(
    (track) => track.target.kind === 'instance-control',
  )
}

function clipSpans(record: ShowRecordV2): unknown {
  return record.composition.clips.map((clip) => ({
    id: clip.id,
    startMs: clip.startMs,
    durationMs: clip.durationMs,
  }))
}

function expectParity(id: string, selections: Readonly<Record<number, ShowPatternRef>>): void {
  const oracle = convertedOracle(id, selections)
  const { projected } = nativeProjected(id, selections)
  expect(normalizeKeyOrder(instanceView(projected))).toEqual(normalizeKeyOrder(instanceView(oracle)))
  expect(normalizeKeyOrder(instanceControlTracks(projected))).toEqual(
    normalizeKeyOrder(instanceControlTracks(oracle)),
  )
  expect(clipSpans(projected)).toEqual(clipSpans(oracle))
  expect(projected.composition.executionModel).toEqual(oracle.composition.executionModel)
}

describe('Try-with-Pattern projection over v2 records (#1066 slice 11b1)', () => {
  it('forfeits the deterministic-loop stamp when the Pattern changes', () => {
    const native = stockShowV2ById('stock-show-103-clip-transform')
    if (!native) throw new Error('missing native v2 lesson 103')
    expect(native.composition.executionModel).toBe('deterministic-loop')
    const { projected } = nativeProjected('stock-show-103-clip-transform', { 0: CAUSTICS })
    expect(projected.composition.executionModel).toBe('continuous')
  })

  it('keeps the deterministic-loop stamp when reselecting the current Pattern', () => {
    const native = stockShowV2ById('stock-show-103-clip-transform')
    if (!native) throw new Error('missing native v2 lesson 103')
    const current = native.composition.patternInstances.find((instance) => instance.id === 'rose')
      ?.pattern
    if (!current) throw new Error('missing rose instance')
    const { projected } = nativeProjected('stock-show-103-clip-transform', {
      0: structuredClone(current),
    })
    expect(projected.composition.executionModel).toBe('deterministic-loop')
  })

  it('matches the v1 oracle on lesson 103 with Caustics', () => {
    expectParity('stock-show-103-clip-transform', { 0: CAUSTICS })
  })

  it('matches the v1 oracle on lesson 203 with Caustics', () => {
    expectParity('stock-show-203-pattern-instance-lifecycle', { 0: CAUSTICS })
  })

  it('matches the v1 oracle on property-animation with Caustics', () => {
    expectParity('stock-show-reference-property-animation', { 0: CAUSTICS })
  })

  it('matches the v1 oracle on property-animation with RibbonLoom', () => {
    expectParity('stock-show-reference-property-animation', { 0: RIBBON_LOOM })
  })

  it('drops the control target and track whose export the new Pattern lacks', () => {
    const id = 'stock-show-reference-property-animation'
    const groups = slotGroupsV2For(id)
    const sliders = exportedSliderNamesFor(CAUSTICS)
    if (!sliders?.has('sliderSpeed')) throw new Error('Caustics fixture lacks sliderSpeed')
    const reduced = new Set([...sliders].filter((name) => name !== 'sliderSpeed'))
    const native = structuredClone(stockShowV2ById(id))
    if (!native) throw new Error(`missing native v2 stock show ${id}`)
    const projected = applyShowPatternSlotSelectionsV2(
      native,
      groups,
      { 0: CAUSTICS },
      patternNameFor,
      () => reduced,
    )
    expect(
      projected.composition.propertyTracks.some((track) => track.id === 'track-pattern-control'),
    ).toBe(false)
    expect(
      projected.composition.patternInstances.find(
        (instance) => instance.id === 'instance-property-subject-control',
      )?.controlTargets,
    ).toBeUndefined()
    expect(showPatternSlotRemovedControlNamesV2(native, groups[0], reduced)).toEqual([
      'sliderSpeed',
    ])
  })

  it('returns the same record object when no slot is selected', () => {
    const native = stockShowV2ById('stock-show-103-clip-transform')
    if (!native) throw new Error('missing native v2 lesson 103')
    expect(
      applyShowPatternSlotSelectionsV2(
        native,
        slotGroupsV2For('stock-show-103-clip-transform'),
        {},
        patternNameFor,
        exportedSliderNamesFor,
      ),
    ).toBe(native)
  })

  it('never mutates the input record', () => {
    const native = structuredClone(stockShowV2ById('stock-show-reference-property-animation'))
    if (!native) throw new Error('missing native v2 property-animation')
    const snapshot = structuredClone(native)
    applyShowPatternSlotSelectionsV2(
      native,
      slotGroupsV2For('stock-show-reference-property-animation'),
      { 0: RIBBON_LOOM },
      patternNameFor,
      exportedSliderNamesFor,
    )
    expect(native).toEqual(snapshot)
  })

  it('leaves instances outside the selected slot on their authored Pattern', () => {
    const { native, projected } = nativeProjected('stock-show-reference-property-animation', {
      0: CAUSTICS,
    })
    const before = native.composition.patternInstances.find(
      (instance) => instance.id === 'instance-overlay-opacity-overlay',
    )
    const after = projected.composition.patternInstances.find(
      (instance) => instance.id === 'instance-overlay-opacity-overlay',
    )
    expect(after?.pattern).toEqual({ kind: 'stock', id: 'SignalMandala' })
    expect(after).toBe(before)
  })
})

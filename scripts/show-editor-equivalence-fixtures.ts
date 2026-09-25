import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { createShowWithOutputContract } from '@/engine/showModel'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { v1StockShowById } from '@/test/v1StockShowsFixture'
import { convertibleV1Show } from '@/test/showV2TracerFixture'

const OUTPUT = resolve('e2e/fixtures/showEditorEquivalence.json')

function pair(source: ShowRecord) {
  const conversion = convertShowRecordV1ToV2(source, {
    byCellId: Object.fromEntries(source.cells.map(cell => {
      if (cell.pattern.kind !== 'stock') throw new Error(`${source.id} has a non-stock flat Pattern dependency.`)
      const patternSource = DEMOS[resolveStockPatternId(cell.pattern.id)]
      if (!patternSource) throw new Error(`${source.id} is missing stock Pattern source ${cell.pattern.id}.`)
      return [cell.id, patternSource]
    })),
  })
  if (conversion.status !== 'converted') {
    throw new Error(`${source.id} conversion refused: ${JSON.stringify(conversion.issues)}`)
  }
  if (conversion.report.retiredSilentRuntimeUses.length > 0) {
    throw new Error(`${source.id} has retired silent runtime use and cannot enter the basic equivalence corpus.`)
  }
  return { source, converted: conversion.record, conversionReport: conversion.report }
}

export function buildShowEditorEquivalenceFixtures() {
  const fresh = createShowWithOutputContract('oracle-fresh-source', 'Oracle Fresh Show', {
    version: 1,
    kind: 'portable-2d',
    referenceMapId: 'plane',
    referencePixelCount: 64,
    compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
  }, 1)
  const fromStock = (id: string, fixtureId: string, name: string): ShowRecord => {
    const stock = v1StockShowById(id)?.show
    if (!stock) throw new Error(`Missing stock Show ${id}.`)
    return { ...structuredClone(stock), id: fixtureId, name, updatedAt: 1 }
  }
  const behavior = convertibleV1Show()
  behavior.id = 'oracle-behavior-source'
  behavior.name = 'Oracle Pointer Drag'
  behavior.updatedAt = 1
  behavior.scenes[0].durationMs = 6_000
  if (!behavior.composition) throw new Error('Behavior fixture needs composition.')
  behavior.composition.durationMs = 6_000
  // A second free Clip sharing the first Clip's instance (#1066 slice 2). The
  // gaps on both sides keep every existing gesture's inputs fixed: drag,
  // resize and Split still act on the first Clip with the same geometry and
  // time base, and the shared instance keeps delete a pure Clip removal on
  // both backings (no orphan-instance pruning, no execution-model change), so
  // converted(saved v1) stays exactly equal to saved v2.
  behavior.composition.scenes[0].zones[0].main.push({
    id: 'clip-b',
    instanceId: 'instance',
    startMs: 4_000,
    durationMs: 1_000,
    view: { mirror: false, phase: 0, brightness: 1 },
  })

  const installationLayouts = fromStock(
    'stock-show-206-changing-zone-layouts',
    'oracle-installation-layouts-source',
    'Oracle Installation Layouts',
  )
  installationLayouts.stageMapId = 'plane'
  installationLayouts.outputContract = {
    version: 1,
    kind: 'installation',
    outputMapId: 'plane',
    pixelCount: 64,
    resolution: 'fixed',
  }
  installationLayouts.zones = installationLayouts.zones.map(zone => ({ ...zone, nominalPixelCount: 32 }))
  installationLayouts.routingLayouts = [
    {
      id: 'layout-full', name: 'Full Surface',
      zones: [
        { zoneId: 'zone-1', ranges: [{ start: 0, end: 63 }] },
        { zoneId: 'zone-2', ranges: [] },
      ],
    },
    {
      id: 'layout-split', name: 'Split',
      zones: [
        { zoneId: 'zone-1', ranges: [{ start: 0, end: 31 }] },
        { zoneId: 'zone-2', ranges: [{ start: 32, end: 63 }] },
      ],
    },
    {
      id: 'layout-rings', name: 'Alternating Bands',
      zones: [
        { zoneId: 'zone-1', ranges: [{ start: 0, end: 15 }, { start: 32, end: 47 }] },
        { zoneId: 'zone-2', ranges: [{ start: 16, end: 31 }, { start: 48, end: 63 }] },
      ],
    },
  ]

  return {
    version: 1,
    corpus: [
      { key: 'fresh', fixedTimeMs: 5_000, ...pair(fresh) },
      { key: 'installation-layouts', fixedTimeMs: 8_000, ...pair(installationLayouts) },
      { key: 'groups-animation', fixedTimeMs: 10_000, ...pair(fromStock('stock-show-205-groups-linked-reuse', 'oracle-groups-animation-source', 'Oracle Groups and Animation')) },
      { key: 'stock-lesson', fixedTimeMs: 4_000, ...pair(fromStock('stock-show-102-transitions-values', 'oracle-stock-lesson-source', 'Oracle Stock Lesson')) },
    ],
    behavior: pair(behavior),
  }
}

export function main(): void {
  writeFileSync(OUTPUT, `${JSON.stringify(buildShowEditorEquivalenceFixtures(), null, 2)}\n`)
  console.log(`wrote ${OUTPUT}`)
}

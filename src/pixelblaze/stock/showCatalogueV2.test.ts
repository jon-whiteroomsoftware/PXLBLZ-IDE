import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { V1_STOCK_SHOWS, type V1StockShowFixtureEntry } from '@/test/v1StockShowsFixture'
import { STOCK_SHOWS_V2, stockShowV2ById } from './showsV2'
import { STOCK_SHOW_CATALOGUE, stockShowCatalogueById } from './showCatalogueV2'

// This independent v1 projection is deleted when Phase 4 removes shows.ts.
function legacyMetadataProjection(entry: V1StockShowFixtureEntry) {
  const { show, patternSlots, reference, ...metadata } = entry
  const projectSlot = ({ instanceIds }: { instanceIds: readonly string[] }) => ({ instanceIds })
  return {
    ...metadata,
    ...(patternSlots === undefined ? {} : { patternSlots: patternSlots.map(projectSlot) }),
    ...(reference === undefined ? {} : {
      reference: {
        summary: reference.summary,
        ...(reference.patternSlots === undefined ? {} : { patternSlots: projectSlot(reference.patternSlots) }),
        examples: reference.examples.map(({ anchor, ...example }) => {
          if (anchor.kind === 'scene') {
            return { ...example, anchor: { kind: 'chapter', markerId: `scene-marker:${anchor.sceneId}` } }
          }
          const transition = show.transitions.find((candidate) => candidate.id === anchor.transitionId)
          if (!transition?.afterSceneId) throw new Error(`${entry.id}: missing afterSceneId for ${example.id}`)
          return {
            ...example,
            anchor: { kind: 'boundary', afterChapterMarkerId: `scene-marker:${transition.afterSceneId}` },
          }
        }),
      },
    }),
  }
}

describe('v2 stock Show metadata catalogue', () => {
  it('keeps native Show ids, names, and order row for row', () => {
    expect(STOCK_SHOW_CATALOGUE.map((entry) => entry.id)).toEqual(STOCK_SHOWS_V2.map((record) => record.id))
    expect(STOCK_SHOW_CATALOGUE.map((entry) => entry.name)).toEqual(STOCK_SHOWS_V2.map((record) => record.name))
    for (const entry of STOCK_SHOW_CATALOGUE) {
      expect(stockShowCatalogueById(entry.id)).toBe(entry)
      expect(stockShowV2ById(entry.id)?.name).toBe(entry.name)
    }
    expect(stockShowCatalogueById('missing-show')).toBeUndefined()
  })

  it('preserves every legacy metadata value and optional field', () => {
    // The legacy catalogue leads; native-only Shows (#1134) follow it.
    expect(STOCK_SHOW_CATALOGUE.slice(0, V1_STOCK_SHOWS.length).map((entry) => entry.id))
      .toEqual(V1_STOCK_SHOWS.map((entry) => entry.id))
    for (const entry of V1_STOCK_SHOWS) {
      expect(stockShowCatalogueById(entry.id), entry.id).toEqual(legacyMetadataProjection(entry))
    }
  })

  it('resolves all slots and reference anchors in native v2 records', () => {
    expect(STOCK_SHOW_CATALOGUE).toHaveLength(42)
    for (const entry of STOCK_SHOW_CATALOGUE) {
      const record = stockShowV2ById(entry.id)
      expect(record, entry.id).toBeDefined()
      if (!record) continue
      const instanceIds = new Set(record.composition.patternInstances.map((instance) => instance.id))
      for (const group of [...(entry.patternSlots ?? []), ...(entry.reference?.patternSlots ? [entry.reference.patternSlots] : [])]) {
        for (const id of group.instanceIds) expect(instanceIds.has(id), `${entry.id}: ${id}`).toBe(true)
      }
      const chapters = record.composition.markers
        .filter((marker) => marker.role === 'chapter')
        .slice()
        .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
      for (const example of entry.reference?.examples ?? []) {
        const markerId = example.anchor.kind === 'chapter'
          ? example.anchor.markerId
          : example.anchor.afterChapterMarkerId
        const chapterIndex = chapters.findIndex((marker) => marker.id === markerId)
        expect(chapterIndex, `${entry.id}: ${example.id}: ${markerId}`).toBeGreaterThanOrEqual(0)
        if (example.anchor.kind === 'boundary') {
          expect(chapterIndex, `${entry.id}: ${example.id}: later chapter`).toBeLessThan(chapters.length - 1)
        }
      }
    }
  })

  it('has no v1 module imports', () => {
    const source = readFileSync(new URL('./showCatalogueV2.ts', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((match) => match[1])
    expect(imports.some((path) => /(?:^\.\/shows$|showReferenceShow|showModel|showCompositionModel)/.test(path)))
      .toBe(false)
  })
})

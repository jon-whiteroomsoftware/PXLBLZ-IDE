// Native v2 stock catalogue proof (#1040). Every entry must validate, reopen
// and compile straight from its native authoring, without the v1 converter, and
// must carry the same choreography the pinned legacy catalogue ships.
import { describe, expect, it } from 'vitest'
import { LIBRARIES } from '@/pixelblaze/libs'
import { compileShow } from '@/engine/showCompiler'
import { showChaptersV2 } from '@/engine/showChaptersV2'
import { prepareShowV2ForCompile } from '@/engine/showCompositionLoweringV2'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from '@/engine/showCompositionV2'
import { projectShowTimeline } from '@/engine/showModel'
import { compileShowForArtifact } from '@/engine/showPreviewArtifact'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { V1_STOCK_SHOWS, v1StockShowById } from '@/test/v1StockShowsFixture'
import { STOCK_SHOWS_V2, stockShowV2ById } from './showsV2'
import { nativeStockSourceLookupV2 } from './showsV2Compile'
// The native parity report's classifier is the single definition of an admitted
// native-versus-converted difference (#1065); this proof consumes it directly.
import { classify, compareValues } from '../../../scripts/show-v2-native-parity'

const NATIVE_CASES = STOCK_SHOWS_V2.map(record => [record.id, record] as const)
// Shows the pinned legacy catalogue also lists; native-only Shows have no
// legacy record to compare against.
const LEGACY_IDS = new Set(V1_STOCK_SHOWS.map(entry => entry.id))
const LEGACY_CASES = NATIVE_CASES.filter(([id]) => LEGACY_IDS.has(id))

// A single-passage Show carries no chapter: its lone whole-Show chapter was redundant (#1097 item 6).
const SINGLE_PASSAGE_SHOWS_WITHOUT_CHAPTERS = new Set([
  'stock-show-100-getting-around',
  'stock-show-101-clips-cuts-blank-time',
  'stock-show-102-transitions-values',
  'stock-show-103-clip-transform',
  'stock-show-104-effects-and-ordering',
  'stock-show-106-built-from-basics',
  'stock-show-201-layers-property-animation',
  'stock-show-202-content-clip-viewport',
  'stock-show-203-pattern-instance-lifecycle',
  'stock-show-204-presentation-modes',
  'stock-show-205-groups-linked-reuse',
  'stock-show-207-aperture-shapes-edges',
  'stock-show-301-installation-mapping',
  'stock-show-303-compile-simplify-deliver',
])

describe('native v2 stock catalogue census', () => {
  it('lists the pinned legacy catalogue in order, then the Shows authored natively in v2', () => {
    // Native-only Shows (#1134) have no legacy counterpart to compare against.
    const nativeOnly = ['stock-show-installation-totality', 'stock-show-installation-black-sun']
    expect(STOCK_SHOWS_V2).toHaveLength(V1_STOCK_SHOWS.length + nativeOnly.length)
    const legacy = STOCK_SHOWS_V2.slice(0, V1_STOCK_SHOWS.length)
    expect(legacy.map(record => record.id)).toEqual(V1_STOCK_SHOWS.map(entry => entry.id))
    expect(legacy.map(record => record.name)).toEqual(V1_STOCK_SHOWS.map(entry => entry.name))
    expect(STOCK_SHOWS_V2.slice(V1_STOCK_SHOWS.length).map(record => record.id)).toEqual(nativeOnly)
  })

  it('resolves every catalogue entry by id and refuses an unknown one', () => {
    for (const entry of V1_STOCK_SHOWS) expect(stockShowV2ById(entry.id)?.id, entry.id).toBe(entry.id)
    expect(stockShowV2ById('stock-show-does-not-exist')).toBeUndefined()
    expect(stockShowV2ById(null)).toBeUndefined()
  })

  it('keeps every Zone, Layout definition and output contract the legacy entry declares', () => {
    for (const entry of V1_STOCK_SHOWS) {
      const native = stockShowV2ById(entry.id)!
      expect(native.zones, entry.id).toEqual(entry.show.zones)
      expect(native.zoneLayouts, entry.id).toEqual(entry.show.routingLayouts)
      expect(native.outputContract, entry.id).toEqual(entry.show.outputContract)
      expect(native.stageMapId, entry.id).toBe(entry.show.stageMapId)
    }
  })
})

describe.each(NATIVE_CASES)('native v2 stock Show %s', (_id, record) => {
  it('validates and reopens through the v2 codec unchanged', () => {
    expect(validateShowRecordV2(record)).toEqual([])
    const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
    expect(opened.status).toBe('opened')
    if (opened.status !== 'opened') return
    expect(opened.record).toEqual(record)
  })

  it('compiles directly from its native authoring, with no v1 converter in the path', () => {
    const prepared = prepareShowV2ForCompile(record, nativeStockSourceLookupV2(record), { libraries: LIBRARIES })
    expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : [])).toBe('ready')
    if (prepared.status !== 'ready') return
    const artifact = compileShow(prepared.recipe, LIBRARIES)
    expect(artifact.code.length).toBeGreaterThan(0)
    expect(artifact.summary.resources.blockers).toEqual([])
  })
})

describe.each(LEGACY_CASES)('native v2 stock Show %s', (id, record) => {
  it('carries the legacy Scene arc as ordered chapter Markers', () => {
    const legacy = v1StockShowById(id)!
    const scenes = projectShowTimeline(legacy.show).scenes
    const chapters = showChaptersV2(record)
    if (SINGLE_PASSAGE_SHOWS_WITHOUT_CHAPTERS.has(id)) {
      expect(scenes).toHaveLength(1)
      expect(record.composition.markers.filter(marker => marker.role === 'chapter')).toEqual([])
      return
    }
    expect(chapters.map(chapter => chapter.name)).toEqual(scenes.map(scene => scene.scene.name))
    expect(chapters.map(chapter => chapter.timeMs)).toEqual(scenes.map(scene => scene.startMs))
    for (const marker of record.composition.markers) {
      expect(marker.role === undefined || marker.role === 'chapter', `${id}:${marker.id}`).toBe(true)
    }
  })

  it('matches the converted pinned legacy record apart from the volatile stamp and conversion provenance', () => {
    const legacy = v1StockShowById(id)!
    const converted = convertShowRecordV1ToV2(legacy.show)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const semantic = (candidate: ShowRecordV2) => ({ ...structuredClone(candidate), updatedAt: 0 })
    // This catalogue authors its chapter Markers, its Transitions and its Layout
    // occurrences natively, so only the converted record carries the three #1065
    // conversion-metadata kinds the editor reads. Those differences are
    // classified, not dropped, and by the report's own classifier rather than a
    // restatement of it, so the catalogue proof and the native parity report
    // cannot drift apart. Each kind is admitted only as a native absence against
    // its exact recognized shape at its exact path; any other value, any
    // metadata the native builder authored, and every other field difference all
    // remain failures. The stamp is normalized on both sides, so nothing here
    // may be classified as volatile either.
    // A single-passage Show additionally omits the whole-Show chapter the legacy
    // Scene label still converts to (#1097 item 6): exactly one such difference
    // there, and none anywhere else.
    const differences = classify(compareValues(semantic(record), semantic(converted.record)))
    expect(differences.filter(difference => difference.classification === 'retired-single-passage-chapter'), id)
      .toHaveLength(SINGLE_PASSAGE_SHOWS_WITHOUT_CHAPTERS.has(id) ? 1 : 0)
    expect(differences.filter(difference => difference.classification !== 'conversion-provenance'
      && difference.classification !== 'retired-single-passage-chapter')
      .map(difference => `${difference.path}: ${JSON.stringify(difference.native)} vs ${JSON.stringify(difference.converted)}`), id)
      .toEqual([])
    // The native side authors none of the three, so every classified difference
    // above is genuinely the converter's and never a native record's.
    expect(record.composition.markers.filter(marker => marker.origin !== undefined)).toEqual([])
    expect(record.composition.transitions.filter(transition => transition.origin !== undefined)).toEqual([])
    expect(record.composition.layoutOccurrences.filter(occurrence => occurrence.incomingSwitch !== undefined)).toEqual([])
    // Provenance follows creation, not naming. A Marker the legacy catalogue authored
    // keeps its identity and carries no provenance, whether it stays a general guide
    // or absorbs a same-name/time chapter; the CME remix ships eight such guides.
    // Every other Marker in the converted record is one the conversion created.
    const authoredIds = new Set((legacy.show.composition?.markers ?? []).map(marker => marker.id))
    expect(converted.record.composition.markers.map(marker => marker.origin))
      .toEqual(converted.record.composition.markers.map(marker => authoredIds.has(marker.id) ? undefined : 'converted-scene-label'))
  })
})

// The three Zone Layout showcases are the records the 47-record conversion
// report already accounts as `retired-silent-runtime-use`: v1 kept Pattern
// runtimes alive inside intervals where their Zone was unrouted, and v2
// intentionally does not. Their resource ledgers therefore legitimately differ
// from the v1 catalogue; every other Show must census identically.
const RETIRED_SILENT_RUNTIME_SHOWS = new Set([
  'stock-show-showcase-zone-layouts-splits',
  'stock-show-showcase-zone-layouts-stripes-grid',
  'stock-show-showcase-zone-layouts-radial',
])

it('censuses the same resources as the pinned legacy catalogue, apart from the accepted retirements', () => {
  const differing: string[] = []
  for (const entry of V1_STOCK_SHOWS) {
    const native = stockShowV2ById(entry.id)!
    const prepared = prepareShowV2ForCompile(native, nativeStockSourceLookupV2(native), { libraries: LIBRARIES })
    expect(prepared.status, entry.id).toBe('ready')
    if (prepared.status !== 'ready') continue
    const nativeResources = compileShow(prepared.recipe, LIBRARIES).summary.resources
    const legacy = compileShowForArtifact(entry.show, [], undefined, {}, { stageDimension: 2 })
    expect(legacy.error, entry.id).toBeNull()
    expect(nativeResources.blockers, entry.id).toEqual([])
    if (JSON.stringify(nativeResources) !== JSON.stringify(legacy.artifact!.summary.resources)) differing.push(entry.id)
  }
  expect(new Set(differing)).toEqual(RETIRED_SILENT_RUNTIME_SHOWS)
  // Two whole-catalogue compiles; the default five-second budget is too tight.
}, 60_000)

it('stamps one deterministic vintage instead of a wall-clock timestamp', () => {
  expect(new Set(STOCK_SHOWS_V2.map(record => record.updatedAt))).toEqual(new Set([364]))
})

it('keeps general-purpose Markers out of every chapter projection', () => {
  const remix = stockShowV2ById('stock-show-remix-coronal-mass-ejection')!
  const general = remix.composition.markers.filter(marker => marker.role === undefined)
  expect(general.length).toBeGreaterThan(0)
  const chapterIds = new Set(showChaptersV2(remix).map(chapter => chapter.id))
  for (const marker of general) expect(chapterIds.has(marker.id), marker.id).toBe(false)
})

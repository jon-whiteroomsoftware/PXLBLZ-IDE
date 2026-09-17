import { expect, it } from 'vitest'
import { LIBRARIES } from '../pixelblaze/libs'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { compileShow } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowMarkerV2,
  type ShowRecordV2,
} from './showCompositionV2'
import { showChapterIndexAtV2, showChaptersV2 } from './showChaptersV2'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from './showFileBundle'
import { editShowMarkerV2 } from './showMarkersV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'

function convert(show = convertibleV1Show()): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(show)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted))
  return converted.record
}
function reopen(source: ShowRecordV2): ShowRecordV2 {
  expect(validateShowRecordV2(source)).toEqual([])
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(source))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}
function withMarkers(markers: ShowMarkerV2[], showEndMs = 1_000): ShowRecordV2 {
  const record = convert()
  record.composition.markers = markers
  record.composition.showEndMs = showEndMs
  return record
}
const LOOKUP = { byCellId: {}, byPatternInstanceId: { instance: 'export function render(index){hsv(index/pixelCount,1,1)}' } }
function compiledCode(record: ShowRecordV2): string {
  const prepared = prepareShowV2ForCompile(record, LOOKUP, { libraries: LIBRARIES })
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared))
  return compileShow(prepared.recipe, LIBRARIES).code
}

it('projects only chapter-role Markers, in deterministic (timeMs, id) order', () => {
  const record = withMarkers([
    { id: 'zulu', timeMs: 500, name: 'Second chapter', role: 'chapter' },
    { id: 'alpha', timeMs: 500, name: 'Alignment note' },
    { id: 'mike', timeMs: 0, name: 'Opening', role: 'chapter', color: '#38bdf8' },
  ], 1_000)
  const chapters = showChaptersV2(reopen(record))
  expect(chapters).toEqual([
    { id: 'mike', timeMs: 0, durationMs: 500, name: 'Opening', color: '#38bdf8' },
    { id: 'zulu', timeMs: 500, durationMs: 500, name: 'Second chapter' },
  ])
})

it('keeps equal-time chapters as individually selectable entries', () => {
  const record = withMarkers([
    { id: 'b-second', timeMs: 400, name: 'Right half', role: 'chapter' },
    { id: 'a-first', timeMs: 400, name: 'Left half', role: 'chapter' },
    { id: 'c-later', timeMs: 900, name: 'Finale', role: 'chapter' },
  ], 1_000)
  const chapters = showChaptersV2(record)
  expect(chapters.map(chapter => chapter.id)).toEqual(['a-first', 'b-second', 'c-later'])
  expect(chapters.map(chapter => chapter.durationMs)).toEqual([0, 500, 100])
  expect(new Set(chapters.map(chapter => chapter.id)).size).toBe(3)
})

it('reports no chapter before the first one and never synthesizes a label', () => {
  expect(showChaptersV2(withMarkers([{ id: 'note', timeMs: 0, name: 'Alignment' }]))).toEqual([])
  expect(showChapterIndexAtV2([], 0)).toBe(-1)
  const chapters = showChaptersV2(withMarkers([
    { id: 'late', timeMs: 600, name: 'Late chapter', role: 'chapter' },
  ], 1_000))
  expect(showChapterIndexAtV2(chapters, 0)).toBe(-1)
  expect(showChapterIndexAtV2(chapters, 599)).toBe(-1)
  expect(showChapterIndexAtV2(chapters, 600)).toBe(0)
  expect(showChapterIndexAtV2(chapters, 999)).toBe(0)
})

it('selects the last equal-time chapter deterministically at its exact start', () => {
  const chapters = showChaptersV2(withMarkers([
    { id: 'a-first', timeMs: 400, name: 'Left half', role: 'chapter' },
    { id: 'b-second', timeMs: 400, name: 'Right half', role: 'chapter' },
  ], 1_000))
  expect(showChapterIndexAtV2(chapters, 399)).toBe(-1)
  expect(showChapterIndexAtV2(chapters, 400)).toBe(1)
})

it('keeps dormant chapters beyond Show End with zero projected duration', () => {
  const chapters = showChaptersV2(withMarkers([
    { id: 'inside', timeMs: 0, name: 'Inside', role: 'chapter' },
    { id: 'dormant', timeMs: 4_000, name: 'Dormant', role: 'chapter' },
  ], 1_000))
  expect(chapters).toEqual([
    { id: 'inside', timeMs: 0, durationMs: 1_000, name: 'Inside' },
    { id: 'dormant', timeMs: 4_000, durationMs: 0, name: 'Dormant' },
  ])
})

it('marks every converted Scene label as a chapter at its original global start', () => {
  const show = convertibleV1Show()
  show.scenes = [
    { id: 'scene-a', name: 'Opening', durationMs: 400 },
    { id: 'scene-b', name: 'Closing', durationMs: 600 },
  ]
  show.composition!.scenes = [
    show.composition!.scenes![0],
    { sceneId: 'scene-b', zones: [{ zoneId: 'zone', overlays: [], main: [] }] },
  ]
  show.composition!.scenes![0].zones[0].main[0].durationMs = 400
  const record = convert(show)
  expect(showChaptersV2(reopen(record))).toEqual([
    { id: 'scene-marker:scene-a', timeMs: 0, durationMs: 400, name: 'Opening' },
    { id: 'scene-marker:scene-b', timeMs: 400, durationMs: 600, name: 'Closing' },
  ])
})

it('absorbs a same-name/time Marker into the chapter, keeping its identity and color', () => {
  const show = convertibleV1Show()
  show.composition!.markers = [
    { id: 'authored-opening', timeMs: 0, name: 'Opening', color: '#f97316' },
    { id: 'authored-cue', timeMs: 0, name: 'Camera cue', color: '#22c55e' },
  ]
  const record = convert(show)
  expect(record.composition.markers).toEqual([
    { id: 'authored-cue', timeMs: 0, name: 'Camera cue', color: '#22c55e' },
    { id: 'authored-opening', timeMs: 0, name: 'Opening', color: '#f97316', role: 'chapter' },
  ])
  expect(showChaptersV2(reopen(record))).toEqual([
    { id: 'authored-opening', timeMs: 0, durationMs: 1_000, name: 'Opening', color: '#f97316' },
  ])
})

it('leaves a same-time differently-named Marker general and adds the chapter beside it', () => {
  const show = convertibleV1Show()
  show.composition!.markers = [{ id: 'authored-cue', timeMs: 0, name: 'Camera cue' }]
  const record = convert(show)
  const general = record.composition.markers.filter(marker => marker.role === undefined)
  expect(general).toEqual([{ id: 'authored-cue', timeMs: 0, name: 'Camera cue' }])
  expect(showChaptersV2(record).map(chapter => chapter.id)).toEqual(['scene-marker:scene-a'])
})

it('preserves an existing chapter role through Marker moves and updates without minting one', () => {
  const record = withMarkers([
    { id: 'chapter', timeMs: 0, name: 'Opening', role: 'chapter' },
    { id: 'note', timeMs: 100, name: 'Alignment' },
  ], 1_000)
  const moved = editShowMarkerV2(record, { kind: 'move', markerId: 'chapter', timeMs: 250 })
  expect(moved.status).toBe('changed')
  if (moved.status !== 'changed') return
  expect(showChaptersV2(reopen(moved.record))).toEqual([
    { id: 'chapter', timeMs: 250, durationMs: 750, name: 'Opening' },
  ])
  const renamed = editShowMarkerV2(moved.record, { kind: 'update', markerId: 'chapter', patch: { name: 'Overture' } })
  expect(renamed.status).toBe('changed')
  if (renamed.status !== 'changed') return
  expect(renamed.record.composition.markers.find(marker => marker.id === 'chapter')?.role).toBe('chapter')
  const generalEdit = editShowMarkerV2(renamed.record, { kind: 'update', markerId: 'note', patch: { name: 'Cue' } })
  expect(generalEdit.status).toBe('changed')
  if (generalEdit.status !== 'changed') return
  expect(generalEdit.record.composition.markers.find(marker => marker.id === 'note')?.role).toBeUndefined()
  expect(showChaptersV2(generalEdit.record).map(chapter => chapter.id)).toEqual(['chapter'])
})

it('authors, promotes and clears the chapter role through the general Marker owner', () => {
  const record = withMarkers([{ id: 'chapter', timeMs: 0, name: 'Opening', role: 'chapter' }, { id: 'note', timeMs: 100, name: 'Alignment' }], 1_000)
  const before = structuredClone(record)
  const added = editShowMarkerV2(record, { kind: 'add', marker: { id: 'new', timeMs: 10, name: 'Verse', role: 'chapter' } })
  expect(added.status, JSON.stringify(added)).toBe('changed')
  if (added.status !== 'changed') return
  expect(showChaptersV2(reopen(added.record)).map(entry => entry.id)).toEqual(['chapter', 'new'])
  expect(added.affectedMarkerIds).toEqual(['new'])
  expect(record).toEqual(before)

  const promoted = editShowMarkerV2(added.record, { kind: 'update', markerId: 'note', patch: { role: 'chapter' } })
  expect(promoted.status).toBe('changed')
  if (promoted.status !== 'changed') return
  // Promotion keeps identity, time, name and colour exactly as authored.
  expect(promoted.record.composition.markers.find(marker => marker.id === 'note'))
    .toEqual({ ...added.record.composition.markers.find(marker => marker.id === 'note'), role: 'chapter' })

  const cleared = editShowMarkerV2(promoted.record, { kind: 'update', markerId: 'note', patch: { role: undefined } })
  expect(cleared.status).toBe('changed')
  if (cleared.status !== 'changed') return
  expect(cleared.record.composition.markers.find(marker => marker.id === 'note')).not.toHaveProperty('role')
  expect(showChaptersV2(reopen(cleared.record)).map(entry => entry.id)).toEqual(['chapter', 'new'])
  // Clearing an absent role is an ordinary no-op on the original record.
  const again = editShowMarkerV2(cleared.record, { kind: 'update', markerId: 'note', patch: { role: undefined } })
  expect(again.status).toBe('unchanged')
  expect(again.record).toBe(cleared.record)
})

it('refuses an unknown Marker role in the intent instead of storing it', () => {
  const record = withMarkers([{ id: 'chapter', timeMs: 0, name: 'Opening', role: 'chapter' }], 1_000)
  const added = editShowMarkerV2(record, { kind: 'add', marker: { id: 'new', timeMs: 10, role: 'act' } as unknown as ShowMarkerV2 })
  expect(added.status).toBe('refused')
  if (added.status !== 'refused') return
  expect(added.code).toBe('invalid-intent')
  expect(added.record).toBe(record)
})

it('rejects an unknown Marker role at the codec boundary', () => {
  const record = withMarkers([{ id: 'opening', timeMs: 0, name: 'Opening', role: 'chapter' }], 1_000)
  const text = serializeProvisionalShowRecordV2(record)
  expect(parseProvisionalShowRecordV2(text.replace('"role": "chapter"', '"role": "act"')).status).toBe('refused')
  expect(parseProvisionalShowRecordV2(text.replace('"role": "chapter"', '"chapter": true')).status).toBe('refused')
})

it('carries the chapter role through an exported and reopened .pxlshow bundle', async () => {
  const record = withMarkers([
    { id: 'opening', timeMs: 0, name: 'Opening', role: 'chapter' },
    { id: 'cue', timeMs: 200, name: 'Camera cue' },
  ], 1_000)
  const built = buildShowFileBundle(record, { patterns: [], maps: [], libraries: [] }, {
    appVersion: '1040-test',
    exportedAt: '2026-09-16T00:00:00.000Z',
  })
  const reopened = await parseShowFileBundle(await serializeShowFileBundle(built.bundle), { acceptV2: true })
  expect(reopened.show).toEqual(record)
  expect(showChaptersV2(reopened.show as ShowRecordV2).map(chapter => chapter.id)).toEqual(['opening'])
})

it('leaves compiled output identical when a Marker gains the chapter role', () => {
  const general = withMarkers([{ id: 'opening', timeMs: 0, name: 'Opening' }], 1_000)
  const chaptered = withMarkers([{ id: 'opening', timeMs: 0, name: 'Opening', role: 'chapter' }], 1_000)
  expect(compiledCode(chaptered)).toBe(compiledCode(general))
})

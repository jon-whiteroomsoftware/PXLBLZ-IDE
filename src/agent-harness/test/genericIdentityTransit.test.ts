// V2-authored for #945. Jon's narrowed completion contract supersedes the
// earlier scratch-container test surface: each patch member must remain valid
// declared Show structure, so temporary wrapper transit is rejected at that
// boundary and is covered by genericDeclaredStructure.test.ts. This suite
// retains the legitimate transit case: a collection moved directly between
// declared placement owners re-derives its nested Effect identity domains.
// Boundary: apply_patch through the public registry. Oracles: exact complete
// Show records for success and unchanged input plus the named id for refusal.
import { describe, expect, it } from 'vitest'
import type { ShowCompositionV1, ShowRecord } from '@/engine/personalContentRecords'
import type { ShowGrammarDocument } from '../grammar/types.js'
import { applyOk, applyRefused, clips, fixture } from './support/grammarHarness.js'

const MAIN_PLACEMENT = '/composition/scenes/0/zones/0/main/0'
const OVERLAY_PLACEMENT = '/composition/scenes/0/zones/0/overlays/0/placements/0'

const composition = (document: ShowGrammarDocument) => document.show.composition as ShowCompositionV1
const mainPlacement = (document: ShowGrammarDocument) => composition(document).scenes[0].zones[0].main[0]
const overlayPlacement = (document: ShowGrammarDocument) => composition(document).scenes[0].zones[0].overlays[0].placements[0]

function transitDocument(): ShowGrammarDocument {
  let document = fixture({ overlay: true })
  const mainClip = clips(document).find((clip) => clip.layer.kind === 'main' && clip.startMs === 0)!
  document = applyOk(document, 'add_clip_effect', { clip_id: mainClip.clipId, kind: 'brightness' }).document
  document = applyOk(document, 'add_clip_effect', { clip_id: mainClip.clipId, kind: 'hue' }).document
  return document
}

function expectedFrom(document: ShowGrammarDocument, edit: (show: ShowRecord) => void) {
  const expected = structuredClone(document.show)
  edit(expected)
  return expected
}

function refusedIdentity(document: ShowGrammarDocument, patch: Array<Record<string, unknown>>, id: string) {
  const issues = applyRefused(document, 'apply_patch', { patch }, 'invalid-argument')
  expect(issues[0].message).toContain(id)
  expect(issues[0].message).toMatch(/identity/i)
}

describe('a collection moved between declared owners re-derives nested identity domains (#945)', () => {
  it('moves an Effect stack to another placement while preserving legal independent-domain reuse', () => {
    const document = transitDocument()
    const [brightness, hue] = mainPlacement(document).effects!
    const moved = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'move', from: `${MAIN_PLACEMENT}/effects`, path: `${OVERLAY_PLACEMENT}/effects` },
        { op: 'remove', path: `${OVERLAY_PLACEMENT}/effects/0` },
        { op: 'add', path: `${MAIN_PLACEMENT}/effects`, value: [{ ...brightness }] },
      ],
    })
    expect(moved.document.show).toEqual(expectedFrom(document, (show) => {
      const comp = show.composition as ShowCompositionV1
      comp.scenes[0].zones[0].main[0].effects = [{ ...brightness }]
      comp.scenes[0].zones[0].overlays[0].placements[0].effects = [hue]
    }))
    expect(overlayPlacement(moved.document).effects!.map((effect) => effect.id)).toEqual([hue.id])
  })

  it('refuses same-domain recycling after the moved collection removes an Effect', () => {
    const document = transitDocument()
    const [brightness] = mainPlacement(document).effects!
    refusedIdentity(document, [
      { op: 'move', from: `${MAIN_PLACEMENT}/effects`, path: `${OVERLAY_PLACEMENT}/effects` },
      { op: 'remove', path: `${OVERLAY_PLACEMENT}/effects/0` },
      { op: 'add', path: `${OVERLAY_PLACEMENT}/effects/-`, value: { ...brightness } },
    ], brightness.id)
  })
})

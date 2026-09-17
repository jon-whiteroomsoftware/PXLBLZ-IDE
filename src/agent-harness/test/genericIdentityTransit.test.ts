// V2-authored for #945, re-authored on the version-2 record for #1039. Jon's
// narrowed completion contract supersedes the earlier scratch-container test
// surface: each patch member must remain valid declared Show structure, so
// temporary wrapper transit is rejected at that boundary and is covered by
// genericDeclaredStructure.test.ts. This suite retains the legitimate transit
// case: an Effect moved directly between declared owners re-derives its
// identity domain. In v2 an Effect stack lives inside one held appearance key
// and the schema requires that key to keep an `effects` array, so the transit
// that stays structurally valid at every member is moving one Effect between
// two Clips' first keys rather than detaching a whole collection.
// Boundary: apply_patch through the public registry. Oracles: exact complete
// Show records for success and unchanged input plus the named id for refusal.
import { describe, expect, it } from 'vitest'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import type { ShowGrammarDocument } from '../grammar/types.js'
import { applyOk, applyRefused, clipOnLayer, fixture } from './support/grammarHarness.js'

const composition = (document: ShowGrammarDocument) => document.show.composition
const clipIndex = (document: ShowGrammarDocument, clipId: string) =>
  composition(document).clips.findIndex((clip) => clip.id === clipId)
const effectsPointer = (index: number) => `/composition/clips/${index}/appearance/keys/0/value/effects`
const effectsOf = (document: ShowGrammarDocument, index: number) =>
  composition(document).clips[index].appearance.keys[0].value.effects!

interface TransitDocument {
  document: ShowGrammarDocument
  mainIndex: number
  overlayIndex: number
}

function transitDocument(): TransitDocument {
  let document = fixture({ overlay: true })
  const mainClipId = clipOnLayer(document, 'Main').clipId
  const overlayClipId = clipOnLayer(document, 'Over').clipId
  for (const kind of ['brightness', 'hue']) {
    document = applyOk(document, 'add_clip_effect', {
      clip_id: mainClipId,
      kind,
      apply: { scope: 'whole-clip' },
    }).document
  }
  // The destination owner needs an Effect collection to move onto.
  document = applyOk(document, 'add_clip_effect', {
    clip_id: overlayClipId,
    kind: 'vignette',
    apply: { scope: 'whole-clip' },
  }).document
  return {
    document,
    mainIndex: clipIndex(document, mainClipId),
    overlayIndex: clipIndex(document, overlayClipId),
  }
}

function expectedFrom(document: ShowGrammarDocument, edit: (show: ShowRecordV2) => void) {
  const expected = structuredClone(document.show)
  edit(expected)
  return expected
}

function refusedIdentity(document: ShowGrammarDocument, patch: Array<Record<string, unknown>>, id: string) {
  const issues = applyRefused(document, 'apply_patch', { patch }, 'invalid-argument')
  expect(issues[0].message).toContain(id)
  expect(issues[0].message).toMatch(/identity/i)
}

describe('an Effect moved between declared owners re-derives its identity domain (#945)', () => {
  it('moves one Effect to another Clip, leaving both stacks structurally valid', () => {
    const { document, mainIndex, overlayIndex } = transitDocument()
    const [brightness, hue] = effectsOf(document, mainIndex)
    const [vignette] = effectsOf(document, overlayIndex)
    const moved = applyOk(document, 'apply_patch', {
      patch: [
        { op: 'move', from: `${effectsPointer(mainIndex)}/0`, path: `${effectsPointer(overlayIndex)}/-` },
      ],
    })
    expect(moved.document.show).toEqual(expectedFrom(document, (show) => {
      show.composition.clips[mainIndex].appearance.keys[0].value.effects = [hue]
      show.composition.clips[overlayIndex].appearance.keys[0].value.effects = [vignette, brightness]
    }))
    expect(effectsOf(moved.document, overlayIndex).map((effect) => effect.id))
      .toEqual([vignette.id, brightness.id])
  })

  it('refuses recycling the moved Effect’s identity in the owner it left', () => {
    const { document, mainIndex, overlayIndex } = transitDocument()
    const [brightness] = effectsOf(document, mainIndex)
    refusedIdentity(document, [
      { op: 'move', from: `${effectsPointer(mainIndex)}/0`, path: `${effectsPointer(overlayIndex)}/-` },
      { op: 'add', path: `${effectsPointer(overlayIndex)}/-`, value: { ...brightness } },
    ], brightness.id)
  })
})

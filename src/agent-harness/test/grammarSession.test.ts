// Provenance: pxlblz-v3 test/grammarSession.test.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
import { describe, expect, it } from 'vitest'
import { createSessionStore } from '../grammar/session.js'
import { grammarFixtureShow } from './support/grammarFixture.js'

// Test model (issue #17). Boundary: the in-memory session store the MCP
// session tools wrap. Invariants: sessions are isolated from each other and
// from their callers (export hands out copies); a refusal leaves the session
// document unchanged; unknown session ids are typed errors naming the known
// ids; closing drops the session.

function openFixtureSession(store: ReturnType<typeof createSessionStore>) {
  const opened = store.open(grammarFixtureShow())
  if (!opened.ok) throw new Error(JSON.stringify(opened.issues))
  return opened
}

function firstClipId(opened: { listing: { clips: Array<{ clipId: string; startMs: number }> } }) {
  const clip = opened.listing.clips.find((candidate) => candidate.startMs === 0)
  if (!clip) throw new Error('no clip at 0 ms')
  return clip.clipId
}

describe('grammar session store (#17)', () => {
  it('opens a Show and returns a session id with the compact clip listing', () => {
    const store = createSessionStore()
    const opened = openFixtureSession(store)
    expect(opened.sessionId).toBe('show-1')
    expect(opened.listing.durationMs).toBe(60_000)
    expect(opened.listing.scenes.map((scene) => scene.sceneId)).toEqual(['s1', 's2'])
    expect(opened.listing.clips).toHaveLength(2)
    for (const clip of opened.listing.clips) {
      expect(clip.clipId.length).toBeGreaterThan(0)
      expect(clip.zoneName).toBe('Main')
      expect(clip.layer.kind).toBe('main')
      expect(clip.endMs - clip.startMs).toBe(clip.durationMs)
    }
  })

  it('refuses to open an invalid document and creates no session', () => {
    const store = createSessionStore()
    const opened = store.open({ not: 'a show' })
    expect(opened.ok).toBe(false)
    if (!opened.ok) expect(opened.issues[0].code).toBe('open-failed')
    const exported = store.export('show-1')
    expect(exported.ok).toBe(false)
  })

  it('round-trips open to export, isolated from caller mutation', () => {
    const store = createSessionStore()
    const opened = openFixtureSession(store)
    const first = store.export(opened.sessionId)
    if (!first.ok) throw new Error('export failed')
    expect(first.show.composition).toBeDefined()
    ;(first.show as { name: string }).name = 'mutated by caller'
    const second = store.export(opened.sessionId)
    if (!second.ok) throw new Error('export failed')
    expect(second.show.name).toBe('Grammar fixture')
  })

  it('commits an accepted operation and leaves the input Show untouched', () => {
    const store = createSessionStore()
    const input = grammarFixtureShow()
    const snapshot = structuredClone(input)
    const opened = store.open(input)
    if (!opened.ok) throw new Error('open failed')
    const clipId = firstClipId(opened)

    const applied = store.apply(opened.sessionId, 'resize_clip', { clip_id: clipId, duration_ms: 12_000 })
    expect(applied.ok).toBe(true)
    if (applied.ok) {
      expect(applied.changes).toHaveLength(1)
      const resized = applied.listing.clips.find((candidate) => candidate.clipId === clipId)
      expect(resized?.durationMs).toBe(12_000)
    }
    expect(input).toEqual(snapshot)

    const exported = store.export(opened.sessionId)
    if (!exported.ok) throw new Error('export failed')
    const scene1 = (exported.show.composition as {
      scenes: Array<{ sceneId: string; zones: Array<{ main: Array<{ durationMs: number }> }> }>
    }).scenes.find((scene) => scene.sceneId === 's1')
    expect(scene1?.zones[0].main[0].durationMs).toBe(12_000)
  })

  it('leaves the session document unchanged after a refusal', () => {
    const store = createSessionStore()
    const opened = openFixtureSession(store)
    const clipId = firstClipId(opened)
    const before = store.export(opened.sessionId)
    if (!before.ok) throw new Error('export failed')

    const refused = store.apply(opened.sessionId, 'resize_clip', { clip_id: clipId, duration_ms: 40_000 })
    expect(refused.ok).toBe(false)
    if (!refused.ok) expect(refused.issues[0].code).toBe('overlap')

    const after = store.export(opened.sessionId)
    if (!after.ok) throw new Error('export failed')
    expect(after.show).toEqual(before.show)
  })

  it('keeps concurrent sessions independent', () => {
    const store = createSessionStore()
    const one = openFixtureSession(store)
    const two = openFixtureSession(store)
    expect(two.sessionId).not.toBe(one.sessionId)

    const applied = store.apply(one.sessionId, 'resize_clip', {
      clip_id: firstClipId(one),
      duration_ms: 12_000,
    })
    expect(applied.ok).toBe(true)

    const untouched = store.export(two.sessionId)
    if (!untouched.ok) throw new Error('export failed')
    const listingTwo = store.apply(two.sessionId, 'resize_clip', {
      clip_id: firstClipId(two),
      duration_ms: 20_000,
    })
    expect(listingTwo.ok).toBe(true)
    if (listingTwo.ok) {
      const clip = listingTwo.listing.clips.find((candidate) => candidate.clipId === firstClipId(two))
      expect(clip?.durationMs).toBe(20_000)
    }
    const one2 = store.export(one.sessionId)
    if (!one2.ok) throw new Error('export failed')
    const scene1 = (one2.show.composition as {
      scenes: Array<{ sceneId: string; zones: Array<{ main: Array<{ durationMs: number }> }> }>
    }).scenes.find((scene) => scene.sceneId === 's1')
    expect(scene1?.zones[0].main[0].durationMs).toBe(12_000)
  })

  it('reports unknown session ids with the known ids', () => {
    const store = createSessionStore()
    const opened = openFixtureSession(store)
    const outcome = store.apply('show-99', 'resize_clip', { clip_id: 'x', duration_ms: 1 })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.issues[0].code).toBe('unknown-session')
      expect(outcome.issues[0].candidates).toEqual([opened.sessionId])
    }
  })

  it('closes a session and refuses further operations on it', () => {
    const store = createSessionStore()
    const opened = openFixtureSession(store)
    expect(store.close(opened.sessionId).ok).toBe(true)
    const exported = store.export(opened.sessionId)
    expect(exported.ok).toBe(false)
    if (!exported.ok) expect(exported.issues[0].code).toBe('unknown-session')
    const closedTwice = store.close(opened.sessionId)
    expect(closedTwice.ok).toBe(false)
  })

  it('passes unknown operations through as typed issues', () => {
    const store = createSessionStore()
    const opened = openFixtureSession(store)
    const outcome = store.apply(opened.sessionId, 'no_such_operation', {})
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.issues[0].code).toBe('unknown-operation')
  })
})

import { describe, it, expect } from 'vitest'
import { deriveStuckSaveStatus, lastSavedPhrase, stuckSaveStatusLabel } from './saveStatus'

describe('deriveStuckSaveStatus (#810)', () => {
  it('is silent with no persisted record (demos, stock, read-only)', () => {
    expect(deriveStuckSaveStatus({
      buffer: 'x', persisted: null, compileBroken: true, autosaveFailed: true,
    })).toBeNull()
  })

  it('is silent when the buffer matches the persisted record', () => {
    expect(deriveStuckSaveStatus({
      buffer: 'same', persisted: 'same', compileBroken: false, autosaveFailed: true,
    })).toBeNull()
  })

  it('is silent for a clean dirty buffer the next tick will save', () => {
    expect(deriveStuckSaveStatus({
      buffer: 'new', persisted: 'old', compileBroken: false, autosaveFailed: false,
    })).toBeNull()
  })

  it('reports wont-save for a dirty broken buffer', () => {
    expect(deriveStuckSaveStatus({
      buffer: 'new', persisted: 'old', compileBroken: true, autosaveFailed: false,
    })).toBe('wont-save')
  })

  it('reports cant-save for a dirty clean buffer whose write is failing', () => {
    expect(deriveStuckSaveStatus({
      buffer: 'new', persisted: 'old', compileBroken: false, autosaveFailed: true,
    })).toBe('cant-save')
  })

  it('prefers wont-save when the source is broken and the write is also failing', () => {
    // Autosave would not attempt broken source, so the actionable signal is
    // the source errors, not the connection.
    expect(deriveStuckSaveStatus({
      buffer: 'new', persisted: 'old', compileBroken: true, autosaveFailed: true,
    })).toBe('wont-save')
  })
})

describe('save-status labels', () => {
  it('stamps the absolute last-saved time', () => {
    const at = new Date(2026, 7, 11, 15, 42).getTime()
    const stamp = new Date(at).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
    expect(lastSavedPhrase(at)).toBe(`Last saved ${stamp}.`)
  })

  it('appends last-saved only when known', () => {
    expect(stuckSaveStatusLabel('cant-save', null)).not.toMatch(/Last saved/)
    expect(stuckSaveStatusLabel('wont-save', Date.now())).toMatch(/errors[\s\S]*Last saved /)
  })
})

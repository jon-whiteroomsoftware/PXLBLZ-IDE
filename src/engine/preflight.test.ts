import { describe, it, expect } from 'vitest'
import { describePreflight } from './preflight'

describe('describePreflight', () => {
  it('is clear when the pattern maps exactly the Controller pixel count', () => {
    const pf = describePreflight({ localPixelCount: 256, devicePixelCount: 256 })
    expect(pf.warnings).toEqual([])
    expect(pf.blocking).toBe(false)
  })

  it('warns when the pattern maps fewer pixels than the device has', () => {
    const pf = describePreflight({ localPixelCount: 100, devicePixelCount: 256 })
    expect(pf.warnings).toHaveLength(1)
    const [w] = pf.warnings
    expect(w.kind).toBe('fewer-than-device')
    expect(w.message).toBe('Only 100 of the Controller’s 256 pixels will light up.')
  })

  it('warns when the pattern maps more pixels than the device has', () => {
    const pf = describePreflight({ localPixelCount: 400, devicePixelCount: 256 })
    expect(pf.warnings).toHaveLength(1)
    const [w] = pf.warnings
    expect(w.kind).toBe('more-than-device')
    expect(w.message).toBe(
      'This pattern maps 400 pixels but the Controller has 256; the extra 144 are ignored.',
    )
  })

  it('adds a map-overwrite warning only when a map push is opted into', () => {
    const without = describePreflight({ localPixelCount: 256, devicePixelCount: 256 })
    expect(without.warnings.some((w) => w.kind === 'map-overwrite')).toBe(false)

    const withMap = describePreflight({
      localPixelCount: 256,
      devicePixelCount: 256,
      pushingMap: true,
    })
    const overwrite = withMap.warnings.find((w) => w.kind === 'map-overwrite')
    expect(overwrite?.message).toBe('This replaces the Controller’s single shared map.')
  })

  it('skips the pixel-fit warnings when the device count is unknown', () => {
    const pf = describePreflight({ localPixelCount: 100, devicePixelCount: null })
    expect(pf.warnings.some((w) => w.kind.endsWith('-device'))).toBe(false)
  })

  it('still surfaces the map-overwrite warning when the device count is unknown', () => {
    const pf = describePreflight({
      localPixelCount: 100,
      devicePixelCount: null,
      pushingMap: true,
    })
    expect(pf.warnings.map((w) => w.kind)).toEqual(['map-overwrite'])
    expect(pf.blocking).toBe(false)
    expect(pf.remedyPixelCount).toBeNull()
  })

  it('keeps pattern-push count mismatches non-blocking', () => {
    const fewer = describePreflight({ localPixelCount: 100, devicePixelCount: 256 })
    expect(fewer.blocking).toBe(false)
    expect(fewer.remedyPixelCount).toBeNull()

    const more = describePreflight({ localPixelCount: 400, devicePixelCount: 256 })
    expect(more.blocking).toBe(false)
    expect(more.remedyPixelCount).toBeNull()
  })

  // ── map-push count mismatch is a hard, blocking failure (#213) ──────────────
  it('blocks a map push whose point count does not match the device, with a remedy', () => {
    const pf = describePreflight({
      localPixelCount: 16,
      devicePixelCount: 256,
      pushingMap: true,
    })
    expect(pf.blocking).toBe(true)
    // The Controller must be set to the map's own point count for it to apply.
    expect(pf.remedyPixelCount).toBe(16)
    // map-count-mismatch comes first, then the overwrite guard.
    expect(pf.warnings.map((w) => w.kind)).toEqual(['map-count-mismatch', 'map-overwrite'])
    const [mismatch] = pf.warnings
    expect(mismatch.message).toContain('16 points')
    expect(mismatch.message).toContain('256 pixels')
    expect(mismatch.message).toContain('silently drops')
    // No misleading pattern-oriented copy about partial application.
    expect(mismatch.message).not.toContain('will light up')
    expect(mismatch.message).not.toContain('ignored')
  })

  it('does not block a map push whose re-baked count already matches the device', () => {
    const pf = describePreflight({
      localPixelCount: 256,
      devicePixelCount: 256,
      pushingMap: true,
    })
    expect(pf.blocking).toBe(false)
    expect(pf.remedyPixelCount).toBeNull()
    expect(pf.warnings.map((w) => w.kind)).toEqual(['map-overwrite'])
  })
})

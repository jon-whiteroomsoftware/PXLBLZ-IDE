import { describe, expect, it } from 'vitest'
// @ts-expect-error -- plain ESM script without type declarations
import { classify, labelTemplateStrings, matchesTemplate, sourceProduces, sourceTemplates } from './check-e2e-locators.mjs'

// The label shapes that actually occur in this codebase. Every one of these was
// reported stale by the original prefix-only heuristic, which froze them into
// the ratchet and left it blind to the renames it exists to catch (#638).
const LIVE_SOURCE = [
  'aria-label={`Edit ${junction.kind} Transition between ${leftClip.patternName} and ${rightClip.patternName}`}',
  'aria-label={`Use ${item.label} Transition`}',
  'aria-label={`Edit ${item?.label ?? effect.kind} Effect`}',
  'aria-label={`Add ${item.label} Effect`}',
  'aria-label={`${layout.name} routing mode`}',
  'aria-label={`${collapsed ? "Expand" : "Collapse"} zone ${row.zoneName}`}',
  'aria-label={`Select zone ${zone.name}`}',
  'aria-label={`Scene ${show.scenes.length + 1}`}',
  'aria-label="Add to Show"',
  'aria-label="Portable reference pixels"',
].join('\n')

const produces = (name: string) => sourceProduces(name, LIVE_SOURCE)

describe('e2e locator staleness detection', () => {
  describe('names live source still produces', () => {
    // Each of these is a real template-assembled label. Reporting them stale is
    // how the check went blind: they can never be repaired by any spec edit.
    it.each([
      'Edit crossfade Transition between TestPattern1D and CometLoom',
      'Edit routing Transition between TestPattern1D and CometLoom',
      'Use Star Transition',
      'Use Cut Transition',
      'Add Ripple Effect',
      'Edit Ripple Effect',
      'Default routing mode',
      'Collapse zone Sky',
      'Select zone main',
    ])('accepts %j', (name) => {
      expect(produces(name)).toBe(true)
    })

    it('accepts an exact literal', () => {
      expect(produces('Portable reference pixels')).toBe(true)
    })
  })

  describe('names live source does not produce', () => {
    // The regression the check exists to catch: a rename leaves the spec naming
    // something nothing renders. Extra words on either end must not be smuggled
    // past a template that happens to share a prefix or suffix.
    it.each([
      'Add to Show menu trigger',
      'Inspect Scene 1 in Super Detail',
      'Add clip to main in Scene 1',
      'Set routing layout after Scene 1',
      'Edit split position transition from Scene 1',
    ])('rejects %j', (name) => {
      expect(produces(name)).toBe(false)
    })

    it('rejects a thin template blessing an unrelated name', () => {
      // `Scene ${n}` must not vouch for every string containing "Scene".
      expect(produces('Scene Scene 1 transport controls')).toBe(false)
    })

    it('keeps a template segment contiguous', () => {
      // Treating each word as its own segment would let arbitrary text be
      // inserted inside "Transition between", matching a label nothing renders.
      expect(produces('Edit crossfade Transition X between Y and Z')).toBe(false)
    })
  })

  describe('matcher constraints', () => {
    it('honours end anchoring', () => {
      const [template] = sourceTemplates('aria-label={`Use ${item.label} Transition`}')
      expect(matchesTemplate('Use Star Transition', template)).toBe('produced')
      expect(matchesTemplate('Use Star Transition extra', template)).toBe(false)
    })

    it('honours start anchoring', () => {
      const [template] = sourceTemplates('aria-label={`Select zone ${zone.name}`}')
      expect(matchesTemplate('Select zone main', template)).toBe('produced')
      expect(matchesTemplate('Really Select zone main', template)).toBe(false)
    })

    it('reports a data-dominated name as unverifiable rather than produced', () => {
      // The shape fits, but `Scene ${n}` cannot confirm or refute this name.
      // Calling it stale would be a lie no spec edit could ever repair.
      const [template] = sourceTemplates('aria-label={`Scene ${n}`}')
      expect(matchesTemplate('Scene 1 with a great many additional words', template)).toBe('weak')
    })

    it('classifies a runtime-data name as unverifiable, not stale', () => {
      const source = 'aria-label={`Select ${clip.patternName}`}'
      expect(classify('Select TestPattern1D', source)).toBe('unverifiable')
      expect(classify('Add clip to main in Scene 1', source)).toBe('stale')
    })

    it('does not let a non-label template vouch for a user-facing name', () => {
      // showModel generates default entity names; it renders no label, so it
      // must not bless "Scene Scene 1", which no group in src produces.
      const source = 'const name = uniqueSceneName(`Scene ${show.scenes.length + 1}`, taken)'
      expect(classify('Scene Scene 1', source)).toBe('stale')
    })

    it('keeps the dynamic branch when an interpolation has a quoted default', () => {
      // `${marker.name ?? 'Marker'}` is not a closed set: the fallback is one
      // possibility among arbitrary runtime names. Expanding only to the
      // literal would file the real rendered label as stale.
      const source = "aria-label={`Delete ${marker.name ?? 'Marker'}`}"
      expect(classify('Delete Marker', source)).toBe('produced')
      expect(classify('Delete Chorus start', source)).toBe('unverifiable')
    })

    it('extracts every literal from a ternary label expression', () => {
      const source = 'aria-label={inGroup ? `Select Group Clip ${p}` : `Select ${p}`}'
      expect(labelTemplateStrings(source)).toEqual([
        'Select Group Clip ${p}',
        'Select ${p}',
      ])
      expect(classify('Select TestPattern1D', source)).toBe('unverifiable')
    })
  })
})

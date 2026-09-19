import { describe, expect, it } from 'vitest'
import {
  isBindingProofFresh,
  isInAppProofFresh,
  isV2StoredRecord,
  keepV2StoredRecords,
  mergeShowListingsById,
  routedShowIdFromUrl,
  selectV2BarrierAnchor,
  v2RevisionAdvanced,
} from './showV2HarnessDecisions'

describe('isV2StoredRecord', () => {
  it('accepts a version-2 document', () => {
    expect(isV2StoredRecord({ version: 2, id: 'a' })).toBe(true)
  })
  it('rejects version-1 rows by their own version field', () => {
    expect(isV2StoredRecord({ version: 1, id: 'a' })).toBe(false)
  })
  it('rejects missing, string, null, and non-object versions', () => {
    expect(isV2StoredRecord({ id: 'a' })).toBe(false)
    expect(isV2StoredRecord({ version: '2', id: 'a' })).toBe(false)
    expect(isV2StoredRecord(null)).toBe(false)
    expect(isV2StoredRecord(undefined)).toBe(false)
    expect(isV2StoredRecord(2)).toBe(false)
  })
})

describe('keepV2StoredRecords', () => {
  it('keeps only genuinely v2-stored rows from the includeV2 union', () => {
    const union = [
      { version: 1, id: 'v1-row' },
      { version: 2, id: 'v2-doc' },
      { version: 1, id: 'other-v1' },
    ]
    expect(keepV2StoredRecords(union).map((record) => record.id)).toEqual(['v2-doc'])
  })
})

describe('mergeShowListingsById', () => {
  it('returns the union free of duplicates by id with the primary record winning', () => {
    const primary = [{ id: 'a', name: 'v1' }]
    const secondary = [{ id: 'a', name: 'v2' }, { id: 'b', name: 'v2' }]
    expect(mergeShowListingsById(primary, secondary)).toEqual([
      { id: 'a', name: 'v1' },
      { id: 'b', name: 'v2' },
    ])
  })
  it('passes disjoint listings through unchanged', () => {
    expect(mergeShowListingsById([{ id: 'a' }], [{ id: 'b' }]).map((show) => show.id)).toEqual(['a', 'b'])
  })
})

describe('routedShowIdFromUrl', () => {
  it('reads the Show id a Studio route addresses', () => {
    expect(routedShowIdFromUrl('studio/shows/abc')).toBe('abc')
    expect(routedShowIdFromUrl('http://localhost:5174/PXLBLZ-IDE/studio/shows/abc')).toBe('abc')
  })
  it('ignores query strings and hashes', () => {
    expect(routedShowIdFromUrl('studio/shows/abc?show-v2-editor=1#panel')).toBe('abc')
  })
  it('returns null for the list route and non-Studio urls', () => {
    expect(routedShowIdFromUrl('studio/shows')).toBeNull()
    expect(routedShowIdFromUrl('studio/shows/')).toBeNull()
    expect(routedShowIdFromUrl('about:blank')).toBeNull()
  })
})

describe('v2RevisionAdvanced', () => {
  it('advances only past the barrier-start snapshot', () => {
    expect(v2RevisionAdvanced(5, 3)).toBe(true)
    expect(v2RevisionAdvanced(3, 3)).toBe(false)
    expect(v2RevisionAdvanced(2, 3)).toBe(false)
  })
  it('treats an appearing document as a save and a still-absent one as none', () => {
    expect(v2RevisionAdvanced(5, undefined)).toBe(true)
    expect(v2RevisionAdvanced(undefined, undefined)).toBe(false)
    expect(v2RevisionAdvanced(undefined, 3)).toBe(false)
  })
})

describe('isBindingProofFresh', () => {
  it('requires a version-2 registration from the current navigation generation', () => {
    expect(isBindingProofFresh(undefined, 7)).toBe(false)
    expect(isBindingProofFresh({ version: 1, sequence: 7 }, 7)).toBe(false)
    expect(isBindingProofFresh({ version: 2, sequence: 6 }, 7)).toBe(false)
    expect(isBindingProofFresh({ version: 2, sequence: 7 }, 7)).toBe(true)
    expect(isBindingProofFresh({ version: 2, sequence: 8 }, 7)).toBe(true)
  })
})

describe('isInAppProofFresh', () => {
  it('rejects a missing proof and a non-v2 registration', () => {
    expect(isInAppProofFresh(undefined, undefined)).toBe(false)
    expect(isInAppProofFresh({ version: 1, sequence: 9 }, undefined)).toBe(false)
  })
  it('accepts any version-2 proof for a Show with no accepted proof yet', () => {
    expect(isInAppProofFresh({ version: 2, sequence: 3 }, undefined)).toBe(true)
  })
  it('requires a strictly newer registration after a proof was accepted', () => {
    expect(isInAppProofFresh({ version: 2, sequence: 5 }, 5)).toBe(false)
    expect(isInAppProofFresh({ version: 2, sequence: 4 }, 5)).toBe(false)
    expect(isInAppProofFresh({ version: 2, sequence: 6 }, 5)).toBe(true)
  })
})

describe('selectV2BarrierAnchor', () => {
  it('prefers the previous barrier\'s consumed revision over the seeded one', () => {
    expect(selectV2BarrierAnchor({ observed: 12, seeded: 10 })).toBe(12)
  })
  it('falls back to the seeded revision before any barrier consumed one', () => {
    expect(selectV2BarrierAnchor({ observed: undefined, seeded: 10 })).toBe(10)
  })
  it('has no anchor when nothing was observed or seeded', () => {
    expect(selectV2BarrierAnchor({ observed: undefined, seeded: undefined })).toBeUndefined()
  })
})

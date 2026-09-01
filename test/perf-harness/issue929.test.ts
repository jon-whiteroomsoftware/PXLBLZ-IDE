import { describe, expect, it } from 'vitest'
import { issue929Fixtures } from './issue929'

describe('#929 paired fixtures', () => {
  it('changes every fixture and keeps the artifacts clean', () => {
    for (const fixture of issue929Fixtures()) {
      expect(fixture.byteIdentical, fixture.id).toBe(false)
      expect(fixture.on.summary.resources.blockers, fixture.id).toEqual([])
    }
  })
})

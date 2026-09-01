import { describe, expect, it } from 'vitest'
import { issue931Fixtures } from './issue931'

describe('#931 paired fixtures', () => {
  it('changes every loop-bearing member and keeps the artifacts clean', () => {
    for (const fixture of issue931Fixtures()) {
      expect(fixture.byteIdentical, fixture.id).toBe(false)
      expect(fixture.on.summary.resources.blockers, fixture.id).toEqual([])
    }
  })
})

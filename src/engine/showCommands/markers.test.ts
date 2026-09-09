import { expect, it } from 'vitest'
import { showCommandFixture } from '../../test/showCommandFixture'
import { applyShowCommand } from './registry'

it('validates exact marker times and returns the complete original record for a same-value move', () => {
  const show = showCommandFixture()
  const original = structuredClone(show)
  const marker = show.composition!.markers![0]
  expect(applyShowCommand(show, 'move_marker', { marker_id: marker.id, at_ms: marker.timeMs }))
    .toEqual({ ok: true, record: show, changes: [] })
  for (const at_ms of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    for (const command of ['add_marker', 'move_marker', 'update_marker']) {
      expect(applyShowCommand(show, command, { ...(command === 'add_marker' ? {} : { marker_id: marker.id }), at_ms }).ok).toBe(false)
    }
  }
  expect(show).toEqual(original)
})

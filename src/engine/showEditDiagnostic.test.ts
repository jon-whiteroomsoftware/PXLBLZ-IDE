import { expect, it } from 'vitest'
import {
  SHOW_EDIT_DIAGNOSTIC_MAX_BYTES,
  SHOW_EDIT_DIAGNOSTIC_MAX_ISSUES,
  retainShowEditDiagnostic,
} from './showEditDiagnostic'

it('bounds and sanitizes a deterministic prefix without retaining caller prose', () => {
  const result = retainShowEditDiagnostic({
    stage: 'authoring',
    issues: Array.from({ length: 12 }, (_, index) => ({
      code: index === 0 ? 'invalid-scene-duration' : 'structure-invalid',
      path: `${index}\n${'\\'.repeat(400)}💡`,
    })),
  })!
  expect(result.issues.length).toBeLessThanOrEqual(SHOW_EDIT_DIAGNOSTIC_MAX_ISSUES)
  expect(result.issues[0]).toMatchObject({ code: 'invalid-scene-duration', path: expect.stringMatching(/^0 /) })
  expect(result.truncated).toBe(true)
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(SHOW_EDIT_DIAGNOSTIC_MAX_BYTES)
  expect(retainShowEditDiagnostic({
    stage: 'authoring',
    issues: [{ code: 'invalid-scene-duration', message: 'candidate secret' }],
  })).toBeUndefined()
})

it.each([
  null,
  { stage: 'invented', issues: [{ code: 'invalid-scene-duration' }] },
  { stage: 'authoring', issues: [] },
  { stage: 'authoring', issues: [{ code: 'invented' }] },
  { stage: 'authoring', issues: [{ code: 'invalid-scene-duration', path: 4 }] },
])('rejects an unsupported diagnostic input without projecting it: %j', value => {
  expect(retainShowEditDiagnostic(value)).toBeUndefined()
})

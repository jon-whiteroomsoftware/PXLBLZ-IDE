import { expect, it } from 'vitest'
import { captureShowAuthoringBaseline, validateShowAuthoring } from './showAuthoringValidation'
import { projectFlatShowToCompositionV1 } from './showCompositionModel'
import { personalBaseShow } from '../agent-harness/baseline/fixtures'
import { stockPatternSource } from '../agent-harness/shows/stockCatalogue'
import { LIBRARIES } from '../pixelblaze/libs'

/**
 * A composition-shaped v1 record, the shape this validator owns.
 *
 * The pinned baseline fixture supplies the flat record and the engine projects
 * it, so this test keeps its own v1 subject after the agent harness moved to the
 * version-2 vocabulary (#1039).
 */
function openGrammarFixture(): { document: { show: ReturnType<typeof personalBaseShow> } } {
  const show = personalBaseShow('authoring-fixture')
  show.composition = projectFlatShowToCompositionV1(show, {
    byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, stockPatternSource(cell.pattern.id)!])),
    stageDimension: 2,
  })
  return { document: { show } }
}

it.each(['pattern-source', 'library-source'] as const)('does not grandfather a new missing Library after %s changes', change => {
  const show = openGrammarFixture().document.show
  show.composition!.patternInstances[0].pattern = { kind: 'user', id: 'personal' }
  let personal = 'export function render(index) { Missing.paint(index) }'
  const libraries = { ...LIBRARIES, Available: 'export function paint(index) { Missing.paint(index) }' }
  if (change === 'library-source') personal = 'export function render(index) { Available.paint(index) }'
  const source = (ref: { kind: string; id: string }) => ref.kind === 'stock' ? stockPatternSource(ref.id) : personal
  const baseline = captureShowAuthoringBaseline(show, { source, libraries })
  if (change === 'pattern-source') personal = 'export function render(index) { Different.paint(index) }'
  else libraries.Available = 'export function paint(index) { Different.paint(index) }'
  const result = validateShowAuthoring(show, { source, libraries, baseline, allowExistingMissing: true })
  expect(result.valid).toBe(false)
  expect(result.errors.some(issue => issue.code === 'missing-reference')).toBe(true)
})

it.each([
  'export function render(index) { Missing["paint"](index) }',
  'export function render(index) { Missing.nested.paint(index) }',
])('refuses required dependency metadata outside the finite direct-call domain: %s', personal => {
  const show = openGrammarFixture().document.show
  show.composition!.patternInstances[0].pattern = { kind: 'user', id: 'personal' }
  const result = validateShowAuthoring(show, {
    source: ref => ref.kind === 'stock' ? stockPatternSource(ref.id) : personal,
    libraries: LIBRARIES,
    allowExistingMissing: true,
  })
  expect(result.valid).toBe(false)
  expect(result.errors.some(issue => issue.code === 'metadata')).toBe(true)
})

it('preserves and then repairs a transitive Library reference, including inline calls and cycles', () => {
  const show = openGrammarFixture().document.show
  show.composition!.patternInstances[0].pattern = { kind: 'user', id: 'personal' }
  const source = (ref: { kind: string; id: string }) => ref.kind === 'stock' ? stockPatternSource(ref.id) : 'export function render(index) { A.inline.paint(index) }'
  const libraries = { ...LIBRARIES, A: 'function paint(v) { B.paint(v) }', B: 'function paint(v) { A.paint(v); Missing.paint(v) }' }
  const baseline = captureShowAuthoringBaseline(show, { source, libraries })
  const current = validateShowAuthoring(show, { source, libraries, baseline, allowExistingMissing: true })
  expect(current.valid).toBe(true)
  expect(current.warnings.some(issue => issue.code === 'missing-reference')).toBe(true)
  const repaired = validateShowAuthoring(show, { source, libraries: { ...libraries, Missing: 'function paint(v) {}' }, baseline, allowExistingMissing: true })
  expect(repaired.valid).toBe(true)
  expect(repaired.warnings.filter(issue => issue.code === 'missing-reference')).toEqual([])
})

it.each(['scene-duration', 'composition-scene-owner', 'composition-zone-owner', 'layout-reference'] as const)('refuses malformed authored structure: %s', fault => {
  const show = openGrammarFixture().document.show
  if (fault === 'scene-duration') show.scenes[0].durationMs = 1.5
  if (fault === 'composition-scene-owner') show.composition!.scenes.push(structuredClone(show.composition!.scenes[0]))
  if (fault === 'composition-zone-owner') show.composition!.scenes[0].zones.push(structuredClone(show.composition!.scenes[0].zones[0]))
  if (fault === 'layout-reference') show.transitions = [{ id: 'routing', afterSceneId: 's1', kind: 'routing', durationMs: 0, easing: { curve: 'linear' }, layoutId: 'missing' }]
  expect(validateShowAuthoring(show, { source: ref => ref.kind === 'stock' ? stockPatternSource(ref.id) : undefined, libraries: LIBRARIES }).valid).toBe(false)
})

it('refuses a routing event without a Layout target', () => {
  const show = openGrammarFixture().document.show
  show.transitions = [{ id: 'routing', afterSceneId: 's1', kind: 'routing', durationMs: 0, easing: { curve: 'linear' } }]
  expect(validateShowAuthoring(show, { source: ref => ref.kind === 'stock' ? stockPatternSource(ref.id) : undefined, libraries: LIBRARIES }).valid).toBe(false)
})

it('owns a stable Scene-duration diagnostic identity and owner path at the authoring source', () => {
  const show = openGrammarFixture().document.show
  show.scenes[1].durationMs = 0
  const result = validateShowAuthoring(show, {
    source: ref => ref.kind === 'stock' ? stockPatternSource(ref.id) : undefined,
    libraries: LIBRARIES,
  })
  expect(result.errors).toContainEqual({
    code: 'structure',
    diagnosticCode: 'invalid-scene-duration',
    message: `Scene "${show.scenes[1].id}" duration must be a positive safe integer.`,
    path: JSON.stringify(['scene', show.scenes[1].id, 'durationMs']),
  })
})

it('preserves the underlying composition issue code when assigning its authoring category', () => {
  const show = openGrammarFixture().document.show
  show.composition!.scenes.push(structuredClone(show.composition!.scenes[0]))
  const result = validateShowAuthoring(show, {
    source: ref => ref.kind === 'stock' ? stockPatternSource(ref.id) : undefined,
    libraries: LIBRARIES,
  })
  expect(result.errors).toContainEqual(expect.objectContaining({
    code: 'composition',
    diagnosticCode: 'duplicate-id',
  }))
})

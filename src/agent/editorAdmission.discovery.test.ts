// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest'
import { resetPersonalContentProvider } from '@/engine/personalContentProvider'
import { agentV2Record, openAgentV2Show } from '@/test/agentAdmissionV2Harness'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { controllerProfileInitialState, defaultControllerProfile, useControllerProfileStore } from '@/store/controllerProfileStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { showInitialState, useShowStore } from '@/store/showStore'
import { createAgentEditorAdmission } from './editorAdmission'

const personal = {
  id: 'personal-pattern',
  name: 'Personal Pattern',
  src: 'export function sliderAmount(value) {}\nexport function toggleFreeze(value) {}\nexport function render(index) { Personal.paint(index) }',
  controls: { sliderAmount: 0.8 },
  updatedAt: 1,
}

let binding: Awaited<ReturnType<typeof openAgentV2Show>>['binding']
beforeEach(async () => {
  window.history.replaceState(null, '', '/studio/shows/show?agent=1')
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useLibraryStore.setState(libraryInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  binding = (await openAgentV2Show(agentV2Record('show', 'Discovery'))).binding
})

afterEach(() => {
  binding.stop()
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useLibraryStore.setState(libraryInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
})

it('reads Patterns from one hydrated source/dependency snapshot and fits the relay result cap', () => {
  const admission = createAgentEditorAdmission('show', () => ({}), undefined, undefined, binding)
  expect(admission.getPatterns()).toBeUndefined()

  usePatternStore.setState({ userPatterns: [personal], patternsLoaded: true })
  useLibraryStore.setState({
    userLibraries: [{ id: 'personal-library', name: 'Personal', src: 'function paint(index) { rgb(index, 0, 0) }', updatedAt: 1 }],
    librariesLoaded: true,
  })
  const patterns = admission.getPatterns()

  expect(patterns?.filter(pattern => pattern.kind === 'stock').map(pattern => pattern.id).sort()).toEqual(Object.keys(DEMOS).sort())
  expect(patterns).toContainEqual({
    kind: 'user', id: 'personal-pattern', name: 'Personal Pattern',
    exported_controls: [
      { export_name: 'sliderAmount', kind: 'slider', min: 0, max: 1 },
      { export_name: 'toggleFreeze', kind: 'toggle' },
    ],
  })
  expect(admission.getPatterns({ query: 'personal', kind: 'user' })).toHaveLength(1)
  const catalogueBytes = new TextEncoder().encode(JSON.stringify({ code: 'read', patterns })).byteLength
  expect(catalogueBytes).toBeLessThanOrEqual(1_048_576)
  admission.close()
})

it('returns unavailable when a matching Pattern dependency cannot be inspected', () => {
  usePatternStore.setState({ userPatterns: [{ ...personal, src: 'export function render(index) { Missing.paint(index) }' }], patternsLoaded: true })
  useLibraryStore.setState({ userLibraries: [], librariesLoaded: true })
  const admission = createAgentEditorAdmission('show', () => ({}), undefined, undefined, binding)

  expect(admission.getPatterns({ kind: 'user' })).toBeUndefined()
  admission.close()
})

it('lists only hydrated Controller-profile identities and last-known pixel counts', () => {
  const admission = createAgentEditorAdmission('show', () => ({}), undefined, undefined, binding)
  expect(admission.getControllerProfiles()).toBeUndefined()

  useControllerProfileStore.setState({
    profilesLoaded: true,
    profiles: [
      { ...defaultControllerProfile({ id: 'known', name: 'Known', now: 1 }), lastKnownPixelCount: 512 },
      defaultControllerProfile({ id: 'unknown', name: 'Unknown', now: 2 }),
    ],
  })
  expect(admission.getControllerProfiles()).toEqual([
    { id: 'known', name: 'Known', pixel_count: 512 },
    { id: 'unknown', name: 'Unknown' },
  ])
  admission.close()
})

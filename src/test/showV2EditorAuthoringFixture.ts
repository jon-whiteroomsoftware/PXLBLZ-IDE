import { showV2TransitionEditorFixture } from './showV2TransitionEditorFixture'
import { convertibleV1Show } from './showV2TracerFixture'

/**
 * The thirty-second editor-route authoring fixture for #1056 slice 4: one
 * spanning Main Clip, an exact overlay Cut junction at 3000 ms, and two Layout
 * occurrences sharing one definition with a second definition available.
 */
export function showV2EditorAuthoringFixture() {
  const { record, dependencies } = showV2TransitionEditorFixture()
  record.id = 'editor-v2-authoring-fixture'
  record.name = 'Editor v2 authoring'
  const first = record.composition.layoutOccurrences[0]
  first.durationMs = 5_000
  record.composition.layoutOccurrences.push({
    ...structuredClone(first), id: 'later-layout', startMs: 5_000, durationMs: 25_000,
  })
  record.zoneLayouts.push({ ...structuredClone(record.zoneLayouts[0]), id: 'alternate-layout', name: 'Alternate' })
  return { record, dependencies }
}

/** The same fixture as authenticated route bytes: v2 record, v1 seed row and Patterns. */
export function showV2EditorAuthoringRouteFixture() {
  const { record, dependencies } = showV2EditorAuthoringFixture()
  record.id = 'show-editor-v2-authoring'
  record.name = 'V2 editor authoring'
  const legacy = convertibleV1Show()
  legacy.id = record.id
  legacy.name = record.name
  return { record, legacy, patterns: dependencies.patterns }
}

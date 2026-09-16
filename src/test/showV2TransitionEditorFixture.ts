import { showV2GroupEditorFixture } from './showV2GroupEditorFixture'
import { convertibleV1Show } from './showV2TracerFixture'

/**
 * Thirty-second native Transition fixture: one spanning Main Clip and an exact
 * overlay Cut junction at 3000 ms whose incoming Clip carries a Restart.
 */
export function showV2TransitionEditorFixture() {
  const { record, dependencies } = showV2GroupEditorFixture()
  record.id = 'transition-editor-fixture'
  record.name = 'Transition boundaries'
  return { record, dependencies }
}

/** The same fixture as authenticated route bytes: v2 record, v1 seed and Patterns. */
export function showV2TransitionRouteFixture() {
  const { record, dependencies } = showV2TransitionEditorFixture()
  record.id = 'show-v2-transitions'
  record.name = 'V2 Transition boundaries'
  const legacy = convertibleV1Show()
  legacy.id = record.id
  legacy.name = record.name
  return { record, legacy, patterns: dependencies.patterns }
}

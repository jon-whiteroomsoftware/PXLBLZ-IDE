import { showV2GroupEditorFixture } from './showV2GroupEditorFixture'
import { planShowV2GroupCreation } from '../engine/showV2GroupCreationEditorModel'
import { createShowGroupFromSelectionV2 } from '../engine/showGroupCreationV2'
import { duplicateShowGroupOccurrenceV2 } from '../engine/showGroupEditsV2'
import { insertShowTimeV2 } from '../engine/showTimelineV2'

/** Linked thirty-one-second fixture, with an internal Transition, Restart and held time. */
export function showV2GroupOccurrenceEditorFixture(linked = false, onlyGroup = false) {
  const { record, dependencies } = showV2GroupEditorFixture(true)
  let next = 0
  const plan = planShowV2GroupCreation(record, { clipIds: ['verse-a', 'verse-b'], transitionIds: ['verse-transition'], name: 'Verse' }, () => `local-${++next}`)
  if (plan.status !== 'ready') throw Error(plan.message)
  const created = createShowGroupFromSelectionV2(record, plan.intent)
  if (created.status !== 'changed') throw Error('Group fixture creation failed')
  const inserted = insertShowTimeV2(created.record, { atMs: 5000, durationMs: 1000 })
  if (inserted.status !== 'changed') throw Error('Group fixture hold failed')
  let current = inserted.record
  if (linked) {
    const occurrence = current.composition.groupOccurrences[0]
    const copied = duplicateShowGroupOccurrenceV2(current, { ...occurrence, kind: 'duplicate-occurrence', occurrenceId: occurrence.id, newOccurrenceId: 'linked', startMs: 10000 })
    if (copied.status !== 'changed') throw Error('Linked fixture failed')
    current = copied.record
  }
  if (onlyGroup) current.composition.clips = []
  return { record: current, dependencies }
}

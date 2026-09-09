import type { ShowRecord } from '../personalContentRecords'
import { newPersonalContentId } from '../personalContentMetadata'
import { duplicateShowClipAfter, duplicateLinkedShowClipAfter, planShowClipDuplicateAfter } from '../showTimelineClipAuthoring'
import { commandComposition, withComposition, type ShowCommandDescriptor } from './registry'
import { engineIdentityRefusal, planRefusal, resolveCommandClip } from './support'

export function duplicateClipCommandOutcome(record: ShowRecord, input: Record<string, unknown>, newId: (kind: 'clip' | 'instance') => string = () => newPersonalContentId()) {
  const resolved = commandComposition(record)
  if (!resolved.ok) return resolved
  const composition = resolved.composition
  const found = resolveCommandClip(record, composition, input.clip_id as string)
  if (!found.ok) return found
  const { clip, owner } = found.context
  const linked = input.linked === true
  const plan = planShowClipDuplicateAfter(record, composition, { owner, independent: !linked })
  if (!plan.enabled) return planRefusal(plan, `duplicate_clip Clip ${clip.id}`)
  const newPlacementId = newId('clip')
  const result = linked
    ? duplicateLinkedShowClipAfter(record, composition, { owner, newPlacementId })
    : duplicateShowClipAfter(record, composition, { owner, newPlacementId, newInstanceId: newId('instance') })
  if (result === composition) return engineIdentityRefusal('duplicate_clip', 'Check the destination and fresh identities.')
  return { ok: true as const, record: withComposition(record, result), changes: [{
    command: 'duplicate_clip', targetId: newPlacementId,
    description: `Clip ${clip.patternName} duplicated ${linked ? 'linked' : 'independently'} after itself at ${clip.endMs}–${clip.endMs + clip.durationMs} ms.`,
    details: { sourceClipId: clip.id, linked },
  }] }
}

export function createDuplicateClipCommand(): ShowCommandDescriptor {
  return {
    name: 'duplicate_clip',
    description: 'Duplicate a direct logical Clip immediately after its full span on the same Layer. Independent by default; linked true shares the Pattern instance. Occupied/protected/out-of-Show tails, Group children and unsupported multi-Scene animation refuse.',
    touches: ['/composition/patternInstances', '/composition/scenes/*/zones', '/composition/scenes/*/propertyTracks', '/composition/executionModel', '/updatedAt'],
    fields: {
      clip_id: { kind: 'string', description: 'Logical Clip id from the timeline listing' },
      linked: { kind: 'boolean', optional: true, description: 'Share the Pattern instance (default false)' },
    },
    apply: (record, input) => duplicateClipCommandOutcome(record, input),
  }
}

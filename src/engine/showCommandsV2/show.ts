// Show and output metadata, exact Show End, and Insert Time. The timeline
// commands delegate to their v2 owners; the metadata commands are the owner for
// their own record fields and validate one complete candidate before returning.
import { validateShowRecordV2, type ShowRecordV2 } from '../showCompositionV2'
import { editShowLayoutIntervalsV2 } from '../showLayoutIntervalsV2'
import { insertShowTimeV2 } from '../showTimelineV2'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from '../showOutputContract'
import { DEFAULT_SHOW_TRAILS_RETENTION, normalizeShowOutputEffects } from '../showPreviousRgbFeedback'
import {
  changedShowCommandV2,
  refuseShowCommandV2,
  unchangedShowCommandV2,
  type ShowCommandV2Descriptor,
  type ShowCommandV2Outcome,
} from './registry'
import {
  adoptOwnerResult,
  affectedWith,
  describeIds,
  durationField,
  idField,
  invalidArgument,
  timeField,
  unitField,
  unknownIdentity,
} from './support'

function commitMetadata(
  record: ShowRecordV2,
  next: ShowRecordV2,
  command: string,
  description: string,
  targetId: string,
): ShowCommandV2Outcome {
  const invalid = validateShowRecordV2(next)[0]
  if (invalid) {
    return refuseShowCommandV2(record, {
      code: 'invalid-result',
      message: `${command}: the requested edit would produce an invalid Show at ${invalid.path}: ${invalid.message}`,
    })
  }
  return changedShowCommandV2(next, command, description, affectedWith({}), targetId)
}

const renameShow: ShowCommandV2Descriptor = {
  name: 'rename_show',
  family: 'show',
  description: 'Rename the Show. The name is display metadata; identities and content are unaffected.',
  touches: ['/name'],
  fields: {
    name: { kind: 'string', maxLength: 200, description: 'The new Show name; leading and trailing whitespace is trimmed.' },
  },
  apply(record, input) {
    const name = (input.name as string).trim()
    if (!name) return invalidArgument(record, 'rename_show', 'the Show name cannot be blank.', '$.name')
    if (name === record.name) return unchangedShowCommandV2(record)
    return commitMetadata(record, { ...record, name }, 'rename_show',
      `Show renamed from "${record.name}" to "${name}".`, record.id)
  },
}

const setStageMap: ShowCommandV2Descriptor = {
  name: 'set_stage_map',
  family: 'show',
  description: 'Set or clear the Stage map without changing the output contract or Controller profile.',
  touches: ['/stageMapId'],
  fields: {
    stage_map_id: { kind: 'string', maxLength: 200, nullable: true, description: 'Stage map identity; null for none.' },
  },
  apply(record, input) {
    const raw = input.stage_map_id as string | null
    const stageMapId = raw === null ? null : raw.trim()
    if (stageMapId !== null && !stageMapId) {
      return invalidArgument(record, 'set_stage_map', 'a blank Stage map identity is not a target; pass null for none.', '$.stage_map_id')
    }
    if ((record.stageMapId ?? null) === stageMapId) return unchangedShowCommandV2(record)
    return commitMetadata(record, { ...record, stageMapId }, 'set_stage_map',
      stageMapId === null ? 'The Show has no Stage map.' : `The Show has Stage map ${stageMapId}.`, record.id)
  },
}

const updateZone: ShowCommandV2Descriptor = {
  name: 'update_zone',
  family: 'show',
  description: 'Update Zone name, nominal pixel count or display color without changing routing or Clips.',
  touches: ['/zones/*/name', '/zones/*/nominalPixelCount', '/zones/*/color'],
  atLeastOne: ['name', 'nominal_pixel_count', 'color'],
  fields: {
    zone_id: idField('The Zone identity.'),
    name: { kind: 'string', optional: true, maxLength: 200, description: 'Trimmed distinct Zone name.' },
    nominal_pixel_count: { kind: 'integer', optional: true, minimum: 1, maximum: 100_000, description: 'Positive nominal pixel count.' },
    color: { kind: 'string', optional: true, maxLength: 64, description: 'Display color.' },
  },
  apply(record, input) {
    const zoneId = input.zone_id as string
    const zone = record.zones.find(candidate => candidate.id === zoneId)
    if (!zone) return unknownIdentity(record, 'update_zone', 'Zone', zoneId, record.zones.map(candidate => candidate.id))
    const name = (input.name as string | undefined)?.trim()
    const nominalPixelCount = input.nominal_pixel_count as number | undefined
    const color = input.color as string | undefined
    if (name === '') return invalidArgument(record, 'update_zone', 'the Zone name cannot be blank.', '$.name')
    const collision = name !== undefined && record.zones.find(candidate => candidate.id !== zoneId && candidate.name === name)
    if (collision) {
      return refuseShowCommandV2(record, {
        code: 'duplicate-name',
        message: `update_zone: Zone "${collision.id}" is already named "${name}".`,
        remedy: 'Choose a distinct name, or rename that Zone first.',
      })
    }
    if ((name === undefined || name === zone.name)
      && (nominalPixelCount === undefined || nominalPixelCount === zone.nominalPixelCount)
      && (color === undefined || color === zone.color)) return unchangedShowCommandV2(record)
    const next = structuredClone(record)
    const edited = next.zones.find(candidate => candidate.id === zoneId)!
    if (name !== undefined) edited.name = name
    if (nominalPixelCount !== undefined) edited.nominalPixelCount = nominalPixelCount
    if (color !== undefined) edited.color = color
    return commitMetadata(record, next, 'update_zone', `Zone ${zoneId} metadata updated.`, zoneId)
  },
}

const setTargetControllerProfile: ShowCommandV2Descriptor = {
  name: 'set_target_controller_profile',
  family: 'show',
  description: 'Set or clear the Controller profile the Show targets for compile estimates and sends; null returns it to automatic selection.',
  touches: ['/targetControllerProfileId'],
  fields: {
    profile_id: { kind: 'string', maxLength: 200, nullable: true, description: 'Controller profile identity; null for automatic selection.' },
  },
  apply(record, input) {
    const raw = input.profile_id as string | null
    const profileId = raw === null ? null : raw.trim()
    if (profileId !== null && !profileId) {
      return invalidArgument(record, 'set_target_controller_profile', 'a blank profile identity is not a target; pass null for automatic selection.', '$.profile_id')
    }
    if ((record.targetControllerProfileId ?? null) === profileId) return unchangedShowCommandV2(record)
    const next = structuredClone(record)
    if (profileId === null) delete next.targetControllerProfileId
    else next.targetControllerProfileId = profileId
    return commitMetadata(record, next, 'set_target_controller_profile',
      profileId === null ? 'The Show selects its Controller profile automatically.' : `The Show targets Controller profile ${profileId}.`,
      record.id)
  },
}

const setOutputContract: ShowCommandV2Descriptor = {
  name: 'set_output_contract',
  family: 'show',
  description: 'Replace the output contract: portable-2d (a reference map and reference pixel count, adapting to any continuous 2D surface) or installation (a fixed output map and pixel count). The Stage map follows the contract map.',
  touches: ['/outputContract', '/stageMapId'],
  fields: {
    kind: { kind: 'string', enum: ['portable-2d', 'installation'], description: 'The contract kind.' },
    pixel_count: { kind: 'integer', minimum: 1, maximum: 100_000, description: 'Reference pixel count (portable) or fixed pixel count (installation).' },
    map_id: { kind: 'string', maxLength: 200, optional: true, nullable: true, description: 'Reference map (portable) or output map (installation); null or omitted for none.' },
  },
  apply(record, input) {
    const kind = input.kind as 'portable-2d' | 'installation'
    const mapId = (input.map_id as string | null | undefined) ?? null
    const pixelCount = input.pixel_count as number
    const contract = kind === 'portable-2d'
      ? createPortableShowOutputContract({ referenceMapId: mapId, referencePixelCount: pixelCount })
      : createInstallationShowOutputContract({ outputMapId: mapId, pixelCount })
    const storedMapId = contract.kind === 'portable-2d' ? contract.referenceMapId : contract.outputMapId
    const storedPixelCount = contract.kind === 'portable-2d' ? contract.referencePixelCount : contract.pixelCount
    if (JSON.stringify(contract) === JSON.stringify(record.outputContract) && (record.stageMapId ?? null) === storedMapId) {
      return unchangedShowCommandV2(record)
    }
    return commitMetadata(record, { ...record, outputContract: contract, stageMapId: storedMapId }, 'set_output_contract',
      `Output contract is now ${kind} (${storedPixelCount} px, map ${storedMapId ?? 'none'}).`, 'output-contract')
  },
}

const setOutputTrails: ShowCommandV2Descriptor = {
  name: 'set_output_trails',
  family: 'show',
  description: 'Enable, disable or retune the Trails output Effect: brighter linear-RGB pixels from the previous frame are retained at the given retention. Enabling without a retention keeps the current one, or the default when Trails was off.',
  touches: ['/outputEffects'],
  atLeastOne: ['enabled', 'retention'],
  fields: {
    enabled: { kind: 'boolean', optional: true, description: 'Whether Trails runs; omit to keep the current state.' },
    retention: unitField('Retention, 0–1.', true),
  },
  apply(record, input) {
    const current = normalizeShowOutputEffects(record.outputEffects).find(effect => effect.kind === 'trails')
    const enabled = (input.enabled as boolean | undefined) ?? Boolean(current)
    if (!enabled) {
      if (!current) return unchangedShowCommandV2(record)
      return commitMetadata(record, { ...record, outputEffects: [] }, 'set_output_trails', 'Trails is off.', 'trails')
    }
    const retention = (input.retention as number | undefined) ?? current?.retention ?? DEFAULT_SHOW_TRAILS_RETENTION
    if (current && current.retention === retention) return unchangedShowCommandV2(record)
    const outputEffects = normalizeShowOutputEffects([{ id: current?.id ?? 'trails', kind: 'trails', retention }])
    return commitMetadata(record, { ...record, outputEffects }, 'set_output_trails',
      `Trails is on at retention ${retention}.`, 'trails')
  },
}

const setShowEnd: ShowCommandV2Descriptor = {
  name: 'set_show_end',
  family: 'show',
  description: 'Set Show End to an exact global millisecond. Shortening refuses, naming the protecting entity, when a Clip contribution, Group contribution, Property activation or timed Layout transfer would be cut; it never clamps. Empty trailing Layout intervals are removed and the retained final interval is truncated. Extending stretches the final Layout interval and leaves authored content unchanged.',
  touches: ['/composition/showEndMs', '/composition/layoutOccurrences'],
  fields: {
    end_ms: durationField('The exact new Show End in global milliseconds.'),
  },
  apply(record, input) {
    return adoptOwnerResult('set_show_end', record,
      editShowLayoutIntervalsV2(record, { kind: 'set-show-end', showEndMs: input.end_ms as number }),
      affected => `Show End is ${input.end_ms as number} ms; Layout intervals ${describeIds(affected.layoutIntervals)}.`,
      'show-end')
  },
}

const insertTime: ShowCommandV2Descriptor = {
  name: 'insert_time',
  family: 'show',
  description: 'Insert authored time at a global millisecond. Content at or after the point moves later, a Clip strictly spanning it extends with a fresh held appearance key, a Property track spanning it gains a hold key and resumes its original curve, a crossed Group occurrence gains a Group-local hold, and Layout coverage extends. Show End grows by the duration. Insertion strictly inside a visual Transition or a timed Layout transfer refuses.',
  touches: ['/composition'],
  fields: {
    at_ms: timeField('Global millisecond to insert at.'),
    duration_ms: durationField('Positive inserted duration in milliseconds.'),
  },
  apply(record, input) {
    return adoptOwnerResult('insert_time', record,
      insertShowTimeV2(record, { atMs: input.at_ms as number, durationMs: input.duration_ms as number }),
      affected => `Inserted ${input.duration_ms as number} ms at ${input.at_ms as number} ms; Clips ${describeIds(affected.clips)}.`,
      'insert-time')
  },
}

export const SHOW_V2_SHOW_COMMANDS: ShowCommandV2Descriptor[] = [
  renameShow,
  setStageMap,
  updateZone,
  setTargetControllerProfile,
  setOutputContract,
  setOutputTrails,
  setShowEnd,
  insertTime,
]

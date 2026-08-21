// Structure command family: the output contract, the Trails output Effect,
// and Zone Layout occurrences (the hard routing intervals on the timeline),
// through the pure contract, output-effect, and layout-interval functions.
import type { ShowRecord } from '../personalContentRecords'
import {
  appendShowLayoutInterval,
  duplicateShowLayoutInterval,
  insertShowLayoutInterval,
  makeShowLayoutIntervalUnique,
  projectShowLayoutIntervals,
} from '../showLayoutIntervals'
import {
  createInstallationShowOutputContract,
  createPortableShowOutputContract,
} from '../showOutputContract'
import { setShowOutputTrails } from '../showOutputEffectAuthoring'
import {
  refuseShowCommand,
  type ShowCommandDescriptor,
  type ShowCommandRefusal,
} from './registry'
import { monotonicRecord } from './support'

function unknownInterval(record: ShowRecord, intervalId: string): ShowCommandRefusal {
  const intervals = projectShowLayoutIntervals(record)
  return refuseShowCommand({
    code: 'unknown-interval',
    message:
      `No Zone Layout occurrence has id "${intervalId}". Occurrences: ${
        intervals.map((candidate) =>
          `${candidate.id} (${candidate.layoutName}, ${candidate.startMs}–${candidate.endMs} ms)`).join('; ')}.`,
    candidates: intervals.map((candidate) => candidate.id),
  })
}

const setOutputContract: ShowCommandDescriptor = {
  name: 'set_output_contract',
  description:
    'Replace the Show\'s output contract: portable-2d (a reference map id and reference pixel count; ' +
    'the Show adapts to any continuous 2D surface) or installation (a fixed output map id and pixel ' +
    'count). The stage map follows the contract\'s map. Refused when the Show already has exactly ' +
    'this contract.',
  touches: ['/outputContract', '/stageMapId', '/updatedAt'],
  fields: {
    kind: { kind: 'string', enum: ['portable-2d', 'installation'], description: 'The contract kind' },
    map_id: {
      kind: 'string',
      nullable: true,
      description: 'Reference map id (portable) or output map id (installation); null for none',
    },
    pixel_count: { kind: 'integer', description: 'Reference pixel count (portable) or fixed pixel count (installation)' },
  },
  apply(record, input) {
    const kind = input.kind as 'portable-2d' | 'installation'
    const mapId = input.map_id as string | null
    const pixelCount = input.pixel_count as number
    if (pixelCount <= 0) {
      return refuseShowCommand({
        code: 'invalid-argument',
        message: 'set_output_contract: pixel_count must be positive.',
      })
    }
    const contract = kind === 'portable-2d'
      ? createPortableShowOutputContract({ referenceMapId: mapId, referencePixelCount: pixelCount })
      : createInstallationShowOutputContract({ outputMapId: mapId, pixelCount })
    // Report and store what the contract creator normalized (it trims the
    // map id and clamps the pixel count).
    const storedMapId = contract.kind === 'portable-2d' ? contract.referenceMapId : contract.outputMapId
    const storedPixelCount = contract.kind === 'portable-2d' ? contract.referencePixelCount : contract.pixelCount
    if (JSON.stringify(contract) === JSON.stringify(record.outputContract) && record.stageMapId === storedMapId) {
      return refuseShowCommand({
        code: 'no-change',
        message: `The Show already has exactly this ${kind} output contract.`,
      })
    }
    return {
      ok: true,
      record: {
        ...record,
        outputContract: contract,
        stageMapId: storedMapId,
        updatedAt: Math.max(Date.now(), record.updatedAt + 1),
      },
      changes: [{
        command: 'set_output_contract',
        targetId: 'output-contract',
        description:
          kind === 'portable-2d'
            ? `Output contract is now portable-2d (${storedPixelCount} px reference, map ${storedMapId ?? 'none'}).`
            : `Output contract is now installation (${storedPixelCount} px fixed, map ${storedMapId ?? 'none'}).`,
      }],
    }
  },
}

const setOutputTrails: ShowCommandDescriptor = {
  name: 'set_output_trails',
  description:
    'Enable, disable, or retune the Show\'s Trails output Effect: brighter linear-RGB pixels from the ' +
    'previous frame are retained at the given retention (0–1, clamped). Enabling without a retention ' +
    'keeps the current one, or the default when Trails was off. Refused when nothing would change.',
  touches: ['/outputEffects', '/updatedAt'],
  fields: {
    enabled: { kind: 'boolean', description: 'Whether Trails runs on the Show output' },
    retention: { kind: 'number', optional: true, description: 'Retention in [0, 1]; values outside clamp' },
  },
  apply(record, input) {
    const result = setShowOutputTrails(record, {
      enabled: input.enabled as boolean,
      ...(input.retention !== undefined ? { retention: input.retention as number } : {}),
    })
    if (result === record) {
      return refuseShowCommand({
        code: 'no-change',
        message:
          input.enabled
            ? 'Trails is already enabled at exactly this retention.'
            : 'Trails is already off.',
      })
    }
    const trails = result.outputEffects?.find((effect) => effect.kind === 'trails')
    return {
      ok: true,
      record: monotonicRecord(record, result),
      changes: [{
        command: 'set_output_trails',
        targetId: 'trails',
        description: trails
          ? `Trails is on at retention ${trails.retention}.`
          : 'Trails is off.',
      }],
    }
  },
}

const addLayoutInterval: ShowCommandDescriptor = {
  name: 'add_layout_interval',
  description:
    'Add an empty Zone Layout occurrence of the given duration: at the end of the Show (omit at_ms) ' +
    'or inserted at a global time. Inserting inside held content splits it at that point; refused ' +
    'where the boundary would cut a Transition window or a multi-part clip.',
  touches: ['/scenes', '/transitions', '/composition', '/cells', '/routingLayouts', '/updatedAt'],
  fields: {
    layout_id: { kind: 'string', description: 'The Zone Layout id the occurrence routes through' },
    duration_ms: { kind: 'integer', description: 'Occurrence duration in milliseconds (positive)' },
    at_ms: { kind: 'number', optional: true, description: 'Global insertion point; omit to append at the end' },
  },
  apply(record, input) {
    const layoutId = input.layout_id as string
    if (!record.routingLayouts.some((layout) => layout.id === layoutId)) {
      return refuseShowCommand({
        code: 'unknown-layout',
        message:
          `No Zone Layout has id "${layoutId}". Layouts: ${
            record.routingLayouts.map((layout) => `${layout.id} (${layout.name})`).join('; ')}.`,
        candidates: record.routingLayouts.map((layout) => layout.id),
      })
    }
    const durationMs = input.duration_ms as number
    const atMs = input.at_ms as number | undefined
    const result = atMs === undefined
      ? appendShowLayoutInterval(record, { layoutId, durationMs })
      : insertShowLayoutInterval(record, { layoutId, durationMs, atMs })
    if (result === record) {
      return refuseShowCommand({
        code: 'engine-refused',
        message:
          `add_layout_interval: the engine declined a ${durationMs} ms occurrence of ${layoutId}` +
          `${atMs !== undefined ? ` at ${atMs} ms` : ''}; the insertion point may fall inside a ` +
          'Transition window or a multi-part clip, or the duration was not positive.',
        remedy: 'Choose a point on a clip boundary, or append at the end by omitting at_ms.',
      })
    }
    const intervals = projectShowLayoutIntervals(result)
    const added = atMs === undefined
      ? intervals[intervals.length - 1]
      : intervals.find((candidate) => candidate.startMs === Math.round(atMs))
    return {
      ok: true,
      record: monotonicRecord(record, result),
      changes: [{
        command: 'add_layout_interval',
        targetId: added?.id ?? layoutId,
        description:
          `Layout ${layoutId} occurrence added${atMs !== undefined ? ` at ${Math.round(atMs)} ms` : ' at the end of the Show'} ` +
          `for ${durationMs} ms.`,
        details: { intervalId: added?.id },
      }],
    }
  },
}

const duplicateLayoutInterval: ShowCommandDescriptor = {
  name: 'duplicate_layout_interval',
  description:
    'Duplicate a Zone Layout occurrence immediately after itself: empty (default) or with its content ' +
    '(with_content true). Refused when a multi-part clip crosses the occurrence boundary.',
  touches: ['/scenes', '/transitions', '/composition', '/cells', '/updatedAt'],
  fields: {
    interval_id: { kind: 'string', description: 'The Layout occurrence id (from the interval projection)' },
    with_content: { kind: 'boolean', optional: true, description: 'Copy the occurrence\'s clips as well (default false)' },
  },
  apply(record, input) {
    const intervalId = input.interval_id as string
    if (!projectShowLayoutIntervals(record).some((candidate) => candidate.id === intervalId)) {
      return unknownInterval(record, intervalId)
    }
    const result = duplicateShowLayoutInterval(record, intervalId, {
      withContent: Boolean(input.with_content),
    })
    if (result === record) {
      return refuseShowCommand({
        code: 'engine-refused',
        message:
          `duplicate_layout_interval: the engine declined to duplicate ${intervalId}; a multi-part ` +
          'clip may cross its boundary.',
      })
    }
    return {
      ok: true,
      record: monotonicRecord(record, result),
      changes: [{
        command: 'duplicate_layout_interval',
        targetId: intervalId,
        description:
          `Layout occurrence ${intervalId} duplicated after itself${input.with_content ? ' with its content' : ' empty'}.`,
      }],
    }
  },
}

const makeLayoutIntervalUnique: ShowCommandDescriptor = {
  name: 'make_layout_interval_unique',
  description:
    'Give one Zone Layout occurrence its own copy of the layout and its Zone identities (new Zones ' +
    'are minted for the copy), so editing them no longer affects the other occurrences that shared ' +
    'the layout.',
  touches: ['/routingLayouts', '/zones', '/composition/scenes/*/zones', '/cells', '/transitions', '/updatedAt'],
  fields: {
    interval_id: { kind: 'string', description: 'The Layout occurrence id (from the interval projection)' },
  },
  apply(record, input) {
    const intervalId = input.interval_id as string
    if (!projectShowLayoutIntervals(record).some((candidate) => candidate.id === intervalId)) {
      return unknownInterval(record, intervalId)
    }
    const result = makeShowLayoutIntervalUnique(record, intervalId)
    if (result === record) {
      return refuseShowCommand({
        code: 'engine-refused',
        message:
          `make_layout_interval_unique: the engine declined; ${intervalId} may already be the sole ` +
          'user of its layout, or a multi-part clip may cross its boundary.',
      })
    }
    return {
      ok: true,
      record: monotonicRecord(record, result),
      changes: [{
        command: 'make_layout_interval_unique',
        targetId: intervalId,
        description: `Layout occurrence ${intervalId} now uses its own copy of its layout.`,
      }],
    }
  },
}

export const SHOW_STRUCTURE_COMMANDS: ShowCommandDescriptor[] = [
  setOutputContract,
  setOutputTrails,
  addLayoutInterval,
  duplicateLayoutInterval,
  makeLayoutIntervalUnique,
]

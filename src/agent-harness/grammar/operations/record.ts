// Provenance: pxlblz-v3 src/grammar/operations/record.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Record and Zone metadata family (#28): the Show's own name, its stage map
// binding, and Zone metadata (name, nominal pixel count, color) through the
// vendored updateShowZone. These close the top honest coverage gaps outside
// Groups; Zone add/remove stay deliberate v2-editor work for now.
import { z } from 'zod'
import { updateShowZone } from '@/engine/showModel'
import type { ShowGrammarOperation } from '../registry.js'
import type { GrammarIssue, ShowGrammarDocument } from '../types.js'
import { refuse, replacedShow } from '../support.js'

function unknownZone(document: ShowGrammarDocument, zoneId: string): GrammarIssue {
  return {
    code: 'unknown-zone',
    message:
      `No Zone has id "${zoneId}". Known Zones: ${
        document.show.zones.map((zone) => `${zone.id} (${zone.name})`).join('; ')}.`,
    candidates: document.show.zones.map((zone) => zone.id),
  }
}

const renameShow: ShowGrammarOperation = {
  name: 'rename_show',
  description: 'Rename the Show. The name is display metadata; ids and content are unaffected.',
  mutates: ['/name'],
  inputShape: {
    name: z.string().describe('The new Show name; leading and trailing whitespace is trimmed'),
  },
  apply(document, args) {
    const name = (args.name as string).trim()
    if (name.length === 0) {
      return refuse({ code: 'invalid-argument', message: 'The Show name cannot be empty.' })
    }
    if (name === document.show.name) {
      return refuse({ code: 'no-change', message: `The Show is already named "${name}".` })
    }
    return {
      ok: true,
      document: replacedShow(document, { ...document.show, name }),
      changes: [{
        op: 'rename_show',
        targetId: document.show.id,
        description: `Show renamed from "${document.show.name}" to "${name}".`,
        before: document.show.name,
        after: name,
      }],
    }
  },
}

const setStageMap: ShowGrammarOperation = {
  name: 'set_stage_map',
  description:
    'Set or clear the Show’s stage map binding: the pixel map the editor stages the Show on ' +
    '(stage_map_id, null to clear) and optionally the controller profile the Show targets ' +
    '(target_controller_profile_id, null to clear). This is a staging preference; the output ' +
    'contract is separate (set_output_contract).',
  mutates: ['/stageMapId', '/targetControllerProfileId'],
  inputShape: {
    stage_map_id: z.string().nullable()
      .describe('Pixel map id to stage the Show on; null clears the binding'),
    target_controller_profile_id: z.string().nullable().optional()
      .describe('Controller profile id the Show targets; null clears it; omit to leave unchanged'),
  },
  apply(document, args) {
    const stageMapId = args.stage_map_id as string | null
    const profileGiven = 'target_controller_profile_id' in args &&
      args.target_controller_profile_id !== undefined
    const profileId = args.target_controller_profile_id as string | null | undefined
    const show = document.show
    const sameStageMap = (show.stageMapId ?? null) === stageMapId
    const sameProfile = !profileGiven || (show.targetControllerProfileId ?? null) === (profileId ?? null)
    if (sameStageMap && sameProfile) {
      return refuse({
        code: 'no-change',
        message: 'The Show already has exactly this stage map binding.',
      })
    }
    const next = { ...show, stageMapId }
    if (profileGiven) {
      if (profileId === null) delete next.targetControllerProfileId
      else next.targetControllerProfileId = profileId
    }
    const parts = [
      `stage map ${stageMapId === null ? 'cleared' : `set to ${stageMapId}`}`,
      ...(profileGiven
        ? [`controller profile ${profileId === null ? 'cleared' : `set to ${profileId}`}`]
        : []),
    ]
    return {
      ok: true,
      document: replacedShow(document, next),
      changes: [{
        op: 'set_stage_map',
        targetId: show.id,
        description: `Show ${parts.join('; ')}.`,
        before: { stageMapId: show.stageMapId ?? null, targetControllerProfileId: show.targetControllerProfileId },
        after: { stageMapId, targetControllerProfileId: next.targetControllerProfileId },
      }],
    }
  },
}

const updateZone: ShowGrammarOperation = {
  name: 'update_zone',
  description:
    'Update a Zone’s metadata: name, nominal pixel count (the Zone’s notional resolution, clamped to a ' +
    'positive integer), or display color. Give at least one field. Zone identity, routing, and clips ' +
    'are unaffected.',
  mutates: ['/zones/*/name', '/zones/*/nominalPixelCount', '/zones/*/color', '/updatedAt'],
  inputShape: {
    zone_id: z.string().describe('The Zone id'),
    name: z.string().optional().describe('New Zone name; must not collide with another Zone'),
    nominal_pixel_count: z.number().positive().optional()
      .describe('New nominal pixel count; rounded to a positive integer'),
    color: z.string().optional().describe('New display color (a CSS color, typically #rrggbb)'),
  },
  apply(document, args) {
    const zoneId = args.zone_id as string
    const zone = document.show.zones.find((candidate) => candidate.id === zoneId)
    if (!zone) return refuse(unknownZone(document, zoneId))

    const name = (args.name as string | undefined)?.trim()
    const pixelCount = args.nominal_pixel_count as number | undefined
    const color = args.color as string | undefined
    if (name === undefined && pixelCount === undefined && color === undefined) {
      return refuse({
        code: 'invalid-argument',
        message: 'Give at least one of name, nominal_pixel_count, or color.',
      })
    }
    if (name !== undefined && name.length === 0) {
      return refuse({ code: 'invalid-argument', message: 'The Zone name cannot be empty.' })
    }
    const collision = name !== undefined &&
      document.show.zones.find((candidate) => candidate.id !== zoneId && candidate.name === name)
    if (collision) {
      return refuse({
        code: 'duplicate-name',
        message: `Another Zone (${collision.id}) is already named "${name}".`,
        remedy: 'Choose a distinct name, or rename that Zone first.',
      })
    }
    const roundedCount = pixelCount === undefined ? undefined : Math.max(1, Math.round(pixelCount))
    const sameName = name === undefined || name === zone.name
    const sameCount = roundedCount === undefined || roundedCount === zone.nominalPixelCount
    const sameColor = color === undefined || color === zone.color
    if (sameName && sameCount && sameColor) {
      return refuse({
        code: 'no-change',
        message: `Zone ${zone.id} (${zone.name}) already has exactly these values.`,
      })
    }
    const result = updateShowZone(document.show, zoneId, {
      ...(name !== undefined ? { name } : {}),
      ...(roundedCount !== undefined ? { nominalPixelCount: roundedCount } : {}),
      ...(color !== undefined ? { color } : {}),
    })
    const parts = [
      ...(name !== undefined && name !== zone.name ? [`renamed "${zone.name}" → "${name}"`] : []),
      ...(roundedCount !== undefined && roundedCount !== zone.nominalPixelCount
        ? [`nominal pixel count ${zone.nominalPixelCount} → ${roundedCount}`]
        : []),
      ...(color !== undefined && color !== zone.color ? [`color set to ${color}`] : []),
    ]
    return {
      ok: true,
      document: replacedShow(document, result),
      changes: [{
        op: 'update_zone',
        targetId: zoneId,
        description: `Zone ${zoneId}: ${parts.join('; ')}.`,
        before: zone,
        after: result.zones.find((candidate) => candidate.id === zoneId),
      }],
    }
  },
}

export const RECORD_OPERATIONS: ShowGrammarOperation[] = [
  renameShow,
  setStageMap,
  updateZone,
]

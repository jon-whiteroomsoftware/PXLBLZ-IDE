// Provenance: pxlblz-v3 record operation surface; canonical owners now supply schemas and behavior (#954).
import { SHOW_STRUCTURE_COMMANDS } from '@/engine/showCommands/structure'
import { descriptorOperation } from './descriptorAdapter.js'

const commands = SHOW_STRUCTURE_COMMANDS.filter(command =>
  ['rename_show', 'set_stage_map', 'update_zone', 'set_target_controller_profile'].includes(command.name))
const profile = commands.find(command => command.name === 'set_target_controller_profile')!
const profileOperation = descriptorOperation(profile)

export const RECORD_OPERATIONS = commands.map(command => {
  const operation = descriptorOperation(command)
  if (command.name !== 'set_stage_map') return operation
  const compatibility = descriptorOperation({
    ...command,
    fields: {
      ...command.fields,
      target_controller_profile_id: { ...profile.fields.profile_id, optional: true },
    },
    touches: [...new Set([...command.touches, ...profile.touches])],
  })
  return {
    ...compatibility,
    // Experimental combined spelling only: evaluate both immutable owners before
    // returning a candidate. A refused profile discards the provisional map edit.
    apply(document: Parameters<typeof operation.apply>[0], args: Record<string, unknown>) {
      const map = operation.apply(document, { stage_map_id: args.stage_map_id })
      if (!map.ok || args.target_controller_profile_id === undefined) return map
      const target = profileOperation.apply(map.document, { profile_id: args.target_controller_profile_id })
      return target.ok ? { ...target, changes: [...map.changes, ...target.changes] } : target
    },
  }
})

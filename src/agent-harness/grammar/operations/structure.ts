// Provenance: pxlblz-v3 structural operation surface; canonical owners now supply schemas and behavior (#954).
import { SHOW_STRUCTURE_COMMANDS } from '@/engine/showCommands/structure'
import { descriptorOperation } from './descriptorAdapter.js'

export const STRUCTURE_OPERATIONS = SHOW_STRUCTURE_COMMANDS
  .filter(command => !['rename_show', 'set_stage_map', 'update_zone', 'set_target_controller_profile'].includes(command.name))
  .map(command => descriptorOperation(command))

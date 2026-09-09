// Provenance: pxlblz-v3 junction tools at 9ecd481f; canonical names and owners migrated in #952.
import { SHOW_JUNCTION_COMMANDS } from '@/engine/showCommands/junctions'
import { descriptorOperation } from './descriptorAdapter.js'

export const JUNCTION_OPERATIONS = SHOW_JUNCTION_COMMANDS.map(command => descriptorOperation(command))

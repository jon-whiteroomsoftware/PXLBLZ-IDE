// Provenance: pxlblz-v3 effects operations at 9ecd481f; canonicalized in #953.
import { SHOW_EFFECT_COMMANDS } from '@/engine/showCommands/effects'
import { descriptorOperation } from './descriptorAdapter'
export { SHOW_CLIP_EFFECT_KINDS } from '@/engine/showCommands/effects'
export const EFFECT_OPERATIONS = SHOW_EFFECT_COMMANDS.map(command => descriptorOperation(command))

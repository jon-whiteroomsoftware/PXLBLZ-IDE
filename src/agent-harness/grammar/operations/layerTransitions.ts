// Provenance: pxlblz-v3 layerTransitions.ts at 9ecd481f; canonical delegation for #952.
import { SHOW_LAYER_TRANSITION_COMMANDS, insertLayerTransitionCommandOutcome } from '@/engine/showCommands/layerTransitions'
import { idFactory } from '../support.js'
import { descriptorOperation } from './descriptorAdapter.js'

export const LAYER_TRANSITION_OPERATIONS = [
  ...SHOW_LAYER_TRANSITION_COMMANDS.map(command => descriptorOperation(command,
    command.name === 'insert_layer_transition'
      ? (document, args) => insertLayerTransitionCommandOutcome(document.show, args, () => idFactory(document)('transition'))
      : undefined)),
]

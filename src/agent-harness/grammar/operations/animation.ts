// Provenance: pxlblz-v3 animation.ts at 9ecd481f; canonical delegation for #953.
import { descriptorOperation } from './descriptorAdapter.js'
import { SHOW_ANIMATION_COMMANDS, addPropertyTrackCommandOutcome, addKeyframeCommandOutcome } from '@/engine/showCommands/animation'
import { capturedShowCommandContext } from '../../shows/evaluate.js'
import { idFactory } from '../support.js'

export const ANIMATION_OPERATIONS = SHOW_ANIMATION_COMMANDS.map(command => descriptorOperation(command,
  command.name === 'add_property_track'
    ? (document, args) => addPropertyTrackCommandOutcome(document.show, args, capturedShowCommandContext(document.inlinePatterns, document.options), idFactory(document))
    : command.name === 'add_keyframe'
      ? (document, args) => addKeyframeCommandOutcome(document.show, args, () => idFactory(document)('kf'))
      : undefined))

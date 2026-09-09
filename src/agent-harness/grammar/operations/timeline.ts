// Provenance: pxlblz-v3 timeline operation family; canonical descriptor migration #951.
import { SHOW_TIMELINE_COMMANDS, insertTimeCommandOutcome, markerCommandOutcome } from '@/engine/showCommands/timeline'
import type { ShowGrammarOperation } from '../registry.js'
import { idFactory } from '../support.js'
import { descriptorOperation } from './descriptorAdapter.js'

export const TIMELINE_OPERATIONS: ShowGrammarOperation[] = SHOW_TIMELINE_COMMANDS.map(descriptor => descriptorOperation(descriptor, (document, args) => {
  const newId = idFactory(document)
  if (descriptor.name === 'insert_time') return insertTimeCommandOutcome(document.show, args, () => newId('clip'))
  if (descriptor.name.endsWith('_marker')) return markerCommandOutcome(document.show, descriptor.name, args, () => newId('marker'))
  return descriptor.apply(document.show, args)
}))

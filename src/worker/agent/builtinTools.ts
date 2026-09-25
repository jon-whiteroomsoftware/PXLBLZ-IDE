import { z } from 'zod'
import { zodRealtimeFunction } from 'openai/helpers/zod'
import { SHOW_COMMANDS_V2 } from '../../engine/showCommandsV2/registry'
import { showCommandV2InputShape } from '../../engine/showCommandsV2/descriptorSchema'

function tool(name: string, description: string, parameters: z.ZodObject<z.ZodRawShape>) {
  // This public SDK converter preserves optional fields. Responses strict mode
  // would normalize them to required, changing the canonical command contract.
  const schema = zodRealtimeFunction({ name, description, parameters })
  return { type: 'function' as const, name, description, parameters: schema.parameters as Record<string, unknown>, strict: false as const }
}

const finishTurn = tool('finish_turn', 'Finish this turn explicitly. Apply requests adoption of the private edits; ask, refuse and incomplete discard them. The editor alone determines whether adoption and saving succeed.', z.object({
  outcome: z.enum(['apply', 'ask', 'refuse', 'incomplete']),
  message: z.string().max(4000),
}).strict())

export type BuiltinToolset = typeof builtinTools

/**
 * The tools a built-in turn may call: the v2 command catalogue plus the explicit
 * typed finish decision (#1042). The catalogue and the private executor read the
 * same record, so a turn is never offered a command its own candidate refuses.
 */
export const builtinTools = [
  ...SHOW_COMMANDS_V2.map(descriptor => tool(descriptor.name, descriptor.description, z.object(showCommandV2InputShape(descriptor)).strict())),
  finishTurn,
]

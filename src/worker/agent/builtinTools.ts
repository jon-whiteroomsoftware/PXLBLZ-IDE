import { z } from 'zod'
import { zodRealtimeFunction } from 'openai/helpers/zod'
import { SHOW_COMMANDS } from '../../engine/showCommands/registry'
import { showCommandInputShape } from '../../engine/showCommands/descriptorSchema'

function tool(name: string, description: string, parameters: z.ZodObject<z.ZodRawShape>) {
  // This public SDK converter preserves optional fields. Responses strict mode
  // would normalize them to required, changing the canonical command contract.
  const schema = zodRealtimeFunction({ name, description, parameters })
  return { type: 'function' as const, name, description, parameters: schema.parameters as Record<string, unknown>, strict: false as const }
}
export const builtinTools = [
  ...SHOW_COMMANDS.map(descriptor => tool(descriptor.name, descriptor.description, z.object(showCommandInputShape(descriptor)).strict())),
  tool('finish_turn', 'Finish this turn explicitly. Apply requests adoption of the private edits; ask, refuse and incomplete discard them. The editor alone determines whether adoption and saving succeed.', z.object({
    outcome: z.enum(['apply', 'ask', 'refuse', 'incomplete']),
    message: z.string().max(4000),
  }).strict()),
]

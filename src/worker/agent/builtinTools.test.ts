import { expect, it } from 'vitest'
import { SHOW_COMMANDS } from '../../engine/showCommands/registry'
import { builtinTools } from './builtinTools'
it('exposes every canonical command with its exact fields and optionality', () => {
  for (const descriptor of SHOW_COMMANDS) {
    const tool = builtinTools.find(tool => tool.name === descriptor.name)!
    expect(tool.type).toBe('function')
    expect(tool.strict).toBe(false)
    expect(Object.keys(tool.parameters.properties as object).sort()).toEqual(Object.keys(descriptor.fields).sort())
    expect([...(tool.parameters.required as string[] ?? [])].sort()).toEqual(Object.entries(descriptor.fields).filter(([, field]) => !field.optional).map(([name]) => name).sort())
  }
  expect(new Set(builtinTools.map(tool => tool.name)).size).toBe(SHOW_COMMANDS.length + 1)
})
it('requires an explicit typed finish decision; prose cannot request adoption', () => {
  const finish = builtinTools.find(tool => tool.name === 'finish_turn')!
  expect(finish.parameters).toMatchObject({ type: 'object', required: ['outcome', 'message'], properties: { outcome: { enum: ['apply', 'ask', 'refuse', 'incomplete'] } }, additionalProperties: false })
})

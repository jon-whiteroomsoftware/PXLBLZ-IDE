import { describe, expect, it } from 'vitest'
import { buildShowToolkitPresentationCatalogue } from '../showVisualToolkitPresentation'
import { showCommandInputShape } from './descriptorSchema'
import { SHOW_COMMANDS } from './registry'
import {
  SHOW_AUTHORING_EXAMPLES,
  SHOW_AUTHORING_JSON_SCHEMA,
  SHOW_AUTHORING_REFERENCE_MARKDOWN,
} from './bulkAuthoringReference'
import { z } from 'zod'
import Ajv2020 from 'ajv/dist/2020.js'

describe('canonical bulk authoring schema and reference', () => {
  it('validates every published example through its actual command tool schema', () => {
    for (const [name, example] of Object.entries(SHOW_AUTHORING_EXAMPLES)) {
      const descriptor = SHOW_COMMANDS.find(command => command.name === name)!
      expect(z.object(showCommandInputShape(descriptor)).strict().safeParse(example).success, name).toBe(true)
    }
  })

  it('publishes all reusable definitions, exact batch bound, and all ordered Effect kinds', () => {
    expect(SHOW_AUTHORING_JSON_SCHEMA).toMatchObject({
      version: 1,
      maxBatchItems: 128,
      $defs: { ClipProperties: {}, ClipSpec: {}, LayerSpec: {}, ClipPatch: {}, create_clips: {}, create_layers: {}, update_clips: {} },
    })
    const text = JSON.stringify(SHOW_AUTHORING_JSON_SCHEMA)
    const effectKinds = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
      .filter(item => item.kind === 'effect' && item.authoringTarget === 'effect-stack')
      .map(item => item.variantId)
    expect(effectKinds).toHaveLength(22)
    for (const kind of effectKinds) expect(text).toContain(`"${kind}"`)
    for (const term of ['global milliseconds', 'Nested objects patch', 'Effects replace', 'shared', 'atomic', 'No other field accepts null']) {
      expect(SHOW_AUTHORING_REFERENCE_MARKDOWN).toContain(term)
    }
  })

  it('publishes valid JSON Schema 2020-12 with the runtime safe-integer bounds', () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true })
    expect(ajv.validateSchema(SHOW_AUTHORING_JSON_SCHEMA), JSON.stringify(ajv.errors)).toBe(true)
    expect(SHOW_AUTHORING_JSON_SCHEMA.examples).toBeInstanceOf(Array)
    expect(SHOW_AUTHORING_JSON_SCHEMA.$defs.ClipSpec).toMatchObject({
      properties: {
        start_ms: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
        layer: { oneOf: [{ const: 'main' }, { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }] },
      },
    })
  })
})

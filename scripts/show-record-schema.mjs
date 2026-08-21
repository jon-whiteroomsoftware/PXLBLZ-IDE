#!/usr/bin/env node
// Regenerate schemas/show-record.schema.json from the ShowRecord type. The
// drift test rebuilds and diffs against the artifact, so the schema cannot
// silently diverge from src/engine/personalContentRecords.ts.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGenerator } from 'ts-json-schema-generator'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const schemaArtifactPath = join(repoRoot, 'schemas', 'show-record.schema.json')

export function buildShowRecordSchema() {
  const generator = createGenerator({
    tsconfig: join(repoRoot, 'tsconfig.json'),
    path: join(repoRoot, 'src', 'engine', 'personalContentRecords.ts'),
    type: 'ShowRecord',
    additionalProperties: false,
    // The repository typechecks through its own gate; rechecking here would
    // only slow generation down.
    skipTypeCheck: true,
    sortProps: true,
  })
  return generator.createSchema('ShowRecord')
}

export function renderShowRecordSchema() {
  return `${JSON.stringify(buildShowRecordSchema(), null, 2)}\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(dirname(schemaArtifactPath), { recursive: true })
  writeFileSync(schemaArtifactPath, renderShowRecordSchema())
  console.log(`wrote ${relative(repoRoot, schemaArtifactPath)}`)
}

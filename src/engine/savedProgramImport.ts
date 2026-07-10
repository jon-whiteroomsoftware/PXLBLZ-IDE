import type { PatternRecord } from './personalContentRecords'
import type { RecoveredSavedProgram } from './controllerSavedProgramRead'
import { uniquePatternName } from './patternName'

export interface SavedProgramStudioPattern {
  id: string
  routeId?: string
  name: string
}

export type SavedProgramFieldSource = 'recovered' | 'inferred' | 'new'

export type SavedProgramImportDecision =
  | { kind: 'open-existing'; patternId: string; name: string }
  | {
      kind: 'create'
      ownership: 'ide-owned' | 'foreign'
      patternId: string | null
      name: string
      sourceCode: string
      fieldSources: {
        id: SavedProgramFieldSource
        name: SavedProgramFieldSource
        source: SavedProgramFieldSource
      }
    }
  | { kind: 'unavailable'; name: string; reason: string }

export function decideSavedProgramImport(input: {
  recovered: RecoveredSavedProgram
  studioPatterns: readonly SavedProgramStudioPattern[]
}): SavedProgramImportDecision {
  const stamp = input.recovered.stamp
  if (stamp?.kind === 'pattern') {
    const existing = input.studioPatterns.find((pattern) => pattern.id === stamp.id)
    if (existing) {
      return {
        kind: 'open-existing',
        patternId: existing.routeId ?? existing.id,
        name: existing.name,
      }
    }
    if (!input.recovered.sourceCode) {
      return {
        kind: 'unavailable',
        name: stamp.name?.trim() || input.recovered.deviceName,
        reason: 'This saved program has no source code to restore.',
      }
    }
    const recoveredName = stamp.name?.trim() || input.recovered.deviceName.trim()
    const baseName = recoveredName || 'Recovered pattern'
    const name = uniquePatternName(baseName, input.studioPatterns.map((pattern) => pattern.name))
    return {
      kind: 'create',
      ownership: 'ide-owned',
      patternId: stamp.id,
      name,
      sourceCode: input.recovered.sourceCode,
      fieldSources: {
        id: 'recovered',
        name: name === recoveredName ? 'recovered' : 'inferred',
        source: 'recovered',
      },
    }
  }
  if (stamp?.kind === 'show') {
    return {
      kind: 'unavailable',
      name: stamp.name?.trim() || input.recovered.deviceName,
      reason: 'This saved artifact is a Show, not a Pattern.',
    }
  }
  if (!input.recovered.sourceCode) {
    return {
      kind: 'unavailable',
      name: input.recovered.deviceName,
      reason: 'This saved program has no source code to import.',
    }
  }
  const recoveredName = input.recovered.deviceName.trim()
  const baseName = recoveredName || 'Imported pattern'
  const name = uniquePatternName(baseName, input.studioPatterns.map((pattern) => pattern.name))
  return {
    kind: 'create',
    ownership: 'foreign',
    patternId: null,
    name,
    sourceCode: input.recovered.sourceCode,
    fieldSources: {
      id: 'new',
      name: name === recoveredName ? 'recovered' : 'inferred',
      source: 'recovered',
    },
  }
}

export function createSavedProgramPatternRecord(
  decision: Extract<SavedProgramImportDecision, { kind: 'create' }>,
  newId: string,
  now: number,
): PatternRecord {
  return {
    id: decision.patternId ?? newId,
    name: decision.name,
    src: decision.sourceCode,
    controls: {},
    updatedAt: now,
  }
}

// Whole-Pattern Restart slot qualification for issue #546.
// Run with: npm run issue546

import * as acorn from 'acorn'
import { performance } from 'node:perf_hooks'
import { createFastReplayRuntime } from '../../src/engine/fastReplay'
import { nativeDimension } from '../../src/engine/loadPattern'
import type { ShowRecord } from '../../src/engine/personalContentRecords'
import type { GeneratedShowArtifact } from '../../src/engine/showCompiler'
import { compileShowForArtifact } from '../../src/engine/showPreviewArtifact'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'

export type Issue546FixtureId =
  | 'stock-show-reference-property-animation'
  | 'stock-show-205-installation-composition'

interface AstNode {
  type: string
  start: number
  end: number
  body?: AstNode[]
  declarations?: AstNode[]
  id?: AstNode
  name?: string
  expression?: AstNode
  callee?: AstNode
  [key: string]: unknown
}

function identifierName(node: AstNode | undefined): string | null {
  return node?.type === 'Identifier' && typeof node.name === 'string' ? node.name : null
}

function visitAst(node: AstNode, visit: (candidate: AstNode) => void): void {
  visit(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === 'object' && 'type' in child) visitAst(child as AstNode, visit)
      }
    } else if (value && typeof value === 'object' && 'type' in value) {
      visitAst(value as AstNode, visit)
    }
  }
}

/**
 * Hardware-diagnosis source only. Keeps the physical member remap produced by
 * #546 while removing every state bank, reset helper, and boundary owner call.
 * This deliberately does not preserve Show output; it isolates activation.
 */
export function stripPatternSlotRuntimeForDiagnostic(source: string): string {
  const ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'module' }) as unknown as AstNode
  const removals = new Map<number, { start: number; end: number }>()
  const remove = (node: AstNode) => removals.set(node.start, { start: node.start, end: node.end })

  for (const statement of ast.body ?? []) {
    if (statement.type === 'VariableDeclaration') {
      const names = (statement.declarations ?? []).map((declaration) => identifierName(declaration.id))
      if (names.some((name) => name?.includes('_slot_'))) {
        if (!names.every((name) => name?.includes('_slot_'))) {
          throw new Error('Cannot remove a mixed slot/non-slot variable declaration safely')
        }
        remove(statement)
      }
      continue
    }
    if (statement.type === 'FunctionDeclaration') {
      const name = identifierName(statement.id)
      if (name?.endsWith('_switchOwner') || name?.endsWith('_resetPattern')) remove(statement)
    }
  }

  visitAst(ast, (node) => {
    if (node.type !== 'ExpressionStatement' || node.expression?.type !== 'CallExpression') return
    const callee = identifierName(node.expression.callee)
    if (callee?.endsWith('_switchOwner')) remove(node)
  })

  return [...removals.values()]
    .sort((left, right) => right.start - left.start)
    .reduce((result, removal) => result.slice(0, removal.start) + result.slice(removal.end), source)
}

const fixtureIds: Issue546FixtureId[] = [
  'stock-show-reference-property-animation',
  'stock-show-205-installation-composition',
]

function fixture(id: Issue546FixtureId): ShowRecord {
  const entry = STOCK_SHOWS.find((candidate) => candidate.id === id)
  if (!entry) throw new Error(`Issue #546 fixture is missing: ${id}`)
  return entry.show
}

export function issue546Artifact(
  id: Issue546FixtureId,
  patternSlotSharing: 'none' | 'force',
): GeneratedShowArtifact {
  const compiled = compileShowForArtifact(fixture(id), [], undefined, {}, {
    stageDimension: 2,
    patternSlotSharing,
  })
  if (!compiled.artifact) throw new Error(compiled.error ?? `Issue #546 fixture did not compile: ${id}`)
  return compiled.artifact
}

const mapPoints = Array.from({ length: 2_000 }, (_, index) => ({
  sample: [(index % 50) / 49, Math.floor(index / 50) / 39],
}))

function showDurationMs(show: ShowRecord): number {
  const transitions = new Map((show.transitions ?? []).map((transition) => [transition.afterSceneId, transition.durationMs]))
  return show.scenes.reduce((sum, scene) => sum + scene.durationMs + (transitions.get(scene.id) ?? 0), 0)
}

function percentile(sorted: number[], proportion: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * proportion))]
}

function local2000Timing(
  artifact: GeneratedShowArtifact,
  show: ShowRecord,
  fidelity: 'fast' | 'fidelity',
) {
  const replay = createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints, randomSeed: 546, fidelity })
  replay.advanceTo(showDurationMs(show) / 2, { stepMs: 250 })
  for (let index = 0; index < 4; index += 1) replay.advanceLive(1000 / 60)
  const samples: number[] = []
  for (let index = 0; index < 24; index += 1) {
    const started = performance.now()
    replay.advanceLive(1000 / 60)
    samples.push(performance.now() - started)
  }
  const sorted = [...samples].sort((left, right) => left - right)
  return {
    meanFrameMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    medianFrameMs: percentile(sorted, 0.5),
    p90FrameMs: percentile(sorted, 0.9),
  }
}

function representation(artifact: GeneratedShowArtifact, show: ShowRecord) {
  const resources = artifact.summary.resources
  return {
    sourceBytes: artifact.summary.artifactBytes,
    expandedSourceBytes: artifact.summary.expandedArtifactBytes,
    physicalMachines: artifact.summary.clipCount,
    auxiliaryCacheWords: resources.auxiliaryCacheWords,
    totalVmWords: resources.totalWords,
    persistentGlobals: resources.persistentGlobals,
    remainingArtifactBytes: resources.remainingArtifactBytes,
    patternSlots: artifact.summary.specializations.patternSlots,
    local2000: {
      fast: local2000Timing(artifact, show, 'fast'),
      precise: local2000Timing(artifact, show, 'fidelity'),
    },
  }
}

export const issue546Artifacts = Object.fromEntries(fixtureIds.map((id) => [id, {
  baseline: issue546Artifact(id, 'none'),
  selected: issue546Artifact(id, 'force'),
}])) as Record<Issue546FixtureId, { baseline: GeneratedShowArtifact; selected: GeneratedShowArtifact }>

export const issue546Report = {
  pixelCount: 2_000,
  fixtures: fixtureIds.map((id) => {
    const show = fixture(id)
    const artifacts = issue546Artifacts[id]
    return {
      id,
      baseline: representation(artifacts.baseline, show),
      selected: representation(artifacts.selected, show),
      sourceChangePercent: (artifacts.selected.summary.artifactBytes / artifacts.baseline.summary.artifactBytes - 1) * 100,
    }
  }),
}

if (process.env.ISSUE546_REPORT || !process.env.VITEST) console.log(JSON.stringify(issue546Report, null, 2))

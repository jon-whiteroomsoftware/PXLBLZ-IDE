// Table-driven Show score census for issue #542.
// Run with: npm run issue542

import { compileShowForArtifact } from '../../src/engine/showPreviewArtifact'
import { compilerVintageOptions } from '../../src/engine/showCompilerVintages'
import type { GeneratedShowArtifact } from '../../src/engine/showCompiler'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'

export const ISSUE542_REFERENCE_IDS = [
  'stock-show-reference-wipe-mix-transitions',
  'stock-show-reference-shape-reveal-transitions',
  'stock-show-reference-easing',
  'stock-show-reference-motion-transitions',
] as const

export type Issue542ReferenceId = typeof ISSUE542_REFERENCE_IDS[number]

export function issue542ReferenceShow(id: Issue542ReferenceId) {
  const fixture = STOCK_SHOWS.find((candidate) => candidate.id === id)
  if (!fixture) throw new Error(`Issue #542 reference Show is missing: ${id}`)
  return fixture.show
}

function legacyUnsharedCounterfactual(id: Issue542ReferenceId) {
  const show = structuredClone(issue542ReferenceShow(id))
  if (id === 'stock-show-reference-motion-transitions') return show
  const composition = show.composition
  if (!composition || composition.patternInstances.length > 3) return show
  const instanceById = new Map(composition.patternInstances.map((instance) => [instance.id, instance]))
  const backdrop = instanceById.get('instance-reference-backdrop')
  if (!backdrop) throw new Error(`Issue #542 counterfactual lost the shared backdrop: ${id}`)
  const patternInstances = [backdrop]
  composition.scenes.forEach((scene, index) => {
    const placement = scene.zones[0]?.overlays[0]?.placements[0]
    const shared = placement ? instanceById.get(placement.instanceId) : undefined
    if (!placement || !shared) throw new Error(`Issue #542 counterfactual lost Scene content ${index}: ${id}`)
    const instanceId = `instance-reference-content-${index + 1}`
    patternInstances.push({ ...shared, id: instanceId })
    placement.instanceId = instanceId
  })
  composition.patternInstances = patternInstances
  return show
}

function census(id: Issue542ReferenceId, show = issue542ReferenceShow(id)) {
  const compiled = compileShowForArtifact(show, [], undefined, {}, {
    stageDimension: 2,
    patternSlotSharing: 'none',
    ...compilerVintageOptions('issue-542-score-census'),
  })
  if (!compiled.artifact) throw new Error(compiled.error ?? `Issue #542 reference did not compile: ${id}`)
  const { summary } = compiled.artifact
  return {
    id,
    authoredJsonBytes: new TextEncoder().encode(JSON.stringify(show)).length,
    generatedSourceBytes: summary.artifactBytes,
    expandedSourceBytes: summary.expandedArtifactBytes,
    patternInstanceCount: show.composition?.patternInstances.length ?? summary.clipCount,
    compiledClipCount: summary.clipCount,
    sceneCount: show.scenes.length,
    transitionCount: show.transitions?.length ?? 0,
    persistentGlobals: summary.resources.persistentGlobals,
    vmWords: summary.resources.totalWords,
    planWords: summary.resources.planWords,
    showScore: summary.specializations.showScore,
    motionTransitions: summary.specializations.motionTransitions,
  }
}

export function issue542Artifact(
  id: Issue542ReferenceId,
  showScoreSharing: 'none' | 'force',
): GeneratedShowArtifact {
  const compiled = compileShowForArtifact(issue542ReferenceShow(id), [], undefined, {}, {
    stageDimension: 2,
    showScoreSharing,
    patternSlotSharing: 'none',
    ...compilerVintageOptions('issue-542-score-census'),
  })
  if (!compiled.artifact) throw new Error(compiled.error ?? `Issue #542 reference did not compile: ${id}`)
  return compiled.artifact
}

export const issue542Census = ISSUE542_REFERENCE_IDS.map((id) => ({
  id,
  baseline: census(id, legacyUnsharedCounterfactual(id)),
  production: census(id),
}))

if (process.env.ISSUE542_REPORT || !process.env.VITEST) {
  console.log(JSON.stringify(issue542Census, null, 2))
}

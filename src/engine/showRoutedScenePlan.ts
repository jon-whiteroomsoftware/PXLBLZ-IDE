// #570: routed Scene sequence planning - the resolved, time-addressed facts
// the schedulers and render emitters consume. Planning here is data only:
// members are attached for downstream use but never invoked, and no
// generated source is built in this module.
//
// Known non-duplicate: the table-driven Show score builds its own segment
// walk (scoreTransitionSegments) because it materializes default cut
// transitions that this timeline deliberately omits; unifying them changes
// emitted bytes and belongs to a later, separately verified step.
import type {
  ShowRoutedSceneSequenceSceneRecipe,
  ShowSceneSequenceTransitionRecipe,
} from './showCompiler'

export interface RoutedSceneSegment {
  kind: 'hold' | 'transition'
  startMs: number
  endMs: number
  sceneIndex: number
  transition?: ShowSceneSequenceTransitionRecipe
}

export interface RoutedScenePlan<Scene> {
  scenes: Scene[]
  segments: RoutedSceneSegment[]
  sceneStartMs: Map<number, number>
  /** The Show clock's loop length: holds plus non-cut transition time. */
  totalMs: number
}

/**
 * Resolve the recipe's scenes against the compiled member list and lay the
 * hold/transition segments on the Show clock. Cut transitions occupy no
 * time and produce no segment; a scene's start is the cursor before its
 * hold. The scene resolution callback keeps placement enrichment (consumer
 * ids, Pattern-slot owners) with the caller - this module owns time, not
 * placement semantics.
 */
export function planRoutedSceneSequence<Scene extends { holdMs: number; transitionOut?: ShowSceneSequenceTransitionRecipe }>(
  recipeScenes: ShowRoutedSceneSequenceSceneRecipe[],
  resolveScene: (scene: ShowRoutedSceneSequenceSceneRecipe, sceneIndex: number) => Scene,
): RoutedScenePlan<Scene> {
  const scenes = recipeScenes.map((scene, sceneIndex) => resolveScene(scene, sceneIndex))
  const segments: RoutedSceneSegment[] = []
  const sceneStartMs = new Map<number, number>()
  let cursor = 0
  scenes.forEach((scene, sceneIndex) => {
    const startMs = cursor
    sceneStartMs.set(sceneIndex, startMs)
    cursor += scene.holdMs
    segments.push({ kind: 'hold', startMs, endMs: cursor, sceneIndex })
    if (scene.transitionOut && scene.transitionOut.kind !== 'cut') {
      const transitionStart = cursor
      cursor += scene.transitionOut.durationMs
      segments.push({
        kind: 'transition',
        startMs: transitionStart,
        endMs: cursor,
        sceneIndex,
        transition: scene.transitionOut,
      })
    }
  })
  return { scenes, segments, sceneStartMs, totalMs: cursor }
}

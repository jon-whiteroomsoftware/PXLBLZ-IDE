// Qualification fixture for the #546 Pattern lifetime slot planner.
//
// The planner's stock evidence used to be the Property Animation reference,
// which authored a fresh Pattern-instance pair per passage. The 2026-08-02
// showcase rebuild consolidated that fixture to shared voices because the
// #514/#536 censuses priced the per-scene pairs over the 256-persistent-
// global limit and the activation source ceiling - which is precisely the
// pressure #546's slot planner exists to relieve. To keep the planner
// qualified against a realistic Show rather than only synthetic candidates,
// this fixture re-expands the shipping reference into its pre-consolidation
// shape: every placement gets a scene-local clone of its Pattern instance,
// and instance-targeted Property tracks follow their clones.
import type { ShowRecord } from './personalContentRecords'
import { STOCK_SHOWS } from '../pixelblaze/stock/shows'

export function createPropertySlotQualificationShow(): ShowRecord {
  const stock = STOCK_SHOWS.find((entry) => entry.id === 'stock-show-reference-property-animation')
  if (!stock) throw new Error('Property Animation reference Show is missing.')
  const show = structuredClone(stock.show)
  const composition = show.composition
  if (!composition) throw new Error('Property Animation reference has no composition.')

  const baseById = new Map(composition.patternInstances.map((instance) => [instance.id, instance]))
  const expanded: typeof composition.patternInstances = []
  const cloneFor = (sceneId: string, instanceId: string): string => {
    const cloneId = `${instanceId}--${sceneId}`
    if (!expanded.some((instance) => instance.id === cloneId)) {
      const base = baseById.get(instanceId)
      if (!base) throw new Error(`Unknown Pattern instance ${instanceId}.`)
      expanded.push({ ...structuredClone(base), id: cloneId })
    }
    return cloneId
  }

  for (const scene of composition.scenes) {
    for (const zone of scene.zones) {
      for (const entry of [...zone.main, ...zone.overlays.flatMap((layer) => layer.placements)]) {
        entry.instanceId = cloneFor(scene.sceneId, entry.instanceId)
      }
    }
    for (const track of scene.propertyTracks ?? []) {
      if ('instanceId' in track.target) {
        track.target = { ...track.target, instanceId: cloneFor(scene.sceneId, track.target.instanceId) }
      }
    }
  }
  // The shipping fixture gives both shared voices a control target so the
  // columns render as identical twins. Per-scene clones only keep controls
  // where a track actually drives them, matching the pre-consolidation
  // design: a control target is a claim of live dependence, and the planner
  // rightly refuses to merge live-controlled machines.
  const controlledCloneIds = new Set(composition.scenes.flatMap((scene) => (
    (scene.propertyTracks ?? []).flatMap((track) => (
      track.target.kind === 'instance-control' ? [track.target.instanceId] : []
    ))
  )))
  for (const instance of expanded) {
    if (!controlledCloneIds.has(instance.id)) delete instance.controlTargets
  }
  composition.patternInstances = expanded
  // The shipping reference opts into the deterministic loop so its
  // scene-local twins reset on wrap; this fixture preserves the compile
  // boundary the #546 exchange was measured under, which predates that
  // opt-in.
  delete composition.executionModel
  // The shipping reference now carries two live-live Crossfade boundaries so
  // its boundary-owned Property transitions actually run (#823). The #546
  // exchange was measured under the earlier all-Cut boundary shape, where
  // arms never overlap and machines interleave; preserve that subject here.
  show.transitions = (show.transitions ?? []).map((transition) => (
    transition.kind === 'crossfade'
      ? { id: transition.id, afterSceneId: transition.afterSceneId, kind: 'cut' as const, durationMs: 0, easing: transition.easing }
      : transition
  ))
  return show
}

// #570: the placement binding policy - one module answering "who writes this
// Pattern instance's per-frame values: the Scene scheduler's setup entry, or
// the per-pixel arm?" Both of the wave-3 program's shipped bugs (the #562
// transition-pair mirror divergence and the #558 stale-coefficient ordering
// near-miss) lived in the previous arrangement, where these rules were four
// scattered member-flag mutations honored at five emission sites.
//
// The policy is planned once per compile, after Pattern-slot sharing settles
// the final member list, and attached to each member as one frozen object.
// Emission sites read it; nothing else writes it.
import { controllerZonePixelCount } from './controllerProfile'
import type {
  ShowRoutedSceneSequenceSceneRecipe,
  ShowRoutingLayoutRecipe,
} from './showCompiler'

export interface MemberBindingPolicy {
  /** #558: per-frame color-effect coefficient refresh serves this member
   * (false when a scene places it more than once - divergent params). */
  colorCoefficientHoisting: boolean
  /** #562: the branch-free mirror coefficient form is exact for this member
   * (single placement, physical layouts, no mirror/zone divergence across
   * any non-cut transition pair). */
  uniformMirrorBinding: boolean
  /** #571: the scheduler setup entry is the proven single per-frame writer
   * of adaptation values, effect parameters, and placement track values. */
  uniformPrologueBinding: boolean
  /** #561: the member's virtual pixel count is one value across every arm
   * that can invoke it, so per-pixel pixelCount writes are redundant. */
  uniformPixelCountBinding: boolean
  /** #559: option carrier for the per-member HSV conversion. */
  hsvCaptureSpecialization: boolean
  /** #904: option carrier for the identity-blend fold (direct assignment for
   * statically opaque, unmasked, keyless stack placements). */
  identityBlendFold: boolean
  /** #905: option carrier for per-pixel dedupe (same-domain transition
   * decode sharing, wrapper copy propagation). */
  perPixelDedup: boolean
  /** #559: the whole recipe proves phase adaptation is identically zero, so
   * the per-pixel `+ adapt_phase` add strips. */
  phaseAdaptationIdentity: boolean
}

export interface MemberBindingPolicyOptions {
  colorCoefficientHoisting?: boolean
  capturePrologueSimplification?: boolean
  placementPrologueHoisting?: boolean
  pixelCountWriteHoisting?: boolean
  hsvCaptureChainSpecialization?: boolean
  identityBlendFold?: boolean
  perPixelDedup?: boolean
}

/** The per-member facts the policy needs that only the compiled member
 * knows. Gather them after Pattern-slot sharing settles the member list. */
export interface BindingPolicyMemberFacts {
  id: string
  adaptationPhase: number
  slotOwnerPhases: number[]
}

/** The recipe-side facts. `resolvedRouteCounts` carries route-mode and
 * resolved-layout pixel counts so the policy never sees compiled members. */
export interface BindingPolicyInputs {
  scenes: ShowRoutedSceneSequenceSceneRecipe[]
  routingLayouts: ShowRoutingLayoutRecipe[]
  adaptationRampPhases: { from: number; to: number } | null
  routeMode: boolean
  resolvedRouteCounts: Array<{ memberId: string; pixelCount: number }>
}

export function planMemberBindingPolicies(
  memberFacts: BindingPolicyMemberFacts[],
  inputs: BindingPolicyInputs,
  options: MemberBindingPolicyOptions = {},
): Map<string, MemberBindingPolicy> {
  const { scenes, routingLayouts } = inputs

  // #558: members placed more than once in a scene keep per-pixel coefficient
  // computation - a single per-frame refresh cannot serve divergent params.
  const multiPlacementClipIds = new Set<string>()
  for (const scene of scenes) {
    const counts = new Map<string, number>()
    for (const placement of scene.placements) {
      counts.set(placement.clipId, (counts.get(placement.clipId) ?? 0) + 1)
    }
    for (const [clipId, count] of counts) {
      if (count > 1) multiPlacementClipIds.add(clipId)
    }
  }

  // #562: branch-free mirror coefficients need a per-frame-uniform binding.
  // Route-mode recipes rebind per-route pixel counts and logical layouts
  // rebind at runtime, so both keep the branch form conservatively.
  const hasLogicalLayouts = routingLayouts.some((layout) => layout.logical)
  const nonUniformClipIds = new Set<string>(multiPlacementClipIds)
  for (const scene of scenes) {
    for (const placement of scene.placements) {
      if (placement.zoneMode || placement.domainZoneNames?.length) nonUniformClipIds.add(placement.clipId)
    }
  }

  // #571 (and the #562 transition fix): a non-cut transition's combined
  // [from, to] setup entry writes one value per member per frame, so a clip
  // whose placement bindings differ across the pair - or whose placements
  // carry placement-scoped tracks on either side - must keep its per-pixel
  // (or branch-form) binding for the divergent values.
  const mirrorDivergentClipIds = new Set<string>()
  const prologueDivergentClipIds = new Set<string>()
  {
    const placementTrackedClipIds = (scene: ShowRoutedSceneSequenceSceneRecipe): Set<string> => {
      const clipByPlacementId = new Map(scene.placements.map((placement) => (
        [placement.placementId, placement.clipId] as const
      )))
      return new Set((scene.propertyTracks ?? []).flatMap((track) => {
        if (!('placementId' in track.target)) return []
        const clipId = clipByPlacementId.get(track.target.placementId)
        return clipId === undefined ? [] : [clipId]
      }))
    }
    for (let sceneIndex = 0; sceneIndex < scenes.length - 1; sceneIndex += 1) {
      const scene = scenes[sceneIndex]
      if (!scene.transitionOut || scene.transitionOut.kind === 'cut') continue
      const next = scenes[sceneIndex + 1]
      const fromByClipId = new Map(scene.placements.map((placement) => [placement.clipId, placement]))
      const fromTracked = placementTrackedClipIds(scene)
      const toTracked = placementTrackedClipIds(next)
      for (const toPlacement of next.placements) {
        const fromPlacement = fromByClipId.get(toPlacement.clipId)
        if (!fromPlacement) continue
        const strip = ({ placementId: _placementId, ...rest }: typeof toPlacement) => rest
        if (JSON.stringify(strip(fromPlacement)) !== JSON.stringify(strip(toPlacement))
          || fromTracked.has(toPlacement.clipId)
          || toTracked.has(toPlacement.clipId)) {
          prologueDivergentClipIds.add(toPlacement.clipId)
        }
        // The mirror coefficients also depend on the placement's zone
        // geometry (base_i is pixel-count derived), not just the flag.
        if (Boolean(fromPlacement.mirror) !== Boolean(toPlacement.mirror)
          || fromPlacement.zoneName !== toPlacement.zoneName
          || fromPlacement.zoneMode !== toPlacement.zoneMode
          || JSON.stringify(fromPlacement.domainZoneNames ?? null) !== JSON.stringify(toPlacement.domainZoneNames ?? null)) {
          mirrorDivergentClipIds.add(toPlacement.clipId)
        }
      }
    }
  }

  // #561: a member's per-pixel pixelCount write is redundant when its
  // virtual pixel count is one value across every arm that can invoke it;
  // the schedulers' per-frame writes already cover those members.
  const pixelCountUniform = (() => {
    const enabled = options.pixelCountWriteHoisting ?? true
    const countsByMember = new Map<string, Set<number>>()
    const poisoned = new Set<string>(nonUniformClipIds)
    const addCount = (memberId: string, count: number) => {
      const set = countsByMember.get(memberId) ?? new Set<number>()
      set.add(count)
      countsByMember.set(memberId, set)
    }
    if (hasLogicalLayouts) for (const member of memberFacts) poisoned.add(member.id)
    const physicalZones = new Map(
      routingLayouts.flatMap((layout) => layout.zones).map((zone) => [zone.name, zone]),
    )
    // The all-cut shared-physical scheduler owns its own arm emission; keep
    // those recipes on the per-pixel write conservatively.
    const sharedCutShape = scenes.length > 0
      && routingLayouts.length === 1
      && scenes.every((scene) => !scene.transitionOut || scene.transitionOut.kind === 'cut')
    if (sharedCutShape) for (const member of memberFacts) poisoned.add(member.id)
    for (const scene of scenes) {
      for (const placement of scene.placements) {
        const zone = physicalZones.get(placement.zoneName)
        if (!zone) {
          poisoned.add(placement.clipId)
          continue
        }
        addCount(placement.clipId, Math.max(1, controllerZonePixelCount(zone)))
      }
    }
    for (const resolved of inputs.resolvedRouteCounts) addCount(resolved.memberId, resolved.pixelCount)
    return (memberId: string) => {
      const counts = countsByMember.get(memberId)
      return enabled && !poisoned.has(memberId) && counts !== undefined && counts.size === 1
    }
  })()

  // #559: option carrier plus the phase-adaptation identity proof (the
  // brightness identity's twin). Adaptation mixes are excluded at emission
  // via includeAdaptationMix.
  const phaseBlocked = new Set<string>()
  for (const scene of scenes) {
    const clipByPlacement = new Map(scene.placements.map((placement) => (
      [placement.placementId, placement.clipId] as const
    )))
    for (const placement of scene.placements) {
      if (placement.phase !== undefined) phaseBlocked.add(placement.clipId)
    }
    for (const track of scene.propertyTracks ?? []) {
      if (track.target.kind === 'placement-view' && track.target.property === 'phase') {
        const clipId = clipByPlacement.get(track.target.placementId)
        if (clipId) phaseBlocked.add(clipId)
      }
    }
  }
  const rampMovesPhase = inputs.adaptationRampPhases !== null
    && (inputs.adaptationRampPhases.from !== 0 || inputs.adaptationRampPhases.to !== 0)

  return new Map(memberFacts.map((member) => {
    const colorCoefficientHoisting = (options.colorCoefficientHoisting ?? true)
      && !multiPlacementClipIds.has(member.id)
    return [member.id, {
      colorCoefficientHoisting,
      uniformMirrorBinding: (options.capturePrologueSimplification ?? true)
        && !hasLogicalLayouts
        && !inputs.routeMode
        && !nonUniformClipIds.has(member.id)
        && !mirrorDivergentClipIds.has(member.id),
      uniformPrologueBinding: (options.placementPrologueHoisting ?? true)
        && !hasLogicalLayouts
        && !inputs.routeMode
        && !nonUniformClipIds.has(member.id)
        && !prologueDivergentClipIds.has(member.id)
        && colorCoefficientHoisting,
      uniformPixelCountBinding: pixelCountUniform(member.id),
      hsvCaptureSpecialization: options.hsvCaptureChainSpecialization ?? true,
      identityBlendFold: options.identityBlendFold ?? true,
      perPixelDedup: options.perPixelDedup ?? true,
      phaseAdaptationIdentity: member.adaptationPhase === 0
        && !phaseBlocked.has(member.id)
        && !rampMovesPhase
        && member.slotOwnerPhases.every((phase) => phase === 0),
    } satisfies MemberBindingPolicy]
  }))
}

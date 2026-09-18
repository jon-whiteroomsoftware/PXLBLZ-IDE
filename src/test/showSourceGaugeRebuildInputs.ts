/**
 * Mirrors the editor's own v1 artifact-compilation inputs for the #1065 gauge probe.
 *
 * `ShowEditor.tsx` derives the Stage dimension from the backing record's saved map, looked up
 * across stock and user maps, and offers a target pixel count only for a portable-2D contract from
 * the profile it would treat as active. Omitting those is what refused Portable 2D compatibility on
 * the first probe run, so the derivation lives here in one place, is used by the in-page rebuild,
 * and is regression-tested against the committed fixture and the real compiler.
 *
 * This is a mirror for a diagnostic probe, not a second source of truth: the product keeps its own
 * derivation, and the probe fails closed rather than relaxing compatibility.
 */

export interface StageMapLike { id: string; dim?: number }
export interface ControllerProfileLike { id: string; lastKnownPixelCount?: number }

export interface V1ArtifactCompilationInputs {
  /** Passed to `compileShowForArtifact`; `undefined` when the record names no resolvable map. */
  stageDimension: number | undefined
  /** Passed to `compileShowForArtifact`; only ever set for a portable-2D contract. */
  targetPixelCount: number | undefined
  /** What the record named, for the evidence record. */
  stageMapId: string | null
  /** Whether that name resolved across the supplied maps. */
  stageMapResolved: boolean
  outputContractKind: string | null
}

export interface V1ArtifactCompilationSources {
  show: {
    stageMapId?: string | null
    targetControllerProfileId?: string | null
    outputContract?: { kind?: string } | null
  }
  /** Stock maps followed by user maps, in the order the editor searches them. */
  maps: readonly StageMapLike[]
  profiles: readonly ControllerProfileLike[]
  /** Whether the editor would see a live Controller at all. */
  hasActiveController: boolean
  /** The profile matched to that live Controller, when there is one. */
  liveControllerProfile?: ControllerProfileLike
}

export function resolveV1ArtifactCompilationInputs(
  sources: V1ArtifactCompilationSources,
): V1ArtifactCompilationInputs {
  const { show, maps, profiles } = sources
  const stageMapId = show.stageMapId ?? null
  const savedStageMap = stageMapId ? maps.find(map => map.id === stageMapId) : undefined
  const outputContractKind = show.outputContract?.kind ?? null

  const targetProfile = outputContractKind === 'portable-2d'
    ? undefined
    : show.targetControllerProfileId
      ? profiles.find(profile => profile.id === show.targetControllerProfileId)
      : profiles[0]
  const activeControllerProfile = sources.hasActiveController ? sources.liveControllerProfile : targetProfile

  return {
    stageDimension: savedStageMap?.dim,
    targetPixelCount: outputContractKind === 'portable-2d' ? activeControllerProfile?.lastKnownPixelCount : undefined,
    stageMapId,
    stageMapResolved: Boolean(savedStageMap),
    outputContractKind,
  }
}

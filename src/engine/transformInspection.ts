import type { PassWarning, TransformSummary } from './passEngine'

export interface TransformArtifactInspection {
  summary: TransformSummary
  warnings: PassWarning[]
  generatedSource: string
  patternName?: string
  updatedAt: number
}

export type TransformArtifactInspectionStore = Record<string, Record<string, TransformArtifactInspection>>

export function withTransformArtifactInspection(
  artifacts: TransformArtifactInspectionStore,
  controllerId: string,
  patternId: string,
  artifact: TransformArtifactInspection | null,
): TransformArtifactInspectionStore {
  const next = { ...artifacts }
  const controllerArtifacts = { ...next[controllerId] }
  if (artifact) {
    next[controllerId] = { ...controllerArtifacts, [patternId]: artifact }
    return next
  }
  delete controllerArtifacts[patternId]
  if (Object.keys(controllerArtifacts).length === 0) {
    delete next[controllerId]
  } else {
    next[controllerId] = controllerArtifacts
  }
  return next
}

export function selectTransformArtifactInspection(
  artifacts: TransformArtifactInspectionStore,
  controllerId?: string | null,
  patternId?: string | null,
): TransformArtifactInspection | null {
  if (controllerId && patternId) {
    const exact = artifacts[controllerId]?.[patternId]
    if (exact) return exact
  }
  if (controllerId) {
    const latestForController = latestArtifact(Object.values(artifacts[controllerId] ?? {}))
    if (latestForController) return latestForController
  }
  return latestArtifact(Object.values(artifacts).flatMap((byPattern) => Object.values(byPattern)))
}

function latestArtifact(artifacts: TransformArtifactInspection[]): TransformArtifactInspection | null {
  return artifacts.reduce<TransformArtifactInspection | null>(
    (latest, artifact) => (!latest || artifact.updatedAt > latest.updatedAt ? artifact : latest),
    null,
  )
}

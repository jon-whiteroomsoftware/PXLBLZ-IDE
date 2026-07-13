import type { ShowOutputContract, ShowRecord } from './personalContentRecords'
import {
  createInstallationShowOutputContract,
  normalizeShowOutputContract,
} from './showOutputContract'

export type ShowOutputClassification =
  | {
      source: 'versioned'
      outcome: ShowOutputContract['kind']
      contract: ShowOutputContract
      reasons: string[]
    }
  | {
      source: 'legacy-evidence'
      outcome: 'installation'
      contract: ShowOutputContract
      reasons: string[]
    }
  | {
      source: 'legacy-evidence'
      outcome: 'ambiguous'
      reasons: string[]
    }

/**
 * Classifies only evidence that is exclusive to an output contract. Stage map
 * dimension and the absence of physical ranges are intentionally not evidence.
 */
export function classifyShowOutputContract(show: ShowRecord): ShowOutputClassification {
  const versionedContract = normalizeShowOutputContract(show.outputContract)
  if (versionedContract) {
    return {
      source: 'versioned',
      outcome: versionedContract.kind,
      contract: versionedContract,
      reasons: [`The Show already stores output contract version ${versionedContract.version}.`],
    }
  }

  const reasons: string[] = []
  if (show.targetControllerProfileId) {
    reasons.push('The saved Show explicitly targets a Controller profile.')
  }
  if (hasPhysicalRoutingRanges(show)) {
    reasons.push('The saved Show contains physical LED index ranges.')
  }

  if (reasons.length > 0) {
    return {
      source: 'legacy-evidence',
      outcome: 'installation',
      contract: createInstallationShowOutputContract({
        outputMapId: show.stageMapId ?? null,
        pixelCount: legacyShowModeledPixelCount(show),
      }),
      reasons,
    }
  }

  return {
    source: 'legacy-evidence',
    outcome: 'ambiguous',
    reasons: [
      'The saved Show has no contract-exclusive physical evidence.',
      'Stage map dimension and missing physical ranges do not prove portability.',
    ],
  }
}

export function legacyShowModeledPixelCount(
  show: Pick<ShowRecord, 'zones'>,
): number {
  return Math.max(1, show.zones.reduce((sum, zone) => (
    sum + Math.max(0, Math.floor(zone.nominalPixelCount))
  ), 0))
}

function hasPhysicalRoutingRanges(show: Pick<ShowRecord, 'routingLayouts'>): boolean {
  return show.routingLayouts.some((layout) => (
    layout.zones.some((zone) => zone.ranges.some((range) => range.end >= range.start))
  ))
}

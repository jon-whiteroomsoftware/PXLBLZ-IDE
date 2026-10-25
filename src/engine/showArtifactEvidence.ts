export interface ShowArtifactEvidenceSource {
  id: string
  name: string
  sourceSha256: string
}

export interface ShowArtifactStalenessReport {
  recordedCount: number
  currentCount: number
  matchingCount: number
  stale: Array<{ id: string; name: string; evidenceSourceSha256: string; currentSourceSha256: string }>
  unmeasured: ShowArtifactEvidenceSource[]
}

/** Compare frozen evidence with current complete-source hashes without gating stock. */
export function reportShowArtifactSourceStaleness(
  recorded: readonly ShowArtifactEvidenceSource[],
  current: readonly ShowArtifactEvidenceSource[],
): ShowArtifactStalenessReport {
  const recordedHashes = new Map(recorded.map((row) => [row.id, row.sourceSha256]))
  const report: ShowArtifactStalenessReport = {
    recordedCount: recorded.length,
    currentCount: current.length,
    matchingCount: 0,
    stale: [],
    unmeasured: [],
  }
  for (const row of current) {
    const evidenceSourceSha256 = recordedHashes.get(row.id)
    if (evidenceSourceSha256 === undefined) {
      report.unmeasured.push(row)
    } else if (evidenceSourceSha256 === row.sourceSha256) {
      report.matchingCount++
    } else {
      report.stale.push({
        id: row.id,
        name: row.name,
        evidenceSourceSha256,
        currentSourceSha256: row.sourceSha256,
      })
    }
  }
  return report
}

export const HISTORICAL_FIRMWARE_367_OBSERVATION_BYTES = 68_384
export const PROVISIONAL_SHOW_OPERATING_BUDGET_BYTES = 54_707
export const PROVISIONAL_SHOW_MARGIN_BYTES = 13_677

export type ShowArtifactCompileContext = { controllerId: string; liveEpoch: number }
export type ShowArtifactCompilationRecord = ShowArtifactCompileContext & {
  sourceSha256: string
  byteLength: number
}

/** Advisory pricing for one artifact. Exact bytes belong only to the complete
 * compile input and its live Controller epoch; they are never a delivery gate. */
export function priceShowArtifact(input: {
  estimatedBytes: number
  sourceSha256: string | null
  context: ShowArtifactCompileContext | null
  measurement: ShowArtifactCompilationRecord | null
}): {
  kind: 'exact' | 'estimate'
  bytes: number
  rawHeadroomBytes: number
  usableHeadroomBytes: number
  operatingBudgetBytes: number
  budgetRatio: number
} {
  const { context, measurement, sourceSha256 } = input
  const exact = context != null && measurement != null && sourceSha256 != null
    && /^[a-f0-9]{64}$/.test(sourceSha256)
    && measurement.controllerId === context.controllerId
    && measurement.liveEpoch === context.liveEpoch
    && measurement.sourceSha256 === sourceSha256
    && Number.isSafeInteger(measurement.byteLength) && measurement.byteLength >= 8
  const bytes = exact ? measurement.byteLength : input.estimatedBytes
  return {
    kind: exact ? 'exact' : 'estimate',
    bytes,
    rawHeadroomBytes: HISTORICAL_FIRMWARE_367_OBSERVATION_BYTES - bytes,
    usableHeadroomBytes: PROVISIONAL_SHOW_OPERATING_BUDGET_BYTES - bytes,
    operatingBudgetBytes: PROVISIONAL_SHOW_OPERATING_BUDGET_BYTES,
    budgetRatio: bytes / PROVISIONAL_SHOW_OPERATING_BUDGET_BYTES,
  }
}

/** Hash the full UTF-8 compile input, including its provenance banner. */
export async function sha256CompleteCompileInput(source: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

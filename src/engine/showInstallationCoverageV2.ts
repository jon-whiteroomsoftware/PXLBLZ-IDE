// The Installation physical-coverage rule over a `ShowRecordV2` (#1039).
//
// v1 asks this question in two places: `validateShowAuthoring`, which reports it
// as a delivery warning, and `compileShowForArtifact`, which refuses the
// delivered artifact. A v2 record reached neither, so an Installation v2 Show
// whose physical Zone Layout left output pixels unassigned, assigned twice or
// outside the output validated, opened and exported exactly like a complete one.
// This module supplies the missing v2 half.
//
// The rule itself is not restated here. `validateInstallationCoverage` owns it,
// over the projection both record versions satisfy; this module supplies only
// the v2 record's own field name - `zoneLayouts` where a v1 record says
// `routingLayouts` - in the record's own authored order, which is the order v1
// reports a layout in.
import type { ShowRecordV2 } from './showCompositionV2'
import { validateInstallationCoverage, type InstallationCoverage } from './showInstallationCoverage'

/**
 * The Installation coverage verdict for one v2 record. `null` means the Show is
 * not an Installation, exactly as the v1 entry point's `null` does.
 */
export function validateInstallationCoverageV2(
  record: Pick<ShowRecordV2, 'outputContract' | 'zoneLayouts'>,
): InstallationCoverage | null {
  return validateInstallationCoverage({
    outputContract: record.outputContract,
    routingLayouts: record.zoneLayouts,
  })
}

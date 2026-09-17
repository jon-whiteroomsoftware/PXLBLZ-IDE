// The structural Zone Layout rule both record versions own (#1039).
//
// `validateShowAuthoring` has always emitted four structural errors about Zone
// Layouts - an unknown Zone, a physical range endpoint that is not a safe
// integer, invalid logical routing, and a duplicate or empty Zone identity
// inside one Layout. Nothing on the v2 path asked any of them, so a candidate
// carrying the fault validated, saved and reopened where v1 refuses it.
//
// The rule is version-independent: a v1 `ShowRecord` names its Zone Layouts
// `routingLayouts` and a `ShowRecordV2` names them `zoneLayouts`, and
// everything the rule reads - the Show's Zone identities, each Layout's zone
// entries, its physical ranges and its routing operator - has the same shape in
// both. So it is implemented exactly once here and both authoring validators
// classify its issues the way `validateShowAuthoring` always did: structural
// errors, reported before dependency and delivery questions.
import type { ShowRoutingLayout } from './personalContentRecords'
import type { ShowEditDiagnosticCode } from './showEditDiagnostic'
import { validateShowLogicalRouting } from './showLogicalRouting'

export type ShowZoneLayoutStructureCode = Extract<
  ShowEditDiagnosticCode,
  'empty-identity' | 'duplicate-identity' | 'layout-missing-zone' | 'invalid-physical-range' | 'invalid-logical-routing'
>

export interface ShowZoneLayoutStructureIssue {
  diagnosticCode: ShowZoneLayoutStructureCode
  message: string
  path: string
}

/**
 * The record-shaped half of the rule, in the fields both versions own under
 * their own names. Zone identity is the Show's own authored Zone list; the
 * Layout list is `routingLayouts` for v1 and `zoneLayouts` for v2.
 */
export interface ShowZoneLayoutShape {
  zones: readonly { id: string }[]
  routingLayouts: readonly ShowRoutingLayout[]
}

export function validateShowZoneLayoutStructure(shape: ShowZoneLayoutShape): ShowZoneLayoutStructureIssue[] {
  const issues: ShowZoneLayoutStructureIssue[] = []
  const zones = new Set(shape.zones.map((zone) => zone.id))
  for (const layout of shape.routingLayouts) {
    const seen = new Set<string>()
    for (const zone of layout.zones) {
      const path = JSON.stringify(['layout', layout.id, 'zone', zone.zoneId])
      if (!zone.zoneId.trim()) {
        issues.push({ diagnosticCode: 'empty-identity', message: `Empty Zone in Layout ${layout.id} identity.`, path })
      }
      if (seen.has(zone.zoneId)) {
        issues.push({
          diagnosticCode: 'duplicate-identity',
          message: `Duplicate Zone in Layout ${layout.id} identity "${zone.zoneId}".`,
          path,
        })
      }
      seen.add(zone.zoneId)
    }
    for (const zoneId of [...layout.zones.map((zone) => zone.zoneId), ...(layout.logical?.zoneIds ?? [])]) {
      if (!zones.has(zoneId)) {
        issues.push({
          diagnosticCode: 'layout-missing-zone',
          message: `Layout "${layout.id}" has an unknown Zone "${zoneId}".`,
          path: JSON.stringify(['layout', layout.id, 'zone', zoneId]),
        })
      }
    }
    for (const zone of layout.zones) {
      for (const range of zone.ranges) {
        // A safe integer, exactly as v1 asks. A negative endpoint is accepted
        // here and answered by the Installation coverage rule; widening this to
        // "nonnegative" would refuse records v1 admits.
        if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)) {
          issues.push({
            diagnosticCode: 'invalid-physical-range',
            message: `Layout "${layout.id}" physical range endpoints must be safe finite integers.`,
            path: JSON.stringify(['layout', layout.id, 'zone', zone.zoneId, 'ranges']),
          })
        }
      }
    }
    if (layout.logical) {
      for (const message of validateShowLogicalRouting(layout.logical)) {
        issues.push({
          diagnosticCode: 'invalid-logical-routing',
          message,
          path: JSON.stringify(['layout', layout.id, 'logical']),
        })
      }
    }
  }
  return issues
}

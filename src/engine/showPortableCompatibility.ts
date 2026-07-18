import { inspectPatternMetadata } from './bundle'
import type { ShowRecord } from './personalContentRecords'
import { validateShowLogicalRouting } from './showLogicalRouting'

export interface PortablePatternSource {
  cellId: string
  patternName: string
  source: string
}

export interface PortableShowCompatibility {
  compatible: boolean
  issues: string[]
  advisories: string[]
}

export function validatePortableShowCompatibility(
  show: ShowRecord,
  sources: PortablePatternSource[],
  referenceMapDimension: 1 | 2 | 3 | undefined,
): PortableShowCompatibility | null {
  if (show.outputContract?.kind !== 'portable-2d') return null
  const issues: string[] = []
  const advisories: string[] = []

  if (referenceMapDimension !== 2) {
    issues.push(referenceMapDimension === 3
      ? 'The reference output is 3D; Portable currently supports only 2D mapped surfaces.'
      : 'The reference output must be a 2D mapped surface.')
  }

  const zoneIds = new Set(show.zones.map((zone) => zone.id))
  for (const layout of show.routingLayouts) {
    if (!layout.logical) {
      issues.push(`Routing layout "${layout.name}" uses physical pixel ranges; Portable requires normalized position-based zones.`)
      continue
    }
    const logical = layout.logical
    if (logical.zoneIds.some((zoneId) => !zoneIds.has(zoneId))) {
      issues.push(`Routing layout "${layout.name}" references a missing logical zone.`)
    }
    issues.push(...validateShowLogicalRouting(logical).map((issue) => `Routing layout "${layout.name}": ${issue}`))
  }

  const seenSources = new Set<string>()
  for (const entry of sources) {
    const key = `${entry.patternName}\u0000${entry.source}`
    if (seenSources.has(key)) continue
    seenSources.add(key)
    try {
      const renderFns = inspectPatternMetadata(entry.source).renderFns
      if (!renderFns.hasRender2D && !renderFns.hasRender) {
        issues.push(renderFns.hasRender3D
          ? `${entry.patternName} defines only render3D.`
          : `${entry.patternName} defines no render2D or render entry point.`)
      } else if (!renderFns.hasRender2D && renderFns.hasRender) {
        advisories.push(
          `${entry.patternName} uses render; Portable adapts its normalized local position to a resolution-dependent index.`,
        )
      }
    } catch {
      issues.push(`${entry.patternName} cannot be inspected for Portable renderer compatibility.`)
    }
  }

  return { compatible: issues.length === 0, issues, advisories }
}

export function portableCompatibilityBlockingMessage(
  result: PortableShowCompatibility | null,
): string | null {
  const issue = result?.issues[0]
  if (!issue) return null
  const remedy = issue.includes('reference output')
    ? 'Choose a 2D reference map before export or send.'
    : issue.includes('physical pixel ranges')
      ? 'Choose a normalized routing mode in Show properties before export or send.'
      : issue.includes('render3D') || issue.includes('entry point') || issue.includes('inspected')
        ? 'Choose a Pattern with render2D or render, or author that renderer before export or send.'
        : 'Repair the logical routing layout in Show properties before export or send.'
  return `Portable 2D compatibility failed: ${issue} ${remedy}`
}

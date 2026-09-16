import { bundle } from './bundle'

export type AgentPatternKind = 'stock' | 'user'
export type AgentPatternControlKind = 'slider' | 'toggle' | 'hsvPicker' | 'rgbPicker'

export interface AgentPatternDiscoverySource {
  kind: AgentPatternKind
  id: string
  name: string
  source: string
}

export interface AgentPatternDiscoveryFilter {
  query?: string
  kind?: AgentPatternKind
}

export interface AgentPatternDiscoveryControl {
  export_name: string
  kind: AgentPatternControlKind
  min?: 0
  max?: 1
}

export interface AgentPatternDiscovery {
  kind: AgentPatternKind
  id: string
  name: string
  exported_controls: AgentPatternDiscoveryControl[]
}

export interface AgentControllerProfileDiscoverySource {
  id: string
  name: string
  lastKnownPixelCount?: number
}

export interface AgentControllerProfileDiscovery {
  id: string
  name: string
  pixel_count?: number
}

const CONTROL_KINDS = new Set<AgentPatternControlKind>(['slider', 'toggle', 'hsvPicker', 'rgbPicker'])

/**
 * Projects the exact Pattern identities and exported controls an agent can use.
 * The real bundler verifies the captured dependency graph; any unknown metadata
 * makes the requested listing unavailable instead of looking authoritatively empty.
 */
export function projectAgentPatterns(
  sources: readonly AgentPatternDiscoverySource[],
  libraries: Readonly<Record<string, string>>,
  filter: AgentPatternDiscoveryFilter = {},
): AgentPatternDiscovery[] | undefined {
  const query = filter.query?.trim().toLowerCase()
  const selected = sources.filter(pattern => (
    (!filter.kind || pattern.kind === filter.kind)
    && (!query || pattern.id.toLowerCase().includes(query) || pattern.name.toLowerCase().includes(query))
  ))
  const availableLibraries = { ...libraries }

  try {
    return selected.map(pattern => ({
      kind: pattern.kind,
      id: pattern.id,
      name: pattern.name,
      exported_controls: bundle(pattern.source, availableLibraries).metadata.controls.flatMap(control => {
        if (!CONTROL_KINDS.has(control.kind as AgentPatternControlKind)) return []
        const projected = {
          export_name: control.exportName,
          kind: control.kind as AgentPatternControlKind,
        }
        return [control.kind === 'slider'
          ? { ...projected, min: 0 as const, max: 1 as const }
          : projected]
      }),
    }))
  } catch {
    return undefined
  }
}

/** Last-observed hardware facts are optional; map observations are not current identity. */
export function projectAgentControllerProfiles(
  profiles: readonly AgentControllerProfileDiscoverySource[],
): AgentControllerProfileDiscovery[] {
  return profiles.map(profile => ({
    id: profile.id,
    name: profile.name,
    ...(Number.isSafeInteger(profile.lastKnownPixelCount) && profile.lastKnownPixelCount! > 0
      ? { pixel_count: profile.lastKnownPixelCount }
      : {}),
  }))
}

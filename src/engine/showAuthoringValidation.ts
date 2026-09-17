import type { ShowPatternRef, ShowRecord } from './personalContentRecords'
import { validateShowComposition } from './showCompositionModel'
import { validateShowLogicalRouting } from './showLogicalRouting'
import { validatePortableShowCompatibility } from './showPortableCompatibility'
import { installationCoverageBlockingMessage, validateInstallationCoverage } from './showInstallationCoverage'
import { SHOW_MAX_OUTPUT_PIXELS } from './showVmResourceLedger'
import { inspectPatternLibraryReferences, inspectPatternMetadata } from './bundle'
import type { ShowEditDiagnosticCode } from './showEditDiagnostic'

export interface ShowAuthoringIssue {
  code: 'structure' | 'composition' | 'missing-reference' | 'metadata' | 'delivery'
  diagnosticCode?: ShowEditDiagnosticCode
  message: string
  path?: string
}

export interface ShowPatternSite {
  owner: string
  ref: ShowPatternRef
  patternName: string
}

/** Identity scopes are authored owners, never array positions or diagnostic counts. */
export function showPatternSites(show: ShowRecord): ShowPatternSite[] {
  return [
    ...show.cells.map(cell => ({ owner: JSON.stringify(['cell', cell.id]), ref: cell.pattern, patternName: cell.patternName })),
    ...(show.composition?.patternInstances ?? []).map(instance => ({ owner: JSON.stringify(['instance', instance.id]), ref: instance.pattern, patternName: instance.patternName })),
    ...(show.composition?.groupDefinitions ?? []).flatMap(group => group.patternInstances.map(instance => ({
      owner: JSON.stringify(['group', group.id, 'instance', instance.id]), ref: instance.pattern, patternName: instance.patternName,
    }))),
  ]
}

export interface ShowAuthoringBaseline {
  readonly missingReferences: readonly string[]
  readonly missingControls: readonly string[]
}

export interface ShowAuthoringContext {
  /** Exact source lookup. Undefined means unavailable; never substitute. */
  source: (ref: ShowPatternRef) => string | undefined
  baseline?: ShowAuthoringBaseline
  allowExistingMissing?: boolean
  stageDimension?: 1 | 2 | 3
  /** Fixed metadata snapshot for this validation lineage. */
  libraries?: Record<string, string>
}

/** Direct compiler-supported calls; conservatively inspect all functions in each
 * referenced Library, including transitive namespaces. Cycles are visited once.
 * Shared with the v2 authoring validator so both record versions inspect
 * dependencies through one implementation. */
export function libraryDependencies(source: string, libraries: Record<string, string>): { missing: string[]; invalid: boolean; sourceIdentity: string } {
  const missing = new Set<string>()
  const visited = new Set<string>()
  let invalid = false
  const visit = (text: string) => {
    try {
      const inspection = inspectPatternLibraryReferences(text)
      if (inspection.unsupportedCalls) invalid = true
      for (const ref of inspection.references) {
        const library = Object.prototype.hasOwnProperty.call(libraries, ref.namespace) ? libraries[ref.namespace] : undefined
        if (library === undefined) {
          missing.add(JSON.stringify([ref.namespace, ref.fnName]))
          continue
        }
        if (!inspectPatternMetadata(library).patternFunctions?.includes(ref.fnName)) {
          missing.add(JSON.stringify([ref.namespace, ref.fnName]))
        }
        if (!visited.has(ref.namespace)) {
          visited.add(ref.namespace)
          visit(library)
        }
      }
    } catch { invalid = true }
  }
  visit(source)
  return { missing: [...missing], invalid, sourceIdentity: JSON.stringify([source, [...visited].sort().map(namespace => [namespace, libraries[namespace]])]) }
}

/** The exact identity a baseline exception is keyed by; shared with the v2 validator. */
export function referenceIdentity(site: ShowPatternSite, dependency?: string, sourceIdentity?: string): string {
  return JSON.stringify([site.owner, site.ref.kind, site.ref.id, dependency ?? null, sourceIdentity ?? null])
}

/** Capture values now; later source callbacks or mutable Library maps cannot rewrite the baseline. */
export function captureShowAuthoringBaseline(show: ShowRecord, context: Pick<ShowAuthoringContext, 'source' | 'libraries'>): ShowAuthoringBaseline {
  const missingReferences: string[] = []
  for (const site of showPatternSites(show)) {
    const source = context.source(site.ref)
    if (source === undefined) missingReferences.push(referenceIdentity(site))
    else {
      const dependencies = libraryDependencies(source, context.libraries ?? {})
      for (const dependency of dependencies.missing) missingReferences.push(referenceIdentity(site, dependency, dependencies.sourceIdentity))
    }
  }
  return Object.freeze({
    missingReferences: Object.freeze(missingReferences),
    missingControls: Object.freeze(controlRequirements(show).filter(requirement => context.source(requirement.ref) === undefined).map(requirement => requirement.key)),
  })
}

interface ControlRequirement { key: string; path: string; ref: ShowPatternRef; exportName: string }

function controlRequirements(show: ShowRecord): ControlRequirement[] {
  const requirements: ControlRequirement[] = []
  const add = (owner: unknown[], ref: ShowPatternRef, exportName: string, value: unknown) => {
    requirements.push({ key: JSON.stringify([owner, ref.kind, ref.id, exportName, value]), path: JSON.stringify([...owner, 'control', exportName]), ref, exportName })
  }
  for (const cell of show.cells) for (const [name, value] of Object.entries(cell.controlTargets ?? {})) add(['cell', cell.id], cell.pattern, name, value)
  const composition = show.composition
  if (!composition) return requirements
  const scopes = [
    { owner: ['show'], instances: composition.patternInstances, tracks: composition.scenes.flatMap(scene => (scene.propertyTracks ?? []).map(track => ({ owner: ['scene', scene.sceneId, track.id], track }))) },
    ...(composition.groupDefinitions ?? []).map(group => ({ owner: ['group', group.id], instances: group.patternInstances, tracks: (group.propertyTracks ?? []).map(track => ({ owner: ['group', group.id, track.id], track })) })),
  ]
  for (const scope of scopes) {
    for (const instance of scope.instances) for (const [name, value] of Object.entries(instance.controlTargets ?? {})) add([...scope.owner, instance.id], instance.pattern, name, value)
    for (const { owner, track } of scope.tracks) {
      if (track.target.kind !== 'instance-control') continue
      const target = track.target
      const instance = scope.instances.find(instance => instance.id === target.instanceId)
      if (instance) add(owner, instance.pattern, target.exportName, track)
    }
  }
  return requirements
}

/** Schema-checked ShowRecord only. Supported composition v1 and declared routing forms;
 * delivery fitness does not weaken identity, routing or composition validity. */
export function validateShowAuthoring(show: ShowRecord, context: ShowAuthoringContext) {
  const errors: ShowAuthoringIssue[] = []
  const warnings: ShowAuthoringIssue[] = []
  const structural = (diagnosticCode: ShowEditDiagnosticCode, message: string, path?: string) => errors.push({ code: 'structure', diagnosticCode, message, ...(path ? { path } : {}) })
  const identities = (values: { id: string }[], label: string, owner: readonly string[]) => {
    const ids = new Set<string>()
    for (const value of values) {
      const path = JSON.stringify([...owner, value.id])
      if (!value.id.trim()) structural('empty-identity', `Empty ${label} identity.`, path)
      if (ids.has(value.id)) structural('duplicate-identity', `Duplicate ${label} identity "${value.id}".`, path)
      ids.add(value.id)
    }
    return ids
  }
  const scenes = identities(show.scenes, 'Scene', ['scene'])
  const zones = identities(show.zones, 'Zone', ['zone'])
  const layouts = identities(show.routingLayouts, 'Layout', ['layout'])
  identities(show.cells, 'Cell', ['cell'])
  identities(show.transitions, 'Transition', ['transition'])
  for (const scene of show.scenes) if (!Number.isSafeInteger(scene.durationMs) || scene.durationMs <= 0) {
    structural('invalid-scene-duration', `Scene "${scene.id}" duration must be a positive safe integer.`, JSON.stringify(['scene', scene.id, 'durationMs']))
  }
  for (const cell of show.cells) {
    if (!zones.has(cell.zoneId) || !scenes.has(cell.sceneId)) structural('unknown-cell-owner', `Cell "${cell.id}" has an unknown owner.`, JSON.stringify(['cell', cell.id]))
  }
  for (const transition of show.transitions) {
    const path = JSON.stringify(['transition', transition.id])
    if (!scenes.has(transition.afterSceneId)) structural('transition-missing-scene', `Transition "${transition.id}" has an unknown Scene.`, path)
    if (transition.kind === 'routing' && !transition.layoutId) structural('routing-layout-required', `Routing event "${transition.id}" needs a Layout target.`, path)
    if (transition.layoutId !== undefined && !layouts.has(transition.layoutId)) structural('transition-missing-layout', `Transition "${transition.id}" has an unknown Layout.`, path)
  }
  for (const layout of show.routingLayouts) {
    identities(layout.zones.map(zone => ({ id: zone.zoneId })), `Zone in Layout ${layout.id}`, ['layout', layout.id, 'zone'])
    for (const zoneId of [...layout.zones.map(zone => zone.zoneId), ...(layout.logical?.zoneIds ?? [])]) {
      if (!zones.has(zoneId)) structural('layout-missing-zone', `Layout "${layout.id}" has an unknown Zone "${zoneId}".`, JSON.stringify(['layout', layout.id, 'zone', zoneId]))
    }
    for (const zone of layout.zones) for (const range of zone.ranges) {
      if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)) structural('invalid-physical-range', `Layout "${layout.id}" physical range endpoints must be safe finite integers.`, JSON.stringify(['layout', layout.id, 'zone', zone.zoneId, 'ranges']))
    }
    if (layout.logical) for (const message of validateShowLogicalRouting(layout.logical)) structural('invalid-logical-routing', message, JSON.stringify(['layout', layout.id, 'logical']))
  }
  const outputCount = show.outputContract.kind === 'installation' ? show.outputContract.pixelCount : show.outputContract.referencePixelCount
  if (!Number.isSafeInteger(outputCount) || outputCount <= 0) structural('invalid-output-count', 'The output pixel count must be a positive safe integer.', JSON.stringify(['outputContract', 'pixelCount']))
  if (errors.length) return { valid: false, errors, warnings }
  if (outputCount > SHOW_MAX_OUTPUT_PIXELS) warnings.push({ code: 'delivery', message: `Show output requests ${outputCount.toLocaleString('en-US')} pixels; compiled Shows support at most ${SHOW_MAX_OUTPUT_PIXELS.toLocaleString('en-US')}.` })
  if (show.composition) {
    identities(show.composition.scenes.map(scene => ({ id: scene.sceneId })), 'composition Scene', ['composition', 'scene'])
    for (const scene of show.composition.scenes) identities(scene.zones.map(zone => ({ id: zone.zoneId })), `composition Zone in Scene ${scene.sceneId}`, ['composition', 'scene', scene.sceneId, 'zone'])
    for (const issue of validateShowComposition(show, show.composition)) errors.push({ ...issue, diagnosticCode: issue.code, code: 'composition' })
  }
  const baseline = context.baseline ?? captureShowAuthoringBaseline(show, context)
  const missingReferences = new Set(baseline.missingReferences)
  const sources = []
  for (const site of showPatternSites(show)) {
    const source = context.source(site.ref)
    if (source === undefined) {
      const issue: ShowAuthoringIssue = { code: 'missing-reference', diagnosticCode: 'pattern-reference-unavailable', path: site.owner, message: `Unavailable Pattern ${site.ref.kind}:${site.ref.id}.` }
      if (context.allowExistingMissing && missingReferences.has(referenceIdentity(site))) warnings.push(issue)
      else errors.push(issue)
    } else {
      const dependencies = libraryDependencies(source, context.libraries ?? {})
      if (dependencies.invalid) errors.push({ code: 'metadata', diagnosticCode: 'pattern-metadata-unavailable', path: site.owner, message: 'Required Pattern or Library metadata cannot be inspected.' })
      for (const dependency of dependencies.missing) {
        const issue: ShowAuthoringIssue = { code: 'missing-reference', diagnosticCode: 'library-reference-unavailable', path: site.owner, message: `Unavailable Library reference ${dependency}.` }
        if (context.allowExistingMissing && missingReferences.has(referenceIdentity(site, dependency, dependencies.sourceIdentity))) warnings.push(issue)
        else errors.push(issue)
      }
      sources.push({ cellId: site.owner, patternName: site.patternName, source })
    }
  }
  const priorControls = new Set(baseline.missingControls)
  for (const requirement of controlRequirements(show)) {
    const source = context.source(requirement.ref)
    if (source === undefined && context.allowExistingMissing && priorControls.has(requirement.key)) continue
    try {
      if (source === undefined || !inspectPatternMetadata(source).controls.some(control => control.kind === 'slider' && control.exportName === requirement.exportName)) {
        errors.push({ code: 'metadata', diagnosticCode: 'control-metadata-unavailable', path: requirement.path, message: `Required slider metadata "${requirement.exportName}" is unavailable or invalid.` })
      }
    } catch { errors.push({ code: 'metadata', diagnosticCode: 'control-metadata-unavailable', path: requirement.path, message: 'Required control metadata cannot be inspected.' }) }
  }
  const coverage = installationCoverageBlockingMessage(validateInstallationCoverage(show))
  if (coverage) warnings.push({ code: 'delivery', message: coverage })
  const portable = validatePortableShowCompatibility(show, sources, context.stageDimension ?? 2)
  for (const issue of portable?.diagnostics ?? []) {
    if (issue.category === 'capability') warnings.push({ code: 'delivery', diagnosticCode: issue.code, path: issue.path, message: issue.message })
    else errors.push({ code: issue.category, diagnosticCode: issue.code, path: issue.path, message: issue.message })
  }
  for (const message of portable?.advisories ?? []) warnings.push({ code: 'delivery', message })
  return { valid: errors.length === 0, errors, warnings }
}

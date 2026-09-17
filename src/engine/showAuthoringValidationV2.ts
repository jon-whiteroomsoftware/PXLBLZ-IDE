// The minimal v2 counterparts of the v1 authoring baseline, authoring validator
// and private agent snapshot (#1039).
//
// The v1 module validates a `ShowRecord`: flat Scenes and cells and composition
// v1. None of that addresses a `ShowRecordV2`, whose structure and references
// are owned by `validateShowRecordV2`. What the v1 module owns that v2 has no
// counterpart for is the *dependency* half - which Pattern sources and Library
// namespaces an authored record needs, which of those were already missing
// before this edit, and whether an authored or animated control actually exists
// in its Pattern. That half is version-independent, so this module reuses the v1
// implementation of it and supplies only the v2 record's own sites and structure
// check. The Portable capability rule and the Installation coverage rule are
// shared the same way, through `showPortableCompatibilityV2` and
// `showInstallationCoverageV2`, and classified here exactly as v1 classifies them.
import { inspectPatternMetadata } from './bundle'
import type { ShowPatternRef } from './personalContentRecords'
import {
  invalidShowOutputCountIssue,
  libraryDependencies,
  referenceIdentity,
  showOutputCapacityMessage,
  type ShowAuthoringBaseline,
  type ShowAuthoringIssue,
  type ShowPatternSite,
} from './showAuthoringValidation'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { installationCoverageBlockingMessage } from './showInstallationCoverage'
import { validateInstallationCoverageV2 } from './showInstallationCoverageV2'
import { showPortablePatternSitesV2, validatePortableShowCompatibilityV2 } from './showPortableCompatibilityV2'
import { validateShowZoneLayoutStructure } from './showZoneLayoutStructure'

export interface ShowAuthoringContextV2 {
  /** Exact source lookup. Undefined means unavailable; never substitute. */
  source: (ref: ShowPatternRef) => string | undefined
  baseline?: ShowAuthoringBaseline
  allowExistingMissing?: boolean
  /** The dimension of the Stage map this candidate names; the v1 context carries the same. */
  stageDimension?: 1 | 2 | 3
  /** Fixed metadata snapshot for this validation lineage. */
  libraries?: Record<string, string>
}

/** Identity scopes are authored owners, never array positions. */
export function showPatternSitesV2(record: ShowRecordV2): ShowPatternSite[] {
  return [
    ...record.composition.patternInstances.map(instance => ({
      owner: JSON.stringify(['instance', instance.id]), ref: instance.pattern, patternName: instance.patternName,
    })),
    ...record.composition.groupDefinitions.flatMap(definition => definition.patternInstances.map(instance => ({
      owner: JSON.stringify(['group', definition.id, 'instance', instance.id]), ref: instance.pattern, patternName: instance.patternName,
    }))),
  ]
}

interface ControlRequirementV2 { key: string; path: string; ref: ShowPatternRef; exportName: string }

/**
 * Every authored or animated slider a v2 record depends on. Both scopes are
 * explicit owners: the Show's own instances and tracks, and each Group
 * definition's local instances and tracks.
 */
function controlRequirementsV2(record: ShowRecordV2): ControlRequirementV2[] {
  const requirements: ControlRequirementV2[] = []
  const add = (owner: unknown[], ref: ShowPatternRef, exportName: string, value: unknown) => {
    requirements.push({ key: JSON.stringify([owner, ref.kind, ref.id, exportName, value]), path: JSON.stringify([...owner, 'control', exportName]), ref, exportName })
  }
  const scopes = [
    { owner: [] as string[], instances: record.composition.patternInstances, tracks: record.composition.propertyTracks },
    ...record.composition.groupDefinitions.map(definition => ({
      owner: ['group', definition.id], instances: definition.patternInstances, tracks: definition.propertyTracks,
    })),
  ]
  for (const scope of scopes) {
    for (const instance of scope.instances) {
      for (const [name, value] of Object.entries(instance.controlTargets ?? {})) add([...scope.owner, 'instance', instance.id], instance.pattern, name, value)
    }
    for (const track of scope.tracks) {
      if (track.target.kind !== 'instance-control') continue
      const target = track.target
      const instance = scope.instances.find(candidate => candidate.id === target.instanceId)
      if (instance) add([...scope.owner, 'track', track.id], instance.pattern, target.exportName, track)
    }
  }
  return requirements
}

/** Capture values now; later source callbacks or mutable Library maps cannot rewrite the baseline. */
export function captureShowAuthoringBaselineV2(record: ShowRecordV2, context: Pick<ShowAuthoringContextV2, 'source' | 'libraries'>): ShowAuthoringBaseline {
  const missingReferences: string[] = []
  for (const site of showPatternSitesV2(record)) {
    const source = context.source(site.ref)
    if (source === undefined) missingReferences.push(referenceIdentity(site))
    else {
      const dependencies = libraryDependencies(source, context.libraries ?? {})
      for (const dependency of dependencies.missing) missingReferences.push(referenceIdentity(site, dependency, dependencies.sourceIdentity))
    }
  }
  return Object.freeze({
    missingReferences: Object.freeze(missingReferences),
    missingControls: Object.freeze(controlRequirementsV2(record).filter(requirement => context.source(requirement.ref) === undefined).map(requirement => requirement.key)),
  })
}

/**
 * Structure, references and dependency metadata for one complete v2 candidate.
 *
 * Structure and references stay with `validateShowRecordV2`, which owns the v2
 * schema and its referential and timeline rules. Compiler eligibility is a
 * separate check the caller makes against its prepared Stage capture; this
 * validator never compiles, moves or removes data.
 */
export function validateShowAuthoringV2(record: ShowRecordV2, context: ShowAuthoringContextV2): {
  valid: boolean
  errors: ShowAuthoringIssue[]
  warnings: ShowAuthoringIssue[]
} {
  const errors: ShowAuthoringIssue[] = []
  const warnings: ShowAuthoringIssue[] = []
  for (const issue of validateShowRecordV2(record)) {
    errors.push({
      code: 'structure',
      diagnosticCode: issue.code === 'duplicate-id' ? 'duplicate-identity' : issue.code === 'missing-reference' ? 'reference-unavailable' : 'structure-invalid',
      message: issue.message,
      ...(issue.path ? { path: issue.path } : {}),
    })
  }
  // The Zone Layout structural rule `validateShowAuthoring` has always applied,
  // through the one shared implementation, classified exactly as v1 classifies
  // it: structural errors that return before the dependency and delivery
  // questions. `validateShowRecordV2` owns the composition's own structure and
  // never reads `zoneLayouts` beyond identity and existence.
  for (const issue of validateShowZoneLayoutStructure({ zones: record.zones, routingLayouts: record.zoneLayouts })) {
    errors.push({ code: 'structure', diagnosticCode: issue.diagnosticCode, message: issue.message, path: issue.path })
  }
  // The same output pixel count rule, in the same two classifications v1 gives
  // it: an authored count that is not a positive safe integer is a structural
  // error, and a count past the compiled capacity is a delivery warning
  // reported after the structural return.
  if (invalidShowOutputCountIssue(record.outputContract)) {
    errors.push({
      code: 'structure',
      diagnosticCode: 'invalid-output-count',
      message: 'The output pixel count must be a positive safe integer.',
      path: JSON.stringify(['outputContract', 'pixelCount']),
    })
  }
  if (errors.length) return { valid: false, errors, warnings }
  const capacity = showOutputCapacityMessage(record.outputContract)
  if (capacity) warnings.push({ code: 'delivery', message: capacity })
  const baseline = context.baseline ?? captureShowAuthoringBaselineV2(record, context)
  const missingReferences = new Set(baseline.missingReferences)
  for (const site of showPatternSitesV2(record)) {
    const source = context.source(site.ref)
    if (source === undefined) {
      const issue: ShowAuthoringIssue = { code: 'missing-reference', diagnosticCode: 'pattern-reference-unavailable', path: site.owner, message: `Unavailable Pattern ${site.ref.kind}:${site.ref.id}.` }
      if (context.allowExistingMissing && missingReferences.has(referenceIdentity(site))) warnings.push(issue)
      else errors.push(issue)
      continue
    }
    const dependencies = libraryDependencies(source, context.libraries ?? {})
    if (dependencies.invalid) errors.push({ code: 'metadata', diagnosticCode: 'pattern-metadata-unavailable', path: site.owner, message: 'Required Pattern or Library metadata cannot be inspected.' })
    for (const dependency of dependencies.missing) {
      const issue: ShowAuthoringIssue = { code: 'missing-reference', diagnosticCode: 'library-reference-unavailable', path: site.owner, message: `Unavailable Library reference ${dependency}.` }
      if (context.allowExistingMissing && missingReferences.has(referenceIdentity(site, dependency, dependencies.sourceIdentity))) warnings.push(issue)
      else errors.push(issue)
    }
  }
  const priorControls = new Set(baseline.missingControls)
  for (const requirement of controlRequirementsV2(record)) {
    const source = context.source(requirement.ref)
    if (source === undefined && context.allowExistingMissing && priorControls.has(requirement.key)) continue
    try {
      if (source === undefined || !inspectPatternMetadata(source).controls.some(control => control.kind === 'slider' && control.exportName === requirement.exportName)) {
        errors.push({ code: 'metadata', diagnosticCode: 'control-metadata-unavailable', path: requirement.path, message: `Required slider metadata "${requirement.exportName}" is unavailable or invalid.` })
      }
    } catch { errors.push({ code: 'metadata', diagnosticCode: 'control-metadata-unavailable', path: requirement.path, message: 'Required control metadata cannot be inspected.' }) }
  }
  // Installation delivery fitness, classified exactly as `validateShowAuthoring`
  // classifies it: an incomplete, overlapping or out-of-range physical Zone
  // Layout stays authorable and is reported as a delivery warning with no
  // diagnostic code. The artifact boundary is what refuses delivery.
  const coverage = installationCoverageBlockingMessage(validateInstallationCoverageV2(record))
  if (coverage) warnings.push({ code: 'delivery', message: coverage })
  // Portable delivery fitness, classified exactly as `validateShowAuthoring`
  // classifies it: a capability mismatch stays authorable and is reported as a
  // delivery warning, while an invalid logical Layout or uninspectable Pattern
  // is an error. The artifact boundary is what blocks delivery in both versions.
  const portable = validatePortableShowCompatibilityV2(
    record,
    showPortablePatternSitesV2(record, context.source),
    context.stageDimension ?? 2,
  )
  for (const issue of portable?.diagnostics ?? []) {
    if (issue.category === 'capability') warnings.push({ code: 'delivery', diagnosticCode: issue.code, path: issue.path, message: issue.message })
    else errors.push({ code: issue.category, diagnosticCode: issue.code, path: issue.path, message: issue.message })
  }
  for (const message of portable?.advisories ?? []) warnings.push({ code: 'delivery', message })
  return { valid: errors.length === 0, errors, warnings }
}

/**
 * Private transport projection of a v2 record for one agent operation.
 *
 * The v1 counterpart has to project a flat Show into a composition before an
 * agent can address it; a v2 record is already the one representation commands
 * read, so this captures the complete validated record and nothing else. The
 * caller retains the original record as the revision and Undo base.
 */
export function captureAgentShowSnapshotV2(record: ShowRecordV2): ShowRecordV2 | undefined {
  try {
    const snapshot = structuredClone(record)
    return validateShowRecordV2(snapshot).length === 0 ? snapshot : undefined
  } catch { return undefined }
}

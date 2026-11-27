import type { PowerCapSettings } from './powerCap'
import type { FirmwareUpdateState } from './firmwareUpdate'
import type { ControllerElectricalProfile } from './controllerElectricalProfile'
import type { InstalledMapSnapshot } from './installedMapObservation'
import type { PatternWrapper, PatternWrapperDecision } from './slowMo'

export type ControllerBoardKind = 'pixelblaze-v3-standard'

export interface ControllerFirmwareUpdateObservation {
  state: 'available' | 'current'
  checkedAt: number
  firmwareVersion?: string
}

export interface ControllerBoardProfile {
  kind: ControllerBoardKind
  hardwareRevision?: number
  firmwareVersion?: string
  /** Last conclusive result from the Controller's own update service. */
  firmwareUpdate?: ControllerFirmwareUpdateObservation
}

export function withControllerFirmwareUpdateReport(
  board: ControllerBoardProfile,
  report: {
    firmwareVersion?: string
    state?: FirmwareUpdateState
    checkedAt?: number
    observedFirmwareVersion?: string
  },
): ControllerBoardProfile {
  const firmwareVersion = report.firmwareVersion ?? board.firmwareVersion
  const observedFirmwareVersion = report.observedFirmwareVersion ?? report.firmwareVersion
  const observationMatchesInstalled = !observedFirmwareVersion
    || !firmwareVersion
    || observedFirmwareVersion === firmwareVersion
  const conclusiveState = report.state === 'available'
    ? 'available'
    : report.state === 'current' || report.state === 'complete'
      ? 'current'
      : null

  let firmwareUpdate = board.firmwareUpdate
  if (
    conclusiveState
    && typeof report.checkedAt === 'number'
    && observationMatchesInstalled
  ) {
    firmwareUpdate = {
      state: conclusiveState,
      checkedAt: report.checkedAt,
      ...(observedFirmwareVersion ? { firmwareVersion: observedFirmwareVersion } : {}),
    }
  } else if (
    firmwareUpdate
    && firmwareVersion
    && (!firmwareUpdate.firmwareVersion || firmwareUpdate.firmwareVersion !== firmwareVersion)
  ) {
    firmwareUpdate = undefined
  }

  const unchanged = firmwareVersion === board.firmwareVersion
    && firmwareUpdate?.state === board.firmwareUpdate?.state
    && firmwareUpdate?.checkedAt === board.firmwareUpdate?.checkedAt
    && firmwareUpdate?.firmwareVersion === board.firmwareUpdate?.firmwareVersion
  if (unchanged) return board

  const { firmwareUpdate: _previousFirmwareUpdate, ...rest } = board
  return {
    ...rest,
    ...(firmwareVersion ? { firmwareVersion } : {}),
    ...(firmwareUpdate ? { firmwareUpdate } : {}),
  }
}

export type ControllerInputSignal = 'analog' | 'digital'

export interface ControllerInput {
  id: string
  name: string
  pin: number
  signal: ControllerInputSignal
  smoothing: number
  fallback: number
  invert: boolean
}

/** Records written before #772 carry a `role` annotation that nothing ever
 * consumed. Drop it on read so a later write does not persist it again. The
 * array identity is preserved when there is nothing to strip, so ordinary
 * reads do not churn store state. */
export function normalizeControllerInputs(
  inputs: readonly (ControllerInput & { role?: unknown })[],
): ControllerInput[] {
  const stray = inputs.some((input) => 'role' in input)
  if (!stray) return inputs as ControllerInput[]
  return inputs.map((input) => {
    if (!('role' in input)) return input
    const { role: _retiredRole, ...rest } = input as ControllerInput & { role?: unknown }
    return rest
  })
}

export interface PowerCapTransform extends PowerCapSettings {
  id: string
  type: 'power-cap'
  enabled: boolean
  mixinId: string
}

export type ControllerWrapperType = PatternWrapper
export interface ControllerWrapperOutcome extends Pick<PatternWrapperDecision, 'applied' | 'skipped'> {
  /** The input that drives each applied Wrapper in these saved bytes. The name
   * is kept so the saved program can still be described after the input is
   * deleted. Absent when no applied Wrapper is input-driven. */
  inputs?: Partial<Record<ControllerWrapperType, { inputId: string; name: string }>>
}

export const CONTROLLER_WRAPPER_TYPES: readonly ControllerWrapperType[] = ['slow-mo', 'dreamy']

export function enabledControllerWrappers(
  profile: ControllerProfile | null | undefined,
  bindingKey?: string | null,
): ControllerWrapperType[] {
  if (!profile || bindingKey?.startsWith('show:')) return []
  return CONTROLLER_WRAPPER_TYPES.filter((type) =>
    profile.globalTransforms.some((transform) => transform.type === type && transform.enabled),
  )
}

export type GlobalTransform =
  | {
      id: string
      type: 'hardware-brightness'
      enabled: boolean
      mixinId: string
      inputId: string
      mode: 'multiply-output'
    }
  | PowerCapTransform
  | {
      id: string
      type: ControllerWrapperType
      enabled: boolean
      /** An analog input that drives this Wrapper in place of its slider. */
      inputId?: string
    }

/** A profile-wide use of one input. Each input has at most one. */
export type GlobalInputUse = 'hardware-brightness' | ControllerWrapperType

export type ControllerBindingTarget =
  | {
      kind: 'call-exported-slider'
      name: string
    }
  | {
      kind: 'call-function'
      name: string
    }
  | {
      kind: 'assign-variable'
      name: string
      min: number
      max: number
      quantize?: number
    }

export interface PatternBinding {
  id: string
  patternId: string
  inputId: string
  target: ControllerBindingTarget
}

/** Each enabled profile-wide use of an input, keyed by input ID. A valid
 * profile lists at most one use per input. */
function globalInputUses(profile: ControllerProfile): Map<string, Set<GlobalInputUse>> {
  const uses = new Map<string, Set<GlobalInputUse>>()
  for (const transform of profile.globalTransforms) {
    if (!transform.enabled) continue
    if (transform.type !== 'hardware-brightness' && transform.type !== 'slow-mo' && transform.type !== 'dreamy') continue
    if (transform.type === 'hardware-brightness' && transform.mode !== 'multiply-output') continue
    const { inputId } = transform
    if (inputId === undefined) continue
    const assigned = uses.get(inputId) ?? new Set<GlobalInputUse>()
    assigned.add(transform.type)
    uses.set(inputId, assigned)
  }
  return uses
}

/** A Pattern-specific use of an input takes precedence over every profile-wide
 * use of that same input while the Pattern is running: Brightness stops
 * scaling it, and a Wrapper driven by that input keeps its slider. */
export function globalInputUsesOverriddenBy(
  profile: ControllerProfile,
  binding: PatternBinding,
): GlobalInputUse[] {
  return [...(globalInputUses(profile).get(binding.inputId) ?? [])]
}

export function patternBindingOverridesHardwareBrightness(
  profile: ControllerProfile,
  binding: PatternBinding,
): boolean {
  return globalInputUsesOverriddenBy(profile, binding).includes('hardware-brightness')
}

/** Resolve inputs only when the profile's Wrapper bindings are coherent.
 * Digital inputs and inputs the Pattern uses on its own Controls leave the
 * affected Wrapper on its slider. Omit `patternId` for the profile-wide view. */
export function wrapperInputsFor(
  profile: ControllerProfile | null | undefined,
  patternId?: string | null,
): Partial<Record<ControllerWrapperType, ControllerInput>> {
  const result: Partial<Record<ControllerWrapperType, ControllerInput>> = {}
  if (!profile || patternId?.startsWith('show:')) return result
  const uses = globalInputUses(profile)
  const seen = new Set<ControllerWrapperType>()
  for (const transform of profile.globalTransforms) {
    if (transform.type !== 'slow-mo' && transform.type !== 'dreamy') continue
    if (seen.has(transform.type) || typeof transform.enabled !== 'boolean') return {}
    seen.add(transform.type)
    const inputId = transform.inputId
    if (inputId === undefined) continue
    const input = profile.inputs.find((candidate) => candidate.id === inputId)
    if (!transform.enabled || !input || uses.get(inputId)?.size !== 1) return {}
    if (input.signal !== 'analog') continue
    if (patternId && profile.patternBindings.some((binding) =>
      binding.patternId === patternId && binding.inputId === inputId)) continue
    result[transform.type] = input
  }
  return result
}

type WrapperTransform = Extract<GlobalTransform, { type: ControllerWrapperType }>

export function withoutWrapperInput(transform: WrapperTransform): WrapperTransform {
  const { inputId: _released, ...rest } = transform
  return rest
}

/** Point one profile-wide use at an input, or release the use with `null`,
 * keeping the profile one to one (#1278). The input leaves every other use:
 * Brightness turns off, and another Wrapper keeps its on state and slider. A
 * bound Wrapper turns on, and is added when the profile has none yet. */
export function bindGlobalInputUse(
  transforms: readonly GlobalTransform[],
  use: GlobalInputUse,
  inputId: string | null,
): GlobalTransform[] {
  if (use === 'hardware-brightness' && !transforms.some((transform) => transform.type === use)) {
    return [...transforms]
  }
  const next = transforms.map((transform): GlobalTransform => {
    if (transform.type === 'hardware-brightness') {
      if (use === 'hardware-brightness') return { ...transform, enabled: inputId !== null, inputId: inputId ?? '' }
      return inputId !== null && transform.enabled && transform.inputId === inputId
        ? { ...transform, enabled: false, inputId: '' }
        : transform
    }
    if (transform.type !== 'slow-mo' && transform.type !== 'dreamy') return transform
    if (transform.type === use) {
      return inputId === null ? withoutWrapperInput(transform) : { ...transform, enabled: true, inputId }
    }
    return inputId !== null && transform.inputId === inputId ? withoutWrapperInput(transform) : transform
  })
  if (use === 'hardware-brightness' || inputId === null || next.some((transform) => transform.type === use)) {
    return next
  }
  const ids = new Set(next.map((transform) => transform.id))
  let id: string = use
  for (let index = next.length; ids.has(id); index += 1) id = `${use}${index}`
  return [...next, { id, type: use, enabled: true, inputId }]
}

/** Inclusive pixel-index ranges. Since #775 zones are Show vocabulary only:
 * an Installation Show's Zone Layout owns its ranges, and nothing zone-shaped
 * persists on the Controller profile. The types stay here because the Show
 * engine and compiler exchange them. */
export interface ControllerZoneRange {
  start: number
  end: number
}

export interface ControllerZone {
  id: string
  name: string
  ranges: ControllerZoneRange[]
}

export interface ControllerMapFingerprint {
  hash: string
  mapId: string
  mapName: string
  devicePixelCount: number
  pushedAt: number
}

export interface ControllerProfile {
  id: string
  name: string
  deviceId?: string
  /** Last mutable name reported by the physical Pixelblaze. A user may rename
   *  `name` between observations; the next live metadata sync deliberately
   *  mirrors this device name back into `name`. */
  lastKnownDeviceName?: string
  /** Last transport IP seen for this physical device. Convenience only, not identity. */
  lastSeenIp?: string
  /** Last reported pixel count for offline display on the profile page. */
  lastKnownPixelCount?: number
  /** Last installed map dimensionality for offline display on the profile page. */
  lastKnownMapDim?: 1 | 2 | 3
  /** Last successful present/absent `/pixelmap.dat` observation. Errors never
   * replace it; identity is resolved against current maps when displayed. */
  lastKnownInstalledMap?: InstalledMapSnapshot
  /** Encoded `/pixelmap.dat` fingerprints for maps this IDE pushed to the device. */
  mapFingerprints?: ControllerMapFingerprint[]
  board: ControllerBoardProfile
  inputs: ControllerInput[]
  globalTransforms: GlobalTransform[]
  /** Optional installation-level power model. It remains useful for
   * telemetry even when the power-cap transform is disabled. */
  electricalProfile?: ControllerElectricalProfile
  patternBindings: PatternBinding[]
  updatedAt: number
}

export function controllerProfileDisplayName(profile: ControllerProfile): string {
  return profile.name
}

export interface ControllerProfileValidationIssue {
  path: string
  message: string
  /** `record` (the default) means the profile cannot be stored: duplicate ids,
   * dangling references, out-of-range numbers. `configuration` means a coherent,
   * storable state that simply does not do what the user intended. Configuration
   * issues must stay persistable, or a profile already in that state could never
   * be saved — including the save that repairs it (#772). */
  kind?: 'record' | 'configuration'
}

export interface ControllerProfileValidationResult {
  ok: boolean
  errors: ControllerProfileValidationIssue[]
}

export function analogPinsForBoard(board: ControllerBoardProfile): number[] {
  if (board.kind === 'pixelblaze-v3-standard' && (board.hardwareRevision ?? 3.5) < 3.5) {
    return [33]
  }
  return [33, 34, 35, 36, 39]
}

export function normalizeControllerZone(zone: ControllerZone): ControllerZone {
  return {
    id: zone.id,
    name: zone.name,
    ranges: zone.ranges.map((range) => ({ start: range.start, end: range.end })),
  }
}

export function normalizeControllerZones(zones: ControllerZone[]): ControllerZone[] {
  return zones.map(normalizeControllerZone)
}

export function controllerZonePixelCount(zone: ControllerZone): number {
  return normalizeControllerZone(zone).ranges.reduce(
    (sum, range) => sum + Math.max(0, Math.floor(range.end) - Math.floor(range.start) + 1),
    0,
  )
}

export function findControllerZoneByName(
  zones: ControllerZone[],
  name: string,
): ControllerZone | undefined {
  const normalizedName = normalizeZoneName(name)
  return zones.find((zone) => normalizeZoneName(zone.name) === normalizedName)
}

export function validateControllerProfile(
  profile: ControllerProfile,
): ControllerProfileValidationResult {
  const errors: ControllerProfileValidationIssue[] = []
  const inputIds = new Set<string>()
  const wrapperTypes = new Set<ControllerWrapperType>()
  const analogPins = analogPinsForBoard(profile.board)

  collectDuplicateIds(profile.inputs, 'input', errors)
  collectDuplicateIds(profile.globalTransforms, 'global transform', errors)
  collectDuplicateIds(profile.patternBindings, 'pattern binding', errors)

  for (const input of profile.inputs) {
    inputIds.add(input.id)
    if (input.signal === 'analog' && !analogPins.includes(input.pin)) {
      errors.push({
        path: `inputs.${input.id}.pin`,
        message: `Input "${input.id}" uses IO${input.pin} for analog input, but ${profile.board.kind} analog inputs are ${formatIoList(analogPins)}.`,
      })
    }
    if (input.smoothing < 0 || input.smoothing > 1) {
      errors.push({
        path: `inputs.${input.id}.smoothing`,
        message: `Input "${input.id}" smoothing must be between 0 and 1.`,
      })
    }
    if (input.fallback < 0 || input.fallback > 1) {
      errors.push({
        path: `inputs.${input.id}.fallback`,
        message: `Input "${input.id}" fallback must be between 0 and 1.`,
      })
    }
  }

  for (const transform of profile.globalTransforms) {
    if (transform.type === 'slow-mo' || transform.type === 'dreamy') {
      if (wrapperTypes.has(transform.type) || typeof transform.enabled !== 'boolean') {
        errors.push({
          path: `globalTransforms.${transform.id}`,
          message: `A profile needs a single ${transform.type} setting with a boolean enabled value.`,
        })
      }
      wrapperTypes.add(transform.type)
      if (transform.inputId !== undefined) {
        const input = profile.inputs.find((candidate) => candidate.id === transform.inputId)
        if (!transform.enabled) {
          errors.push({
            path: `globalTransforms.${transform.id}.inputId`,
            message: `${wrapperLabel(transform.type)} is off but names input "${transform.inputId}".`,
          })
        } else if (!input) {
          errors.push({
            path: `globalTransforms.${transform.id}.inputId`,
            message: `Global transform "${transform.id}" references missing input "${transform.inputId}".`,
          })
        } else if (input.signal !== 'analog') {
          // D3: the Wrapper keeps its slider, and the input card shows why.
          errors.push({
            path: `inputs.${input.id}.signal`,
            message: `Input "${input.id}" drives ${wrapperLabel(transform.type)}, which needs an analog signal. The Wrapper keeps its slider.`,
            kind: 'configuration',
          })
        }
      }
    }
    if (transform.type === 'hardware-brightness' && transform.enabled && !inputIds.has(transform.inputId)) {
      errors.push({
        path: `globalTransforms.${transform.id}.inputId`,
        message: `Global transform "${transform.id}" references missing input "${transform.inputId}".`,
      })
    }
    // The pass recipe only samples analog inputs, so brightness on a digital
    // input silently emits nothing. Name the input, not the transform: the
    // correction belongs on the input's card (#772).
    if (transform.type === 'hardware-brightness' && transform.enabled) {
      const input = profile.inputs.find((candidate) => candidate.id === transform.inputId)
      if (input && input.signal !== 'analog') {
        errors.push({
          path: `inputs.${input.id}.signal`,
          message: `Input "${input.id}" drives hardware brightness, which needs an analog signal. A digital input emits nothing.`,
          kind: 'configuration',
        })
      }
    }
    if (
      transform.type === 'power-cap'
      && (!Number.isFinite(transform.maxDuty) || transform.maxDuty < 0 || transform.maxDuty > 1)
    ) {
      errors.push({
        path: `globalTransforms.${transform.id}.maxDuty`,
        message: `Global transform "${transform.id}" maxDuty must be between 0 and 1.`,
      })
    }
    if (transform.type === 'power-cap' && transform.provenance) {
      if (!Number.isFinite(transform.provenance.targetAmps) || transform.provenance.targetAmps < 0) {
        errors.push({
          path: `globalTransforms.${transform.id}.provenance.targetAmps`,
          message: `Global transform "${transform.id}" targetAmps must be zero or greater.`,
        })
      }
      if (
        !Number.isFinite(transform.provenance.brightness)
        || transform.provenance.brightness < 0
        || transform.provenance.brightness > 1
      ) {
        errors.push({
          path: `globalTransforms.${transform.id}.provenance.brightness`,
          message: `Global transform "${transform.id}" brightness must be between 0 and 1.`,
        })
      }
    }
    if (transform.type === 'power-cap') {
      const milliampsPerPixel = transform.milliampsPerPixel
        ?? transform.provenance?.milliampsPerPixel
      if (
        milliampsPerPixel !== undefined
        && (!Number.isFinite(milliampsPerPixel) || milliampsPerPixel <= 0)
      ) {
        errors.push({
          path: `globalTransforms.${transform.id}.milliampsPerPixel`,
          message: `Global transform "${transform.id}" milliampsPerPixel must be greater than 0.`,
        })
      }
    }
  }

  for (const [inputId, uses] of globalInputUses(profile)) {
    if (uses.size < 2) continue
    errors.push({
      path: `inputs.${inputId}`,
      message: `Input "${inputId}" drives ${[...uses].map(globalInputUseLabel).join(' and ')}. An input drives one of Brightness, Slow-mo and Dreamy.`,
    })
  }

  validateElectricalProfile(profile.electricalProfile, errors)

  for (const binding of profile.patternBindings) {
    if (!inputIds.has(binding.inputId)) {
      errors.push({
        path: `patternBindings.${binding.id}.inputId`,
        message: `Pattern binding "${binding.id}" references missing input "${binding.inputId}".`,
      })
    }
    if (binding.target.kind === 'assign-variable') {
      if (binding.target.min >= binding.target.max) {
        errors.push({
          path: `patternBindings.${binding.id}.target`,
          message: `Pattern binding "${binding.id}" assignment min must be less than max.`,
        })
      }
      if (binding.target.quantize !== undefined && binding.target.quantize <= 0) {
        errors.push({
          path: `patternBindings.${binding.id}.target.quantize`,
          message: `Pattern binding "${binding.id}" quantize must be greater than 0.`,
        })
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

function validateElectricalProfile(
  profile: ControllerElectricalProfile | undefined,
  errors: ControllerProfileValidationIssue[],
): void {
  if (!profile) return
  const presetIds = [
    'ws2812-5v-individual',
    'ws2811-12v-grouped',
    'ws2815-12v-individual',
    'custom',
  ]
  if (!presetIds.includes(profile.ledPresetId)) {
    errors.push({
      path: 'electricalProfile.ledPresetId',
      message: `Power LED construction preset "${profile.ledPresetId}" is not supported.`,
    })
  }
  if (!isPositive(profile.supplyBudget.value)) {
    errors.push({
      path: 'electricalProfile.supplyBudget.value',
      message: 'Power supply budget must be greater than 0.',
    })
  }
  if (!isElectricalUnit(profile.supplyBudget.unit)) {
    errors.push({
      path: 'electricalProfile.supplyBudget.unit',
      message: 'Power supply budget unit must be amps or watts.',
    })
  }
  if (profile.voltageOverride !== undefined && !isPositive(profile.voltageOverride)) {
    errors.push({
      path: 'electricalProfile.voltageOverride',
      message: 'Power voltage override must be greater than 0.',
    })
  }
  if (profile.ledPresetId === 'custom' && !profile.loadOverride) {
    errors.push({
      path: 'electricalProfile.loadOverride',
      message: 'A custom power profile needs a full-white load override.',
    })
  }
  if (!profile.loadOverride) return
  if (!isPositive(profile.loadOverride.fullWhite.value)) {
    errors.push({
      path: 'electricalProfile.loadOverride.fullWhite.value',
      message: 'Power load override must be greater than 0.',
    })
  }
  if (!isElectricalUnit(profile.loadOverride.fullWhite.unit)) {
    errors.push({
      path: 'electricalProfile.loadOverride.fullWhite.unit',
      message: 'Power load override unit must be amps or watts.',
    })
  }
  if (!['manufacturer-rated', 'measured', 'custom'].includes(profile.loadOverride.source)) {
    errors.push({
      path: 'electricalProfile.loadOverride.source',
      message: 'Power load override source is not supported.',
    })
  }
  if (!Number.isInteger(profile.loadOverride.atPixelCount) || profile.loadOverride.atPixelCount <= 0) {
    errors.push({
      path: 'electricalProfile.loadOverride.atPixelCount',
      message: 'Power load override address count must be a positive whole number.',
    })
  }
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function isElectricalUnit(value: string): boolean {
  return value === 'amps' || value === 'watts'
}

export function controllerProfileValidationErrors(
  result: ControllerProfileValidationResult,
): string[] {
  return result.errors.map((error) => error.message)
}

/** The subset of validation that decides whether the record may be stored.
 * Configuration issues are deliberately excluded: they are shown and corrected
 * in the UI, and blocking the write would trap the profile in its bad state. */
export function controllerProfileRecordIssues(
  result: ControllerProfileValidationResult,
): ControllerProfileValidationIssue[] {
  return result.errors.filter((error) => error.kind !== 'configuration')
}

function collectDuplicateIds(
  records: Array<{ id: string }>,
  label: string,
  errors: ControllerProfileValidationIssue[],
): void {
  const seen = new Set<string>()
  for (const record of records) {
    if (seen.has(record.id)) {
      errors.push({
        path: record.id,
        message: `${capitalize(label)} id "${record.id}" is duplicated.`,
      })
    }
    seen.add(record.id)
  }
}

function normalizeZoneName(name: string): string {
  return name.trim().toLocaleLowerCase()
}

function formatIoList(pins: number[]): string {
  return pins.map((pin) => `IO${pin}`).join(', ')
}

function wrapperLabel(type: ControllerWrapperType): string {
  return type === 'slow-mo' ? 'Slow-mo' : 'Dreamy'
}

function globalInputUseLabel(use: GlobalInputUse): string {
  return use === 'hardware-brightness' ? 'Brightness' : wrapperLabel(use)
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

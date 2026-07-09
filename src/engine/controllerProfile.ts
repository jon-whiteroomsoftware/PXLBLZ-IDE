export type ControllerBoardKind = 'pixelblaze-v3-standard'

export interface ControllerBoardProfile {
  kind: ControllerBoardKind
  hardwareRevision?: number
  firmwareVersion?: string
}

export type ControllerInputSignal = 'analog' | 'digital'
export type ControllerInputRole = 'brightness' | 'assignable' | 'next-pattern'

export interface ControllerInput {
  id: string
  name: string
  pin: number
  signal: ControllerInputSignal
  role: ControllerInputRole
  smoothing: number
  fallback: number
  invert: boolean
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
  | {
      id: string
      type: 'power-cap'
      enabled: boolean
      mixinId: string
      maxMilliamps: number
    }

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

interface LegacyControllerZone {
  id: string
  name: string
  start: number
  end: number
}

export interface ControllerProfile {
  id: string
  name: string
  deviceId?: string
  /** Last mutable name reported by the physical Pixelblaze. Claimed profiles
   *  mirror this into `name`; older records may still need this as display fallback. */
  lastKnownDeviceName?: string
  /** Last transport IP seen for this physical device. Convenience only, not identity. */
  lastSeenIp?: string
  /** Last reported pixel count for offline display on the profile page. */
  lastKnownPixelCount?: number
  /** Last installed map dimensionality for offline display on the profile page. */
  lastKnownMapDim?: 1 | 2 | 3
  /** Encoded `/pixelmap.dat` fingerprints for maps this IDE pushed to the device. */
  mapFingerprints?: ControllerMapFingerprint[]
  board: ControllerBoardProfile
  inputs: ControllerInput[]
  globalTransforms: GlobalTransform[]
  patternBindings: PatternBinding[]
  zones: ControllerZone[]
  updatedAt: number
}

export function controllerProfileDisplayName(profile: ControllerProfile): string {
  return profile.lastKnownDeviceName ?? profile.name
}

export interface ControllerProfileValidationIssue {
  path: string
  message: string
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

export function normalizeControllerZone(zone: ControllerZone | LegacyControllerZone): ControllerZone {
  if ('ranges' in zone) {
    return {
      id: zone.id,
      name: zone.name,
      ranges: zone.ranges.map((range) => ({ start: range.start, end: range.end })),
    }
  }
  return {
    id: zone.id,
    name: zone.name,
    ranges: [{ start: zone.start, end: zone.end }],
  }
}

export function normalizeControllerZones(
  zones: Array<ControllerZone | LegacyControllerZone>,
): ControllerZone[] {
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

export interface ParseControllerZoneRangesOk {
  ok: true
  ranges: ControllerZoneRange[]
}

export interface ParseControllerZoneRangesFail {
  ok: false
  message: string
}

export type ParseControllerZoneRangesResult =
  | ParseControllerZoneRangesOk
  | ParseControllerZoneRangesFail

export function parseControllerZoneRanges(text: string): ParseControllerZoneRangesResult {
  const parts = text
    .split(/[,;\n]|(?:\s+[·•]\s+)/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) {
    return { ok: false, message: 'Enter at least one pixel range.' }
  }

  const ranges: ControllerZoneRange[] = []
  for (const part of parts) {
    const match = part.match(/^(\d+)(?:\s*(?:-|–|—|\.\.)\s*(\d+))?$/)
    if (!match) {
      return { ok: false, message: `Range "${part}" must look like 0-63.` }
    }
    const start = Number(match[1])
    const end = Number(match[2] ?? match[1])
    ranges.push({ start, end })
  }
  return { ok: true, ranges }
}

export function formatControllerZoneRanges(zone: ControllerZone): string {
  return normalizeControllerZone(zone).ranges
    .map((range) => (range.start === range.end ? String(range.start) : `${range.start}-${range.end}`))
    .join(', ')
}

export function validateControllerProfile(
  profile: ControllerProfile,
): ControllerProfileValidationResult {
  const errors: ControllerProfileValidationIssue[] = []
  const inputIds = new Set<string>()
  const analogPins = analogPinsForBoard(profile.board)

  collectDuplicateIds(profile.inputs, 'input', errors)
  collectDuplicateIds(profile.globalTransforms, 'global transform', errors)
  collectDuplicateIds(profile.patternBindings, 'pattern binding', errors)
  const zones = normalizeControllerZones(profile.zones)
  collectDuplicateIds(zones, 'zone', errors)

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
    if (transform.type === 'hardware-brightness' && transform.enabled && !inputIds.has(transform.inputId)) {
      errors.push({
        path: `globalTransforms.${transform.id}.inputId`,
        message: `Global transform "${transform.id}" references missing input "${transform.inputId}".`,
      })
    }
    if (transform.type === 'power-cap' && transform.maxMilliamps <= 0) {
      errors.push({
        path: `globalTransforms.${transform.id}.maxMilliamps`,
        message: `Global transform "${transform.id}" maxMilliamps must be greater than 0.`,
      })
    }
  }

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

  collectDuplicateZoneNames(zones, errors)

  for (const zone of zones) {
    if (zone.name.trim() === '') {
      errors.push({
        path: `zones.${zone.id}.name`,
        message: `Zone "${zone.id}" needs a name.`,
      })
    }
    if (zone.ranges.length === 0) {
      errors.push({
        path: `zones.${zone.id}.ranges`,
        message: `Zone "${zone.name}" needs at least one pixel range.`,
      })
    }
    for (const [rangeIndex, range] of zone.ranges.entries()) {
      if (!Number.isInteger(range.start) || !Number.isInteger(range.end)) {
        errors.push({
          path: `zones.${zone.id}.ranges.${rangeIndex}`,
          message: `Zone "${zone.name}" range ${rangeIndex + 1} must use whole-number pixel indices.`,
        })
        continue
      }
      if (range.start < 0 || range.end < 0) {
        errors.push({
          path: `zones.${zone.id}.ranges.${rangeIndex}`,
          message: `Zone "${zone.name}" range ${rangeIndex + 1} cannot use negative pixel indices.`,
        })
      }
      if (range.start > range.end) {
        errors.push({
          path: `zones.${zone.id}.ranges.${rangeIndex}`,
          message: `Zone "${zone.name}" range ${rangeIndex + 1} start must be less than or equal to end.`,
        })
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

export function controllerProfileValidationErrors(
  result: ControllerProfileValidationResult,
): string[] {
  return result.errors.map((error) => error.message)
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

function collectDuplicateZoneNames(
  zones: ControllerZone[],
  errors: ControllerProfileValidationIssue[],
): void {
  const seen = new Set<string>()
  for (const zone of zones) {
    const name = normalizeZoneName(zone.name)
    if (!name) continue
    if (seen.has(name)) {
      errors.push({
        path: `zones.${zone.id}.name`,
        message: `Zone name "${zone.name}" is duplicated.`,
      })
    }
    seen.add(name)
  }
}

function normalizeZoneName(name: string): string {
  return name.trim().toLocaleLowerCase()
}

function formatIoList(pins: number[]): string {
  return pins.map((pin) => `IO${pin}`).join(', ')
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

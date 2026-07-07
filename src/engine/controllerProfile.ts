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

export interface ControllerZone {
  id: string
  name: string
  start: number
  end: number
}

export interface ControllerProfile {
  id: string
  name: string
  deviceId?: string
  board: ControllerBoardProfile
  inputs: ControllerInput[]
  globalTransforms: GlobalTransform[]
  patternBindings: PatternBinding[]
  zones: ControllerZone[]
  updatedAt: number
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

export function validateControllerProfile(
  profile: ControllerProfile,
): ControllerProfileValidationResult {
  const errors: ControllerProfileValidationIssue[] = []
  const inputIds = new Set<string>()
  const analogPins = analogPinsForBoard(profile.board)

  collectDuplicateIds(profile.inputs, 'input', errors)
  collectDuplicateIds(profile.globalTransforms, 'global transform', errors)
  collectDuplicateIds(profile.patternBindings, 'pattern binding', errors)
  collectDuplicateIds(profile.zones, 'zone', errors)

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
    if (transform.type === 'hardware-brightness' && !inputIds.has(transform.inputId)) {
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

  for (const zone of profile.zones) {
    if (zone.start > zone.end) {
      errors.push({
        path: `zones.${zone.id}`,
        message: `Zone "${zone.id}" start must be less than or equal to end.`,
      })
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

function formatIoList(pins: number[]): string {
  return pins.map((pin) => `IO${pin}`).join(', ')
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

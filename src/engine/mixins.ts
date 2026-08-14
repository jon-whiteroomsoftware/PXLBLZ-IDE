import type { MixinPassKind, MixinRecord } from './personalContentRecords'

export type { MixinPassKind, MixinRecord }

export interface MixinParam {
  name: string
  description: string
}

export interface MixinHeader {
  params: MixinParam[]
  target: string
  targetDescription: string
  wraps: string
  wrapsDescription: string
}

export interface MixinParseError {
  line: number
  column: number
  message: string
}

export interface StockMixinSpec {
  id: string
  name: string
  kind: MixinPassKind
  src: string
}

export const MIXIN_SKELETON = `// Untitled Mixin
// @param VALUE binding-supplied value
// @target CONTROL
// @wraps beforeRender

export var mixinValue = 0

export function beforeRender(delta) {
  mixinValue = VALUE
  CONTROL(mixinValue)
}
`

export function parseMixinHeader(source: string): MixinParseError[] {
  const lines = source.split(/\r?\n/)
  const params = new Set<string>()
  let targetLine = 0
  let wrapsLine = 0
  const errors: MixinParseError[] = []

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    const trimmed = line.trim()
    const directive = /^\/\/\s*@(\w+)\b(.*)$/.exec(trimmed)
    if (!directive) return

    const [, tag, rawRest] = directive
    const rest = rawRest.trim()
    if (tag === 'param') {
      const [name] = rest.split(/\s+/, 1)
      if (!name) {
        errors.push({ line: lineNumber, column: line.indexOf('@param'), message: '@param requires a name' })
      } else {
        params.add(name)
      }
      return
    }
    if (tag === 'target') {
      if (targetLine !== 0) {
        errors.push({ line: lineNumber, column: line.indexOf('@target'), message: 'Only one @target is allowed' })
      } else if (!rest) {
        errors.push({ line: lineNumber, column: line.indexOf('@target'), message: '@target requires a slot name' })
      } else {
        targetLine = lineNumber
      }
      return
    }
    if (tag === 'wraps') {
      if (wrapsLine !== 0) {
        errors.push({ line: lineNumber, column: line.indexOf('@wraps'), message: 'Only one @wraps is allowed' })
      } else if (!rest) {
        errors.push({ line: lineNumber, column: line.indexOf('@wraps'), message: '@wraps requires an injection point' })
      } else {
        wrapsLine = lineNumber
      }
      return
    }
    errors.push({
      line: lineNumber,
      column: line.indexOf(`@${tag}`),
      message: `Unknown directive @${tag}; expected @param, @target, or @wraps`,
    })
  })

  if (params.size === 0) errors.push({ line: 1, column: 0, message: 'Mixin header needs at least one @param' })
  if (targetLine === 0) errors.push({ line: 1, column: 0, message: 'Mixin header needs @target' })
  if (wrapsLine === 0) errors.push({ line: 1, column: 0, message: 'Mixin header needs @wraps' })
  return errors
}

export function readMixinHeader(source: string): MixinHeader {
  const params: MixinParam[] = []
  let target = ''
  let targetDescription = ''
  let wraps = ''
  let wrapsDescription = ''

  for (const line of source.split(/\r?\n/)) {
    const match = /^\/\/\s*@(\w+)\b(.*)$/.exec(line.trim())
    if (!match) continue
    const [, tag, rawRest] = match
    // Every directive value is a single token; anything after it is prose
    // description, never part of the value (#782).
    const [value = '', ...description] = rawRest.trim().split(/\s+/)
    if (tag === 'param') {
      if (value) params.push({ name: value, description: description.join(' ') })
    } else if (tag === 'target') {
      target = value
      targetDescription = description.join(' ')
    } else if (tag === 'wraps') {
      wraps = value
      wrapsDescription = description.join(' ')
    }
  }

  return { params, target, targetDescription, wraps, wrapsDescription }
}

const POT_BINDING_SOURCE = `// Pot Binding - read an analog input once per frame and drive one
// pattern control. The pass engine fills the @params where this mixin is bound.
//
// Pixelblaze V3 Standard analog inputs use the numeric part of their IO label:
// IO33 -> 33 on every V3 Standard; IO34, IO35, IO36, and IO39 require HW >= 3.5.
// @param PIN analog input pin number, e.g. 33 for IO33
// @param SMOOTHING 0..1 exponential smoothing per frame
// @param FALLBACK value used before the first stable read
// @target CONTROL slider function or variable slot to drive
// @wraps beforeRender

export var potBindingValue = FALLBACK

export function beforeRender(delta) {
  var raw = analogRead(PIN)
  potBindingValue = potBindingValue + (raw - potBindingValue) * SMOOTHING
  CONTROL(potBindingValue)
}
`

const HARDWARE_BRIGHTNESS_SOURCE = `// Hardware Brightness - multiply every hsv()/rgb() output by a binding-supplied
// hardware brightness scalar without changing the authored pattern source.
//
// @param BRIGHTNESS 0..1 controller-level brightness scalar
// @target hsv,rgb
// @wraps output-call

function __px_hardwareBrightness(h, s, v) {
  hsv(h, s, v * BRIGHTNESS)
}

function __px_hardwareBrightnessRgb(r, g, b) {
  rgb(r * BRIGHTNESS, g * BRIGHTNESS, b * BRIGHTNESS)
}
`

const POWER_MEASURE_SOURCE = `// Power Measure - estimate output duty from intercepted hsv() calls and export
// private IDE telemetry. Measurement-only: it does not alter rendered output.
//
// @param FULL_WHITE_MILLIAMPS estimated current when every RGB channel is full on
// @param RECENT_WINDOW_MS calm telemetry publication interval
// @param SINCE_START_MAX_FRAMES fixed-point-safe cumulative-mean weight ceiling
// @target hsv
// @wraps hsv-call

export var __px_powerDutyRecent = 0
export var __px_powerDutySinceStart = 0
export var __px_powerMilliAmps = 0
export var __px_powerLimit = 0
export var __px_powerScale = 1
export var __px_powerClipping = 0

var __px_powerFrameDuty = 0
var __px_powerFrameSamples = 0
var __px_powerRecentDutyMs = 0
var __px_powerRecentElapsedMs = 0
var __px_powerSinceFrames = 0

function __px_powerMeasureHsv(h, s, v) {
  var duty = max(0, min(1, v)) * (1 - max(0, min(1, s)) * 0.5)
  __px_powerFrameDuty = __px_powerFrameDuty + duty
  __px_powerFrameSamples = __px_powerFrameSamples + 1
  hsv(h, s, v)
}

function __px_powerFinalizeFrame(delta) {
  if (__px_powerFrameSamples <= 0) return
  var frameDuty = __px_powerFrameDuty / __px_powerFrameSamples
  var elapsed = max(0, delta)

  __px_powerRecentDutyMs = __px_powerRecentDutyMs + frameDuty * elapsed
  __px_powerRecentElapsedMs = __px_powerRecentElapsedMs + elapsed
  __px_powerSinceFrames = min(SINCE_START_MAX_FRAMES, __px_powerSinceFrames + 1)
  __px_powerDutySinceStart = __px_powerDutySinceStart + (frameDuty - __px_powerDutySinceStart) / __px_powerSinceFrames

  if (__px_powerRecentElapsedMs >= RECENT_WINDOW_MS) {
    __px_powerDutyRecent = __px_powerRecentDutyMs / __px_powerRecentElapsedMs
    __px_powerMilliAmps = __px_powerDutyRecent * FULL_WHITE_MILLIAMPS
    __px_powerRecentDutyMs = 0
    __px_powerRecentElapsedMs = 0
  }

  __px_powerScale = 1
  __px_powerClipping = 0
  __px_powerFrameDuty = 0
  __px_powerFrameSamples = 0
}

export function beforeRender(delta) {
  __px_powerFinalizeFrame(delta)
}
`

const POWER_CAP_SOURCE = `// Power Cap - estimate output duty from intercepted hsv()/rgb() calls and scale output
// when a short frame-level EWMA exceeds the configured duty budget. Display
// telemetry uses separate recent and since-start windows.
//
// @param MAX_DUTY controller output-duty budget, 0..1
// @param RECENT_WINDOW_MS calm telemetry publication interval
// @param CAP_RESPONSE_MS cap EWMA response time
// @param SINCE_START_MAX_FRAMES fixed-point-safe cumulative-mean weight ceiling
// @target hsv,rgb
// @wraps output-call

export var __px_powerDutyRecent = 0
export var __px_powerDutySinceStart = 0
export var __px_powerLimit = MAX_DUTY
export var __px_powerScale = 1
export var __px_powerClipping = 0

var __px_powerFrameDuty = 0
var __px_powerFrameSamples = 0
var __px_powerRecentDutyMs = 0
var __px_powerRecentElapsedMs = 0
var __px_powerSinceFrames = 0
var __px_powerCapDuty = 0
var __px_powerCapInitialized = 0

function __px_cappedHsv(h, s, v) {
  var duty = max(0, min(1, v)) * (1 - max(0, min(1, s)) * 0.5)
  __px_powerFrameDuty = __px_powerFrameDuty + duty
  __px_powerFrameSamples = __px_powerFrameSamples + 1
  hsv(h, s, v * __px_powerScale)
}

function __px_cappedRgb(r, g, b) {
  var duty = (max(0, min(1, r)) + max(0, min(1, g)) + max(0, min(1, b))) / 3
  __px_powerFrameDuty = __px_powerFrameDuty + duty
  __px_powerFrameSamples = __px_powerFrameSamples + 1
  rgb(r * __px_powerScale, g * __px_powerScale, b * __px_powerScale)
}

function __px_powerFinalizeFrame(delta) {
  if (__px_powerFrameSamples <= 0) return
  var frameDuty = __px_powerFrameDuty / __px_powerFrameSamples
  var elapsed = max(0, delta)

  __px_powerRecentDutyMs = __px_powerRecentDutyMs + frameDuty * elapsed
  __px_powerRecentElapsedMs = __px_powerRecentElapsedMs + elapsed
  __px_powerSinceFrames = min(SINCE_START_MAX_FRAMES, __px_powerSinceFrames + 1)
  __px_powerDutySinceStart = __px_powerDutySinceStart + (frameDuty - __px_powerDutySinceStart) / __px_powerSinceFrames

  if (__px_powerCapInitialized) {
    var alpha = min(1, elapsed / CAP_RESPONSE_MS)
    __px_powerCapDuty = __px_powerCapDuty + (frameDuty - __px_powerCapDuty) * alpha
  } else {
    __px_powerCapDuty = frameDuty
    __px_powerCapInitialized = 1
  }

  __px_powerScale = __px_powerCapDuty > __px_powerLimit ? max(0, min(1, __px_powerLimit / __px_powerCapDuty)) : 1
  __px_powerClipping = __px_powerScale < 1 ? 1 : 0

  if (__px_powerRecentElapsedMs >= RECENT_WINDOW_MS) {
    __px_powerDutyRecent = __px_powerRecentDutyMs / __px_powerRecentElapsedMs
    __px_powerRecentDutyMs = 0
    __px_powerRecentElapsedMs = 0
  }

  __px_powerFrameDuty = 0
  __px_powerFrameSamples = 0
}

export function beforeRender(delta) {
  __px_powerFinalizeFrame(delta)
}
`

const SENSOR_PULSE_SOURCE = `// Sensor Pulse - inject a frame-level envelope from the sensor expansion board
// around an otherwise unmodified pattern.
//
// @param GAIN multiplier applied after the noise floor
// @param DECAY 0..1 envelope decay
// @param FLOOR noise floor subtracted from the raw sensor energy
// @target SENSOR_PULSE
// @wraps beforeRender

export var sensorPulse = 0
export var sensorEnergy = 0

export function beforeRender(delta) {
  var raw = max(energyAverage, maxFrequencyMagnitude)
  sensorEnergy = max(0, raw - FLOOR) * GAIN
  sensorPulse = max(sensorEnergy, sensorPulse * DECAY)
}
`

const NIGHT_SCHEDULER_SOURCE = `// Night Scheduler - inject a time-window dimmer for controller or show bindings.
//
// @param START_HOUR local hour where dimming begins
// @param END_HOUR local hour where dimming ends
// @param NIGHT_LEVEL 0..1 brightness while inside the window
// @target BRIGHTNESS
// @wraps beforeRender

export var scheduledBrightness = 1

function __px_isScheduledNight(hour, startHour, endHour) {
  if (startHour == endHour) return 0
  if (startHour < endHour) return hour >= startHour && hour < endHour
  return hour >= startHour || hour < endHour
}

export function beforeRender(delta) {
  var hour = clockHour() + clockMinute() / 60
  scheduledBrightness = __px_isScheduledNight(hour, START_HOUR, END_HOUR) ? NIGHT_LEVEL : 1
  BRIGHTNESS(scheduledBrightness)
}
`

export const STOCK_MIXIN_SPECS: StockMixinSpec[] = [
  { id: 'pot-binding', name: 'pot-binding', kind: 'bind', src: POT_BINDING_SOURCE },
  { id: 'hw-brightness', name: 'hw-brightness', kind: 'intercept', src: HARDWARE_BRIGHTNESS_SOURCE },
  { id: 'power-measure', name: 'power-measure', kind: 'intercept', src: POWER_MEASURE_SOURCE },
  { id: 'power-cap', name: 'power-cap', kind: 'intercept', src: POWER_CAP_SOURCE },
  { id: 'sensor-pulse', name: 'sensor-pulse', kind: 'inject', src: SENSOR_PULSE_SOURCE },
  { id: 'night-scheduler', name: 'night-scheduler', kind: 'inject', src: NIGHT_SCHEDULER_SOURCE },
]

export function stockMixinSpec(id: string): StockMixinSpec | undefined {
  return STOCK_MIXIN_SPECS.find((spec) => spec.id === id)
}

export const STOCK_MIXIN_ITEMS = STOCK_MIXIN_SPECS.map(({ id, name, kind }) => ({ id, name, kind }))

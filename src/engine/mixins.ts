import type { MixinPassKind, MixinRecord } from './personalContentRecords'

export type { MixinPassKind, MixinRecord }

export interface MixinParam {
  name: string
  description: string
}

export interface MixinHeader {
  params: MixinParam[]
  target: string
  wraps: string
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
    }
  })

  if (params.size === 0) errors.push({ line: 1, column: 0, message: 'Mixin header needs at least one @param' })
  if (targetLine === 0) errors.push({ line: 1, column: 0, message: 'Mixin header needs @target' })
  if (wrapsLine === 0) errors.push({ line: 1, column: 0, message: 'Mixin header needs @wraps' })
  return errors
}

export function readMixinHeader(source: string): MixinHeader {
  const params: MixinParam[] = []
  let target = ''
  let wraps = ''

  for (const line of source.split(/\r?\n/)) {
    const match = /^\/\/\s*@(\w+)\b(.*)$/.exec(line.trim())
    if (!match) continue
    const [, tag, rawRest] = match
    const rest = rawRest.trim()
    if (tag === 'param') {
      const [name, ...description] = rest.split(/\s+/)
      if (name) params.push({ name, description: description.join(' ') })
    } else if (tag === 'target') {
      target = rest
    } else if (tag === 'wraps') {
      wraps = rest
    }
  }

  return { params, target, wraps }
}

const POT_BINDING_SOURCE = `// Pot Binding - read an analog input once per frame and drive one
// pattern control. The pass engine fills the @params where this mixin is bound.
//
// @param PIN analog input pin, e.g. A2 on ADC1-safe Pixelblaze pins
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

const HARDWARE_BRIGHTNESS_SOURCE = `// Hardware Brightness - multiply every hsv() value by a binding-supplied
// hardware brightness scalar without changing the authored pattern source.
//
// @param BRIGHTNESS 0..1 controller-level brightness scalar
// @target hsv
// @wraps hsv-call

function __px_hardwareBrightness(h, s, v) {
  hsv(h, s, v * BRIGHTNESS)
}
`

const POWER_MEASURE_SOURCE = `// Power Measure - estimate output duty from intercepted hsv() calls and export
// private IDE telemetry. Measurement-only: it does not alter rendered output.
//
// @param FULL_WHITE_MILLIAMPS estimated current when every RGB channel is full on
// @target hsv
// @wraps hsv-call

export var __px_powerDuty = 0
export var __px_powerMilliAmps = 0
export var __px_powerLimit = 0
export var __px_powerScale = 1
export var __px_powerClipping = 0

var __px_powerSamples = 0

function __px_powerMeasureHsv(h, s, v) {
  var duty = max(0, min(1, v)) * (1 - max(0, min(1, s)) * 0.5)
  __px_powerSamples = __px_powerSamples + 1
  __px_powerDuty = __px_powerDuty + (duty - __px_powerDuty) / __px_powerSamples
  __px_powerMilliAmps = __px_powerDuty * FULL_WHITE_MILLIAMPS
  __px_powerScale = 1
  __px_powerClipping = 0
  hsv(h, s, v)
}
`

const POWER_CAP_SOURCE = `// Power Cap - estimate output duty from intercepted hsv() calls and scale value
// when the running estimate exceeds the configured current budget.
//
// @param MAX_MILLIAMPS controller power budget
// @param FULL_WHITE_MILLIAMPS estimated current when every RGB channel is full on
// @target hsv
// @wraps hsv-call

export var __px_powerDuty = 0
export var __px_powerMilliAmps = 0
export var __px_powerLimit = MAX_MILLIAMPS
export var __px_powerScale = 1
export var __px_powerClipping = 0

var __px_powerSamples = 0

function __px_cappedHsv(h, s, v) {
  var duty = max(0, min(1, v)) * (1 - max(0, min(1, s)) * 0.5)
  __px_powerSamples = __px_powerSamples + 1
  __px_powerDuty = __px_powerDuty + (duty - __px_powerDuty) / __px_powerSamples
  var __px_powerEstimate = __px_powerDuty * FULL_WHITE_MILLIAMPS
  __px_powerLimit = MAX_MILLIAMPS
  __px_powerScale = __px_powerEstimate > MAX_MILLIAMPS ? max(0, min(1, MAX_MILLIAMPS / __px_powerEstimate)) : 1
  __px_powerClipping = __px_powerScale < 1 ? 1 : 0
  __px_powerMilliAmps = __px_powerEstimate * __px_powerScale
  hsv(h, s, v * __px_powerScale)
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

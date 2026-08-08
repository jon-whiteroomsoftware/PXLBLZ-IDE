export interface GpioBuiltinFunction {
  name: string
  params: string[]
  doc: string
}

export interface GpioBuiltinConstant {
  name: string
  previewValue: number
  doc: string
}

export const GPIO_BUILTIN_FUNCTIONS: readonly GpioBuiltinFunction[] = [
  { name: 'readAdc', params: [],
    doc: 'Read the V2 Controller ADC value from 0 to 1. Pixelblaze V2 only.' },
  { name: 'analogRead', params: ['pin'],
    doc: 'Read an analog GPIO pin from 0 to 1. Pixelblaze V3 only; configure the pin with `pinMode(pin, ANALOG)` first.' },
  { name: 'pinMode', params: ['pin', 'mode'],
    doc: 'Configure a GPIO pin using a supported input, output, or analog mode constant.' },
  { name: 'digitalWrite', params: ['pin', 'state'],
    doc: 'Set a GPIO pin `HIGH` or `LOW`. Any non-zero state is high.' },
  { name: 'digitalRead', params: ['pin'],
    doc: 'Read a GPIO pin as `HIGH` (1) or `LOW` (0).' },
  { name: 'touchRead', params: ['pin'],
    doc: 'Read capacitive touch or proximity on a GPIO pin from 0 to 1. Pixelblaze V3 also accepts documented touch constants.' },
]

// Pixelblaze documents these as opaque names rather than numeric values. The
// preview values keep selectors distinct while hardware I/O remains stubbed;
// they are never emitted into the authored Pattern or Controller artifact.
export const GPIO_BUILTIN_CONSTANTS: readonly GpioBuiltinConstant[] = [
  { name: 'INPUT', previewValue: 0,
    doc: 'GPIO input mode for `pinMode()`.' },
  { name: 'INPUT_PULLUP', previewValue: 1,
    doc: 'GPIO input mode with an internal pull-up resistor.' },
  { name: 'INPUT_PULLDOWN', previewValue: 2,
    doc: 'GPIO input mode with an internal pull-down resistor.' },
  { name: 'OUTPUT', previewValue: 3,
    doc: 'GPIO push-pull output mode.' },
  { name: 'OUTPUT_OPEN_DRAIN', previewValue: 4,
    doc: 'GPIO open-drain output mode.' },
  { name: 'ANALOG', previewValue: 5,
    doc: 'Analog input mode for `pinMode()` on Pixelblaze V3.' },
  { name: 'INPUT_PULLDOWN_16', previewValue: 6,
    doc: 'Pixelblaze V2 compatibility mode for a pull-down input on GP16.' },
  { name: 'LOW', previewValue: 0,
    doc: 'Low digital GPIO state (0).' },
  { name: 'HIGH', previewValue: 1,
    doc: 'High digital GPIO state (1).' },
  { name: 'T0', previewValue: 0,
    doc: 'Pixelblaze V3 touch input constant accepted by `touchRead()`.' },
  { name: 'T2', previewValue: 2,
    doc: 'Pixelblaze V3 touch input constant accepted by `touchRead()`.' },
  { name: 'T4', previewValue: 4,
    doc: 'Pixelblaze V3 touch input constant accepted by `touchRead()`.' },
  { name: 'T6', previewValue: 6,
    doc: 'Pixelblaze V3 touch input constant accepted by `touchRead()`.' },
  { name: 'T7', previewValue: 7,
    doc: 'Pixelblaze V3 touch input constant accepted by `touchRead()`.' },
]

export const GPIO_PREVIEW_CONSTANTS = Object.fromEntries(
  GPIO_BUILTIN_CONSTANTS.map(({ name, previewValue }) => [name, previewValue]),
)

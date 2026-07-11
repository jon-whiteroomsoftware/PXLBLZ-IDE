export type FirmwareUpdateState =
  | 'unknown'
  | 'checking'
  | 'in-progress'
  | 'error'
  | 'current'
  | 'available'
  | 'complete'

const FIRMWARE_UPDATE_STATES: Record<number, FirmwareUpdateState> = {
  0: 'unknown',
  1: 'checking',
  2: 'in-progress',
  3: 'error',
  4: 'current',
  5: 'available',
  6: 'complete',
}

export function decodeFirmwareUpdateState(value: unknown): FirmwareUpdateState {
  if (typeof value !== 'object' || value === null || !('code' in value)) return 'unknown'
  const code = (value as { code?: unknown }).code
  return typeof code === 'number' ? (FIRMWARE_UPDATE_STATES[code] ?? 'unknown') : 'unknown'
}

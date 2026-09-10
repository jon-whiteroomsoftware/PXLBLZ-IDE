/** Snapshot validity is checked again after asynchronous JPEG preparation. */
export function showDeliveryInvalidationMessage(input: {
  controllerIp: string | null
  activeIp: string | null
  phase: string | undefined
  liveEpoch: number
  expectedLiveEpoch: number
  currentSnapshot: boolean
}): string | null {
  if (input.controllerIp !== input.activeIp || input.phase !== 'live' || input.liveEpoch !== input.expectedLiveEpoch) {
    return 'Controller session changed before Show delivery'
  }
  return input.currentSnapshot ? null : 'Show changed before delivery; try again'
}

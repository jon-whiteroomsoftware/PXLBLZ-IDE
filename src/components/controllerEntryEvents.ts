const CONTROLLER_ENTRY_EVENT = 'pxlblz:open-controller-entry'

export function requestControllerEntryOpen(): void {
  window.dispatchEvent(new CustomEvent(CONTROLLER_ENTRY_EVENT))
}

export function onControllerEntryRequested(handler: () => void): () => void {
  window.addEventListener(CONTROLLER_ENTRY_EVENT, handler)
  return () => window.removeEventListener(CONTROLLER_ENTRY_EVENT, handler)
}

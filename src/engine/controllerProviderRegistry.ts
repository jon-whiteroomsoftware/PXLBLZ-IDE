// The single place the app reaches the active ControllerProvider (H4, issue #196).
// Holds one provider instance behind the H2 seam so the nav indicator (and later
// the H5 panel) can subscribe to status without importing a concrete backend.
//
// Defaults to NullControllerProvider (permanently no-helper) so the UI renders
// against the seam before any helper exists. The H3 extension provider swaps
// itself in via `setControllerProvider`; tests do the same with a fake.
//
// Pure TypeScript, zero React, zero transport specifics.

import { NullControllerProvider, type ControllerProvider } from './ControllerProvider'

let active: ControllerProvider = new NullControllerProvider()

export function getControllerProvider(): ControllerProvider {
  return active
}

/** Swap the active provider. Used by the real backend at startup and by tests. */
export function setControllerProvider(provider: ControllerProvider): void {
  active = provider
}

/** Reset to the default no-helper provider (test teardown / app reset). */
export function resetControllerProvider(): void {
  active = new NullControllerProvider()
}

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { mapDimension, type MapDimension } from '@/engine/sendToController'

// Connection orchestration for the live Controller (H5, issue #197).
//
// This store owns ONE thing the provider seam deliberately doesn't: the
// user-entered Controller address, persisted so the app can auto-reconnect on
// reload. Connection *truth* (connecting/connected/error) is not duplicated here
// — it lives in the ControllerProvider and the UI reads it via getStatus/subscribe
// (see ConnectionStatus). This store just drives connect/disconnect through the
// seam and remembers the address.
//
// Single-Controller for now (#197): one persisted IP. Shaped so discovery + a
// multi-Controller set can be layered on later (#206) without tearing this out —
// `connect(address)` already takes an explicit address rather than assuming `ip`.

interface ControllerConnectionState {
  /** Last address the user entered. '' means nothing has ever been entered. */
  ip: string
  /** The connected Controller's installed-map dimensionality, read back on connect
   *  to gate Send-to-Controller (H9). null when disconnected or unreadable — the
   *  gate treats null as "unknown", not "mismatch". Not persisted (live device
   *  state, re-read every connect). */
  mapDim: MapDimension
  setIp: (ip: string) => void
  /** Connect to `address` (defaults to the stored ip). Persists the address.
   *  Rejection propagates so a manual attempt surfaces the provider's error state. */
  connect: (address?: string) => Promise<void>
  disconnect: () => Promise<void>
  /** Startup auto-reconnect: if an address is remembered, try it. On failure leave
   *  the Controller disconnected — no error nag, no retry loop. */
  autoConnect: () => Promise<void>
  /** Read the installed map back through the seam and cache its dimensionality.
   *  Tolerates failure (unconfirmed capability) by leaving mapDim null. */
  refreshMap: () => Promise<void>
}

export const controllerInitialState = { ip: '', mapDim: null as MapDimension }

export const useControllerStore = create<ControllerConnectionState>()(
  persist(
    (set, get) => ({
      ...controllerInitialState,
      setIp: (ip) => set({ ip: ip.trim() }),
      connect: async (address) => {
        const target = (address ?? get().ip).trim()
        if (!target) return
        set({ ip: target })
        await getControllerProvider().connect({ address: target })
        await get().refreshMap()
      },
      disconnect: async () => {
        await getControllerProvider().disconnect()
        set({ mapDim: null })
      },
      autoConnect: async () => {
        const target = get().ip.trim()
        if (!target) return
        try {
          await getControllerProvider().connect({ address: target })
          await get().refreshMap()
        } catch {
          // Controller not reachable on load: clear any error state back to a plain
          // disconnected status. The remembered ip stays so the user can retry.
          await getControllerProvider().disconnect().catch(() => {})
        }
      },
      refreshMap: async () => {
        const map = await getControllerProvider()
          .getPixelMap()
          .catch(() => null)
        set({ mapDim: mapDimension(map) })
      },
    }),
    {
      name: 'pixelblaze-controller',
      partialize: (s) => ({ ip: s.ip }),
    },
  ),
)

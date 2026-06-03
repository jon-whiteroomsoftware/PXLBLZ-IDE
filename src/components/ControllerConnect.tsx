import { useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { useControllerStore } from '@/store/controllerStore'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'

// Header connect surface for the live Controller (H5, issue #197): an IP input
// plus Go, sitting next to the H4 status indicator (ConnectionStatus). The
// indicator reflects connecting/connected/error; this component only drives the
// connect/disconnect flow and owns the editable address draft.
//
// Single-Controller for now. The IP field is *one* source of an address — kept
// thin so a discovered-list source (#206) can feed the same connect() later.
export function ControllerConnect() {
  const provider = getControllerProvider()
  const status = useSyncExternalStore(
    (onChange) => provider.subscribe(onChange),
    () => provider.getStatus(),
  )

  const persistedIp = useControllerStore((s) => s.ip)
  const connect = useControllerStore((s) => s.connect)
  const disconnect = useControllerStore((s) => s.disconnect)

  // Seeded from the persisted ip (localStorage is synchronous, so it's present on
  // first render); the user edits this freely before hitting Go.
  const [draft, setDraft] = useState(persistedIp)

  const connecting = status.kind === 'connecting'
  const connected = status.kind === 'connected'

  const handleGo = () => {
    if (!draft.trim()) return
    // Swallow rejection here: the failure is already reflected in provider status,
    // which the indicator renders. We only avoid an unhandled promise.
    void connect(draft).catch(() => {})
  }

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        handleGo()
      }}
    >
      <input
        type="text"
        inputMode="decimal"
        aria-label="Controller IP address"
        placeholder="Controller IP"
        value={draft}
        // No native IP input type exists; keep it a temporary affordance and just
        // restrict to the IPv4 alphabet (digits + dots) — no octet-range checking.
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
        disabled={connecting}
        data-testid="controller-ip-input"
        className="h-6 w-28 rounded border border-zinc-500 bg-zinc-900 px-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 hover:border-zinc-400 focus:border-zinc-400 focus:outline-none disabled:opacity-50"
      />
      {connected ? (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300"
          onClick={() => void disconnect().catch(() => {})}
          data-testid="controller-disconnect"
        >
          Disconnect
        </Button>
      ) : (
        <Button
          type="submit"
          size="xs"
          variant="ghost"
          className="text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300 disabled:opacity-30"
          disabled={connecting || !draft.trim()}
          data-testid="controller-go"
        >
          {connecting ? '…' : 'Go'}
        </Button>
      )}
    </form>
  )
}

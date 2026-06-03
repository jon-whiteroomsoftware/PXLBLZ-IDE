import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { useControllerStore } from '@/store/controllerStore'
import { useEditorStore } from '@/store/editorStore'
import { describeSendToController } from '@/engine/sendToController'

// The editor-header "Send to Controller" action (H9, issue #201). One verb that
// will (in H10) run *and* store the open pattern on the connected Controller,
// overwrite-in-place. This issue ships the button and its gating only: it is
// enabled exactly when a Controller is connected AND the pattern's dimensionality
// matches the Controller's installed map; otherwise it's disabled with a tooltip
// explaining why. A thin shell over the pure `describeSendToController` gate and
// the provider-seam status.
//
// The push pipeline itself is H10 (gated on the H8 compiler spike); until it lands
// this button is inert in the live app anyway — the only provider is the
// NullControllerProvider, which never connects, so the gate keeps it disabled.

export function SendToController() {
  const provider = getControllerProvider()
  const status = useSyncExternalStore(
    (onChange) => provider.subscribe(onChange),
    () => provider.getStatus(),
  )
  const patternDim = useEditorStore((s) => s.nativeDim)
  const mapDim = useControllerStore((s) => s.mapDim)

  const { enabled, reason } = describeSendToController({ status, patternDim, mapDim })

  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300 disabled:opacity-30"
      disabled={!enabled}
      title={reason}
      onClick={() => {
        // H10 wires the compile → frame → run push pipeline here. No-op until then;
        // the gate guarantees we only reach this while connected + dimensions match.
      }}
      data-testid="send-to-controller"
    >
      Send to Controller
    </Button>
  )
}

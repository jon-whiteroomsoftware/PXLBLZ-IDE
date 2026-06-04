import { useEffect, useSyncExternalStore } from 'react'
import { RotateCw, Check, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { useControllerStore } from '@/store/controllerStore'
import { useMapStore } from '@/store/mapStore'
import { describeSendMap } from '@/engine/sendToController'
import {
  AlertDialogRoot,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

// The map-editor "Send to Controller" action (H12, issue #204) — the map analogue of
// SendToController. It writes the open custom map's baked coordinate array to the
// Controller's single shared map slot, "configuring the installation, not the pattern."
//
// A thin shell over the pure `describeSendMap` gate and the store's map-push flow:
// `requestMapPush` always opens the preflight (writing the shared map is a deliberate
// act — never a silent one-click), and `confirmMapPush` performs the write. The button
// reuses the shared `pushing`/`pushResult`/`preflight` slices (map mode and pattern
// mode are mutually exclusive in the editor header, so only one Send is ever mounted).
export function SendMapToController() {
  const provider = getControllerProvider()
  const status = useSyncExternalStore(
    (onChange) => provider.subscribe(onChange),
    () => provider.getStatus(),
  )

  // The map open for editing, resolved to its dirty-gate inputs.
  const editingMap = useMapStore((s) => s.editingMap)
  const userMaps = useMapStore((s) => s.userMaps)
  const openRecord =
    editingMap?.kind === 'existing' ? userMaps.find((m) => m.id === editingMap.id) : undefined
  const mapId = openRecord?.id
  const hasBakedPoints = (openRecord?.points?.length ?? 0) > 0
  const signature = openRecord?.source ?? ''

  const activeIp = useControllerStore((s) => s.activeIp)
  const active = useControllerStore((s) => (s.activeIp ? s.controllers[s.activeIp] : undefined))
  const pushing = useControllerStore((s) => s.pushing)
  const pushResult = useControllerStore((s) => s.pushResult)
  const lastPushedMap = useControllerStore((s) => s.lastPushedMap)
  const requestMapPush = useControllerStore((s) => s.requestMapPush)
  const confirmMapPush = useControllerStore((s) => s.confirmMapPush)
  const confirmMapPushOnly = useControllerStore((s) => s.confirmMapPushOnly)
  const cancelPush = useControllerStore((s) => s.cancelPush)
  const preflight = useControllerStore((s) => s.preflight)
  const mapPushRemedyCount = useControllerStore((s) => s.mapPushRemedyCount)
  const clearPushResult = useControllerStore((s) => s.clearPushResult)

  // Hold the just-pushed check on screen briefly, then settle back to the idle arrow.
  useEffect(() => {
    if (!pushResult) return
    const t = setTimeout(clearPushResult, 3500)
    return () => clearTimeout(t)
  }, [pushResult, clearPushResult])

  // Dirty gate: a push is redundant when the open map's current bake already matches
  // what was last written to this Controller.
  const alreadyPushed =
    !!activeIp && !!mapId && hasBakedPoints && lastPushedMap[activeIp]?.[mapId] === signature

  const { enabled, reason } = describeSendMap({ status, hasBakedPoints, alreadyPushed })

  const target = active ? active.nickname || activeIp : null
  const name = target ?? 'Controller'

  let title = reason
  let glyph = <ArrowRight size={14} strokeWidth={2.75} aria-hidden />
  if (pushing) {
    glyph = (
      <RotateCw size={14} strokeWidth={2.75} className="animate-spin text-amber-400" aria-hidden />
    )
  } else if (pushResult?.ok) {
    glyph = <Check size={14} strokeWidth={2.75} aria-hidden />
  }

  let content = (
    <span className="flex items-center gap-1.5">
      {glyph}
      {name}
    </span>
  )
  if (!pushing && pushResult && !pushResult.ok) {
    content = <span>Send failed</span>
    title = pushResult.message
  }

  const working = pushing || !!pushResult?.ok
  const dimClass = working ? 'opacity-95' : 'disabled:opacity-30'

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={`text-xs text-zinc-400 bg-zinc-800/70 hover:bg-zinc-700/70 hover:text-zinc-300 ${dimClass}`}
        disabled={!enabled || working}
        title={title}
        onClick={() => void requestMapPush()}
        data-testid="send-map-to-controller"
      >
        {content}
      </Button>

      {/* Map preflight (#204): always opens on a map send (the overwrite warning always
          fires), so closing it any way cancels; only the explicit action writes. */}
      <AlertDialogRoot
        open={preflight !== null}
        onOpenChange={(open) => {
          if (!open) cancelPush()
        }}
      >
        <AlertDialogContent data-testid="map-preflight-dialog">
          <AlertDialogTitle>Send map to {name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <ul className="mt-1 space-y-1.5">
              {(preflight ?? []).map((w) => (
                <li key={w.kind} className="text-sm text-zinc-400">
                  {w.message}
                </li>
              ))}
            </ul>
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {/* On a blocking count mismatch (#213) the firmware would silently drop the
                map. We offer both: a de-emphasized "Push map only" escape hatch, and the
                recommended coupled remedy (set the device's pixel count to the map's
                point count, then push). Without a mismatch it's a plain "Send anyway". */}
            {mapPushRemedyCount !== null && (
              <AlertDialogAction
                className="border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                onClick={() => void confirmMapPushOnly()}
              >
                Push map only
              </AlertDialogAction>
            )}
            <AlertDialogAction onClick={() => void confirmMapPush()}>
              {mapPushRemedyCount !== null
                ? `Push map and set pixel count to ${mapPushRemedyCount}`
                : 'Send anyway'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogRoot>
    </>
  )
}

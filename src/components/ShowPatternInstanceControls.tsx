import { useState } from 'react'
import { Link2, Unlink2 } from 'lucide-react'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogRoot,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { BoundedNumberField } from '@/components/ui/bounded-number-field'
import type { ShowClipPatternInstanceOwnership } from '@/engine/showTimelineClipAuthoring'
import type { ShowSteppedClock } from '@/engine/personalContentRecords'
import { resolveLinearNumberPresentation } from '@/engine/linearNumberPresentation'
import { steppedClockRateHz, steppedClockStepMs } from '@/engine/steppedClock'

const JUMPS_PER_SECOND_PRESENTATION = resolveLinearNumberPresentation({
  kindLabel: 'rate',
  suffix: '/s',
  min: 1 / 60,
  max: 62.5,
  step: 0.001,
  sliderMin: 0.25,
  sliderMax: 30,
  sliderStep: 0.25,
  detentStep: 1,
  detentMagnet: 0.12,
  labelStep: 5,
})

export function ShowPatternInstanceControls({
  ownership,
  steppedClock,
  onMakeIndependent,
  onRejoin,
  onSteppedClockChange,
}: {
  ownership: ShowClipPatternInstanceOwnership
  steppedClock?: ShowSteppedClock
  onMakeIndependent: () => void
  onRejoin: (targetInstanceId: string) => void
  onSteppedClockChange: (next: ShowSteppedClock | undefined) => void
}) {
  const [targetInstanceId, setTargetInstanceId] = useState(ownership.compatibleTargets[0]?.instanceId ?? '')
  const [confirmingRejoin, setConfirmingRejoin] = useState(false)
  const selectedTarget = ownership.compatibleTargets.find((target) => target.instanceId === targetInstanceId)
    ?? ownership.compatibleTargets[0]

  return (
    <div role="group" aria-label="Pattern instance" className="text-[9px]">
      <div
        role="row"
        className="grid h-6 grid-cols-[1.75rem_24%_minmax(0,1fr)] items-center whitespace-nowrap"
      >
        <span role="cell" className="text-zinc-500">
          {ownership.useCount > 1
            ? <Link2 size={11} aria-hidden className="text-cyan-300/80" />
            : <Unlink2 size={11} aria-hidden />}
        </span>
        <span role="rowheader" className="truncate pr-3 text-[10px] font-medium text-zinc-300">Pattern instance</span>
        <span role="cell" className="flex min-w-0 items-center gap-2">
          <span className={`truncate ${ownership.useCount > 1 ? 'text-cyan-300/80' : 'text-zinc-500'}`}>
            {ownership.useCount > 1 ? `Shared by ${ownership.useCount} Clips` : 'Independent'}
          </span>
          {ownership.useCount > 1 && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="ml-auto h-5 shrink-0 px-1.5 text-[9px] text-zinc-400 hover:text-zinc-100"
              onClick={onMakeIndependent}
            >
              Make Pattern Independent
            </Button>
          )}
        </span>
      </div>

      <div
        role="row"
        data-show-clip-summary-target="stutter"
        tabIndex={-1}
        className="grid h-6 grid-cols-[1.75rem_24%_minmax(0,1fr)] items-center whitespace-nowrap"
      >
        <span role="cell">
          <input
            type="checkbox"
            aria-label="Stutter Pattern clock"
            checked={steppedClock !== undefined}
            className="h-3 w-3 accent-live"
            onChange={(event) => onSteppedClockChange(event.target.checked ? { stepMs: 250 } : undefined)}
          />
        </span>
        <span role="rowheader" className="truncate pr-3 text-[10px] font-medium text-zinc-300">Stutter Pattern clock</span>
        <span role="cell" className="flex min-w-0 items-center gap-2">
          {ownership.useCount > 1 && (
            <span className="truncate text-cyan-300/70">Affects {ownership.useCount} linked Clips</span>
          )}
          {steppedClock && (
            <span className="ml-auto flex min-w-44 max-w-56 items-center gap-2 text-zinc-500">
              <span className="tabular-nums text-[8px] text-zinc-600">every {steppedClock.stepMs} ms</span>
              <span className="min-w-28 flex-1">
                <BoundedNumberField
                  label="Jumps per second"
                  hideLabel
                  value={steppedClockRateHz(steppedClock.stepMs)}
                  presentation={JUMPS_PER_SECOND_PRESENTATION}
                  compact
                  variant="editor"
                  onChange={(rate) => onSteppedClockChange({ stepMs: steppedClockStepMs(rate) })}
                />
              </span>
            </span>
          )}
          {!steppedClock && ownership.useCount === 1 && <span aria-hidden className="text-zinc-700">—</span>}
        </span>
      </div>

      {ownership.compatibleTargets.length > 0 && (
        <div role="row" className="grid h-6 grid-cols-[1.75rem_24%_minmax(0,1fr)] items-center whitespace-nowrap">
          <span role="cell" aria-hidden />
          <span role="rowheader" className="truncate pr-3 text-[10px] font-medium text-zinc-300">Rejoin instance</span>
          <span role="cell" className="flex min-w-0 items-center gap-1.5">
            <select
              aria-label="Shared Pattern instance"
              value={selectedTarget?.instanceId ?? ''}
              onChange={(event) => setTargetInstanceId(event.target.value)}
              className="h-5 min-w-0 flex-1 border-0 border-b border-zinc-800 bg-transparent px-1 text-[9px] text-zinc-300 outline-none focus:border-live/70"
            >
              {ownership.compatibleTargets.map((target, index) => (
                <option key={target.instanceId} value={target.instanceId}>
                  {`${target.patternName} · shared instance ${index + 1} · ${target.useCount} ${target.useCount === 1 ? 'Clip' : 'Clips'}`}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="xs"
              variant="outline"
              aria-label="Rejoin Shared Pattern"
              disabled={!selectedTarget}
              className="h-5 shrink-0 px-1.5 text-[9px]"
              onClick={() => setConfirmingRejoin(true)}
            >
              Rejoin
            </Button>
          </span>
        </div>
      )}

      <AlertDialogRoot open={confirmingRejoin} onOpenChange={setConfirmingRejoin}>
        <AlertDialogContent>
          <AlertDialogTitle>Rejoin shared Pattern instance?</AlertDialogTitle>
          <AlertDialogDescription>
            This Clip will use the selected shared clock and settings. Its current Pattern-instance settings and automation will no longer apply to it.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedTarget) onRejoin(selectedTarget.instanceId)
              }}
            >
              Rejoin Pattern instance
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogRoot>
    </div>
  )
}

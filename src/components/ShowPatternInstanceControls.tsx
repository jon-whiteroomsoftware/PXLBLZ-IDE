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
import type { ShowClipPatternInstanceOwnership } from '@/engine/showTimelineClipAuthoring'
import type { ShowSteppedClock } from '@/engine/personalContentRecords'
import { NumberField } from '@/components/ui/number-field'

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
    <div role="group" aria-label="Pattern instance" className="space-y-1.5 py-1.5">
      <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex items-center gap-1.5 text-[10px] text-zinc-300">
          {ownership.useCount > 1
            ? <Link2 size={11} aria-hidden className="text-cyan-300/80" />
            : <Unlink2 size={11} aria-hidden className="text-zinc-500" />}
          <span className="font-medium">Pattern instance</span>
          <span className={ownership.useCount > 1 ? 'text-cyan-300/80' : 'text-zinc-500'}>
            {ownership.useCount > 1 ? `Shared by ${ownership.useCount} Clips` : 'Independent'}
          </span>
        </span>
        {ownership.useCount > 1 && (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="ml-auto h-6 px-2 text-[10px] text-zinc-400 hover:text-zinc-100"
            onClick={onMakeIndependent}
          >
            Make Pattern Independent
          </Button>
        )}
      </div>

      <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 border-t border-zinc-800/65 pt-1.5">
        <label className="flex items-center gap-1.5 text-[10px] text-zinc-300">
          <input
            type="checkbox"
            aria-label="Stutter Pattern clock"
            checked={steppedClock !== undefined}
            className="h-3 w-3 accent-cyan-400"
            onChange={(event) => onSteppedClockChange(event.target.checked ? { stepMs: 250 } : undefined)}
          />
          Stutter Pattern clock
        </label>
        {ownership.useCount > 1 && (
          <span className="text-[9px] text-cyan-300/70">Affects {ownership.useCount} linked Clips</span>
        )}
        {steppedClock && (
          <span className="ml-auto flex min-w-28 items-center gap-1 text-[9px] text-zinc-500">
            Step
            <NumberField
              label="Stutter step seconds"
              hideLabel
              value={steppedClock.stepMs / 1_000}
              min={0.016}
              max={60}
              step={0.05}
              suffix="s"
              compact
              onChange={(seconds) => onSteppedClockChange({ stepMs: Math.round(seconds * 1_000) })}
            />
          </span>
        )}
      </div>

      {ownership.compatibleTargets.length > 0 && (
        <div className="flex min-w-0 items-center gap-1.5">
          <select
            aria-label="Shared Pattern instance"
            value={selectedTarget?.instanceId ?? ''}
            onChange={(event) => setTargetInstanceId(event.target.value)}
            className="h-6 min-w-0 flex-1 rounded-sm border border-zinc-800 bg-zinc-950/70 px-1.5 text-[10px] text-zinc-300 outline-none focus:border-cyan-400/60"
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
            disabled={!selectedTarget}
            className="h-6 shrink-0 px-2 text-[10px]"
            onClick={() => setConfirmingRejoin(true)}
          >
            Rejoin Shared Pattern
          </Button>
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

import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { NumberField } from './ui/number-field'
import type { ShowV2PilotAdoptionReceipt, ShowV2PilotPreparedCapture } from '@/store/showV2PreparedEditAdmission'

type SubmissionOutcome =
  | { status: 'applied'; settlement: 'saved' | 'superseded' }
  | { status: 'unchanged' }
  | { status: 'refused'; message: string }

export interface ShowV2TimingSubmission<Intent> {
  intent: Intent
  isCurrent: () => boolean
  onAdopted: (receipt: ShowV2PilotAdoptionReceipt) => void
}

const buttonStyle = 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800'

/**
 * Global Insert Time and Set Show End for a `ShowRecordV2`.
 *
 * Both are exact (specification sections 7 and 8): Insert Time refuses strictly
 * inside a visual Transition or a timed Layout transfer rather than guessing a
 * new effect, and Set Show End refuses an invalid shortening rather than cutting
 * or clamping content. This surface submits the authored numbers and shows the
 * owner's own refusal; it never adjusts a value to make an edit succeed.
 */
export function ShowV2ShowTimingEditor({
  capture,
  submitInsertTime,
  submitShowEnd,
  isCurrentCapture,
  isCurrentCompletion,
  onStatus,
}: {
  capture: ShowV2PilotPreparedCapture
  submitInsertTime: (request: ShowV2TimingSubmission<{ atMs: number; durationMs: number }>) => Promise<SubmissionOutcome>
  submitShowEnd: (request: ShowV2TimingSubmission<{ kind: 'set-show-end'; showEndMs: number }>) => Promise<SubmissionOutcome>
  isCurrentCapture: () => boolean
  isCurrentCompletion: (receipt: ShowV2PilotAdoptionReceipt, phase: 'saved' | 'save-failed') => boolean
  onStatus: (status: string) => void
}) {
  const showEndMs = capture.record.composition.showEndMs
  const [atMs, setAtMs] = useState(0)
  const [durationMs, setDurationMs] = useState(1000)
  const [busy, setBusy] = useState(false)
  const [reset, setReset] = useState(0)
  const pending = useRef(false)
  const live = useRef(true)
  useLayoutEffect(() => { live.current = true; return () => { live.current = false } }, [])

  const available = !busy
    && (capture.inputCapture?.status === 'qualified'
      || (!capture.inputCapture && capture.prepared.status !== 'refused'))

  const run = async <Intent, >(
    submit: (request: ShowV2TimingSubmission<Intent>) => Promise<SubmissionOutcome>,
    intent: Intent,
    label: string,
  ) => {
    if (pending.current || !available) return
    pending.current = true
    setBusy(true)
    const adopted: { current: ShowV2PilotAdoptionReceipt | null } = { current: null }
    try {
      const outcome = await submit({
        intent,
        isCurrent: () => live.current && isCurrentCapture(),
        onAdopted: (receipt) => { adopted.current = receipt },
      })
      const current = outcome.status === 'applied'
        ? adopted.current !== null && outcome.settlement === 'saved' && isCurrentCompletion(adopted.current, 'saved')
        : isCurrentCapture()
      if (!live.current || !current) return
      if (outcome.status !== 'applied') setReset((value) => value + 1)
      onStatus(outcome.status === 'refused'
        ? outcome.message
        : outcome.status === 'unchanged' ? `${label} is unchanged.` : `${label} saved.`)
    } catch (error) {
      const current = adopted.current ? isCurrentCompletion(adopted.current, 'save-failed') : isCurrentCapture()
      if (live.current && current) {
        setReset((value) => value + 1)
        onStatus(error instanceof Error ? `Save failed: ${error.message}` : 'Save failed.')
      }
    } finally {
      pending.current = false
      if (live.current) setBusy(false)
    }
  }

  return (
    <section aria-label="Show timing" data-testid="show-v2-show-timing" className="mt-7 space-y-3">
      <h2 className="text-sm font-medium text-zinc-200">Show timing</h2>
      <NumberField
        key={`end:${showEndMs}:${reset}`}
        label="Show End"
        value={showEndMs}
        disabled={!available}
        min={1}
        step={1}
        suffix="ms"
        variant="editor"
        onChange={(next) => void run(submitShowEnd, { kind: 'set-show-end' as const, showEndMs: next }, 'Show End')}
      />
      <p className="text-xs text-zinc-500">
        Shortening past authored content is refused whole; nothing is cut or clamped.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField
          label="Insert at"
          ariaLabel="Insert Time at (ms)"
          value={atMs}
          disabled={!available}
          min={0}
          step={1}
          suffix="ms"
          variant="editor"
          onChange={setAtMs}
        />
        <NumberField
          label="Insert duration"
          ariaLabel="Insert Time duration (ms)"
          value={durationMs}
          disabled={!available}
          min={1}
          step={1}
          suffix="ms"
          variant="editor"
          onChange={setDurationMs}
        />
      </div>
      <Button
        size="xs"
        variant="outline"
        className={buttonStyle}
        disabled={!available}
        onClick={() => void run(submitInsertTime, { atMs, durationMs }, 'Insert Time')}
      >
        Insert Time
      </Button>
      <p className="text-xs text-zinc-500">
        Later content and Markers move by the inserted duration; a Group occurrence crossing the
        insertion holds instead. Inserting strictly inside a Transition or a Layout transfer is refused.
      </p>
    </section>
  )
}

import { useLayoutEffect, useRef } from 'react'
import { Terminal } from 'lucide-react'
import type { AgentDrawerState, AgentLine } from '@/engine/agentDrawerModel'
const words = { applied: 'saving', saved: 'saved', draft: 'applied to draft', 'not-applied': 'not applied', 'rolled-back': 'rolled back', superseded: 'superseded', cancelled: 'cancelled', unknown: 'outcome unknown' }
export function ActivityStream({ state, retry, busy = false }: { state: AgentDrawerState; retry: (id: string) => void; busy?: boolean }) {
  const failed = (line: AgentLine) => ['not-applied', 'rolled-back', 'cancelled'].includes(line.outcome ?? '')
  const showReply = (line: AgentLine) => !!line.reply && (line.outcome === 'saved' || line.outcome === 'draft' || (line.outcome === 'not-applied' && line.replyOnRefusal === true))
  const latestOutcome = state.announcement
  const logRef = useRef<HTMLDivElement>(null)
  const retryFocusRef = useRef<{ button: HTMLButtonElement; panel: Element | null } | null>(null)
  const orphanedThinking = !state.contactLost && state.request?.phase === 'thinking' && !state.stream.some(line => line.operationId === state.request?.id)
  useLayoutEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [state.stream, state.showMcp, state.request?.id, state.request?.phase])
  useLayoutEffect(() => {
    const pending = retryFocusRef.current
    if (!pending) return
    if (pending.button.isConnected) {
      if (!busy) retryFocusRef.current = null
      return
    }
    if (document.activeElement === document.body || document.activeElement === pending.button) {
      const target = pending.panel?.querySelector<HTMLElement>('[data-testid="agent-chat-input"]') ?? pending.panel?.querySelector<HTMLElement>('[aria-label="Agent menu"]')
      target?.focus({ preventScroll: true })
    }
    retryFocusRef.current = null
  }, [busy, state.stream])
  const response = (line: AgentLine): string[] => {
    if (!line.operationId) return []
    if (!line.outcome) {
      if (line.phase === 'thinking' || line.phase === 'working') return ['Thinking']
      if (line.phase === 'waiting') return ['Waiting for you to finish']
      return []
    }
    if (line.outcome === 'applied') return ['Saving']
    if (showReply(line)) return line.outcome === 'draft' ? [line.reply!, 'Applied to draft.'] : [line.reply!]
    if (line.outcome === 'saved' || line.outcome === 'draft') {
      const messages = (line.changes ?? []).map(change => change.description)
      return line.outcome === 'draft' ? [...messages, 'Applied to draft.'] : messages.length ? messages : ['Saved the edit.']
    }
    if (line.outcome === 'superseded' && line.changes?.length) {
      return [...line.changes.map(change => change.description), line.reason ?? 'Superseded by a newer save.']
    }
    if (line.reason) return [line.reason]
    if (line.outcome === 'not-applied') return ['Not applied.']
    if (line.outcome === 'rolled-back') return ['The save was rolled back.']
    if (line.outcome === 'superseded') return ['Superseded by a newer save.']
    if (line.outcome === 'cancelled') return ['Cancelled before applying the edit.']
    return ['Outcome unknown. Restore contact to inspect this operation.']
  }
  return <div ref={logRef} className="agent-activity min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="agent-chat-log" aria-label="Agent activity">
    <span data-testid="agent-activity-status" className="sr-only" role="status" aria-live="polite" aria-atomic="true">{latestOutcome ? `${latestOutcome.text}: ${words[latestOutcome.outcome]}` : ''}</span>
    <h3 className="mb-3 text-[10px] tracking-widest text-zinc-500">ACTIVITY</h3>
    {state.stream.length === 0 && !orphanedThinking && <p className="text-zinc-500">Nothing yet.</p>}
    {state.stream.map(line => {
      const messages = response(line)
      const landedCommand = line.outcome === 'saved' && (line.changes?.length ?? 0) > 0
      const provisional = !state.contactLost && (!line.outcome || line.outcome === 'applied')
      return <div key={line.id} data-testid="agent-chat-line" data-request-id={line.operationId} data-outcome={line.outcome} className={`agent-line my-4 ${line.kind === 'system' || line.kind === 'reply' || line.kind === 'author' ? 'text-zinc-400' : 'text-zinc-200'}`}>
      <div className="whitespace-pre-wrap break-words">{line.text}</div>
      {messages.length > 0 && <div data-testid="agent-response" className={`agent-response mt-2 flex items-start gap-2 text-[11px] leading-relaxed ${landedCommand ? 'text-zinc-500' : 'text-zinc-400'} ${provisional && (line.phase === 'thinking' || line.phase === 'working') ? 'agent-thinking' : ''}`}>
        {landedCommand && <Terminal data-testid="agent-command-icon" aria-hidden size={14} className="mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">{messages.map((message, index) => <p key={index} className={index ? 'mt-1' : ''}>{message}</p>)}</div>
      </div>}
      {state.showMcp && line.calls?.map((call, index) => <p key={index} className="mt-1 font-mono text-[10px] text-teal-300">{call}</p>)}
      {failed(line) && <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        {state.connection?.kind === 'builtin' && line.retryable && <button type="button" data-testid="agent-chat-retry" data-show-detail-pointer-preserve="true" onPointerDown={event => event.preventDefault()} onClick={event => { if (document.activeElement === event.currentTarget) retryFocusRef.current = { button: event.currentTarget, panel: event.currentTarget.closest('[data-testid="agent-chat-panel"]') }; retry(line.operationId!) }} disabled={busy || !!state.request || state.contactLost} className="agent-button">Retry</button>}
        {state.connection?.kind === 'external' && <p className="w-full text-zinc-400">Ask your agent to try again from current state.</p>}
      </div>}
    </div>})}
    {orphanedThinking && <p data-testid="agent-orphaned-thinking" className="agent-thinking my-4 text-[11px] leading-relaxed text-zinc-400">Thinking</p>}
  </div>
}

import type { AgentDrawerState, AgentLine } from '@/engine/agentDrawerModel'
const words = { applied: 'saving', saved: 'saved', draft: 'applied to draft', 'not-applied': 'not applied', 'rolled-back': 'rolled back', superseded: 'superseded', cancelled: 'cancelled', unknown: 'outcome unknown' }
export function ActivityStream({ state, retry, dismiss, busy = false }: { state: AgentDrawerState; retry: (id: string) => void; dismiss: (id: string) => void; busy?: boolean }) {
  const failed = (line: AgentLine) => ['not-applied', 'rolled-back', 'cancelled'].includes(line.outcome ?? '')
  const pending = (line: AgentLine) => !state.contactLost && ((!line.outcome && (line.phase === 'working' || line.phase === 'thinking')) || line.outcome === 'applied')
  const showReply = (line: AgentLine) => !!line.reply && (line.outcome === 'saved' || line.outcome === 'draft' || (line.outcome === 'not-applied' && line.replyOnRefusal === true))
  const latestOutcome = state.announcement
  const recover = (button: HTMLButtonElement, action: () => void) => {
    const hadFocus = document.activeElement === button
    const panel = button.closest('[data-testid="agent-chat-panel"]')
    action()
    if (hadFocus) window.setTimeout(() => {
      if (document.activeElement !== document.body && document.activeElement !== button) return
      const target = panel?.querySelector<HTMLElement>('[data-testid="agent-chat-input"]') ?? panel?.querySelector<HTMLElement>('[aria-label="Agent menu"]')
      target?.focus({ preventScroll: true })
    }, 0)
  }
  return <div className="agent-activity min-h-0 flex-1 overflow-y-auto px-4 py-3" data-testid="agent-chat-log" aria-label="Agent activity">
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{latestOutcome ? `${latestOutcome.text}: ${words[latestOutcome.outcome]}` : ''}</span>
    <h3 className="mb-3 text-[10px] tracking-widest text-zinc-500">ACTIVITY</h3>
    {state.stream.length === 0 && <p className="text-zinc-500">Nothing yet.</p>}
    {state.stream.map(line => <div key={line.id} data-testid="agent-chat-line" data-request-id={line.operationId} data-outcome={line.outcome} className={`agent-line my-3 ${failed(line) ? 'text-red-300' : line.kind === 'system' ? 'text-zinc-500' : line.kind === 'author' ? 'text-zinc-400' : 'text-zinc-200'}`}>
      <div className="flex items-start gap-2"><span aria-hidden className={`agent-activity-dot mt-1.5 size-[5px] shrink-0 rounded-full ${pending(line) ? 'agent-activity-pending' : ''} ${failed(line) ? 'bg-red-300' : line.kind === 'system' ? 'bg-zinc-600' : 'bg-agent'}`} /><span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{line.text}</span>
      {(line.outcome || line.phase) && <span className="shrink-0 text-[10px] text-current">{line.outcome ? words[line.outcome] : line.phase === 'waiting' ? 'waiting for you' : line.phase}</span>}</div>
      {!showReply(line) && line.changes?.map((change, index) => <p key={index} className="ml-3 mt-1 text-[11px] text-zinc-500">{change.description}</p>)}
      {showReply(line) && <p className="ml-3 mt-1 text-[11px] text-zinc-300">{line.reply}</p>}
      {line.reason && <p className="ml-3 mt-1 text-[11px]">{line.reason}</p>}
      {state.showMcp && line.calls?.map((call, index) => <p key={index} className="ml-3 mt-1 font-mono text-[10px] text-teal-300">{call}</p>)}
      {failed(line) && !line.dismissed && <div className="ml-3 mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        {state.connection?.kind === 'builtin' && line.retryable && <button type="button" data-testid="agent-chat-retry" data-show-detail-pointer-preserve="true" onPointerDown={event => event.preventDefault()} onClick={event => recover(event.currentTarget, () => retry(line.operationId!))} disabled={busy || !!state.request || state.contactLost} className="agent-button">Retry</button>}
        {state.connection?.kind === 'external' && <p className="w-full text-zinc-400">Ask your agent to try again from current state.</p>}
        <button type="button" data-testid="agent-chat-dismiss" data-show-detail-pointer-preserve="true" onPointerDown={event => event.preventDefault()} onClick={event => recover(event.currentTarget, () => dismiss(line.operationId!))} className="agent-button">Dismiss</button>
      </div>}
    </div>)}
  </div>
}

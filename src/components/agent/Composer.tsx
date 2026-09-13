import type { AgentMessageAllowance } from '@/engine/agentAllowance'

function resetDistance(resetAt: number | null): string {
  if (resetAt === null) return 'reset unavailable'
  const remaining = resetAt - Date.now()
  if (remaining <= 0) return 'resetting now'
  if (remaining < 60 * 60 * 1000) return 'resets in <1h'
  return `resets in ${Math.ceil(remaining / (60 * 60 * 1000))}h`
}

function resetTime(resetAt: number | null): string {
  return resetAt === null ? 'the next UTC day' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(resetAt)
}

function LimitExplanation({ allowance }: { allowance: AgentMessageAllowance }) {
  if (allowance.code === 'available') return null
  if (allowance.code === 'daily_message_limit') return <div className="agent-limit"><strong className="text-zinc-300">Daily message limit reached</strong><p className="text-zinc-400">Your 30 messages reset at {resetTime(allowance.resetAt)}.</p></div>
  if (allowance.code === 'daily_api_budget') return <div className="agent-limit"><strong className="text-zinc-300">Daily API budget reached</strong><p className="text-zinc-400">The Pixelblaze agent is out of budget for today. Resets at {resetTime(allowance.resetAt)}.</p></div>
  return <div className="agent-limit"><strong className="text-zinc-300">Pixelblaze agent unavailable</strong><p className="text-zinc-400">Try again later.</p></div>
}

export function Composer({ draft, change, submit, busy, allowance }: { draft: string; change: (value: string) => void; submit: () => void; busy: boolean; allowance: AgentMessageAllowance }) {
  const blocked = allowance.code !== 'available'
  return <div className="agent-composer">
    <div data-testid="agent-allowance-status" className="agent-allowance text-zinc-500" role="status">{allowance.remaining ?? '—'}/{allowance.limit} messages left · {resetDistance(allowance.resetAt)}</div>
    <LimitExplanation allowance={allowance} />
    <form className="flex gap-2 px-3 py-3" onSubmit={event => { event.preventDefault(); submit() }}><input data-testid="agent-chat-input" aria-label="Message the Pixelblaze agent" placeholder="Ask for an edit…" className="min-w-0 flex-1 bg-transparent text-xs text-zinc-200 outline-none placeholder:text-zinc-600 focus-visible:ring-1 focus-visible:ring-agent" value={draft} onChange={event => change(event.target.value)} /><button type="submit" data-testid="agent-chat-send" disabled={busy || blocked || !draft.trim()} className="agent-button">Send</button></form>
  </div>
}

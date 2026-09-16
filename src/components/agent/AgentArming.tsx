import { Copy, TriangleAlert } from 'lucide-react'
import { useRef, useState, type KeyboardEvent } from 'react'

type McpClient = 'claude-code' | 'codex' | 'claude-ai' | 'other'

const clients: { id: McpClient; label: string }[] = [
  { id: 'claude-code', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'claude-ai', label: 'Claude.ai' },
  { id: 'other', label: 'Other' },
]

export function AgentArming({ armed, cancel, ready, endpoint, notice }: {
  armed: boolean
  cancel: () => void
  ready: () => void
  endpoint: string
  notice: { title: string; detail: string } | null
}) {
  const [copyStatus, setCopyStatus] = useState('')
  const [client, setClient] = useState<McpClient>('claude-code')
  const clientRefs = useRef<Array<HTMLButtonElement | null>>([])
  const copy = async (value: string, success: string, fallback: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyStatus(success)
    } catch {
      setCopyStatus(`Copy failed. Select the ${fallback} to copy it.`)
    }
  }
  const selectClient = (next: McpClient) => {
    setClient(next)
    setCopyStatus('')
  }
  const moveClient = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
    const nextIndex = (index + direction + clients.length) % clients.length
    selectClient(clients[nextIndex].id)
    clientRefs.current[nextIndex]?.focus()
  }
  const instruction = client === 'claude-code'
    ? { text: `claude mcp add --transport http pxlblz ${endpoint}`, copyLabel: 'Copy Claude Code command', copied: 'Claude Code command copied', copyValue: `claude mcp add --transport http pxlblz ${endpoint}`, fallback: 'command', code: true }
    : client === 'codex'
      ? { text: `codex mcp add pxlblz --url ${endpoint}`, copyLabel: 'Copy Codex command', copied: 'Codex command copied', copyValue: `codex mcp add pxlblz --url ${endpoint}`, fallback: 'command', code: true }
      : client === 'claude-ai'
        ? { text: 'Customize → Connectors → + → Add custom connector → paste the endpoint', copyLabel: 'Copy endpoint for Claude.ai', copied: 'Endpoint copied', copyValue: endpoint, fallback: 'endpoint', code: false }
        : null

  return <div className="shrink-0 border-b border-seam text-[11px] leading-relaxed text-zinc-400">
    {notice && <div role="alert" className="flex gap-2 border-b border-red-400/25 bg-red-400/[.06] px-4 py-2.5">
      <TriangleAlert aria-hidden size={13} className="mt-0.5 shrink-0 text-red-300" />
      <div><strong className="block font-medium text-red-200">{notice.title}</strong><p>{notice.detail}</p></div>
    </div>}
    <div className="space-y-4 px-4 py-4">
      <h2 className="text-sm font-semibold text-zinc-100">Connect your agent with MCP</h2>
      <ol className="space-y-3">
        <li><strong className="text-zinc-300">1. Add the endpoint</strong>
          <div className="mt-1.5 flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5">
            <code className="min-w-0 flex-1 select-all break-all text-[10px] text-zinc-300">{endpoint}</code>
            <button type="button" aria-label="Copy endpoint" title="Copy endpoint" className="agent-icon-button" onClick={() => copy(endpoint, 'Endpoint copied', 'endpoint')}><Copy size={12} /></button>
          </div>
          <div role="radiogroup" aria-label="MCP client" className="mt-2 flex overflow-hidden rounded border border-zinc-800">
            {clients.map((option, index) => <button
              key={option.id}
              ref={element => { clientRefs.current[index] = element }}
              type="button"
              role="radio"
              aria-checked={client === option.id}
              tabIndex={client === option.id ? 0 : -1}
              onClick={() => selectClient(option.id)}
              onKeyDown={event => moveClient(event, index)}
              className={`min-w-0 flex-1 border-r border-zinc-800 px-1 py-1 text-[10px] last:border-r-0 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-agent ${client === option.id ? 'bg-agent/15 text-agent' : 'bg-zinc-950 text-zinc-500 hover:text-zinc-300'}`}
            >{option.label}</button>)}
          </div>
          {instruction && <div data-testid="agent-client-instruction" className="mt-1.5 flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5">
            {instruction.code
              ? <code className="min-w-0 flex-1 select-all break-all text-[10px] text-zinc-300">{instruction.text}</code>
              : <span className="min-w-0 flex-1 text-[10px] text-zinc-400">{instruction.text}</span>}
            <button type="button" aria-label={instruction.copyLabel} title={instruction.copyLabel} className="agent-icon-button" onClick={() => copy(instruction.copyValue, instruction.copied, instruction.fallback)}><Copy size={12} /></button>
          </div>}
          {copyStatus && <p role="status" className={`mt-1 text-[10px] ${copyStatus.startsWith('Copy failed') ? 'text-red-300' : 'text-amber-200'}`}>{copyStatus}</p>}
        </li>
        <li><strong className="text-zinc-300">2. Authorize access</strong><p className="mt-0.5 text-zinc-500">Your client opens a browser tab for PXLBLZ sign-in and consent. The consent page shows your account and the application name.</p></li>
        <li><strong className="text-zinc-300">3. Connect this Show</strong><p className="mt-0.5 text-zinc-500">Click Ready to connect and tell your agent “Connect to my Show in PXLBLZ.”</p></li>
      </ol>
      <button type="button" className="agent-button" onClick={armed ? cancel : ready}>{armed ? 'Cancel connection attempt' : 'Ready to connect'}</button>
      {armed && <p className="text-amber-200">Waiting for your agent to connect. This attempt stays open for two minutes for you, thirty seconds for an incoming call.</p>}
      <details className="border-t border-seam pt-3"><summary className="cursor-pointer text-zinc-400">About the connection</summary><p className="mt-2 text-zinc-500">Your Show stays open while the agent works. Disconnect ends editing; Forget this agent also removes its authorization.</p><p className="mt-2 text-zinc-500">If your application cannot connect, check that it supports remote MCP with OAuth. Use its connection error to identify what failed.</p></details>
    </div>
  </div>
}

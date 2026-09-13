import { Copy, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

export function AgentArming({ armed, cancel, ready, endpoint, notice }: {
  armed: boolean
  cancel: () => void
  ready: () => void
  endpoint: string
  notice: { title: string; detail: string } | null
}) {
  const [copyStatus, setCopyStatus] = useState('')
  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(endpoint)
      setCopyStatus('Endpoint copied')
    } catch {
      setCopyStatus('Copy failed. Select the endpoint to copy it.')
    }
  }

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
            <button type="button" aria-label="Copy endpoint" title="Copy endpoint" className="agent-icon-button" onClick={copyEndpoint}><Copy size={12} /></button>
          </div>
          {copyStatus && <p role="status" className={`mt-1 text-[10px] ${copyStatus.startsWith('Copy failed') ? 'text-red-300' : 'text-amber-200'}`}>{copyStatus}</p>}
        </li>
        <li><strong className="text-zinc-300">2. Authorize access</strong><p className="mt-0.5 text-zinc-500">Start authorization in your agent application. In the browser, sign in to PXLBLZ and allow the connection.</p></li>
        <li><strong className="text-zinc-300">3. Connect this Show</strong><p className="mt-0.5 text-zinc-500">Click Ready to connect and tell your agent “Connect to my Show in PXLBLZ.”</p></li>
      </ol>
      <button type="button" className="agent-button" onClick={armed ? cancel : ready}>{armed ? 'Cancel connection attempt' : 'Ready to connect'}</button>
      {armed && <p className="text-amber-200">Waiting for your agent to connect. This attempt expires in two minutes.</p>}
      <details className="border-t border-seam pt-3"><summary className="cursor-pointer text-zinc-400">About the connection</summary><p className="mt-2 text-zinc-500">Your Show stays open while the agent works. Disconnect ends editing; Forget this agent also removes its authorization.</p><p className="mt-2 text-zinc-500">If your application cannot connect, check that it supports remote MCP with OAuth. Use its connection error to identify what failed.</p></details>
    </div>
  </div>
}

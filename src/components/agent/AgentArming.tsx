import { Copy } from 'lucide-react'
import { useState } from 'react'
export function AgentArming({ cancel }: { cancel: () => void }) {
  const url = 'https://pxlblz-ide.whiteroomsoftware.com/mcp'
  const [copyStatus, setCopyStatus] = useState('')
  return <div className="space-y-3 border-b border-seam px-4 py-4 text-[11px] leading-relaxed text-zinc-400">
    <p>Point your agent at</p><div className="select-all break-all rounded bg-zinc-900 px-2 py-2 font-mono text-zinc-200">{url}</div>
    <details><summary className="cursor-pointer">How to add an MCP server</summary><div className="mt-3 space-y-3">
      {[['Claude Code', `claude mcp add --transport http pxlblz ${url}`], ['Codex', `codex mcp add pxlblz --url ${url}`]].map(([name, command]) => <div key={name}><b className="text-zinc-300">{name}</b><div className="mt-1 flex items-start gap-2"><code className="min-w-0 flex-1 break-all text-[10px]">{command}</code><button type="button" aria-label={`Copy the ${name} command`} className="agent-button" onClick={() => { void navigator.clipboard.writeText(command).then(() => setCopyStatus(`${name} command copied`), () => setCopyStatus('Copy failed; select the command to copy it.')) }}><Copy size={12} /></button></div></div>)}
      <p><b className="text-zinc-300">Claude</b><br />Settings › Connectors › Add › paste the URL</p>
    </div></details>
    <p>Then ask it to edit this Show. Once it connects you can close this drawer.</p><button type="button" className="agent-button" onClick={cancel}>Cancel</button><p role="status">{copyStatus}</p>
  </div>
}

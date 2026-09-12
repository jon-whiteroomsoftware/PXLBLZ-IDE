import { MessageCircle, Plug } from 'lucide-react'

export function AgentChoose({ builtin, external }: { builtin: () => void; external: () => void }) {
  return <div className="shrink-0 divide-y divide-seam border-b border-seam px-4">
    <button type="button" data-drawer-initial-focus onClick={builtin} className="group flex w-full cursor-pointer items-start gap-3 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-live focus-visible:outline-offset-[-2px]">
      <span className="min-w-0 flex-1"><b className="block text-xs font-semibold text-zinc-200">Use the Pixelblaze agent</b><span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">Ask for edits here. It works on this Show with you.</span></span>
      <span aria-hidden className="agent-choice-icon"><MessageCircle size={14} /></span>
    </button>
    <button type="button" onClick={external} className="group flex w-full cursor-pointer items-start gap-3 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-live focus-visible:outline-offset-[-2px]">
      <span className="min-w-0 flex-1"><b className="block text-xs font-semibold text-zinc-200">Connect an MCP agent</b><span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">Work from Claude Code, Codex, or a Claude connector.</span></span>
      <span aria-hidden className="agent-choice-icon"><Plug size={14} /></span>
    </button>
  </div>
}

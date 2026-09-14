import { ArrowUpRight, MessageCircle, Plug } from 'lucide-react'
import type { AgentDrawerState } from '@/engine/agentDrawerModel'

export function AgentChoose({ builtin, external, externalBinding, moveExternal, movePending = false }: { builtin?: () => void; external?: () => void; externalBinding?: AgentDrawerState['externalBinding']; moveExternal?: () => void; movePending?: boolean }) {
  const subtitle = externalBinding?.relation === 'same-show'
    ? 'connected in another editor'
    : externalBinding?.showName ? `connected to ${externalBinding.showName}` : 'connected to another Show'
  return <div className="shrink-0 border-b border-seam">
    {externalBinding?.movedFromHere && <div className="agent-move-notice" role="status"><ArrowUpRight aria-hidden size={13} /><strong>Agent moved to another editor.</strong></div>}
    <div className="divide-y divide-seam px-4">
    {builtin && <button type="button" data-drawer-initial-focus onClick={builtin} className="group flex w-full cursor-pointer items-start gap-3 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-live focus-visible:outline-offset-[-2px]">
      <span className="min-w-0 flex-1"><b className="block text-xs font-semibold text-zinc-200">Use the Pixelblaze agent</b></span>
      <span aria-hidden className="agent-choice-icon"><MessageCircle size={14} /></span>
    </button>}
    {externalBinding && moveExternal ? <div className="flex w-full items-start gap-3 py-4 text-left">
      <span className="min-w-0 flex-1"><b className="block text-xs font-semibold text-zinc-200">{externalBinding.name}</b><span className="mt-1 block text-[11px] text-zinc-500">{subtitle}</span></span>
      <button type="button" data-drawer-initial-focus={!builtin || undefined} disabled={movePending} onClick={moveExternal} className="agent-button">{externalBinding.relation === 'same-show' ? 'Reconnect' : 'Bring agent here'}</button>
    </div> : external && <button type="button" data-drawer-initial-focus={!builtin || undefined} onClick={external} className="group flex w-full cursor-pointer items-start gap-3 py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-live focus-visible:outline-offset-[-2px]">
      <span className="min-w-0 flex-1"><b className="block text-xs font-semibold text-zinc-200">Connect your agent with MCP</b></span>
      <span aria-hidden className="agent-choice-icon"><Plug size={14} /></span>
    </button>}
    </div>
  </div>
}

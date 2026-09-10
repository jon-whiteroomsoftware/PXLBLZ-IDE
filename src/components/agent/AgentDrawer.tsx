import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft, MoreHorizontal, Pin } from 'lucide-react'
import { StudioEntityDrawer } from '@/components/StudioEntityDrawer'
import { useStudioEntityDrawerControls } from '@/components/studioEntityDrawerContext'
import { HeaderAction } from '@/components/rail/RailPrimitives'
import { agentEdgeState, type AgentDrawerMode } from '@/engine/agentDrawerModel'
import { useAgentDrawerStore } from '@/dev/agentDrawerController'
import { ActivityStream } from './ActivityStream'
import { AgentIdentity } from './AgentIdentity'
import { AgentChoose } from './AgentChoose'
import { AgentArming } from './AgentArming'
import { AgentCall } from './AgentCall'
import { Composer } from './Composer'
import './agent.css'
function Panel() {
  const { state, controller, busy } = useAgentDrawerStore()
  const controls = useStudioEntityDrawerControls()
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    if (!menu) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return
        event.preventDefault(); event.stopPropagation()
      } else if (event.target instanceof Element && event.target.closest('[role="menu"], [aria-label="Agent menu"]')) return
      setMenu(false)
    }
    document.addEventListener('keydown', close, true)
    document.addEventListener('pointerdown', close, true)
    return () => { document.removeEventListener('keydown', close, true); document.removeEventListener('pointerdown', close, true) }
  }, [menu])
  if (!controller) return null
  return <div className="flex h-full min-h-0 flex-col text-xs" data-testid="agent-chat-panel">
    <header className="relative flex h-10 shrink-0 items-center gap-1 border-b border-seam px-3"><span className="flex-1 text-[10px] tracking-widest text-zinc-400">AGENT</span><HeaderAction icon={<MoreHorizontal size={14} />} title="Agent menu" onClick={() => setMenu(!menu)} /><HeaderAction icon={<Pin size={14} fill={controls?.pinned ? 'currentColor' : 'none'} />} title={controls?.pinned ? 'Unpin the Agent drawer' : 'Pin the Agent drawer'} pressed={controls?.pinned} disabled={controls?.pinDisabled} onClick={() => controls?.setPinned(!controls.pinned)} />
      {menu && <div role="menu" className="absolute right-3 top-9 z-[70] min-w-44 border border-zinc-700 bg-zinc-900 py-1 shadow-xl" data-studio-drawer-owner="agent" data-studio-drawer-busy="true" data-studio-drawer-busy-kind="menu" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setMenu(false) } }}><button type="button" role="menuitemcheckbox" aria-checked={state.showMcp} className="block w-full px-3 py-2 text-left" onClick={() => { controller.dispatch({ type: 'toggleMcp' }); setMenu(false) }}>Show MCP calls</button>{state.connection?.kind === 'external' && <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-red-300" onClick={() => { controller.disconnect(true); setMenu(false) }}>Forget this agent</button>}</div>}
    </header>
    {state.pendingCall ? <AgentCall name={state.pendingCall.name} answer={() => controller.dispatch({ type: 'approveKnock' })} decline={() => controller.dispatch({ type: 'declineKnock' })} /> : state.armingUntil ? <AgentArming cancel={() => controller.dispatch({ type: 'cancelArm' })} /> : !state.connection ? <AgentChoose builtin={() => controller.dispatch({ type: 'chooseBuiltin' })} external={() => controller.dispatch({ type: 'connectOwn', now: Date.now() })} /> : <AgentIdentity state={state} disconnect={() => controller.disconnect()} restore={() => controller.restoreContact()} cancel={() => controller.cancel()} />}
    <ActivityStream state={state} retry={id => controller.retry(id)} dismiss={id => controller.dispatch({ type: 'dismiss', id })} />
    {state.connection?.kind === 'builtin' && <Composer draft={state.draft} change={text => controller.dispatch({ type: 'draft', text })} submit={() => controller.submit()} busy={busy || !!state.request || state.contactLost} />}
  </div>
}
export function AgentDrawerWorkspace({ children, narrow }: { children: ReactNode; narrow: boolean }) {
  const { state, controller } = useAgentDrawerStore()
  const modeChanged = useCallback((mode: AgentDrawerMode) => { const current = useAgentDrawerStore.getState(); if (current.state.drawer !== mode) current.controller?.dispatch({ type: 'drawer', mode }) }, [])
  useEffect(() => {
    if (controller) localStorage.setItem('pxlblz-agent-drawer-pinned', String(state.pinPreference))
  }, [controller, state.pinPreference])
  useEffect(() => {
    const current = useAgentDrawerStore.getState()
    if (!narrow && current.state.pinPreference) current.controller?.dispatch({ type: 'drawer', mode: 'pinned' })
  }, [narrow])
  useEffect(() => {
    if (state.highlightPhase !== 'flash') return
    const timeout = window.setTimeout(() => controller?.dispatch({ type: 'settle' }), 1900)
    return () => window.clearTimeout(timeout)
  }, [controller, state.highlightPhase, state.highlightOperation])
  const edge = agentEdgeState(state)
  return <StudioEntityDrawer enabled={!!controller} place="shows" side="right" label="Agent drawer" owner="agent" narrow={narrow} width={340} pinPreference={state.pinPreference} requestedMode={narrow && state.drawer === 'pinned' ? 'open' : state.drawer} onModeChange={modeChanged} onPinPreferenceChange={pinned => controller?.dispatch({ type: 'pin', pinned })} drawer={<Panel />} divider={<div className="w-px shrink-0 bg-seam" />} onPreviewSpace={() => {}} edgeLabel={`Open the Agent drawer; ${edge.label.toLowerCase()}; ${state.unread.length} unread outcomes`} edgeContent={<><span aria-hidden className={`agent-dot agent-dot-${edge.dot} ${edge.ringing ? 'agent-ringing' : ''}`} /><span className="text-[9px] tracking-widest [writing-mode:vertical-rl]">{edge.label}</span>{state.unread.length > 0 && <span data-testid="agent-unread-count" className={`rounded-full px-1 text-[9px] text-zinc-950 ${edge.failed ? 'bg-red-300' : 'bg-agent'}`}>{state.unread.length}</span>}<ChevronLeft size={12} /></>}>{children}</StudioEntityDrawer>
}

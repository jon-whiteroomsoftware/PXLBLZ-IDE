import { create } from 'zustand'
import { createAgentDrawerState, type AgentDrawerEvent, type AgentDrawerState } from '@/engine/agentDrawerModel'
export interface AgentDrawerControllerPort {
  showId: string
  dispatch(event: AgentDrawerEvent): void
  submit(): void
  retry(id: string): void
  cancel(): void
  restoreContact(): void
  disconnect(forget?: boolean): void
  dispose(): void
}
interface DrawerStore { busy: boolean; state: AgentDrawerState; controller: AgentDrawerControllerPort | null }
export const useAgentDrawerStore = create<DrawerStore>(() => ({ state: createAgentDrawerState(), controller: null, busy: false }))

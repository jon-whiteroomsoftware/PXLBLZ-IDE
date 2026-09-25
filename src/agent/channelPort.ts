import type { AgentDelivery } from '@/engine/agentDeliveryJournal'
import type { WindowIdentity, windowRendezvousView } from '@/engine/agentRendezvous'
import type { PrivateEditResult } from '@/engine/agentPrivateExecutor'
import type { ShowEditRequest } from '@/engine/showEditAdmission'

export type AgentWindowConnection = ReturnType<typeof windowRendezvousView>
type ExternalBoundConnection = Extract<AgentWindowConnection, { kind: 'external-bound' }>
export type AgentBrowserConnection = Exclude<AgentWindowConnection, ExternalBoundConnection>
  | (ExternalBoundConnection & { movedFromHere: boolean })
  | { kind: 'retiring'; bindingId: string; agentName: string }
  | { kind: 'contact-lost'; previous: AgentWindowConnection }
  | { kind: 'refused'; code: string }
export type AgentTabDelivery = AgentDelivery & WindowIdentity
export interface AgentChannelResult { code: string; [key: string]: unknown }
export type AgentBrowserSessionEvent =
  | { type: 'connection'; connection: AgentBrowserConnection }
  | { type: 'delivery'; delivery: AgentTabDelivery; result: PrivateEditResult; request?: ShowEditRequest }

/** One registration/executor session shared by builtin and external UI paths. */
export interface AgentBrowserSessionPort {
  readonly ready: Promise<WindowIdentity | undefined>
  getWindow(): WindowIdentity | undefined
  getConnection(): AgentBrowserConnection
  subscribe(listener: (event: AgentBrowserSessionEvent) => void): () => void
  arm(): Promise<AgentChannelResult>
  cancelArm(): Promise<AgentChannelResult>
  answer(callId: string): Promise<AgentChannelResult>
  decline(callId: string): Promise<AgentChannelResult>
  disconnect(): Promise<AgentChannelResult>
  forget(): Promise<AgentChannelResult>
  moveExternal(expectedBindingId: string): Promise<AgentChannelResult>
  getOutcome(operationId: string): PrivateEditResult
  /** Retires transport/executor; the React owner separately closes admission. */
  close(): void
}

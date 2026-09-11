import type { AgentDelivery } from '@/engine/agentDeliveryJournal'
import type { WindowIdentity, windowRendezvousView } from '@/engine/agentRendezvous'
import type { PrivateEditResult } from '@/engine/agentPrivateExecutor'
import type { ShowEditRequest } from '@/engine/showEditAdmission'

export type AgentWindowConnection = ReturnType<typeof windowRendezvousView>
export type AgentBrowserConnection = AgentWindowConnection
  | { kind: 'retiring'; bindingId: string; agentName: string }
  | { kind: 'contact-lost'; previous: AgentWindowConnection }
  | { kind: 'refused'; code: string }
export type AgentTabDelivery = AgentDelivery & WindowIdentity
export type AgentBrowserSessionEvent =
  | { type: 'connection'; connection: AgentBrowserConnection }
  | { type: 'delivery'; delivery: AgentTabDelivery; result: PrivateEditResult; request?: ShowEditRequest }

/** One registration/executor session shared by builtin and external UI paths. */
export interface AgentBrowserSessionPort {
  readonly ready: Promise<WindowIdentity | undefined>
  getWindow(): WindowIdentity | undefined
  getConnection(): AgentBrowserConnection
  subscribe(listener: (event: AgentBrowserSessionEvent) => void): () => void
  arm(): Promise<PrivateEditResult>
  cancelArm(): Promise<PrivateEditResult>
  answer(callId: string): Promise<PrivateEditResult>
  decline(callId: string): Promise<PrivateEditResult>
  disconnect(): Promise<PrivateEditResult>
  forget(): Promise<PrivateEditResult>
  getOutcome(operationId: string): PrivateEditResult
  /** Qualified single-resize retry only; creates a new operation, never inference. */
  retry(operationId: string): Promise<PrivateEditResult>
  /** Retires transport/executor; the React owner separately closes admission. */
  close(): void
}

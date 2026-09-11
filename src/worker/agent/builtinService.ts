import type { AgentClaim, WindowIdentity } from '../../engine/agentRendezvous'
import type { BuiltinCommand } from './builtinAccess'
import { runBuiltinTurn } from './builtinTurn'
import type { builtinTools } from './builtinTools'

interface Result { code: string; [key: string]: unknown }
interface Dependencies {
  resolve(window: WindowIdentity): Promise<AgentClaim | undefined>
  connect(window: WindowIdentity): Promise<Result>
  allowance(command: Record<string, unknown>): Promise<Result>
  deliver(identity: AgentClaim, envelope: { operationId: string; deliveryId: string; sequence: number; payload: Record<string, unknown> }): Promise<Result>
  query(identity: AgentClaim, operationId: string): Promise<Result>
  provider(request: { owner: string; operationId: string; round: number; input: unknown[]; tools: typeof builtinTools }): Promise<{ ok: false; code: string } | { ok: true; output: unknown[] }>
}

/** Called only after authenticated request validation. Transport bindings are
 * resolved privately by the account owner; no caller AgentClaim is accepted. */
export async function handleBuiltinCommand(accountId: string, command: BuiltinCommand, deps: Dependencies): Promise<Result> {
  const identity = await deps.resolve(command.window)
  if (command.action === 'connect') return identity ? { code: 'bound', bindingId: identity.bindingId } : deps.connect(command.window)
  if (!identity) return { code: 'no_live_editor' }
  const owner = JSON.stringify([accountId, identity.bindingId])
  if (command.action === 'begin') return deps.allowance({ type: 'begin', accountId, owner })
  if (command.action === 'outcome') return deps.query(identity, command.operationId)
  const operationId = command.operationId
  const activation = await deps.allowance({ type: 'activate', owner, operationId })
  if (activation.code !== 'activated') return activation
  let sequence = 0
  let stopped: Result | undefined
  try {
    const result = await runBuiltinTurn({
      deliver: payload => {
        const next = sequence++
        return deps.deliver(identity, { operationId, deliveryId: `builtin-${next}`, sequence: next, payload })
      },
      dispatch: async request => {
        const editor = await deps.query(identity, operationId)
        const receipt = editor.receipt as { status?: string } | undefined
        if (editor.code !== 'outcome' || receipt?.status !== 'pending') {
          if (editor.code === 'outcome') stopped = editor
          return { ok: false, code: 'contact_lost' }
        }
        return deps.provider({ ...request, owner, operationId })
      },
    }, command.prompt)
    return stopped ?? result
  } finally {
    // Closing admission never refunds dispatched usage or changes an editor receipt.
    await deps.allowance({ type: 'finish', owner, operationId })
  }
}

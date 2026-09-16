import { z } from 'zod'
import { AGENT_MCP_RESULT_CLASSIFICATION, type AgentMcpResultCode } from '../../engine/agentMcpResults'

export const AGENT_MCP_MOVE_INSTRUCTION = 'Call get_connection, then read_show before starting a new edit.'

const failureCodes = Object.entries(AGENT_MCP_RESULT_CLASSIFICATION)
  .filter(([, isError]) => isError)
  .map(([code]) => code) as AgentMcpResultCode[]

function resultCode<const Success extends readonly AgentMcpResultCode[]>(success: Success) {
  return z.enum([...success, ...failureCodes] as unknown as [AgentMcpResultCode, ...AgentMcpResultCode[]])
}

const connectionNotice = z.object({
  code: z.literal('binding_moved'),
  show_id: z.string(),
  show_name: z.string().optional(),
  instruction: z.literal(AGENT_MCP_MOVE_INSTRUCTION),
}).strict()

const change = z.object({
  command: z.string(),
  targetId: z.string().optional(),
  description: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  details: z.record(z.unknown()).optional(),
}).strict()

const issue = z.object({
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
  remedy: z.string().optional(),
  candidates: z.array(z.string()).optional(),
  availableRange: z.object({ startMs: z.number(), endMs: z.number() }).strict().optional(),
}).strict()

const payload = {
  call_id: z.string().optional(),
  binding_id: z.string().optional(),
  show_id: z.string().optional(),
  show_name: z.string().optional(),
  operation_id: z.string().optional(),
  baseRevision: z.unknown().optional(),
  show: z.record(z.unknown()).optional(),
  context: z.record(z.unknown()).optional(),
  receipt: z.record(z.unknown()).optional(),
  commands: z.array(z.record(z.unknown())).optional(),
  changes: z.array(change).optional(),
  issues: z.array(issue).optional(),
  connection_notice: connectionNotice.optional(),
  instruction: z.literal(AGENT_MCP_MOVE_INSTRUCTION).optional(),
  retry_after_ms: z.number().int().nonnegative().optional(),
}

const schema = (code: ReturnType<typeof resultCode>) => z.object({ code, ...payload }).passthrough()

/** Reusable group schemas applied to every dynamically registered production tool. */
export const AGENT_MCP_OUTPUT_SCHEMAS = {
  connection: schema(resultCode(['bound', 'pending'])),
  catalogue: schema(resultCode(['commands'])),
  read: schema(resultCode(['read'])),
  mutation: schema(resultCode(['pending', 'begun', 'changed', 'noop', 'unchanged', 'outcome'])),
  outcome: schema(resultCode(['outcome'])),
} as const

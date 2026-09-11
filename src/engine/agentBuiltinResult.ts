/** `not_attempted` describes only this HTTP invocation: it made no editor
 * delivery. It says nothing about earlier invocations of the same operation.
 * Only the original, never-retried browser run may combine this marker with
 * absent local admission and a late-delivery cancellation barrier.
 */
export interface AgentBuiltinResult {
  code: string
  dispatch?: 'not_attempted'
  [key: string]: unknown
}

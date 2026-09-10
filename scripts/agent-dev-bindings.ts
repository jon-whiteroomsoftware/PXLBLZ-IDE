/** Nonsecret, server-only overrides for explicit local agent-service proof.
 * Used only by the serve-time Cloudflare plugin; never Vite's client define.
 */
export function agentDevBindings(environment: Record<string, string | undefined>): Record<string, string> {
  const bindings: Record<string, string> = {}
  for (const name of ['AGENT_SERVICE_ENABLED', 'AGENT_ACCOUNT_ALLOWLIST', 'AGENT_OAUTH_ORIGIN', 'AGENT_OAUTH_CLIENTS']) {
    if (environment[name] !== undefined) bindings[name] = environment[name]
  }
  return bindings
}

// Provenance: pxlblz-v3 src/bridge/server.ts at 9ecd481f (request path extracted to service.ts; see src/agent-harness/PROVENANCE.md)
// Process entry for the local dictation bridge (V3 #30; V2 #945), run under
// src/agent-harness/run.ts (Vite module semantics), which awaits `main`.
//   npm run agent:bridge                       live agent (OpenAI Responses API); needs OPENAI_API_KEY
//   BRIDGE_AGENT=scripted npm run agent:bridge  the corpus's fake agent; every request carries its script
// Environment: BRIDGE_PORT (default: an ephemeral loopback port, printed),
// BRIDGE_MODEL (gpt-5.6-luna), BRIDGE_EFFORT (high), AGENT_HARNESS_ENV_FILE
// (an existing protected env file to read OPENAI_API_KEY from).
//
// This is the existing experiment configuration, not a production-model
// decision; paid runs wait for the #945 budget guard. Never deployed.
import { readFileSync } from 'node:fs'
import { createOpenAiAgent } from '../experiment/openaiAgent.js'
import type { DictationAgent } from '../experiment/runner.js'
import { createScriptedAgent, startBridge, type ProgressEvent } from './service.js'

const MODEL = process.env.BRIDGE_MODEL ?? 'gpt-5.6-luna'
const EFFORT = process.env.BRIDGE_EFFORT ?? 'high'
const AGENT_MODE = process.env.BRIDGE_AGENT ?? 'openai'

// The credential stays in its existing protected location (#945): the
// process reads OPENAI_API_KEY from the environment or from the file named
// by AGENT_HARNESS_ENV_FILE, and never prints it. Nothing under this
// repository is read for it: `.env` is not ignored here and `.dev.vars`
// belongs to the Worker.
function loadCredentialFile(): void {
  const path = process.env.AGENT_HARNESS_ENV_FILE
  if (!path) return
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return
  }
  for (const line of raw.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line)
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^"|"$/g, '')
    }
  }
}

export async function main(): Promise<void> {
  // One utterance runs at a time, so a single mutable ref can route the
  // agent's global timing events into the current request's stream.
  const progress: { current: ((event: ProgressEvent) => void) | null } = { current: null }
  let agent: DictationAgent
  if (AGENT_MODE === 'scripted') {
    agent = createScriptedAgent()
  } else if (AGENT_MODE === 'openai') {
    loadCredentialFile()
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set (checked the environment and AGENT_HARNESS_ENV_FILE). The live bridge needs it; BRIDGE_AGENT=scripted runs without one.')
      process.exitCode = 1
      return
    }
    agent = createOpenAiAgent({
      model: MODEL,
      reasoningEffort: EFFORT,
      onEvent: (event) => {
        if (event.kind === 'model-call') {
          const tokens = event.inputTokens !== undefined
            ? `, ${event.inputTokens} in (${event.cachedInputTokens ?? 0} cached), ${event.outputTokens ?? 0} out (${event.reasoningTokens ?? 0} reasoning)`
            : ''
          console.log(`  model call: ${(event.ms / 1000).toFixed(1)}s (${event.toolCalls} tool call${event.toolCalls === 1 ? '' : 's'} requested${tokens})`)
          progress.current?.({ kind: 'thinking' })
        } else {
          console.log(`  RATE LIMITED: waiting ${(event.ms / 1000).toFixed(1)}s - the org tier's RPM cap is throttling turns`)
        }
      },
    })
  } else {
    console.error(`BRIDGE_AGENT must be "openai" or "scripted", not "${AGENT_MODE}".`)
    process.exitCode = 1
    return
  }

  const port = process.env.BRIDGE_PORT ? Number(process.env.BRIDGE_PORT) : 0
  const started = await startBridge({ agent, scripted: AGENT_MODE === 'scripted', progress, port })
  console.log(`dictation bridge listening on ${started.url} (${agent.name}${AGENT_MODE === 'scripted' ? ', scripted' : ''})`)
  console.log('inject the chat overlay in the editor tab with:')
  console.log(`  const s = document.createElement('script'); s.src = '${started.url}/chat.js'; document.body.appendChild(s)`)
}

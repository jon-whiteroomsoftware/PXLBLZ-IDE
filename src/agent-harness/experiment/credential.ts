import { readFileSync } from 'node:fs'

/** Load the live harness credential from the one explicitly authorised file. */
export function loadHarnessCredentialFile(env: NodeJS.ProcessEnv = process.env): void {
  if (env.OPENAI_API_KEY !== undefined) return
  const path = env.AGENT_HARNESS_ENV_FILE
  if (!path) return

  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return
  }

  for (const line of raw.split('\n')) {
    const match = /^\s*OPENAI_API_KEY\s*=\s*(.*)\s*$/.exec(line)
    if (match) {
      env.OPENAI_API_KEY = match[1].replace(/^"|"$/g, '')
      return
    }
  }
}

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadHarnessCredentialFile } from '../experiment/credential.js'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('agent harness credential file', () => {
  it('loads OPENAI_API_KEY from the explicitly named external env file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-agent-credential-'))
    directories.push(directory)
    const path = join(directory, 'protected.env')
    writeFileSync(path, 'UNRELATED=value\nOPENAI_API_KEY="test-key-not-a-credential"\n')
    const env: NodeJS.ProcessEnv = { AGENT_HARNESS_ENV_FILE: path }

    loadHarnessCredentialFile(env)

    expect(env.OPENAI_API_KEY).toBe('test-key-not-a-credential')
    expect(env.UNRELATED).toBeUndefined()
  })

  it('does not replace an OPENAI_API_KEY already supplied by the process', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-agent-credential-'))
    directories.push(directory)
    const path = join(directory, 'protected.env')
    writeFileSync(path, 'OPENAI_API_KEY="file-key-not-a-credential"\n')
    const env: NodeJS.ProcessEnv = {
      AGENT_HARNESS_ENV_FILE: path,
      OPENAI_API_KEY: 'process-key-not-a-credential',
    }

    loadHarnessCredentialFile(env)

    expect(env.OPENAI_API_KEY).toBe('process-key-not-a-credential')
  })
})

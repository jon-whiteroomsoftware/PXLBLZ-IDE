import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'
import {
  executeBetaAccessCommand,
  parseBetaAccessArgs,
  type BetaAccessCommandIo,
} from './beta-access-lib'
import {
  createWranglerBetaAccessStore,
  parseWranglerD1Json,
  wranglerBetaAccessArgs,
} from './wrangler-beta-access-store'

async function main(): Promise<void> {
  const args = parseBetaAccessArgs(process.argv.slice(2))
  const wranglerBin = resolve('node_modules/wrangler/bin/wrangler.js')
  const store = createWranglerBetaAccessStore(async (sql) => {
    const output = execFileSync(
      process.execPath,
      [wranglerBin, ...wranglerBetaAccessArgs(args.remote, sql)],
      { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
    )
    return parseWranglerD1Json(output)
  })
  await executeBetaAccessCommand(args, store, commandIo())
}

function commandIo(): BetaAccessCommandIo {
  return {
    log: (message) => console.log(message),
    confirm: async (message) => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error(`${message} Re-run with --yes in a non-interactive shell.`)
      }
      const prompt = createInterface({ input: process.stdin, output: process.stdout })
      try {
        const answer = await prompt.question(`${message} Type yes to continue: `)
        return answer.trim().toLowerCase() === 'yes'
      } finally {
        prompt.close()
      }
    },
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === invokedPath) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

import { normalizeBetaAccessEmail } from '../src/cloudflare/betaAccess'
import type { BetaAccessEntry } from '../src/cloudflare/betaAccess'

export type BetaAccessCliArgs =
  | { command: 'list'; remote: boolean }
  | {
    command: 'add'
    email: string
    label: string | null
    remote: boolean
    yes: boolean
  }
  | {
    command: 'disable' | 'remove'
    email: string
    remote: boolean
    yes: boolean
  }

export interface BetaAccessCommandStore {
  list(): Promise<BetaAccessEntry[]>
  getByEmail(email: string): Promise<BetaAccessEntry | null>
  add(email: string, label: string | null): Promise<void>
  disable(email: string): Promise<void>
  remove(email: string): Promise<void>
}

export interface BetaAccessCommandIo {
  log(message: string): void
  confirm(message: string): Promise<boolean>
}

export type BetaAccessCommandResult = 'changed' | 'unchanged' | 'cancelled'

export function parseBetaAccessArgs(argv: readonly string[]): BetaAccessCliArgs {
  const [command, ...rest] = argv
  if (command === 'list') {
    if (rest.some((argument) => argument !== '--remote')) {
      throw new Error('list does not accept an email or mutation options.')
    }
    if (rest.filter((argument) => argument === '--remote').length > 1) {
      throw new Error('Duplicate option: --remote')
    }
    return { command, remote: rest.includes('--remote') }
  }
  if (command !== 'add' && command !== 'disable' && command !== 'remove') {
    throw new Error('Usage: beta-access <list|add|disable|remove> [email] [--label name] [--remote] [--yes]')
  }
  const emailInput = rest[0]
  if (!emailInput || emailInput.startsWith('--')) throw new Error(`${command} requires an email address.`)
  const email = normalizeBetaAccessEmail(emailInput)
  let label: string | null = null
  let remote = false
  let yes = false
  const seen = new Set<string>()
  for (let index = 1; index < rest.length; index += 1) {
    const option = rest[index]
    if (!option.startsWith('--')) throw new Error(`Unexpected argument: ${option}`)
    if (seen.has(option)) throw new Error(`Duplicate option: ${option}`)
    seen.add(option)
    if (option === '--remote') {
      remote = true
      continue
    }
    if (option === '--yes') {
      yes = true
      continue
    }
    if (option === '--label') {
      if (command !== 'add') throw new Error(`Unknown option for ${command}: --label`)
      const value = rest[index + 1]
      if (!value || value.startsWith('--')) throw new Error('--label requires a value.')
      label = value.trim()
      if (!label) throw new Error('--label requires a value.')
      index += 1
      continue
    }
    throw new Error(`Unknown option: ${option}`)
  }
  if (command === 'add') return { command, email, label, remote, yes }
  return { command, email, remote, yes }
}

export async function executeBetaAccessCommand(
  args: BetaAccessCliArgs,
  store: BetaAccessCommandStore,
  io: BetaAccessCommandIo,
): Promise<BetaAccessCommandResult> {
  const target = args.remote ? 'production' : 'local'
  if (args.command === 'list') {
    const entries = await store.list()
    io.log(`${target} beta access (${entries.length})`)
    for (const entry of entries) {
      io.log(`${entry.enabled ? 'active' : 'disabled'}\t${entry.email}\t${entry.label ?? ''}`)
    }
    return 'unchanged'
  }

  const current = await store.getByEmail(args.email)
  const noChange = args.command === 'add'
    ? current?.enabled === true && (args.label === null || args.label === current.label)
    : args.command === 'disable'
      ? current === null || !current.enabled
      : current === null
  if (noChange) {
    io.log(`No change: ${args.email} is already ${desiredState(args.command)} in ${target}.`)
    return 'unchanged'
  }

  const description = `${args.command} ${args.email}${args.command === 'add' && args.label ? ` (${args.label})` : ''}`
  io.log(`${target === 'production' ? 'PRODUCTION' : 'local'} beta access change: ${description}`)
  if (args.remote && !args.yes && !await io.confirm(`Apply this production change: ${description}?`)) {
    io.log('Cancelled; no change was made.')
    return 'cancelled'
  }

  if (args.command === 'add') await store.add(args.email, args.label)
  else if (args.command === 'disable') await store.disable(args.email)
  else await store.remove(args.email)
  await verifyMutation(store, args)
  io.log(`Verified ${target} beta access: ${args.email} is ${desiredState(args.command)}.`)
  return 'changed'
}

function desiredState(command: 'add' | 'disable' | 'remove'): string {
  return command === 'add' ? 'active' : command === 'disable' ? 'disabled' : 'absent'
}

async function verifyMutation(
  store: BetaAccessCommandStore,
  args: Exclude<BetaAccessCliArgs, { command: 'list' }>,
): Promise<void> {
  const stored = await store.getByEmail(args.email)
  const valid = args.command === 'add'
    ? stored?.enabled === true && (args.label === null || stored.label === args.label)
    : args.command === 'disable'
      ? stored?.enabled === false
      : stored === null
  if (!valid) throw new Error(`Could not verify ${args.email} is ${desiredState(args.command)}.`)
}

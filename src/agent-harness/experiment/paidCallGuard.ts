// The durable paid-call guard (#945): the file-backed side of
// paidCallBudget.ts. One guard is opened per run (a corpus CLI invocation or
// a bridge process); it holds an exclusive lock on the ledger for the run,
// appends a reservation before every dispatch attempt, and settles or
// abandons it afterwards. Every state change is written to disk before the
// call returns, with a temp-file rename, so a crash between reservation and
// settlement leaves the reservation on record.
//
// The ledger lives outside any worktree so reruns and parallel checkouts
// share one aggregate: AGENT_HARNESS_LEDGER, else
// $XDG_STATE_HOME/pxlblz-ide/agent-harness-paid-calls.json, else
// ~/.local/state/pxlblz-ide/agent-harness-paid-calls.json. A missing file is
// a refusal, never an implicit fresh start: `npm run agent:budget -- init`
// creates it explicitly. A malformed file is a refusal and is never
// rewritten. A second opener while the lock is held is refused; a lock left
// by a crashed run is reported with its holder and removed by hand.
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  abandonEntry,
  acceptedPrice,
  boundRequest,
  decideReservation,
  emptyLedger,
  ledgerTotals,
  PAID_CALL_BOUNDS,
  PaidCallRefusedError,
  parseLedger,
  refuse,
  settleEntry,
  validUsage,
  type BoundedResponsesRequest,
  type LedgerDocument,
  type LedgerEntry,
  type LedgerTotals,
  type PaidCallBounds,
  type PaidCallPrice,
  type PaidCallRefusal,
  type ReportedUsage,
} from './paidCallBudget.js'
import { MODEL_PRICES } from './pricing.js'

export function defaultLedgerPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.AGENT_HARNESS_LEDGER) return env.AGENT_HARNESS_LEDGER
  const stateHome = env.XDG_STATE_HOME || join(homedir(), '.local', 'state')
  return join(stateHome, 'pxlblz-ide', 'agent-harness-paid-calls.json')
}

export interface PaidCallReservation {
  ok: true
  id: string
  reservedUsd: number
  boundedInputTokens: number
}

export interface PaidCallStatus {
  ledgerPath: string
  runId: string
  bounds: PaidCallBounds
  aggregate: LedgerTotals
  run: LedgerTotals
  remainingAggregateUsd: number
  remainingRunUsd: number
  halted: string | null
  unit: string | null
  unitCalls: number
}

export interface PaidCallGuard {
  readonly ledgerPath: string
  readonly runId: string
  /** Start a new accounting unit (one corpus case, one bridge turn); resets its call count. */
  beginUnit: (label: string) => void
  /** Reserve the worst case for one dispatch attempt, durably, before the call. */
  reserve: (request: BoundedResponsesRequest, priorOutputTokens: number) => PaidCallReservation | PaidCallRefusal
  /** Settle a reservation at reported usage; an invalid usage block keeps it ambiguous. */
  settle: (id: string, usage: unknown) => void
  /** Keep a reservation as ambiguous spend (error, timeout, missing usage). */
  abandon: (id: string, note: string) => void
  status: () => PaidCallStatus
  /** Release the lock. The ledger itself is never removed. */
  close: () => void
}

export interface OpenGuardOptions {
  ledgerPath?: string
  bounds?: PaidCallBounds
  prices?: Record<string, PaidCallPrice>
  now?: () => Date
  runId?: string
  /** For the lock file; defaults to this process. */
  pid?: number
}

function writeAtomically(path: string, text: string): void {
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temp, text)
  renameSync(temp, path)
}

function serialize(ledger: LedgerDocument): string {
  return `${JSON.stringify(ledger, null, 2)}\n`
}

function lockPath(ledgerPath: string): string {
  return `${ledgerPath}.lock`
}

/** Take the ledger lock exclusively; refuse when it is held. */
function acquireLock(ledgerPath: string, pid: number, now: Date): PaidCallRefusal | null {
  const path = lockPath(ledgerPath)
  let fd: number
  try {
    fd = openSync(path, 'wx')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    let holder = 'unreadable'
    try {
      holder = readFileSync(path, 'utf8').trim()
    } catch {
      // The holder line is informational only.
    }
    return refuse(
      'ledger-locked',
      `another run holds the ledger lock ${path} (${holder}); wait for it, or remove the lock by hand after confirming that process is gone`,
    )
  }
  writeSync(fd, `pid ${pid} since ${now.toISOString()}\n`)
  closeSync(fd)
  return null
}

/** Read and validate the ledger; refuse when missing or malformed. */
export function readLedger(ledgerPath: string): { ok: true; ledger: LedgerDocument } | PaidCallRefusal {
  let text: string
  try {
    text = readFileSync(ledgerPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return refuse('ledger-missing', `no ledger at ${ledgerPath}; create it explicitly with "npm run agent:budget -- init"`)
    }
    throw error
  }
  const parsed = parseLedger(text)
  return parsed.ok ? parsed : refuse('ledger-malformed', `${ledgerPath}: ${parsed.reason}; the file was left untouched and needs a human`)
}

/** Create an empty ledger; refuses to replace an existing file of any content. */
export function initLedger(ledgerPath: string, authorisation: string, now: Date = new Date()): { ok: true } | PaidCallRefusal {
  mkdirSync(dirname(ledgerPath), { recursive: true })
  let fd: number
  try {
    fd = openSync(ledgerPath, 'wx')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    return refuse('ledger-exists', `a ledger already exists at ${ledgerPath}; it is never replaced`)
  }
  writeSync(fd, serialize(emptyLedger(now, authorisation)))
  closeSync(fd)
  return { ok: true }
}

function remaining(ceiling: number, consumed: number): number {
  return Math.round((ceiling - consumed) * 1_000_000) / 1_000_000
}

/**
 * Open the guard for one run: validate the ledger, take the lock. Throws
 * PaidCallRefusedError so a caller cannot proceed past a refusal by
 * accident.
 */
export function openPaidCallGuard(options: OpenGuardOptions = {}): PaidCallGuard {
  const ledgerPath = options.ledgerPath ?? defaultLedgerPath()
  const bounds = options.bounds ?? PAID_CALL_BOUNDS
  const prices = options.prices ?? MODEL_PRICES
  const now = options.now ?? (() => new Date())
  const pid = options.pid ?? process.pid
  const runId = options.runId ?? `${now().toISOString().replace(/[:.]/g, '-')}-${pid}`

  const initial = readLedger(ledgerPath)
  if (!initial.ok) throw new PaidCallRefusedError(initial)
  const locked = acquireLock(ledgerPath, pid, now())
  if (locked) throw new PaidCallRefusedError(locked)
  // Re-read under the lock: the pre-lock read only decided whether to lock.
  const reread = readLedger(ledgerPath)
  if (!reread.ok) {
    unlinkSync(lockPath(ledgerPath))
    throw new PaidCallRefusedError(reread)
  }

  let ledger = reread.ledger
  let unit: string | null = null
  let unitCalls = 0
  let halted: string | null = null
  let sequence = 0
  let open = true

  const persist = (next: LedgerDocument) => {
    writeAtomically(ledgerPath, serialize(next))
    ledger = next
  }
  const replaceEntry = (next: LedgerEntry) => {
    persist({ ...ledger, entries: ledger.entries.map((entry) => (entry.id === next.id ? next : entry)) })
  }
  const reservedEntry = (id: string): LedgerEntry => {
    if (!open) throw new Error('the paid-call guard is closed')
    const entry = ledger.entries.find((candidate) => candidate.id === id)
    if (!entry) throw new Error(`no ledger entry ${id}`)
    if (entry.runId !== runId) throw new Error(`ledger entry ${id} belongs to run ${entry.runId}, not this run; it stays as recorded`)
    if (entry.state !== 'reserved') throw new Error(`ledger entry ${id} is already ${entry.state}`)
    return entry
  }

  return {
    ledgerPath,
    runId,
    beginUnit: (label) => {
      unit = label
      unitCalls = 0
    },
    reserve: (request, priorOutputTokens) => {
      if (!open) return refuse('halted', 'the paid-call guard is closed')
      const price = acceptedPrice(request.model, prices, bounds, now())
      if (!price.ok) return price
      const bound = boundRequest(request, bounds, priorOutputTokens)
      if (!bound.ok) return bound
      sequence += 1
      const decided = decideReservation({
        ledger,
        bounds,
        price: price.price,
        runId,
        unit,
        unitCalls,
        halted,
        bound,
        model: request.model,
        entryId: `${runId}-${sequence}`,
        now: now(),
      })
      if (!decided.ok) return decided
      persist({ ...ledger, entries: [...ledger.entries, decided.entry] })
      unitCalls += 1
      return {
        ok: true,
        id: decided.entry.id,
        reservedUsd: decided.entry.reservedUsd,
        boundedInputTokens: decided.entry.boundedInputTokens,
      }
    },
    settle: (id, usage) => {
      const entry = reservedEntry(id)
      if (!validUsage(usage)) {
        replaceEntry(abandonEntry(entry, 'the response carried no valid usage block; kept at the reservation'))
        return
      }
      const price = acceptedPrice(entry.model, prices, bounds, now())
      if (!price.ok) {
        replaceEntry(abandonEntry(entry, `settlement refused: ${price.reason}`))
        halted = price.reason
        return
      }
      const settled = settleEntry(entry, usage as ReportedUsage, price.price, now())
      replaceEntry(settled.entry)
      if (settled.overrun) halted = settled.overrun
    },
    abandon: (id, note) => {
      replaceEntry(abandonEntry(reservedEntry(id), note))
    },
    status: () => {
      const aggregate = ledgerTotals(ledger)
      const run = ledgerTotals(ledger, runId)
      return {
        ledgerPath,
        runId,
        bounds,
        aggregate,
        run,
        remainingAggregateUsd: remaining(bounds.aggregateUsd, aggregate.consumedUsd),
        remainingRunUsd: remaining(bounds.perRunUsd, run.consumedUsd),
        halted,
        unit,
        unitCalls,
      }
    },
    close: () => {
      if (!open) return
      open = false
      try {
        unlinkSync(lockPath(ledgerPath))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    },
  }
}

/** One-line accounting summary for logs and reports. */
export function describeStatus(status: PaidCallStatus): string {
  const { aggregate, run, bounds } = status
  return (
    `ledger ${status.ledgerPath}: aggregate $${aggregate.consumedUsd.toFixed(4)} of $${bounds.aggregateUsd} ` +
    `(${aggregate.settled} settled, ${aggregate.ambiguous} ambiguous, ${aggregate.reserved} unsettled, ${aggregate.overruns} overruns); ` +
    `this run $${run.consumedUsd.toFixed(4)} of $${bounds.perRunUsd} over ${run.entries} call${run.entries === 1 ? '' : 's'}` +
    (status.halted ? `; HALTED: ${status.halted}` : '')
  )
}

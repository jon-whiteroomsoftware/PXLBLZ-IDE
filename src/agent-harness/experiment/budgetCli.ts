// Paid-call ledger CLI (#945). Plain tsx: nothing here needs the Vite runner.
//   npm run agent:budget                 status: path, bounds, totals, remaining, lock, last entries
//   npm run agent:budget -- init         create an empty ledger at the path; refuses if one exists
// The path is AGENT_HARNESS_LEDGER or the state-directory default printed by
// status. Neither command touches a credential or the network.
import { existsSync, readFileSync } from 'node:fs'
import { ledgerTotals, PAID_CALL_BOUNDS } from './paidCallBudget.js'
import { defaultLedgerPath, initLedger, readLedger } from './paidCallGuard.js'
import { MODEL_PRICES } from './pricing.js'

const AUTHORISATION = '#945 live baseline: Jon authorised the existing OpenAI credential with a $20 aggregate maximum on 2026-09-04'

export function main(argv: string[] = process.argv.slice(2)): number {
  const ledgerPath = defaultLedgerPath()
  const command = argv[0] ?? 'status'
  if (command === 'init') {
    const created = initLedger(ledgerPath, AUTHORISATION)
    if (!created.ok) {
      console.error(created.reason)
      return 1
    }
    console.log(`created ${ledgerPath}`)
    return 0
  }
  if (command !== 'status') {
    console.error(`unknown command "${command}"; use status or init`)
    return 2
  }
  console.log(`ledger: ${ledgerPath}`)
  console.log(`bounds: $${PAID_CALL_BOUNDS.aggregateUsd} aggregate, $${PAID_CALL_BOUNDS.perRunUsd} per run, ${PAID_CALL_BOUNDS.maxCallsPerUnit} calls per case or turn, ${PAID_CALL_BOUNDS.maxOutputTokensPerCall} output tokens per call, ${PAID_CALL_BOUNDS.maxInputTokensPerCall} bounded input tokens per call`)
  const accepted = Object.entries(MODEL_PRICES).filter(([, price]) => price.acceptedForPaidRuns)
  console.log(
    accepted.length === 0
      ? 'prices accepted for paid runs: none (every live run refuses before dispatch)'
      : `prices accepted for paid runs: ${accepted.map(([model, price]) => `${model} (${price.acceptedForPaidRuns!.by}, ${price.acceptedForPaidRuns!.on})`).join(', ')}`,
  )
  const lock = `${ledgerPath}.lock`
  if (existsSync(lock)) console.log(`lock: held (${readFileSync(lock, 'utf8').trim()})`)
  const read = readLedger(ledgerPath)
  if (!read.ok) {
    console.error(read.reason)
    return 1
  }
  const totals = ledgerTotals(read.ledger)
  console.log(`created ${read.ledger.createdAt}: ${read.ledger.authorisation}`)
  console.log(
    `consumed $${totals.consumedUsd.toFixed(6)} over ${totals.entries} entries ` +
      `(${totals.settled} settled, ${totals.ambiguous} ambiguous, ${totals.reserved} unsettled, ${totals.overruns} overruns); ` +
      `remaining $${(PAID_CALL_BOUNDS.aggregateUsd - totals.consumedUsd).toFixed(6)}`,
  )
  for (const entry of read.ledger.entries.slice(-10)) {
    const amount = entry.state === 'settled' ? `$${(entry.settledUsd ?? 0).toFixed(6)} actual` : `$${entry.reservedUsd.toFixed(6)} reserved`
    console.log(`  ${entry.reservedAt} ${entry.id} ${entry.unit} ${entry.model} ${entry.state} ${amount}${entry.exceededReservation ? ' OVERRUN' : ''}${entry.note ? ` (${entry.note})` : ''}`)
  }
  return 0
}

process.exitCode = main()

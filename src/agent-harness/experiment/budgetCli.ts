// Paid-call ledger CLI (#945). Plain tsx: nothing here needs the Vite runner.
//   npm run agent:budget                 status: path, bounds, acceptances, per-call reservation, totals, remaining, halt, lock, last entries
//   npm run agent:budget -- init         create an empty ledger at the path; refuses if one exists
// The path is AGENT_HARNESS_LEDGER or the state-directory default printed by
// status. Neither command touches a credential or the network.
import { existsSync, readFileSync } from 'node:fs'
import { describeHalt, ledgerTotals, PAID_CALL_BOUNDS, reservationUsd, validatePriceTerms } from './paidCallBudget.js'
import { defaultLedgerPath, initLedger, readLedger } from './paidCallGuard.js'
import { MODEL_PRICES } from './pricing.js'
import { MODEL_INPUT_LIMITS } from './providerLimits.js'

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
  console.log(
    `bounds: $${PAID_CALL_BOUNDS.aggregateUsd} aggregate, $${PAID_CALL_BOUNDS.perRunUsd} per run, ${PAID_CALL_BOUNDS.maxCallsPerUnit} calls per case or turn, ` +
      `${PAID_CALL_BOUNDS.maxOutputTokensPerCall} output tokens per call, acceptances at most ${PAID_CALL_BOUNDS.acceptanceMaxAgeDays} days old`,
  )
  const acceptedPrices = Object.entries(MODEL_PRICES).filter(([, price]) => price.acceptedForPaidRuns)
  console.log(
    acceptedPrices.length === 0
      ? 'prices accepted for paid runs: none (every live run refuses before dispatch)'
      : `prices accepted for paid runs: ${acceptedPrices
          .map(([model, price]) => {
            const terms = price.terms
            const longContext = terms?.longContext
            const schedule = validatePriceTerms(price)
              ? 'TERMS INVALID, refused'
              : `${longContext && longContext !== 'none' ? `above ${longContext.aboveInputTokens} input tokens ${longContext.inputMultiplier}x input ${longContext.outputMultiplier}x output` : 'no long-context surcharge'}, cache writes ${terms!.cacheWriteMultiplier}x`
            return `${model} $${price.input}/$${price.cachedInput}/$${price.output} per M input/cached/output, ${schedule} (${price.acceptedForPaidRuns!.by}, ${price.acceptedForPaidRuns!.on}; ${price.source})`
          })
          .join('; ')}`,
  )
  const acceptedLimits = Object.entries(MODEL_INPUT_LIMITS).filter(([, limit]) => limit.acceptedForPaidRuns)
  console.log(
    acceptedLimits.length === 0
      ? 'provider input ceilings accepted for paid runs: none (every live run refuses before dispatch; the reservation has no basis)'
      : `provider input ceilings accepted for paid runs: ${acceptedLimits
          .map(([model, limit]) => `${model} ${limit.maxInputTokens} tokens (${limit.acceptedForPaidRuns!.by}, ${limit.acceptedForPaidRuns!.on}; ${limit.source})`)
          .join(', ')}`,
  )
  for (const [model, limit] of acceptedLimits) {
    const price = MODEL_PRICES[model]
    if (!price?.acceptedForPaidRuns || validatePriceTerms(price)) continue
    const check = { ok: true as const, bytes: 0, estimatedInputTokens: 0, reservedInputTokens: limit.maxInputTokens, maxOutputTokens: PAID_CALL_BOUNDS.maxOutputTokensPerCall }
    try {
      const perCall = reservationUsd(price, check)
      console.log(
        `reservation per call for ${model}: $${perCall.toFixed(6)} (${limit.maxInputTokens} input tokens and ${PAID_CALL_BOUNDS.maxOutputTokensPerCall} output tokens ` +
          `at the worst applicable documented rates; at most ${Math.floor(PAID_CALL_BOUNDS.perRunUsd / perCall)} unsettled or ambiguous calls fit one $${PAID_CALL_BOUNDS.perRunUsd} run)`,
      )
    } catch (error) {
      console.log(`reservation per call for ${model}: refused (${error instanceof Error ? error.message : String(error)})`)
    }
  }
  const lock = `${ledgerPath}.lock`
  if (existsSync(lock)) console.log(`lock: held (${readFileSync(lock, 'utf8').trim()})`)
  const read = readLedger(ledgerPath)
  if (!read.ok) {
    console.error(read.reason)
    return 1
  }
  const totals = ledgerTotals(read.ledger)
  console.log(`created ${read.ledger.createdAt}: ${read.ledger.authorisation}`)
  if (read.ledger.halt) console.log(`LEDGER HALTED: ${describeHalt(read.ledger.halt)}`)
  console.log(
    `consumed $${totals.consumedUsd.toFixed(6)} over ${totals.entries} entries ` +
      `(${totals.settled} settled, ${totals.ambiguous} ambiguous, ${totals.reserved} unsettled, ${totals.overruns} overruns); ` +
      `remaining $${(PAID_CALL_BOUNDS.aggregateUsd - totals.consumedUsd).toFixed(6)}`,
  )
  for (const entry of read.ledger.entries.slice(-10)) {
    const amount =
      entry.state === 'settled'
        ? `$${(entry.settledUsd ?? 0).toFixed(6)} settled (${entry.settledBasis ?? 'basis unknown'})`
        : `$${entry.reservedUsd.toFixed(6)} reserved`
    console.log(
      `  ${entry.reservedAt} ${entry.id} ${entry.unit} ${entry.model} ${entry.state} ${amount} (ceiling ${entry.reservedInputTokens}, estimate ${entry.estimatedInputTokens})` +
        `${entry.exceededReservation ? ' OVERRUN' : ''}${entry.settledNote ? ` [${entry.settledNote}]` : ''}${entry.note ? ` (${entry.note})` : ''}`,
    )
  }
  return read.ledger.halt ? 1 : 0
}

process.exitCode = main()

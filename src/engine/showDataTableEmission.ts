// #717: cost-based emission for compiler-generated integer data tables.
//
// A generated table can reach the VM three ways, each with a hardware-measured
// activation price (docs/plans/issue-715-packed-data-pricing-results.md):
// numeric array literals cost 4.25 bytecode bytes per element (an effective
// data segment), per-element assignments cost 20 bytes each (five VM
// instruction words), and the #569 run-length loop costs 80 bytes per
// slope-one run. No single representation wins everywhere - literals win for
// dense arbitrary data, sparse assignments for mostly-zero tables (array(n)
// zero-fills), loops for long ascending runs - so every emitter routes
// through this chooser and the estimate stays the emission model (#573).
//
// Integer-only by contract: fractional 16.16 literals carry a measured
// one-ulp parse hazard (#715) that integer values in [-32767, 32767] avoid.
import {
  MEASURED_ELEMENT_ASSIGNMENT_BYTECODE_BYTES,
  MEASURED_LITERAL_ELEMENT_BYTECODE_BYTES,
} from './showVmResourceLedger'

export const RUN_LENGTH_LOOP_BYTECODE_BYTES = 80

/** Loops only pay off once they replace a few per-element lines; shared with
 * the #569 emitter so the plan prices exactly what will be emitted. */
export const PACKED_ROUTING_LOOP_MIN_RUN = 4

export interface PackedRoutingRun {
  start: number
  end: number
  /** values[i] = base + i for every i in [start, end]. */
  base: number
}

/**
 * Extracts maximal slope-one runs of nonzero values: each run covers indices
 * whose value increments by exactly one per index. Zero entries (unrouted
 * pixels) are skipped entirely because `array(n)` zero-initializes. Overlap
 * semantics are already resolved in the value array (first writer wins), so
 * the runs are disjoint by construction and need no runtime guard.
 */
export function computeLinearRuns(values: readonly number[]): PackedRoutingRun[] {
  const runs: PackedRoutingRun[] = []
  let active: PackedRoutingRun | null = null
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === 0) {
      active = null
      continue
    }
    const base = value - index
    if (active && active.base === base) {
      active.end = index
      continue
    }
    active = { start: index, end: index, base }
    runs.push(active)
  }
  return runs
}

export type DataTableRepresentation = 'array-call' | 'literal' | 'sparse-assignments' | 'run-length'

export interface DataTableEmission {
  representation: DataTableRepresentation
  lines: string[]
  /** Data cost only, excluding the shared allocation statement all
   * representations pay in one form or another. */
  estimatedBytecodeBytes: number
}

export interface DataTableEmissionOptions {
  /** Name for the run-length loop counter. Loops are only candidates when a
   * name is provided, because the counter is a persistent global the caller
   * must own and dedupe. */
  loopIndexName?: string
}

export function emitIntegerDataTable(
  name: string,
  values: readonly number[],
  options: DataTableEmissionOptions = {},
): DataTableEmission {
  for (const value of values) {
    if (!Number.isInteger(value) || value < -32_767 || value > 32_767) {
      throw new Error(`emitIntegerDataTable(${name}) requires integers in [-32767, 32767]; got ${value}`)
    }
  }
  const nonzeroCount = values.reduce((count, value) => count + (value === 0 ? 0 : 1), 0)
  if (nonzeroCount === 0) {
    return {
      representation: 'array-call',
      lines: [`var ${name} = array(${values.length})`],
      estimatedBytecodeBytes: 0,
    }
  }

  const literalCost = Math.ceil(values.length * MEASURED_LITERAL_ELEMENT_BYTECODE_BYTES)
  const sparseCost = nonzeroCount * MEASURED_ELEMENT_ASSIGNMENT_BYTECODE_BYTES

  const runs = computeLinearRuns(values)
  let loopRuns = 0
  let shortElements = 0
  for (const run of runs) {
    const length = run.end - run.start + 1
    if (length >= PACKED_ROUTING_LOOP_MIN_RUN) loopRuns += 1
    else shortElements += length
  }
  const runCost = loopRuns * RUN_LENGTH_LOOP_BYTECODE_BYTES
    + shortElements * MEASURED_ELEMENT_ASSIGNMENT_BYTECODE_BYTES
  const runsEligible = options.loopIndexName != null && loopRuns > 0

  const cheapest = Math.min(literalCost, sparseCost, runsEligible ? runCost : Infinity)
  if (cheapest === literalCost) {
    return {
      representation: 'literal',
      lines: [`var ${name} = [${values.join(',')}]`],
      estimatedBytecodeBytes: literalCost,
    }
  }
  if (cheapest === sparseCost) {
    return {
      representation: 'sparse-assignments',
      lines: [
        `var ${name} = array(${values.length})`,
        ...values.flatMap((value, index) => (value === 0 ? [] : [`${name}[${index}] = ${value}`])),
      ],
      estimatedBytecodeBytes: sparseCost,
    }
  }
  const loopIndex = options.loopIndexName!
  const lines = [
    `var ${name} = array(${values.length})`,
    `var ${loopIndex} = 0`,
    ...runs.flatMap((run) => {
      if (run.end - run.start + 1 >= PACKED_ROUTING_LOOP_MIN_RUN) {
        const offset = run.base === 0 ? '' : run.base > 0 ? ` + ${run.base}` : ` - ${-run.base}`
        return [
          `for (${loopIndex} = ${run.start}; ${loopIndex} <= ${run.end}; ${loopIndex} = ${loopIndex} + 1) ${name}[${loopIndex}] = ${loopIndex}${offset}`,
        ]
      }
      return Array.from({ length: run.end - run.start + 1 }, (_, offsetIndex) => (
        `${name}[${run.start + offsetIndex}] = ${run.base + run.start + offsetIndex}`
      ))
    }),
  ]
  return { representation: 'run-length', lines, estimatedBytecodeBytes: runCost }
}

/**
 * Literal-only table for fractional values such as schedule boundaries in
 * seconds. The device parser can emit a fractional literal one ulp low
 * (#715, ~0.5% of words); at 2^-16 that is a 15-microsecond error on a time
 * boundary, which schedule consumers tolerate by construction. Data that
 * must round-trip exactly belongs in emitIntegerDataTable or a guarded
 * packed encoding instead.
 */
export function emitFractionalDataTable(
  name: string,
  values: readonly number[],
): DataTableEmission {
  for (const value of values) {
    if (!Number.isFinite(value) || value <= -32_768 || value >= 32_768) {
      throw new Error(`emitFractionalDataTable(${name}) requires finite 16.16-range values; got ${value}`)
    }
  }
  return {
    representation: 'literal',
    lines: [`var ${name} = [${values.join(',')}]`],
    estimatedBytecodeBytes: Math.ceil(values.length * MEASURED_LITERAL_ELEMENT_BYTECODE_BYTES),
  }
}

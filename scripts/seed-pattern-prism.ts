import { createPatternPrismShow } from '../src/engine/patternPrismShow'
import { seedLocalShow } from './seed-local-show'

/** Awaited by `src/agent-harness/run.ts`, which resolves the built-in Pattern sources. */
export async function main(): Promise<void> {
  await seedLocalShow(createPatternPrismShow())
}

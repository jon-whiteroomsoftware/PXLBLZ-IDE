// Provider-enforced input-token ceilings (#945): the reservation basis for
// every paid call. The guard reserves the full ceiling of the selected model
// (priced uncached) plus the output cap before each dispatch, so a figure
// here authorises real spend and must come from the provider's primary
// documentation, be observed as enforced (a request above it is rejected,
// not billed), and be accepted separately from the price.
//
// This table ships empty on purpose. No numeric limit is invented here and
// nothing is accepted: every live route refuses with `limit-unknown` until
// the coordinator verifies the official figure and records an entry of the
// shape below. The acceptance date is checked against
// PAID_CALL_BOUNDS.acceptanceMaxAgeDays.
//
//   'gpt-5.6-luna': {
//     maxInputTokens: <integer from the provider's model page>,
//     requestShape: SUPPORTED_REQUEST_SHAPE,
//     source: '<exact URL or document and section>',
//     readOn: '<ISO date read>',
//     evidence: '<what the source states; how enforcement was confirmed>',
//     acceptedForPaidRuns: { by: '<name>', on: '<ISO date>', note: '<optional>' },
//   },
import type { ProviderInputLimit } from './paidCallBudget.js'

export const MODEL_INPUT_LIMITS: Record<string, ProviderInputLimit> = {}

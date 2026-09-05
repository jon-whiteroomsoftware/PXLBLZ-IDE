// Provider-enforced input-token ceilings (#945): the reservation basis for
// every paid call. The guard reserves the full ceiling of the selected model
// (priced at the worst applicable documented rates) plus the output cap
// before each dispatch, so a figure here authorises real spend and must come
// from the provider's primary documentation, be observed or documented as
// enforced (a request above it is rejected, not billed), and be accepted
// separately from the price. The acceptance date is checked against
// PAID_CALL_BOUNDS.acceptanceMaxAgeDays.
//
// One entry, for gpt-5.6-luna, recorded from the provider's official pages
// read by the #945 root coordinator on 2026-09-05 (working note
// 945-provider-verified.md). No other model is recorded; every other live
// route refuses with `limit-unknown`. Enforcement rests on the Responses
// reference for truncation=disabled, which the harness pins on every request
// (SUPPORTED_REQUEST_SHAPE); it has not yet been observed on a live request,
// and the settlement overrun halt is the backstop if the provider ever bills
// input above this figure.
import { SUPPORTED_REQUEST_SHAPE, type ProviderInputLimit } from './paidCallBudget.js'

export const MODEL_INPUT_LIMITS: Record<string, ProviderInputLimit> = {
  'gpt-5.6-luna': {
    // The model page states a 1,050,000-token context window. Input cannot
    // exceed the context window, so the window is used as the input ceiling;
    // it is an upper bound on input, not a separate input-only figure.
    maxInputTokens: 1_050_000,
    requestShape: SUPPORTED_REQUEST_SHAPE,
    source:
      'https://developers.openai.com/api/docs/models/gpt-5.6-luna (context window, maximum output); ' +
      'https://developers.openai.com/api/reference/cli/resources/responses/methods/create (truncation)',
    readOn: '2026-09-05',
    evidence:
      'Model page: context window 1,050,000 tokens, maximum output 128,000 tokens. Responses create reference: ' +
      'with truncation disabled, input that exceeds the context window is rejected with HTTP 400 rather than ' +
      'truncated; the harness pins truncation=disabled on every request. Enforcement is documented, not yet ' +
      'observed on a live request; a settlement above this ceiling halts the ledger.',
    acceptedForPaidRuns: {
      by: '#945 root coordinator (gpt-6-astra)',
      on: '2026-09-05',
      note:
        'Accepted for the bounded Luna baseline only, after the guard tests and candidate review; ' +
        'no paid call is authorised by this entry alone. Not verified by Jon.',
    },
  },
}

# Existing field activity proof (#949)

Source: `2fdb907c2641600136a703796c55129d711c41cf`.
Managed shared issue runtime: `http://localhost:5178/PXLBLZ-IDE/`, isolated browser
context authenticated as `github:local-agent-04`. The scripted loopback bridge
made no paid model calls. No synthetic activity tokens were acquired.

The committed `FA` regression in `e2e/agent-baseline.auth.spec.ts` and fresh
committed-source capture exercised the actual Clip duration field:

| Sequence | Outcome | Writes before Undo |
| --- | --- | --- |
| In-flight request, type 7, wait, Escape | Exact 8-second candidate saved once | 1 |
| In-flight request, type 7, wait, Enter | Manual 7-second edit saved; candidate revision refusal | 1 |
| In-flight request, type 7, wait, pointer Cancel | Request cancelled; field draft and focus retained | 0 |
| In-flight request, focus unchanged duration | Immediate exact 8-second candidate saved | 1 |

While waiting, complete visible/durable records remained unchanged and Undo stayed
disabled. Each changed full record matched its expected result and durable record;
the actual downloaded `.pxlshow` reopened through `parseShowFileBundle` with the
same Show. One Undo restored the original full record and exhausted history.
The committed-source run reported no page or console errors. Desktop captures
are 1440×900; the dirty-field cancellation capture is 800×900. Captures and their
source pin are in `.wrsp/ui-proof/949-fields.json`.

Initial integration verification: 108 tests passed across field and diagnostic admission
suites. Three omission probes were detected: ignored dirty ownership, activity
release before manual adoption, and missed existing-control rebind. Normal
pre-commit checks passed lint, TypeScript, 290 staged tests and 12 Chromium layout
tests. Detailed logs and full synthetic records remain in ignored
`.wrsp/949-field-activity/`; final authoritative suites and native review belong
to the coordinator.

The P1 repair separates diagnostic Cancel's outside-pointer preservation from
inspector Escape ownership. Before repair, both focused idle/waiting Escape tests
failed, and the actual browser inspector remained open with Cancel hidden. After
repair, 37 focused tests passed, including legitimate detail-owned portal
suppression. The independent `FA` browser regression passed; fresh source-pinned
capture proved ordinary inspector closure with Cancel hidden and dirty-draft
Escape while waiting, plus all four sequences above. Normal repair commit checks
passed lint, TypeScript and 223 staged tests.

The separate A/B/FA/F baseline batch was not all green: A failed before its Escape
assertions (`request.applied` was null instead of false; scripted bridge returned
no reply). Serial failfast skipped B, F and FA in that batch. FA was then run
independently and passed. No claim about B/F follows from that batch, and unrelated
A semantics were not changed. Repair evidence is in `escape-red.log`,
`escape-browser-red.log`, `escape-green.log`, `escape-browser-green.log`,
`escape-baseline-A-bridge.log`, `escape-fa-green.log`, and
`escape-committed-browser.log` under the ignored evidence directory. The original
three omission probes cover unchanged field wiring; they were not repeated for
this narrow ownership repair.

The existing issue-reporting post-commit hook returned 141 while truncating the
long issue body (`jq | head` under `pipefail`), after successful source commit.
Its hook and classifier configuration were not changed or bypassed.

Registered families are DraftTextField, NumberField/useNumberFieldDraft and
BoundedNumberField wrappers, including their portalled sliders. Focus-only and
idle pinned sliders remain inactive. Retained rejected/throwing text drafts stay
owned until cancellation; a numeric callback that already settles its draft
releases afterward. Lifecycle tests include overlap, invalid text, pointer cancel
and lost capture, disabled controls, session/URL replacement, StrictMode teardown,
capacity retirement and deadline expiry with surviving dirty input.

Timeline gestures, placement pad, sparkline, Effect reorder and spatial-selection
drafts remain unregistered. External narrow Layer context, final Agent placement,
hosted service and publication are outside this proof. The fixture's existing
Portable 2D reference-map diagnostic is not a JavaScript error and this work does
not claim Controller delivery readiness. CONTEXT.md requires no vocabulary change.

# Goal-based manual test campaigns

A manual test campaign sends independent tester agents through a catalog of
user goals, using the product UI and its user documentation as their only
oracles. Use a campaign for broad discovery, documentation audits, and
cross-surface behavior that would be expensive to encode before the risk is
understood. Automated tests still own repeatable regression coverage after a
finding is fixed.

This package preserves the two campaigns run for #788 and #800 on 2026-08-10:

- [`catalogs/issue-788-shows.md`](catalogs/issue-788-shows.md): 111 Show goals.
- [`catalogs/issue-800-full-surface.md`](catalogs/issue-800-full-surface.md):
  the source's "150 goals" outside the Show surface (148 IDs are enumerated;
  the catalog preserves and explains the discrepancy).
- [`tester-protocol.md`](tester-protocol.md): tester isolation, evidence, and
  verdict rules.
- [`verdict-schema.json`](verdict-schema.json): the structured result contract.
- [`harness/`](harness/): the Playwright HTTP driver and Codex batch runners.

The source record remains on [#788](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/788)
and [#800](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/800).
The repository copy is the reusable operational version: it removes the
original campaign's user-specific source root, scratch directory, session file,
and fixed runtime port.

The catalogs are historical campaign inputs, not current product requirements.
Before rerunning one, compare every referenced user-document section and
feature flag with the current product. Preserve a goal's identity when its user
intent is unchanged; record changed expectations in the catalog instead of
silently grading against an old promise.

## Campaign contract

The catalog is the campaign's inventory, the user guide is its oracle, and the
tester protocol is its execution boundary. Each goal describes an outcome in
user language and names any destructive, hardware, viewport, setup, or expected
boundary condition. Setup may create prerequisites through an API, but the goal
itself is reached through the UI.

Tester agents stay implementation-blind. Their working directories contain
only an assignment, the tester protocol, the relevant user guide, and the
verdict schema. They do not receive source code, tests, plans, technical
references, or another tester's results. This separation makes a failed search
useful discoverability evidence instead of an implementation-informed guess.

Every goal produces replayable steps and a screenshot. The result also records
console errors, the exact documentation quote for a documented boundary or
drift, search notes for an unreachable capability, and secondary observations
even when the goal passes. All non-PASS results receive a fresh independent
attempt before they enter the consolidated report. The verifier may confirm,
reclassify, or refute the original claim; a finder verdict alone is never a
product finding.

## Prepare the campaign

Run the campaign from an issue worktree and use the managed runtime in
[`../dev-runtime.md`](../dev-runtime.md). Choose `shared` when the worktree uses
main's Functions and schema, or `isolated` when it changes authentication,
Functions, migrations, or another API contract.

1. Start the issue runtime and retain the printed UI URL and synthetic identity.

   ```bash
   npm run dev:issue -- \
     --issue 900 \
     --description "manual test campaign" \
     --profile shared
   ```

2. Create a campaign workspace outside the repository. Evidence can be large
   and may contain private application state, so do not commit it.

   ```bash
   export CAMPAIGN_ROOT=/private/tmp/pxlblz-campaign-900
   mkdir -p "$CAMPAIGN_ROOT/testers" "$CAMPAIGN_ROOT/evidence"
   npm run dev:session -- --issue 900 --json > "$CAMPAIGN_ROOT/session.json"
   ```

3. Partition the catalog into small batches. Keep destructive goals in one
   serialized batch, keep hardware goals on one Controller lane, and avoid
   giving concurrent batches ownership of the same personal record. Five to ten
   related goals usually fit one tester's attention and evidence budget.

4. Create one directory per batch:

   ```text
   <campaign-root>/
   |-- evidence/
   |-- session.json
   `-- testers/
       `-- t1/
           |-- assignment.md
           |-- tester-protocol.md
           |-- user-guide.md
           `-- verdict-schema.json
   ```

   `assignment.md` names the batch, driver port, evidence directory, runtime
   URL, starting route, prerequisite state, and assigned goal rows. Copy this
   package's protocol and schema into every tester directory. Copy only the
   user-facing guide sections needed to judge the assigned goals.

5. Run a pilot that mixes one ordinary goal, one cancellation or refusal path,
   one destructive goal, and one stateful goal. Review the raw JSON, screenshots,
   driver reliability, and token cost before opening the full wave.

The preparation step is complete when every catalog goal belongs to exactly one
batch, every batch owns distinct mutable state, and the pilot has produced a
schema-valid verdict file with usable evidence.

## Run tester waves

The wave runner starts one driver and one ephemeral `codex exec` tester for each
`batch:port[:mode]` specification. `mode` defaults to `auth`; use `nosession` for
signed-out goals. Run it from the campaign workspace or pass `CAMPAIGN_ROOT`
explicitly.

```bash
export PXLBLZ_REPO_ROOT=/Users/you/src/pixelblaze-v2
export CAMPAIGN_ROOT=/private/tmp/pxlblz-campaign-900
export BASE_URL=http://localhost:5175
"$PXLBLZ_REPO_ROOT/docs/agents/manual-test-campaigns/harness/run-wave.sh" \
  t1:9321 t2:9322 signedout:9323:nosession
```

The harness reads Playwright from `PXLBLZ_REPO_ROOT`, writes screenshots under
`<campaign-root>/evidence/<batch>/`, and writes each structured result to
`<campaign-root>/testers/<batch>/verdict.json`. Set `SESSION_FILE` to override
`<campaign-root>/session.json`. Set `CODEX_REASONING_EFFORT` to override the
default `high` effort for tester runs.

Run hardware batches serially. Start `driver.mjs` directly when the Extension
or a persistent Chromium profile is required; its `--extension`,
`--profile-dir`, and `--headed` options cover that lane. Native browser prompts
cannot be clicked by a headless page. A one-time human permission grant or an
explicitly approved test Extension is campaign setup, not a product verdict.

The execution step is complete when every assigned goal has one schema-valid
finder result and its named screenshots exist.

## Verify suspicious results

Build a verification queue from every `BUG`, `WALLED`, `DRIFT`, `LOST`, and
`BLOCKED-ENV` result, plus any PASS result with a console error or material
secondary observation. Give a fresh tester the goal, the relevant user-guide
text, and the finder evidence needed to locate the claim. Do not give it the
finder's conclusion as an expected answer.

The verifier repeats the smallest path that can distinguish these cases:

- the product is broken;
- the behavior is an intentional and surfaced boundary;
- the product and user guide disagree;
- the capability exists but is not discoverable through the attempted paths;
- the harness or environment prevented a product verdict;
- the finder made a false claim.

Capture evidence for the final classification. If the verifier refutes the
claim, retain both attempts in the raw campaign record and count the goal as a
PASS with a refuted-finder note. If the attempts disagree without a separating
fact, keep the item unresolved and run a focused third attempt.

Verification is complete when every non-PASS finder result has an independent
classification and every disagreement has either a separating fact or an
explicit unresolved status.

## Consolidate and promote findings

Keep raw verdict JSON and screenshots together for the lifetime of the campaign.
The consolidated issue comment or report should state the baseline commit,
runtime profile, synthetic identity, goal and batch counts, model and effort,
approximate token cost, evidence count, and independent-verification policy.

Report confirmed bugs, documentation drift, deliberate walls, environment
limits, refuted finder claims, and secondary UX observations separately. A
summary count without the verification trail hides the campaign's most
important quality control.

Propose issues after consolidation. Reproducible fixed behavior should move
into the smallest stable automated seam: engine or store tests for pure rules,
component smoke coverage for thin rendering behavior, and Playwright for
cross-layer user flows. Manual evidence discovers and characterizes the defect;
the promoted test prevents its return.

The campaign is complete when the tracking issue contains the consolidated
report, confirmed findings have reviewed issue drafts or explicit dispositions,
the managed runtime is released, and the location and retention policy for raw
evidence are recorded.

## Extend a catalog

Add goals by user outcome, not by control inventory. A useful goal names the
state the user wants, the user-document oracle, and only the setup or flags that
change how the result must be interpreted. Keep related observations in one
goal when they share one path; split goals when they need different state,
evidence, ownership, or verdicts.

Use stable category-prefixed IDs. New IDs append within their category so old
reports and screenshots remain addressable. Mark these conditions explicitly:

- `D`: destructive; serialize ownership.
- `HW`: requires a Controller or other hardware.
- `N`: requires a narrow viewport.
- `S`: requires special driver or prerequisite setup.
- `X`: probes an expected documented wall.
- `!`: targets a known oddity without assuming the verdict.

Audit the catalog after each campaign. Add gaps that would have exposed a
confirmed finding earlier, retire duplicate paths, and preserve history in the
campaign report rather than letting the active catalog accumulate stale setup.

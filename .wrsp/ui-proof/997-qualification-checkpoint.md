# #997 candidate 1: partial qualification checkpoint

Qualification is blocked. Three UI Show Save attempts failed; no further hardware retry is authorized in this checkpoint. Candidate 1 retains the entity-header rows. Neither full hardware parity nor complete UI proof is claimed.

The coordinator drove the real UI with the temporary port-5180 helper and the Burner bag pb32 Controller (firmware 3.67, 256 pixels). These five images were captured at `fef55e6950a8f7ac5ca8410f57d1bd8e7e3ffda4`, opened and visually inspected before packaging. They show the actual preflight, Run state, shared failure messages and retained header. The signed-in account is visible in the supplied captures. Fresh Pattern-header and gated-Show-reason captures remain pending.

## Hardware results

Pattern WavyBands Run/Save passed in the coordinator's UI exercise. Fresh readback confirms the saved program active and its recovered source hash matching the embedded Pattern stamp. Quadrille Run passed as a transient program; canceling its warning preflight preserved the previous active program.

The three failed Show Saves were:

1. Quadrille's original Save reported `Failed to fetch`; subsequent readback retained transient `pxbG8JurCx35qTWzZ` as active and showed no newly saved Quadrille. The underlying failed fetch remains unidentified.
2. Quadrille's deliberate retry at the repaired code tip wrote changed saved bytes and activated the existing saved id, but the UI reported `Controller target activation failed: Pixelblaze request timed out waiting for "brightness"`.
3. The lightweight `101 Clips, Cuts, and Blank Time` Show ran successfully, then Save reported the same brightness-confirmation failure. Later readback found its saved program active with matching recovered source/stamp hash.

A later successful device read establishes stored/active state at that observation time. It does not erase the operation's failed confirmation or establish successful application completion, dirty-state tracking, or metadata settlement. The 1970 Show stamp reflects the authored stock timestamp and is not a Save-attempt timestamp.

The coordinator collected these primary device readbacks using a brief read-only connection and HTTP PBP recovery; each reports `socketClosed: true`. Only the relevant fields are reproduced here; unrelated device inventory is omitted.

| Source file under `/tmp/pxlblz-997-` | Observed UTC | Active program | Recovered stamp kind / id | Recovered source hash | Matches stamp |
| --- | --- | --- | --- | --- | --- |
| pattern-saved-readback | 2026-09-10T01:07:59.961Z | `pxbHkwaZoggJHbHiF` | `pattern` / `demo:WavyBands` | `eeda537f` | True |
| show-retry-readback | 2026-09-10T01:18:35.935Z | `pxbMSGCvAwtLLDuCG` | `show` / `stock-show-remix-quadrille` | `b66aa7c8` | True |
| basic-show-save-readback | 2026-09-10T01:22:45.768Z | `pxbzhMJSJ8jSvxMkn` | `show` / `stock-show-101-clips-cuts-blank-time` | `1b22d0ad` | True |

The source JSON files are `pattern-saved-readback.json`, `show-retry-readback.json`, and `basic-show-save-readback.json` under the prefix above. Their complete-file SHA-256 digests are:

- `pxlblz-997-pattern-saved-readback.json`: `b3f39f8390bb4ea4b321541f9ebe7914b6a4ed85b6c3a6052e1b48ffc5ebf228`
- `pxlblz-997-show-retry-readback.json`: `af06e1dc65f02558baa1855dabcc31c72a42f46e8a0bde668b317926b4210a65`
- `pxlblz-997-basic-show-save-readback.json`: `582c85d34edd6468a8905fa84d2af526146f0fd933ae80bc3eb64aeb8e05c54a`

## Remaining work and scope boundary

The feedback repair is covered by focused tests: the popover and retained header consume the same artifact-scoped failure and share dismissal. It does not alter Controller transport or confirmation semantics and does not claim to fix the original fetch failure.

Jon approved a separate bounded transport repair; the coordinator assigned its isolated implementation from reviewed main to the other worker. The repair issue link is pending that worker's report. The bounded repair is to reproduce Save activation confirmation on the bench, distinguish delayed/missing brightness response from active-program confirmation, and preserve session binding and truthful outcome/metadata settlement. Start with an observed protocol trace and a regression at that confirmation boundary. Do not tune timeouts or change connection semantics inside #997 without an explicit scope decision.

This #997 checkpoint is paused while the approved transport repair proceeds. The coordinator will rebase #997 onto the reviewed transport repair, then recapture and requalify before final suites, review and landing. No final-suite or review submission is requested for this checkpoint. Candidate 2 row removal waits for candidate 1 parity; no implemented label or closure is warranted.

# Command refusal correction evidence (#1049)

## Final current proof

At `e58ed17174740ded66d5ce65753afcd0a06a90ff`, the installed
`codex-cli 0.153.4` client exercised actual OAuth MCP calls against the live
authenticated editor. The [redacted transcript](codex-final-current-client.json)
records one operation that accepted a Stage-map removal, received an
`isError`/`refused` empty rename, accepted its correction, and committed with an
applied/saved receipt. Reopening the Show proved both accepted edits survived.

The authenticated fixture passed 1/1 in 9.2 seconds (13.7 seconds including
setup). Four inspected captures show the desktop and 390px working refusal
state, the saved operation with the interim issue cleared, and the reopened
Show. The proof record is
`.wrsp/ui-proof/1049-final-current-refusal.json`. A filesystem handshake paused
the real client for interim capture; no delivery acknowledgement or save result
was simulated. This proves installed Codex MCP client interoperability without
claiming model inference or hosted publication.

## Historical evidence

- [Final operation identity proof](server-identity-proof.md) records the same
  workflow at `fa5bacc8f9fca3e9c87e49d66935cda3ab7afc32`, after #1048 introduced
  relay-assigned identity and before the later corrective stack.
- The [original real-client transcript](codex-live-client.json) records the
  workflow at `8caa1a1e28a314e3ed95535782f01a161032cf6c`, explicitly qualified under
  the public identity schema before #1048. Its authenticated acceptance case
  passed in 8.1 seconds (12.6 seconds including setup), and its three images
  remain in `.wrsp/ui-proof/1049-refusal-correction.json`.

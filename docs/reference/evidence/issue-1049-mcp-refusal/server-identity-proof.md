# Final operation identity proof (#1049)

At `fa5bacc8f9fca3e9c87e49d66935cda3ab7afc32`, the actual codex-cli 0.153.4
client read the live Show, began with server-assigned identity, preserved an
accepted Stage-map removal through a refused rename, corrected the rename,
and reached an applied/saved receipt in the same operation. Reopening proved
both changes persisted. The [redacted transcript](codex-server-identity-client.json)
records that interface; the older transcript in this directory retains its
explicit pre-identity qualification.

The authenticated fixture passed 1/1 in 11.1 seconds. The worker and coordinator
inspected all four committed images: desktop and 390px working refusal state,
saved state with the interim issue cleared, and reopened Show. The proof record
is `.wrsp/ui-proof/1049-refusal-correction-server-identity.json`. The fixture
uses its own synthetic account and Show, without model inference or hosted
publication. Required final integration, review and authoritative suites remain
coordinator-owned.

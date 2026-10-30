# Controller Pattern import through an original-source URL

Status: agreed product direction, 2026-10-29; not implemented.
Related work: [#1221](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/1221).

Import retrieves clean Pattern source from a URL recorded in the saved
Controller artifact and creates a personal Pattern in the recipient's account.
A separate Save compiles that source with the recipient's Controller profile
and replaces the existing saved slot. Import itself leaves the Controller
unchanged.

This direction revises #1221's earlier immediate-write-back decision. The
[current import contract](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/blob/7de0cef3/docs/reference/contracts/controller-pattern-import.md)
describes the implementation reverted on 2026-10-30 and retained in history at `7de0cef3`.

## Purpose

Jon is preparing gifts with hand-picked Patterns, enhanced with features such
as brightness control and slow motion. Recipients should be able to connect
their Controller to PXLBLZ-IDE, import its Patterns into their own accounts,
and begin editing. These personal imports remain separate from the public
Gallery and do not require access to the sender's account.

Recipients can learn how Controller profiles and Save work as they experiment.
The import feature does not need to recreate the sender's complete setup or
preserve every enhancement in the editable source.

## Click one: Import original source

The generated artifact header carries a structured URL identifying a
downloadable clean Pattern. The importer reads that header, retrieves the
referenced source, and saves an ordinary editable personal Pattern with its
attribution and source URL.

The Controller keeps its existing saved Pattern and continues playing as before.
Import does not compile for the Controller, activate another Pattern, delete a
saved slot, or write a replacement. The imported Pattern retains an association
with the original slot for a later explicit Save.

Once imported, the account owns a durable copy of the retrieved source. Editing
and subsequent Saves use that copy and do not depend on fetching the URL again.

## Source provenance and availability

Some existing Patterns contain attribution links in comments. The current
generated header has no structured original-source URL understood by the
importer. Adding that field makes the source reference explicit and preserves
a useful connection to the author.

The download URL must identify clean Pixelblaze source or a supported Pattern
artifact containing it. An attribution page, such as a page crediting an
inspirational shader, is not necessarily a usable download. Initial support
should cover the actual source hosts used for the gifts; a general webpage
extractor is outside this direction.

Gift preparation records a hash of the clean source alongside its URL. Prefer
an immutable version URL where the source host offers one. The hash distinguishes
the source used for the gift from a later revision served at the same address.
It does not establish authorship or permission.

A missing, unavailable, unsupported, or changed source must produce a concrete
explanation. The importer must not silently substitute different source or
claim that the original was recovered. Exact handling of those outcomes and
older artifacts without a source URL remains implementation design work.

This approach carries a reference rather than a second copy of the original
source in the Controller artifact. Its tradeoff is dependence on the referenced
source remaining available until import succeeds.

## Click two: Save to Controller

Save compiles the account's clean source with the recipient's current Controller
profile and overwrites the original saved slot. It builds a complete replacement;
it does not edit or reverse the old wrapping code.

Do not delete the original Pattern first. The existing Save path already supports
overwriting a saved slot. Deletion would add a hardware operation and leave the
gift missing a Pattern if replacement failed.

The first Save uses the recipient's settings. The sender's added slow motion or
brightness-knob behavior may therefore change or disappear unless the recipient
configures the corresponding behavior. Import must not promise to transfer that
setup automatically.

## Keep Patterns up to date

The existing toggle says: **Keep PXLBLZ Patterns up to date when Controller
settings change**. It rebuilds managed saved Patterns from source in the account;
it does not fetch upstream author updates or reconstruct missing hardware setup.

Import gives the recipient editable source. The first successful Save makes
that Controller copy managed and eligible for the existing update mechanism.
Import alone must not trigger a replacement, even when the toggle is already
enabled. Remembering the target slot does not establish that this account has
successfully delivered a managed copy.

## Engineering boundary

This direction removes source unwrapping and immediate hardware replacement
from the normal URL-backed import flow. It does not resolve the separate
Controller Save reliability problem: click two still uses the Save transport,
which must be qualified independently.

The structured header format, supported download hosts and formats, retrieval
mechanism, and handling of unavailable or changed sources need bounded design
before implementation. This document records the agreed product direction,
not completion of #1221 or authorization to publish the current implementation.

## Current implementation references

- [Artifact header](../../src/engine/artifactStamp.ts): current metadata and stamping.
- [Import assessment](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/blob/7de0cef3/src/engine/controllerPatternImport.ts): current clean-source and wrapped-source policies.
- [Controller Save](../../src/engine/pushPattern.ts): existing overwrite-in-place delivery.
- [Managed updates](../../src/engine/controllerReconciliation.ts): eligibility based on bindings, source policy and push records.

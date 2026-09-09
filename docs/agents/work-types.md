# Work types and feature grouping

PXLBLZ-IDE adopts WRSP #48/#50 through [#991](https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/issues/991).
The reviewed source is commit `5d63864c62c2f4b2dd3710fda2424909ac801197`:
[catalog version 1](https://github.com/jon-whiteroomsoftware/whiteroom-software-process/blob/5d63864c62c2f4b2dd3710fda2424909ac801197/src/work-types.ts),
[contract](https://github.com/jon-whiteroomsoftware/whiteroom-software-process/blob/5d63864c62c2f4b2dd3710fda2424909ac801197/docs/reference/contracts/work-types.md),
and [creation/grouping guide](https://github.com/jon-whiteroomsoftware/whiteroom-software-process/blob/5d63864c62c2f4b2dd3710fda2424909ac801197/docs/reference/work-types.md).
This adopts guidance and GitHub templates; the vendored package stays unchanged.

## Choose the work item's purpose

| Label | Color | Use for |
| --- | --- | --- |
| `work:product-definition` | `8250DF` | PRDs, requirements, feature definition, technical planning |
| `work:ux-design` | `BF3989` | Interaction/visual design and prototypes, including committed HTML |
| `work:documentation` | `0969DA` | Reference docs, operating guides, explanations of existing behavior |
| `work:implementation` | `1A7F37` | Building a feature, including its accompanying tests and docs |
| `work:repair` | `BC4C00` | Corrective work linked to its bug or finding |

Select exactly one purpose label on each work item. Keep generic, area, triage,
and Wayfinder labels. File extension does not determine purpose: a committed
HTML prototype is UX work, while incidental docs/tests stay with their feature.
Review activity remains review even when it discusses UX; machine work remains
separate. Missing or conflicting types remain unknown and diagnostic, not a new
execution or publication gate. Do not bulk relabel history.

## Find the feature and the actual work

Before starting feature work, search this repository's open and closed issues
for the feature name, aliases, and PRDs; read plausible scopes, status, claims,
and parent/child links. Reuse a suitable epic or PRD issue. A similar title is
not enough: surface ambiguity instead of guessing, reopening a closed issue,
or taking another agent's claim. Create an epic only when the feature lacks one
and issue creation is authorized.

For each real phase (definition, UX, docs, implementation, repair), find and
reuse a suitable typed child; create only the missing scoped work. Do not
invent a five-child checklist. A PRD can itself be the epic, while the task
writing it belongs to a definition child. Sessions, commits, and evidence name
the actual work item. The epic groups scope; it is not a duplicate execution
or spend record and needs no new work-type label. Shared maintenance and
cross-feature work may stay standalone when no single feature parent fits.

Use native GitHub sub-issues. Inspect the proposed child's current parent and
the epic's children first. An existing different parent is a conflict to
resolve explicitly, not permission to reparent. The pinned source guide gives
`gh api` commands: creation uses the child's **database ID**, not its issue
number, and verification reads both the child's parent and the parent's child
list. Do not routinely use `replace_parent`. See GitHub's
[official sub-issue API](https://docs.github.com/en/rest/issues/sub-issues).
If native grouping is confirmed unavailable, put reciprocal parent/child links
in both bodies and record the actual fallback reason. A lone 404 does not
prove unavailability; permission/security denials stop the affected action.
Preserve existing Wayfinder map relationships under [issue-tracker.md](issue-tracker.md).

## Human and agent entry points

In GitHub's New issue chooser, use **Work item** after discovery. Open Labels
in the right sidebar and select one `work:` label by its description before
submitting. If you cannot apply labels, request maintainer help; body text is
not a substitute for the label. Use **Feature epic** only for a missing feature
grouping record, then attach the actual typed children.

Agents load the installed canonical `~/.agents/skills/issue-workflow/SKILL.md`,
`~/.agents/skills/to-prd/SKILL.md`, and `~/.agents/skills/to-issues/SKILL.md`, plus
`~/.agents/AGENTS.md`. Do not create divergent repository copies. Follow the
local [tracker](issue-tracker.md) for claims, progress, proof, and closure.
For a missing UX child, for example:

```sh
gh issue create --repo jon-whiteroomsoftware/PXLBLZ-IDE \
  --title 'Design the scoped feature interaction' --body-file /tmp/issue.md \
  --label work:ux-design
```

Start a fresh bounded session when switching purpose where practical. Mixed
or untyped sessions remain unknown; this adoption creates no token allocation
or attribution inference. For a justified correction, record the old/new type,
reason, supported `effectiveAt` UTC time, and actual observation `capturedAt`.
Do not rewrite capture history or treat capture time as when the work changed.

## Setup and observed adoption evidence

Label setup uses the reviewed **WRSP source checkout**, not the consumer's
vendored 0.9.0 package. From that checkout at the pinned commit:

```sh
node bin/work-types.mjs plan jon-whiteroomsoftware/PXLBLZ-IDE
node bin/work-types.mjs apply jon-whiteroomsoftware/PXLBLZ-IDE
node bin/work-types.mjs check jon-whiteroomsoftware/PXLBLZ-IDE
```

On 2026-09-08 the coordinator observed 37 existing labels preserved with exact
names, colors, and descriptions; setup added the five catalog labels, and
check returned empty changes and conflicts. Issue #991 retained `in-progress`
and acquired `work:implementation`. Chrome inspection of its label picker
showed all five options with the catalog colors. Canonical shared instructions/skills were
installed from reviewed WRSP #50 and byte-verified before this adoption.
Source templates were verified on GitHub; consumer template publication and
visible chooser proof belong to the #991 delivery record.

Editorial scenarios checked for this adoption: existing PRD reuse avoids a
second epic; HTML prototype chooses UX; incidental tests stay implementation;
corrective work links its cause; conflicting parents require explicit
resolution; confirmed unsupported grouping records reciprocal fallback;
shared maintenance does not invent a feature. These are guidance checks, not
claims of runtime enforcement or automated browser proof.

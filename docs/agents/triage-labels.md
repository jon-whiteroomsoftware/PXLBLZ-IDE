# Triage Labels

The skills speak in terms of canonical triage and coordination roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `in-progress`              | `in-progress`        | Claimed for active implementation        |
| `ready-for-review`         | `📦 implemented`     | Identified commits claim the issue's full implementation scope; not review, landing, release, or closure (#940) |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill or agent-process instruction mentions a role (e.g. "apply the AFK-ready triage label" or "mark the issue in progress"), use the corresponding label string from this table.

`📦 implemented` is the only label Jon approved for the "implemented" role; the
legacy `ready-for-review` label is retired and should be removed when
`📦 implemented` is applied. See `docs/agents/issue-tracker.md` for who
applies and removes it.

Edit the right-hand column to match whatever vocabulary you actually use.

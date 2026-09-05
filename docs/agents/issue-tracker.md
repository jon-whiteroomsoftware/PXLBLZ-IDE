# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close after landing**: `gh issue close <number> --comment "..."`. A candidate
  commit is progress, not completion on any branch. The post-commit updater
  records progress but never treats a branch name as proof of review. The
  coordinator closes the issue explicitly after its reviewed commit is
  reachable from local `main`.

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Implemented label and proof lines (#940)

`📦 implemented` means identified commits claim to satisfy the issue's whole
implementation scope. It is applied by the landing coordinator under the
`issue-workflow` skill once the issue body names those commits; it does not
mean reviewed, landed, released, or accepted, and it grants no closure
authority. Remove it on closure or when further implementation is required,
and restore it after replacement commits. It replaces `ready-for-review`.

The post-commit updater (`.husky/scripts/update-issues.sh`) is comment-only.
When a model judges that a commit "closes" an issue, the hook posts a comment
stating that the commit claims implementation of the issue's scope and that
the coordinator applies `📦 implemented` after inspecting the named commits.
One commit cannot infer completion of a whole issue, so the hook never
applies the label and never closes.

The classifier behind that judgement is an ordinary automated launch: `codex
exec` naming `gpt-5.6-sol` at `high` reasoning effort explicitly, with the
prompt on stdin and the decision returned through a structured output file
constrained to `close`, `comment`, or `nothing`. It never inherits a session's
interactive model. The exit status decides first: when `codex` is missing,
exits nonzero, or exits successfully without a decision, the hook skips that
issue and the commit still succeeds. A decision file written before a nonzero
exit is discarded, so a failed call never comments. `scripts/update-issues.test.ts`
stubs the CLI and asserts the launch pair, the stdout boundary, the resulting
`gh` calls, and that a failure after a written decision mutates nothing.

`npm run check:issue-proof -- --since-days <n>` audits recently closed issues
for a non-empty `## Required proof` section and an attached proof. Attach
proof as a line beginning `Proof:` followed by the evidence (a link, a
command transcript reference, or a concrete result) in the body or a comment
before closing. The checker verifies presence, not sufficiency; it is a
report, not a gate, and history is not mass-edited to satisfy it.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as
decision tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes,
  Decisions-so-far, and Fog sections. Create it with
  `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api`
  on the sub-issues endpoint). Where sub-issues are unavailable, add the child
  to a task list in the map body and put `Part of #<map>` at the top of the
  child body. Apply one `wayfinder:<type>` label: `research`, `prototype`,
  `grilling`, or `task`. Once claimed, assign the ticket to the driving dev.
- **Blocking**: use GitHub's native issue dependencies so blockers are visible
  in the UI. Add an edge with
  `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`,
  where `<blocker-db-id>` is the blocker's numeric database ID from
  `gh api repos/<owner>/<repo>/issues/<n> --jq .id`, not the issue number or
  `node_id`. GitHub reports open blockers in
  `issue_dependencies_summary.blocked_by`. Where dependencies are unavailable,
  fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body.
- **Frontier query**: list the map's open children, drop any with an open
  blocker or an assignee, and take the first remaining child in map order.
- **Claim**: `gh issue edit <n> --add-assignee @me` is the session's first
  write.
- **Resolve**: comment with the answer, close the decision ticket, then append
  a context pointer (gist and link) to the map's Decisions-so-far section.

Wayfinder tickets resolve planning decisions, so they close when the decision
is recorded. Implementation issues continue to close only after their reviewed
commit is reachable from local `main`, as specified above.

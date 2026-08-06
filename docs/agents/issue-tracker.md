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

# Layout and panel prototypes: which file belongs to which issue

Self-contained HTML mock-ups and prototypes under `docs/plans/`, each openable
directly in a browser with no server. All are on branch `codex/issue-959-design`
(unlanded) and mirrored as gists on their issues. From any worktree of this
repository, read one with `git show codex/issue-959-design:docs/plans/<file>`.

| File | Issues | What it shows |
| --- | --- | --- |
| `top-bar-area-control-mockup.html` | #965 | The place control in the top bar (accepted design, sections 01–03), the Film icon for Shows (section 05). Shipped. |
| `entity-list-drawer-prototype.html` | #966 (shipped), #976 | The drawer's three states and rules (sections 01–02, shipped); the list header without its title, pin only (section 03, #976). |
| `show-over-under-layout-prototype.html` | #967 (implemented), #968, #977 | Timeline over, one divider, aspect-true preview (#967); the strip's preview rail and Stage/Preview/Zones/Source header-is-summary sections with Source absorbing the footer (#968, section 01); the "default (fits the lanes)" first-open height (#977). |
| `preview-panel-summaries-prototype.html` | #968 | The Pattern preview column and the Controller popover as header-is-summary sections: names, tiers, promoted brightness, one-row readouts, label-left rows, minimum widths (sections 01–03). |
| `shared-show-editing-prototype.html` | #959 | The shared manual / built-in / external agent editing walkthroughs S1–S21 (behaviour; its panel placement is superseded by the layout sequence). |

Design documents alongside them: `shared-show-editing-ux-design.md` and
`issue-959-shared-editing-ux-proposal.md` (#959), and the Astra review in
`issue-959-astra-review-v1.md`.

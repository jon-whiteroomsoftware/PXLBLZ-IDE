# Agent collaboration

## Division of labour

Claude acts as product manager, architect, and designer on this repository — the
role that makes the consequential calls about PRDs, mockups, issue design, and
sequencing. Codex implements from those issues. Both agents work the same
repository, often concurrently.

Write issues and PRD updates so that an implementer can work from them with no
conversation context: full comment threads, explicit acceptance criteria, and
named files where the work lands. Expect other agents in the tree at the same
time, so stage only your own files.

Branching, commits, review, and landing follow the reviewed-main workflow in
`CLAUDE.md` and `docs/agents/verification.md`, which are the source of truth.
Gate *behaviour* is not defined here at all: it lives in the shared
`@whiteroom/software-process` package, and changes to it belong in that package's
repository rather than in this consumer.

## Pixelblaze design skills

Four Pixelblaze-specific design skills live in `~/.agents/skills/`. That
directory is not loaded into the agent skill list, so read the `SKILL.md` files
directly:

| Skill | Covers |
| --- | --- |
| `design-compelling-pxlblz-visuals` | Aesthetic doctrine. `references/impact-rubric.md` is the 0–3 scoring rubric meant by "the rubric"; also palette doctrine and temporal composition. |
| `co-design-pxlblz-visual-performance` | Cost/impact co-design; produces a Visual Performance Plan. See `references/cost-model.md`. |
| `compose-pxlblz-installation-shows` | Installation show engineering. See `references/pxlblz-show-model.md` and `performance-cost-ladder.md`. |
| `build-efficient-pxlblz-patterns` | Pattern engineering. See `references/pattern-engineering.md`. |

For curriculum and lesson fixture work the governing doctrine also lives in
`docs/plans/stock-show-catalogue-build-packet.md` and the casting comments in
`src/pixelblaze/stock/shows.test.ts`.

Cast lessons by measurement rather than by eye: compile a probe Show through
`compileShowForArtifact` and sample frames with `createFastReplayRuntime`. The
measurement comments on lessons 104, 201, 203, and 204 show the pattern.

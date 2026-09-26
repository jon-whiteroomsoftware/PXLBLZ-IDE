# #1137 Black Sun Installation: Stage proof

Captured 2026-09-25 from commit `ca022264` on registry runtime `1137:5179`
(`npm run dev:issue -- --issue 1137 --profile shared`). It served this worktree
at that commit with a clean tree, against main's shared API and local D1. The
commit was rebased unchanged onto `4e217609` as `1d144a83`; the rebase added
only #1136's evidence docs. Repo Playwright (Chromium) opened
`/studio/shows/stock-show-installation-black-sun?capture` at 1600 × 1000,
signed in with `npm run dev:session -- --issue 1137` in its own browser
context. No page error was raised.

## Stage frames

The Show's Stage preview recorded all 64 s through
`window.__pxlblzShow.captureSequence` at 30 fps from t = 0: 1,920 frames,
496 × 496, frame K at exactly K / 30 s. `npm run render -- --show` could not
be used: since the #967 over-under workspace the Show route has no
`preview-pane`, so the script never finds the stage.

| File | Time (frame) | Dome | Halo |
|---|---|---|---|
| `black-sun-4s.png` | 4 s (120) | Dark | Violet comet |
| `black-sun-10s.png` | 10 s (300) | Violet rings around a black centre | Violet comet |
| `black-sun-28s.png` | 28 s (840) | Only the violet photon ring | Dark |
| `black-sun-38s.png` | 38 s (1140) | Cyan spiral around a black hole | Violet counter-comet |
| `black-sun-44s.png` | 44 s (1320) | Cyan spiral around a black hole | Violet counter-comet |
| `black-sun-53s.png` | 53 s (1590) | Cyan spiral; hole at full size before the first step | Violet counter-comet |
| `black-sun-57s.png` | 57 s (1710) | Cyan spiral; hole smaller after two steps | Violet counter-comet |
| `black-sun-60s.png` | 60 s (1800) | Cyan spiral; hole closed | Violet counter-comet |
| `black-sun-62.1s.png` | 62.1 s (1863) | White | White |
| `black-sun-63s.png` | 63 s (1890) | Black | Black |

The 1,920 frames were assembled into a 64.0 s, 30 fps H.264 video for
normal-speed playback review. It is not committed.

## Studio editor and ledger

`black-sun-show-editor-studio.png` is the same route with the IDE chrome
shown: the Show under Built-in Shows › Installations (4 Shows), its timeline
with the six chapter Markers and four iris tracks (viewport x, y, width,
height), Zones 490/490 assigned on Eclipse Dome, and the Stage row reading
Eclipse dome · Output map · 490 px. The editor shows Source Code 48.0 KB /
66.8 KB and VM 1,530/10,240.

The compiled artifact's `summary.resources`:

| Resource | Used | Budget |
|---|---|---|
| Artifact bytes | 47,356 B | 68,384 B (21,028 B left) |
| Persistent globals | 200 | 256 (56 left) |
| VM words | 1,530 | 10,240 |

Persistent globals have the closest margin. There are no blockers.

## Reopen

`src/engine/blackSunShow.test.ts` reopens the exported `.pxlshow` unchanged.
Its frame predicates replay the delivered source parsed back out of the
exported `.epe`.

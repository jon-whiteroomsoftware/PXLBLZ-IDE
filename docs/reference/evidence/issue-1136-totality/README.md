# #1136 Totality Installation: Stage proof

Captured 2026-09-25 from commit `e397fbd5` on the registry runtime `1136:5178`,
which served the #1136 worktree at that commit with a clean tree, against
main's shared API and local D1. Repo Playwright (Chromium) opened
`/studio/shows/stock-show-installation-totality?capture` at 1600 × 1000,
signed in with `npm run dev:session -- --issue 1136` in its own browser
context. No page error was raised.

## Stage frames

The Show's own Stage preview recorded all 72 s through
`window.__pxlblzShow.captureSequence` at 30 fps from t = 0: 2,160 frames,
480 × 480, frame K at exactly K / 30 s. `npm run render -- --show` could not
be used: since the #967 over-under workspace the Show route has no
`preview-pane`, so the script never finds the stage. The capture hook, the
deterministic stepping and the frame sink are the ones that script drives;
only the chrome-hiding and the stage selector (`show-stage-canvas-frame`)
differ, which leaves the stage at its 480 px workspace size.

| File | Time (frame) | Dome | Halo |
|---|---|---|---|
| `totality-6s.png` | 6 s (180) | Full boiling gold sun | Dark |
| `totality-20s.png` | 20 s (600) | Gibbous sun | Dark |
| `totality-30s.png` | 30 s (900) | Thin gold crescent on the left | Dark |
| `totality-31.9s.png` | 31.9 s (957) | White bead at the left rim | White ring |
| `totality-34s.png` | 34 s (1020) | Red prominences at the rim, interior black | Cool-white corona |
| `totality-42s.png` | 42 s (1260) | Red prominences at the rim, interior black | Cool-white corona |
| `totality-48.3s.png` | 48.3 s (1449) | White bead on the right | White ring |
| `totality-49.5s.png` | 49.5 s (1485) | Gold crescent on the right | Dark |
| `totality-60s.png` | 60 s (1800) | Sun returning | Dark |

The 2,160 frames were assembled into a 72.0 s, 30 fps H.264 video for
normal-speed playback review. It is not committed.

## Studio editor and ledger

`totality-show-editor-studio.png` is the same route with the IDE chrome
shown: the Show under Built-in Shows › Installations, its timeline with the
six chapter Markers, Zones 490/490 assigned on Eclipse Dome, and the Stage
row reading Eclipse dome · Output map · 490 px.

The compiled artifact's `summary.resources` at `e397fbd5`:

| Resource | Used | Budget |
|---|---|---|
| Artifact bytes | 54,407 B | 68,384 B (13,977 B left) |
| Persistent globals | 73 | 256 |
| VM words | 1,538 | 10,240 |

The VM words are three 490-pixel render-target planes (1,482 words) plus 56
words of compiler schedule cache. There are no blockers.

## Reopen

`src/engine/totalityShow.test.ts` reopens the exported `.pxlshow` and checks
that the Show survives unchanged. Its frame predicates replay the delivered
source parsed back out of the exported `.epe`.

# Existing checkpoint snapshot defect

The held-presentation adapter does not repair or qualify snapshot restore.
Sequential replay and fresh cold EPE reopening pass independently. Calling
`snapshot()` on the admitted fixtures below throws before any restoration.

## Minimal reproduction

Append this diagnostic to `src/engine/showHeldAppearancePreparationV2.test.ts`,
whose fixture and `delivered` helpers reopen the native record, prepare, compile,
export/reopen the actual EPE and create the runtime. Run that single diagnostic
with Vitest. It deliberately fails on the existing checkpoint defect:

```ts
it('checkpoint diagnostic', () => {
  for (const record of [expectedRuns(fixture()), compatibilityFixture('freeze')]) {
    for (const fidelity of ['fast', 'fidelity'] as const) {
      expect(() => delivered(record, fidelity).snapshot()).not.toThrow()
    }
  }
})
```

Both records prepare successfully. The source exports a private `elapsed`
accumulator updated by `beforeRender(delta)` and renders
`rgb(x, elapsed / 2000, y / 2)`. The independent record has three adjacent
0–400, 400–800 and 800–1000 ms Clips sharing one runtime, with Restart only at
the first entry. The uniform record uses formerly admitted equal held
presentation across Layout boundaries. Its recipe, source and EPE match the
committed original `f3db7122` adapter digests exactly.

## Direct observations

| Admitted record | Fast snapshot | Precise snapshot |
| --- | --- | --- |
| New divergent presentation runs | `ReferenceError: __pxlblz_as is not defined` | Same error |
| Independently authored adjacent Clips | `ReferenceError: __pxlblz_as is not defined` | Same error |
| Uniform, byte-identical original adapter output | `ReferenceError: __pxlblz_bG is not defined` | Same error |

Compacted private names differ between fixture shapes; an earlier Clip-property
shape reported `__pxlblz_ak`. The failing product seam is
`fastReplay.ts`'s `snapshot()` calling `handle.getRuntimeState()`, emitted by
`loadPattern.ts`'s `buildEpilogue`. That getter directly reads a metadata-declared
binding unavailable in the loaded source. This evidence attributes the failure
to checkpoint capture on existing admitted artifacts, rather than newly created
presentation-run identities. It does not diagnose or change the compiler's
binding provenance. Checkpoint snapshot/restore remains unresolved integration
work before complete native authoring adoption.

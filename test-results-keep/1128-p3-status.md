# #1128 P3 runtime frame comparison

Node: `v24.14.0` via `fnm exec --using=24`.

## Before the fix

Command: `wrsp-log fnm exec --using=24 npx vitest run src/engine/showV2Baselines.test.ts -t names`

```
FAIL  |node| src/engine/showV2Baselines.test.ts > #1042 v2 baselines > names the first changed sample and pixel value
Expected: "stock:sample runtime frame at 250 ms, value 1: committed 4, now 4.25 (|Δ| 0.25)"
Received: "stock:sample runtime frame at 0 ms, value 0: committed 0, now 0 (|Δ| 0)"
Test Files  1 failed (1)
Tests       1 failed | 28 skipped (29)
EXIT:1
```

## After the fix

All commands ran with Node `v24.14.0`.

| Command | Result |
| --- | --- |
| `wrsp-log fnm exec --using=24 npm run build` | `EXIT:0` |
| `wrsp-log fnm exec --using=24 npx vitest run src/engine/showV2Baselines.test.ts` | 1 test file passed, 29 tests passed; `EXIT:0` |
| `wrsp-log fnm exec --using=24 npx tsc -b --pretty false` | `EXIT:0` |
| `wrsp-log fnm exec --using=24 npm run lint` | `EXIT:0` |

# Device-compiler codegen facts (#906)

Static word counts from the Controller's own compiler run headless
(cache under test/perf-harness/.compiler-cache/; regenerate with
`ISSUE906_FACTS=1 ISSUE906_REFRESH=1 PIXELBLAZE_IP=<ip> npx vitest run test/perf-harness/issue906.oracle.test.ts`).
Word counts are for the whole `beforeRender` body including prologue and
return; compare rows, not absolutes. ~0.35 us/word on the pb32.

| beforeRender body | words |
|---|---:|
| `empty body` | 37 |
| `a = b` | 40 |
| `a = b && c` | 43 |
| `a = b & c` | 42 |
| `a = b || c` | 43 |
| `a = k ? b : c` | 44 |
| `if/else assign` | 46 |
| `arithmetic select` | 48 |
| `for loop, one-statement body` | 55 |
| `unrolled x4 equivalent` | 57 |
| `local read (var l = b; a = l)` | 43 |
| `global read twice (a = b; c = b)` | 43 |

Opcode histogram for `&&`: {"0x17":10,"0x29":12,"0x01":1,"0x09":2,"0x0b":2,"0x1d":1,"0x05":2,"0x7d":1}
Opcode histogram for `&`: {"0x17":10,"0x29":11,"0x01":1,"0x09":2,"0x0b":2,"0x3f":1,"0x05":2,"0x7d":1}

The dynamic short-circuit verdict (side-effect probe on hardware) is
recorded in issue906-shortcircuit.json and on #906.

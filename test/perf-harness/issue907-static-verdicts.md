# Emission idiom static verdicts (#907)

Whole-pattern word counts from the device compiler via the #906 oracle;
deltas are candidate-minus-current (~0.35 us/word). Static verdicts
nominate hardware probes; they do not replace them.

| family | exactness | before | after | delta words | est us | static winner |
|---|---|---:|---:|---:|---:|---|
| `statement-fusion` | exact | 45 | 42 | -3 | -1.05 | after |
| `frac-hue-wrap` | exact-given-nonnegative-input | 43 | 41 | -2 | -0.70 | after |
| `effect-endpoint-branch` | exact-per-frame-flag | 53 | 57 | 4 | 1.40 | before |
| `hsv-dead-lane` | exact | 64 | 58 | -6 | -2.10 | after |
| `literal-vs-global` | exact | 42 | 42 | 0 | 0.00 | tie |

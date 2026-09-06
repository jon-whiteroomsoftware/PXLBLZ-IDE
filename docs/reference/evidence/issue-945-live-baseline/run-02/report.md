# Dictation experiment report — gpt-5.6-luna (high)

First-try success: **42/43** (97.7%). Tool calls: 46; transactions: 34. Asked when it should: 5/5; refused when it should: 3/3.

## By operation family

| Family | Cases | First-try | % |
| --- | --- | --- | --- |
| animation | 7 | 7 | 100% |
| clips | 19 | 19 | 100% |
| effects | 3 | 2 | 66.7% |
| junctions | 3 | 3 | 100% |
| layer-transitions | 3 | 3 | 100% |
| structure | 3 | 3 | 100% |
| timeline | 5 | 5 | 100% |

## By referent source

| Referent | Cases | First-try | % |
| --- | --- | --- | --- |
| direct | 8 | 8 | 100% |
| hover | 5 | 5 | 100% |
| none | 6 | 6 | 100% |
| ordinal | 10 | 9 | 90% |
| pattern-name | 7 | 7 | 100% |
| selection | 1 | 1 | 100% |
| time | 6 | 6 | 100% |

## Latency and cost

Over 43 timed cases: **1.35 model calls per case** (max 4), 5 s per case (max 13 s), 3.7 s per model call.

| Measure | Value |
| --- | --- |
| Input tokens per model call | 16776 |
| Cache ratio (cached / input) | 91% |
| Input tokens, run total | 973014 (883075 cached) |
| Output tokens, run total | 7822 (4728 reasoning) |
| Rate-limit waits | 0 s |
| Rate tier (response headers) | 500 requests/min, 500000 tokens/min |
| Run cost | $0.04 |

## Generic-operation use (the gap signal)

None.

## Failures

- effects-add-vignette (effects/ordinal): outcome ask, expected edit; clip placement-c1-s1 has no vignette Effect

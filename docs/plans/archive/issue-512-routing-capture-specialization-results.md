# Issue 512 routing and capture specialization results

The exact compiler pass materially improves the 2,000-pixel Redline outer-limit
fixture while preserving every sampled Fast and Precise frame. The pb32
measurement improved mean FPS by 24.2% and the harness restored its original
active Pattern and 256-pixel configuration after the run.

## Reproduce

```bash
npm run issue512
PIXELBLAZE_IP=192.168.8.224 npm run issue512:hardware
```

The hardware command compiles both generated artifacts with the Controller's
embedded compiler. It records the original active Pattern and pixel count,
temporarily selects 2,000 pixels, runs the counterfactual before the selected
artifact, and restores both original values in `finally`. It refuses to run if
the Controller does not report a reversible active Pattern id.

## Exactness matrix

Fixture: `stock-show-showcase-redline-installation`, 2,000 pixels. Score samples
were taken at 0, 7.5, 15, 22.5, 30, 37.5, 45, 52.5, and 59.5 seconds.

| Numeric mode | Selected checksums match unspecialized counterfactual |
| --- | --- |
| Fast | Yes, all 9 score times |
| Precise 16.16 | Yes, all 9 score times |

The selected routing plan lowers five complete disjoint ranges from a maximum
10 bound comparisons per pixel to 4, avoiding 6. Redline's mapped member keeps
its affine sample path but removes three identity brightness multiplies and a
proved-redundant three-channel clear. The compiler-generated empty routed member
uses the full identity capture path.

## pb32 hardware matrix

Controller: pb32, firmware 3.67. Original configuration: 256 pixels. Measured
configuration: 2,000 pixels. Each artifact settled for 2 seconds and contributed
24 FPS samples over 6 seconds.

| Artifact | Source bytes | Controller bytecode | Ledger VM words | Mean FPS | Min FPS | Max FPS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Unspecialized counterfactual | 19,620 | 11,954 | 6,096 | 2.358 | 2.203 | 2.412 |
| Exact specialization selected | 18,781 | 11,430 | 6,096 | 2.928 | 2.540 | 3.072 |

Mean FPS increased 24.19%. Delivered source fell 839 bytes and Controller
bytecode fell 524 bytes. Ledger VM words are unchanged because this pass removes
computation and code rather than allocating a cache.

## Epic ledger line

```text
02 #512 routing and capture specialization · 2.358 -> 2.928 FPS · incremental +24.2% · cumulative +24.2%
```

The cumulative ledger begins in the parent technical design and is extended by
each later implementation slice.

## IDE compile cost

The output proof reuses the compiler's existing Acorn module AST for top-level
binding discovery, collision-safe rewriting, and renderer-output analysis. A
bounded 256-source cache serves standalone proof callers. In a one-worker cold
compile of the complete stock Show library, exact specialization took 2.005 s
and the explicit unspecialized counterfactual took 1.990 s. The proof therefore
adds about 15 ms across the library while avoiding a third parse of every bundled
Pattern source.

## Emulator counterfactual

The in-repo runtime is the deterministic correctness authority, not the native
performance authority. On the recorded run, selected Redline averaged 0.337 ms
per Fast frame and 2.300 ms per Precise frame; the counterfactual averaged
0.341 ms and 2.369 ms. The much larger Controller gain reinforces the requirement
to retain hardware measurements for branch and wrapper optimizations.

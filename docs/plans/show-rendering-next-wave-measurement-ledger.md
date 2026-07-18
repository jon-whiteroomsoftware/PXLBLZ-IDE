# Show rendering next-wave measurement ledger

This ledger begins after the closed #511 render-target epic. Each line records
whether its result is measured, counted, estimated, or authored; Controller FPS
remains authoritative for production performance decisions.

```text
00 #532 native Show operation costs - measured on Burner bag pb32, firmware 3.67, native 256-pixel output, 2,593 iterations and 5 stabilized samples: scalar local/global read exchange 0.000-0.005 us and global-vs-local write -0.002 us (noise); array read 1.309 us, array write 2.722 us; user calls 1.899-3.449 us for 0-3 args; global branch 1.500 us; generated HSV beyond RGB capture 35.308 us; shift/mask 0.797-0.799 us. Counted replay thresholds: one-plane 4.031 us/pixel at one replay -> 1.309 us long-lived; three-plane RGB 12.093 -> 3.927 us. Estimated #528 attribution: two reads plus one branch explain about 36% of the observed 11.5 us/pixel loss, so access cost alone is insufficient; no production default changed.
01 #531 Show frame-time attribution - measured on the same pb32 at 2,000 pixels with 2,000 ms post-activation settle and 16 samples/artifact: physical output floor 60.353 ms/frame. Redline median 336.476 ms = 60.353 output + 142.547 unresolved Show overhead + 133.576 authored Pattern work. Five-Pattern acceptance median 589.000 ms = 60.353 + 348.980 Show overhead + 179.667 Pattern work. Exact output-reuse boundary isolates 48.447 ms routing/scheduler + 8.867 ms capture wrappers + 102.533 ms Pattern work; #518 removes 105.311 ms. #519 removes 143.750 ms from scalar-field production inside a 387.647 ms Show-overhead budget. #527 removes 134.367 ms from coverage-directed composition. The #528 coordinate candidate is phase-dependent: this 2-6 s window measured +0.857 ms median / -6.786 ms mean versus direct and does not reproduce the prior two full-window -6.43% median passes; no production default changed.
```

# Show rendering next-wave measurement ledger

This ledger begins after the closed #511 render-target epic. Each line records
whether its result is measured, counted, estimated, or authored; Controller FPS
remains authoritative for production performance decisions.

```text
00 #532 native Show operation costs - measured on Burner bag pb32, firmware 3.67, native 256-pixel output, 2,593 iterations and 5 stabilized samples: scalar local/global read exchange 0.000-0.005 us and global-vs-local write -0.002 us (noise); array read 1.309 us, array write 2.722 us; user calls 1.899-3.449 us for 0-3 args; global branch 1.500 us; generated HSV beyond RGB capture 35.308 us; shift/mask 0.797-0.799 us. Counted replay thresholds: one-plane 4.031 us/pixel at one replay -> 1.309 us long-lived; three-plane RGB 12.093 -> 3.927 us. Estimated #528 attribution: two reads plus one branch explain about 36% of the observed 11.5 us/pixel loss, so access cost alone is insufficient; no production default changed.
```

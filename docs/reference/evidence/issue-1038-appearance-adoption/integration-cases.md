# Measured native appearance integration cases

The actual prepared-adoption Effect matrix compares imported native EPE output
and exports exactly against independently authored complete held-key records in
Fast and Precise. No numeric tolerance is used. Other-user frame comparisons
cover the held Group at 20000/23000/24999ms while the edited ordinary Clip is
inactive; 30001ms is excluded because the Show wraps and that Clip is active.

Adding saturation or contrast introduces a shared color stage even though the
Group has neither Effect. Its emitted placement explicitly sets the factor to 1;
the selected placement sets 1.4/1.3. The final emitted neutral formulas are:

```js
luma = .2126*r + .7152*g + .0722*b
b = clamp(luma + (b-luma)*factor, 0, 1) // saturation
b = clamp((b-.5)*factor+.5, 0, 1)      // contrast
```

Since the exact Show clock (#1204), the Fast blue channel at Group entry
(20,000 ms) is exactly 0 before and after adding either Effect, and 23,000 ms is
identical too. The remaining measured residual is at 24,999 ms, one float64
ulp in the small positive blue channels; its exact full vectors are retained in
[neutral-color-residual.json](neutral-color-residual.json), and tests assert
them exactly rather than allowing a tolerance. (Before #1204, the drifted clock
also left near-zero residuals at Group entry and at 23,000 ms.) The cause is the additional neutral
arithmetic's cancellation/association in float64, not a changed Group payload.
Changing the selected parameter to 2 leaves all Group frames exactly identical
to the candidate's original 1.4/1.3 result. Exact private elapsed/runtime exports
remain unchanged across all three records. The separately authored positive
channel source `rgb(.375+x/4,.25+y/4,.625+elapsed/50000)` is unchanged exactly in
both modes for this fixture. Precise near-zero channels are also unchanged.
These observations classify this bounded residual; they do not claim universal
byte-exact untouched color output or change compiler behavior.

Existing unresolved representation cases remain atomic at final admission:
opposite held Effect order can require an extra legacy runtime; animated
participant endpoints can refuse unsupported Transition property tracks; keyed
instance controls can refuse static cache compilation. See the landed
[selected-time evidence](../issue-1038-selected-time-appearance/integration-cases.md).
The measured Precise one-LSB difference from an unsplit numeric preimage remains
separate from exact candidate-versus-authored-key output proof. No owner,
compiler, lowering, runtime or persistence policy changes repair these cases in
this inspector slice.

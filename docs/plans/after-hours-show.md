# After Hours: Visual Direction Packet and Visual Performance Plan

Design for #1192 (parent #1191), approved by Jon with the
[decisions](#decisions) below. No stock map, Pattern or Show builder change
lands under #1192.

**Status: built under #1196.** The `after-hours-sign` map, the NeonTube
Pattern and the After Hours Installation Show are on main (`5c02397e`,
`a4009172`, `e8c44bad`). The as-built Show follows this plan; its artifact
stays under the 68,384 B budget (asserted in `afterHoursShow.test.ts`), and its
worst one-second flash window covers 0.136 of the sign. The Feature Guide
describes the built-in content. Playback past 32.7 s needed #1197, which has
landed; full-loop Precise replay is now proved on #1196. Hardware playback,
pb32 FPS and bench neon-red tuning remain outstanding. After Hours is available for Jon's local
preview on port 5174 and stays unpushed until he previews it and chooses
whether to push (#1191).

**Preview follow-up under #1196:** Jon selected the relay spelling, arrow
variations, chase pause and one dead border bulb. This score is on the issue
branch for his preview on port 5178; it has not been reviewed or landed.

**The design in one paragraph.** Build After Hours as an Installation Show on a
new 2D sign map reading **FOOD**, with the **second O** as the failing letter.
The sign is nine physical Zones (four letters, a border of bulbs, three
arrow-shaft segments and an arrow head) driven by three Pattern instances: one
shared steady tube, one private failing tube, and one stepped LumaMarquee chase.
Every event is a property-track key inside Clips that span the whole Show, so it
compiles to one time section with no Transition; the short is a white color-map
keyed on every Clip. One new Pattern, NeonTube, is needed. The measured budgets
are in the [cost envelope](#cost-envelope).

The packet refines the ideation draft recorded in #1192 rather than restarting
it; [what changed](#what-changed-from-the-draft) lists each refinement.

## Visual Direction Packet

### Intent and audience

- An Installation Show for a sign-shaped fixture: nocturnal roadside theatre
  with a single character, a failing letter.
- It shows that a Show can carry narrative and character on a physical fixture,
  beyond abstract fields.
- Audience: Pixelblaze builders and the PXLBLZ catalogue. The piece is
  physically buildable as an LED "neon" sign.
- Form: an ambient narrative work, not a daily-use Pattern or a sizzle reel.
  About a minute and a half, looping from dark to dark.

### Governing premise

**Light belongs to lamps.** A lamp is one letter's tube, one border bulb or one
arrow segment. Each lamp is one uniform light, and light never crosses the black
between lamps. The sign changes only in order: letters in reading order, the
chase one way round, the arrow from tail to tip. The story is told by the only
two breaks in that law: one letter that will not keep its turn, and one moment
when everything happens at once.

The story: at 2 a.m. a roadside sign warms up letter by letter and settles into
its routine while one letter keeps failing. Each time the arrow fires, the weak
letter dips under the load. Then the fault slips free of the arrow and arcs on
its own; it seems to heal; and the arrow's next firing shorts the whole sign.
In the dark that follows, the broken letter is the one that comes back.

### Graphic grammar

- **Dominant silhouette:** the word, drawn as tube strokes.
- **Supporting primitives:** a border of bulbs carrying a chase, and an arrow of
  four segments that fires from tail to tip.
- **Texture:** none on healthy lamps. They are dead steady, flat and uniform.
  Texture belongs to the fault alone.
- **Edges:** hard strokes against black. The black between strokes and inside
  counters is part of the drawing.
- **Glyphs:** yes. The letters are the piece.

### Hierarchy

- **Warm-up:** the word assembling; each letter is the hero of its own
  ignition.
- **Steady:** the word is the hero, the chase supports it and the arrow
  punctuates each phrase.
- **Hint and failure:** the weak letter becomes the hero through its changing
  fault. The rest of the sign carries on, indifferent; the border's one dead
  bulb is already a fixed gap, with no new activity during the failure.
- **The short:** the whole sign, once.
- **Afterglow:** the survivor alone.
- **Throughout:** black night with no ambient fill. The furniture (border and
  arrow) stays dimmer and cooler than the word.

### Palette roles

- **Neon red** is identity: the word.
- **Argon blue** is furniture: the border and the arrow, always below the
  word's level.
- **Black** is night, space and the gap between lamps.
- **White** is the short only: one hit per loop, held below full white. Its
  impact comes from the black around it, not from its level.
- **No intruder hue.** The intruder is behavioural: the weak letter's off-grid
  rhythm.

### Motion verbs

- **Ignite and fail**, one verb in two directions: a lamp crosses between dark
  and lit through flicker. Healthy lamps cross cleanly, on the grid, in two or
  three pulses. The weak lamp crosses off the grid, in bursts.
- **March:** the order law in motion. Bulbs round the border, segments along the
  arrow, letters through the word.
- **Hold:** dead steady light, the sign's rest.

March repeats at bulb, segment and letter scale. Ignite and fail repeat at lamp
and sign scale: the short is the sign failing at once, and the return is one
lamp igniting alone.

### Timing hierarchy

- **Step:** 250 ms. The chase step, an ignition pulse, one arrow segment.
- **Bar:** 2 s. Warm-up letter ignitions land on bars; the later spelling uses
  the 250 ms steps.
- **Phrase:** 8 s. The arrow's first tip lands on the downbeat. The 24 s phrase
  adds one second firing; the 32 s phrase holds its pointing head for a bar.
- **Arc:** 12 phrases, 96 s, dark to dark, looping seamlessly.
- **One sequencer timer:** the word's spelling steps and the arrow's fill steps
  take turns on the same 250 ms grid. One sequence finishes before the other
  starts; their steps never coincide or interleave. After the word resets at
  20 s, F lights at 20.25 s, the first O at 20.5 s, the weak O one step late at
  21 s, and D at 21.25 s. This late turn seeds the fault before the unchanged
  load-coupled hints at 40 and 48 s.
- The border chase stays continuous furniture. Its one paused step coincides
  with the first 24 s arrow tip; normal forward stepping resumes afterward.
- At 28.25 s one border bulb stops answering the chase. This clean failure
  occupies one grid step between the double firing and the pointing sequence.
  The fixed gap persists through the short and resets at the loop seam; the
  chase keeps its phase and spacing around it.
- Healthy lamps and furniture stay on the grid. The fault starts coupled to the
  grid through the arrow and then leaves it. Its health falls in held stages,
  never along a ramp.

### Phrase arc

| Section | Phrases | Time | What happens |
| --- | --- | --- | --- |
| Dark and warm-up | 1-2 | 0-16 s | 2 s of black. The second O sputters first; F, the first O and D ignite cleanly on successive bars, skipping its turn; the border ignites and starts its chase; the second O is the last letter to catch. The arrow's first firing lands on the 16 s downbeat: the diner is open. |
| Steady | 3-5 | 16-40 s | The ordinary frame gains a relay spelling at 20-21.25 s, with the weak O late. The 24 s arrow double-fires, with one chase pause on its first tip. A border bulb dies at 28.25 s; the 32 s firing leaves its head pointing through 34 s. The word, bulb failure and arrow sequences take turns. |
| Hint | 6-7 | 40-56 s | At the arrow's tip the second O drops out for one step; next phrase, twice. Short enough to doubt. |
| Failure | 8-10 | 56-80 s | Three held stages. First the dips become bursts, still on the arrow's beat. Then the arrow fires and the second O does not answer; it fails on its own time, off the grid. Then it arcs, broken more than lit. Then it steadies: for a moment the word is whole. |
| The short | at 80 s | 80-81 s | The arrow's last firing reaches its tip and the sign flashes white and dies. The dead border bulb stays black. The only white and the only whole-sign event. |
| Afterglow | 11 | 81-92 s | About 2 s of black. The second O alone buzzes back, catches and holds a breath, then stutters out. |
| Out | 12 | 92-96 s | Black. The loop restarts with the second O, the first to try again: the survivor is first and last. |

### Invariants

- Every lamp shows one uniform colour at any instant.
- No light appears between lamps.
- The order law holds except at its two authored breaks: the weak letter's
  out-of-turn timing and the short.
- The word is red; the furniture is blue and dimmer than the word.
- White appears only at the short.
- The survivor is the weak letter, first and last in every loop.
- Healthy lamps hold dead steady between their authored clean ignitions and
  relay cuts; only the weak lamp has texture.

### Permitted variations

Which letter fails; the chase direction and step; the number of failure stages
(two to four) and their health levels; the arrow's segment count (three to six)
and fill step; the phrase length (6 to 10 s); and the sign word.

### Signature frames and impact moments

**Ordinary frames.**
- **Steady:** the whole sign lit, the chase mid-march, the arrow dark. In one
  frame it must read as "a neon sign".
- **Failure:** the word with the weak letter dark and the furniture indifferent.
- **Afterglow:** one red letter alone in black.

**Impact moments.**
- **The arrow's tip** (minor, every phrase), and later the dip it causes.
- **The false recovery** (the turn): the fault seems healed.
- **The short** (major, once): white, then black.
- **The return** (the emotional beat): the survivor lights in the dark.

### Restraint rules

- Light moves only from lamp to lamp; no field sweeps across the sign. The short
  is the one whole-sign event.
- No hue drift on the word and no rainbow. The only colour change is the short's
  white.
- One relay-like sequencer owns the word's clean spelling and the arrow's
  stepped fills in turn. Every step lands on the 250 ms grid, and one sequence
  finishes before the next starts. The healthy letters ignite once each in
  reading order and then hold; they acquire no new flicker or texture.
- The border runs independently as continuous furniture, with one held step on
  the first 24 s arrow tip and one bulb's clean death at 28.25 s. The dead
  bulb misses future chase turns without redistributing the other bulbs, stays
  black under the white short, and resets with the loop. New word, arrow and border gestures finish during
  Steady, before Hint at 40 s. Nothing new competes with the weak O during the
  56-80 s failure.
- Besides the chase, one event at a time. The arrow and the weak letter's answer
  to it count as one event, cause and effect. The off-grid faults avoid the
  arrow's firings, and the false recovery clears the stage for the last one.
- Fast flicker stays inside the weak letter.
- Peak brightness belongs to the short, and even the short stays below full
  white.
- The furniture never outshines the word.
- **Reduced-intensity check:** the piece must still read with the fault slowed
  to soft dropouts and the short at half level.

### Known failure modes

- **The fault reads as noise rather than a fault.** The Show authors its
  structure (coupling to the arrow, held stages, the slip off the grid, the
  false recovery); the tube supplies only texture.
- **The chase competes with the weak letter.** The furniture is permanently
  subordinate, dimmer, cooler and on the grid. Its lone bulb dies during
  Steady and is a passive gap by the failure. Dimming the chase during the failure would be a
  whole-sign sag, which the premise rejects.
- **The dip misses the arrow.** The coupling reads only if the dip lands on the
  tip's own step.
- **LED red reads orange or pink.** Neon red needs tuning on hardware.
- **The short overloads the power supply.** Its level is capped and must be
  confirmed against the supply.
- **Thin strokes won't read.** Letters need enough pixels per stroke; the plan
  sets the density.

### Rejected alternatives

- **A passing car's sodium-amber headlight wash as an intruder palette.**
  Evocative, but it adds a second field that ignores the lamps and dilutes the
  "except once" law.
- **The whole sign sagging whenever the letter arcs.** It contradicts the sign's
  indifference and spends the short before it happens.
- **A faint breathing glow on healthy tubes.** Texture would no longer belong to
  the fault.

### Impact rubric scores

Scored against
`.claude/skills/design-compelling-pxlblz-visuals/references/impact-rubric.md`.
The draft column scores the ideation draft as recorded in #1192; the refined
column scores this packet.

| Dimension | Draft | Refined | Why |
| --- | ---: | ---: | --- |
| Premise | 3 | 3 | One inferable sentence: a sign at closing time loses one letter, and when the sign shorts, that letter outlives the rest. |
| Hierarchy | 2 | 2 | Word over furniture by level and colour, the fault by irregularity, the survivor by isolation. Residual risk: the chase never stops moving, and motion pulls the eye during the failure. |
| Palette roles | 3 | 3 | Structural: the single white is the single break in the law, and no colour changes otherwise. |
| Motion grammar | 2 | 3 | The arrow becomes the fault's fuse, so march and fail interlock instead of running side by side. One verb serves ignition, failure, the short and the return. |
| Temporal form | 2 | 3 | Cause, then decoupling, arcing, false recovery, the short and the return, with the survivor closing the loop seam. The draft's failure escalated without a cause. |
| Restraint | 2 | 3 | Healthy lamps are dead steady and white happens once. The breathing texture and the sag are gone. |
| Ordinary frame | 3 | 3 | Iconic: the steady frame is the archetypal roadside FOOD sign, and the afterglow's lone ring reads as a symbol. Both read in the storyboard's prototype renders. |
| Surprise | 3 | 3 | The broken letter survives the healthy ones; the false recovery sharpens the rupture, and the return closes it. |

### What changed from the draft

1. The law is restated around lamps, with the two breaks named as the story.
2. Implementation detail ("wiring order", pixel counts, power figures) moved
   into the plan; the packet says "sign order".
3. The arrow is the fuse: the weak letter dips under its load, then breaks free
   of it, and the arrow's last firing causes the short.
4. A false recovery precedes the short.
5. Healthy tubes lose the breathing texture.
6. The optional whole-sign sag is rejected, and listed with the reasons.
7. The afterglow gains a held breath, and the survivor is first and last across
   the loop seam.
8. The motion-grammar claim now matches the score: march at bulb, segment and
   letter scale; ignite and fail at lamp and sign scale.
9. The timing grid is fixed (250 ms, 2 s, 8 s, 96 s) and the arc is laid out in
   phrases.
10. The storyboard adds the short.

## Decisions

Jon decided these on #1192 before the build child was cut.

1. **The sign word is FOOD, with the second O failing.** Jon chose FOOD because
   it is emblematic of the highway, the open road, diners and Americana.
   - The steady frame reads as a roadside diner sign at once.
   - The failing letter is third in reading order, so the warm-up visibly skips
     its turn: F, the first O and D ignite on successive bars while the second
     O still sputters. The healthy first O beside it is a control sample.
   - The survivor is a lone O ring, the strongest survivor silhouette: a closed
     shape that reads as a symbol on its own, not a fragment of a word.
   - Four letters get 50 to 67 pixels each at 442 pixels in total, which leaves
     frame-rate headroom.
   - The alternatives were **OPEN** with its O failing, the archetypal neon
     word, whose failing letter is first in reading order and so breaks the
     order only in completion; and **PXLBLZ**, a self-portrait at 560 pixels
     with a failing Z or second L. The legibility render,
     `docs/plans/images/after-hours-food-legibility.png`, draws the FOOD map.
2. **The packet and this plan are approved.** The build child is cut from them.
3. **NeonTube is a Show ingredient**, kept in the Pattern rail and out of the
   Gallery like the Luma family. Alone it is one grey tube, and its character
   comes from the Show's Health envelope. Its Health control still serves
   builders' own Shows.

## Visual Performance Plan

Written to the contract in
`.claude/skills/co-design-pxlblz-visual-performance/references/visual-performance-plan.md`.
Every measured figure below comes from one of two probes. One compiled a
prototype of the full score through the production path
(`prepareShowV2ForCompile`, then `compileShow`) and replayed it through
`createFastReplayRuntime`; the other compiled synthetic variants to price each
mechanism. Estimates are labelled as estimates: the frame rate, scaled from
measured hardware anchors, and the byte breakdown, derived from the marginal
costs. The [probe record](#probe-record) has the commands and raw results.

### Target

- **Artifact:** an Installation Show in the Installations collection, with an
  installation output contract on a new stock 2D map (working id
  `after-hours-sign`) at exactly 442 pixels.
- **Duration:** 96 s, a deterministic loop.
- **Controller:** Pixelblaze 3 (pb32 class, firmware 3.67, the hardware behind
  the measured anchors). Exploratory, but specified so it can be built as a
  real sign.
- **Stage:** nine physical Zones, one per lamp group, in sign order.

| Zone | Lamp | Index range | Pixels |
| --- | --- | ---: | ---: |
| F | letter tubes (top and stem, then middle arm) | 0-49 | 50 |
| O1 | letter tube | 50-109 | 60 |
| O2 | letter tube, the failing letter | 110-169 | 60 |
| D | letter tube | 170-236 | 67 |
| border | 141 bulbs, clockwise from top left | 237-377 | 141 |
| arrow1, arrow2, arrow3 | shaft segments, tail first | 378-425 | 16 each |
| head | chevron | 426-441 | 16 |

**Map layout.** The word is drawn in a single-stroke tube font with the letter
box 1.0 high and 0.7 wide, letters 0.25 apart. Pixels sit at a uniform pitch of
0.0448 along every stroke. The arrow lies under the word, pointing right, at
about 70% of the word's width. A rounded rectangle of bulbs surrounds both, at
a pitch of at least twice the stroke pitch. The bulb count is a multiple of
three and at most 150, because LumaMarquee's minimum pitch is 2% of the run and
the chase lights every third bulb. Samples and positions are the same
coordinates, with y increasing downward. The map source is a function of
`pixelCount` that solves the pitch, so the topology stays independent of
resolution.

### Protected visual purchase

The weak letter's fault, read as a character: one lamp failing in authored
stages while every other lamp holds dead steady or marches on the grid, ending
in the short and its lone return. As the budget tightens, four things are never
cut: the weak lamp's private texture, its coupling to the arrow's tip, the
short, and the return.

### Visual grammar

**Implementation grammars for the protected purchase**, compared:

| Grammar | Artifact and state | Active render | Verdict |
| --- | --- | --- | --- |
| **A. NeonTube on a private instance.** The Show writes the stages as a held instance-control track on Health; the Pattern supplies texture. | About 3 KB for the instance and about 5 KB for 39 keys | One constant per frame, computed in `beforeRender` | **Chosen** |
| B. A hand-keyed opacity flicker on a shared steady source | Every flicker edge is a key at about 121 B; a convincing minute needs hundreds of edges (30-60 KB) | Same as A | Rejected: the bytes, and keyed flicker looks mechanical |
| C. RealWorldLights candle (preset 0) under a tint | Existing Pattern | Per-pixel noise | Rejected: a smooth shimmer along the strip breaks the one-uniform-light law |
| D. Blink | Constant settings, not animatable | A hard periodic gate | Rejected: a periodic gate is the opposite of a fault |

**NeonTube**, the one new Pattern: a grayscale, uniform 1D tube with two
controls, Health and Seed.
- **Health 1** holds the tube steady and **Health 0** keeps it dark.
- **In between**, it thresholds two octaves of `perlin` noise over a wrapped
  clock: slow bursts of about 250 ms features, with flutter of about 40 ms
  features inside them. The threshold sits at the noise's Health quantile, so
  the tube is off for about 1 - Health of the time.
- **Determinism:** the noise is a function of the instance clock, so seek and
  replay are exact.
- **Cost:** all frame work happens in `beforeRender`, and `render` writes one
  constant.
- **Texture**, measured on the probe source over 60 s at 30 fps. The
  threshold uses the noise's measured mean and spread at Seed 0.37 (0.5000 and
  0.1071). The off fraction tracks 1 - Health, and the texture stays a fault at
  every level: about five state changes a second through the middle of the
  range, and near Health 1, holds of about a second between short dropouts.

| Health | Off fraction | Median on / off run | Transitions per second |
| ---: | ---: | ---: | ---: |
| 0.2 | 0.76 | 67 / 133 ms | 5.0 |
| 0.3 | 0.66 | 67 / 133 ms | 5.5 |
| 0.45 | 0.52 | 133 / 167 ms | 5.0 |
| 0.5 | 0.49 | 133 / 133 ms | 5.2 |
| 0.6 | 0.40 | 133 / 100 ms | 5.3 |
| 0.75 | 0.26 | 217 / 67 ms | 4.6 |
| 0.8 | 0.22 | 233 / 100 ms | 3.9 |
| 0.95 | 0.04 | 1,033 / 33 ms | 1.4 |

**Supporting grammar, built from cheap materials.**
- **Healthy letters and arrow segments:** one shared `tube` instance (NeonTube
  at Health 1, a constant) under tint color-maps. They ignite and fire on
  held opacity keys, on the grid.
- **Border chase:** the existing LumaMarquee on a 250 ms stepped clock, tinted
  blue. Every third address is lit and advances one index per step, except
  the authored held step. From 28.25 s, local bulb 23 (physical LED 260) is
  omitted whenever its turn comes. A held Clip Aperture moves over that bulb
  after the Effects, so even the short cannot relight it. No extra Zone or
  Pattern instance is needed.
- **The short:** a second, white color-map on every Clip. Its amount jumps to 1
  at 80.25 s. Then opacity decays on a cubic-out curve to 0 by 81.05 s; on the
  second O, the white amount decays instead, so it can return. There is no Transition.
- **Colour:** tint color-maps from black to the colour. Letters run to
  (1, 0.08, 0.02); furniture to (0.16, 0.36, 1) at opacity 0.6 for the border
  and 0.7 for the arrow. By Rec. 709 luminance both stay below the word: 0.22
  and 0.25 against 0.27. A solid color-map, with shadow equal to highlight, is
  wrong for colour: it would erase the tube's on and off and the chase's bulbs.
- **The short's white** is the one solid color-map, (0.6, 0.6, 0.6). Erasing
  the source is its job: at amount 1, every pixel of every lamp turns white at
  once, the unlit bulbs and the dark second O included, except the dead border
  bulb suppressed by the post-Effect Aperture.

### State and identity plan

| Instance | Pattern | Serves | Why it has its own identity |
| --- | --- | --- | --- |
| `tube` | NeonTube, Health 1 | F, O1, D, arrow1-3, head | Shared: these lamps have no private state, and their timing lives on their Clips |
| `weak` | NeonTube, Seed 0.37, Health track | O2 | Private: its Health is the story |
| `chase` | LumaMarquee, stepped 250 ms | border | Its own clock is the grid |

There is one Clip per Zone on its Main Layer. All nine Clips span the whole 96
s, and every track is active for its Clip's lifetime, so the Show compiles to
**one time section**.

### Cost envelope

The following prototype ledger and marginal estimates predate the Effect
identity reuse and relay preview. Current compiler measurements and remaining
headroom are recorded on #1196; this historical estimate is not their oracle.

| Ledger | Budget | Planned peak | Evidence or uncertainty |
| --- | ---: | ---: | --- |
| Pattern/source bytes | none set | NeonTube about 0.6 KB | Probe source |
| Production artifact bytes | 68,384 B activation proxy (`test/perf-harness/issue514.test.ts`) | 46,511 B | Measured. Bytes barely depend on pixel count: earlier prototype maps measured 46,615 B at 463 pixels and 45,936 B at 286 pixels |
| Globals and array words | 256 globals; 10,240 words | 116 globals; 1,338 (8,902 remaining) words | Measured |
| Render-target words | 3 × (N + 4) | 1,338 at 442 pixels | Ledger formula, `src/engine/showVmResourceLedger.ts:3-8` |
| Active Pattern evaluations | 5 renderers per pixel | 1 per pixel, always: 442 per frame | Score structure: no Transition, no overlay Layer |
| Expensive operations per active pixel | none set | Two color-maps and an opacity per pixel; LumaMarquee's crest on the 141 border pixels; NeonTube writes a constant | Score structure |
| Frame time or FPS | 15 FPS working floor (proposed) | About 20-35 FPS estimated | Estimate, not a measurement. It scales the per-pixel cost of measured pb32 anchors (Vignette 63.5 / 16.4 / 8.2 FPS at 256 / 1,000 / 2,000 pixels; simple Shows 38-40 FPS at 256 pixels; output alone about 30 µs per pixel) to 442 pixels with one evaluation each. `npm run devbench` in the build replaces it |

**Marginal costs**, measured on a synthetic nine-Zone Installation of 583
pixels:
- **About 121 B** per held key, for both instance-control and opacity tracks.
- **About 520 B** of overhead per track, before its keys.
- **About 250 B** per extra Zone with its Clip.
- **About 8.5 KB** per extra compiled time section.
- **About 6.4 KB and 49 globals** for the second NeonTube instance plus the
  stepped LumaMarquee.
- **For the short:** a whole-output fade-color Transition costs about 22 KB and
  an extra section. White color-maps with animated amounts cost about 9.8 KB
  and no section.

Keys inside a track add no section, but a track active for only part of the
Show adds two boundaries.

**Where the bytes go** (estimated from the marginals):
- about 12 KB for the base: Zones, Clips and three instances;
- about 21 KB for roughly 170 keys;
- about 9 KB for track overhead;
- about 4 KB for Effects.

The arrow is the most expensive voice, at about 12 KB for 80 keys and four
tracks. The headroom under the activation proxy is 21,873 B, about 180
more keys.

**Flash limit.** Measured with the harness algorithm at 30 fps
(`src/agent-harness/telemetry/harness.ts`).
- The worst one-second window has 13.6% of the pixels flashing above 3 Hz,
  against the 25% limit.
- The fault flickers fast, but only inside one letter, so it stays under the
  area limit by construction.
- Healthy ignitions stay at or below 2 Hz.
- The border's ignition stays at 1.5 Hz, which matters because the border is
  30% of the sign.
- The short is a single flash.

### Section and transition strategy

The whole Show is one compiled time section. Every event is a key inside a Clip;
no Clip edge, Transition or partial track window falls inside the Show.

| Section | Time | Mechanism |
| --- | --- | --- |
| Dark and warm-up | 0-16 s | O2's Health keys start its sputter at 2 s, and it catches at 13 s. Held opacity keys ignite F at 4 s, O1 at 6 s, D at 8 s and the border at 12-13 s. The chase runs from its first lit step. The first arrow firing runs 15.25-16 s. |
| Steady | 16-40 s | At 20 s the word resets, then F/O1/O2/D ignite at 20.25/20.5/21/21.25 s; O2 misses its 20.75 s turn. The arrow fills at 23.25-24 s, resets at 24.25 s, fills again at 24.75-25.5 s and goes dark at 26.5 s. The border pauses on the first tip. One border bulb dies cleanly at 28.25 s. The next fill runs 31.25-32 s; its shaft goes dark at 32 s and its head holds through 34 s. Every sequence finishes before the next starts. |
| Hint | 40-56 s | O2's Health drops to 0 for one step at the 40 s tip; at 48 s it drops out twice, a step apart. |
| Failure | 56-80 s | Held Health stages. Bursts on the beat at 56 and 60 s. The 64 s firing gets no answer, and bursts follow off the grid at 65.37, 67.83 and 70.24 s. Arcing from 72 to 78 s, recovery at 78 s, and the last firing at 79.25-80 s. |
| The short | 80.25-81.05 s | The white color-map amount goes to 1 on every Clip; opacity (on O2, the white amount) decays to 0 on a cubic-out curve. The dead border bulb remains black after the white Effect. Under the white, O2's Health drops to 0, so O2 fades to black with the rest. The arrow's tip lights one step before the short, as its cause. |
| Afterglow and out | 81.05-96 s | Only O2's Health keys: buzz from 83 s, catch at 85.75 s, hold to 90 s, stutter out by 92 s. Every other Clip sits at opacity 0. |

At the loop seam, 92-96 s plus 0-2 s gives six seconds of black. The second O is
the last lamp out and the first to sputter.

### Expensive purchases

- **The `weak` NeonTube instance** (about 3 KB): the protagonist's texture.
- **39 Health keys** (about 5 KB): the authored envelope that turns noise into
  a fault.
- **The arrow as four Zones with 80 keys** (about 12 KB): the fuse, marching
  tail to tip once a phrase. It causes the dips and the short, and it is the
  first purchase to economise.
- **The white color-map short** (about 9.8 KB): the single break, and the
  climax.
- **The stepped LumaMarquee chase** (about 3 KB and about 25 globals): the
  indifferent foil.

### Measurement plan

**First slice of the build:** the map, NeonTube and a Show cut at the end of
the warm-up and the first arrow firing. Record the three ledgers, then extend
to the full score.

**Verification matrix**, carrying #1192's Tests list:
- **The map:** pixel count, index ranges, letter order, uniform stroke pitch,
  and a border count that is a multiple of three.
- **NeonTube:**
  - its five stock pieces;
  - the off fraction at fixed Health within tolerance of 1 - Health;
  - an exact frame after seek.
- **The Show:**
  - it validates, reopens and compiles with no blockers;
  - one time section;
  - bytes under the activation proxy and globals under 256.
- **Deterministic seek** through the failure section.
- **The flash limit** on a deterministic render, every second at or below 25%.
- **Census re-pins** per `docs/agents/stock-content.md`, with unchanged
  verdicts.
- **Real-Stage captures** (`?capture`) of steady, failure, the short and the
  afterglow.
- **`npm run devbench` FPS** on a pb32, at or above the 15 FPS floor.
- **Hardware notes:** the tuning of neon red, and the short's current draw.
  At the commonly quoted 60 mA per pixel at full white, 442 pixels at 0.6 white
  draw about 16 A.

### Fallback ladder

In order. Each rung keeps the premise.

1. **The arrow.** Make it one Zone lit by a tinted, stepped LumaMarquee whose
   single lit segment travels tail to tip, gated by two opacity keys per
   firing. This saves about 6-9 KB; the fill becomes a travelling segment.
2. **The failure stages.** Use two held stages instead of three, with fewer
   off-grid bursts. This saves 1-2 KB.
3. **The healthy ignitions.** Light healthy letters with one cut instead of a
   stutter. This saves about 2.5 KB, and the weak letter keeps its sputter.
4. **The short.** Put the white color-map on the letters only and cut the
   furniture to black at the same instant. This saves about 4 KB, and the word
   still shorts whole.
5. **Pixel density.** Lower the map's pixel count; its source re-solves the
   pitch and the Zone ranges. This changes frame rate only: the lamps, their
   order and the score stay the same.

### Handoff

To the build child (`work:implementation`), through
`compose-pxlblz-installation-shows` and `build-efficient-pxlblz-patterns`:
- **The map:** the stock map source in `src/pixelblaze/stock/maps/sources/`,
  its catalogue entry and its tests.
- **NeonTube:** its five stock pieces, with its home set by Jon's decision.
- **The Show:** built in `src/pixelblaze/stock/showsV2.ts` through the
  authoring helpers, with census re-pins following the fan-out order in
  `docs/agents/stock-content.md`.
- **Proof:** real-Stage captures of the four signature frames, devbench FPS,
  the flash measurement, and hardware notes.

### Probe record

The probes were temporary files, deleted before this plan was committed.
Their briefs, including the probe NeonTube source and the full prototype
score, are posted on #1192.

| Probe | Command | Answers |
| --- | --- | --- |
| Cost scaling | `npx vitest run src/pixelblaze/stock/_after-hours-b-cost-probe.test.ts` | The marginal costs above, and the two mechanisms for the short |
| Maps and prototype | `npx vitest run src/pixelblaze/stock/_after-hours-a-score-probe.test.ts` | The map tables; compile resources; the chase check; the flash limit; the storyboard |

**Cost-scaling variants** (synthetic Installation, 583 pixels):

| Variant | Bytes | Globals | Words | Sections |
| --- | ---: | ---: | ---: | ---: |
| V0: one Zone, one Clip, one NeonTube | 3,230 | 26 | 317 | 1 |
| V1: nine Zones and Clips, one shared NeonTube | 5,828 | 19 | 1,761 | 1 |
| V2: V1 plus the `weak` NeonTube and the stepped chase | 12,208 | 68 | 1,774 | 1 |
| V3: V2 plus a Health track, 10 keys | 13,824 | 60 | 1,761 | 1 |
| V3: V2 plus a Health track, 40 keys | 17,461 | 60 | 1,761 | 1 |
| V4: V2 plus eight opacity tracks, 5 keys each | 21,218 | 59 | 1,761 | 1 |
| V4: V2 plus eight opacity tracks, 20 keys each | 35,730 | 59 | 1,761 | 1 |
| V5: V4 (20 keys) plus a whole-output fade-color short | 57,700 | 89 | 1,761 | 2 |
| V6: V4 (20 keys) plus a white color-map short | 45,548 | 82 | 1,761 | 1 |
| V7: V4 (20 keys) with one letter's Clip split at 40 s | 44,266 | 59 | 1,761 | 2 |
| V8: V4 (20 keys) with the arrow as one Zone | 26,136 | 59 | 1,761 | 1 |

V5 was refused in the specified shape: the incoming Clip had to start at the
Transition's end (80.8 s), and the outgoing tracks had to run through it.

**The #1192 probe questions, answered.**
1. **Zone topology:** one physical Zone per letter, plus the border and four
   arrow Zones. A word Zone isolated by an Aperture is unnecessary.
2. **Coordinates inside a Zone:**
   - A 1D `render(index)` receives the Zone-local index, and `pixelCount` is
     the Zone's count (`src/engine/showRoutingRepresentation.ts:72-89`).
   - On this 2D Stage, LumaMarquee runs `render2D` yet still walks index
     order: stride 3, one index per step, measured on the border.
   - NeonTube runs its 1D `render`, adapted.
3. **Voices:**
   - LumaMarquee carries the chase.
   - NeonTube is new.
   - RealWorldLights' moving presets shimmer along the strip, so it is
     rejected.
4. **Mechanisms:**
   - Blink is unused; it is periodic and not animatable.
   - Presentation strobe is unused.
   - The short uses white color-maps, which are 12 KB cheaper than the
     fade-color Transition and add no section.
   - The stepped clock drives the chase.
5. **Budget:** see the [cost envelope](#cost-envelope).
6. **Map:** as specified above.

**Storyboard.** Rendered from the probe prototype, not captured from the real Stage. The
frames are fast-replay pixel output from the production compiler, drawn as dots
at the FOOD map's coordinates. Unlit pixels are drawn as dim grey outlines so
the sign's shape stays visible, and the soft glow is illustrative. Real-Stage
captures belong to the build.

- **Warm-up (8.1 s):** F, the first O and D are lit. The second O, whose turn
  the order skipped, is caught in an off phase of its sputter.
- **Steady (28 s):** the whole word, the chase one bulb in three, the arrow
  dark. This is the ordinary frame.
- **Arrow firing (23.75 s):** the shaft is lit, and the tip comes next.
- **First hint (40.125 s):** the arrow's tip is lit and the second O is
  dark: cause and effect in one frame.
- **Failure (65.4 s):** the word with the second O dark: FO D. The arrow is dark, and the
  furniture carries on.
- **The short (80.3 s):** the sign in white, already decaying; the dead border
  bulb remains black in the #1196 preview follow-up.
- **Afterglow (87 s):** the second O alone.

The score strip plots each Zone's mean brightness over the full 96 s on the
phrase grid. Images: `docs/plans/images/after-hours-storyboard.png` and
`docs/plans/images/after-hours-score-strip.png`. The legibility render,
`docs/plans/images/after-hours-food-legibility.png`, draws the FOOD map with
every point lit.

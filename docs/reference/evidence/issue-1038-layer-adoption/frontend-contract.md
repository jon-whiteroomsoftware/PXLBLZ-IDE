# Native Layer management: implementation layout contract

Canonical specification §§8/9/12 at31d428c9; LAYERS/ROUTE/PARITY. Opt-in native route only. Reuse existing zinc controls, inherited IDE typography, compact labels, native select/input/Button and current live focus. No new colors/cards/badges or tutorial copy.

```text
Existing timing controls

Layers                         [Add Layer]
Zone [explicit selection]
Layer [named persisted Layer]
Name [current name]              [Rename]
[Move up] [Move down] [Remove Layer]

Add expanded:
Zone [explicit existing Zone] Name [draft]
[Add Layer at top] [Cancel]

Referenced removal expanded:
Clip name/identity               [Choose destination]
Group occurrence/local slot      [Choose destination]
Transition participant           [Choose destination]
[Reassign and remove] [Cancel]

Existing Markers/history/status
```

Each reassignment select starts unselected, contains only other same-Zone Layers, and targets one exact authored reference including unused Group binding. No destination inferred from occupancy. Layer selection is separate from Clip selection. Removing a selected Layer clears it. Rank0 is bottom; up/down sends complete Zone order. Add at top requests checked maxrank+1 (empty0), preserving existing sparse ranks. The timeline already shows empty named Layers; no Clip presenter edits.

Narrow retains native vertical layout and wrapping buttons/fields. Inputs have visible labels, keyboard-native selection and submit/cancel. Only content names, operation labels and actual refusal/save state are admitted. Draft/selection/cancel/no-op produce no adoption/history/write. Pending operations and completion feedback use exact existing capture/adoption receipts; no queue/history implementation.

Layout-surface advisory: the new Layer editor has no legacy canary mapping. Coverage is justified by its actual parent-route component tests and the new authenticated Shows suite flow; isolated browser acceptance measures all controls at1440/1024/390 and keyboard tab order. Fresh own committed-tip captures cover this new region rather than treating an unrelated legacy canary as proof.

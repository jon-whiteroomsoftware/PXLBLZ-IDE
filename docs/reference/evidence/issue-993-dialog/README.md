# Connected-delete dialog proof (#993)

Source `e76c42011018285cf38e55125b0e2d65a8d20bec`, managed runtime 5179, in-app browser with synthetic local-agent-08. [Desktop](../../../../.wrsp/ui-proof/993-desktop-dialog.jpg) and [narrow](../../../../.wrsp/ui-proof/993-narrow-dialog.jpg) captures were inspected at 1440x900 and 640x900.

With the connected Clip inspector open, Delete displayed the entire confirmation above it. Cancel received initial focus; Tab reached Remove Clip and Transition and Shift-Tab returned to Cancel. Enter on Cancel preserved the open inspector and its Start 11s and Duration 8s values. Reopening and keyboard-confirming removed clip-b; one Undo restored it. Both widths passed this sequence. No Escape workaround was used.

The imported existing removal fixture intentionally contains an unrelated orphan track; its visible compiler warning predates the dialog action and remains unchanged. Complete-record Cancel preservation and keyboard/pointer regression checks use the existing connected-delete component and authenticated Shows cases.

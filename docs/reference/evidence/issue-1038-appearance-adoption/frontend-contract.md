# Native ordinary Clip appearance inspector

Assignment: #1038, gpt-5.6-sol/high, 2026-09-16. Canonical specification at
70812ae64c919ff1dcb15e019125bd3b6bad7b4b; proof rows ROUTE, FAILURE,
SHARING, ACTIVATION, CURVE and PARITY. Layer fb835 is the immutable stacked base.

```text
Appearance                              selected ordinary Clip
Apply to [Choose scope | Whole Clip | Selected time]
At [global milliseconds]                selected time only
Opacity [value/Mixed]   Brightness [value/Mixed]
Phase [value/Mixed]     Mirror [On/Off/Mixed]
[Apply appearance]

Effects
New Effect [Choose kind] [Add Effect]
Effect [Choose exact identity]
Parameter [Choose parameter] Value [value/Mixed] [Apply parameter]
[Duplicate Effect]
Place [Before/After] Target [Choose same-stage identity] [Move Effect]
```

Fields submit independent dirty patches. Mixed values never use the first span
as a uniform value. Scope, time, source and ordering target remain explicit.
Each required fresh identity is allocated once at submission, never per span.
Selected existing keys retain their exact identity; interior requests preserve
the predecessor's complete authored held value. The owner validates finite
values, descriptors, full record and routing. Closed typed ingress validates
operation/scope/identity shape. Prepared admission refuses unsupported emitted
artifacts before adoption and delegates one accepted replacement to the existing
store history/save owner. All fourteen affected collections remain exact.

Only operation labels, field labels, content identity and actual status appear.
Mixed placeholders prevent flattening; no explanatory captions are admitted.
Controls use the existing native editor spacing, zinc palette and native labeled
forms. Narrow controls wrap and remain reachable through the route scroll pane.

Excluded: Effect removal, optional appearance components, Group edits, Property
CRUD, runtime/format/compiler changes. Opposite held Effect-order sharing,
participant property and cache restrictions remain named unresolved integration
cases with atomic admission refusal. Fresh final-base browser/artifact proof and
coordinator review/final suites are pending.

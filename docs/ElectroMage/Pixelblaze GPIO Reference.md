# Pixelblaze GPIO Reference

Source: https://electromage.com/docs/GPIO/

This local note preserves the GPIO facts needed for PXLBLZ hardware-input work.
ElectroMage is the Pixelblaze manufacturer; use its GPIO page as the authority
when this summary and the live docs disagree.

## V3 Standard analog inputs

Pixelblaze pattern code uses the numeric part of the `IOxx` label:

```js
pinMode(33, ANALOG)
value = analogRead(33)
```

ElectroMage documents these v3 Standard labels as analog-capable:

| HW rev | Location | Pin label | Analog in | Notes |
|---|---|---:|---|---|
| All v3 | Underside pad | `IO33` | Yes | Example pot input in ElectroMage docs |
| >= v3.5 | Underside pad | `IO34` | Yes | Input-only |
| >= v3.5 | Underside pad | `IO35` | Yes | Input-only |
| >= v3.5 | Underside pad | `IO36` | Yes | Input-only |
| >= v3.5 | Underside pad | `IO39` | Yes | Input-only |

The 8-pin through-hole header labels `IO26`, `IO25`, and `IO0` are documented
as digital input/output only, not analog input. They can still be useful for a
digital-read smoke test, but they are not valid potentiometer inputs for the
analog `analogRead` path.

## Issue #289 hardware note

The test controller available during issue #289 had two potentiometers wired to
the top two 8-pin through-hole header pads. Based on the v3 Standard pinout,
those appear to be `IO26` and `IO25`; that hardware wiring was not independently
validated as an analog control. Use it only for digital input plumbing tests
until the potentiometer wiper is moved to an analog-capable underside pad.

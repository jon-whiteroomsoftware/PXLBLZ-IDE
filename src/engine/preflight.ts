// Pure preflight reconciliation for Send-to-Controller (issue #203, #213). Before a
// push the IDE compares the modeled pixel count (its "map points") against the
// Controller's configured pixel count and surfaces any mismatch — but a *pattern*
// push and a *map* push handle a mismatch in opposite ways, because the firmware
// treats them differently:
//
//   - **Pattern push** keeps the non-blocking heads-up. A pattern runs on whatever
//     pixels exist, so a count mismatch is "this won't look right", not an error. The
//     push pipeline sends bytecode only and keeps the device's own map.
//   - **Map push** is a *hard* failure on a count mismatch. The firmware silently
//     **drops** a map whose point count != pixelCount (confirmed against the device
//     and by the reference client, which refuses to even parse such a map on
//     read-back: `numElements != pixelCount → ValueError`, #204/#213). So a map count
//     mismatch is **blocking**, with a coupled remedy: set the Controller's pixel
//     count to the map's point count, then push — the only thing that makes a
//     fixed-count map apply. The caller offers that as one explicit action.
//
// Transport-agnostic and React-free: the caller supplies the two counts (device count
// read via getConfig; local count from the resolved preview layout / re-baked map) and
// whether a map upload is opted into. A map *dimensionality* mismatch needs map
// read-back (#205) and is out of scope here — see issue #203.

/** Each distinct preflight concern. `*-device` kinds are non-blocking pattern-fit
 *  heads-ups; `map-overwrite` is the shared-map guard; `map-count-mismatch` is the
 *  blocking map-push failure (firmware would silently drop the map). */
export type PreflightWarningKind =
  | 'fewer-than-device'
  | 'more-than-device'
  | 'map-overwrite'
  | 'map-count-mismatch'

export interface PreflightWarning {
  kind: PreflightWarningKind
  /** Human-readable headline, ready to render in the reconciliation popover. */
  message: string
  /** Optional secondary explanation, shown behind an info-hover rather than inline so
   *  the popover body stays short (the map-count-mismatch firmware rule, #213). */
  detail?: string
}

export interface PreflightInput {
  /** The modeled pixel count — for a pattern, how many points its map produces; for a
   *  map push, the re-baked map's point count (what will actually be sent). */
  localPixelCount: number
  /** The Controller's configured pixel count (from getConfig), or null when it can't be
   *  read — in which case the pixel-fit / mismatch checks are suppressed (nothing to
   *  compare, and we can't safely block). */
  devicePixelCount: number | null
  /** True when this Send uploads the IDE's map (overwriting the device's single shared
   *  map). Switches the mismatch handling from non-blocking pattern-fit to a blocking
   *  map-count failure. Defaults false (push pattern bytecode only). */
  pushingMap?: boolean
}

export interface Preflight {
  /** Ordered warnings: the fit / mismatch warning (if any) first, then map-overwrite. */
  warnings: PreflightWarning[]
  /** Whether a warning blocks the plain push. True only for a map-count mismatch — the
   *  caller must then offer the coupled set-pixel-count remedy instead of a plain push. */
  blocking: boolean
  /** When `blocking`, the pixel count the Controller must be set to for the map to
   *  apply (= the map's own point count). null otherwise. */
  remedyPixelCount: number | null
}

/** Reconcile the open pattern or map against the connected Controller. Returns the
 *  ordered warnings to show in the preflight dialog; an empty, non-blocking list means
 *  a clean push (the caller may then skip the dialog entirely). */
export function describePreflight({
  localPixelCount,
  devicePixelCount,
  pushingMap = false,
}: PreflightInput): Preflight {
  const warnings: PreflightWarning[] = []

  if (pushingMap) {
    // Map push: a count mismatch is a HARD failure — firmware silently drops a map
    // whose point count differs from pixelCount. Block, and carry the count the
    // Controller must be set to (the map's own point count) for the coupled remedy.
    let blocking = false
    let remedyPixelCount: number | null = null
    if (devicePixelCount !== null && localPixelCount !== devicePixelCount) {
      warnings.push({
        kind: 'map-count-mismatch',
        message: `This map has ${localPixelCount} points but the Controller is set to ${devicePixelCount} pixels.`,
        detail:
          `The firmware silently drops a map whose point count doesn’t match, so it won’t apply ` +
          `until the Controller is set to ${localPixelCount} pixels.`,
      })
      blocking = true
      remedyPixelCount = localPixelCount
    }
    warnings.push({
      kind: 'map-overwrite',
      message: 'This replaces the Controller’s single shared map.',
    })
    return { warnings, blocking, remedyPixelCount }
  }

  // Pattern push: non-blocking fit heads-up — a pattern runs on whatever pixels exist.
  if (devicePixelCount !== null) {
    if (localPixelCount < devicePixelCount) {
      warnings.push({
        kind: 'fewer-than-device',
        message: `Only ${localPixelCount} of the Controller’s ${devicePixelCount} pixels will light up.`,
      })
    } else if (localPixelCount > devicePixelCount) {
      const extra = localPixelCount - devicePixelCount
      warnings.push({
        kind: 'more-than-device',
        message: `This pattern maps ${localPixelCount} pixels but the Controller has ${devicePixelCount}; the extra ${extra} are ignored.`,
      })
    }
  }

  return { warnings, blocking: false, remedyPixelCount: null }
}

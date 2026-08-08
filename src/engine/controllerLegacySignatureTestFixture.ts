import type { ControllerProfile } from './controllerProfile'

/** A push record's stored artifact signature, exactly as records written before
 * #772 held it. This is frozen historical text, transcribed from the shape the
 * pre-#772 code persisted — never recomputed from today's model — so a test can
 * compare it against a signature the current code produces and mean something.
 *
 * Two facts fix the bytes. `controllerProfileArtifactSignature` serialized whole
 * `ControllerInput` objects and has not changed since; and the pre-#772 input
 * constructor built them as `id, name, pin, signal, role, smoothing, fallback,
 * invert`, which is the key order `JSON.stringify` then preserved through
 * storage and back. `role` is therefore the single difference between this
 * string and the one `legacySignatureProfile()` produces today. */
export const LEGACY_ARTIFACT_SIGNATURE_WITH_ROLE =
  '{"transforms":[{"type":"hardware-brightness","mixinId":"builtin:hardware-brightness","inputId":"pot0","mode":"multiply-output"}],'
  + '"inputs":[{"id":"pot0","name":"Front pot","pin":33,"signal":"analog","role":"brightness","smoothing":0.2,"fallback":0.5,"invert":false}],'
  + '"bindings":[{"id":"b1","patternId":"pat-line","inputId":"pot0","target":{"kind":"call-exported-slider","name":"sliderSpeed"}}],'
  + '"renderer":{"mapDim":2}}'

/** The Pattern the fixture signature was stored against. */
export const LEGACY_SIGNATURE_PATTERN_ID = 'pat-line'

/** The map dimension the fixture signature was stored under. */
export const LEGACY_SIGNATURE_MAP_DIM = 2 as const

/** The same profile the fixture signature describes, in the post-#772 model:
 * identical configuration, no `role`. Nothing here changes generated code
 * relative to the record above — that is the whole point of the comparison. */
export function legacySignatureProfile(): ControllerProfile {
  return {
    id: 'ctrl-1',
    name: 'Burner bag',
    board: { kind: 'pixelblaze-v3-standard' },
    inputs: [{
      id: 'pot0',
      name: 'Front pot',
      pin: 33,
      signal: 'analog',
      smoothing: 0.2,
      fallback: 0.5,
      invert: false,
    }],
    globalTransforms: [
      {
        id: 'hardware-brightness',
        type: 'hardware-brightness',
        enabled: true,
        mixinId: 'builtin:hardware-brightness',
        inputId: 'pot0',
        mode: 'multiply-output',
      },
      {
        id: 'power-cap',
        type: 'power-cap',
        enabled: false,
        mixinId: 'builtin:power-cap',
        mode: 'direct',
        maxDuty: 0.25,
      },
    ],
    keepPatternsUpToDate: true,
    patternBindings: [{
      id: 'b1',
      patternId: LEGACY_SIGNATURE_PATTERN_ID,
      inputId: 'pot0',
      target: { kind: 'call-exported-slider', name: 'sliderSpeed' },
    }],
    zones: [],
    updatedAt: 1,
  }
}

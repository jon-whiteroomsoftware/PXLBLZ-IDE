import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { LIBRARIES } from "@/pixelblaze/libs"
import { compileShow } from "@/engine/showCompiler"
import { prepareShowV2ForCompile } from "@/engine/showCompositionLoweringV2"
import { stockShowV2ById } from "@/pixelblaze/stock/showsV2"
import { nativeStockSourceLookupV2 } from "@/pixelblaze/stock/showsV2Compile"
import { createFastReplayRuntime } from "@/engine/fastReplay"
import { nativeDimension } from "@/engine/loadPattern"
import { captureShowStageEditV2 } from "@/engine/showPreparedStageV2"
import { resolveShowV2StageMap } from "@/store/showV2StageMap"

// #1138: every animated Clip Aperture property is hoisted into one per-pixel
// local instead of being inlined at each mask use site. Frames and persistent
// globals match the committed baseline exactly while the artifact shrinks.
// Totality@s sun section 2 spans two scene arms, so its pair assigns once per
// arm (two exclusive assignments, different scene time bases); every other
// pair assigns exactly once. Measured Totality/Black Sun deltas (4473/2653
// bytes) fall short of the brief@s 10k projection; reported, not adjusted.
const SHOW_IDS = [
  "stock-show-202-content-clip-viewport",
  "stock-show-reference-property-animation",
  "stock-show-installation-totality",
  "stock-show-installation-black-sun",
] as const

interface ApertureBaseline {
  bytes: number
  persistentGlobals: number
  durationMs: number
  times: number[]
  frames: Record<"fast" | "fidelity", Record<string, string>>
}

function loadApertureBaseline(): Record<string, ApertureBaseline> {
  const directory = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures")
  return JSON.parse(readFileSync(join(directory, "issue1138ApertureBaseline.json"), "utf8"))
}

function compileShowForApertureProof(id: string) {
  const record = stockShowV2ById(id)
  if (!record) throw new Error(`Missing stock Show ${id}`)
  const prepared = prepareShowV2ForCompile(record, nativeStockSourceLookupV2(record), { libraries: LIBRARIES })
  if (prepared.status !== "ready") throw new Error(`Stock Show ${id} failed preparation`)
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  const capture = captureShowStageEditV2(record, {
    patterns: [], libraries: [], maps: [], profiles: [],
    stageMap: resolveShowV2StageMap(record.stageMapId, []),
  })
  if (capture.prepared.status !== "ready") throw new Error(`Stock Show ${id} failed stage capture`)
  return { artifact, mapPoints: capture.prepared.bundle.presentation.layout.mapPoints }
}

function shaFrame(frame: Float64Array): string {
  return createHash("sha256").update(Buffer.from(frame.buffer, frame.byteOffset, frame.byteLength)).digest("hex")
}

describe.each(SHOW_IDS)("aperture evaluated once per pixel: %s", (id) => {
  it("matches baseline frames and globals with a smaller artifact", () => {
    const baseline = loadApertureBaseline()[id]
    const { artifact, mapPoints } = compileShowForApertureProof(id)
    expect(Buffer.byteLength(artifact.code, "utf8")).toBeLessThan(baseline.bytes)
    expect(artifact.summary.resources.persistentGlobals).toBe(baseline.persistentGlobals)
    for (const fidelity of ["fast", "fidelity"] as const) {
      for (const at of baseline.times) {
        const runtime = createFastReplayRuntime({
          code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata,
          dimension: nativeDimension(artifact.metadata.renderFns),
        }, { mapPoints, randomSeed: 7, fidelity })
        expect(shaFrame(runtime.advanceTo(at, { stepMs: 50 }).frame), `${id} ${fidelity} t=${at}`).toBe(baseline.frames[fidelity][String(at)])
      }
    }
    const assigns = [...artifact.code.matchAll(/var (__pxlblz_ap_[A-Za-z0-9_]+) = /g)].map((match) => match[1])
    expect(assigns.length, `${id} hoisted aperture count`).toBeGreaterThan(0)
    for (const name of new Set(assigns)) {
      expect(artifact.code.split(name).length - 1, `${id} ${name} use count`).toBeGreaterThanOrEqual(2)
    }
    for (const arm of artifact.code.split("__pxlblz_ab == ")) {
      const armAssigns = [...arm.matchAll(/var (__pxlblz_ap_[A-Za-z0-9_]+) = /g)].map((match) => match[1])
      expect(new Set(armAssigns).size, `${id} scene-arm assignment uniqueness`).toBe(armAssigns.length)
    }
  }, 240_000)
})

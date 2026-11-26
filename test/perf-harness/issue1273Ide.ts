// #1273 Q4. Production Save transport and write queue with the same bundling
// and overwrite options as reconciliation. The identical case forces a resend
// to measure firmware behavior even when reconciliation would skip that write.
// Run with controllerSaveViteRun.mjs and PIXELBLAZE_IP set to the bench.

import { createHash } from 'node:crypto'
import type { BindingStore } from '../../src/engine/controllerBinding'
import { queueControllerDeviceWrite } from '../../src/engine/controllerDeviceWriteQueue'
import type { ControllerPushRecords } from '../../src/engine/controllerPushRecord'
import { ExtensionControllerProvider } from '../../src/engine/ExtensionControllerProvider'
import { bundleWithPasses } from '../../src/engine/passEngine'
import { decodePbp } from '../../src/engine/pbpEncode'
import { pushPattern } from '../../src/engine/pushPattern'
import { nodeRelay } from './controllerNodeRelay'
import { assertBenchPixels, baselineIds, type ProbeSave, probePreview, runSurvival } from './issue1273'
import { assertProbeTarget } from './issue1273Core'

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

async function main() {
  const ip = process.env.PIXELBLAZE_IP
  const outIndex = process.argv.indexOf('--out')
  const out = outIndex === -1 ? undefined : process.argv[outIndex + 1]
  if (!ip || !out) throw new Error('Set PIXELBLAZE_IP and pass --out <path>')
  const previewImage = await probePreview()
  let bindings: BindingStore = {}
  let records: ControllerPushRecords = {}
  const started = performance.now()
  const at = () => Math.round(performance.now() - started)
  const log = (message: string) => console.error(`[${new Date().toISOString()}] ${message}`)
  const stampedAt = new Date().toISOString()
  const ids = baselineIds()

  const save: ProbeSave = async (id, name, source, requireExisting) => {
    assertProbeTarget(id, ids)
    const relay = nodeRelay(ip, { at, traceAt: at, log }, 1)
    const provider = new ExtensionControllerProvider({ transport: relay.transport, maxReconnectAttempts: 0 })
    try {
      await provider.connect({ address: ip })
      assertBenchPixels((await provider.getConfig()).pixelCount)
      const status = provider.getStatus()
      if (status.kind !== 'connected') throw new Error('Bench Controller is disconnected')

      let uploaded: Awaited<ReturnType<ProbeSave>> | undefined
      const saveProgram = provider.saveProgram.bind(provider)
      provider.saveProgram = async (blob, opts) => {
        assertProbeTarget(opts.id, ids)
        if (opts.id !== id) throw new Error(`Expected probe id ${id}, resolved ${opts.id}`)
        const decoded = decodePbp(blob)
        if (!decoded || decoded.name !== name) throw new Error(`Unexpected PBP for ${name}`)
        const result = await saveProgram(blob, opts)
        if (result !== 'confirmed') throw new Error(`Save of ${name} was ${result}`)
        uploaded = { blobBytes: blob.length, sha256: sha256(blob), bytecodeSha256: sha256(decoded.byteCode) }
        return result
      }
      const bundled = bundleWithPasses(source, {}, [{ id: 'renderer-adapter', kind: 'renderer-adapter', mapDim: 2 }])
      const result = await queueControllerDeviceWrite(ip, () => pushPattern({
        provider,
        controllerId: ip,
        patternId: name,
        source: bundled.code,
        name,
        persist: true,
        activateOnSave: false,
        requireExisting,
        previewImage,
        stampedAt,
        transforms: ['renderer-adapter'],
        loadBindings: async () => bindings,
        saveBindings: async (next) => { bindings = next },
        loadPushRecords: async () => records,
        savePushRecords: async (next) => { records = next },
        mintId: () => id,
        assertDeviceSession: () => {
          const current = provider.getStatus()
          if (current.kind !== 'connected' || current.connectionGeneration !== status.connectionGeneration) {
            throw new Error('Bench Controller session changed before Save')
          }
        },
      }))
      if (result.created === requireExisting || !uploaded) throw new Error(`Unexpected Save result for ${name}`)
      return uploaded
    } finally {
      await provider.disconnect()
      await relay.closeAll()
    }
  }

  await runSurvival(ip, out, 'ide', save)
}

await main()

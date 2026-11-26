// #1273 Q3/Q6. Observe the Controller's own UI on the active recording probe.
// Run once with --mode inspect and close it before the protocol read-back.
// Run again with --mode drag to exercise the live sliders.

import { readFileSync, writeFileSync } from 'node:fs'
import { chromium, expect } from '@playwright/test'
import { LABEL_PROBE_NAMES } from './issue1273Core'

const arg = (flag: string) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function main() {
  const mode = arg('--mode')
  const fixture = arg('--fixture')
  const screenshot = arg('--screenshot')
  const out = arg('--out')
  const ip = process.env.PIXELBLAZE_IP
  if (!fixture || !ip || !screenshot || !out || (mode !== 'inspect' && mode !== 'drag')) {
    throw new Error('Set PIXELBLAZE_IP and pass --mode inspect|drag --fixture <json> --screenshot <png> --out <json>')
  }
  const { id, name, ip: fixtureIp } = JSON.parse(readFileSync(fixture, 'utf8')) as {
    id: string; name: string; ip: string
  }
  if (fixtureIp !== ip || name !== 'zz-1273-sliders' || !/^pxb[A-Za-z0-9]+$/.test(id)) {
    throw new Error('Expected the recording probe for this Controller')
  }

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const outgoing: Record<string, unknown>[] = []
    let controlNames: string[] = []
    let connections = 0
    let socketClosed = false
    await page.routeWebSocket(`ws://${ip}:81/`, (socket) => {
      connections += 1
      if (connections !== 1) {
        socket.close({ code: 1000, reason: 'Probe permits one connection' })
        return
      }
      const server = socket.connectToServer()
      server.onClose((code, reason) => {
        socketClosed = true
        socket.close({ code, reason })
      })
      socket.onMessage((payload) => {
        if (typeof payload === 'string') outgoing.push(JSON.parse(payload) as Record<string, unknown>)
        server.send(payload)
      })
      server.onMessage((payload) => {
        socket.send(payload)
        if (typeof payload !== 'string') return
        const { activeProgram } = JSON.parse(payload) as {
          activeProgram?: { activeProgramId?: string; controls?: Record<string, number> }
        }
        if (activeProgram?.activeProgramId === id && activeProgram.controls) {
          controlNames = Object.keys(activeProgram.controls)
        }
      })
    })
    const response = await page.goto(`http://${ip}/`, { timeout: 15_000 })
    if (!response?.ok()) throw new Error(`Controller web UI returned ${response?.status()}`)
    await expect(page.locator('#canvasTitle')).toHaveText(name, { timeout: 15_000 })
    await expect(page.locator(`#programList-${id}`)).toHaveClass(/\brunning\b/, { timeout: 15_000 })
    // Clicking a program row saves the startup selection on firmware 3.70.
    // The runner has already activated the probe without saving that setting.
    const sliders = page.locator('#headerControls input[type=range]')
    await expect(sliders).toHaveCount(LABEL_PROBE_NAMES.length, { timeout: 10_000 })
    if (LABEL_PROBE_NAMES.some((key) => !controlNames.includes(key))) {
      throw new Error(`Unexpected controls for the active probe: ${controlNames.join(', ')}`)
    }

    const read = async () => {
      const rows = await sliders.evaluateAll((inputs: HTMLInputElement[]) => inputs.map((input) => ({
        label: input.closest('label')?.textContent?.trim(),
        position: Number(input.value),
      })))
      return rows.map((row, i) => ({ name: controlNames[i], ...row }))
    }
    const before = await read()
    if (mode === 'drag') {
      const targets = [0.2, 0.35, 0.5, 0.65, 0.8]
      for (const [i, target] of targets.entries()) {
        const slider = sliders.nth(i)
        const box = await slider.boundingBox()
        if (!box) throw new Error(`Slider ${before[i].name} is hidden`)
        const x = (fraction: number) => box.x + 8 + (box.width - 16) * fraction
        const y = box.y + box.height / 2
        await page.mouse.move(x(before[i].position), y)
        await page.mouse.down()
        await page.mouse.move(x(target), y, { steps: 6 })
        await page.mouse.up()
      }
      // Wait for the firmware UI's throttled live write and debounced Save.
      await expect.poll(() => outgoing.some((frame) => frame.setControls && frame.save === true), {
        timeout: 5000,
      }).toBe(true)
    }
    if (socketClosed || connections !== 1) throw new Error('Controller web UI lost its socket; stopping')
    if (mode === 'inspect' && outgoing.some((frame) => frame.setControls)) {
      throw new Error('Controller web UI tried to set controls during untouched capture')
    }
    await page.screenshot({ path: screenshot })
    writeFileSync(out, JSON.stringify({
      id, mode, before, after: await read(), outgoing: outgoing.filter((frame) => frame.setControls),
    }, null, 2))
  } finally {
    await browser.close()
  }
}

await main()

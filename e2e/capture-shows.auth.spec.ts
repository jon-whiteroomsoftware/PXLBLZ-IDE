import { mkdirSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { captureScenario, type CaptureScenario } from '@whiteroom/software-process/capture-scenario'
import { test, expect } from './fixtures/authenticated'
import { installFakeControllers } from './fixtures/fakeControllerHelper'
import { captureControllers, createShowsCaptureAdapter, ensureCaptureControllers, showsCaptureRoute } from './fixtures/showsCapture'

const outputDirectory = process.env.PXLBLZ_CAPTURE_OUTPUT
const scenarios = [
  { width: 1440, height: 900, count: 1 },
  { width: 1180, height: 800, count: 3 },
  { width: 390, height: 844, count: 3 },
]
function scenario(width: number, height: number, count: number): CaptureScenario {
  return { name: `shows-${width}-${count}-controllers`, route: showsCaptureRoute,
    authenticationFixture: 'authenticated-playwright-worker', viewport: { width, height },
    expectedDeviceCount: count, readiness: ['Shows editor', 'live Controllers'],
    operation: `Inspect Shows with ${count} distinct Controllers at ${width}px`, issue: '#969' }
}
for (const { width, height, count } of scenarios) {
  test(`capture authenticated Shows ${width}px / ${count} Controllers (#969)`, async ({ page }) => {
    test.skip(!outputDirectory, 'Set PXLBLZ_CAPTURE_OUTPUT to an existing external directory; capture requires committed clean source.')
    const adapter = await createShowsCaptureAdapter(page, count)
    const result = await captureScenario({ repository: process.cwd(), outputDirectory: outputDirectory!, scenario: scenario(width, height, count), adapter })
    console.log(`CAPTURE_PACKAGE ${result.directory}`)
  })
}

test('scenario restores distinct Controllers after reload and preserves them through SPA navigation (#969)', async ({ page }) => {
  test.setTimeout(60_000)
  const adapter = await createShowsCaptureAdapter(page, 3)
  const definition = scenario(1180, 800, 3)
  await adapter.prepare(definition)
  await expect.poll(async () => (await adapter.observe(definition)).deviceIds.length).toBe(3)
  const initial = await adapter.observe(definition)
  expect(new Set(initial.deviceIds).size).toBe(3)
  await page.getByRole('button', { name: 'Shows', exact: true }).click()
  await page.getByRole('option', { name: /^Controllers/ }).click()
  await expect(page.getByTestId('controller-pill')).toHaveCount(3)
  await page.goto(showsCaptureRoute)
  await ensureCaptureControllers(page, 3)
  await page.reload()
  await ensureCaptureControllers(page, 3)
  await expect.poll(async () => [...(await adapter.observe(definition)).deviceIds].sort()).toEqual([...initial.deviceIds].sort())
})

test('wrong authentication and device count refuse real-browser capture without proof (#969)', async ({ page }, testInfo) => {
  test.skip(!outputDirectory, 'Refusal exercise requires clean committed capture source.')
  const adapter = await createShowsCaptureAdapter(page, 1)
  const definition = scenario(1440, 900, 1)
  const failedOutput = resolve(outputDirectory!, `refusals-${testInfo.workerIndex}`)
  mkdirSync(failedOutput, { recursive: true })
  await expect(captureScenario({ repository: process.cwd(), outputDirectory: failedOutput, scenario: { ...definition, expectedDeviceCount: 3 }, adapter })).rejects.toThrow('device count')
  await page.context().clearCookies()
  const signedOut = { ...adapter, prepare: async () => { await page.goto(showsCaptureRoute) } }
  await expect(captureScenario({ repository: process.cwd(), outputDirectory: failedOutput, scenario: definition, adapter: signedOut })).rejects.toThrow('signed out')
  expect(readdirSync(failedOutput)).toEqual([])
})


test('address-scoped helpers answer map and compile once and preserve connection routing (#969)', async ({ page }) => {
  await installFakeControllers(page, captureControllers.slice(0, 2))
  await page.goto(showsCaptureRoute)
  const replies = await page.evaluate(async () => {
    const messages: Array<Record<string, unknown>> = []
    const prefix = 'scope-regression-'
    return await new Promise<Array<Record<string, unknown>>>((resolve) => {
      const receive = (event: MessageEvent) => {
        if (event.source !== window) return
        const message = event.data
        if (message?.barrier === 1) window.postMessage({ barrier: 2 }, location.origin)
        if (message?.barrier === 2) {
          window.removeEventListener('message', receive)
          resolve(messages)
        }
        if (message?.dir === 'from-helper'
          && (String(message.reqId).startsWith(prefix) || String(message.connId).startsWith(prefix))) messages.push(message)
      }
      window.addEventListener('message', receive)
      const post = (message: Record<string, unknown>) => window.postMessage({ source: 'pblz-relay', dir: 'to-helper', ...message }, location.origin)
      for (const [index, address] of ['192.168.8.221', '192.168.8.222', '192.168.8.250'].entries()) {
        post({ type: 'get-map', reqId: `${prefix}map-${index}`, address })
        post({ type: 'compile', reqId: `${prefix}compile-${index}`, address, patternSrc: 'export function render(index) {}' })
      }
      post({ type: 'connect', connId: `${prefix}connection`, url: 'ws://192.168.8.221:81' })
      post({ type: 'send', connId: `${prefix}connection`, payload: { text: '{"ping":true}' } })
      post({ type: 'send', connId: `${prefix}unknown`, payload: { text: '{"ping":true}' } })
      // Request handlers queue replies in microtasks. This second message turn
      // follows their replies, so duplicate or wrongly addressed replies count.
      window.postMessage({ barrier: 1 }, location.origin)
    })
  })
  expect(replies.filter((reply) => reply.type === 'map-data').map((reply) => reply.reqId).sort())
    .toEqual(['scope-regression-map-0', 'scope-regression-map-1'])
  expect(replies.filter((reply) => reply.type === 'compile-result').map((reply) => reply.reqId).sort())
    .toEqual(['scope-regression-compile-0', 'scope-regression-compile-1'])
  expect(replies.filter((reply) => reply.type === 'open')).toHaveLength(1)
  expect(replies.filter((reply) => reply.type === 'message')).toEqual([
    expect.objectContaining({ connId: 'scope-regression-connection', payload: { text: '{"ack":1}' } }),
  ])
})

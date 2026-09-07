import { mkdirSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { captureScenario, type CaptureScenario } from '@whiteroom/software-process/capture-scenario'
import { test, expect } from './fixtures/authenticated'
import { createShowsCaptureAdapter, ensureCaptureControllers, showsCaptureRoute } from './fixtures/showsCapture'

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

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from './fixtures/authenticated'

const refreshScreenshots = process.env.UPDATE_DOC_SCREENSHOTS === '1'
const setupPath = resolve('docs/screenshots/agent-drawer-mcp-setup.png')
const startPath = resolve('docs/screenshots/agent-drawer-start.png')

test.use({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })

test('regenerates the Agent drawer docs screenshots from the current Show UI (#989)', async ({ page }) => {
  test.skip(!refreshScreenshots, 'Run npm run docs:screenshots:agent-drawer to refresh the committed drawer assets.')
  test.setTimeout(90_000)

  await page.route('**/api/me', async (route) => {
    const response = await route.fetch()
    const session = await response.json()
    if (!session.agentCapabilities?.endpoint) {
      await route.fulfill({ response })
      return
    }
    await route.fulfill({
      response,
      json: {
        ...session,
        agentCapabilities: {
          ...session.agentCapabilities,
          endpoint: 'https://pxlblz-ide.whiteroomsoftware.com/mcp',
        },
      },
    })
  })

  await page.goto('studio/shows/stock-show-showcase-redline-installation')
  await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()

  const edge = page.getByRole('button', { name: /^Open the Agent drawer/ })
  await edge.focus()
  await edge.press('Enter')
  const drawer = page.getByRole('complementary', { name: 'Agent drawer', exact: true })
  await expect(drawer.getByText('Use the Pixelblaze agent')).toBeVisible()
  const activity = drawer.getByTestId('agent-chat-log')
  const nothingYet = activity.getByText('Nothing yet.')
  await expect(nothingYet).toBeVisible()
  const startEnd = await nothingYet.boundingBox()
  expect(startEnd).not.toBeNull()

  await drawer.getByRole('button', { name: 'Connect your agent with MCP' }).click()
  await expect(drawer.getByRole('heading', { name: 'Connect your agent with MCP' })).toBeVisible()
  for (const step of ['Add the endpoint', 'Authorize access', 'Connect this Show']) {
    await expect(drawer.getByText(step, { exact: false }).first()).toBeVisible()
  }
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await expect(nothingYet).toBeVisible()
  const setupEnd = await nothingYet.boundingBox()
  const box = await drawer.boundingBox()
  expect(box).not.toBeNull()
  expect(setupEnd).not.toBeNull()
  const x = Math.floor(Math.max(0, box!.x - 24))
  const clip = {
    x,
    y: 0,
    width: 1600 - x,
    height: Math.ceil(Math.max(startEnd!.y + startEnd!.height, setupEnd!.y + setupEnd!.height) + 32),
  }
  await expect(drawer).not.toContainText(/unavailable/i)
  await expect(activity).not.toContainText(/unavailable/i)
  await expect(drawer).toContainText('claude mcp add --transport http pxlblz https://pxlblz-ide.whiteroomsoftware.com/mcp')
  await expect(drawer).not.toContainText('localhost')
  await page.screenshot({ path: setupPath, clip, animations: 'disabled' })
  await expectPngWidth(setupPath, 728)

  await drawer.getByRole('button', { name: 'Back' }).click()
  await expect(drawer.getByText('Use the Pixelblaze agent')).toBeVisible()
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await expect(nothingYet).toBeVisible()
  await expect(drawer).not.toContainText(/unavailable/i)
  await expect(activity).not.toContainText(/unavailable/i)
  await page.screenshot({ path: startPath, clip, animations: 'disabled' })
  await expectPngWidth(startPath, 728)
})

async function expectPngWidth(path: string, width: number): Promise<void> {
  const png = await readFile(path)
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(png.readUInt32BE(16)).toBe(width)
}

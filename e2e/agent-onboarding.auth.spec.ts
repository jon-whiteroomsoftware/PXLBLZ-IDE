import { expect, test } from './fixtures/authenticated'
import { squareWorkspaceShow } from './fixtures/showWorkspace'

test('offers client-specific MCP setup on an ordinary editable Show URL at desktop and narrow widths (#1050)', async ({ page }) => {
  test.setTimeout(90_000)
  const show = { ...squareWorkspaceShow(1), id: 'agent-onboarding-1050', name: 'MCP onboarding proof' }
  const created = await page.request.post('/api/shows', { data: show })
  expect(created.ok(), await created.text()).toBe(true)

  await page.addInitScript(() => {
    let clipboard = ''
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => { clipboard = value },
        readText: async () => clipboard,
      },
    })
  })

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`studio/shows/${show.id}`)
  expect(new URL(page.url()).search).toBe('')

  const edge = page.getByRole('button', { name: /^Open the Agent drawer/ })
  await expect(edge).toBeVisible()
  await edge.focus()
  await edge.press('Enter')

  const external = page.getByRole('button', { name: 'Connect your agent with MCP' })
  await expect(external).toBeVisible()
  await external.click()

  const drawer = page.getByRole('complementary', { name: 'Agent drawer', exact: true })
  await expect(drawer.getByRole('heading', { name: 'Connect your agent with MCP' })).toBeVisible()
  await expect(drawer.getByText(`${new URL(page.url()).origin}/mcp`, { exact: true })).toBeVisible()
  await expect(drawer.getByText('Click Ready to connect and tell your agent “Connect to my Show in PXLBLZ.”')).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Copy endpoint' })).toBeVisible()
  await expect(drawer.getByText('Your client opens a browser tab for PXLBLZ sign-in and consent. The consent page shows your account and the application name.')).toBeVisible()

  const endpoint = `${new URL(page.url()).origin}/mcp`
  const options = [
    { name: 'Claude Code', instruction: `claude mcp add --transport http pxlblz ${endpoint}`, copy: 'Copy Claude Code command', clipboard: `claude mcp add --transport http pxlblz ${endpoint}`, status: 'Claude Code command copied' },
    { name: 'Codex', instruction: `codex mcp add pxlblz --url ${endpoint}`, copy: 'Copy Codex command', clipboard: `codex mcp add pxlblz --url ${endpoint}`, status: 'Codex command copied' },
    { name: 'Claude.ai', instruction: 'Customize → Connectors → + → Add custom connector → paste the endpoint', copy: 'Copy endpoint for Claude.ai', clipboard: endpoint, status: 'Endpoint copied' },
    { name: 'Other', instruction: null, copy: 'Copy endpoint', clipboard: endpoint, status: 'Endpoint copied' },
  ] as const

  const overflow = () => page.evaluate(() => {
    const root = document.documentElement
    return [root.scrollWidth - root.clientWidth, root.scrollHeight - root.clientHeight]
  })
  const viewports = [
    { name: 'desktop', width: 1280, height: 720, closesDrawer: false },
    { name: '760', width: 760, height: 720, closesDrawer: true },
    { name: '390', width: 390, height: 844, closesDrawer: false },
  ]
  const drawerLayout = page.getByTestId('agent-drawer-layout')
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.waitForFunction(width => document.documentElement.clientWidth === width, viewport.width)
    if (viewport.closesDrawer) {
      await expect(drawerLayout).toHaveAttribute('data-drawer-mode', 'tucked')
      await expect(drawer).toBeHidden()
      await edge.focus()
      await edge.press('Enter')
    }
    await expect(drawerLayout).toHaveAttribute('data-drawer-mode', 'open')
    await expect(drawer).toBeVisible()
    for (const option of options) {
      const picker = drawer.getByRole('radio', { name: option.name })
      await picker.click()
      await expect(picker).toHaveAttribute('aria-checked', 'true')
      await expect(drawer.getByText(endpoint, { exact: true })).toBeVisible()
      if (option.instruction) await expect(drawer.getByTestId('agent-client-instruction')).toContainText(option.instruction)
      else await expect(drawer.getByTestId('agent-client-instruction')).toHaveCount(0)
      await drawer.getByRole('button', { name: option.copy }).click()
      await expect(drawer.locator('[role="status"]').filter({ hasText: option.status })).toBeVisible()
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(option.clipboard)
      await expect.poll(overflow).toEqual([0, 0])
      await expect(picker).toBeInViewport()
      await expect(drawer.getByRole('button', { name: option.copy })).toBeInViewport()
    }
  }

  const other = drawer.getByRole('radio', { name: 'Other' })
  await other.focus()
  await other.press('ArrowRight')
  await expect(drawer.getByRole('radio', { name: 'Claude Code' })).toBeFocused()
  await expect(drawer.getByRole('radio', { name: 'Claude Code' })).toHaveAttribute('aria-checked', 'true')

  const ready = drawer.getByRole('button', { name: 'Ready to connect' })
  await ready.focus()
  await ready.press('Enter')
  await expect(drawer.getByRole('button', { name: 'Cancel connection attempt' })).toBeFocused()
  await expect(drawer.getByText('Waiting for your agent to connect. This attempt stays open for two minutes for you, thirty seconds for an incoming call.')).toBeVisible()
  await drawer.getByRole('button', { name: 'Cancel connection attempt' }).press('Enter')
  await expect(ready).toBeFocused()
  await expect.poll(overflow).toEqual([0, 0])
  await expect.poll(async () => (await drawer.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0)
  await expect.poll(async () => {
    const bounds = await drawer.boundingBox()
    return bounds ? bounds.x + bounds.width : Number.POSITIVE_INFINITY
  }).toBeLessThanOrEqual(390)
  await expect(drawer.getByRole('button', { name: 'Ready to connect' })).toBeVisible()
})

test('opens the Agent Authoring Reference from the Feature Guide inside Docs (#1050)', async ({ page }, testInfo) => {
  await page.goto('docs/feature-guide')
  const reader = page.getByTestId('docs-reader')
  const link = reader.getByRole('link', { name: 'versioned Clip and Layer reference' })
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(/\/docs\/agent-authoring-reference$/)
  await expect(page.getByTestId('docs-reader')).toContainText('Agent Clip and Layer authoring')
  await expect(page.getByTestId('docs-catalog').getByRole('link', { name: /Agent Authoring Reference/ })).toHaveAttribute('aria-current', 'page')
  await testInfo.attach('agent-authoring-reference-docs-route', { body: await page.screenshot(), contentType: 'image/png' })
})

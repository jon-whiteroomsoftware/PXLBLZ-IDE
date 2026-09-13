import { expect, test } from './fixtures/authenticated'
import { squareWorkspaceShow } from './fixtures/showWorkspace'

test('offers external MCP on an ordinary editable Show URL at desktop and narrow widths (#1009)', async ({ page }, testInfo) => {
  const show = { ...squareWorkspaceShow(1), id: 'agent-onboarding-1009', name: 'MCP onboarding proof' }
  const created = await page.request.post('/api/shows', { data: show })
  expect(created.ok(), await created.text()).toBe(true)

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(`studio/shows/${show.id}`)
  expect(new URL(page.url()).search).toBe('')

  const edge = page.getByRole('button', { name: /^Open the Agent drawer/ })
  await expect(edge).toBeVisible()
  await edge.focus()
  await edge.press('Enter')

  await expect(page.getByRole('button', { name: 'Use the Pixelblaze agent' })).toHaveCount(0)
  const external = page.getByRole('button', { name: 'Connect your agent with MCP' })
  await expect(external).toBeVisible()
  await external.click()

  const drawer = page.getByRole('complementary', { name: 'Agent drawer', exact: true })
  await expect(drawer.getByRole('heading', { name: 'Connect your agent with MCP' })).toBeVisible()
  await expect(drawer.getByText(`${new URL(page.url()).origin}/mcp`)).toBeVisible()
  await expect(drawer.getByText('Click Ready to connect and tell your agent “Connect to my Show in PXLBLZ.”')).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Copy endpoint' })).toBeVisible()

  const ready = drawer.getByRole('button', { name: 'Ready to connect' })
  await ready.focus()
  await ready.press('Enter')
  await expect(drawer.getByRole('button', { name: 'Cancel connection attempt' })).toBeFocused()
  await expect(drawer.getByText('Waiting for your agent to connect. This attempt expires in two minutes.')).toBeVisible()
  await drawer.getByRole('button', { name: 'Cancel connection attempt' }).press('Enter')
  await expect(ready).toBeFocused()

  const overflow = () => page.evaluate(() => {
    const root = document.documentElement
    return [root.scrollWidth - root.clientWidth, root.scrollHeight - root.clientHeight]
  })
  await expect.poll(overflow).toEqual([0, 0])
  await testInfo.attach('mcp-onboarding-desktop', { body: await page.screenshot(), contentType: 'image/png' })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(drawer).toBeHidden()
  await edge.focus()
  await edge.press('Enter')
  await expect(drawer).toBeVisible()
  await expect.poll(overflow).toEqual([0, 0])
  await expect.poll(async () => (await drawer.boundingBox())?.x ?? -1).toBeGreaterThanOrEqual(0)
  await expect.poll(async () => {
    const bounds = await drawer.boundingBox()
    return bounds ? bounds.x + bounds.width : Number.POSITIVE_INFINITY
  }).toBeLessThanOrEqual(390)
  await expect(drawer.getByRole('button', { name: 'Ready to connect' })).toBeVisible()
  await testInfo.attach('mcp-onboarding-narrow', { body: await page.screenshot(), contentType: 'image/png' })
})

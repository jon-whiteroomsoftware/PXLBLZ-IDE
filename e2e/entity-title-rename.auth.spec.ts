import { expect, test } from './fixtures/authenticated'
import { installFakeControllerHelper } from './fixtures/fakeControllerHelper'

test('authenticated Studio renames a Pattern from the middle-pane title', async ({ page }) => {
  await page.goto('studio/patterns')

  await expect(page.getByRole('button', { name: /Account menu for playwright-worker-\d+/i })).toBeVisible()
  // The rail hamburger became an add menu in 58e1a83 (#63); New pattern is a
  // menu item now, exactly as New show is in the Shows rail.
  await page.getByRole('button', { name: 'Add pattern' }).click()
  await page.getByRole('button', { name: 'New pattern' }).click()
  await expect(page).toHaveURL(/\/studio\/patterns\/[a-z0-9-]+$/)

  const title = page.getByRole('button', { name: /Rename pattern Untitled Pattern/i })
  await title.click()
  await page.getByRole('textbox', { name: 'Pattern name' }).fill('Header Renamed Pattern')
  await page.getByRole('button', { name: 'Apply pattern name' }).click()

  await expect(page.getByRole('button', { name: 'Rename pattern Header Renamed Pattern' })).toBeVisible()
  await expect.poll(async () => {
    const response = await page.context().request.get('/api/patterns')
    if (!response.ok()) return false
    const { patterns } = await response.json() as { patterns: Array<{ name: string }> }
    return patterns.some((pattern) => pattern.name === 'Header Renamed Pattern')
  }).toBe(true)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Rename pattern Header Renamed Pattern' })).toBeVisible()

  await page.setViewportSize({ width: 640, height: 900 })
  await expect(page.getByRole('button', { name: 'Rename pattern Header Renamed Pattern' })).toBeVisible()
})

test('authenticated Studio renames the live Controller from its header and rail', async ({ page }) => {
  const id = `controller-title-rename-${Date.now()}`
  const originalName = `Bench ${Date.now()}`
  const headerName = `${originalName} Header`
  const railName = `${originalName} Rail`
  const controllerIp = '192.168.8.224'
  const deviceId = 'pixelblaze_pb32_665544332211'
  const request = page.context().request
  const created = await request.post('/api/controllers', {
    data: {
      id,
      name: originalName,
      deviceId,
      lastKnownDeviceName: originalName,
      lastSeenIp: controllerIp,
      board: { kind: 'pixelblaze-v3-standard' },
      inputs: [],
      globalTransforms: [],
      patternBindings: [],
      zones: [],
      updatedAt: Date.now(),
    },
  })
  expect(created.ok()).toBe(true)

  try {
    await installFakeControllerHelper(page, {
      programs: [{ id: 'RENAMEPROGRAM0001', name: 'Rename fixture' }],
      activeProgramId: 'RENAMEPROGRAM0001',
      deviceName: originalName,
      boardType: 'pb32',
      mac: '11:22:33:44:55:66',
      pixelCount: 64,
    })
    await page.goto(`studio/controllers/${id}`)
    await expect(page.getByRole('button', { name: `Rename controller ${originalName}` })).toHaveCount(0)
    await page.getByRole('button', { name: 'Connect a Controller' }).click()
    await page.getByRole('textbox', { name: 'Controller IP address' }).fill(controllerIp)
    await page.getByTestId('controller-go').click()
    await expect(page.getByTestId('controller-pill')).toHaveAttribute('data-phase', 'live')

    await page.getByRole('button', { name: `Rename controller ${originalName}` }).click()
    await page.getByRole('textbox', { name: 'Controller name' }).fill(headerName)
    await page.getByRole('textbox', { name: 'Controller name' }).press('Enter')
    await expect(page.getByRole('button', { name: `Rename controller ${headerName}` })).toBeVisible()
    await expect.poll(() => page.evaluate((name) => {
      const writes = (window as typeof window & {
        __fakeControllerWrites?: Array<Record<string, unknown>>
      }).__fakeControllerWrites ?? []
      return writes.filter((write) => write.name === name).length
    }, headerName)).toBe(1)

    await page.reload()
    await expect(page.getByTestId('controller-pill')).toHaveAttribute('data-phase', 'live')
    await expect(page.getByRole('button', { name: `Rename controller ${headerName}` })).toBeVisible()

    await page.getByRole('treeitem', { name: headerName }).hover()
    await page.getByRole('button', { name: `More actions for ${headerName}` }).click()
    await page.getByRole('button', { name: 'Rename', exact: true }).click()
    await page.getByRole('textbox', { name: 'Rename item' }).fill(railName)
    await page.getByRole('textbox', { name: 'Rename item' }).press('Enter')

    await expect.poll(async () => {
      const response = await request.get('/api/controllers')
      if (!response.ok()) return false
      const { controllers } = await response.json() as { controllers: Array<{ id: string; name: string }> }
      return controllers.some((controller) => controller.id === id && controller.name === railName)
    }).toBe(true)
    await expect.poll(() => page.evaluate((name) => {
      const writes = (window as typeof window & {
        __fakeControllerWrites?: Array<Record<string, unknown>>
      }).__fakeControllerWrites ?? []
      return writes.some((write) => write.name === name)
    }, railName)).toBe(true)

    await page.reload()
    await expect(page.getByTestId('controller-pill')).toHaveAttribute('data-phase', 'live')
    await expect(page.getByRole('button', { name: `Rename controller ${railName}` })).toBeVisible()
  } finally {
    await request.delete(`/api/controllers/${encodeURIComponent(id)}`)
  }
})

test('authenticated Studio renames a Library from the middle-pane title with Apply and Enter', async ({ page }) => {
  const id = `library-title-rename-${Date.now()}`
  const originalName = `LaunchLib${Date.now()}`
  const firstName = `${originalName}Enter`
  const finalName = `${originalName}Apply`
  const request = page.context().request
  const created = await request.post('/api/libraries', {
    data: { id, name: originalName, src: 'function helper(v) { return v }', updatedAt: Date.now() },
  })
  expect(created.ok()).toBe(true)

  try {
    await page.goto(`studio/libraries/${id}`)
    await page.getByRole('button', { name: `Rename library ${originalName}` }).click()
    await page.getByRole('textbox', { name: 'Library name' }).fill(firstName)
    await page.getByRole('textbox', { name: 'Library name' }).press('Enter')
    await expect(page.getByRole('button', { name: `Rename library ${firstName}` })).toBeVisible()

    await page.getByRole('button', { name: `Rename library ${firstName}` }).click()
    await page.getByRole('textbox', { name: 'Library name' }).fill(finalName)
    await page.getByRole('button', { name: 'Apply library name' }).click()
    await expect.poll(async () => {
      const response = await request.get('/api/libraries')
      if (!response.ok()) return false
      const { libraries } = await response.json() as { libraries: Array<{ id: string; name: string }> }
      return libraries.some((library) => library.id === id && library.name === finalName)
    }).toBe(true)

    await page.reload()
    await expect(page.getByRole('button', { name: `Rename library ${finalName}` })).toBeVisible()
  } finally {
    await request.delete(`/api/libraries/${encodeURIComponent(id)}`)
  }
})

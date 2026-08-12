import { expect, showtimePath, test } from './fixtures/authenticated'
import { installFakeControllerHelper } from './fixtures/fakeControllerHelper'
import { controllerProfileArtifactSignature } from '../src/engine/controllerProfilePassRecipe'
import { artifactHash } from '../src/engine/artifactStamp'
import type { ControllerProfile } from '../src/engine/controllerProfile'

test('gates functional Show access behind the showtime query parameter', async ({ page }) => {
  await page.goto('studio')

  await expect(page.getByRole('radio', { name: 'Shows' })).toHaveCount(0)

  await page.goto('studio/shows/stock-show-101-clips-cuts-blank-time')

  await expect(page).toHaveURL(/\/studio\/patterns$/)
  await expect(page.getByRole('radio', { name: 'Shows' })).toHaveCount(0)

  await page.goto(showtimePath('studio/shows/stock-show-101-clips-cuts-blank-time'))

  await expect(page).toHaveURL(/\/studio\/shows\/stock-show-101-clips-cuts-blank-time\?showtime$/)
  await expect(page.getByRole('radio', { name: 'Shows' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
})

test('authenticated Studio creates, renames, and reloads a persisted Show', async ({ page }) => {
  await page.goto(showtimePath('studio/shows'))

  await expect(page.getByRole('button', { name: /Account menu for playwright-worker-\d+/i })).toBeVisible()
  await page.getByRole('button', { name: 'Add show' }).click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+\?showtime$/)

  await page.getByRole('button', { name: 'Rename show Untitled Show' }).click()
  await page.getByRole('textbox', { name: 'Show name' }).fill('Opening')
  await page.getByRole('textbox', { name: 'Show name' }).press('Enter')
  await expect.poll(async () => {
    const response = await page.context().request.get('/api/shows')
    if (!response.ok()) return false
    const { shows } = await response.json() as {
      shows: Array<{ name: string }>
    }
    return shows.some((show) => show.name === 'Opening')
  }).toBe(true)

  await page.reload()

  await expect(page.getByRole('button', { name: 'Rename show Opening' })).toBeVisible()
})

test('shared Studio chrome remains legible, dense, and reachable across routes (#479)', async ({ page }) => {
  const routes = [
    { path: 'studio/patterns/IridescentFibers', activity: 'Patterns', heading: 'Patterns' },
    { path: 'studio/maps/plane', activity: 'Maps', heading: 'Maps' },
    { path: 'studio/libraries/Shader', activity: 'Libraries', heading: 'Libraries' },
    { path: 'studio/controllers', activity: 'Controllers', heading: 'Controllers' },
    { path: showtimePath('studio/shows/stock-show-101-clips-cuts-blank-time'), activity: 'Shows', heading: 'Shows' },
  ] as const

  for (const viewport of [{ width: 1440, height: 900 }, { width: 720, height: 720 }]) {
    await page.setViewportSize(viewport)
    for (const route of routes) {
      await page.goto(route.path)

      const activity = page.getByRole('radio', { name: route.activity })
      await expect(activity).toHaveAttribute('aria-checked', 'true')
      await activity.focus()
      await expect(activity).toBeFocused()

      const heading = page.getByRole('heading', { name: route.heading, exact: true }).first()
      await expect(heading).toHaveClass(/text-\[13px\]/)
      await expect(heading).toHaveClass(/text-zinc-200/)
      await expect.poll(
        () => page.evaluate(() => document.documentElement.scrollWidth),
        `${route.path} at ${viewport.width}px should not create document-level horizontal overflow`,
      ).toBeLessThanOrEqual(viewport.width + 1)
    }
  }

  await page.goto('studio/patterns/IridescentFibers')
  await page.getByRole('button', { name: 'Collapse rail' }).click()
  await expect(page.getByRole('button', { name: 'Expand library' })).toBeVisible()
  expect(await page.locator('[aria-label="Studio activity"]').evaluate((element) => element.getBoundingClientRect().width))
    .toBe(46)
})

test('empty Controllers workspace leads through extension setup and Connect (#811)', async ({ page }) => {
  await page.goto('studio/controllers')

  const emptyState = page.getByTestId('controller-profiles-empty-state')
  await expect(emptyState.getByRole('heading', { name: 'Connect your Controllers.' })).toBeVisible()
  await expect(emptyState.getByRole('link', { name: 'Install Chrome extension' })).toHaveAttribute(
    'href',
    'https://chromewebstore.google.com/detail/pxlblz-ide-controller-hel/hjdkmngopeofakdbjfkaomcmgkcidoeg',
  )
  await expect(emptyState).toContainText("approve Chrome's install and Controller access prompts")

  for (const viewport of [{ width: 1440, height: 900 }, { width: 430, height: 780 }]) {
    await page.setViewportSize(viewport)
    await expect.poll(
      () => page.evaluate(() => document.documentElement.scrollWidth),
      `Controllers empty state at ${viewport.width}px should not create horizontal overflow`,
    ).toBeLessThanOrEqual(viewport.width + 1)
    await expect(emptyState.getByRole('link', { name: 'Install Chrome extension' })).toBeVisible()
  }

  await installFakeControllerHelper(page, {
    programs: [],
    activeProgramId: 'none',
    deviceName: 'Bench',
    boardType: 'standard',
    mac: 'AA:BB:CC:DD:EE:FF',
    pixelCount: 64,
  })
  await page.reload()

  await expect(emptyState.getByRole('heading', {
    name: 'Connect a Controller to create its profile.',
  })).toBeVisible()
  await emptyState.getByRole('button', { name: 'Connect a Controller' }).click()
  await expect(page.getByRole('textbox', { name: 'Controller IP address' })).toBeVisible()
})

test('keeps the Shows header inside the center editor pane (#758)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(showtimePath('studio/shows/stock-show-101-clips-cuts-blank-time'))

  const geometry = await page.locator('.show-pane-header').evaluate((header) => {
    const editor = header.closest('[data-testid="editor-pane"]')
    const preview = document.querySelector('[data-testid="preview-pane"]')
    if (!editor || !preview) return null

    const headerBounds = header.getBoundingClientRect()
    const editorBounds = editor.getBoundingClientRect()
    const previewBounds = preview.getBoundingClientRect()
    return {
      editorWidth: editorBounds.width,
      headerRight: Math.round(headerBounds.right),
      editorRight: Math.round(editorBounds.right),
      previewLeft: Math.round(previewBounds.left),
    }
  })

  expect(geometry).not.toBeNull()
  expect(geometry!.editorWidth).toBeGreaterThan(0)
  expect(geometry!.headerRight).toBe(geometry!.editorRight)
  expect(geometry!.headerRight).toBeLessThanOrEqual(geometry!.previewLeft)
})

test('Studio authoring keeps the rail and editor reachable at 390px (#622)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(showtimePath('studio/shows'))
  await page.getByRole('button', { name: 'Add show' }).click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()

  await page.setViewportSize({ width: 390, height: 844 })

  for (const route of [
    { path: 'studio/patterns/IridescentFibers', action: 'Collapse rail' },
    { path: 'studio/maps/plane', action: 'Collapse rail' },
  ]) {
    await page.goto(route.path)

    await expect.poll(
      () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      `${route.path} should not create document-level horizontal overflow at 390px`,
    ).toBeLessThanOrEqual(1)

    await expect(page.getByRole('button', { name: route.action })).toBeInViewport()
  }

  await page.goto('studio/patterns/IridescentFibers')
  await expect(page.getByTestId('preview-pane')).toBeHidden()
  await expect(page.getByTestId('editor-pane')).toBeInViewport()

  await page.goto(showtimePath('studio/shows'))
  await page.getByRole('treeitem', { name: 'Untitled Show' }).click()
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    'Show authoring should not create document-level horizontal overflow at 390px',
  ).toBeLessThanOrEqual(1)
  await expect(page.getByRole('button', { name: 'Show properties' })).toBeInViewport()

  // The Learn number is composed from catalogue level and order at runtime.
  await page.getByRole('treeitem', { name: /Clips, Cuts, and Blank Time$/ }).click()
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    'A built-in Show with the full guide and deployment header should stay contained at 390px',
  ).toBeLessThanOrEqual(1)

  await page.getByRole('button', { name: 'Collapse rail' }).click()
  await expect(page.getByRole('button', { name: 'Expand library' })).toBeInViewport()
})

test('rail search stays inside the list pane at narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 507, height: 520 })
  await page.goto('studio/patterns/IridescentFibers')
  const search = page.getByRole('button', { name: 'Search by name', exact: true })
  const searchInput = page.getByRole('textbox', { name: 'Search by name', exact: true })
  await search.hover()

  const hoverBounds = await searchInput.evaluate((input) => {
    const inputBounds = input.getBoundingClientRect()
    const activityBounds = document.querySelector('[aria-label="Studio activity"]')?.getBoundingClientRect()
    return { inputLeft: inputBounds.left, activityRight: activityBounds?.right }
  })
  expect(hoverBounds.inputLeft).toBeGreaterThanOrEqual(hoverBounds.activityRight ?? Number.POSITIVE_INFINITY)

  const dimensionFilter = page.getByRole('button', { name: 'Dimension filter', exact: true })
  await dimensionFilter.click()
  await expect(page.getByRole('listbox', { name: 'Dimension filter', exact: true })).toBeVisible()
  await page.getByRole('option', { name: '2D', exact: true }).click()
  await expect(dimensionFilter).toContainText('2D')
  await search.click()

  const bounds = await searchInput.evaluate((input) => {
    const inputBounds = input.getBoundingClientRect()
    const railBounds = input.closest('[data-testid="studio-rail"]')?.getBoundingClientRect()
    const activityBounds = document.querySelector('[aria-label="Studio activity"]')?.getBoundingClientRect()
    return {
      inputLeft: inputBounds.left,
      inputRight: inputBounds.right,
      inputWidth: inputBounds.width,
      railRight: railBounds?.right,
      activityRight: activityBounds?.right,
    }
  })

  expect(bounds.inputLeft).toBeGreaterThanOrEqual(bounds.activityRight ?? Number.POSITIVE_INFINITY)
  expect(bounds.inputRight).toBeLessThanOrEqual(bounds.railRight ?? Number.NEGATIVE_INFINITY)
  expect(bounds.inputWidth).toBeGreaterThanOrEqual(80)

  await page.getByRole('button', { name: 'Close search', exact: true }).click()
  await page.setViewportSize({ width: 1440, height: 720 })
  const librarySplitter = page.getByRole('separator', { name: 'Resize library pane', exact: true })
  for (let step = 0; step < 4; step += 1) await librarySplitter.press('Shift+ArrowLeft')
  await expect(librarySplitter).toHaveAttribute('aria-valuenow', '184')
  await search.hover()

  const minimumRailHoverBounds = await searchInput.evaluate((input) => {
    const inputBounds = input.getBoundingClientRect()
    const activityBounds = document.querySelector('[aria-label="Studio activity"]')?.getBoundingClientRect()
    return { inputLeft: inputBounds.left, activityRight: activityBounds?.right }
  })
  expect(minimumRailHoverBounds.inputLeft).toBeGreaterThanOrEqual(
    minimumRailHoverBounds.activityRight ?? Number.POSITIVE_INFINITY,
  )
})

test('resized Pattern and Show previews keep their controls reachable', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('studio/patterns/IridescentFibers')

  const previewPane = page.getByTestId('preview-pane')
  const initialBounds = await previewPane.boundingBox()
  if (!initialBounds) throw new Error('Preview pane is not visible')

  const splitterX = initialBounds.x - 2
  const dragY = initialBounds.y + 180
  await page.mouse.move(splitterX, dragY)
  await page.mouse.down()
  await page.mouse.move(splitterX - 240, dragY, { steps: 6 })
  await page.mouse.up()

  await expect.poll(async () => (await previewPane.boundingBox())?.width ?? 0).toBeGreaterThan(680)
  const patternCanvas = previewPane.locator('canvas')
  const patternControls = previewPane.getByTestId('preview-controls-region')
  await expect(
    previewPane.getByRole('button', { name: 'Pixelblaze', exact: true }),
  ).toBeInViewport()
  await expect.poll(async () => {
    const canvasBounds = await patternCanvas.boundingBox()
    const controlsBounds = await patternControls.boundingBox()
    return canvasBounds && controlsBounds ? canvasBounds.y + canvasBounds.height <= controlsBounds.y : false
  }).toBe(true)
  await previewPane.getByRole('button', { name: 'Pixelblaze', exact: true }).click()
  await previewPane.getByRole('button', { name: 'Preview', exact: true }).click()
  await previewPane.getByRole('button', { name: 'Pattern controls', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Watch variables' })).toBeInViewport()

  await page.goto(showtimePath('studio/shows/stock-show-showcase-redline-installation'))
  await previewPane.hover()
  await page.mouse.wheel(0, 1200)
  await expect(previewPane.getByRole('button', { name: 'Renderer' })).toBeInViewport()
})

test('edits and persists a Controller input use across responsive and keyboard flows (#772)', async ({ page }) => {
  // A complete profile, seeded through the same API the Studio uses. Two analog
  // inputs and no configured uses: the starting state the redesign has to make
  // legible.
  const created = await page.context().request.post('/api/controllers', {
    data: {
      id: 'e2e-772-controller',
      name: 'Analog bench',
      deviceId: 'pixelblaze_pb32_e2e772',
      lastKnownDeviceName: 'Analog bench',
      lastSeenIp: '192.168.8.224',
      lastKnownPixelCount: 256,
      board: { kind: 'pixelblaze-v3-standard', hardwareRevision: 3.5, firmwareVersion: '3.67' },
      inputs: [
        { id: 'pot0', name: 'Front pot', pin: 33, signal: 'analog', smoothing: 0.2, fallback: 0.5, invert: false },
        { id: 'btn0', name: 'Panel button', pin: 34, signal: 'digital', smoothing: 0, fallback: 0, invert: false },
      ],
      globalTransforms: [
        {
          id: 'hardware-brightness',
          type: 'hardware-brightness',
          enabled: false,
          mixinId: 'builtin:hardware-brightness',
          inputId: '',
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
      keepPatternsUpToDate: false,
      patternBindings: [],
      zones: [],
      updatedAt: Date.now(),
    },
  })
  expect(created.ok(), `POST /api/controllers -> ${created.status()}`).toBe(true)

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('studio/controllers/e2e-772-controller')

  // The page is exactly Power, Inputs, and the artifact readout. Behaviour now
  // lives on the input that drives it, and zones moved off this page (#775).
  // These read the rendered names as plain strings rather than as locators for
  // affordances that no longer exist, which the stale-locator gate would
  // reasonably flag.
  const profilePage = page.getByTestId('controller-profile-page')
  await expect(profilePage).toBeVisible()
  expect(await profilePage.getByRole('heading').allTextContents())
    .toEqual(['Power', 'Inputs', 'Last generated artifact'])

  // The approved two-up trace is a rendered-geometry requirement. A class-name
  // assertion passed while the real Studio pane still stacked both inputs.
  const inputGeometry = await profilePage.locator('article').evaluateAll((cards) => cards.map((card) => {
    // Multicolumn layout fragments block boxes. getBoundingClientRect() returns
    // the union of those fragments and can misleadingly span both columns.
    const bounds = card.getClientRects()[0] ?? card.getBoundingClientRect()
    return { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width) }
  }))
  expect(inputGeometry).toHaveLength(2)
  expect(Math.abs(inputGeometry[0].y - inputGeometry[1].y)).toBeLessThanOrEqual(2)
  expect(inputGeometry[1].x).toBeGreaterThan(inputGeometry[0].x + inputGeometry[0].width)

  // No control anywhere still presents a semantic annotation as behaviour.
  const selectLabels = await profilePage.locator('select')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''))
  expect(selectLabels.filter((label) => label.endsWith(' role'))).toEqual([])

  // An input driving nothing says so rather than showing an empty card.
  await expect(page.getByText('Nothing yet').first()).toBeVisible()

  // Assigning brightness from the keyboard writes the real transform.
  const frontBrightness = page.getByRole('checkbox', { name: 'Front pot controls brightness' })
  await frontBrightness.focus()
  await expect(frontBrightness).toBeFocused()
  await frontBrightness.press('Space')
  await expect(frontBrightness).toBeChecked()
  await expect(page.getByText('Brightness', { exact: true })).toBeVisible()
  await expect(page.getByText('every Pattern', { exact: true })).toBeVisible()

  const brightnessTransform = async () => {
    const response = await page.context().request.get('/api/controllers')
    if (!response.ok()) return null
    const { controllers } = await response.json() as {
      controllers: Array<{
        id: string
        inputs: Array<Record<string, unknown>>
        globalTransforms: Array<{ type: string; enabled?: boolean; inputId?: string }>
      }>
    }
    const profile = controllers.find((controller) => controller.id === 'e2e-772-controller')
    return profile
      ? {
          transform: profile.globalTransforms.find((transform) => transform.type === 'hardware-brightness'),
          inputs: profile.inputs,
        }
      : null
  }

  // Persistence proves this edits generated-code input state rather than a
  // display-only annotation. The send-dirty and generated-source oracle lives
  // in the Controller-store integration suite, which owns that runtime seam.
  await expect.poll(async () => (await brightnessTransform())?.transform)
    .toMatchObject({ enabled: true, inputId: 'pot0' })
  await expect.poll(async () => (await brightnessTransform())?.inputs.every((input) => !('role' in input)))
    .toBe(true)

  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Front pot controls brightness' })).toBeChecked()

  // Exactly one hardware-brightness transform exists, so moving brightness to a
  // digital input is inherently exclusive - and now an error on that input, with
  // the correction offered where the fault is.
  await page.getByRole('checkbox', { name: 'Panel button controls brightness' }).check()
  await expect(page.getByRole('checkbox', { name: 'Front pot controls brightness' })).not.toBeChecked()
  await expect(page.getByText('Nothing yet', { exact: true })).toBeVisible()
  await expect(page.getByText(/needs an analog signal/)).toBeVisible()

  await page.getByRole('button', { name: 'Switch this input to analog' }).click()
  await expect(page.getByText(/needs an analog signal/)).toHaveCount(0)
  await expect.poll(async () => (await brightnessTransform())?.transform)
    .toMatchObject({ enabled: true, inputId: 'btn0' })
  await expect.poll(async () => (await brightnessTransform())?.inputs
    .find((input) => input.id === 'btn0')?.signal)
    .toBe('analog')

  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Panel button controls brightness' })).toBeChecked()
  await expect(page.getByText(/needs an analog signal/)).toHaveCount(0)

  // The browser stays wide while the authoring pane narrows, matching a user
  // dragging the adjacent pane splitter. Column count must follow this pane,
  // not a viewport media query (#772).
  const inputColumns = page.getByTestId('controller-profile-input-columns')
  await expect.poll(
    () => inputColumns.evaluate((node) => getComputedStyle(node).columnCount),
    'Controller inputs should use two ragged columns when the center pane is wide',
  ).toBe('2')
  await profilePage.evaluate((node) => {
    node.style.width = '600px'
    node.style.flex = 'none'
  })
  await expect.poll(
    () => inputColumns.evaluate((node) => getComputedStyle(node).columnCount),
    'Controller inputs should collapse to one column when only the center pane narrows',
  ).toBe('1')
  await profilePage.evaluate((node) => {
    node.style.removeProperty('width')
    node.style.removeProperty('flex')
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    'Controller Profile should not create document-level horizontal overflow at 390px',
  ).toBeLessThanOrEqual(1)
  await expect.poll(
    () => profilePage.evaluate((node) => node.scrollWidth - node.clientWidth),
    'Controller Profile content should fit its center pane at 390px',
  ).toBeLessThanOrEqual(1)
  const limitPower = page.getByRole('checkbox', { name: 'Limit power' })
  await limitPower.scrollIntoViewIfNeeded()
  await expect(limitPower).toBeInViewport({ ratio: 1 })
  const adjustFrontPot = page.getByRole('button', { name: 'Adjust Front pot' })
  await adjustFrontPot.scrollIntoViewIfNeeded()
  await expect(adjustFrontPot).toBeInViewport({ ratio: 1 })
})

test('saved Pattern freshness follows the full profile through a real managed overwrite (#777)', async ({ page }) => {
  const profile: ControllerProfile = {
    id: 'e2e-777-controller',
    name: 'Freshness bench',
    deviceId: 'pixelblaze_pb32_3cd4ee549434',
    lastKnownDeviceName: 'Freshness bench',
    lastSeenIp: '192.168.8.224',
    lastKnownPixelCount: 64,
    board: { kind: 'pixelblaze-v3-standard', hardwareRevision: 3.5, firmwareVersion: '3.67' },
    electricalProfile: null,
    inputs: [],
    globalTransforms: [
      {
        id: 'hardware-brightness',
        type: 'hardware-brightness',
        enabled: false,
        mixinId: 'builtin:hardware-brightness',
        inputId: '',
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
    keepPatternsUpToDate: false,
    patternBindings: [],
    zones: [],
    updatedAt: Date.now(),
  }
  const pattern = {
    id: 'e2e-777-pattern',
    name: 'Freshness spiral',
    src: 'export function render(index) { hsv(index / pixelCount, 1, 1) }',
    controls: {},
    updatedAt: Date.now(),
  }
  const enabledProfile: ControllerProfile = {
    ...profile,
    globalTransforms: profile.globalTransforms.map((transform) => (
      transform.type === 'power-cap' ? { ...transform, enabled: true } : transform
    )),
  }
  const controllerId = '192.168.8.224'
  const programId = 'E2E777PROGRAM00001'
  const bindingKey = pattern.id
  const initialSignature = controllerProfileArtifactSignature(profile, bindingKey, { mapDim: null })
  const enabledSignature = controllerProfileArtifactSignature(enabledProfile, bindingKey, { mapDim: null })

  for (const [resource, data] of [
    ['controllers', profile],
    ['patterns', pattern],
  ] as const) {
    const response = await page.context().request.post(`/api/${resource}`, { data })
    expect(response.ok(), `POST /api/${resource} -> ${response.status()}`).toBe(true)
  }
  for (const [key, value] of [
    ['controller-bindings', { [controllerId]: { [bindingKey]: programId } }],
    ['controller-push-records', {
      [controllerId]: {
        [bindingKey]: {
          transforms: [],
          artifactHash: 'before-profile-edit',
          sourceHash: artifactHash(pattern.src),
          stampedAt: '2026-08-08T00:00:00.000Z',
          name: pattern.name,
          profileSignature: initialSignature,
        },
      },
    }],
  ] as const) {
    const response = await page.context().request.put(`/api/controller-metadata/${key}`, {
      data: { value },
    })
    expect(response.ok(), `PUT /api/controller-metadata/${key} -> ${response.status()}`).toBe(true)
  }

  await installFakeControllerHelper(page, {
    programs: [{ id: programId, name: pattern.name }],
    activeProgramId: programId,
    deviceName: profile.name,
    boardType: 'pb32',
    mac: '34:94:54:ee:d4:3c',
    pixelCount: 64,
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`studio/patterns/${pattern.id}`)

  await page.getByRole('button', { name: 'Connect a Controller' }).click()
  await page.getByRole('textbox', { name: 'Controller IP address' }).fill(controllerId)
  await page.getByTestId('controller-go').click()
  const controllerPill = page.getByTestId('controller-pill')
  await expect(controllerPill).toHaveAttribute('data-phase', 'live')
  await controllerPill.click()
  await page.getByRole('link', { name: `Open ${profile.name} profile` }).click()

  await expect(page).toHaveURL(new RegExp(`/studio/controllers/${profile.id}$`))
  await expect(page.getByRole('table', { name: 'Saved PXLBLZ Patterns' })).toBeVisible()
  await expect(page.getByText('CURRENT', { exact: true })).toBeVisible()

  await page.getByRole('checkbox', { name: 'Limit power' }).check()
  const pushAgain = page.getByText('PUSH AGAIN', { exact: true })
  await expect(pushAgain).toBeVisible()
  const badgeGeometry = await pushAgain.evaluate((badge) => {
    const badgeBounds = badge.getBoundingClientRect()
    const cellBounds = badge.closest('td')?.getBoundingClientRect()
    return cellBounds
      ? { badgeLeft: badgeBounds.left, badgeRight: badgeBounds.right, cellLeft: cellBounds.left, cellRight: cellBounds.right }
      : null
  })
  expect(badgeGeometry).not.toBeNull()
  expect(badgeGeometry!.badgeLeft).toBeGreaterThanOrEqual(badgeGeometry!.cellLeft)
  expect(badgeGeometry!.badgeRight).toBeLessThanOrEqual(badgeGeometry!.cellRight)

  await page.getByText(
    'Keep PXLBLZ Patterns up to date when Controller settings change',
    { exact: true },
  ).click()
  await expect.poll(async () => {
    const response = await page.context().request.get('/api/controller-metadata/controller-push-records')
    if (!response.ok()) return null
    const body = await response.json() as {
      value?: Record<string, Record<string, { profileSignature?: string }>>
    }
    return body.value?.[controllerId]?.[bindingKey]?.profileSignature ?? null
  }).toBe(enabledSignature)
  await expect(page.getByText('CURRENT', { exact: true })).toBeVisible()
  await expect(page.getByText('PUSH AGAIN', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: pattern.name, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/studio/patterns/${pattern.id}$`))
  const editedSource = 'export function render(index) { hsv(index / pixelCount, 1, wave(time(0.1))) }'
  const editor = page.locator('.monaco-editor').first()
  await expect(editor).toBeVisible()
  await expect(editor.locator('.view-lines')).toBeVisible()
  await editor.locator('.view-lines').click({ clickCount: 3 })
  await expect(editor).toHaveClass(/focused/)
  const sourceSaved = page.waitForResponse((response) => {
    const request = response.request()
    if (request.method() !== 'PATCH') return false
    if (!new URL(response.url()).pathname.endsWith(`/api/patterns/${pattern.id}`)) return false
    const changes = request.postDataJSON() as { src?: string }
    return response.ok() && changes.src === editedSource
  })
  await page.keyboard.type(editedSource)
  await expect(editor.locator('.view-lines')).toHaveText(editedSource)
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
  await sourceSaved

  const patternsResponse = await page.context().request.get('/api/patterns')
  expect(patternsResponse.ok(), `GET /api/patterns -> ${patternsResponse.status()}`).toBe(true)
  const patternsBody = await patternsResponse.json() as { patterns?: Array<{ id: string; src: string }> }
  expect(patternsBody.patterns?.find((item) => item.id === pattern.id)?.src).toBe(editedSource)

  await controllerPill.click()
  await page.getByRole('link', { name: `Open ${profile.name} profile` }).click()
  await expect(page.getByText('PUSH AGAIN', { exact: true })).toBeVisible()
  await expect(page.getByText('CURRENT', { exact: true })).toHaveCount(0)
})

test.describe('silent save-failure feedback (#810)', () => {
  // The simulated-offline write failures are the point of these tests; the
  // aborted requests still log as browser console errors.
  test.use({ allowedBrowserErrors: [/net::ERR_FAILED|Failed to fetch/] })

  // The autosave tick runs every 4s; glyph assertions span at least one tick.
  const TICK = { timeout: 15_000 }

  test('pattern editor shows cant-save while offline and recovers on its own (#810)', async ({ page }) => {
    const pattern = {
      id: 'e2e-810-pattern',
      name: 'Save feedback bench',
      src: 'export function render(index) { hsv(index / pixelCount, 1, 1) }',
      controls: {},
      updatedAt: Date.now(),
    }
    const created = await page.context().request.post('/api/patterns', { data: pattern })
    expect(created.ok(), `POST /api/patterns -> ${created.status()}`).toBe(true)

    await page.goto(`studio/patterns/${pattern.id}`)
    const editor = page.locator('.monaco-editor').first()
    await expect(editor.locator('.view-lines')).toBeVisible()

    let blockWrites = true
    await page.route('**/api/patterns/**', (route) => {
      if (blockWrites && ['PATCH', 'PUT'].includes(route.request().method())) return route.abort()
      return route.continue()
    })

    const editedSource = 'export function render(index) { hsv(index / pixelCount, 1, wave(time(0.1))) }'
    await editor.locator('.view-lines').click({ clickCount: 3 })
    await expect(editor).toHaveClass(/focused/)
    await page.keyboard.type(editedSource)
    await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')

    // The failed tick write turns the glyph on...
    const glyph = page.getByTestId('save-status')
    await expect(glyph).toHaveAttribute('data-state', 'cant-save', TICK)
    await expect(glyph).toHaveAttribute('title', /Can't reach storage/)

    // ...and the next successful tick clears it without any user action.
    const sourceSaved = page.waitForResponse((response) => {
      const request = response.request()
      return request.method() === 'PATCH'
        && new URL(response.url()).pathname.endsWith(`/api/patterns/${pattern.id}`)
        && response.ok()
    })
    blockWrites = false
    await sourceSaved
    await expect(glyph).toHaveCount(0, TICK)

    const patterns = await page.context().request.get('/api/patterns')
    expect(patterns.ok(), `GET /api/patterns -> ${patterns.status()}`).toBe(true)
    const body = await patterns.json() as { patterns?: Array<{ id: string; src: string }> }
    expect(body.patterns?.find((item) => item.id === pattern.id)?.src).toBe(editedSource)
  })

  test('broken pattern source warns that edits are not saved (#810)', async ({ page }) => {
    const pattern = {
      id: 'e2e-810-broken',
      name: 'Broken source bench',
      src: 'export function render(index) { hsv(index / pixelCount, 1, 1) }',
      controls: {},
      updatedAt: Date.now(),
    }
    const created = await page.context().request.post('/api/patterns', { data: pattern })
    expect(created.ok(), `POST /api/patterns -> ${created.status()}`).toBe(true)

    await page.goto(`studio/patterns/${pattern.id}`)
    const editor = page.locator('.monaco-editor').first()
    await expect(editor.locator('.view-lines')).toBeVisible()
    await editor.locator('.view-lines').click({ clickCount: 3 })
    await expect(editor).toHaveClass(/focused/)

    await page.keyboard.type('export function render(index) { var = 3 }')
    await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'broken')

    // Broken source pauses autosave by design; the glyph says so immediately.
    const glyph = page.getByTestId('save-status')
    await expect(glyph).toHaveAttribute('data-state', 'wont-save')
    await expect(glyph).toHaveAttribute('title', /Changes not saved/)

    // Fixing the source resumes autosave and returns the header to silence.
    await editor.locator('.view-lines').click({ clickCount: 3 })
    await page.keyboard.type('export function render(index) { hsv(1, 1, 1) }')
    await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
    await expect(glyph).toHaveCount(0)
  })

  test('an edit that fails to save during navigation is reported as lost (#810)', async ({ page }) => {
    const patternA = {
      id: 'e2e-810-nav-a',
      name: 'Nav bench A',
      src: 'export function render(index) { hsv(index / pixelCount, 1, 1) }',
      controls: {},
      updatedAt: Date.now(),
    }
    const patternB = { ...patternA, id: 'e2e-810-nav-b', name: 'Nav bench B' }
    for (const pattern of [patternA, patternB]) {
      const created = await page.context().request.post('/api/patterns', { data: pattern })
      expect(created.ok(), `POST /api/patterns -> ${created.status()}`).toBe(true)
    }

    await page.goto(`studio/patterns/${patternA.id}`)
    const editor = page.locator('.monaco-editor').first()
    await expect(editor.locator('.view-lines')).toBeVisible()

    await page.route('**/api/patterns/**', (route) => {
      if (['PATCH', 'PUT'].includes(route.request().method())) return route.abort()
      return route.continue()
    })

    const editedSource = 'export function render(index) { hsv(index / pixelCount, 1, wave(time(0.2))) }'
    await editor.locator('.view-lines').click({ clickCount: 3 })
    await expect(editor).toHaveClass(/focused/)
    await page.keyboard.type(editedSource)
    await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')

    // Navigate away before the draft can save: the seam flush fails after the
    // buffer is replaced, and the loss is reported instead of staying silent.
    await page.getByRole('treeitem', { name: patternB.name, exact: true }).click()
    const notice = page.getByTestId('navigation-save-failure')
    await expect(notice).toBeVisible(TICK)
    await expect(notice).toContainText(`Couldn't save "${patternA.name}" before switching.`)
    // Nothing is retained, so there is no Retry — only Dismiss.
    await expect(notice.getByRole('button', { name: 'Retry save' })).toHaveCount(0)

    await notice.getByRole('button', { name: 'Dismiss save notice' }).click()
    await expect(notice).toHaveCount(0)

    // The record still holds the last durable source.
    const patterns = await page.context().request.get('/api/patterns')
    expect(patterns.ok(), `GET /api/patterns -> ${patterns.status()}`).toBe(true)
    const body = await patterns.json() as { patterns?: Array<{ id: string; src: string }> }
    expect(body.patterns?.find((item) => item.id === patternA.id)?.src).toBe(patternA.src)
  })

  test('map editor keeps an offline draft retrying instead of losing it (#810)', async ({ page }) => {
    const map = {
      id: 'e2e-810-map',
      name: 'Offline bench map',
      dim: 2,
      generator: 'custom',
      params: {},
      source: '[[0,0],[1,0],[1,1],[0,1]]',
      updatedAt: Date.now(),
    }
    const created = await page.context().request.post('/api/maps', { data: map })
    expect(created.ok(), `POST /api/maps -> ${created.status()}`).toBe(true)

    await page.goto(`studio/maps/${map.id}`)
    const editor = page.locator('.monaco-editor').first()
    await expect(editor.locator('.view-lines')).toBeVisible()

    let blockWrites = true
    await page.route('**/api/maps/**', (route) => {
      if (blockWrites && ['PATCH', 'PUT'].includes(route.request().method())) return route.abort()
      return route.continue()
    })

    const editedSource = '[[0,0],[0.5,0.5],[1,1],[0,1]]'
    await editor.locator('.view-lines').click({ clickCount: 3 })
    await expect(editor).toHaveClass(/focused/)
    // Clear the selection before typing: a leading bracket over a selection
    // triggers Monaco auto-surround and wraps the old source instead of
    // replacing it.
    await page.keyboard.press('Backspace')
    await page.keyboard.type(editedSource)
    await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')

    // The record must not pretend the draft is saved (#800 PR2): the glyph
    // reports the failing write and the tick keeps retrying.
    const glyph = page.getByTestId('save-status')
    await expect(glyph).toHaveAttribute('data-state', 'cant-save', TICK)

    const mapSaved = page.waitForResponse((response) => {
      const request = response.request()
      return request.method() === 'PATCH'
        && new URL(response.url()).pathname.endsWith(`/api/maps/${map.id}`)
        && response.ok()
    })
    blockWrites = false
    await mapSaved
    await expect(glyph).toHaveCount(0, TICK)

    const maps = await page.context().request.get('/api/maps')
    expect(maps.ok(), `GET /api/maps -> ${maps.status()}`).toBe(true)
    const mapsBody = await maps.json() as { maps?: Array<{ id: string; source: string }> }
    expect(mapsBody.maps?.find((item) => item.id === map.id)?.source).toBe(editedSource)
  })

  test('a failed Controller profile edit rolls back with a visible notice and Retry (#810)', async ({ page }) => {
    const profile = {
      id: 'e2e-810-controller',
      name: 'Save notice bench',
      deviceId: 'pixelblaze_pb32_3cd4ee549810',
      lastKnownDeviceName: 'Save notice bench',
      lastSeenIp: '192.168.8.225',
      lastKnownPixelCount: 64,
      board: { kind: 'pixelblaze-v3-standard', hardwareRevision: 3.5, firmwareVersion: '3.67' },
      electricalProfile: null,
      inputs: [],
      globalTransforms: [
        {
          id: 'hardware-brightness',
          type: 'hardware-brightness',
          enabled: false,
          mixinId: 'builtin:hardware-brightness',
          inputId: '',
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
      keepPatternsUpToDate: false,
      patternBindings: [],
      zones: [],
      updatedAt: Date.now(),
    }
    const created = await page.context().request.post('/api/controllers', { data: profile })
    expect(created.ok(), `POST /api/controllers -> ${created.status()}`).toBe(true)

    await page.goto(`studio/controllers/${profile.id}`)
    await expect(page.getByTestId('controller-profile-page')).toBeVisible()
    const noInputs = page.getByText('No hardware inputs are wired to this Controller profile yet.')
    await expect(noInputs).toBeVisible()

    let blockWrites = true
    await page.route('**/api/controllers/**', (route) => {
      if (blockWrites && ['PATCH', 'PUT'].includes(route.request().method())) return route.abort()
      return route.continue()
    })

    // The rollback keeps data integrity while the failure stops being silent.
    await page.getByRole('button', { name: 'Add input' }).click()
    const notice = page.getByTestId('controller-profile-save-failure')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText("Couldn't save this Controller change. The edit was reverted.")
    await expect(noInputs).toBeVisible()

    // Retry while still offline keeps the notice up.
    await notice.getByRole('button', { name: 'Retry save' }).click()
    await expect(notice).toBeVisible()

    // Once persistence recovers, Retry re-applies the reverted edit.
    blockWrites = false
    await notice.getByRole('button', { name: 'Retry save' }).click()
    await expect(notice).not.toBeVisible()
    await expect(noInputs).toHaveCount(0)
  })
})

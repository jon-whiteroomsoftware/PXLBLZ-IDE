import { expect, test } from './fixtures/authenticated'
import type { Locator, Page } from '@playwright/test'
import { installFakeControllerHelper } from './fixtures/fakeControllerHelper'
import { controllerProfileArtifactSignature } from '../src/engine/controllerProfilePassRecipe'
import { artifactHash } from '../src/engine/artifactStamp'
import type { ControllerProfile } from '../src/engine/controllerProfile'
import { studioOperationRetryLabelFor } from '../src/store/studioOperationStore'

/** Monaco names its own input textarea; this label is not produced by live source. */
const MONACO_TEXTBOX_NAME = 'Editor content'

function placeTrigger(page: Page): Locator {
  return page.getByTestId('top-bar').locator('[aria-haspopup="listbox"]')
}

async function choosePlace(page: Page, name: string): Promise<void> {
  await placeTrigger(page).click()
  await page.getByRole('listbox', { name: 'Places' }).getByRole('option', { name: new RegExp(`^${name}`) }).click()
}

/** Replace the complete Monaco model through its public keyboard surface. */
async function replaceEditorSource(page: Page, editor: Locator, source: string): Promise<void> {
  const input = editor.getByRole('textbox', { name: MONACO_TEXTBOX_NAME })
  const viewLines = editor.locator('.view-lines')
  // textContent preserves the one-line model text without layout-only wraps;
  // Monaco renders ordinary spaces as NBSPs inside view-lines.
  const renderedSource = async () => (await viewLines.textContent() ?? '').replaceAll('\u00a0', ' ')

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await viewLines.click()
    await expect(editor).toHaveClass(/focused/)
    await expect(input).toBeFocused()
    // Playwright's Chromium keyboard surface uses Control+A for Monaco's
    // select-all command even when the runner host is macOS.
    await input.press('Control+KeyA')
    // Typing an opening bracket over a selection can auto-surround the old
    // source. Delete first so every caller starts from an empty model.
    await input.press('Backspace')
    if (await renderedSource() === '') break
  }

  await expect.poll(renderedSource).toBe('')
  await page.keyboard.type(source)
  await expect.poll(renderedSource).toBe(source)
}

test('exposes functional Show access without a query parameter', async ({ page }) => {
  await page.goto('studio')

  await expect(placeTrigger(page)).toHaveAccessibleName('Patterns')

  await page.goto('studio/shows/stock-show-101-clips-cuts-blank-time')

  await expect(page).toHaveURL(/\/studio\/shows\/stock-show-101-clips-cuts-blank-time$/)
  await expect(placeTrigger(page)).toHaveAccessibleName('Shows')
  await expect(page.getByRole('region', { name: 'Show timeline' })).toBeVisible()
})

test('authenticated Studio creates, renames, and reloads a persisted Show', async ({ page }) => {
  await page.goto('studio/shows')

  await expect(page.getByRole('button', { name: /Account menu for playwright-worker-\d+/i })).toBeVisible()
  await page.getByRole('button', { name: 'Add show' }).click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()
  await expect(page).toHaveURL(/\/studio\/shows\/[a-z0-9-]+$/)

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
  // This scenario performs eleven full authenticated navigations through the
  // shared Wrangler process. Preserve the complete route/viewport contract
  // while allowing its cumulative work to finish under full-suite contention.
  test.setTimeout(60_000)
  const routes = [
    { path: 'studio/patterns/IridescentFibers', place: 'Patterns', heading: 'Patterns' },
    { path: 'studio/maps/plane', place: 'Maps', heading: 'Maps' },
    { path: 'studio/libraries/Shader', place: 'Libraries', heading: 'Libraries' },
    { path: 'studio/controllers', place: 'Controllers', heading: 'Controllers' },
    { path: 'studio/shows/stock-show-101-clips-cuts-blank-time', place: 'Shows', heading: 'Shows' },
  ] as const

  for (const viewport of [{ width: 1440, height: 900 }, { width: 720, height: 720 }]) {
    await page.setViewportSize(viewport)
    for (const route of routes) {
      await page.goto(route.path)

      await expect(placeTrigger(page)).toHaveAccessibleName(route.place)
      await placeTrigger(page).focus()
      await expect(placeTrigger(page)).toBeFocused()

      if (viewport.width <= 980) {
        await page.getByRole('button', { name: `Open the ${route.heading} list` }).click()
      }

      const list = page.getByRole('region', { name: route.place, exact: true })
      await expect(list).toBeVisible()
      await expect(list.getByRole('heading', { name: route.place, exact: true })).toHaveCount(0)
      await expect.poll(
        () => page.evaluate(() => document.documentElement.scrollWidth),
        `${route.path} at ${viewport.width}px should not create document-level horizontal overflow`,
      ).toBeLessThanOrEqual(viewport.width + 1)
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('studio/patterns/IridescentFibers')
  await page.getByRole('button', { name: 'Unpin Patterns list' }).click()
  await expect(page.getByTestId('studio-drawer-layout')).toHaveAttribute('data-drawer-mode', 'tucked')
  await expect(page.getByRole('button', { name: 'Open the Patterns list' })).toBeVisible()
  expect(await page.getByRole('button', { name: 'Open the Patterns list' }).evaluate((element) => element.getBoundingClientRect().width)).toBe(22)
})

test('the place control reaches every Studio and reference workspace (#965)', async ({ page }) => {
  await page.goto('studio/patterns/IridescentFibers')

  for (const destination of [
    { name: 'Shows', path: /\/studio\/shows(?:\/[^/]+)?$/ },
    { name: 'Maps', path: /\/studio\/maps$/ },
    { name: 'Controllers', path: /\/studio\/controllers$/ },
    { name: 'Mixins', path: /\/studio\/mixins$/ },
    { name: 'Libraries', path: /\/studio\/libraries$/ },
    { name: 'Docs', path: /\/docs$/ },
    { name: 'API', path: /\/reference$/ },
    { name: 'Patterns', path: /\/studio\/patterns\/IridescentFibers$/ },
  ]) {
    await choosePlace(page, destination.name)
    await expect(page).toHaveURL(destination.path)
    await expect(placeTrigger(page)).toHaveAccessibleName(destination.name)
  }
})

test('the Studio entity drawer overlays without reflow and preserves Preview Space (#966)', async ({ page }) => {
  test.setTimeout(45_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('studio/shows/stock-show-101-clips-cuts-blank-time')

  const layout = page.getByTestId('studio-drawer-layout')
  await page.getByRole('button', { name: 'Unpin Shows list' }).click()
  await expect(layout).toHaveAttribute('data-drawer-mode', 'tucked')
  const edgeTab = page.getByRole('button', { name: 'Open the Shows list' })
  await expect(edgeTab).toHaveAccessibleName('Open the Shows list')

  const timelineToolbar = page.getByTestId('show-timeline-toolbar')
  const play = timelineToolbar.getByRole('button', { name: 'Play Show preview' })
  await expect(play).toBeVisible()
  await edgeTab.focus()
  await edgeTab.press('Space')
  await expect(timelineToolbar.getByRole('button', { name: 'Pause Show preview' })).toBeVisible()
  await expect(layout).toHaveAttribute('data-drawer-mode', 'tucked')

  const geometry = async () => page.evaluate(() => {
    const rect = (selector: string) => {
      const bounds = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect()
      return bounds && { x: bounds.x, width: bounds.width }
    }
    const timeline = document.querySelector<HTMLElement>('[data-testid="show-timeline-scroll-region"]')
    return {
      editor: rect('[data-testid="editor-pane"]'),
      timeline: timeline && { ...rect('[data-testid="show-timeline-scroll-region"]'), scrollLeft: timeline.scrollLeft },
    }
  })
  const tucked = await geometry()

  await edgeTab.press('Enter')
  await expect(layout).toHaveAttribute('data-drawer-mode', 'open')
  await expect(page.getByRole('textbox', { name: 'Search shows' })).toBeFocused()
  expect(await geometry()).toEqual(tucked)
  const searchField = page.getByRole('textbox', { name: 'Search shows' })
  await searchField.fill('clips cuts')
  await searchField.press('Space')
  await expect(searchField).toHaveValue('clips cuts ')
  await expect(timelineToolbar.getByRole('button', { name: 'Pause Show preview' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Shows', exact: true }).getByRole('status')).toHaveText(/\d+ of \d+/)
  await searchField.press('Escape')
  await expect(searchField).toHaveValue('')
  await expect(searchField).toBeFocused()
  await expect(layout).toHaveAttribute('data-drawer-mode', 'open')
  const pin = page.getByRole('button', { name: 'Pin Shows list', exact: true })
  await pin.focus()
  await pin.press('Space')
  await expect(timelineToolbar.getByRole('button', { name: 'Play Show preview' })).toBeVisible()
  await expect(pin).toHaveAttribute('aria-pressed', 'false')
  await expect(layout).toHaveAttribute('data-drawer-mode', 'open')
  await pin.press('Space')
  await expect(timelineToolbar.getByRole('button', { name: 'Pause Show preview' })).toBeVisible()
  await searchField.focus()


  await page.getByRole('textbox', { name: 'Search shows' }).press('Escape')
  await expect(layout).toHaveAttribute('data-drawer-mode', 'open')
  await page.keyboard.press('Escape')
  await expect(layout).toHaveAttribute('data-drawer-mode', 'tucked')

  await edgeTab.click()
  await expect(layout).toHaveAttribute('data-drawer-mode', 'open')
  await timelineToolbar.click()
  await expect(layout).toHaveAttribute('data-drawer-mode', 'tucked')

  await edgeTab.click()
  await page.keyboard.press('Escape')
  await expect(layout).toHaveAttribute('data-drawer-mode', 'tucked')

  await edgeTab.click()
  const drawer = page.getByTestId('studio-entity-drawer')
  await drawer.hover()
  await timelineToolbar.hover()
  await expect(page.getByTestId('studio-drawer-close-progress')).toHaveCount(0)
  await expect(layout).toHaveAttribute('data-drawer-mode', 'open')
  await drawer.hover()
  await expect(page.getByTestId('studio-drawer-close-progress')).toHaveCount(0)
  await expect(layout).toHaveAttribute('data-drawer-mode', 'open')
  await timelineToolbar.hover()
  await expect(layout).toHaveAttribute('data-drawer-mode', 'tucked', { timeout: 2_000 })

  await edgeTab.click()
  const currentShow = page.getByRole('treeitem', { name: /Clips, Cuts, and Blank Time$/ })
  if (!await currentShow.isVisible()) await page.getByRole('treeitem', { name: /^100/ }).click()
  await currentShow.click()
  await expect(layout).toHaveAttribute('data-drawer-mode', 'tucked')
  // The tucked state precedes the drawer's completed exit transition.
  await expect(drawer).toBeHidden()

  // Buffer at the browser boundary so a runner-only missed drag reports the
  // actual target and event order without adding awaits inside the gesture.
  await page.evaluate(() => {
    const trace: unknown[] = []
    const describe = (element: Element | null) => {
      if (!element) return null
      const bounds = element.getBoundingClientRect()
      return {
        tag: element.tagName,
        role: element.getAttribute('role'),
        label: element.getAttribute('aria-label'),
        selection: element.closest('[data-show-selection-key]')?.getAttribute('data-show-selection-key'),
        layer: element.closest('[data-show-layer-id]')?.getAttribute('data-show-layer-id'),
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      }
    }
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'dragstart', 'dragend']) {
      document.addEventListener(type, (rawEvent) => {
        const event = rawEvent as PointerEvent | DragEvent
        trace.push({
          type,
          time: performance.now(),
          x: event.clientX,
          y: event.clientY,
          shift: event.shiftKey,
          buttons: event.buttons,
          target: describe(event.target instanceof Element ? event.target : null),
          hit: describe(document.elementFromPoint(event.clientX, event.clientY)),
          clip: describe(document.querySelector('[data-show-composition-clip="true"]')),
        })
        if (trace.length > 200) trace.shift()
      }, true)
    }
    ;(window as unknown as { drawerDragTrace: unknown[] }).drawerDragTrace = trace
  })
  try {
    const clip = page.locator('[data-show-composition-clip="true"]').first()
    const clipBounds = await clip.boundingBox()
    expect(clipBounds).not.toBeNull()
    await page.keyboard.down('Shift')
    await page.mouse.move(clipBounds!.x + clipBounds!.width / 2, clipBounds!.y + clipBounds!.height / 2)
    await page.mouse.down()
    await page.mouse.move(clipBounds!.x + clipBounds!.width / 2 + 12, clipBounds!.y + clipBounds!.height / 2, { steps: 2 })
    await expect(page.getByTestId('show-clip-move-preview')).toBeVisible()
    await page.mouse.move(5, clipBounds!.y + clipBounds!.height / 2, { steps: 6 })
    await page.mouse.up()
    await page.keyboard.up('Shift')
    await expect(layout).toHaveAttribute('data-drawer-mode', 'tucked')
  } catch (error) {
    const trace = await page.evaluate(() => (
      (window as unknown as { drawerDragTrace: unknown[] }).drawerDragTrace
    ))
    const body = JSON.stringify(trace, null, 2)
    await test.info().attach('drawer-drag-events', { body, contentType: 'application/json' })
    console.error(`Drawer drag event trace: ${JSON.stringify(trace)}`)
    throw error
  }

  await choosePlace(page, 'Maps')
  await page.getByRole('button', { name: 'Unpin Maps list' }).click()
  await choosePlace(page, 'Shows')
  await expect(layout).toHaveAttribute('data-drawer-mode', 'open')
  await choosePlace(page, 'Maps')
  await expect(page).toHaveURL(/\/studio\/maps(?:\/[^/]+)?$/)
  await expect(layout).toHaveAttribute('data-drawer-mode', 'open')
})

test('the entity list stays unpinned below 980px and retains workspace geometry while open (#966)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('studio/shows/stock-show-101-clips-cuts-blank-time')

  const layout = page.getByTestId('studio-drawer-layout')
  await expect(layout).toHaveAttribute('data-drawer-mode', 'tucked')
  await expect(page.getByRole('button', { name: 'Open the Shows list' })).toBeInViewport()
  const editorBefore = await page.getByTestId('editor-pane').boundingBox()

  await page.getByRole('button', { name: 'Open the Shows list' }).click()
  await expect(layout).toHaveAttribute('data-drawer-mode', 'open')
  await expect(page.getByRole('button', { name: 'Lists stay unpinned below 980 px' })).toBeDisabled()
  expect(await page.getByTestId('editor-pane').boundingBox()).toEqual(editorBefore)
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(1)
})

test('the top bar keeps its row with three Controllers at 1180px and compacts at 390px (#965)', async ({ page }) => {
  await installFakeControllerHelper(page, {
    programs: [],
    activeProgramId: 'none',
    deviceName: 'Bench',
    boardType: 'standard',
    mac: 'AA:BB:CC:DD:EE:11',
    pixelCount: 64,
  })
  await page.goto('studio/controllers')

  for (const [index, ip] of ['192.168.8.221', '192.168.8.222', '192.168.8.223'].entries()) {
    await page.getByTestId('controller-entry-button').click()
    await page.getByRole('textbox', { name: 'Controller IP address' }).fill(ip)
    await page.getByTestId('controller-go').click()
    await expect(page.getByTestId('controller-pill')).toHaveCount(index + 1)
  }

  for (const viewport of [{ width: 1180, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    const geometry = await page.getByTestId('top-bar').evaluate((header) => {
      const place = header.querySelector<HTMLElement>('[aria-haspopup="listbox"]')
      const bounds = header.getBoundingClientRect()
      const interactive = Array.from(header.querySelectorAll<HTMLElement>('a, button'))
      return {
        headerTop: Math.round(bounds.top),
        headerBottom: Math.round(bounds.bottom),
        scrollWidth: header.scrollWidth,
        clientWidth: header.clientWidth,
        placeWidth: place?.getBoundingClientRect().width ?? 0,
        interactiveTops: interactive.map((element) => Math.round(element.getBoundingClientRect().top)),
        interactiveBottoms: interactive.map((element) => Math.round(element.getBoundingClientRect().bottom)),
      }
    })
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
    expect(geometry.placeWidth).toBeGreaterThan(120)
    expect(Math.min(...geometry.interactiveTops)).toBeGreaterThanOrEqual(geometry.headerTop)
    expect(Math.max(...geometry.interactiveBottoms)).toBeLessThanOrEqual(geometry.headerBottom)
  }

  await expect(page.locator('[aria-label="PXLBLZ"]')).toBeHidden()
  const labels = page.getByTestId('controller-pill').locator('[data-controller-pill-label]')
  await expect(labels).toHaveCount(3)
  expect(await labels.evaluateAll((elements) => elements.every((element) => getComputedStyle(element).display === 'none')))
    .toBe(true)
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

test('Controller surfaces keep live state and switch saved Patterns in place (#866, #868, #869)', async ({ page }) => {
  const profile: ControllerProfile = {
    id: 'e2e-866-controller',
    name: 'Deck bench',
    deviceId: 'pixelblaze_pb32_86d4ee549434',
    lastKnownDeviceName: 'Deck bench',
    lastSeenIp: '192.168.8.224',
    lastKnownPixelCount: 256,
    board: { kind: 'pixelblaze-v3-standard', hardwareRevision: 3.5, firmwareVersion: '3.67' },
    electricalProfile: {
      ledPresetId: 'ws2811-12v-grouped',
      supplyBudget: { value: 5, unit: 'amps' },
    },
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
        enabled: true,
        mixinId: 'builtin:power-cap',
        mode: 'direct',
        maxDuty: 0.35,
      },
    ],
    keepPatternsUpToDate: false,
    patternBindings: [],
    zones: [],
    updatedAt: Date.now(),
  }
  const created = await page.context().request.post('/api/controllers', { data: profile })
  expect(created.ok(), `POST /api/controllers -> ${created.status()}`).toBe(true)

  await installFakeControllerHelper(page, {
    programs: [
      { id: 'E2E866PROGRAM00001', name: 'EmberSpire' },
      { id: 'E2E868PROGRAM00002', name: 'IridescentFibers' },
    ],
    activeProgramId: 'E2E866PROGRAM00001',
    deviceName: 'Deck bench',
    boardType: 'pb32',
    mac: '34:94:54:ee:d4:86',
    pixelCount: 256,
    controls: { sliderIntensity: 0.55, sliderCooling: 0.42 },
    vars: {
      phase: 0.5,
      __px_powerDutyRecent: 0.78,
      __px_powerDutySinceStart: 0.41,
      __px_powerMilliAmps: 4000,
      __px_powerLimit: 0.35,
      __px_powerScale: 0.84,
      __px_powerClipping: 1,
    },
    sequencerMode: 1,
    runSequencer: true,
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('studio/patterns/EmberSpire')

  await page.getByRole('button', { name: 'Connect a Controller' }).click()
  await page.getByRole('textbox', { name: 'Controller IP address' }).fill('192.168.8.224')
  await page.getByTestId('controller-go').click()
  const controllerPill = page.getByTestId('controller-pill')
  await expect(controllerPill).toHaveAttribute('data-phase', 'live')
  await controllerPill.click()

  const popover = page.getByTestId('controller-panel-popover')
  await expect(popover).toBeVisible()
  const sequencer = page.getByTestId('controller-sequencer-indicator')
  await expect(sequencer).toHaveAttribute('aria-label', 'Sequencer shuffle is on')
  // The next-interval warning is a visible tip on hover/focus and the chip's
  // accessible description (#872), not a mouse-only native title.
  const sequencerWarning = 'Sequencer: shuffle. The Controller is choosing Patterns on its own; a manual switch is overridden at the next interval.'
  await expect(sequencer).toHaveAccessibleDescription(sequencerWarning)
  await sequencer.focus()
  await expect(page.getByRole('note').filter({ hasText: sequencerWarning })).toBeVisible()
  await sequencer.blur()
  await expect(page.getByRole('note').filter({ hasText: sequencerWarning })).toBeHidden()
  const indicatorBeforeDisconnect = await sequencer.evaluate((element) => (
    element.compareDocumentPosition(document.querySelector('[data-testid="controller-pill-remove"]')!)
    & Node.DOCUMENT_POSITION_FOLLOWING
  ) !== 0)
  expect(indicatorBeforeDisconnect).toBe(true)

  const actionRow = page.getByTestId('controller-action-row')
  await expect(actionRow).toContainText('EmberSpire')
  const studioUrl = page.url()
  await page.getByRole('button', { name: 'Switch running Pattern' }).click()
  const switchMenu = page.getByRole('listbox', { name: 'Switch the running Pattern' })
  await expect(switchMenu).toBeVisible()
  await expect(switchMenu.getByRole('option')).toHaveCount(2)
  await expect(switchMenu.getByRole('option').nth(0)).toHaveText('EmberSpire')
  await expect(switchMenu.getByRole('option').nth(1)).toHaveText('IridescentFibers')
  await expect(switchMenu.getByRole('option', { name: 'EmberSpire' })).toHaveAttribute('aria-selected', 'true')
  await expect(switchMenu.getByRole('option', { name: 'IridescentFibers' })).toHaveAttribute(
    'title',
    'E2E868PROGRAM00002',
  )
  await switchMenu.getByRole('option', { name: 'IridescentFibers' }).click()

  await expect(switchMenu).not.toBeVisible()
  await expect(popover.locator('span[title="IridescentFibers"]')).toBeVisible()
  await expect(popover.locator('[title="Supported render dimensions: 2D"]')).toHaveText('2D')
  await expect(actionRow).toContainText('EmberSpire')
  expect(page.url()).toBe(studioUrl)
  await expect(sequencer).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const writes = (window as typeof window & {
      __fakeControllerWrites?: Array<Record<string, unknown>>
    }).__fakeControllerWrites ?? []
    return writes.some((write) => (
      write.activeProgramId === 'E2E868PROGRAM00002' && write.save === true
    ))
  })).toBe(true)

  const panel = page.getByTestId('controller-panel')
  const pixelblaze = panel.getByRole('button', { name: 'Pixelblaze', exact: true })
  const controls = panel.getByRole('button', { name: 'pattern controls', exact: true })
  const power = panel.getByRole('button', { name: 'power', exact: true })
  const variables = panel.getByRole('button', { name: 'variables', exact: true })
  await expect(pixelblaze).toHaveAttribute('aria-expanded', 'true')
  await expect(controls).toHaveAttribute('aria-expanded', 'true')
  await expect(power).toHaveAttribute('aria-expanded', 'false')
  await expect(variables).toHaveAttribute('aria-expanded', 'true')

  const summary = page.getByTestId('controller-power-summary')
  await expect(summary).toHaveText(/limiting · duty 78% · 5\.0 A · 60\.4 W/)
  await expect(summary).not.toHaveClass(/truncate/)
  await page.setViewportSize({ width: 320, height: 844 })
  const actionBounds = await actionRow.evaluate((element) => {
    const row = element.getBoundingClientRect()
    const switchButton = element.querySelector('[aria-label="Switch running Pattern"]')!
      .getBoundingClientRect()
    return {
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      rowLeft: row.left,
      rowRight: row.right,
      switchLeft: switchButton.left,
      switchRight: switchButton.right,
    }
  })
  expect(actionBounds.scrollWidth).toBeLessThanOrEqual(actionBounds.clientWidth)
  expect(actionBounds.switchLeft).toBeGreaterThanOrEqual(actionBounds.rowLeft)
  expect(actionBounds.switchRight).toBeLessThanOrEqual(actionBounds.rowRight)
  await page.getByRole('button', { name: 'Switch running Pattern' }).click()
  await expect(switchMenu).toBeVisible()
  const menuHeight = await switchMenu.evaluate((element) => element.getBoundingClientRect().height)
  expect(menuHeight).toBeLessThanOrEqual(844 * 0.6 + 1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Switch running Pattern' })).toBeFocused()
  const summaryBounds = await summary.evaluate((element) => {
    const summaryRect = element.getBoundingClientRect()
    const buttonRect = element.closest('button')!.getBoundingClientRect()
    return {
      summaryLeft: summaryRect.left,
      summaryRight: summaryRect.right,
      buttonLeft: buttonRect.left,
      buttonRight: buttonRect.right,
    }
  })
  expect(summaryBounds.summaryLeft).toBeGreaterThanOrEqual(summaryBounds.buttonLeft)
  expect(summaryBounds.summaryRight).toBeLessThanOrEqual(summaryBounds.buttonRight)
  const foldedHeight = await popover.evaluate((element) => element.getBoundingClientRect().height)

  await page.setViewportSize({ width: 1440, height: 900 })
  await power.click()
  await expect(power).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('controller-power-limiting-value')).toHaveText('yes')
  const expandedHeight = await popover.evaluate((element) => element.getBoundingClientRect().height)
  expect(foldedHeight).toBeLessThanOrEqual(500)
  expect(expandedHeight).toBeGreaterThan(foldedHeight)
  expect(expandedHeight).toBeLessThanOrEqual(625)
  await controllerPill.click()
  await controllerPill.click()
  await expect(power).toHaveAttribute('aria-expanded', 'true')

  await page.getByRole('link', { name: 'Open Deck bench profile' }).click()
  await expect(page).toHaveURL(new RegExp(`/studio/controllers/${profile.id}$`))
  const profileUrl = page.url()
  const inventoryPane = page.getByTestId('controller-saved-programs-pane')
  const otherPrograms = page.getByRole('table', { name: 'Other Patterns' })
  await expect(otherPrograms).toBeVisible()
  await expect(otherPrograms.getByLabel('Running now')).toHaveCount(1)
  const runEmberSpire = otherPrograms.getByRole('button', {
    name: 'Run EmberSpire on the Controller',
  })
  const rowActions = runEmberSpire.locator('..')
  await expect(rowActions).toHaveCSS('opacity', '0')
  await runEmberSpire.focus()
  await expect(rowActions).toHaveCSS('opacity', '1')
  await runEmberSpire.click()
  await expect(otherPrograms.getByLabel('Running now')).toHaveCount(1)
  await expect(runEmberSpire).toBeDisabled()
  expect(page.url()).toBe(profileUrl)
  const paneWidth = await inventoryPane.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(paneWidth.scrollWidth).toBeLessThanOrEqual(paneWidth.clientWidth)

  await controllerPill.click()
  await expect(page.getByTestId('controller-panel-popover').locator('span[title="EmberSpire"]'))
    .toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const writes = (window as typeof window & {
      __fakeControllerWrites?: Array<Record<string, unknown>>
    }).__fakeControllerWrites ?? []
    return writes.some((write) => (
      write.activeProgramId === 'E2E866PROGRAM00001' && write.save === true
    ))
  })).toBe(true)
})

test('deletes an inactive managed Controller Pattern and re-arms Studio Save (#870)', async ({ page }) => {
  const controllerId = '192.168.8.224'
  const programId = 'E2E870PROGRAM00001'
  const siblingProgramId = 'E2E870PROGRAM00002'
  const pattern = {
    id: 'e2e-870-pattern',
    name: 'Delete target',
    src: 'export function render(index) { hsv(index / pixelCount, 1, 1) }',
    controls: {},
    updatedAt: Date.now(),
  }
  const profile: ControllerProfile = {
    id: 'e2e-870-controller',
    name: 'Delete bench',
    deviceId: 'pixelblaze_pb32_3cd4ee549434',
    lastKnownDeviceName: 'Delete bench',
    lastSeenIp: controllerId,
    lastKnownPixelCount: 64,
    board: { kind: 'pixelblaze-v3-standard', hardwareRevision: 3.5, firmwareVersion: '3.67' },
    electricalProfile: null,
    inputs: [],
    globalTransforms: [],
    keepPatternsUpToDate: false,
    patternBindings: [],
    zones: [],
    updatedAt: Date.now(),
  }
  const pushRecord = {
    transforms: [],
    artifactHash: 'e2e-870-before-delete',
    sourceHash: artifactHash(pattern.src),
    stampedAt: '2026-08-16T00:00:00.000Z',
    name: pattern.name,
    profileSignature: controllerProfileArtifactSignature(profile, pattern.id, { mapDim: null }),
  }

  for (const [resource, data] of [
    ['controllers', profile],
    ['patterns', pattern],
  ] as const) {
    const response = await page.context().request.post(`/api/${resource}`, { data })
    expect(response.ok(), `POST /api/${resource} -> ${response.status()}`).toBe(true)
  }
  for (const [key, value] of [
    ['controller-bindings', { [controllerId]: { [pattern.id]: programId } }],
    ['controller-push-records', { [controllerId]: { [pattern.id]: pushRecord } }],
  ] as const) {
    const response = await page.context().request.put(`/api/controller-metadata/${key}`, {
      data: { value },
    })
    expect(response.ok(), `PUT /api/controller-metadata/${key} -> ${response.status()}`).toBe(true)
  }

  await installFakeControllerHelper(page, {
    programs: [
      { id: programId, name: pattern.name },
      { id: siblingProgramId, name: 'Spare Pattern' },
    ],
    activeProgramId: siblingProgramId,
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

  const save = page.getByTestId('save-to-controller')
  await expect(save).toBeEnabled()
  await save.click()
  await expect.poll(() => page.evaluate((targetId) => {
    const writes = (window as typeof window & {
      __fakeControllerWrites?: Array<Record<string, unknown>>
    }).__fakeControllerWrites ?? []
    return writes.some((write) => (
      typeof write.setCode === 'object'
      && (write.setCode as { id?: unknown }).id === targetId
    ))
  }, programId)).toBe(true)
  await expect(save).toBeDisabled()

  await controllerPill.click()
  await page.getByRole('link', { name: `Open ${profile.name} profile` }).click()
  await expect(page).toHaveURL(new RegExp(`/studio/controllers/${profile.id}$`))
  const managedTable = page.getByRole('table', { name: 'Saved PXLBLZ Patterns' })
  await expect(managedTable).toBeVisible()
  const targetDelete = managedTable.getByRole('button', {
    name: `Delete ${pattern.name} from the Controller`,
  })
  // The running row's Delete is aria-disabled and describes itself (#871).
  await expect(targetDelete).toBeDisabled()
  await expect(targetDelete).toHaveAttribute('aria-disabled', 'true')
  await expect(targetDelete).toHaveAccessibleDescription(
    'Running now — switch to another Pattern first',
  )

  await page.getByRole('button', { name: 'Run Spare Pattern on the Controller' }).click()
  await expect(targetDelete).toBeEnabled()
  await targetDelete.click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByRole('heading', {
    name: `Delete “${pattern.name}” from ${profile.name}?`,
  })).toBeVisible()
  await expect(dialog).toContainText(
    'The Studio Pattern is not deleted; Save sends it again.',
  )
  const writesBeforeDelete = await page.evaluate(() => (
    (window as typeof window & {
      __fakeControllerWrites?: Array<Record<string, unknown>>
    }).__fakeControllerWrites ?? []
  ).length)
  await dialog.getByRole('button', { name: 'Delete from Controller' }).click()

  await expect(managedTable.getByText(pattern.name, { exact: true })).toHaveCount(0)
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => page.evaluate(({ offset, targetId }) => {
    const writes = (window as typeof window & {
      __fakeControllerWrites?: Array<Record<string, unknown>>
    }).__fakeControllerWrites ?? []
    const deletionWrites = writes.slice(offset)
    return {
      deleted: deletionWrites.filter((write) => write.deleteProgram === targetId).length,
      repushed: deletionWrites.some((write) => 'setCode' in write),
    }
  }, { offset: writesBeforeDelete, targetId: programId })).toEqual({
    deleted: 1,
    repushed: false,
  })

  for (const [key, field] of [
    ['controller-bindings', 'bindings'],
    ['controller-push-records', 'pushRecords'],
  ] as const) {
    const response = await page.context().request.get(`/api/controller-metadata/${key}`)
    expect(response.ok(), `GET /api/controller-metadata/${key} -> ${response.status()}`).toBe(true)
    const body = await response.json() as {
      value?: Record<string, Record<string, unknown>>
    }
    expect(body.value?.[controllerId]?.[pattern.id], `${field} target`).toBeUndefined()
  }
  const patternsResponse = await page.context().request.get('/api/patterns')
  expect(patternsResponse.ok(), `GET /api/patterns -> ${patternsResponse.status()}`).toBe(true)
  const patternsBody = await patternsResponse.json() as { patterns?: Array<{ id: string }> }
  expect(patternsBody.patterns?.some((candidate) => candidate.id === pattern.id)).toBe(true)

  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/studio/patterns/${pattern.id}$`))
  await expect(page.getByTestId('save-to-controller')).toBeEnabled()
})

test('keeps the Shows header inside the center editor pane (#758)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('studio/shows/stock-show-101-clips-cuts-blank-time')

  const geometry = await page.locator('.show-pane-header').evaluate((header) => {
    const editor = header.closest('[data-testid="editor-pane"]')
    const workspace = document.querySelector('[data-testid="show-over-under-workspace"]')
    if (!editor || !workspace) return null

    const headerBounds = header.getBoundingClientRect()
    const editorBounds = editor.getBoundingClientRect()
    const workspaceBounds = workspace.getBoundingClientRect()
    return {
      editorWidth: editorBounds.width,
      headerRight: Math.round(headerBounds.right),
      editorRight: Math.round(editorBounds.right),
      workspaceRight: Math.round(workspaceBounds.right),
    }
  })

  expect(geometry).not.toBeNull()
  expect(geometry!.editorWidth).toBeGreaterThan(0)
  expect(geometry!.headerRight).toBe(geometry!.editorRight)
  expect(geometry!.headerRight).toBe(geometry!.workspaceRight)
})

test('Studio authoring keeps the rail and editor reachable at 390px (#622)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('studio/shows')
  await page.getByRole('button', { name: 'Add show' }).click()
  await page.getByRole('button', { name: 'New show' }).click()
  await page.getByRole('button', { name: 'Create Installation Show' }).click()
  await page.getByRole('button', { name: 'Create Show' }).click()

  await page.setViewportSize({ width: 390, height: 844 })

  for (const route of [
    { path: 'studio/patterns/IridescentFibers', list: 'Patterns' },
    { path: 'studio/maps/plane', list: 'Maps' },
  ]) {
    await page.goto(route.path)

    await expect.poll(
      () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
      `${route.path} should not create document-level horizontal overflow at 390px`,
    ).toBeLessThanOrEqual(1)

    await expect(page.getByRole('button', { name: `Open the ${route.list} list` })).toBeInViewport()
  }

  await page.goto('studio/patterns/IridescentFibers')
  await expect(page.getByTestId('preview-pane')).toBeHidden()
  await expect(page.getByTestId('editor-pane')).toBeInViewport()

  await page.goto('studio/shows')
  await page.getByRole('button', { name: 'Open the Shows list' }).click()
  await page.getByRole('treeitem', { name: 'Untitled Show' }).click()
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    'Show authoring should not create document-level horizontal overflow at 390px',
  ).toBeLessThanOrEqual(1)
  await expect(page.getByRole('button', { name: 'Show properties' })).toBeInViewport()

  // The Learn number is composed from catalogue level and order at runtime.
  await page.getByRole('button', { name: 'Open the Shows list' }).click()
  await page.getByRole('treeitem', { name: /^100/ }).click()
  await page.getByRole('treeitem', { name: /Clips, Cuts, and Blank Time$/ }).click()
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    'A built-in Show with the full guide and deployment header should stay contained at 390px',
  ).toBeLessThanOrEqual(1)

  await expect(page.getByRole('button', { name: 'Open the Shows list' })).toBeInViewport()
})

test('Pattern header controls preserve Space playback and Enter actions (#976)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('studio/patterns/IridescentFibers')
  const preview = page.getByTestId('preview-pane')
  await expect(preview.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  const pin = page.getByRole('button', { name: 'Unpin Patterns list', exact: true })
  await pin.press('Space')
  await expect(preview.getByRole('button', { name: 'Run', exact: true })).toBeVisible()
  await expect(pin).toHaveAttribute('aria-pressed', 'true')
  const add = page.getByRole('button', { name: 'Add pattern', exact: true })
  await add.press('Space')
  await expect(preview.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
  await expect(add).toHaveAttribute('aria-expanded', 'false')
  await add.press('Enter')
  await expect(page.getByRole('button', { name: 'New pattern', exact: true })).toBeVisible()
  await add.press('Escape')
  const dimension = page.getByRole('group', { name: 'Dimension filter', exact: true }).getByRole('button', { name: '2D', exact: true })
  await dimension.press('Space')
  await expect(preview.getByRole('button', { name: 'Run', exact: true })).toBeVisible()
  await expect(dimension).toHaveAttribute('aria-pressed', 'false')
  await dimension.press('Enter')
  await expect(dimension).toHaveAttribute('aria-pressed', 'true')
})

test('rail search stays inside the list pane at narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 507, height: 520 })
  await page.goto('studio/patterns/IridescentFibers')
  await page.getByRole('button', { name: 'Open the Patterns list' }).click()
  const searchInput = page.getByRole('textbox', { name: 'Search patterns', exact: true })
  await expect(searchInput).toBeVisible()
  const dimensionFilter = page.getByRole('group', { name: 'Dimension filter', exact: true })
  await dimensionFilter.getByRole('button', { name: '2D', exact: true }).click()
  await expect(dimensionFilter.getByRole('button', { name: '2D', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await searchInput.fill('no-such-pattern-976')
  await expect(page.getByRole('region', { name: 'Patterns', exact: true }).getByRole('status')).toHaveText(/0 of \d+/)
  await searchInput.press('Escape')
  await expect(searchInput).toHaveValue('')
  await expect(searchInput).toBeFocused()

  const bounds = await searchInput.evaluate((input) => {
    const inputBounds = input.getBoundingClientRect()
    const railBounds = input.closest('[data-testid="studio-rail"]')?.getBoundingClientRect()
    return {
      inputLeft: inputBounds.left,
      inputRight: inputBounds.right,
      inputWidth: inputBounds.width,
      headerHeight: input.closest('.rail-entity-row')?.getBoundingClientRect().height,
      railLeft: railBounds?.left,
      railRight: railBounds?.right,
    }
  })

  expect(bounds.inputLeft).toBeGreaterThanOrEqual(bounds.railLeft ?? Number.POSITIVE_INFINITY)
  expect(bounds.inputRight).toBeLessThanOrEqual(bounds.railRight ?? Number.NEGATIVE_INFINITY)
  expect(bounds.inputWidth).toBeGreaterThanOrEqual(120)
  expect(bounds.headerHeight).toBe(40)

  await searchInput.press('Escape')
  await page.setViewportSize({ width: 1440, height: 720 })
  const librarySplitter = page.getByRole('separator', { name: 'Resize library pane', exact: true })
  for (let step = 0; step < 4; step += 1) await librarySplitter.press('Shift+ArrowLeft')
  await expect(librarySplitter).toHaveAttribute('aria-valuenow', '240')
  await searchInput.hover()

  const minimumRailHoverBounds = await searchInput.evaluate((input) => {
    const inputBounds = input.getBoundingClientRect()
    const railBounds = input.closest('[data-testid="studio-rail"]')?.getBoundingClientRect()
    return { inputLeft: inputBounds.left, inputWidth: inputBounds.width, inputRight: inputBounds.right, railLeft: railBounds?.left, railRight: railBounds?.right }
  })
  expect(minimumRailHoverBounds.inputLeft).toBeGreaterThanOrEqual(
    minimumRailHoverBounds.railLeft ?? Number.POSITIVE_INFINITY,
  )
  expect(minimumRailHoverBounds.inputWidth).toBeGreaterThanOrEqual(120)
  expect(minimumRailHoverBounds.inputRight).toBeLessThanOrEqual(minimumRailHoverBounds.railRight ?? Number.NEGATIVE_INFINITY)
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
  await previewPane.getByRole('button', { name: 'Controls', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Variables', exact: true })).toBeInViewport()

  await page.goto('studio/shows/stock-show-showcase-redline-installation')
  const showSplitter = page.getByRole('separator', { name: 'Resize timeline and Stage' })
  const showStrip = page.getByTestId('show-stage-strip')
  // Content fitting may open at the strip minimum. Establish an interior
  // manual split before checking the existing 50 px downward step (#977).
  await showSplitter.press('Shift+ArrowUp')
  await showSplitter.press('Shift+ArrowUp')
  await expect.poll(async () => (await showStrip.boundingBox())?.height ?? 0).toBeGreaterThan(190)
  const initialStripHeight = (await showStrip.boundingBox())?.height ?? 0
  await showSplitter.press('Shift+ArrowDown')
  await expect.poll(async () => (await showStrip.boundingBox())?.height ?? 0)
    .toBe(initialStripHeight - 50)
  const showControls = page.getByTestId('show-stage-controls')
  await showControls.hover()
  await page.mouse.wheel(0, 1200)
  await expect(showControls.getByRole('button', { name: 'Renderer' })).toBeInViewport()
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
  await expect(page.getByLabel(/^Current:/)).toBeVisible()

  await page.getByRole('checkbox', { name: 'Limit power' }).check()
  const pushAgain = page.getByLabel(/^Push again:/)
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
  await expect(page.getByLabel(/^Current:/)).toBeVisible()
  await expect(page.getByLabel(/^Push again:/)).toHaveCount(0)

  await page.getByRole('button', { name: pattern.name, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/studio/patterns/${pattern.id}$`))
  const editedSource = 'export function render(index) { hsv(index / pixelCount, 1, wave(time(0.1))) }'
  const editor = page.locator('.monaco-editor').first()
  await expect(editor).toBeVisible()
  await expect(editor.locator('.view-lines')).toBeVisible()
  const sourceSaved = page.waitForResponse((response) => {
    const request = response.request()
    if (request.method() !== 'PATCH') return false
    if (!new URL(response.url()).pathname.endsWith(`/api/patterns/${pattern.id}`)) return false
    const changes = request.postDataJSON() as { src?: string }
    return response.ok() && changes.src === editedSource
  })
  await replaceEditorSource(page, editor, editedSource)
  await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
  await sourceSaved

  const patternsResponse = await page.context().request.get('/api/patterns')
  expect(patternsResponse.ok(), `GET /api/patterns -> ${patternsResponse.status()}`).toBe(true)
  const patternsBody = await patternsResponse.json() as { patterns?: Array<{ id: string; src: string }> }
  expect(patternsBody.patterns?.find((item) => item.id === pattern.id)?.src).toBe(editedSource)

  await controllerPill.click()
  await page.getByRole('link', { name: `Open ${profile.name} profile` }).click()
  await expect(page.getByLabel(/^Push again:/)).toBeVisible()
  await expect(page.getByLabel(/^Current:/)).toHaveCount(0)
})

test('selecting a persisted degenerate fallback map signals that its bake needs repair (#817)', async ({ page }) => {
  const map = {
    id: 'e2e-817-degenerate-map',
    name: 'Broken fallback map',
    dim: 2,
    generator: 'custom',
    params: {},
    points: [[0, 0], [1 / 3, 0], [2 / 3, 0], [1, 0]],
    gridDims: { cols: 4, rows: 1 },
    source: '',
    updatedAt: Date.now(),
  }
  const created = await page.context().request.post('/api/maps', { data: map })
  expect(created.ok(), `POST /api/maps -> ${created.status()}`).toBe(true)

  await page.goto('studio/patterns/IridescentFibers')
  const mapSelect = page.getByRole('button', { name: 'Map', exact: true })
  await expect(mapSelect).toBeVisible()
  await expect(page.getByTestId('map-bake-status')).toHaveCount(0)

  await mapSelect.click()
  await page.getByRole('option', { name: map.name, exact: true }).click()

  await expect(mapSelect).toContainText(map.name)
  const warning = page.getByRole('status', { name: /Map "Broken fallback map" needs repair/ })
  await expect(warning).toHaveAttribute('data-state', 'needs-repair')
  await expect(warning).toHaveAttribute('title', /degenerate fallback bake/)

  await mapSelect.click()
  await page.getByRole('option', { name: 'Square', exact: true }).click()
  await expect(warning).toHaveCount(0)
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
    await replaceEditorSource(page, editor, editedSource)
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
    await replaceEditorSource(page, editor, 'export function render(index) { var = 3 }')
    await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'broken')

    // Broken source pauses autosave by design; the glyph says so immediately.
    const glyph = page.getByTestId('save-status')
    await expect(glyph).toHaveAttribute('data-state', 'wont-save')
    await expect(glyph).toHaveAttribute('title', /Changes not saved/)

    // Fixing the source resumes autosave and returns the header to silence.
    await replaceEditorSource(page, editor, 'export function render(index) { hsv(1, 1, 1) }')
    await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')
    await expect(glyph).toHaveCount(0)
  })

  test.describe('Pattern departure persistence (#818)', () => {
    // Monaco can reject an in-flight model request with this exact error when
    // the Pattern editor unmounts. The navigation is the behavior under test.
    test.use({ allowedBrowserErrors: [/^pageerror: Canceled$/] })

    test('broken Pattern source persists on navigation and reopens without stale pixels (#818)', async ({ page }) => {
      const pattern = {
        id: 'e2e-831-broken-navigation',
        name: 'Broken navigation bench',
        src: 'export function render(index) { hsv(index / pixelCount, 1, 1) }',
        controls: {},
        updatedAt: Date.now(),
      }
      const brokenSource = 'export function render(index) { var = 3 }'
      const created = await page.context().request.post('/api/patterns', { data: pattern })
      expect(created.ok(), `POST /api/patterns -> ${created.status()}`).toBe(true)

      await page.goto(`studio/patterns/${pattern.id}`)
      const editor = page.locator('.monaco-editor').first()
      await expect(editor.locator('.view-lines')).toBeVisible()

      // Seed a same-document Forward target without unmounting Monaco: the
      // button-driven Gallery path is covered below and in App tests, while this
      // setup isolates popstate from Monaco's expected cancellation on remount.
      await page.evaluate(() => {
        const appBase = window.location.pathname.split('/studio/')[0]
        window.history.pushState(null, '', `${appBase}/gallery`)
      })
      await page.goBack()
      await expect(page).toHaveURL(new RegExp(`/studio/patterns/${pattern.id}$`))
      await expect(editor.locator('.view-lines')).toBeVisible()

      // Reproduce the publication-only race deterministically: Monaco can
      // lose the first select-all keydown even after its textarea has focus.
      await editor.getByRole('textbox', { name: MONACO_TEXTBOX_NAME }).evaluate((input) => {
        const swallowFirstSelectAll = (event: KeyboardEvent) => {
          if (!event.ctrlKey || event.code !== 'KeyA') return
          event.preventDefault()
          event.stopImmediatePropagation()
          input.removeEventListener('keydown', swallowFirstSelectAll, true)
        }
        input.addEventListener('keydown', swallowFirstSelectAll, true)
      })

      await replaceEditorSource(page, editor, brokenSource)
      await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'broken')

      const studioUrl = new RegExp(`/studio/patterns/${pattern.id}$`)
      await page.goForward()

      await expect(page).toHaveURL(/\/gallery$/)
      await expect(page.getByRole('alertdialog', { name: 'Discard broken source?' })).toHaveCount(0)
      await expect(page.getByTestId('gallery-page')).toBeVisible()
      const patterns = await page.context().request.get('/api/patterns')
      expect(patterns.ok(), `GET /api/patterns -> ${patterns.status()}`).toBe(true)
      const body = await patterns.json() as { patterns?: Array<{ id: string; src: string }> }
      expect(body.patterns?.find((item) => item.id === pattern.id)?.src).toBe(brokenSource)

      // Opening the durable record again restores the exact authored text, but
      // the prior Pattern's canvas is covered until this source becomes valid.
      // Keep this same-document so Monaco's expected hard-reload cancellation
      // does not obscure the product behavior under test.
      await page.goBack()
      await expect(page).toHaveURL(studioUrl)
      await expect(editor.locator('.view-lines')).toContainText('var = 3')
      await expect(page.getByTestId('preview-unavailable')).toContainText('Fix the source errors to restart it.')
    })
  })

  test('a failed Pattern departure save keeps the edit open and retries on navigation (#818)', async ({ page }) => {
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
    const patternBRow = page
      .getByRole('tree', { name: 'Patterns', exact: true })
      .getByRole('treeitem')
      .filter({ hasText: patternB.name })

    let blockWrites = true
    await page.route('**/api/patterns/**', (route) => {
      if (blockWrites && ['PATCH', 'PUT'].includes(route.request().method())) return route.abort()
      return route.continue()
    })

    const editedSource = 'export function render(index) { hsv(index / pixelCount, 1, wave(time(0.2))) }'
    await replaceEditorSource(page, editor, editedSource)
    await expect(page.getByTestId('compile-status')).toHaveAttribute('data-status', 'good')

    // A failed departure write leaves the complete Pattern A state in place.
    await patternBRow.click()
    await expect(page).toHaveURL(new RegExp(`/studio/patterns/${patternA.id}$`))
    await expect(editor.locator('.view-lines')).toContainText('wave(time(0.2))')
    await expect(page.getByTestId('navigation-save-failure')).toHaveCount(0)
    await expect(page.getByTestId('save-status')).toHaveAttribute('data-state', 'cant-save', TICK)

    // A later navigation request is the retry. It saves the same exact source
    // first, then allows Pattern B to replace the editor.
    blockWrites = false
    await patternBRow.click()
    await expect(page).toHaveURL(new RegExp(`/studio/patterns/${patternB.id}$`))
    const patterns = await page.context().request.get('/api/patterns')
    expect(patterns.ok(), `GET /api/patterns -> ${patterns.status()}`).toBe(true)
    const body = await patterns.json() as { patterns?: Array<{ id: string; src: string }> }
    expect(body.patterns?.find((item) => item.id === patternA.id)?.src).toBe(editedSource)
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
    await replaceEditorSource(page, editor, editedSource)
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

test.describe('one-shot Studio operation failure feedback (#830)', () => {
  test.use({ allowedBrowserErrors: [/net::ERR_FAILED|Failed to fetch/] })

  test('a failed stock Pattern Clone stays on the stock record and retries the captured clone', async ({ page }) => {
    let blockClone = true
    await page.route('**/api/patterns', (route) => {
      if (blockClone && route.request().method() === 'POST') return route.abort()
      return route.continue()
    })
    await page.goto('studio/patterns/TestPattern1D')
    await expect(page.getByText('TestPattern1D', { exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Pattern actions' }).click()
    await page.getByRole('menuitem', { name: 'Clone into Patterns' }).click()

    const notice = page.getByTestId('studio-editor-operation-failure')
    await expect(notice).toContainText('Could not clone pattern "TestPattern1D".')
    await expect(page).toHaveURL(/\/studio\/patterns\/TestPattern1D$/)

    blockClone = false
    await notice.getByRole('button', { name: studioOperationRetryLabelFor('clone', 'pattern', 'TestPattern1D') }).click()

    await expect(notice).toHaveCount(0)
    await expect(page).toHaveURL(/\/studio\/patterns\/[a-z0-9-]+$/)
    await expect(page.getByRole('button', { name: 'Rename pattern TestPattern1D' })).toBeVisible()
  })

  test('a failed rail rename preserves the durable name and retries the requested name', async ({ page, request }) => {
    const pattern = {
      id: 'e2e-830-rename',
      name: 'Durable Rename Bench',
      src: 'export function render(index) { hsv(index / pixelCount, 1, 1) }',
      controls: {},
      updatedAt: Date.now(),
    }
    const created = await request.post('/api/patterns', { data: pattern })
    expect(created.ok(), `POST /api/patterns -> ${created.status()}`).toBe(true)
    let blockRename = true
    await page.route(`**/api/patterns/${pattern.id}`, (route) => {
      if (blockRename && route.request().method() === 'PATCH') return route.abort()
      return route.continue()
    })
    await page.goto(`studio/patterns/${pattern.id}`)

    await page.getByRole('treeitem', { name: pattern.name, exact: true }).hover()
    await page.getByRole('button', { name: `More actions for ${pattern.name}` }).click()
    await page.getByRole('button', { name: 'Rename', exact: true }).click()
    const requestedName = 'Requested Rename Bench'
    await page.getByRole('textbox', { name: 'Rename item' }).fill(requestedName)
    await page.getByRole('textbox', { name: 'Rename item' }).press('Enter')

    const notice = page.getByTestId('studio-rail-operation-failure')
    await expect(notice).toContainText(`Could not rename pattern "${pattern.name}".`)
    await expect(page.getByRole('treeitem', { name: pattern.name, exact: true })).toBeVisible()
    await expect(page.getByRole('treeitem', { name: requestedName, exact: true })).toHaveCount(0)

    blockRename = false
    await notice.getByRole('button', { name: studioOperationRetryLabelFor('rename', 'pattern', pattern.name) }).click()

    await expect(notice).toHaveCount(0)
    await expect(page.getByRole('treeitem', { name: requestedName, exact: true })).toBeVisible()
  })

  test('a failed permanent Pattern Delete keeps the record open until Retry succeeds', async ({ page, request }) => {
    const pattern = {
      id: 'e2e-830-delete',
      name: 'Durable Delete Bench',
      src: 'export function render(index) { hsv(index / pixelCount, 1, 1) }',
      controls: {},
      updatedAt: Date.now(),
    }
    const created = await request.post('/api/patterns', { data: pattern })
    expect(created.ok(), `POST /api/patterns -> ${created.status()}`).toBe(true)
    let blockDelete = true
    await page.route(`**/api/patterns/${pattern.id}`, (route) => {
      if (blockDelete && route.request().method() === 'DELETE') return route.abort()
      return route.continue()
    })
    await page.goto(`studio/patterns/${pattern.id}`)

    await page.getByRole('button', { name: 'Pattern actions' }).click()
    await page.getByRole('menuitem', { name: 'Delete pattern' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    const notice = page.getByTestId('studio-editor-operation-failure')
    await expect(notice).toContainText(`Could not delete pattern "${pattern.name}".`)
    await expect(page).toHaveURL(new RegExp(`/studio/patterns/${pattern.id}$`))
    await expect(page.getByRole('button', { name: `Rename pattern ${pattern.name}` })).toBeVisible()

    blockDelete = false
    await notice.getByRole('button', { name: studioOperationRetryLabelFor('delete', 'pattern', pattern.name) }).click()

    await expect(notice).toHaveCount(0)
    await expect(page).toHaveURL(/\/studio\/patterns$/)
    const patterns = await request.get('/api/patterns')
    const body = await patterns.json() as { patterns: Array<{ id: string }> }
    expect(body.patterns.some((candidate) => candidate.id === pattern.id)).toBe(false)
  })
})

for (const subject of [
  { place: 'Shows', route: 'studio/shows/stock-show-100-getting-around', play: 'Play Show preview', pause: 'Pause Show preview' },
  { place: 'Patterns', route: 'studio/patterns/IridescentFibers', play: 'Run', pause: 'Pause' },
]) {
  test(`${subject.place} edge pointer focus and held Space preserve playback ownership (#979)`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(subject.route)
    const transport = subject.place === 'Shows' ? page.getByTestId('show-timeline-toolbar') : page
    const play = transport.getByRole('button', { name: subject.play, exact: true })
    const pause = transport.getByRole('button', { name: subject.pause, exact: true })
    await expect(play.or(pause)).toBeVisible()
    if (await pause.count()) await pause.click()
    await page.getByRole('button', { name: `Unpin ${subject.place} list` }).click()
    const layout = page.getByTestId('studio-drawer-layout')
    const edge = page.getByTestId('studio-drawer-edge-tab')
    await edge.click()
    await expect(layout).toHaveAttribute('data-drawer-mode', 'open')
    await page.mouse.move(1000, 500)
    await expect(layout).toHaveAttribute('data-drawer-mode', 'tucked')
    await expect(edge).not.toBeFocused()
    await page.keyboard.down('Space')
    await expect(pause).toBeVisible()
    await expect(edge).not.toBeFocused()
    await page.keyboard.down('Space')
    await expect(pause).toBeVisible()
    await page.keyboard.up('Space')
    if (process.env.PXLBLZ_EDGE_CAPTURE) await page.screenshot({ path: `${process.env.PXLBLZ_EDGE_CAPTURE}-${subject.place.toLowerCase()}.png` })
    await expect(layout).toHaveAttribute('data-drawer-mode', 'tucked')
    await page.keyboard.press('Space')
    await expect(play).toBeVisible()

    await edge.focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(edge).toBeFocused()
    await page.keyboard.down('Space')
    await expect(pause).toBeVisible()
    await page.keyboard.down('Space')
    await expect(pause).toBeVisible()
    await page.keyboard.up('Space')
    await expect(edge).toBeFocused()
    await page.keyboard.press('Space')
    await expect(play).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(layout).toHaveAttribute('data-drawer-mode', 'open')
    const search = page.getByRole('textbox', { name: `Search ${subject.place.toLowerCase()}` })
    await expect(search).toBeFocused()
    await search.fill('Test')
    await search.press('Space')
    await expect(search).toHaveValue('Test ')
    await expect(play).toBeVisible()
    await search.press('Escape')
    await expect(search).toHaveValue('')
    await expect(search).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(search).not.toBeFocused()
    await page.keyboard.press('Escape')
    await expect(layout).toHaveAttribute('data-drawer-mode', 'tucked')
    await expect(edge).toBeFocused()
  })
}

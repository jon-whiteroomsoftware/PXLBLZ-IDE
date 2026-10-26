import { test, expect, removeSyntheticContent } from './fixtures/authenticated'
import { MONACO_TEXTBOX_NAME } from './support/editorSource'
import type { APIRequestContext, Page } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { installFakeControllerHelper, type SharedFakeControllerPrograms } from './fixtures/fakeControllerHelper'
import { createSessionToken, sessionCookieName } from '../src/cloudflare/auth'
import { readDevVarsFile } from '../scripts/dev-runtime-auth'
import { accountSlotForSequence, allocatePersistedAccountSequence } from '../scripts/authenticated-playwright-harness'
import { authenticatedPlaywrightAccountIndex, authenticatedPlaywrightUser } from '../scripts/authenticated-playwright-user'
import { makeProgramId } from '../src/engine/bytecodePush'
import { decodePbp, encodePbp } from '../src/engine/pbpEncode'
import { stampArtifact } from '../src/engine/artifactStamp'
import { bundleWithPasses } from '../src/engine/passEngine'
import { loadPattern } from '../src/engine/loadPattern'
import { createShim } from '../src/engine/shim'
import { createPlaneMap } from '../src/engine/maps/plane'
import type { ControllerProfile } from '../src/engine/controllerProfile'
import type { PatternRecord } from '../src/engine/personalContentRecords'
import type { ControllerPatternImportLedger } from '../src/engine/controllerPatternImport'
import { sha256ControllerProgram } from '../src/engine/controllerPatternImport'

const ip = '192.168.8.224'
const deviceId = 'pixelblaze_pb32_005544332211'
const slot = makeProgramId(() => 0)
const canonicalSlot = makeProgramId(() => 0.3)
const partialSlot = makeProgramId(() => 0.6)
const notice = 'Imported wrapped source. Its old Controller profile behavior remains; this Controller profile is not applied.'
const source = 'export function render(i) { rgb(0.8, 0.4, 0.2) }'
function profile(id: string, pin: number): ControllerProfile {
  return { id, name: 'Import fixture Controller', deviceId, lastKnownDeviceName: 'Import fixture Controller',
    lastSeenIp: ip, board: { kind: 'pixelblaze-v3-standard' },
    inputs: [{ id: 'pot', name: 'Brightness', pin, signal: 'analog', smoothing: 1, fallback: 0.5, invert: false }],
    globalTransforms: [{ id: 'hardware-brightness', type: 'hardware-brightness', enabled: true,
      mixinId: 'builtin:hardware-brightness', inputId: 'pot', mode: 'multiply-output' }],
    patternBindings: [], keepPatternsUpToDate: false, updatedAt: Date.now() }
}
async function json<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(`/api/${path}`)
  expect(response.ok(), `GET ${path}: ${response.status()}`).toBe(true)
  return response.json() as Promise<T>
}
async function seed(request: APIRequestContext, resource: string, data: unknown) {
  const response = await request.post(`/api/${resource}`, { data })
  expect(response.ok(), `POST ${resource}: ${response.status()}`).toBe(true)
}
async function metadata(request: APIRequestContext, key: string, value: unknown) {
  const response = await request.put(`/api/controller-metadata/${key}`, { data: { value } })
  expect(response.ok(), `PUT ${key}: ${response.status()}`).toBe(true)
}
async function connect(page: Page) {
  const button = page.getByRole('button', { name: 'Connect a Controller', exact: true })
  if (await button.isVisible()) {
    await button.click()
    await page.getByRole('textbox', { name: 'Controller IP address' }).fill(ip)
    await page.getByTestId('controller-go').click()
  }
  await expect(page.getByTestId('controller-pill')).toHaveAttribute('data-phase', 'live')
}
async function helper(page: Page, programs: SharedFakeControllerPrograms) {
  await installFakeControllerHelper(page, { address: ip, programs: [], activeProgramId: 'OTHER000000000001',
    deviceName: 'Import fixture Controller', boardType: 'pb32', mac: '11:22:33:44:55:00',
    pixelCount: 2, sequencerMode: 0, runSequencer: false }, programs)
}
function numeric(stored: string) {
  const bundled = bundleWithPasses(stored, {}, [])
  const shim = createShim({ mapPoints: createPlaneMap({ rows: 1, cols: 2 }).resolve(2), pixelCount: 2,
    dimensions: 1, getVirtualTime: () => 0 })
  const pins: number[] = []
  const pattern = loadPattern(bundled.code, bundled.metadata, { ...shim.builtins, analogRead: (pin: number) => {
    pins.push(pin); return pin === 36 ? 0.5 : 0.25
  } })
  pattern.beforeRender(16)
  pattern.render(0)
  return { rgb: shim.capturedPixel(), pins }
}
async function capture(page: Page, name: string) {
  const directory = process.env.PXLBLZ_IMPORT_CAPTURE_DIR
  if (!directory) return
  await mkdir(directory, { recursive: true })
  await page.screenshot({ path: join(directory, `${name}.png`) })
}
async function save(page: Page) {
  const row = page.getByTestId('controller-action-row')
  if (!await row.isVisible()) await page.getByTestId('controller-pill').click()
  const button = row.getByRole('button', { name: 'Save', exact: true })
  await expect(button).toBeEnabled()
  await button.click()
  await expect(button).toBeDisabled()
}
async function snapshot(request: APIRequestContext) {
  return {
    patterns: await json<{ patterns: PatternRecord[] }>(request, 'patterns'),
    bindings: await json(request, 'controller-metadata/controller-bindings'),
    pushes: await json(request, 'controller-metadata/controller-push-records'),
  }
}

test('single-slot cross-account import preserves wrapped behavior, recovers canonical source and resumes bookkeeping (#1221)', async ({ page: a, browser, baseURL }, testInfo) => {
  // This sequence uses real API ownership, relay framing, PBP decoding and UI Save.
  test.setTimeout(120_000)
  const programs: SharedFakeControllerPrograms = new Map()
  const seedPbp = (id: string, name: string, sourceCode = source) => {
    programs.set(id, { name, pbpBase64: Buffer.from(encodePbp({ id, name, sourceCode, byteCode: new Uint8Array(8) })).toString('base64') })
  }
  seedPbp(slot, 'A private Pattern')
  seedPbp('OTHER000000000001', 'Other control')
  seedPbp('BOUND000000000001', 'Bound control')
  await helper(a, programs)
  await a.setViewportSize({ width: 1440, height: 1000 })
  const aRequest = a.context().request
  const aPattern: PatternRecord = { id: 'account-a-pattern', name: 'A private Pattern', src: source, controls: {}, updatedAt: Date.now() }
  await seed(aRequest, 'patterns', aPattern)
  await seed(aRequest, 'controllers', profile('account-a-profile', 36))
  await metadata(aRequest, 'controller-pattern-imports', { version: 1, byPatternId: {} })
  await metadata(aRequest, 'controller-push-records', {})
  await metadata(aRequest, 'controller-bindings', { [ip]: { [aPattern.id]: slot } })
  await a.goto(`studio/patterns/${aPattern.id}`)
  await connect(a)
  await save(a)
  await expect.poll(() => numeric(decodePbp(new Uint8Array(Buffer.from(programs.get(slot)!.pbpBase64, 'base64')))!.sourceCode).pins).toContain(36)
  const original = structuredClone(programs.get(slot)!)
  expect(numeric(decodePbp(new Uint8Array(Buffer.from(original.pbpBase64, 'base64')))!.sourceCode).rgb)
    .toEqual([0.4, 0.2, 0.1])
  const aBefore = await snapshot(aRequest)
  const siblingBefore = structuredClone([...programs].filter(([id]) => id !== slot))

  const sequence = allocatePersistedAccountSequence(process.env.PXLBLZ_D1_PERSIST_TO?.trim() || undefined, testInfo.parallelIndex)
  const accountIndex = authenticatedPlaywrightAccountIndex(testInfo.parallelIndex, accountSlotForSequence(sequence))
  const secret = readDevVarsFile(process.env.PXLBLZ_DEV_VARS_FILE!).SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is required in the authenticated test dev-vars file')
  const token = await createSessionToken(authenticatedPlaywrightUser(accountIndex), secret)
  const bContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, storageState: {
    cookies: [{ name: sessionCookieName, value: token, domain: 'localhost', path: '/', httpOnly: true,
      secure: false, sameSite: 'Lax', expires: -1 }], origins: [],
  } })
  const b = await bContext.newPage()
  const errors: string[] = []
  let expectedMetadataFailure = false
  b.on('pageerror', (error) => errors.push(error.message))
  b.on('console', (message) => {
    if (message.type() === 'error' && !(expectedMetadataFailure && message.text().includes('503'))) errors.push(message.text())
  })
  try {
    const request = bContext.request
    await removeSyntheticContent(request)
    await helper(b, programs)
    await seed(request, 'controllers', profile('account-b-profile', 35))
    await metadata(request, 'controller-pattern-imports', { version: 1, byPatternId: {} })
    await metadata(request, 'controller-push-records', {})
    await seed(request, 'patterns', { id: 'b-control', name: 'Bound control', src: source, controls: {}, updatedAt: Date.now() })
    await metadata(request, 'controller-bindings', { [ip]: { 'b-control': 'BOUND000000000001' } })
    await b.goto('studio/controllers/account-b-profile')
    await connect(b)
    const unimported = b.getByRole('table', { name: 'Unimported PXLBLZ Patterns', exact: true })
    await expect(unimported).toContainText(aPattern.name)
    await expect(b.getByRole('table', { name: 'Other Patterns', exact: true })).toContainText('Other control')
    await expect(b.getByRole('table', { name: 'Saved PXLBLZ Patterns', exact: true })).toContainText('Bound control')
    expect(await b.evaluate(() => (window as unknown as { __fakeControllerWrites: Record<string, unknown>[] }).__fakeControllerWrites.filter((entry) => 'readProgram' in entry))).toEqual([])
    const before = await json<{ patterns: PatternRecord[] }>(request, 'patterns')
    expect(before.patterns.some((p) => p.id === aPattern.id)).toBe(false)
    await capture(b, 'B-before-desktop')
    await b.setViewportSize({ width: 760, height: 1000 })
    await expect(unimported).toBeVisible()
    await capture(b, 'B-before-narrow')
    await b.setViewportSize({ width: 1440, height: 1000 })
    const importButton = unimported.getByRole('button', { name: `Import ${aPattern.name}`, exact: true })
    await importButton.focus()
    await expect(importButton).toBeFocused()
    await importButton.press('Enter')
    const dialog = b.getByRole('alertdialog')
    await expect(dialog.getByRole('heading')).toHaveText('Import PXLBLZ Pattern?')
    expect(await b.evaluate(() => (window as unknown as { __fakeControllerWrites: Record<string, unknown>[] }).__fakeControllerWrites.filter((entry) => 'readProgram' in entry))).toEqual([])
    await dialog.getByRole('button', { name: 'Import and save', exact: true }).click()
    await expect(b).toHaveURL(/\/studio\/patterns\//)
    const importedId = new URL(b.url()).pathname.split('/').at(-1)!
    expect(importedId).not.toBe(aPattern.id)
    const after = await json<{ patterns: PatternRecord[] }>(request, 'patterns')
    expect(after.patterns.filter((p) => !before.patterns.some((old) => old.id === p.id))).toHaveLength(1)
    expect(after.patterns.find((p) => p.id === importedId)?.src).toBe(decodePbp(new Uint8Array(Buffer.from(original.pbpBase64, 'base64')))!.sourceCode)
    const ledger = await json<{ value: ControllerPatternImportLedger }>(request, 'controller-metadata/controller-pattern-imports')
    expect(ledger.value.byPatternId[importedId]).toMatchObject({ patternId: importedId, programId: slot, controllerDeviceId: deviceId, sourceMode: 'stored-artifact', stage: 'complete' })
    expect(await json(request, 'controller-metadata/controller-bindings')).toEqual({ value: { [ip]: { 'b-control': 'BOUND000000000001', [importedId]: slot } } })
    expect(programs.get(slot)).toEqual(original)
    expect([...programs].filter(([id]) => id !== slot)).toEqual(siblingBefore)
    expect(await snapshot(aRequest)).toEqual(aBefore)
    await expect(b.getByText(notice, { exact: true })).toBeVisible()
    await b.reload()
    await connect(b)
    await expect(b.getByText(notice, { exact: true })).toBeVisible()
    const editor = b.locator('.monaco-editor').first().getByRole('textbox', { name: MONACO_TEXTBOX_NAME })
    await expect(editor).toBeVisible()
    await capture(b, 'wrapped-notice')
    const saved = b.waitForResponse((response) => response.request().method() === 'PATCH'
      && new URL(response.url()).pathname.endsWith(`/api/patterns/${importedId}`)
      && response.ok() && String(response.request().postDataJSON().src ?? '').includes('Account B edit'))
    await editor.focus()
    await editor.press('Control+End')
    await editor.press('End')
    await editor.press('Enter')
    await b.keyboard.type('// Account B edit')
    await saved
    await expect(b.getByText(notice, { exact: true })).toBeVisible()
    await save(b)
    await expect.poll(() => decodePbp(new Uint8Array(Buffer.from(programs.get(slot)!.pbpBase64, 'base64')))!.sourceCode)
      .toContain('Account B edit')
    const edited = numeric(decodePbp(new Uint8Array(Buffer.from(programs.get(slot)!.pbpBase64, 'base64')))!.sourceCode)
    expect(edited.rgb).toEqual([0.4, 0.2, 0.1])
    expect(edited.pins).toContain(36)
    expect(edited.pins).not.toContain(35)
    const actionRow = b.getByTestId('controller-action-row')
    const saveButton = actionRow.getByRole('button', { name: 'Save', exact: true })
    const runButton = actionRow.getByRole('button', { name: 'Run', exact: true })
    await expect(saveButton).toHaveAttribute('aria-disabled', 'true')
    await expect(saveButton).toHaveJSProperty('disabled', false)
    await capture(b, 'stored-clean-save')
    await expect(runButton).not.toHaveAttribute('aria-disabled', 'true')
    await runButton.click()
    await expect(runButton).toBeDisabled()
    await expect(runButton).toHaveAttribute('aria-disabled', 'true')
    await expect(runButton).toHaveJSProperty('disabled', false)
    await expect(saveButton).toHaveAttribute('aria-disabled', 'true')
    expect(numeric(decodePbp(new Uint8Array(Buffer.from(programs.get(slot)!.pbpBase64, 'base64')))!.sourceCode)).toEqual(edited)
    await capture(b, 'stored-clean-run')
    await b.goto('studio/controllers/account-b-profile')
    await expect(b.getByRole('table', { name: 'Saved PXLBLZ Patterns', exact: true })).toContainText(aPattern.name)
    await capture(b, 'B-after-desktop')
    await b.setViewportSize({ width: 760, height: 1000 })
    await capture(b, 'B-after-narrow')
    await b.setViewportSize({ width: 1440, height: 1000 })

    // Exact stock source with no transforms is independently recoverable.
    const demo = await readFile(new URL('../src/pixelblaze/stock/patterns/TestPattern1D.js', import.meta.url), 'utf8')
    seedPbp(canonicalSlot, 'Canonical demo', stampArtifact(bundleWithPasses(demo, {}, []).code,
      { kind: 'pattern', id: 'demo:TestPattern1D', name: 'Canonical demo' }))
    seedPbp(partialSlot, 'Partial import', decodePbp(new Uint8Array(Buffer.from(original.pbpBase64, 'base64')))!.sourceCode)
    await b.reload()
    await connect(b)
    await b.getByRole('button', { name: 'Import Canonical demo', exact: true }).click()
    await b.getByRole('alertdialog').getByRole('button', { name: 'Import and save', exact: true }).click()
    await expect(b).toHaveURL(/\/studio\/patterns\//)
    const canonicalId = new URL(b.url()).pathname.split('/').at(-1)!
    const canonicalLedger = await json<{ value: ControllerPatternImportLedger }>(request, 'controller-metadata/controller-pattern-imports')
    expect(canonicalLedger.value.byPatternId[canonicalId]).toMatchObject({ programId: canonicalSlot, sourceMode: 'authored-verified', stage: 'complete' })
    expect(numeric(decodePbp(new Uint8Array(Buffer.from(programs.get(canonicalSlot)!.pbpBase64, 'base64')))!.sourceCode))
      .toEqual({ rgb: [0.25, 0.25, 0.25], pins: [35] })
    await expect(b.getByText(notice, { exact: true })).toHaveCount(0)

    await b.goto('studio/controllers/account-b-profile')
    const metadataPath = '**/api/controller-metadata/controller-pattern-imports'
    expectedMetadataFailure = true
    let rejectProgressRead = false
    await b.route(metadataPath, async (route) => {
      const request = route.request()
      if (rejectProgressRead && request.method() === 'GET') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic progress read failure' }) })
        return
      }
      const body = request.method() === 'PUT' ? request.postDataJSON() as { value: ControllerPatternImportLedger } : null
      if (body && Object.values(body.value.byPatternId).some((r) => r.programId === partialSlot && r.stage === 'complete')) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic completion failure' }) })
      } else await route.continue()
    })
    const partialBefore = await json<{ patterns: PatternRecord[] }>(request, 'patterns')
    await b.getByRole('button', { name: 'Import Partial import', exact: true }).click()
    await b.getByRole('alertdialog').getByRole('button', { name: 'Import and save', exact: true }).click()
    await expect(b.getByRole('alertdialog').getByRole('alert')).toContainText('Controller binding saved; import bookkeeping is incomplete')
    await expect(b.getByRole('alertdialog')).not.toContainText('Nothing was sent')
    await capture(b, 'partial-failure')
    const incomplete = await json<{ value: ControllerPatternImportLedger }>(request, 'controller-metadata/controller-pattern-imports')
    const receipt = Object.values(incomplete.value.byPatternId).find((r) => r.programId === partialSlot)!
    expect(receipt.stage).toBe('metadata-pending')
    const partialBytes = structuredClone(programs.get(partialSlot))
    const partialBindings = await json<{ value: Record<string, Record<string, string>> }>(request, 'controller-metadata/controller-bindings')
    expect(partialBindings.value[ip][receipt.patternId]).toBe(partialSlot)
    const durableBeforeReadFailure = await snapshot(request)
    const programsBeforeReadFailure = structuredClone([...programs])
    rejectProgressRead = true
    await b.getByRole('alertdialog').getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(b.getByRole('alertdialog').getByRole('alert')).toContainText('Import progress could not be read. Retry checks this saved program again.')
    await expect(b.getByRole('alertdialog')).not.toContainText(/No Pattern was imported|No Pattern was sent|Nothing was sent/)
    await capture(b, 'progress-read-failure')
    expect(await snapshot(request)).toEqual(durableBeforeReadFailure)
    expect(await json(request, 'controller-metadata/controller-pattern-imports')).toEqual(incomplete)
    expect([...programs]).toEqual(programsBeforeReadFailure)
    rejectProgressRead = false
    await b.unroute(metadataPath)
    await b.reload()
    expectedMetadataFailure = false
    await connect(b)
    const resume = b.getByRole('button', { name: /^Resume import / })
    await expect(resume).toHaveCount(1)
    await resume.click()
    await b.getByRole('alertdialog').getByRole('button', { name: 'Import and save', exact: true }).click()
    await expect(b).toHaveURL(new RegExp(`/studio/patterns/${receipt.patternId}$`))
    expect(programs.get(partialSlot)).toEqual(partialBytes)
    const completed = await json<{ value: ControllerPatternImportLedger }>(request, 'controller-metadata/controller-pattern-imports')
    expect(completed.value.byPatternId[receipt.patternId]).toMatchObject({ stage: 'complete', programId: partialSlot })
    const final = await json<{ patterns: PatternRecord[] }>(request, 'patterns')
    expect(final.patterns.filter((p) => !partialBefore.patterns.some((old) => old.id === p.id))).toHaveLength(1)
    expect(await snapshot(aRequest)).toEqual(aBefore)
    expect([...programs].filter(([id]) => ![slot, canonicalSlot, partialSlot].includes(id))).toEqual(siblingBefore)
    expect(errors).toEqual([])
  } finally {
    await removeSyntheticContent(bContext.request)
    await bContext.close()
  }
})

test('group-local cross-account bulk import retains named durable failures and retries only Beta (#1221 D)', async ({ page: a, browser, baseURL }, testInfo) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  a.on('pageerror', (error) => errors.push(error.message))
  a.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  const programs: SharedFakeControllerPrograms = new Map()
  const slots = [slot, canonicalSlot, partialSlot]
  const names = ['Alpha', 'Beta', 'Gamma']
  const seedPbp = (id: string, name: string, sourceCode = source) => programs.set(id, {
    name, pbpBase64: Buffer.from(encodePbp({ id, name, sourceCode, byteCode: new Uint8Array(8) })).toString('base64'),
  })
  seedPbp(slot, 'Alpha')
  seedPbp('OTHER000000000001', 'Running control')
  seedPbp('OTHER000000000002', 'Other control')
  seedPbp('BOUND000000000001', 'Bound control')
  await helper(a, programs)
  const aRequest = a.context().request
  const aPattern: PatternRecord = { id: 'bulk-account-a-origin', name: 'Alpha', src: source, controls: {}, updatedAt: Date.now() }
  await seed(aRequest, 'patterns', aPattern)
  await seed(aRequest, 'controllers', profile('bulk-account-a-profile', 36))
  await metadata(aRequest, 'controller-pattern-imports', { version: 1, byPatternId: {} })
  await metadata(aRequest, 'controller-push-records', {})
  await metadata(aRequest, 'controller-bindings', { [ip]: { [aPattern.id]: slot } })
  await a.goto(`studio/patterns/${aPattern.id}`)
  await connect(a)
  await save(a)
  await expect.poll(() => numeric(decodePbp(new Uint8Array(Buffer.from(programs.get(slot)!.pbpBase64, 'base64')))!.sourceCode).pins).toContain(36)
  const storedSource = decodePbp(new Uint8Array(Buffer.from(programs.get(slot)!.pbpBase64, 'base64')))!.sourceCode
  seedPbp(slots[1], names[1], storedSource)
  seedPbp(slots[2], names[2], storedSource)
  const fullAccount = async (request: APIRequestContext) => ({ ...await snapshot(request),
    controllers: await json<{ controllers: ControllerProfile[] }>(request, 'controllers'), maps: await json(request, 'maps'),
    shows: await json(request, 'shows?show-version=2'), libraries: await json(request, 'libraries'),
    ledger: await json(request, 'controller-metadata/controller-pattern-imports') })
  const aBefore = await fullAccount(aRequest)
  const deviceBefore = structuredClone([...programs])
  const sequence = allocatePersistedAccountSequence(process.env.PXLBLZ_D1_PERSIST_TO?.trim() || undefined, testInfo.parallelIndex)
  const accountIndex = authenticatedPlaywrightAccountIndex(testInfo.parallelIndex, accountSlotForSequence(sequence))
  const secret = readDevVarsFile(process.env.PXLBLZ_DEV_VARS_FILE!).SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is required in the authenticated test dev-vars file')
  const token = await createSessionToken(authenticatedPlaywrightUser(accountIndex), secret)
  const bContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, storageState: {
    cookies: [{ name: sessionCookieName, value: token, domain: 'localhost', path: '/', httpOnly: true,
      secure: false, sameSite: 'Lax', expires: -1 }], origins: [],
  } })
  const b = await bContext.newPage()
  let expectedMetadataFailure = false
  b.on('pageerror', (error) => errors.push(error.message))
  b.on('console', (message) => {
    const injected = expectedMetadataFailure && message.text().includes('503')
      && message.location().url.includes('/api/controller-metadata/controller-pattern-imports')
    if (message.type() === 'error' && !injected) errors.push(message.text())
  })
  const captures = async (state: string) => {
    for (const [label, width] of [['desktop', 1440], ['narrow', 760]] as const) {
      await b.setViewportSize({ width, height: 1000 })
      await capture(b, `D-${state}-${label}`)
    }
    await b.setViewportSize({ width: 1440, height: 1000 })
  }
  const commands = () => b.evaluate(() => (window as unknown as { __fakeControllerWrites: Record<string, unknown>[] }).__fakeControllerWrites)
  try {
    const request = bContext.request
    await removeSyntheticContent(request)
    await helper(b, programs)
    await seed(request, 'controllers', profile('bulk-account-b-profile', 35))
    await seed(request, 'patterns', { id: 'bulk-b-control', name: 'Bound control', src: source, controls: {}, updatedAt: Date.now() })
    await metadata(request, 'controller-bindings', { [ip]: { 'bulk-b-control': 'BOUND000000000001' } })
    await metadata(request, 'controller-push-records', {})
    await metadata(request, 'controller-pattern-imports', { version: 1, byPatternId: {} })
    await b.goto('studio/controllers/bulk-account-b-profile')
    await connect(b)
    const controllerRoute = b.url()
    const unimported = b.getByRole('table', { name: 'Unimported PXLBLZ Patterns', exact: true })
    await expect(unimported.getByRole('row')).toHaveCount(4)
    await expect(b.getByRole('table', { name: 'Saved PXLBLZ Patterns', exact: true })).toContainText('Bound control')
    await expect(b.getByRole('table', { name: 'Other Patterns', exact: true })).toContainText('Other control')
    const before = await fullAccount(request)
    await captures('inventory')
    for (const group of ['Unimported PXLBLZ Patterns', 'Saved PXLBLZ Patterns', 'Other Patterns']) {
      await b.getByRole('button', { name: `Select ${group}`, exact: true }).click()
      const table = b.getByRole('table', { name: group, exact: true })
      const all = table.getByRole('checkbox', { name: `Select all ${group}`, exact: true })
      await expect(all).not.toBeChecked()
      await all.check()
      if (group === 'Saved PXLBLZ Patterns') {
        await expect(b.getByRole('button', { name: 'Import', exact: true })).toHaveCount(0)
        await expect(table.getByRole('checkbox', { name: 'Select Bound control', exact: true })).toBeChecked()
      }
      if (group === 'Other Patterns') {
        await expect(table.getByRole('checkbox', { name: 'Select Other control', exact: true })).toBeChecked()
        await expect(table.getByRole('checkbox', { name: 'Select Running control', exact: true })).toBeDisabled()
      }
    }
    const select = b.getByRole('button', { name: 'Select Unimported PXLBLZ Patterns', exact: true })
    await select.focus()
    await select.press('Enter')
    const all = unimported.getByRole('checkbox', { name: 'Select all Unimported PXLBLZ Patterns', exact: true })
    await expect(all).not.toBeChecked()
    await all.focus()
    await all.press('Space')
    for (const name of names) await expect(unimported.getByRole('checkbox', { name: `Select ${name}`, exact: true })).toBeChecked()
    await captures('selection')
    const open = b.getByRole('button', { name: 'Import', exact: true })
    await open.focus()
    await open.press('Enter')
    const dialog = b.getByRole('alertdialog')
    await expect(dialog.getByRole('heading')).toHaveText('Import 3 PXLBLZ Patterns?')
    await expect(dialog.getByRole('listitem')).toHaveText(names)
    expect((await commands()).filter((entry) => 'readProgram' in entry || 'save' in entry || 'compileSource' in entry)).toEqual([])
    expect(await fullAccount(request)).toEqual(before)
    expect([...programs]).toEqual(deviceBefore)
    await captures('confirmation')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect((await commands()).filter((entry) => 'readProgram' in entry || 'save' in entry)).toEqual([])
    await open.click()
    const metadataPath = '**/api/controller-metadata/controller-pattern-imports'
    expectedMetadataFailure = true
    await b.route(metadataPath, async (route) => {
      const body = route.request().method() === 'PUT' ? route.request().postDataJSON() as { value: ControllerPatternImportLedger } : null
      if (body && Object.values(body.value.byPatternId).some((r) => r.programId === slots[1] && r.stage === 'complete')) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic Beta completion failure' }) })
      } else await route.continue()
    })
    await dialog.getByRole('button', { name: 'Import and save', exact: true }).click()
    await expect(dialog.getByRole('heading')).toHaveText('Import results')
    await expect(dialog).toContainText('2 imported')
    await expect(dialog.getByRole('alert')).toContainText('Beta: Controller binding saved; import bookkeeping is incomplete')
    await expect(b).toHaveURL(controllerRoute)
    const mixed = await json<{ patterns: PatternRecord[] }>(request, 'patterns')
    const ledger = await json<{ value: ControllerPatternImportLedger }>(request, 'controller-metadata/controller-pattern-imports')
    const receipts = slots.map((id) => Object.values(ledger.value.byPatternId).find((r) => r.programId === id)!)
    const destinationPattern = mixed.patterns.find((p) => p.id === receipts[1].patternId)
    expect(destinationPattern).toBeDefined()
    await expect(b.locator('table[aria-label="Saved PXLBLZ Patterns"]')
      .locator(`button[title*="Program id ${slots[1]}"]`)).toHaveText(destinationPattern!.name)
    await expect(dialog.getByRole('button', { name: 'Retry failed', exact: true })).toBeEnabled()
    await captures('mixed-result')
    expect(new Set(receipts.map((r) => r.patternId)).size).toBe(3)
    expect(receipts.map((r) => r.stage)).toEqual(['complete', 'metadata-pending', 'complete'])
    expect(mixed.patterns.filter((p) => !before.patterns.patterns.some((old) => old.id === p.id))).toHaveLength(3)
    const bindings = await json<{ value: Record<string, Record<string, string>> }>(request, 'controller-metadata/controller-bindings')
    for (const [index, receipt] of receipts.entries()) {
      expect(receipt.patternId).not.toBe(aPattern.id)
      expect(receipt).toMatchObject({ controllerDeviceId: deviceId, sourceMode: 'stored-artifact', programId: slots[index],
        origin: { bannerState: 'valid', banner: { id: aPattern.id }, pbpDigest: await sha256ControllerProgram(new Uint8Array(Buffer.from(deviceBefore.find(([id]) => id === slots[index])![1].pbpBase64, 'base64'))) } })
      expect(mixed.patterns.find((p) => p.id === receipt.patternId)?.src).toBe(storedSource)
      expect(bindings.value[ip][receipt.patternId]).toBe(slots[index])
    }
    expect(bindings.value[ip]['bulk-b-control']).toBe('BOUND000000000001')
    expect(await json(request, 'controller-metadata/controller-push-records')).toEqual(before.pushes)
    expect([...programs]).toEqual(deviceBefore)
    const readsBeforeRetry = (await commands()).filter((entry) => 'readProgram' in entry)
    const writesBeforeRetry = (await commands()).filter((entry) => entry.save || 'compileSource' in entry || 'setActivePattern' in entry)
    await b.unroute(metadataPath)
    expectedMetadataFailure = false
    await dialog.getByRole('button', { name: 'Retry failed', exact: true }).click()
    await expect(dialog).toContainText('3 imported')
    await expect(dialog.getByRole('button', { name: 'Retry failed', exact: true })).toHaveCount(0)
    const complete = await json<{ value: ControllerPatternImportLedger }>(request, 'controller-metadata/controller-pattern-imports')
    expect(complete.value.byPatternId).toEqual(Object.fromEntries(receipts.map((r) => [r.patternId, { ...r, stage: 'complete' }])))
    expect(await json(request, 'patterns')).toEqual(mixed)
    expect(await json(request, 'controller-metadata/controller-bindings')).toEqual(bindings)
    const retryReads = (await commands()).filter((entry) => 'readProgram' in entry).slice(readsBeforeRetry.length)
    expect(retryReads.length).toBeGreaterThan(0)
    expect(retryReads.every((entry) => entry.readProgram === slots[1])).toBe(true)
    expect((await commands()).filter((entry) => entry.save || 'compileSource' in entry || 'setActivePattern' in entry)).toEqual(writesBeforeRetry)
    expect([...programs]).toEqual(deviceBefore)
    expect(await fullAccount(aRequest)).toEqual(aBefore)
    expect(mixed.patterns.find((p) => p.id === 'bulk-b-control')).toEqual(before.patterns.patterns.find((p) => p.id === 'bulk-b-control'))
    const final = await fullAccount(request)
    const beforeProfile = before.controllers.controllers.find((p) => p.id === 'bulk-account-b-profile')
    const finalProfile = final.controllers.controllers.find((p) => p.id === 'bulk-account-b-profile')
    expect(beforeProfile).toBeDefined()
    expect(finalProfile).toBeDefined()
    expect(finalProfile!.updatedAt).toBeGreaterThanOrEqual(beforeProfile!.updatedAt)
    expect(final.controllers).toEqual({
      ...before.controllers,
      controllers: before.controllers.controllers.map((p) => p.id === 'bulk-account-b-profile'
        ? { ...p, updatedAt: finalProfile!.updatedAt }
        : p),
    })
    for (const key of ['maps', 'shows', 'libraries', 'pushes'] as const) expect(final[key]).toEqual(before[key])
    await expect(b).toHaveURL(controllerRoute)
    await expect(b.locator('table[aria-label="Unimported PXLBLZ Patterns"]')).toHaveCount(0)
    await expect(b.locator('table[aria-label="Saved PXLBLZ Patterns"] tbody tr')).toHaveCount(4)
    await captures('retry-complete')
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(b).toHaveURL(controllerRoute)
    expect(errors).toEqual([])
  } finally {
    await removeSyntheticContent(bContext.request)
    await bContext.close()
  }
})

import type { Page } from '@playwright/test'
import { encodePbp } from '../../src/engine/pbpEncode'
import { installFakeControllerHelper } from './fakeControllerHelper'

export const bulkProfileId = 'bulk-select-1218'
export const bulkControllerIp = '192.168.8.224'
export const bulkPrograms = [
  { id: 'BULKRUNNING000001', name: 'Running Pattern' },
  { id: 'BULKOWNED00000001', name: 'Owned Aurora' },
  { id: 'BULKOWNED00000002', name: 'Owned Embers' },
  { id: 'BULKFOREIGN000001', name: 'Alpha' },
  { id: 'BULKFOREIGN000002', name: 'Beta' },
  { id: 'BULKFOREIGN000003', name: 'Gamma' },
]

/** Seeds only the authenticated synthetic workspace and the fake relay. */
export async function seedBulkSelectFixture(page: Page) {
  const request = page.context().request
  const check = async (response: Awaited<ReturnType<typeof request.post>>) => {
    if (!response.ok()) throw new Error(`Bulk fixture seed failed: ${response.status()} ${await response.text()}`)
  }
  const sourceCode = 'export function render(index) { rgb(index / pixelCount, 0, 0.2) }'
  const savedProgramData = Object.fromEntries(bulkPrograms.map((program) => [program.id,
    Buffer.from(encodePbp({ ...program, sourceCode, byteCode: new Uint8Array(8) })).toString('base64'),
  ]))
  await installFakeControllerHelper(page, {
    programs: bulkPrograms, activeProgramId: bulkPrograms[0].id,
    deviceName: 'Bulk fixture Controller', boardType: 'pb32',
    mac: '11:22:33:44:55:00', pixelCount: 100, sequencerMode: 0, runSequencer: false,
    savedProgramData,
  })
  await check(await request.post('/api/controllers', { data: {
    id: bulkProfileId, name: 'Bulk fixture Controller', deviceId: 'pixelblaze_pb32_005544332211',
    lastKnownDeviceName: 'Bulk fixture Controller', lastSeenIp: bulkControllerIp,
    board: { kind: 'pixelblaze-v3-standard' }, inputs: [], globalTransforms: [],
    patternBindings: [], zones: [], updatedAt: Date.now(),
  } }))
  const bindings: Record<string, string> = {}
  for (const program of bulkPrograms.slice(0, 3)) {
    const id = `studio-${program.id.toLowerCase()}`
    bindings[id] = program.id
    await check(await request.post('/api/patterns', { data: { id, name: program.name, src: sourceCode, controls: {}, updatedAt: Date.now() } }))
  }
  await check(await request.put('/api/controller-metadata/controller-bindings', { data: { value: { [bulkControllerIp]: bindings } } }))
  await page.goto(`studio/controllers/${bulkProfileId}`)
  await page.getByRole('button', { name: 'Connect a Controller', exact: true }).click()
  await page.getByRole('textbox', { name: 'Controller IP address' }).fill(bulkControllerIp)
  await page.getByTestId('controller-go').click()
  await page.getByRole('table', { name: 'Other Patterns', exact: true }).waitFor()
}

export async function fakeControllerMutations(page: Page) {
  return page.evaluate(() => ((window as typeof window & {
    __fakeControllerWrites: Array<Record<string, unknown>>
  }).__fakeControllerWrites).filter((write) =>
    'deleteProgram' in write || 'save' in write || 'activeProgramId' in write || 'setCode' in write || 'name' in write,
  ))
}

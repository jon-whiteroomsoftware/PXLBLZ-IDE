import type { APIRequestContext, Page } from '@playwright/test'
import { expect, removeSyntheticContent, test } from './fixtures/authenticated'

type ConfirmedEntity = {
  resource: 'patterns' | 'maps' | 'mixins'
  id: string
  name: string
  route: string
  record: Record<string, unknown>
  selected: (page: Page) => ReturnType<Page['getByRole']>
  beginDelete: (page: Page) => Promise<void>
}

test('authenticated fixture removes every synthetic personal-content resource', async ({ request }) => {
  const sentinel = Date.now()
  const records = [
    {
      resource: 'mixins',
      data: {
        id: `workspace-cleanup-mixin-${sentinel}`,
        name: `Workspace cleanup Mixin ${sentinel}`,
        kind: 'inject',
        src: 'beforeRender(delta) { }',
        updatedAt: sentinel,
      },
    },
    {
      resource: 'libraries',
      data: {
        id: `workspace-cleanup-library-${sentinel}`,
        name: `WorkspaceCleanup${sentinel}`,
        src: 'function helper(value) { return value }',
        updatedAt: sentinel,
      },
    },
    {
      resource: 'controllers',
      data: {
        id: `workspace-cleanup-controller-${sentinel}`,
        name: `Workspace cleanup Controller ${sentinel}`,
        board: { kind: 'pixelblaze-v3-standard' },
        inputs: [],
        globalTransforms: [],
        patternBindings: [],
        zones: [],
        updatedAt: sentinel,
      },
    },
  ] as const

  for (const record of records) {
    const response = await request.post(`/api/${record.resource}`, { data: record.data })
    expect(response.ok(), `POST /api/${record.resource} -> ${response.status()}`).toBe(true)
  }

  await removeSyntheticContent(request)

  for (const record of records) {
    const response = await request.get(`/api/${record.resource}`)
    expect(response.ok(), `GET /api/${record.resource} -> ${response.status()}`).toBe(true)
    const body = await response.json() as Record<string, Array<{ id: string }>>
    expect(body[record.resource].some((candidate) => candidate.id === record.data.id)).toBe(false)
  }
})

const token = Date.now()
const entities: ConfirmedEntity[] = [
    {
      resource: 'patterns',
      id: `workspace-recovery-pattern-${token}`,
      name: `Workspace recovery Pattern ${token}`,
      route: 'studio/patterns',
      record: {
        src: 'export function render(index) { hsv(index / pixelCount, 1, 1) }',
        controls: {},
        updatedAt: token,
      },
      selected: (target) => target.getByRole('button', { name: `Rename pattern Workspace recovery Pattern ${token}` }),
      beginDelete: async (target) => {
        await target.getByRole('button', { name: 'Pattern actions' }).click()
        await target.getByRole('menuitem', { name: 'Delete pattern' }).click()
      },
    },
    {
      resource: 'maps',
      id: `workspace-recovery-map-${token}`,
      name: `Workspace recovery Map ${token}`,
      route: 'studio/maps',
      record: {
        dim: 2,
        generator: 'custom',
        params: {},
        points: [[0, 0], [1, 1]],
        source: 'function(pixelCount) { return [[0, 0], [1, 1]] }',
        updatedAt: token,
      },
      selected: (target) => target.getByRole('button', { name: `Rename map Workspace recovery Map ${token}` }),
      beginDelete: async (target) => { await target.getByRole('button', { name: 'Delete', exact: true }).click() },
    },
    {
      resource: 'mixins',
      id: `workspace-recovery-mixin-${token}`,
      name: `Workspace recovery Mixin ${token}`,
      route: 'studio/mixins',
      record: {
        kind: 'inject',
        src: 'beforeRender(delta) { }',
        updatedAt: token,
      },
      selected: (target) => target.getByRole('button', { name: `Rename mixin Workspace recovery Mixin ${token}` }),
      beginDelete: async (target) => { await target.getByRole('button', { name: 'Delete', exact: true }).click() },
    },
]

for (const entity of entities) {
  const noun = entity.resource === 'patterns' ? 'pattern' : entity.resource.slice(0, -1)
  test(`authenticated Studio preserves a selected ${noun} on cancel and recovers after confirmed deletion`, async ({ page, request }) => {
    await exerciseConfirmedDeletion(page, request, entity)
  })
}

async function exerciseConfirmedDeletion(page: Page, request: APIRequestContext, entity: ConfirmedEntity): Promise<void> {
  await createEntity(request, entity)

  await page.goto(`${entity.route}/${entity.id}`)
  await expect(entity.selected(page)).toBeVisible()
  await page.reload()
  await expect(entity.selected(page)).toBeVisible()
  await expectEntityPresent(request, entity)

  await entity.beginDelete(page)
  await expect(page.getByRole('alertdialog', { name: `Delete ${entity.resource === 'patterns' ? 'pattern' : entity.resource.slice(0, -1)}?` })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(entity.selected(page)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/${entity.resource}/${entity.id}$`))
  await expectEntityPresent(request, entity)

  await entity.beginDelete(page)
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/${entity.resource}$`))
  await expect(entity.selected(page)).toHaveCount(0)
  await expectEntityAbsent(request, entity)
  await page.reload()
  await expect(entity.selected(page)).toHaveCount(0)
}

async function createEntity(request: APIRequestContext, entity: ConfirmedEntity): Promise<void> {
  const response = await request.post(`/api/${entity.resource}`, {
    data: { id: entity.id, name: entity.name, ...entity.record },
  })
  expect(response.ok(), `POST /api/${entity.resource} -> ${response.status()}`).toBe(true)
}

async function expectEntityPresent(request: APIRequestContext, entity: ConfirmedEntity): Promise<void> {
  const records = await listEntities(request, entity.resource)
  expect(records.some((record) => record.id === entity.id && record.name === entity.name)).toBe(true)
}

async function expectEntityAbsent(request: APIRequestContext, entity: ConfirmedEntity): Promise<void> {
  const records = await listEntities(request, entity.resource)
  expect(records.some((record) => record.id === entity.id)).toBe(false)
}

async function listEntities(request: APIRequestContext, resource: ConfirmedEntity['resource']): Promise<Array<{ id: string; name: string }>> {
  const response = await request.get(`/api/${resource}`)
  expect(response.ok(), `GET /api/${resource} -> ${response.status()}`).toBe(true)
  const body = await response.json() as Record<string, Array<{ id: string; name: string }>>
  return body[resource] ?? []
}

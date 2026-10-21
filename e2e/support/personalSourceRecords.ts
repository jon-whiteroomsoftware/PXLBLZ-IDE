import type { APIRequestContext } from '@playwright/test'
import { expect } from '../fixtures/authenticated'

export type PersonalSourceResource = 'mixins' | 'libraries'
export type PersonalSourceRecord = { id: string; name: string; src: string; updatedAt: number } & Record<string, unknown>

/** POST /api/<resource> and assert 2xx with the status in the message. */
export async function seedPersonalSourceRecord(request: APIRequestContext, resource: PersonalSourceResource, record: PersonalSourceRecord): Promise<void> {
  const response = await request.post(`/api/${resource}`, { data: record })
  expect(response.ok(), `POST /api/${resource} -> ${response.status()}`).toBe(true)
}

/** GET /api/<resource>, assert ok, and return the `src` of the record with `id`, or undefined. */
export async function storedPersonalSource(request: APIRequestContext, resource: PersonalSourceResource, id: string): Promise<string | undefined> {
  const response = await request.get(`/api/${resource}`)
  expect(response.ok(), `GET /api/${resource} -> ${response.status()}`).toBe(true)
  const body = await response.json() as Record<PersonalSourceResource, PersonalSourceRecord[]>
  return body[resource].find((record) => record.id === id)?.src
}

/** Wait for a durable autosave through the record API. */
export async function expectStoredPersonalSource(request: APIRequestContext, resource: PersonalSourceResource, id: string, src: string): Promise<void> {
  await expect.poll(() => storedPersonalSource(request, resource, id)).toBe(src)
}

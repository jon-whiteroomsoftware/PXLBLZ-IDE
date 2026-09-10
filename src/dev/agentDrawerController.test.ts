// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TextDecoder, TextEncoder } from 'node:util'
import { createAgentDrawerController, useAgentDrawerStore } from './agentDrawerController'
import type { createAgentEditorAdmission } from './agentEditorAdmission'
import type { ShowEditRequest } from '@/engine/showEditAdmission'
let controller: ReturnType<typeof createAgentDrawerController>
let receipt: Record<string, unknown>
let applied: ReturnType<typeof vi.fn>
let request: ShowEditRequest
let nextId = 0
beforeEach(() => {
  vi.stubGlobal('TextDecoder', TextDecoder)
  vi.stubGlobal('TextEncoder', TextEncoder)
  receipt = { status: 'pending' }; nextId = 0
  const api = {
    available: () => true, onClose: vi.fn(),
    beginRequest: (operationId: string, utterance: string) => {
      request = { operationId, sessionId: 'session', showId: 'show', baseRevision: 0, payloadKey: JSON.stringify({ utterance, history: [] }), targets: ['clip-a'], referenceContext: '' }
      receipt = { request, status: 'pending' }
      return { request, show: { id: 'show', composition: { durationMs: 10000 } }, context: {} }
    },
    applyShow: applied = vi.fn(() => { receipt = { request, status: 'applied', settlement: 'saved' }; return receipt }),
    readOutcome: () => receipt,
    retryIntent: () => undefined,
    cancel: () => { receipt = { request, status: 'cancelled' }; return receipt },
    complete: () => { receipt = { request, status: 'completed', completion: 'nothing-applied' }; return receipt },
  }
  controller = createAgentDrawerController(api as unknown as ReturnType<typeof createAgentEditorAdmission>, 'show')
  controller.attachBridge('http://127.0.0.1:8791')
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    const { requestId } = JSON.parse(options.body)
    nextId++
    let sent = false
    return { ok: true, body: { getReader: () => ({ read: async () => sent ? { done: true } : (sent = true, { done: false, value: new TextEncoder().encode(JSON.stringify({ requestId, kind: 'done', changed: true, show: { id: 'show', composition: { durationMs: 10000 } }, privateOutcome: { kind: 'committed' }, changes: [{ targetId: 'clip-a', description: 'Opening shortened' }], reply: 'Ready.' }) + '\n') }) }) } }
  }))
})
afterEach(() => { controller.dispose(); vi.unstubAllGlobals() })
it('shows registry attribution only after owned adoption and preserves manual focus', async () => {
  const field = document.createElement('input'); document.body.appendChild(field); field.focus()
  controller.dispatch({ type: 'draft', text: 'shorten the opening' })
  controller.dispatch({ type: 'drawer', mode: 'tucked' })
  controller.submit()
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.stream.some(line => line.outcome === 'saved')).toBe(true))
  expect(applied).toHaveBeenCalledOnce()
  expect(useAgentDrawerStore.getState().state.highlights).toEqual(['clip-a'])
  expect(useAgentDrawerStore.getState().state.unread).toHaveLength(1)
  expect(document.activeElement).toBe(field)
  field.remove()
})
it('restores contact by outcome lookup without replaying the request', async () => {
  vi.mocked(fetch).mockRejectedValue(new Error('connection lost'))
  controller.dispatch({ type: 'draft', text: 'shorten' }); controller.submit()
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.contactLost).toBe(true))
  expect(useAgentDrawerStore.getState().state.request?.id).toBe(request.operationId)
  receipt = { request, status: 'applied', settlement: 'saved' }
  controller.restoreContact()
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === request.operationId)?.outcome).toBe('saved')
  expect(fetch).toHaveBeenCalledOnce()
  expect(applied).not.toHaveBeenCalled()
  expect(nextId).toBe(0)
})
it('retains a known saved outcome when contact recovery cannot find a receipt', async () => {
  controller.dispatch({ type: 'draft', text: 'shorten' }); controller.submit()
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.stream.some(line => line.outcome === 'saved')).toBe(true))
  controller.dispatch({ type: 'drop' })
  receipt = undefined as unknown as Record<string, unknown>
  controller.restoreContact()
  expect(useAgentDrawerStore.getState().state.stream.find(line => line.operationId === request.operationId)?.outcome).toBe('saved')
  expect(fetch).toHaveBeenCalledOnce()
})

it('does not paint an insertion band when live admission refuses a committed private candidate', async () => {
  vi.mocked(fetch).mockImplementation(async (_url, options) => {
    const { requestId } = JSON.parse(options!.body as string)
    const body = JSON.stringify({ requestId, kind: 'done', changed: true, show: { id: 'show' }, privateOutcome: { kind: 'committed' }, reply: 'Inserted.', changes: [{ targetId: 'at-1000', description: 'Time inserted.', range: { startMs: 1000, endMs: 2000 } }] }) + '\n'
    let sent = false
    return { ok: true, body: { getReader: () => ({ read: async () => sent ? { done: true } : (sent = true, { done: false, value: new TextEncoder().encode(body) }) }) } } as Response
  })
  applied.mockImplementation(() => receipt = { request, status: 'refused', reason: 'revision-conflict' })
  controller.dispatch({ type: 'draft', text: 'insert time' }); controller.submit()
  await vi.waitFor(() => expect(useAgentDrawerStore.getState().state.stream.some(line => line.outcome === 'not-applied')).toBe(true))
  expect(useAgentDrawerStore.getState().state.band).toBeNull()
  expect(useAgentDrawerStore.getState().state.highlights).toEqual([])
  expect(useAgentDrawerStore.getState().state.stream.some(line => line.text === 'Inserted.')).toBe(false)
})

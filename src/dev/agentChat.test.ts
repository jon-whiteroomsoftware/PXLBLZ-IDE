import { registerShowEscapeLayer, SHOW_ESCAPE_LAYER_RANK } from '@/engine/showEscapeLayers'
// @vitest-environment jsdom
import source from '../agent-harness/bridge/chat.js?raw'
import { TextEncoder, TextDecoder } from 'node:util'
let close: () => void
let outcome: { status: string; settlement?: string } = { status: 'waiting' }
let apply: ReturnType<typeof vi.fn>
let begin: ReturnType<typeof vi.fn>
let cancel: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.stubGlobal('TextEncoder', TextEncoder)
  vi.stubGlobal('TextDecoder', TextDecoder)
  outcome = { status: 'waiting' }
  document.body.innerHTML = '<input id="manual" />'
  apply = vi.fn(() => outcome)
  begin = vi.fn(() => ({ request: { operationId: 'op' }, show: { id: 'show' }, context: {} }))
  cancel = vi.fn(() => { outcome = { status: 'cancelled' }; return outcome })
  Object.assign(window, { __pxlblzEditor: { available: () => true, beginRequest: begin, applyShow: apply, readOutcome: () => outcome, cancel, onClose: (fn: () => void) => { close = fn }, close: () => close() } })
  vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
    let sent = false
    const { requestId } = JSON.parse(options.body)
    return { body: { getReader: () => ({ read: async () => {
      if (sent) return { done: true }
      sent = true
      return { done: false, value: new TextEncoder().encode(JSON.stringify({ requestId, kind: 'done', changed: true, show: { id: 'show' }, privateOutcome: { kind: 'committed' }, reply: 'Ready.' }) + '\n') }
    } }) } }
  }))
  new Function(source)()
})
afterEach(() => { close(); vi.unstubAllGlobals() })
const submit = () => {
  const input = document.querySelector<HTMLInputElement>('[data-testid="agent-chat-input"]')!
  input.value = 'change'
  input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}
it.each(['release', 'cancel'] as const)('keeps one waiting request busy until %s without stealing manual focus', async action => {
  submit()
  await vi.waitFor(() => expect(document.body.textContent).toContain('Waiting for active editing'))
  const button = document.querySelector<HTMLButtonElement>('[data-testid="agent-chat-cancel"]')!
  expect(button.hidden).toBe(false)
  submit()
  expect(begin).toHaveBeenCalledTimes(1)
  document.querySelector<HTMLInputElement>('#manual')!.focus()
  if (action === 'cancel') {
    const pointer = new Event('pointerdown', { bubbles: true, cancelable: true })
    button.dispatchEvent(pointer)
    expect(pointer.defaultPrevented).toBe(true)
    button.click()
  }
  else outcome = { status: 'applied', settlement: 'saved' }
  await vi.waitFor(() => expect(document.body.textContent).toContain(action === 'cancel' ? 'Editor cancelled' : 'Applied and saved'))
  expect(document.activeElement?.id).toBe('manual')
  expect(apply).toHaveBeenCalledTimes(1)
  expect(cancel).toHaveBeenCalledTimes(action === 'cancel' ? 1 : 0)
  expect(button.hidden).toBe(true)
})

it.each(['idle', 'waiting'] as const)('leaves ordinary Escape ownership intact while %s', async phase => {
  if (phase === 'waiting') {
    submit()
    await vi.waitFor(() => expect(document.body.textContent).toContain('Waiting for active editing'))
  }
  const peel = vi.fn(() => true)
  const stop = registerShowEscapeLayer({ rank: SHOW_ESCAPE_LAYER_RANK.editorSurfaces, onEscape: peel })
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(peel).toHaveBeenCalledTimes(1)
    // A real detail-owned portal still owns Escape; diagnostic Cancel never does.
    const portal = document.createElement('div')
    portal.dataset.showDetailOwnedPortal = 'true'
    document.body.appendChild(portal)
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(peel).toHaveBeenCalledTimes(1)
    } finally { portal.remove() }
  } finally { stop() }
})

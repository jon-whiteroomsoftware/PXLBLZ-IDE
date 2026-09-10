// Provenance: pxlblz-v3 src/bridge/chat.js at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Chat overlay for the local dictation bridge (#30). Injected into the v2
// editor tab (dev builds only) via a script tag pointing at the bridge's
// /chat.js. Reads the Show and editor focus through the editor's dev-only
// window.__pxlblzEditor hook, sends one utterance at a time to the bridge,
// and applies a changed record back as one undo step.
//
// #945 browser baseline: each submission mints a request id, sends it with
// the body, and keeps a client-side phase record (submission, first event,
// done, application start and end) under window.__pxlblzChat.requests. The
// record holds no utterance text or Show content, only the id, the phases,
// and the bridge's event kinds.
/* global window, document, fetch, TextDecoder */
;(() => {
  'use strict'
  if (window.__pxlblzChat) return
  if (window.__pxlblzAgentDrawer) {
    const source = document.currentScript?.src
    if (source) { window.__pxlblzAgentDrawer.attachBridge(source.replace(/\/chat\.js.*$/, '')); window.__pxlblzChat = window.__pxlblzAgentDrawer }
    return
  }
  const editor = window.__pxlblzEditor
  if (!editor || !editor.available()) return
  const BRIDGE = (document.currentScript && document.currentScript.src.replace(/\/chat\.js.*$/, '')) || 'http://127.0.0.1:8791'
  let disposed = false
  let activeRequest = null
  let stopPolling = () => {}
  const transport = new window.AbortController()

  const panel = document.createElement('div')
  panel.dataset.testid = 'agent-chat-panel'
  panel.style.cssText = [
    'position:fixed', 'right:16px', 'bottom:16px', 'z-index:100000', 'width:340px',
    'background:#0a0a0dee', 'border:1px solid #3f3f46', 'border-radius:8px',
    'font:12px/1.45 ui-sans-serif,system-ui', 'color:#d4d4d8',
    'box-shadow:0 12px 40px #000c', 'backdrop-filter:blur(6px)',
  ].join(';')

  const header = document.createElement('div')
  header.textContent = 'Luna'
  header.style.cssText = 'padding:8px 12px;font-weight:600;color:#67e8f9;border-bottom:1px solid #27272a;display:flex;justify-content:space-between;align-items:center;cursor:default'
  const close = document.createElement('button')
  close.type = 'button'
  close.setAttribute('aria-label', 'Close diagnostic chat')
  close.textContent = '×'
  close.style.cssText = 'cursor:pointer;color:#71717a;font-size:15px;padding:0 2px'
  close.onclick = () => editor.close()
  header.appendChild(close)

  const log = document.createElement('div')
  log.dataset.testid = 'agent-chat-log'
  log.style.cssText = 'max-height:260px;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px'

  const form = document.createElement('form')
  form.style.cssText = 'display:flex;gap:6px;padding:10px 12px;border-top:1px solid #27272a'
  const input = document.createElement('input')
  input.type = 'text'
  input.dataset.testid = 'agent-chat-input'
  input.placeholder = 'Tell Luna what to change…'
  input.style.cssText = 'flex:1;background:#18181b;border:1px solid #3f3f46;border-radius:6px;color:#e4e4e7;padding:6px 8px;font:inherit;outline:none'
  const send = document.createElement('button')
  send.type = 'submit'
  send.dataset.testid = 'agent-chat-send'
  send.textContent = 'Send'
  send.style.cssText = 'background:#164e63;border:1px solid #155e75;border-radius:6px;color:#a5f3fc;padding:6px 10px;font:inherit;cursor:pointer'
  form.append(input, send)
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.dataset.testid = 'agent-chat-cancel'
  // Preserve pointer dismissal and focus without claiming inspector Escape.
  cancel.dataset.showDetailPointerPreserve = 'true'
  cancel.textContent = 'Cancel'
  cancel.hidden = true
  cancel.style.cssText = send.style.cssText
  // Keep a dirty field from blurring and releasing activity before cancellation.
  cancel.onpointerdown = event => event.preventDefault()
  cancel.onclick = () => { if (activeRequest) editor.cancel(activeRequest) }
  form.appendChild(cancel)

  panel.append(header, log, form)
  document.body.appendChild(panel)

  const line = (text, color) => {
    const item = document.createElement('div')
    item.dataset.testid = 'agent-chat-line'
    item.textContent = text
    item.style.cssText = `white-space:pre-wrap;color:${color}`
    log.appendChild(item)
    log.scrollTop = log.scrollHeight
    return item
  }

  // Human phrasing for the live activity trail.
  const TOOL_LABELS = {
    describe_show: 'reading the Show',
    export_show: 'reading the Show',
    resolve_reference: 'resolving the reference',
    get_editor_context: 'checking what you have selected',
    list_stock_patterns: 'browsing the Pattern catalogue',
    get_stock_pattern: 'reading a Pattern',
    evaluate_property_at: 'checking an animated value',
    validate_show: 'validating the result',
    begin_edit: 'starting the edit',
    commit_edit: 'committing the edit',
    rollback_edit: 'rolling back',
    describe_changes: 'reviewing the change list',
    undo: 'undoing',
    redo: 'redoing',
  }
  const toolLabel = (name) => TOOL_LABELS[name] || name.replace(/_/g, ' ') + '…'

  const editorFocusContext = (focus) => {
    const context = {}
    if (focus.hoveredClipId) context.hoveredClipId = focus.hoveredClipId
    if (focus.selection && focus.selection.kind === 'clip') context.selectedClipIds = [focus.selection.clipId]
    if (typeof focus.playheadMs === 'number') context.playheadMs = focus.playheadMs
    if (focus.selection && focus.selection.kind === 'zone') context.activeZoneId = focus.selection.zoneId
    return context
  }

  // The dialogue thread, oldest first, sent with every turn so follow-ups
  // like "yes" resolve against Luna's own previous question.
  const history = []

  // Client-side phase records, one per submission (#945). Read-only for
  // callers: window.__pxlblzChat.requests returns copies.
  const requests = []
  const publicOutcome = ({ status, settlement, reason, completion }) => ({ status, settlement, reason, completion })
  editor.onClose(() => {
    disposed = true
    stopPolling()
    transport.abort()
    history.length = 0
    requests.length = 0
    log.replaceChildren()
    input.value = ''
    panel.remove()
    delete window.__pxlblzChat
  })
  const mintRequestId = () => `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  let busy = false
  const offerRetry = captured => {
    const intent = editor.retryIntent?.(captured.request)
    if (!intent || disposed) return
    const actions = document.createElement('div')
    actions.style.cssText = 'display:flex;gap:8px;align-items:center'
    const removeActions = () => {
      const restoreFocus = actions.contains(document.activeElement)
      const selection = [input.selectionStart, input.selectionEnd]
      actions.remove()
      if (restoreFocus) { input.focus(); input.setSelectionRange(...selection) }
    }
    const retry = document.createElement('button')
    retry.type = 'button'
    retry.dataset.testid = 'agent-chat-retry'
    retry.dataset.showDetailPointerPreserve = 'true'
    retry.textContent = `Retry exact ${intent.durationMs / 1000}s duration`
    retry.style.cssText = send.style.cssText
    retry.onpointerdown = event => event.preventDefault()
    let used = false
    retry.onclick = () => {
      if (used || busy || disposed || !editor.available()) return
      used = true
      const next = editor.beginRetry(mintRequestId(), captured.request)
      removeActions()
      if (!next) { line('The original resize can no longer be retried.', '#fca5a5'); return }
      const original = JSON.parse(next.request.payloadKey)
      void submitRequest(original.utterance, original.history, next, true)
    }
    const dismiss = document.createElement('button')
    dismiss.type = 'button'
    dismiss.dataset.testid = 'agent-chat-dismiss'
    dismiss.dataset.showDetailPointerPreserve = 'true'
    dismiss.textContent = 'Dismiss'
    dismiss.style.cssText = send.style.cssText
    dismiss.onpointerdown = event => event.preventDefault()
    dismiss.onclick = () => { used = true; removeActions() }
    actions.append(retry, dismiss)
    log.appendChild(actions)
    log.scrollTop = log.scrollHeight
  }
  const submitRequest = async (utterance, priorHistory, captured, retrying = false) => {
    const requestId = captured.request.operationId
    activeRequest = captured.request
    if (!retrying) input.value = ''
    const show = captured.show
    busy = true
    send.disabled = true
    const record = {
      requestId,
      showId: show.id,
      capturedUpdatedAt: show.updatedAt,
      submittedAt: Date.now(),
      responseAt: null,
      firstEventAt: null,
      doneAt: null,
      applyStartedAt: null,
      applyEndedAt: null,
      changed: null,
      applied: null,
      error: null,
      events: [],
    }
    requests.push(record)
    line(retrying ? `You: Retry exact ${captured.retryResize.durationMs / 1000}s duration for the original Clip.` : `You: ${utterance}`, '#a1a1aa')
    const pending = line('…', '#67e8f9')
    pending.dataset.requestId = requestId
    try {
      const response = await fetch(`${BRIDGE}/utterance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, show, utterance, history: priorHistory, context: editorFocusContext(captured.context), ...(retrying ? { retryResize: captured.retryResize } : {}) }),
        signal: transport.signal,
      })
      record.responseAt = Date.now()
      // NDJSON stream: progress lines narrate the turn, the last line is the
      // result. The pending line becomes a live activity trail.
      let result = null
      const trail = []
      const showTrail = (current) => {
        const recent = trail.slice(-3).join(' · ')
        pending.textContent = `Luna: ${recent}${recent ? ' · ' : ''}${current}`
      }
      showTrail('thinking…')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffered = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffered += decoder.decode(value, { stream: true })
        let newline
        while ((newline = buffered.indexOf('\n')) >= 0) {
          const lineText = buffered.slice(0, newline)
          buffered = buffered.slice(newline + 1)
          if (!lineText.trim()) continue
          const event = JSON.parse(lineText)
          if (disposed || !editor.available()) return
          if (event.requestId !== requestId) throw new Error('the bridge returned another request identity')
          if (record.firstEventAt === null) record.firstEventAt = Date.now()
          record.events.push({ kind: event.kind, name: event.name || null, at: Date.now() })
          if (event.kind === 'tool') {
            trail.push(toolLabel(event.name))
            showTrail('…')
          } else if (event.kind === 'thinking') {
            showTrail('thinking…')
          } else if (event.kind === 'done') {
            result = event
          }
        }
      }
      if (!result) throw new Error('the bridge stream ended without a result')
      if (disposed || !editor.available()) return
      record.doneAt = Date.now()
      record.changed = result.changed === true
      record.bridgeTiming = result.timing || null
      history.push({ role: 'user', text: retrying ? `Retry exact duration ${captured.retryResize.durationMs}ms for original logical Clip ${captured.retryResize.clipId}.` : utterance })
      if (result.changed && result.show && result.privateOutcome?.kind === 'committed') {
        record.applyStartedAt = Date.now()
        let outcome = editor.applyShow(result.show, captured.request, result.retryResize)
        const describe = value => value.status === 'applied'
          ? ({ saving: 'Applied; saving…', saved: 'Applied and saved.', 'rolled-back': 'Save failed; the edit was rolled back.', superseded: 'Applied, then superseded by a newer edit.', draft: 'Applied to the in-memory stock draft.' })[value.settlement]
          : value.status === 'waiting' ? 'Waiting for active editing to finish…'
          : `Editor ${value.status}${value.reason ? ': ' + value.reason : ''}.`
        const display = () => {
          cancel.hidden = outcome.status !== 'waiting'
          record.outcome = publicOutcome(outcome)
          record.applied = outcome.status === 'applied' && outcome.settlement !== 'rolled-back'
          pending.textContent = `Luna: ${result.reply}\n${describe(outcome)}`
          pending.style.color = outcome.status === 'waiting' ? '#67e8f9' : record.applied ? '#86efac' : '#fca5a5'
          pending.dataset.applied = record.applied ? 'true' : 'false'
        }
        display()
        while (outcome.status === 'waiting' || (outcome.status === 'applied' && outcome.settlement === 'saving')) {
          await new Promise(resolve => {
            const timer = window.setTimeout(() => { stopPolling = () => {}; resolve() }, 50)
            stopPolling = () => { window.clearTimeout(timer); resolve() }
          })
          if (disposed || !editor.available()) return
          outcome = editor.readOutcome(captured.request) || { status: 'retired' }
          display()
        }
        record.applyEndedAt = Date.now()
        history.push({ role: 'assistant', text: `${result.reply}\n${describe(outcome)}` })
        offerRetry(captured)
      } else {
        record.outcome = publicOutcome(editor.complete(captured.request, ['asked', 'refused', 'nothing-applied', 'commit-refused', 'incomplete', 'service-refused'].includes(result.privateOutcome?.kind) ? result.privateOutcome.kind : 'incomplete'))
        pending.textContent = `Luna: ${result.reply}\nNo editor change (${result.privateOutcome?.kind || 'incomplete'}).`
        pending.style.color = '#e4e4e7'
        pending.dataset.applied = 'none'
        history.push({ role: 'assistant', text: pending.textContent })
      }
    } catch (error) {
      record.outcome = publicOutcome(editor.complete(captured.request, 'service-failed'))
      if (disposed) return
      record.error = error && error.message ? error.message : String(error)
      if (record.applyStartedAt !== null && record.applyEndedAt === null) {
        record.applyEndedAt = Date.now()
        record.applied = false
      }
      pending.textContent = `Bridge error: ${error && error.message ? error.message : error}`
      pending.style.color = '#fca5a5'
      pending.dataset.applied = 'error'
    } finally {
      busy = false
      send.disabled = false
      cancel.hidden = true
      activeRequest = null
    }
  }

  form.onsubmit = event => {
    event.preventDefault()
    if (busy || disposed || !editor.available()) return
    const utterance = input.value.trim()
    if (!utterance) return
    const priorHistory = history.slice(-12)
    const captured = editor.beginRequest(mintRequestId(), utterance, priorHistory)
    if (!captured) { line('The editor refused to start this request.', '#fca5a5'); return }
    void submitRequest(utterance, priorHistory, captured)
  }

  window.__pxlblzChat = {
    panel,
    get requests() {
      return requests.map((record) => JSON.parse(JSON.stringify(record)))
    },
    cancel() { if (activeRequest) return editor.cancel(activeRequest) },
  }
  input.focus()
  line('Connected. Edits land as single undo steps; Cmd+Z reverts a whole request.', '#71717a')
})()

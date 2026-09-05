// Provenance: pxlblz-v3 src/bridge/chat.js at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Chat overlay for the local dictation bridge (#30). Injected into the v2
// editor tab (dev builds only) via a script tag pointing at the bridge's
// /chat.js. Reads the Show and editor focus through the editor's dev-only
// window.__pxlblzEditor hook, sends one utterance at a time to the bridge,
// and applies a changed record back as one undo step.
/* global window, document, fetch, TextDecoder */
;(() => {
  'use strict'
  if (window.__pxlblzChat) return
  const BRIDGE = (document.currentScript && document.currentScript.src.replace(/\/chat\.js.*$/, '')) || 'http://127.0.0.1:8791'

  const panel = document.createElement('div')
  panel.style.cssText = [
    'position:fixed', 'right:16px', 'bottom:16px', 'z-index:100000', 'width:340px',
    'background:#0a0a0dee', 'border:1px solid #3f3f46', 'border-radius:8px',
    'font:12px/1.45 ui-sans-serif,system-ui', 'color:#d4d4d8',
    'box-shadow:0 12px 40px #000c', 'backdrop-filter:blur(6px)',
  ].join(';')

  const header = document.createElement('div')
  header.textContent = 'Luna'
  header.style.cssText = 'padding:8px 12px;font-weight:600;color:#67e8f9;border-bottom:1px solid #27272a;display:flex;justify-content:space-between;align-items:center;cursor:default'
  const close = document.createElement('span')
  close.textContent = '×'
  close.style.cssText = 'cursor:pointer;color:#71717a;font-size:15px;padding:0 2px'
  close.onclick = () => { panel.remove(); delete window.__pxlblzChat }
  header.appendChild(close)

  const log = document.createElement('div')
  log.style.cssText = 'max-height:260px;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px'

  const form = document.createElement('form')
  form.style.cssText = 'display:flex;gap:6px;padding:10px 12px;border-top:1px solid #27272a'
  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'Tell Luna what to change…'
  input.style.cssText = 'flex:1;background:#18181b;border:1px solid #3f3f46;border-radius:6px;color:#e4e4e7;padding:6px 8px;font:inherit;outline:none'
  const send = document.createElement('button')
  send.type = 'submit'
  send.textContent = 'Send'
  send.style.cssText = 'background:#164e63;border:1px solid #155e75;border-radius:6px;color:#a5f3fc;padding:6px 10px;font:inherit;cursor:pointer'
  form.append(input, send)

  panel.append(header, log, form)
  document.body.appendChild(panel)

  const line = (text, color) => {
    const item = document.createElement('div')
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

  const editorFocusContext = () => {
    const focus = window.__pxlblzEditor.getEditorFocus()
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

  let busy = false
  form.onsubmit = async (event) => {
    event.preventDefault()
    if (busy) return
    const utterance = input.value.trim()
    if (!utterance) return
    if (!window.__pxlblzEditor) {
      line('The editor bridge is missing — open a Show in a dev build first.', '#fca5a5')
      return
    }
    const show = window.__pxlblzEditor.getShow()
    if (!show) {
      line('No editable Show is open.', '#fca5a5')
      return
    }
    busy = true
    input.value = ''
    line(`You: ${utterance}`, '#a1a1aa')
    const pending = line('…', '#67e8f9')
    try {
      const response = await fetch(`${BRIDGE}/utterance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show, utterance, history: history.slice(-12), context: editorFocusContext() }),
      })
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
      history.push({ role: 'user', text: utterance })
      if (typeof result.reply === 'string') history.push({ role: 'assistant', text: result.reply })
      if (result.changed && result.show) {
        const applied = await window.__pxlblzEditor.applyShow(result.show)
        pending.textContent = `Luna: ${result.reply}${applied ? '' : ' (but the editor refused the update)'}`
        pending.style.color = applied ? '#86efac' : '#fca5a5'
      } else {
        pending.textContent = `Luna: ${result.reply}`
        pending.style.color = '#e4e4e7'
      }
    } catch (error) {
      pending.textContent = `Bridge error: ${error && error.message ? error.message : error}`
      pending.style.color = '#fca5a5'
    } finally {
      busy = false
      input.focus()
    }
  }

  window.__pxlblzChat = { panel }
  input.focus()
  line('Connected. Edits land as single undo steps; Cmd+Z reverts a whole request.', '#71717a')
})()

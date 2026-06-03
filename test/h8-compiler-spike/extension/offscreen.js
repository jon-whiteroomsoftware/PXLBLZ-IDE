// Offscreen document: pure relay between the service worker and the sandboxed
// iframe. Has a DOM (so it can host the iframe) but runs under the strict
// extension CSP, so it must NOT eval the compiler itself — it only forwards.

const iframe = document.getElementById('sandbox')
let seq = 0
const pending = new Map() // id -> sendResponse

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen' || msg.type !== 'compile') return
  const id = ++seq
  pending.set(id, sendResponse)
  iframe.contentWindow.postMessage(
    { id, compilerEnv: msg.compilerEnv, patternSrc: msg.patternSrc },
    '*',
  )
  return true // async sendResponse
})

window.addEventListener('message', (ev) => {
  const data = ev.data
  if (!data || typeof data.id === 'undefined') return
  const sendResponse = pending.get(data.id)
  if (!sendResponse) return
  pending.delete(data.id)
  sendResponse(data.result)
})

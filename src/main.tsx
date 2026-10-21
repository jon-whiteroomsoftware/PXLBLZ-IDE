import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { setControllerProviderFactory } from './engine/controllerProviderRegistry'
import { ExtensionControllerProvider } from './engine/ExtensionControllerProvider'
import { windowRelayTransport } from './engine/windowRelayTransport'

// Install how the keyed store mints a live backend per Controller IP (#210): each
// Controller gets its own extension-backed provider over a shared window relay
// transport, so connections are fully isolated. Until the extension is installed
// every provider stays no-extension, so the app behaves exactly as before — the
// header's entry affordance shows the install pitch. App.tsx starts extension detection
// and last-connected auto-reconnect on the first Studio entry.
const transport = windowRelayTransport()
setControllerProviderFactory(() => new ExtensionControllerProvider({ transport }))

const root = createRoot(document.getElementById('root')!)
const render = () => root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Dev-only Controller scenarios (#766): `?controllerScenario=<name>` replaces the
// extension-backed factory above with a memory-only fake. The DEV branch and its
// dynamic import are dropped from production builds.
if (import.meta.env.DEV) {
  import('./dev/controllerScenario')
    .then((m) => { m.applyControllerScenarioFromSearch(window.location.search) })
    .catch((err: unknown) => { console.error('[controller scenario] setup failed', err) })
    .finally(render)
} else {
  render()
}

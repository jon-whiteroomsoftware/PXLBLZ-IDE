import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { setControllerProvider } from './engine/controllerProviderRegistry'
import { ExtensionControllerProvider } from './engine/ExtensionControllerProvider'
import { windowRelayTransport } from './engine/windowRelayTransport'

// Swap the no-helper default for the live extension-backed provider (H3, #195).
// It detects the bridge extension via a postMessage handshake and degrades to
// no-helper if it isn't installed — so the app behaves exactly as before until a
// user installs the bridge. App.tsx's startup auto-reconnect drives it from here.
const controllerProvider = new ExtensionControllerProvider({ transport: windowRelayTransport() })
setControllerProvider(controllerProvider)
// Reflect helper presence in the nav even before any connect attempt.
void controllerProvider.detectHelper()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

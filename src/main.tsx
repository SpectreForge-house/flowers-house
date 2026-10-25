import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'
import { isOfflineCloudWriteError } from './services/cloudWriteGuard'

// Offline cloud writes are expected to fail; the UI shows the read-only banner.
window.addEventListener('unhandledrejection', event => {
  if (isOfflineCloudWriteError(event.reason)) {
    event.preventDefault()
  }
})

// Service workers are not available on file:// or the packaged app:// scheme.
const isDesktopShell = window.location.protocol === 'file:' || window.location.protocol === 'app:';
if (!isDesktopShell) {
  registerSW({ immediate: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

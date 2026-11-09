import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'
import { Capacitor } from '@capacitor/core'
import { isOfflineCloudWriteError } from './services/cloudWriteGuard'

// Offline cloud writes are expected to fail; the UI shows the read-only banner.
window.addEventListener('unhandledrejection', event => {
  if (isOfflineCloudWriteError(event.reason)) {
    event.preventDefault()
  }
})

// Service workers are not available on file:// or the packaged app:// scheme.
// Capacitor ships its own assets, so a service worker there only risks stale UI.
const isDesktopShell = window.location.protocol === 'file:' || window.location.protocol === 'app:';
if (!isDesktopShell && !Capacitor.isNativePlatform()) {
  registerSW({ immediate: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

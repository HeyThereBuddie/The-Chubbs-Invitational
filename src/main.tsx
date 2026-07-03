import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Register the service worker and enable auto-update.
// This is required for the browser to detect new deployments and update
// the cached JS bundle — without it, old code runs indefinitely.
if ('serviceWorker' in navigator) {
  // When a new service worker takes control (our sw.ts calls skipWaiting +
  // clients.claim on deploy), the already-open page keeps running the OLD
  // bundle until it reloads. Reload once on controller change so a new
  // deployment is picked up automatically without the user reinstalling.
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        // Check for updates immediately on load, and again periodically —
        // important for standalone PWAs that stay open for a long time.
        reg.update()
        setInterval(() => reg.update(), 60_000)
      })
      .catch(() => { /* not critical if SW registration fails */ })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

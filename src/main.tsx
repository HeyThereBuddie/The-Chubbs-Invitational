import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Register the service worker and enable auto-update.
// This is required for the browser to detect new deployments and update
// the cached JS bundle — without it, old code runs indefinitely.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        // Check for updates immediately on every page load
        reg.update()
      })
      .catch(() => { /* not critical if SW registration fails */ })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

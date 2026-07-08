import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export default function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      // Poll for updates every 60s — important for standalone PWA mode
      setInterval(() => registration?.update(), 60_000)
      // Also check whenever the app is brought back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration?.update()
      })
    },
  })

  // Auto-apply a pending update the moment the app is backgrounded, so users
  // never linger on a stale build (no manual "Reload" needed). Reloading while
  // hidden means they simply return to the current version.
  useEffect(() => {
    if (!needRefresh) return
    const onHide = () => { if (document.visibilityState === 'hidden') updateServiceWorker(true) }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [needRefresh, updateServiceWorker])

  if (!needRefresh) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 90,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 16px',
      background: 'var(--panel)',
      border: '1px solid rgba(212,165,58,0.5)',
      borderRadius: 999,
      boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
      backdropFilter: 'blur(16px)',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 13, color: 'var(--tx2)' }}>New version available</span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: 'linear-gradient(135deg, #D4A53A, #e0a010)',
          color: '#080808',
          fontWeight: 700,
          fontSize: 12,
          border: 'none',
          borderRadius: 999,
          padding: '5px 14px',
          cursor: 'pointer',
        }}
      >
        Reload
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--tx3)',
          fontSize: 16,
          lineHeight: 1,
          padding: '2px 4px',
        }}
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}

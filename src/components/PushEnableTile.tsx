import { useState, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { VAPID_PUBLIC_KEY, DEFAULT_NOTIF_PREFS, urlBase64ToUint8Array } from '../lib/push'

// Compact "turn on notifications" prompt for the dashboard. It only shows when
// push is supported and NOT yet enabled — a second, encouraging entry point
// alongside the full controls on the Account page. Enabling makes it disappear.
export default function PushEnableTile() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [status, setStatus] = useState<'unknown' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'>('unknown')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setStatus('unsupported'); return }
    if (Notification.permission === 'denied') { setStatus('denied'); return }
    navigator.serviceWorker.ready.then(async reg => {
      const sub = await reg.pushManager.getSubscription()
      setStatus(sub ? 'subscribed' : 'unsubscribed')
    }).catch(() => setStatus('unsupported'))
  }, [user])

  const subscribe = async () => {
    if (!user) return
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setStatus('denied'); return }
      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) await existing.unsubscribe()
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      await supabase.from('push_subscriptions').upsert(
        { user_id: user.id, subscription: sub.toJSON(), notification_prefs: DEFAULT_NOTIF_PREFS },
        { onConflict: 'user_id' }
      )
      setStatus('subscribed')
      showToast('Notifications enabled!')
    } catch (e) {
      showToast((e as Error).message ?? 'Failed to enable notifications', 'error')
    }
    setLoading(false)
  }

  // Only nudge people who can turn it on but haven't.
  if (status !== 'unsubscribed') return null

  return (
    <div className="animate-fadeUp" style={{
      marginBottom: 16, borderRadius: 16, padding: '13px 16px',
      border: '1px solid var(--gold-25)',
      background: 'linear-gradient(180deg, rgba(212,165,58,0.14), rgba(212,165,58,0.05))',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: 'var(--elev-1)',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        background: 'rgba(212,165,58,0.18)', border: '1px solid var(--gold-40)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Bell size={18} color="#D4A53A" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx1)' }}>Turn on push alerts</div>
        <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 1 }}>Lead changes, eagles & live drama, straight to your phone.</div>
      </div>
      <button
        onClick={subscribe}
        disabled={loading}
        className="pressable"
        style={{
          flexShrink: 0, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
          padding: '9px 16px', borderRadius: 999, fontWeight: 800, fontSize: 13,
          background: '#D4A53A', color: '#1a1206', opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? '…' : 'Turn On'}
      </button>
    </div>
  )
}

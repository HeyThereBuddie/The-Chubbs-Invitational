// Shared Web Push helpers used by the Account page and the dashboard prompt.
import { supabase } from './supabase'

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
  || 'BFw6RXT78FLUWtAKcd7hdVWNghyABhbeAMu-IoA0Hh6PtS8bfgkvA-ugJL7DaASOHk586kEZjK-5rfjzi6JPP6U'

// Remembers that the user chose to have push on. Browsers (iOS PWAs especially)
// silently rotate or drop the push subscription; this flag lets us tell "the sub
// expired, re-create it" apart from "the user deliberately turned it off".
const PUSH_INTENT_KEY = 'chubbs-push-on'

export function setPushIntent(on: boolean) {
  try {
    if (on) localStorage.setItem(PUSH_INTENT_KEY, '1')
    else localStorage.removeItem(PUSH_INTENT_KEY)
  } catch { /* ignore */ }
}

function wantsPush() {
  try { return localStorage.getItem(PUSH_INTENT_KEY) === '1' } catch { return false }
}

export const DEFAULT_NOTIF_PREFS: Record<string, boolean> = {
  lead_change: true, top3_shift: true, hot_streak: true, eagle: true,
  round_complete: true, team_scores: true, contest_winner: true,
  alligator: true, choking: true, score_disputed: false, score_approval: true,
}

export function urlBase64ToUint8Array(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// Keep push alive across browser subscription rotation. Run on every app load
// (and whenever the service worker reports the subscription changed):
//   • If a live subscription exists, re-upsert it so the server always has the
//     current endpoint (self-heals a stale/rotated row). Only the `subscription`
//     column is written, so per-user notification prefs are untouched.
//   • If the subscription was dropped but the user wants push, recreate it.
// It NEVER re-enables push after a deliberate "Turn Off" (which clears the intent
// flag and the server row), so opting out stays opted out.
export async function ensurePushSubscription(userId: string): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    if (Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()

    if (!sub) {
      // No browser subscription. Only silently recreate it if the user actually
      // wants push — the local intent flag, or a still-present server row.
      let intent = wantsPush()
      if (!intent) {
        const { data } = await supabase
          .from('push_subscriptions')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle()
        intent = !!data
      }
      if (!intent) return
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    await supabase.from('push_subscriptions').upsert(
      { user_id: userId, subscription: sub.toJSON() },
      { onConflict: 'user_id' }
    )
    setPushIntent(true)
  } catch { /* best effort — never block app load */ }
}

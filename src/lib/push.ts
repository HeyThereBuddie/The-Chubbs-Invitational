// Shared Web Push helpers used by the Account page and the dashboard prompt.

export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
  || 'BFw6RXT78FLUWtAKcd7hdVWNghyABhbeAMu-IoA0Hh6PtS8bfgkvA-ugJL7DaASOHk586kEZjK-5rfjzi6JPP6U'

export const DEFAULT_NOTIF_PREFS: Record<string, boolean> = {
  lead_change: true, top3_shift: true, hot_streak: true, eagle: true,
  round_complete: true, team_scores: true, contest_winner: true,
  alligator: true, choking: true, score_disputed: false,
}

export function urlBase64ToUint8Array(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

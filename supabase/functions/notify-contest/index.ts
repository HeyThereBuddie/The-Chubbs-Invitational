import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
// @ts-ignore — npm specifier, resolved by Deno
import webpush from 'npm:web-push'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SVC_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@chubbsmemorial.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ok = () => new Response('ok', { headers: CORS })

serve(async (req) => {
  if (req.method === 'OPTIONS') return ok()

  try {
    const { player_name, team_name, contest_type } = await req.json()

    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription, notification_prefs')

    if (!subs?.length) return ok()

    const eligible = subs.filter((s: { notification_prefs: Record<string, boolean> | null }) =>
      s.notification_prefs == null || s.notification_prefs['contest_winner'] !== false
    )
    if (!eligible.length) return ok()

    const label = contest_type === 'ctp' ? 'Closest to Pin' : 'Longest Drive'
    const title = `🎯 ${label} Entry!`
    const body  = player_name
      ? `${player_name} (${team_name}) just submitted a ${label.toLowerCase()} entry`
      : `${team_name} submitted a ${label.toLowerCase()} entry`

    await Promise.allSettled(
      eligible.map((s: { subscription: unknown }) =>
        webpush.sendNotification(s.subscription, JSON.stringify({ title, body }))
      )
    )

    console.log(`[notify-contest] ${label} — ${team_name}, sent to ${eligible.length}/${subs.length}`)
  } catch (e) {
    console.error('[notify-contest] error:', (e as Error).message)
  }

  return ok()
})

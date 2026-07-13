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

type PushSub = { user_id: string; subscription: unknown; notification_prefs: Record<string, boolean> | null }

// Notify a team's foursome partner(s) that there's a score to approve.
serve(async (req) => {
  if (req.method === 'OPTIONS') return ok()
  try {
    let payload: { team_id?: string; hole?: number } = {}
    try { payload = await req.json() } catch { /* no body */ }
    const { team_id, hole } = payload
    if (!team_id || !hole) return ok()

    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const { data: settings } = await supabase.from('tournament_settings').select('approvals_enabled').eq('id', 1).single()
    if (!settings?.approvals_enabled) return ok()

    const { data: postingTeam } = await supabase.from('teams').select('name').eq('id', team_id).single()
    const { data: myTT } = await supabase.from('tee_times').select('tee_time').eq('team_id', team_id).limit(1).maybeSingle()
    if (!myTT?.tee_time) return ok()

    const { data: sib } = await supabase.from('tee_times').select('team_id').eq('tee_time', myTT.tee_time).neq('team_id', team_id)
    const partnerIds = [...new Set((sib ?? []).map((s: { team_id: string }) => s.team_id))]
    if (!partnerIds.length) return ok()

    const { data: partners } = await supabase.from('teams').select('p1_id, p2_id').in('id', partnerIds)
    const userIds: string[] = []
    for (const t of partners ?? []) { if (t.p1_id) userIds.push(t.p1_id); if (t.p2_id) userIds.push(t.p2_id) }
    if (!userIds.length) return ok()

    const { data: subs } = await supabase.from('push_subscriptions').select('user_id, subscription, notification_prefs').in('user_id', userIds)
    const recipients = ((subs ?? []) as PushSub[]).filter(s => s.notification_prefs == null || s.notification_prefs['score_approval'] !== false)

    const title = '✅ Score to approve'
    const body  = `${postingTeam?.name ?? 'Your group'} posted hole ${hole} — approve it so you can move on.`
    await Promise.all(recipients.map(async (s) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      try { await webpush.sendNotification(s.subscription as any, JSON.stringify({ title, body })) } catch { /* dead sub */ }
    }))
    return ok()
  } catch { return ok() }
})

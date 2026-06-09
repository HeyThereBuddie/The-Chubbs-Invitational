import { serve } from 'https://deno.land/std@0.208.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
// @ts-ignore — npm specifier, resolved by Deno
import webpush from 'npm:web-push'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SVC_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@chubbsmemorial.com'

const HOLE_PARS = [4,4,3,5,4,3,4,5,4, 4,3,5,4,4,3,5,4,4]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ok = () => new Response('ok', { headers: CORS })

serve(async (req) => {
  if (req.method === 'OPTIONS') return ok()

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return ok()

    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)

    // Compute current standings
    const [teamsRes, scoresRes] = await Promise.all([
      supabase.from('teams').select('id, name').neq('name', ''),
      supabase.from('scores').select('team_id, hole, score'),
    ])

    const teams  = teamsRes.data  ?? []
    const scores = scoresRes.data ?? []

    type Row = { teamId: string; name: string; toPar: number; thru: number }
    const rows: Row[] = teams.map(team => {
      const ts = scores.filter(s => s.team_id === team.id)
      const map: Record<number, number> = {}
      for (const s of ts) map[s.hole] = s.score
      const played = HOLE_PARS.map((_, i) => map[i + 1] ?? null).filter(s => s !== null) as number[]
      const gross = played.reduce((a, b) => a + b, 0)
      const thru  = played.length
      const par   = HOLE_PARS.slice(0, thru).reduce((a, b) => a + b, 0)
      return { teamId: team.id, name: team.name, toPar: gross - par, thru }
    })

    rows.sort((a, b) => {
      if (a.thru === 0) return 1
      if (b.thru === 0) return -1
      return a.toPar - b.toPar || b.thru - a.thru
    })

    const leader = rows.find(r => r.thru > 0)
    if (!leader) return ok()

    // Check if leader changed
    const { data: settings } = await supabase
      .from('tournament_settings').select('current_leader_team_id').eq('id', 1).single()

    if (settings?.current_leader_team_id === leader.teamId) return ok()

    // Update stored leader
    await supabase.from('tournament_settings')
      .update({ current_leader_team_id: leader.teamId }).eq('id', 1)

    // Fetch all push subscriptions
    const { data: subs } = await supabase.from('push_subscriptions').select('subscription')
    if (!subs?.length) return ok()

    // Send push notifications
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const toPar   = leader.toPar === 0 ? 'E' : leader.toPar > 0 ? `+${leader.toPar}` : `${leader.toPar}`
    const payload = JSON.stringify({
      title: '🏆 New Leader!',
      body:  `${leader.name} takes the lead — ${toPar} thru ${leader.thru}`,
    })

    const results = await Promise.allSettled(
      subs.map(sub => webpush.sendNotification(sub.subscription, payload))
    )

    const sent   = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    console.log(`[push] ${leader.name} leads at ${toPar} — notified ${sent}/${subs.length} (${failed} failed)`)

    return ok()
  } catch (e) {
    console.error('[push] error:', (e as Error).message)
    return ok()
  }
})

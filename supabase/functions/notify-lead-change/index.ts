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

const ok  = () => new Response('ok', { headers: CORS })
const fmt = (n: number) => n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`

type PushSub = {
  user_id: string
  subscription: unknown
  notification_prefs: Record<string, boolean> | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return ok()

  try {
    let payload: { team_id?: string; hole?: number; score?: number; is_admin_edit?: boolean } = {}
    try { payload = await req.json() } catch { /* no body */ }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SVC_KEY)
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const [teamsRes, scoresRes, settingsRes, subsRes] = await Promise.all([
      supabase.from('teams').select('id, name, p1_id, p2_id').neq('name', ''),
      supabase.from('scores').select('team_id, hole, score'),
      supabase.from('tournament_settings').select('*').eq('id', 1).single(),
      supabase.from('push_subscriptions').select('user_id, subscription, notification_prefs'),
    ])

    const teams    = teamsRes.data   ?? []
    const scores   = scoresRes.data  ?? []
    const settings = settingsRes.data ?? {}
    const subs     = (subsRes.data ?? []) as PushSub[]

    if (!subs.length) return ok()

    // ── Build standings ──────────────────────────────────────────
    type Row = { teamId: string; name: string; p1Id: string | null; p2Id: string | null; toPar: number; thru: number }
    const rows: Row[] = teams.map(team => {
      const ts  = scores.filter(s => s.team_id === team.id)
      const map: Record<number, number> = {}
      for (const s of ts) map[s.hole] = s.score
      const played = HOLE_PARS.map((_, i) => map[i + 1] ?? null).filter((s): s is number => s !== null)
      const gross  = played.reduce((a, b) => a + b, 0)
      const thru   = played.length
      const par    = HOLE_PARS.slice(0, thru).reduce((a, b) => a + b, 0)
      return { teamId: team.id, name: team.name, p1Id: team.p1_id, p2Id: team.p2_id, toPar: gross - par, thru }
    })
    rows.sort((a, b) => {
      if (a.thru === 0) return 1
      if (b.thru === 0) return -1
      return a.toPar - b.toPar || b.thru - a.thru
    })

    const leader          = rows.find(r => r.thru > 0)
    const prevLeaderId    = settings.current_leader_team_id as string | null ?? null
    const prevLeaderToPar = settings.notif_leader_to_par    as number | null ?? null
    const prevTop3        = (settings.notif_top3_ids ?? []) as string[]

    // ── Helpers ──────────────────────────────────────────────────
    const eligible = (key: string) =>
      subs.filter(s => s.notification_prefs == null || s.notification_prefs[key] !== false)

    const push = async (recipients: PushSub[], title: string, body: string) => {
      if (!recipients.length) return
      console.log(`[notify] sending "${title}" to ${recipients.length} recipient(s)`)
      const results = await Promise.allSettled(
        recipients.map(s => webpush.sendNotification(s.subscription, JSON.stringify({ title, body })))
      )
      const failed = results.filter(r => r.status === 'rejected')
      if (failed.length) console.error(`[notify] ${failed.length} failed:`, failed.map(r => (r as PromiseRejectedResult).reason?.message))
    }

    const updates: Record<string, unknown> = {}

    // ── 1. Lead Change ───────────────────────────────────────────
    if (leader && leader.teamId !== prevLeaderId) {
      updates.current_leader_team_id = leader.teamId
      await push(eligible('lead_change'), '🏆 New Leader!',
        `${leader.name} takes the lead — ${fmt(leader.toPar)} thru ${leader.thru}`)
    }

    // ── 2. Top 3 Shift ───────────────────────────────────────────
    const top3Now     = rows.filter(r => r.thru > 0).slice(0, 3).map(r => r.teamId)
    const top3Changed = top3Now.length > 0 && JSON.stringify(top3Now) !== JSON.stringify(prevTop3)
    if (top3Changed) {
      updates.notif_top3_ids = top3Now
      if (!updates.current_leader_team_id) {
        const names = top3Now.map(id => rows.find(r => r.teamId === id)?.name).filter(Boolean)
        await push(eligible('top3_shift'), '📊 Top 3 Shift', `New top 3: ${names.join(', ')}`)
      }
    }

    // ── Score-specific notifications ─────────────────────────────
    if (payload.team_id && payload.hole != null && payload.score != null) {
      const { team_id: teamId, hole, score } = payload
      const par  = HOLE_PARS[hole - 1]
      const team = teams.find(t => t.id === teamId)

      // ── 3. Hot Streak ──
      if (score <= par - 1 && hole >= 2 && team) {
        const prevScore = scores.find(s => s.team_id === teamId && s.hole === hole - 1)?.score
        const prevPar   = HOLE_PARS[hole - 2]
        if (prevScore != null && prevScore <= prevPar - 1) {
          await push(eligible('hot_streak'), '🔥 Hot Streak!',
            `${team.name} birdied holes ${hole - 1} & ${hole} back-to-back!`)
        }
      }

      // ── 4. Eagle or Better ──
      if (score <= par - 2 && team) {
        const kind = score === 1 ? 'Hole-in-one!' : score <= par - 3 ? 'Albatross!' : 'Eagle!'
        await push(eligible('eagle'), `🦅 ${kind}`,
          `${team.name} scored ${score} on hole ${hole} (par ${par})`)
      }

      // ── 6. My Team Scores ──
      if (team) {
        const memberIds = new Set([team.p1_id, team.p2_id].filter(Boolean) as string[])
        const members   = subs.filter(s => memberIds.has(s.user_id) && s.notification_prefs?.team_scores !== false)
        const row       = rows.find(r => r.teamId === teamId)
        if (members.length && row && row.thru > 0) {
          await push(members, '⛳ Score Posted',
            `Hole ${hole}: ${score} (${fmt(score - par)}) — ${fmt(row.toPar)} thru ${row.thru}`)
        }
      }

      // ── 8. Alligator Alert ──
      if (score >= par + 2 && team) {
        const label = score >= par + 3 ? 'triple or worse' : 'double bogey'
        await push(eligible('alligator'), '🐊 Alligator Alert!',
          `${team.name} made a ${label} on hole ${hole}`)
      }

      // ── 9. Choking Alert ──
      if (teamId === prevLeaderId && prevLeaderToPar != null && team) {
        const currentRow = rows.find(r => r.teamId === teamId)
        if (currentRow && currentRow.toPar - prevLeaderToPar >= 2) {
          await push(eligible('choking'), '💀 Choking Alert!',
            `${team.name} gave up ${currentRow.toPar - prevLeaderToPar} strokes on hole ${hole}`)
        }
      }

      // ── 11. Score Edited (admin) ──
      if (payload.is_admin_edit && team) {
        await push(eligible('score_disputed'), '📋 Score Edited',
          `An admin changed ${team.name}'s hole ${hole} score to ${score}`)
      }
    }

    // ── 5. Round Complete ────────────────────────────────────────
    if (teams.length > 0 && rows.every(r => r.thru === 18) && !settings.notif_round_complete) {
      updates.notif_round_complete = true
      const msg = leader
        ? `${leader.name} wins at ${fmt(leader.toPar)}! 🏆`
        : 'All 18 holes are complete'
      await push(eligible('round_complete'), '🏁 Round Complete!', msg)
    }

    if (leader) updates.notif_leader_to_par = leader.toPar

    if (Object.keys(updates).length > 0) {
      await supabase.from('tournament_settings').update(updates).eq('id', 1)
    }

    console.log(`[notify] done — leader=${leader?.name ?? 'none'} subs=${subs.length} payload=${JSON.stringify(payload)}`)
  } catch (e) {
    console.error('[notify] error:', (e as Error).message)
  }

  return ok()
})

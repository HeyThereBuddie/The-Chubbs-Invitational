import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useYear } from '../context/YearContext'
import { useSyncContext } from '../context/SyncContext'
import { buildGroupMates, approvedScoreIds } from '../lib/approvals'
import { memberPool, teamLabel } from '../lib/teamName'

// ── Ryder Cup: a read-only points game derived from the scores already recorded ──
// Each foursome (two teams sharing a tee time) is a match. Per hole, the team with
// the lower gross wins 1 point; a tie splits ½–½. Squad totals sum their teams'
// points. This hook NEVER writes scores — it only reads and computes.

export const fmtPts = (n: number): string => {
  const whole = Math.floor(n)
  const half = n - whole >= 0.5
  if (whole === 0) return half ? '½' : '0'
  return `${whole}${half ? '½' : ''}`
}

export interface RyderSide {
  teamId: string
  pairing: string          // e.g. "Evan & Alex"
  points: number
  squad: 'A' | 'B' | null
}
export interface RyderMatch {
  key: string
  left: RyderSide          // squad-A side when known (rendered blue / left)
  right: RyderSide         // squad-B side when known (rendered red / right)
  thru: number
  complete: boolean
}
export interface RyderData {
  loading: boolean
  enabled: boolean
  squadAName: string
  squadBName: string
  squadATotal: number
  squadBTotal: number
  target: number
  pointsPlayed: number
  pointsPossible: number
  matches: RyderMatch[]
}

const EMPTY: RyderData = {
  loading: true, enabled: false, squadAName: 'Team Drew', squadBName: 'Team Kage',
  squadATotal: 0, squadBTotal: 0, target: 0, pointsPlayed: 0, pointsPossible: 0, matches: [],
}

export function useRyderCup(): RyderData {
  const { effectiveTournamentId, isCurrentYear } = useYear()
  const { isOnline } = useSyncContext()
  const [data, setData] = useState<RyderData>(EMPTY)

  useEffect(() => {
    let cancelled = false

    const compute = async () => {
      if (!effectiveTournamentId) { if (!cancelled) setData({ ...EMPTY, loading: false }); return }
      try {
        const { data: settings } = await supabase
          .from('tournament_settings')
          .select('ryder_enabled, ryder_squad_a_name, ryder_squad_b_name, approvals_enabled').eq('id', 1).single()

        if (!settings?.ryder_enabled) {
          if (!cancelled) setData({ ...EMPTY, loading: false, enabled: false })
          return
        }
        const squadAName = settings.ryder_squad_a_name || 'Team Drew'
        const squadBName = settings.ryder_squad_b_name || 'Team Kage'

        const [{ data: teams }, { data: tts }, { data: scores }, { data: appr }] = await Promise.all([
          supabase.from('teams')
            // select('*') so name_custom rides along (resilient if migration 056
            // isn't applied yet — the column is simply absent).
            .select('*, player1:profiles!teams_p1_id_fkey(name, nickname), player2:profiles!teams_p2_id_fkey(name, nickname)')
            .eq('tournament_id', effectiveTournamentId),
          supabase.from('tee_times').select('team_id, tee_time'),
          supabase.from('scores').select('id, team_id, hole, score, updated_at'),
          supabase.from('score_approvals').select('score_id, approving_team_id, status, updated_at'),
        ])

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const teamMap = new Map<string, any>()
        for (const t of teams ?? []) teamMap.set(t.id, t)
        // Field-wide pool so labels disambiguate identically to every other board.
        const namePool = memberPool((teams ?? []) as any[])

        // Only count scores the foursome has approved (when approvals are on). A
        // score that changes goes stale and drops out until it's re-approved.
        const okIds = settings.approvals_enabled
          ? approvedScoreIds(scores ?? [], appr ?? [], buildGroupMates(tts ?? []))
          : null

        // Per-team, per-hole gross.
        const scoreOf = new Map<string, Map<number, number>>()
        for (const s of scores ?? []) {
          if (!teamMap.has(s.team_id)) continue
          if (okIds && !okIds.has(s.id)) continue
          let m = scoreOf.get(s.team_id)
          if (!m) { m = new Map(); scoreOf.set(s.team_id, m) }
          m.set(s.hole, s.score)
        }

        // Matches = tee-time groups of exactly two of this tournament's teams.
        const groups = new Map<string, string[]>()
        for (const tt of tts ?? []) {
          if (!teamMap.has(tt.team_id)) continue
          const key = String(tt.tee_time)
          const arr = groups.get(key) ?? []
          arr.push(tt.team_id)
          groups.set(key, arr)
        }

        const pointsByTeam = new Map<string, number>()
        const matches: RyderMatch[] = []

        for (const [key, ids] of groups) {
          if (ids.length !== 2) continue
          const [id1, id2] = ids
          const s1 = scoreOf.get(id1) ?? new Map<number, number>()
          const s2 = scoreOf.get(id2) ?? new Map<number, number>()
          let p1 = 0, p2 = 0, thru = 0
          for (let h = 1; h <= 18; h++) {
            const a = s1.get(h), b = s2.get(h)
            if (a == null || b == null) continue
            thru++
            if (a < b) p1 += 1
            else if (b < a) p2 += 1
            else { p1 += 0.5; p2 += 0.5 }
          }
          pointsByTeam.set(id1, p1)
          pointsByTeam.set(id2, p2)

          const t1 = teamMap.get(id1), t2 = teamMap.get(id2)
          const side = (t: typeof t1, pts: number): RyderSide => ({
            teamId: t.id,
            // Computed live from current members (shared helper) so it matches the
            // leaderboard / dashboard exactly and never drifts from who's on the team.
            pairing: teamLabel(t, namePool),
            points: pts,
            squad: (t.ryder_squad ?? null) as 'A' | 'B' | null,
          })
          // Squad-A team on the left (blue) when identifiable, else keep input order.
          let left = side(t1, p1), right = side(t2, p2)
          if (t1.ryder_squad === 'B' || t2.ryder_squad === 'A') { left = side(t2, p2); right = side(t1, p1) }

          matches.push({ key, left, right, thru, complete: thru === 18 })
        }

        // Squad totals: each team's match points bucketed by its squad.
        let squadATotal = 0, squadBTotal = 0
        for (const [tid, pts] of pointsByTeam) {
          const sq = teamMap.get(tid)?.ryder_squad
          if (sq === 'A') squadATotal += pts
          else if (sq === 'B') squadBTotal += pts
        }

        const pointsPossible = matches.length * 18
        const pointsPlayed = matches.reduce((a, m) => a + m.thru, 0)
        const target = pointsPossible > 0 ? pointsPossible / 2 + 0.5 : 0

        // Stable order: by tee time.
        matches.sort((a, b) => a.key.localeCompare(b.key))

        if (!cancelled) setData({
          loading: false, enabled: true, squadAName, squadBName,
          squadATotal, squadBTotal, target, pointsPlayed, pointsPossible, matches,
        })
      } catch {
        if (!cancelled) setData(prev => ({ ...prev, loading: false }))
      }
    }

    compute()

    // Live updates while viewing the current tournament.
    if (!isCurrentYear) return () => { cancelled = true }
    const sub = supabase.channel('ryder-cup-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, compute)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, compute)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tee_times' }, compute)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_settings' }, compute)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'score_approvals' }, compute)
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(sub) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTournamentId, isCurrentYear, isOnline])

  return data
}

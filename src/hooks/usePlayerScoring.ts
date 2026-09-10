import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useYear } from '../context/YearContext'
import { useSyncContext } from '../context/SyncContext'
import { useCourse } from '../context/CourseContext'
import { useToast } from '../context/ToastContext'
import { useLive } from './useLive'
import { localDb, parseJson } from '../lib/localDb'
import { enqueue, drainQueue, getPendingCount } from '../lib/writeQueue'
import type { LogFeedEventPayload } from '../lib/writeQueue'
import { displayName } from '../lib/types'
import type { Player } from '../lib/types'
import {
  type TeamFull,
  type ScoreRow,
  type ChulliganRow,
  type GroupTeam,
  scoreFeedInfo,
  puttFeedInfo,
} from '../lib/scoreTypes'

async function pingLeadCheck(payload?: { team_id: string; hole: number; score: number; is_admin_edit?: boolean }) {
  const { data: { session } } = await supabase.auth.getSession()
  supabase.functions.invoke('notify-lead-change', {
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    body: payload,
  }).catch(() => { /* fire and forget */ })
}

// Nudge the foursome partner(s) to (re)approve a hole.
async function pingApprovalNotify(team_id: string, hole: number) {
  const { data: { session } } = await supabase.auth.getSession()
  supabase.functions.invoke('notify-approval', {
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
    body: { team_id, hole },
  }).catch(() => { /* fire and forget */ })
}

// ISO timestamp → ms (0 when absent) for approval-vs-score freshness comparison.
const tsms = (s?: string | null) => (s ? Date.parse(s) : 0)

// A group team's hole is "ready to approve" once it has putts (+ a drive for a
// 2-person team). The score itself always exists when the row does — so partial,
// still-being-entered holes never surface to the other team as approvable.
const groupTeamHasTwo = (gt: GroupTeam) => !!((gt.player1 || gt.p1_name) && (gt.player2 || gt.p2_name))
export const groupScoreReady = (gt: GroupTeam, s: ScoreRow) =>
  s.putts != null && (!groupTeamHasTwo(gt) || !!s.drive_used_id)

export function usePlayerScoring() {
  const { profile, refreshProfile } = useAuth()
  const { effectiveTournamentId, isCurrentYear } = useYear()
  const { isOnline, refreshPendingCount } = useSyncContext()
  const { parOf } = useCourse()
  const { showToast } = useToast()
  const { live } = useLive()

  // Pre-launch Preview mode: non-admins can browse but not post gameplay data.
  // The DB enforces this too — this just gives a friendly message instead of a
  // silent, failing write.
  const isAdmin = profile?.role === 'admin'
  const canScore = isAdmin || live
  const blockedByPreview = () => {
    if (canScore) return false
    showToast('Scoring opens when the tournament goes live', 'error')
    return true
  }

  // Self-heal a missing player→team link. If the profile has no team_id but a team
  // actually lists this player, reconcile_my_team() mends the link server-side and
  // returns the team id so scoring works immediately (and permanently).
  const [reconciledTeamId, setReconciledTeamId] = useState<string | undefined>(undefined)
  const reconcileTriedRef = useRef(false)
  useEffect(() => {
    if (!isCurrentYear || !profile?.id || profile.team_id || reconcileTriedRef.current) return
    reconcileTriedRef.current = true
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.rpc('reconcile_my_team')
        if (cancelled || !data) return
        setReconciledTeamId(data as string)
        refreshProfile()
      } catch { /* offline or not linkable — leave as-is */ }
    })()
    return () => { cancelled = true }
  }, [profile?.id, profile?.team_id, isCurrentYear, refreshProfile])

  const myTeamId = isCurrentYear ? (profile?.team_id ?? reconciledTeamId ?? undefined) : undefined

  const [myTeam,       setMyTeam]       = useState<TeamFull | null>(null)
  const [myScores,     setMyScores]     = useState<Record<number, ScoreRow>>({})
  const [myChulligans, setMyChulligans] = useState<ChulliganRow[]>([])
  const [saving,       setSaving]       = useState<number | null>(null)

  // Cross-team score approval (foursome)
  const [approvalsEnabled, setApprovalsEnabled] = useState(false)
  const [groupTeams,       setGroupTeams]       = useState<GroupTeam[]>([])
  const [approvedScoreIds, setApprovedScoreIds] = useState<Set<string>>(new Set())
  const [myDisputedHoles,  setMyDisputedHoles]  = useState<Set<number>>(new Set())
  const [myApprovedHoles,  setMyApprovedHoles]  = useState<Set<number>>(new Set())  // my holes every other team has validly approved
  const [forcedHoles,      setForcedHoles]      = useState<Set<number>>(new Set())  // holes an admin force-settled for my foursome

  const myTeamIdRef = useRef<string | undefined>(undefined)
  useEffect(() => { myTeamIdRef.current = myTeamId }, [myTeamId])
  const myScoresRef = useRef<Record<number, ScoreRow>>({})
  useEffect(() => { myScoresRef.current = myScores }, [myScores])
  const groupTeamsRef = useRef<GroupTeam[]>([])
  useEffect(() => { groupTeamsRef.current = groupTeams }, [groupTeams])

  // Load the other team(s) in my tee-time group + who's approved what.
  // An approval only COUNTS if it was made at/after the score's last edit — so any
  // change to a score/drive/putts automatically invalidates prior approvals and the
  // group is re-prompted. (scores.updated_at bumps on every edit via a DB trigger.)
  const loadGroup = async (teamId: string, _scoresMap: Record<number, ScoreRow>) => {
    try {
      const { data: settings } = await supabase.from('tournament_settings').select('approvals_enabled').eq('id', 1).single()
      const enabled = !!settings?.approvals_enabled
      setApprovalsEnabled(enabled)
      if (!enabled) { setGroupTeams([]); setApprovedScoreIds(new Set()); setMyDisputedHoles(new Set()); setMyApprovedHoles(new Set()); setForcedHoles(new Set()); return }

      const { data: myTT } = await supabase.from('tee_times').select('tee_time').eq('team_id', teamId).limit(1).maybeSingle()
      if (!myTT?.tee_time) { setGroupTeams([]); setMyApprovedHoles(new Set()); setForcedHoles(new Set()); return }

      // Admin force-settled holes for my foursome (resilient: null if migration 055
      // isn't applied, which just leaves the escape hatch inactive).
      const { data: ovr } = await supabase.from('approval_overrides').select('hole').eq('tee_time', myTT.tee_time)
      setForcedHoles(new Set<number>((ovr ?? []).map((o: { hole: number }) => o.hole)))

      const { data: sib } = await supabase.from('tee_times').select('team_id').eq('tee_time', myTT.tee_time).neq('team_id', teamId)
      const otherIds = [...new Set((sib ?? []).map(s => s.team_id))]
      if (!otherIds.length) { setGroupTeams([]); setMyApprovedHoles(new Set()); return }

      const [teamsRes, scoresRes, chRes] = await Promise.all([
        supabase.from('teams').select('id, name, p1_name, p2_name, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)').in('id', otherIds),
        supabase.from('scores').select('id, hole, score, drive_used_id, putts, team_id, updated_at').in('team_id', otherIds),
        supabase.from('chulligans').select('id, player_id, hole, team_id').in('team_id', otherIds),
      ])
      const scoresByTeam: Record<string, Record<number, ScoreRow>> = {}
      const otherScoreUpdated = new Map<string, string>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of (scoresRes.data ?? []) as any[]) { (scoresByTeam[s.team_id] ??= {})[s.hole] = s; otherScoreUpdated.set(s.id, s.updated_at) }
      const chByTeam: Record<string, ChulliganRow[]> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (chRes.data ?? []) as any[]) { (chByTeam[c.team_id] ??= []).push({ id: c.id, player_id: c.player_id, hole: c.hole }) }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setGroupTeams((teamsRes.data ?? []).map((t: any) => ({
        id: t.id, name: t.name, p1_name: t.p1_name, p2_name: t.p2_name,
        player1: t.player1 ?? undefined, player2: t.player2 ?? undefined,
        scores: scoresByTeam[t.id] ?? {}, chulligans: chByTeam[t.id] ?? [],
      })))

      // My VALID approvals of the other teams' scores.
      const otherScoreIds = [...otherScoreUpdated.keys()]
      const validApprovedByMe = new Set<string>()
      if (otherScoreIds.length) {
        const { data: myApp } = await supabase.from('score_approvals')
          .select('score_id, status, updated_at').eq('approving_team_id', teamId).in('score_id', otherScoreIds)
        for (const a of myApp ?? []) {
          if (a.status === 'approved' && tsms(a.updated_at) >= tsms(otherScoreUpdated.get(a.score_id))) validApprovedByMe.add(a.score_id)
        }
      }
      setApprovedScoreIds(validApprovedByMe)

      // Which of MY holes every other team has validly approved (mutual gate), and
      // which are currently disputed.
      const { data: myMeta } = await supabase.from('scores').select('id, hole, updated_at').eq('team_id', teamId)
      const myById = new Map((myMeta ?? []).map(s => [s.id, s]))
      const myIds = (myMeta ?? []).map(s => s.id)
      const approvedHoles = new Set<number>()
      const disputedHoles = new Set<number>()
      if (myIds.length) {
        const { data: inc } = await supabase.from('score_approvals')
          .select('score_id, approving_team_id, status, updated_at').in('score_id', myIds)
        const approversByScore = new Map<string, Set<string>>()
        const disputersByScore = new Map<string, Set<string>>()
        for (const a of inc ?? []) {
          const meta = myById.get(a.score_id)
          if (!meta || !otherIds.includes(a.approving_team_id)) continue
          if (tsms(a.updated_at) < tsms(meta.updated_at)) continue // stale — score changed after this
          if (a.status === 'approved') (approversByScore.get(a.score_id) ?? approversByScore.set(a.score_id, new Set()).get(a.score_id)!).add(a.approving_team_id)
          else if (a.status === 'disputed') (disputersByScore.get(a.score_id) ?? disputersByScore.set(a.score_id, new Set()).get(a.score_id)!).add(a.approving_team_id)
        }
        for (const meta of myMeta ?? []) {
          if ((approversByScore.get(meta.id)?.size ?? 0) >= otherIds.length) approvedHoles.add(meta.hole)
          if ((disputersByScore.get(meta.id)?.size ?? 0) > 0) disputedHoles.add(meta.hole)
        }
      }
      setMyApprovedHoles(approvedHoles)
      setMyDisputedHoles(disputedHoles)
    } catch { /* offline — approvals stay as-is */ }
  }

  const loadPlayerData = async (teamId: string) => {
    // Step 1: Show cached data immediately (works offline, zero latency)
    const [localScores, localCh, localTeam] = await Promise.all([
      localDb.scores.where('team_id').equals(teamId).toArray(),
      localDb.chulligans.where('team_id').equals(teamId).toArray(),
      localDb.teams.get(teamId),
    ])
    const cacheMap: Record<number, ScoreRow> = {}
    for (const s of localScores) cacheMap[s.hole] = { id: s.id, hole: s.hole, score: s.score, drive_used_id: s.drive_used_id, putts: s.putts }
    setMyScores(cacheMap)
    setMyChulligans(localCh.map(c => ({ id: c.id, player_id: c.player_id, hole: c.hole })))
    if (localTeam) {
      let p1 = parseJson(localTeam.player1_json) as Player | undefined
      let p2 = parseJson(localTeam.player2_json) as Player | undefined
      if (!p1 && localTeam.p1_id) { const r = await localDb.profiles.get(localTeam.p1_id); if (r) p1 = r as unknown as Player }
      if (!p2 && localTeam.p2_id) { const r = await localDb.profiles.get(localTeam.p2_id); if (r) p2 = r as unknown as Player }
      setMyTeam({ ...localTeam, player1: p1, player2: p2 } as unknown as TeamFull)
    }

    // Step 2: Refresh from Supabase in the background
    try {
      const { data: t } = await supabase
        .from('teams')
        .select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
        .eq('id', teamId).single()
      if (!t) return
      // Preserve cached player data if Supabase join returned null (spotty connection)
      setMyTeam(prev => ({ ...t, player1: t.player1 ?? prev?.player1, player2: t.player2 ?? prev?.player2 } as TeamFull))

      // Only overwrite scores when no pending local writes — prevents wiping offline changes
      const pendingCount = await getPendingCount()
      if (pendingCount === 0) {
        const [{ data: scores }, { data: ch }] = await Promise.all([
          // select('*') (not SCORE_SELECT) so submitted_at rides along — and stays
          // resilient if migration 053 hasn't been applied yet (column just absent).
          supabase.from('scores').select('*').eq('team_id', teamId),
          supabase.from('chulligans').select('id, player_id, hole').eq('team_id', teamId),
        ])
        const map: Record<number, ScoreRow> = {}
        for (const s of scores ?? []) map[s.hole] = s
        setMyScores(map)
        setMyChulligans((ch ?? []) as ChulliganRow[])
        void loadGroup(teamId, map)
      } else {
        void loadGroup(teamId, cacheMap)
      }
    } catch { /* offline — cached data already shown */ }
  }

  // Load when team changes or connectivity changes
  useEffect(() => {
    if (myTeamId) loadPlayerData(myTeamId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTeamId, isOnline])

  // Realtime subscription (different channel name from 'scores-rt' to avoid conflicts)
  useEffect(() => {
    const reload = () => {
      if (myTeamIdRef.current) loadPlayerData(myTeamIdRef.current)
    }
    const sub = supabase.channel('player-scoring-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' },     reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chulligans' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'score_approvals' }, () => {
        if (myTeamIdRef.current) loadGroup(myTeamIdRef.current, myScoresRef.current)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_overrides' }, () => {
        if (myTeamIdRef.current) loadGroup(myTeamIdRef.current, myScoresRef.current)
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Instant approval delivery. Postgres change events → full reload is slow, so
  // when a team hits Submit we also fire a lightweight client-to-client broadcast.
  // A teammate/opponent in the same foursome refreshes just their group the moment
  // it lands, so the approval tile pops up right away instead of seconds later.
  const busRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  useEffect(() => {
    const ch = supabase.channel('group-approvals-bus')
      .on('broadcast', { event: 'submitted' }, (msg) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tid = (msg as any)?.payload?.team_id as string | undefined
        if (!tid || !myTeamIdRef.current) return
        if (tid === myTeamIdRef.current || groupTeamsRef.current.some(g => g.id === tid)) {
          loadGroup(myTeamIdRef.current, myScoresRef.current)
        }
      })
      .subscribe()
    busRef.current = ch
    return () => { supabase.removeChannel(ch); busRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Phones sleep/background constantly during a round, which drops the realtime
  // socket — and postgres changes that happened during the gap are never replayed.
  // Reconcile on wake: whenever the app returns to the foreground (or regains the
  // window), re-pull scores + approvals so a player never comes back stuck on a
  // hole the group already settled.
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState === 'visible' && navigator.onLine && myTeamIdRef.current) {
        loadPlayerData(myTeamIdRef.current)
      }
    }
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('focus', resync)
    return () => {
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('focus', resync)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Approve / dispute another team's score for a hole.
  const setApproval = async (scoreId: string, status: 'approved' | 'disputed') => {
    if (blockedByPreview()) return
    if (!myTeamId) return
    setApprovedScoreIds(prev => { const n = new Set(prev); status === 'approved' ? n.add(scoreId) : n.delete(scoreId); return n })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('score_approvals').upsert(
      { score_id: scoreId, approving_team_id: myTeamId, status, updated_at: new Date().toISOString() },
      { onConflict: 'score_id,approving_team_id' })
    if (myTeamIdRef.current) loadGroup(myTeamIdRef.current, myScoresRef.current)
    // Nudge the foursome to refresh instantly — the team whose score I just
    // approved sees the mutual gate clear right away instead of waiting on the
    // slower postgres-change round-trip.
    try { busRef.current?.send({ type: 'broadcast', event: 'submitted', payload: { team_id: myTeamId } }) } catch { /* best effort */ }
  }
  const approveScore = (scoreId: string) => setApproval(scoreId, 'approved')
  const disputeScore = (scoreId: string) => setApproval(scoreId, 'disputed')

  // Explicit "post this hole for approval". The player controls exactly when the
  // group gets prompted: this flushes the score to the server, marks it submitted
  // (a SHARED, persisted lock — both teammates and reloads see it), pushes a
  // notification, and broadcasts to the foursome so the approval tile appears on
  // their phones immediately. Safe to tap again to re-send (e.g. after a fix).
  const submitHole = async (hole: number) => {
    if (blockedByPreview()) return
    if (!myTeamId) return
    // Optimistic lock so the posting device flips to read-only instantly.
    setMyScores(prev => prev[hole] ? { ...prev, [hole]: { ...prev[hole], submitted_at: new Date().toISOString() } } : prev)
    // Make sure the finished hole is actually on the server before we ping — so the
    // group's refresh fetches complete data, not a half-synced row.
    if (navigator.onLine) {
      try { await drainQueue() } catch { /* offline/transient — realtime still catches up */ }
      refreshPendingCount()
    }
    // Notify FIRST so nothing delays the approval prompt: push + instant broadcast.
    pingApprovalNotify(myTeamId, hole)
    try {
      busRef.current?.send({ type: 'broadcast', event: 'submitted', payload: { team_id: myTeamId, hole } })
    } catch { /* broadcast is best-effort; postgres realtime is the backstop */ }
    showToast(`Hole ${hole} sent to your group for approval`)
    // Persist the shared teammate lock afterward, fire-and-forget — it drives the
    // read-only state on your partner's phone, not the other team's approval prompt,
    // so it never gates the notification. If migration 053 isn't applied the column
    // is missing and this no-ops (the client-side per-device lock still works).
    supabase.from('scores').update({ submitted_at: new Date().toISOString() }).eq('team_id', myTeamId).eq('hole', hole)
      .then(() => {}, () => { /* column may not exist yet */ })
  }

  // Reopen a posted hole for editing (clears the shared lock so both teammates can
  // change it). Any actual edit then re-triggers approval via the freshness rule.
  const unlockHole = async (hole: number) => {
    if (!myTeamId) return
    setMyScores(prev => prev[hole] ? { ...prev, [hole]: { ...prev[hole], submitted_at: null } } : prev)
    try { await supabase.from('scores').update({ submitted_at: null }).eq('team_id', myTeamId).eq('hole', hole) } catch { /* column may not exist yet */ }
    try { busRef.current?.send({ type: 'broadcast', event: 'submitted', payload: { team_id: myTeamId, hole } }) } catch { /* best effort */ }
  }

  // ── Actions ─────────────────────────────────────────────────

  const adjustMyScore = async (hole: number, delta: number) => {
    if (blockedByPreview()) return
    if (!myTeamId) return
    navigator.vibrate?.(8)
    const cur  = myScores[hole]?.score ?? parOf(hole)
    const next = Math.max(1, cur + delta)
    const existing = myScores[hole]
    const isNew = !existing?.id || String(existing.id).startsWith('offline-')
    const scoreId = isNew ? `offline-${myTeamId}-${hole}` : existing!.id

    setSaving(hole)

    // Write to local cache FIRST — prevents concurrent loadPlayerData from reading stale IndexedDB
    await localDb.scores.put({
      id: scoreId,
      team_id: myTeamId,
      hole,
      score: next,
      drive_used_id: existing?.drive_used_id ?? null,
      putts: existing?.putts ?? null,
      updated_at: new Date().toISOString(),
    })

    // Optimistic update — localDb is already correct so any concurrent read returns the right value
    setMyScores(prev => ({ ...prev, [hole]: { id: scoreId, hole, score: next, drive_used_id: prev[hole]?.drive_used_id ?? null, putts: prev[hole]?.putts ?? null } }))

    // Queue the score write (LWW dedup: rapid taps keep only the latest)
    await enqueue('set_score', { team_id: myTeamId, hole, score: next }, { team_id: myTeamId, hole })

    // Queue the feed event (same conflict key ensures only the final score is posted)
    const feedInfo = scoreFeedInfo(next, parOf(hole))
    await enqueue('log_feed_event', {
      id: crypto.randomUUID(),
      event_type: 'score',
      team_id: myTeamId ?? null,
      team_name: myTeam?.name ?? '',
      player_name: null,
      voter_name: null,
      hole,
      score: next,
      label: feedInfo.label,
      emoji: feedInfo.emoji,
      tournament_id: effectiveTournamentId ?? null,
    } satisfies LogFeedEventPayload, { team_id: myTeamId, hole, ev: 'score' })

    setSaving(null)

    // Drain immediately if online; notify function is fire-and-forget after sync
    if (navigator.onLine) {
      drainQueue()
        .then(() => { pingLeadCheck({ team_id: myTeamId!, hole, score: next }).catch(() => {}); return refreshPendingCount() })
        .catch(() => {})
    }
    await refreshPendingCount()
  }

  // Create a score row at par if the hole has none yet — lets drive / putts /
  // chulligans be set before a score is dialed in (the sheet shows every field at
  // once instead of revealing them as you go).
  const ensureScore = async (hole: number): Promise<string | null> => {
    if (!myTeamId) return null
    const existing = myScores[hole]
    if (existing?.id) return existing.id
    const scoreId = `offline-${myTeamId}-${hole}`
    const par = parOf(hole)
    await localDb.scores.put({ id: scoreId, team_id: myTeamId, hole, score: par, drive_used_id: null, putts: null, updated_at: new Date().toISOString() })
    setMyScores(prev => ({ ...prev, [hole]: { id: scoreId, hole, score: par, drive_used_id: prev[hole]?.drive_used_id ?? null, putts: prev[hole]?.putts ?? null } }))
    await enqueue('set_score', { team_id: myTeamId, hole, score: par }, { team_id: myTeamId, hole })
    const feedInfo = scoreFeedInfo(par, par)
    await enqueue('log_feed_event', {
      id: crypto.randomUUID(), event_type: 'score', team_id: myTeamId ?? null, team_name: myTeam?.name ?? '',
      player_name: null, voter_name: null, hole, score: par, label: feedInfo.label, emoji: feedInfo.emoji,
      tournament_id: effectiveTournamentId ?? null,
    } satisfies LogFeedEventPayload, { team_id: myTeamId, hole, ev: 'score' })
    if (navigator.onLine) drainQueue().then(() => refreshPendingCount()).catch(() => {})
    return scoreId
  }

  const setMyDrive = async (hole: number, playerId: string) => {
    if (blockedByPreview()) return
    const id = await ensureScore(hole)
    if (!id) return
    const newId = myScores[hole]?.drive_used_id === playerId ? null : playerId

    // Write localDb first so any concurrent read picks up the new value
    await localDb.scores.update(id, { drive_used_id: newId })
    setMyScores(prev => ({ ...prev, [hole]: { ...prev[hole], drive_used_id: newId } }))

    // scores.drive_used_id is an FK to profiles(id): only a registered partner can
    // be persisted. If the drive points at an unclaimed roster/drawn player, keep it
    // local for the UI but skip the server write — otherwise it fails the FK forever
    // and jams the whole sync queue (which also blocks score refresh + approvals).
    const persistable = newId === null || newId === myTeam?.player1?.id || newId === myTeam?.player2?.id
    if (persistable) {
      await enqueue('set_drive', { team_id: myTeamId!, hole, drive_used_id: newId }, { team_id: myTeamId!, hole })
      if (navigator.onLine) drainQueue().then(() => refreshPendingCount()).catch(() => {})
    }
    await refreshPendingCount()
  }

  const setMyPutts = async (hole: number, putts: number) => {
    if (blockedByPreview()) return
    const id = await ensureScore(hole)
    if (!id) return
    const newPutts = myScores[hole]?.putts === putts ? null : putts

    // Write localDb first so any concurrent read picks up the new value
    await localDb.scores.update(id, { putts: newPutts })
    setMyScores(prev => ({ ...prev, [hole]: { ...prev[hole], putts: newPutts } }))
    await enqueue('set_putts', { team_id: myTeamId!, hole, putts: newPutts }, { team_id: myTeamId!, hole })

    // Queue/replace the putt feed event; cancel it if putts dropped below 3
    const puttFeedKey = { team_id: myTeamId!, hole, ev: 'putt' }
    if (newPutts != null && newPutts >= 3) {
      const info = puttFeedInfo(newPutts)
      await enqueue('log_feed_event', {
        id: crypto.randomUUID(),
        event_type: 'putt',
        team_id: myTeamId ?? null,
        team_name: myTeam?.name ?? '',
        player_name: null,
        voter_name: null,
        hole,
        score: null,
        label: info.label,
        emoji: info.emoji,
        tournament_id: effectiveTournamentId ?? null,
      } satisfies LogFeedEventPayload, puttFeedKey)
    } else {
      // Remove any queued putt feed event for this hole (user deselected or chose < 3)
      await localDb.pending_writes
        .where('op_type').equals('log_feed_event')
        .filter(w => w.conflict_key === JSON.stringify(puttFeedKey) && w.status === 'pending')
        .delete()
    }

    if (navigator.onLine) drainQueue().then(() => refreshPendingCount()).catch(() => {})
    await refreshPendingCount()
  }

  const resetMyScore = async (hole: number) => {
    if (blockedByPreview()) return
    const existing = myScores[hole]
    if (!existing?.id) return

    setMyScores(prev => { const next = { ...prev }; delete next[hole]; return next })
    await localDb.scores.delete(existing.id)

    // Cancel any queued feed events for this hole
    for (const evKey of [
      JSON.stringify({ team_id: myTeamId!, hole, ev: 'score' }),
      JSON.stringify({ team_id: myTeamId!, hole, ev: 'putt' }),
    ]) {
      await localDb.pending_writes
        .where('op_type').equals('log_feed_event')
        .filter(w => w.conflict_key === evKey && w.status === 'pending')
        .delete()
    }

    if (!String(existing.id).startsWith('offline-')) {
      // Row exists in Supabase — queue a delete
      await enqueue('delete_score', { team_id: myTeamId!, hole }, { team_id: myTeamId!, hole })
      if (navigator.onLine) drainQueue().then(() => refreshPendingCount()).catch(() => {})
    } else {
      // Row was never synced — just remove related queued writes
      for (const opType of ['set_score', 'set_drive', 'set_putts'] as const) {
        await localDb.pending_writes
          .where('op_type').equals(opType)
          .filter(w => w.conflict_key === JSON.stringify({ team_id: myTeamId!, hole }) && w.status === 'pending')
          .delete()
      }
    }
    await refreshPendingCount()
  }

  const toggleMyChulligan = async (playerId: string, hole: number) => {
    if (blockedByPreview()) return
    if (!myTeamId) return
    const teamId = myTeamId
    const team = myTeam
    const player = [team?.player1, team?.player2].find(p => p?.id === playerId)
    const teamName = team?.name ?? ''
    const playerName = player ? displayName(player) : ''
    const fakeId = `offline-ch-${teamId}-${playerId}`
    const chulFeedKey = { team_id: teamId, player_id: playerId, ev: 'chulligan' }

    const existing = myChulligans.find(c => c.player_id === playerId)

    // chulligans.player_id is an FK to profiles(id): only a registered partner can
    // be persisted. For an unclaimed partner, keep it local for the UI but skip the
    // server write so it never jams the queue on a broken FK.
    const persistable = !!player

    const queueFeedEvent = async () => {
      await enqueue('log_feed_event', {
        id: crypto.randomUUID(),
        event_type: 'chulligan',
        team_id: teamId,
        team_name: teamName,
        player_name: playerName,
        voter_name: null,
        hole,
        score: null,
        label: 'Chulligan',
        emoji: '🍺',
        tournament_id: effectiveTournamentId ?? null,
      } satisfies LogFeedEventPayload, chulFeedKey)
    }

    if (existing) {
      if (existing.hole === hole) {
        // Removing chulligan
        setMyChulligans(myChulligans.filter(c => c.id !== existing.id))
        await localDb.chulligans.delete(existing.id)
        // Cancel any queued chulligan feed event for this player
        await localDb.pending_writes
          .where('op_type').equals('log_feed_event')
          .filter(w => w.conflict_key === JSON.stringify(chulFeedKey) && w.status === 'pending')
          .delete()
        if (persistable) await enqueue('set_chulligan', { team_id: teamId, player_id: playerId, hole, present: false }, { team_id: teamId, player_id: playerId })
      } else {
        // Moving chulligan to a new hole
        setMyChulligans([...myChulligans.filter(c => c.id !== existing.id), { id: fakeId, player_id: playerId, hole }])
        await localDb.chulligans.delete(existing.id)
        await localDb.chulligans.put({ id: fakeId, team_id: teamId, player_id: playerId, hole })
        if (persistable) await enqueue('set_chulligan', { team_id: teamId, player_id: playerId, hole, present: true }, { team_id: teamId, player_id: playerId })
        await queueFeedEvent()
      }
    } else {
      // Adding new chulligan
      setMyChulligans([...myChulligans, { id: fakeId, player_id: playerId, hole }])
      await localDb.chulligans.put({ id: fakeId, team_id: teamId, player_id: playerId, hole })
      if (persistable) await enqueue('set_chulligan', { team_id: teamId, player_id: playerId, hole, present: true }, { team_id: teamId, player_id: playerId })
      await queueFeedEvent()
    }

    if (navigator.onLine) drainQueue().then(() => refreshPendingCount()).catch(() => {})
    await refreshPendingCount()
  }

  const countDrives = (pid: string | null, from: number, to: number): number => {
    if (!pid) return 0
    let n = 0
    for (let h = from; h <= to; h++) {
      if (myScores[h]?.drive_used_id === pid) n++
    }
    return n
  }

  // Group scores I still need to approve — drives the GPS reminder banner. Only
  // holes the other team has actually finished (score + putts + drive) count, so a
  // half-entered hole never nags anyone to approve it.
  const pendingApprovals = groupTeams.flatMap(gt =>
    Object.values(gt.scores)
      .filter(s => groupScoreReady(gt, s) && !approvedScoreIds.has(s.id))
      .map(s => ({ team: gt, score: s, hole: s.hole })))
    .sort((a, b) => a.hole - b.hole)

  // Holes that are fully settled: my hole is finished, every other team has posted
  // AND been approved by me, and every other team has approved mine. This drives
  // auto-advance at the GPS level so it works whether or not the score sheet is
  // open (a player who approves from the reminder banner still moves on).
  const settledHoles = (() => {
    const out = new Set<number>()
    if (!approvalsEnabled || groupTeams.length === 0) return out
    const twoP = !!((myTeam?.player1 || myTeam?.p1_name) && (myTeam?.player2 || myTeam?.p2_name))
    for (let h = 1; h <= 18; h++) {
      const mine = myScores[h]
      const mineComplete = !!mine && mine.putts != null && (!twoP || !!mine.drive_used_id)
      if (!mineComplete) continue
      // Admin force-settled this hole for the foursome — bypass the mutual gate.
      if (forcedHoles.has(h)) { out.add(h); continue }
      if (!myApprovedHoles.has(h)) continue
      let ok = true
      for (const gt of groupTeams) {
        const s = gt.scores[h]
        if (!s || !groupScoreReady(gt, s) || !approvedScoreIds.has(s.id)) { ok = false; break }
      }
      if (ok) out.add(h)
    }
    return out
  })()

  return {
    myTeam,
    myTeamId,
    myScores,
    myChulligans,
    saving,
    adjustMyScore,
    setMyDrive,
    setMyPutts,
    resetMyScore,
    toggleMyChulligan,
    countDrives,
    // Cross-team approval
    approvalsEnabled,
    groupTeams,
    approvedScoreIds,
    myDisputedHoles,
    myApprovedHoles,
    forcedHoles,
    pendingApprovals,
    settledHoles,
    approveScore,
    disputeScore,
    submitHole,
    unlockHole,
  }
}

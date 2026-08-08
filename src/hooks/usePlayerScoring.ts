import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useYear } from '../context/YearContext'
import { useSyncContext } from '../context/SyncContext'
import { useCourse } from '../context/CourseContext'
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
  SCORE_SELECT,
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

export function usePlayerScoring() {
  const { profile } = useAuth()
  const { effectiveTournamentId, isCurrentYear } = useYear()
  const { isOnline, refreshPendingCount } = useSyncContext()
  const { parOf } = useCourse()

  const myTeamId = isCurrentYear ? (profile?.team_id ?? undefined) : undefined

  const [myTeam,       setMyTeam]       = useState<TeamFull | null>(null)
  const [myScores,     setMyScores]     = useState<Record<number, ScoreRow>>({})
  const [myChulligans, setMyChulligans] = useState<ChulliganRow[]>([])
  const [saving,       setSaving]       = useState<number | null>(null)

  // Cross-team score approval (foursome)
  const [approvalsEnabled, setApprovalsEnabled] = useState(false)
  const [groupTeams,       setGroupTeams]       = useState<GroupTeam[]>([])
  const [approvedScoreIds, setApprovedScoreIds] = useState<Set<string>>(new Set())
  const [myDisputedHoles,  setMyDisputedHoles]  = useState<Set<number>>(new Set())

  const myTeamIdRef = useRef<string | undefined>(undefined)
  useEffect(() => { myTeamIdRef.current = myTeamId }, [myTeamId])
  const myScoresRef = useRef<Record<number, ScoreRow>>({})
  useEffect(() => { myScoresRef.current = myScores }, [myScores])

  // Load the other team(s) in my tee-time group + who's approved what.
  const loadGroup = async (teamId: string, scoresMap: Record<number, ScoreRow>) => {
    try {
      const { data: settings } = await supabase.from('tournament_settings').select('approvals_enabled').eq('id', 1).single()
      const enabled = !!settings?.approvals_enabled
      setApprovalsEnabled(enabled)
      if (!enabled) { setGroupTeams([]); setApprovedScoreIds(new Set()); setMyDisputedHoles(new Set()); return }

      const { data: myTT } = await supabase.from('tee_times').select('tee_time').eq('team_id', teamId).limit(1).maybeSingle()
      if (!myTT?.tee_time) { setGroupTeams([]); return }
      const { data: sib } = await supabase.from('tee_times').select('team_id').eq('tee_time', myTT.tee_time).neq('team_id', teamId)
      const otherIds = [...new Set((sib ?? []).map(s => s.team_id))]
      if (!otherIds.length) { setGroupTeams([]); return }

      const [teamsRes, scoresRes, chRes] = await Promise.all([
        supabase.from('teams').select('id, name, p1_name, p2_name, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)').in('id', otherIds),
        supabase.from('scores').select('id, hole, score, drive_used_id, putts, team_id').in('team_id', otherIds),
        supabase.from('chulligans').select('id, player_id, hole, team_id').in('team_id', otherIds),
      ])
      const scoresByTeam: Record<string, Record<number, ScoreRow>> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const s of (scoresRes.data ?? []) as any[]) { (scoresByTeam[s.team_id] ??= {})[s.hole] = s }
      const chByTeam: Record<string, ChulliganRow[]> = {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (chRes.data ?? []) as any[]) { (chByTeam[c.team_id] ??= []).push({ id: c.id, player_id: c.player_id, hole: c.hole }) }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setGroupTeams((teamsRes.data ?? []).map((t: any) => ({
        id: t.id, name: t.name, p1_name: t.p1_name, p2_name: t.p2_name,
        player1: t.player1 ?? undefined, player2: t.player2 ?? undefined,
        scores: scoresByTeam[t.id] ?? {}, chulligans: chByTeam[t.id] ?? [],
      })))

      const { data: myApp } = await supabase.from('score_approvals').select('score_id').eq('approving_team_id', teamId).eq('status', 'approved')
      setApprovedScoreIds(new Set((myApp ?? []).map(a => a.score_id)))

      const myScoreIds = Object.values(scoresMap).map(s => s.id).filter(id => !String(id).startsWith('offline-'))
      if (myScoreIds.length) {
        const { data: inc } = await supabase.from('score_approvals').select('score_id').in('score_id', myScoreIds).eq('status', 'disputed')
        const disputed = new Set((inc ?? []).map(a => a.score_id))
        const holes = new Set<number>()
        for (const [h, s] of Object.entries(scoresMap)) if (disputed.has(s.id)) holes.add(Number(h))
        setMyDisputedHoles(holes)
      } else setMyDisputedHoles(new Set())
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
          supabase.from('scores').select(SCORE_SELECT).eq('team_id', teamId),
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
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Approve / dispute another team's score for a hole.
  const setApproval = async (scoreId: string, status: 'approved' | 'disputed') => {
    if (!myTeamId) return
    setApprovedScoreIds(prev => { const n = new Set(prev); status === 'approved' ? n.add(scoreId) : n.delete(scoreId); return n })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('score_approvals').upsert(
      { score_id: scoreId, approving_team_id: myTeamId, status, updated_at: new Date().toISOString() },
      { onConflict: 'score_id,approving_team_id' })
    if (myTeamIdRef.current) loadGroup(myTeamIdRef.current, myScoresRef.current)
  }
  const approveScore = (scoreId: string) => setApproval(scoreId, 'approved')
  const disputeScore = (scoreId: string) => setApproval(scoreId, 'disputed')

  // ── Actions ─────────────────────────────────────────────────

  const adjustMyScore = async (hole: number, delta: number) => {
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

  // Group scores I still need to approve — drives the GPS reminder banner.
  const pendingApprovals = groupTeams.flatMap(gt =>
    Object.values(gt.scores)
      .filter(s => !approvedScoreIds.has(s.id))
      .map(s => ({ team: gt, score: s, hole: s.hole })))
    .sort((a, b) => a.hole - b.hole)

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
    pendingApprovals,
    approveScore,
    disputeScore,
  }
}

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import type { Team, Player } from '../lib/types'
import { Minus, Plus, CheckCircle, Clock, Users, Bell } from 'lucide-react'

function pushNotification(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (!document.hidden) return  // in-app toast handles foreground
  try {
    const n = new Notification(title, { body, icon: '/favicon.ico' })
    n.onclick = () => { window.focus(); n.close() }
  } catch (_) {}
}

const HOLE_PARS = [4,4,3,5,4,3,4,5,4, 4,3,5,4,4,3,5,4,4]

type TeamFull = Team & { player1?: Player; player2?: Player }
type ScoreRow = { id: string; hole: number; score: number; drive_used_id: string | null }

function scoreBubbleClass(score: number, par: number): string {
  const diff = score - par
  if (diff <= -2) return 'score-eagle'
  if (diff === -1) return 'score-birdie'
  if (diff === 0)  return 'score-par'
  if (diff === 1)  return 'score-bogey'
  return 'score-double'
}

function calcStats(scoreMap: Record<number, ScoreRow>) {
  const entries = Object.values(scoreMap)
  const gross = entries.reduce((a, s) => a + s.score, 0)
  const thru  = entries.length
  const toPar = gross - HOLE_PARS.slice(0, thru).reduce((a, b) => a + b, 0)
  return { gross, thru, toPar, toParStr: toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}` }
}

export default function Scores() {
  const { profile, isAdmin } = useAuth()
  const { showToast } = useToast()
  const myTeamId = profile?.team_id ?? undefined

  const [allTeams,     setAllTeams]     = useState<TeamFull[]>([])
  const [myTeam,       setMyTeam]       = useState<TeamFull | null>(null)
  const [partnerTeam,  setPartnerTeam]  = useState<TeamFull | null>(null)
  const [myScores,     setMyScores]     = useState<Record<number, ScoreRow>>({})
  const [partnerScores,setPartnerScores]= useState<Record<number, ScoreRow>>({})
  const [adminScores,  setAdminScores]  = useState<Record<number, ScoreRow>>({})
  const [approvedIds,  setApprovedIds]  = useState<Set<string>>(new Set())

  const [adminTeamId,  setAdminTeamId]  = useState<string | null>(null)
  const [tab,          setTab]          = useState<'mine' | 'approve'>('mine')
  const [half,         setHalf]         = useState<'front' | 'back'>('front')
  const [saving,       setSaving]       = useState<number | null>(null)
  const [approving,    setApproving]    = useState<number | null>(null)
  const [teamPick,     setTeamPick]     = useState('')
  const [settingTeam,  setSettingTeam]  = useState(false)
  const [notifPerm,    setNotifPerm]    = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )

  // Refs so realtime handlers always see the latest values without re-subscribing
  const partnerTeamRef  = useRef<TeamFull | null>(null)
  const myTeamIdRef     = useRef<string | undefined>(undefined)
  const myScoresRef     = useRef<Record<number, ScoreRow>>({})
  useEffect(() => { partnerTeamRef.current  = partnerTeam }, [partnerTeam])
  useEffect(() => { myTeamIdRef.current     = myTeamId    }, [myTeamId])
  useEffect(() => { myScoresRef.current     = myScores    }, [myScores])

  // ── Load ────────────────────────────────────────────────────

  useEffect(() => { loadAllTeams() }, [])
  useEffect(() => { if (myTeamId) loadPlayerData(myTeamId) }, [myTeamId])
  useEffect(() => { if (adminTeamId) loadAdminScores(adminTeamId) }, [adminTeamId])

  useEffect(() => {
    const sub = supabase.channel('scores-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, (payload: any) => {
        if (myTeamIdRef.current) loadPlayerData(myTeamIdRef.current)
        if (adminTeamId) loadAdminScores(adminTeamId)

        // Notify when the partner team enters a new score
        if (payload.eventType === 'INSERT') {
          const row = payload.new as { team_id: string; hole: number; score: number }
          const partner = partnerTeamRef.current
          if (partner && row.team_id === partner.id) {
            const par  = HOLE_PARS[row.hole - 1]
            const diff = row.score - par
            const rel  = diff === 0 ? 'Par' : diff < 0 ? `${Math.abs(diff)} under` : `${diff} over`
            const msg  = `⛳ Hole ${row.hole} — ${partner.name} entered a ${row.score} (${rel}). Tap to approve.`
            showToast(msg)
            pushNotification(`Hole ${row.hole} needs approval`, `${partner.name} scored ${row.score} (${rel} par)`)
          }
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'score_approvals' }, (payload: any) => {
        if (myTeamIdRef.current) loadPlayerData(myTeamIdRef.current)

        // Notify when partner approves one of our scores
        const approval = payload.new as { score_id: string }
        const myScores = myScoresRef.current
        const entry = Object.entries(myScores).find(([, s]) => s.id === approval.score_id)
        if (entry) {
          const hole = Number(entry[0])
          const partner = partnerTeamRef.current
          const who = partner ? partner.name : 'Your partner'
          showToast(`✓ Hole ${hole} approved by ${who}`)
          pushNotification(`Hole ${hole} approved`, `${who} signed off on your score`)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [myTeamId, adminTeamId])

  const loadAllTeams = async () => {
    const { data } = await supabase
      .from('teams')
      .select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
    if (data) {
      setAllTeams(data)
      if (isAdmin && data.length) setAdminTeamId(data[0].id)
    }
  }

  const loadPlayerData = async (teamId: string) => {
    const { data: t } = await supabase
      .from('teams')
      .select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
      .eq('id', teamId).single()
    if (t) setMyTeam(t)

    const { data: fs } = await supabase
      .from('foursomes')
      .select('team_a_id, team_b_id')
      .or(`team_a_id.eq.${teamId},team_b_id.eq.${teamId}`)
      .maybeSingle()

    const partnerId = fs
      ? (fs.team_a_id === teamId ? fs.team_b_id : fs.team_a_id)
      : null

    if (partnerId) {
      const { data: pt } = await supabase
        .from('teams')
        .select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
        .eq('id', partnerId).single()
      if (pt) setPartnerTeam(pt)
    }

    const SCORE_SELECT = 'id, hole, score, drive_used_id'
    const [myRes, partnerRes] = await Promise.all([
      supabase.from('scores').select(SCORE_SELECT).eq('team_id', teamId),
      partnerId
        ? supabase.from('scores').select(SCORE_SELECT).eq('team_id', partnerId)
        : Promise.resolve({ data: [] as ScoreRow[] }),
    ])

    const myMap: Record<number, ScoreRow> = {}
    for (const s of myRes.data ?? []) myMap[s.hole] = s
    setMyScores(myMap)

    const partnerMap: Record<number, ScoreRow> = {}
    for (const s of (partnerRes as any).data ?? []) partnerMap[s.hole] = s
    setPartnerScores(partnerMap)

    const allIds = [
      ...Object.values(myMap).map(s => s.id),
      ...Object.values(partnerMap).map(s => s.id),
    ].filter(Boolean)

    if (allIds.length) {
      const { data: approvals } = await supabase
        .from('score_approvals').select('score_id').in('score_id', allIds)
      setApprovedIds(new Set((approvals ?? []).map((a: any) => a.score_id)))
    } else {
      setApprovedIds(new Set())
    }
  }

  const loadAdminScores = async (teamId: string) => {
    const { data } = await supabase.from('scores').select('id, hole, score, drive_used_id').eq('team_id', teamId)
    const map: Record<number, ScoreRow> = {}
    for (const s of data ?? []) map[s.hole] = s
    setAdminScores(map)
    if (data?.length) {
      const { data: approvals } = await supabase
        .from('score_approvals').select('score_id').in('score_id', data.map(s => s.id))
      setApprovedIds(prev => new Set([...prev, ...(approvals ?? []).map((a: any) => a.score_id)]))
    }
  }

  // ── Actions ─────────────────────────────────────────────────

  const adjustMyScore = async (hole: number, delta: number) => {
    if (!myTeamId) return
    const cur  = myScores[hole]?.score ?? HOLE_PARS[hole - 1]
    const next = Math.max(1, cur + delta)
    setSaving(hole)
    const existing = myScores[hole]
    if (existing?.id) {
      await supabase.from('scores').update({ score: next }).eq('id', existing.id)
      setMyScores(prev => ({ ...prev, [hole]: { ...prev[hole], score: next } }))
    } else {
      const { data } = await supabase.from('scores')
        .insert({ team_id: myTeamId, hole, score: next }).select('id, drive_used_id').single()
      if (data) setMyScores(prev => ({ ...prev, [hole]: { id: data.id, hole, score: next, drive_used_id: data.drive_used_id } }))
    }
    setSaving(null)
  }

  const adjustAdminScore = async (hole: number, delta: number) => {
    if (!adminTeamId) return
    const cur  = adminScores[hole]?.score ?? HOLE_PARS[hole - 1]
    const next = Math.max(1, cur + delta)
    setSaving(hole)
    const existing = adminScores[hole]
    if (existing?.id) {
      await supabase.from('scores').update({ score: next }).eq('id', existing.id)
      setAdminScores(prev => ({ ...prev, [hole]: { ...prev[hole], score: next } }))
    } else {
      const { data } = await supabase.from('scores')
        .insert({ team_id: adminTeamId, hole, score: next }).select('id, drive_used_id').single()
      if (data) setAdminScores(prev => ({ ...prev, [hole]: { id: data.id, hole, score: next, drive_used_id: data.drive_used_id } }))
    }
    setSaving(null)
  }

  const approveScore = async (scoreRow: ScoreRow, hole: number) => {
    if (!myTeamId) return
    setApproving(hole)
    const { error } = await supabase.from('score_approvals').insert({
      score_id: scoreRow.id,
      approving_team_id: myTeamId,
    })
    if (!error) setApprovedIds(prev => new Set([...prev, scoreRow.id]))
    setApproving(null)
  }

  const claimTeam = async () => {
    if (!teamPick || !profile) return
    setSettingTeam(true)
    await supabase.from('profiles').update({ team_id: teamPick }).eq('id', profile.id)
    setSettingTeam(false)
    window.location.reload()
  }

  const setMyDrive = async (hole: number, playerId: string) => {
    const existing = myScores[hole]
    if (!existing?.id) return
    const newId = existing.drive_used_id === playerId ? null : playerId
    await supabase.from('scores').update({ drive_used_id: newId }).eq('id', existing.id)
    setMyScores(prev => ({ ...prev, [hole]: { ...prev[hole], drive_used_id: newId } }))
  }

  const setAdminDrive = async (hole: number, playerId: string) => {
    const existing = adminScores[hole]
    if (!existing?.id) return
    const newId = existing.drive_used_id === playerId ? null : playerId
    await supabase.from('scores').update({ drive_used_id: newId }).eq('id', existing.id)
    setAdminScores(prev => ({ ...prev, [hole]: { ...prev[hole], drive_used_id: newId } }))
  }

  const countDrives = (pid: string | null, from: number, to: number, scoreMap: Record<number, ScoreRow>) => {
    if (!pid) return 0
    let n = 0
    for (let h = from; h <= to; h++) {
      if (scoreMap[h]?.drive_used_id === pid) n++
    }
    return n
  }

  // ── Helpers ──────────────────────────────────────────────────

  const holes = half === 'front'
    ? Array.from({ length: 9 }, (_, i) => i + 1)
    : Array.from({ length: 9 }, (_, i) => i + 10)

  const pageHeader = (
    <div style={{ marginBottom: 20 }}>
      <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4 }}>Scores</h1>
      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Best ball — one score per hole per team</p>
    </div>
  )

  const HoleCard = ({
    hole, scoreRow, approved, isSaving, onMinus, onPlus, right,
    player1, player2, onSetDrive,
  }: {
    hole: number
    scoreRow: ScoreRow | undefined
    approved: boolean
    isSaving: boolean
    onMinus?: () => void
    onPlus?: () => void
    right?: React.ReactNode
    player1?: Player
    player2?: Player
    onSetDrive?: (playerId: string) => void
  }) => {
    const par      = HOLE_PARS[hole - 1]
    const score    = scoreRow?.score
    const hasScore = score !== undefined
    const cls      = hasScore ? scoreBubbleClass(score, par) : 'score-empty'
    const locked   = approved
    const driveId  = scoreRow?.drive_used_id ?? null

    return (
      <div className="glass animate-fadeUp" style={{
        padding: '14px 20px', opacity: isSaving ? 0.7 : 1, transition: 'opacity 0.2s',
      }}>
        {/* Main row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 36, textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{hole}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Par {par}</div>
          </div>

          {onMinus !== undefined ? (
            <div style={{ flex: 1 }}>
              {hasScore && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                  {approved
                    ? <><CheckCircle size={11} style={{ color: '#4ade80' }} /><span style={{ color: '#4ade80' }}>Approved</span></>
                    : <><Clock size={11} style={{ color: 'rgba(255,255,255,0.3)' }} /><span style={{ color: 'rgba(255,255,255,0.3)' }}>Awaiting approval</span></>
                  }
                </div>
              )}
            </div>
          ) : (
            <div style={{ flex: 1 }} />
          )}

          <div className={`score-bubble ${cls}`} style={{ width: 56, height: 56, fontSize: 20 }}>
            {hasScore ? score : '—'}
          </div>

          {onMinus !== undefined ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                onClick={onMinus}
                disabled={isSaving || locked || (hasScore && score <= 1)}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: locked ? 'rgba(255,255,255,0.2)' : '#fff',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><Minus size={14} /></button>
              <button
                onClick={onPlus}
                disabled={isSaving || locked}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: locked ? 'rgba(255,255,255,0.04)' : 'rgba(252,181,20,0.15)',
                  border: `1px solid ${locked ? 'rgba(255,255,255,0.08)' : 'rgba(252,181,20,0.3)'}`,
                  color: locked ? 'rgba(255,255,255,0.2)' : '#FCB514',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><Plus size={14} /></button>
            </div>
          ) : (
            <div style={{ minWidth: 110, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
              {right}
            </div>
          )}
        </div>

        {/* Drive selector — edit mode, score entered, not locked */}
        {onMinus !== undefined && hasScore && !locked && player1 && player2 && onSetDrive && (
          <div style={{
            marginTop: 10, paddingTop: 10,
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>Drive:</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[player1, player2].map(p => {
                const first = p.name.split(' ')[0]
                const active = driveId === p.id
                return (
                  <button key={p.id} onClick={() => onSetDrive(p.id)} style={{
                    padding: '4px 12px', borderRadius: 999,
                    fontSize: 12, fontWeight: 600,
                    border: '1px solid',
                    background: active ? 'rgba(252,181,20,0.18)' : 'rgba(255,255,255,0.05)',
                    borderColor: active ? '#FCB514' : 'rgba(255,255,255,0.12)',
                    color: active ? '#FCB514' : 'rgba(255,255,255,0.45)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    {first}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Drive info — read-only (approval tab or locked) */}
        {(onMinus === undefined || locked) && hasScore && driveId && player1 && player2 && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
            Drive: {[player1, player2].find(p => p.id === driveId)?.name.split(' ')[0] ?? '—'}
          </div>
        )}
      </div>
    )
  }

  const DriveCounter = ({
    scoreMap, p1, p2,
  }: {
    scoreMap: Record<number, ScoreRow>
    p1: Player | undefined
    p2: Player | undefined
  }) => {
    if (!p1 || !p2) return null
    const halves = [
      { label: 'Front 9', from: 1,  to: 9  },
      { label: 'Back 9',  from: 10, to: 18 },
    ]
    return (
      <div className="glass" style={{ padding: '12px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
          Drive usage — min 4 each per half
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {halves.map(({ label, from, to }) => {
            const p1c = countDrives(p1.id, from, to, scoreMap)
            const p2c = countDrives(p2.id, from, to, scoreMap)
            return (
              <div key={label}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>{label}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[{ name: p1.name.split(' ')[0], count: p1c }, { name: p2.name.split(' ')[0], count: p2c }].map(({ name, count }) => {
                    const ok = count >= 4
                    return (
                      <div key={name} style={{
                        flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 8,
                        background: ok ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                      }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: ok ? '#22c55e' : 'rgba(255,255,255,0.7)' }}>
                          {count}
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{name}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const enableNotifications = async () => {
    const result = await Notification.requestPermission()
    setNotifPerm(result)
    if (result === 'granted') showToast('Notifications enabled')
  }

  const notifBanner = !isAdmin && notifPerm === 'default' && typeof Notification !== 'undefined' ? (
    <div className="glass" style={{ padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: '1px solid rgba(252,181,20,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Bell size={14} style={{ color: '#FCB514', flexShrink: 0 }} />
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Get notified when your partner enters a score</span>
      </div>
      <button className="btn-outline" onClick={enableNotifications} style={{ padding: '5px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
        Enable
      </button>
    </div>
  ) : null

  // ── No team ──────────────────────────────────────────────────
  if (!isAdmin && !myTeamId) {
    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {pageHeader}
        <div className="glass animate-fadeUp" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ margin: '0 auto 16px', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', borderRadius: '50%' }}>
            <Users size={24} style={{ color: 'rgba(255,255,255,0.3)' }} />
          </div>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginBottom: 6 }}>You're not assigned to a team yet</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 24 }}>Pick your team to start entering scores</p>
          <select value={teamPick} onChange={e => setTeamPick(e.target.value)} style={{ marginBottom: 16 }}>
            <option value="">— Select your team —</option>
            {allTeams.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}{(t.player1 || t.player2) ? ` — ${[t.player1?.name, t.player2?.name].filter(Boolean).join(' & ')}` : ''}
              </option>
            ))}
          </select>
          <button className="btn-gold" onClick={claimTeam} disabled={!teamPick || settingTeam}>
            {settingTeam ? 'Saving…' : 'This is my team'}
          </button>
        </div>
      </div>
    )
  }

  // ── Admin view ───────────────────────────────────────────────
  if (isAdmin) {
    const adminTeam = allTeams.find(t => t.id === adminTeamId)
    const stats = adminTeam ? calcStats(adminScores) : null

    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {pageHeader}

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 16 }}>
          {allTeams.map(t => (
            <button key={t.id} onClick={() => { setAdminTeamId(t.id); setAdminScores({}) }}
              className={`pill-tab ${adminTeamId === t.id ? 'active' : ''}`}>{t.name}</button>
          ))}
        </div>

        {adminTeam && stats && (
          <div className="glass animate-fadeUp" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#FCB514' }}>{adminTeam.name}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                {[adminTeam.player1?.name, adminTeam.player2?.name].filter(Boolean).join(' & ')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: stats.toPar <= 0 ? '#FCB514' : '#fff' }}>{stats.toParStr}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>To Par</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{stats.gross || '—'}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Gross</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{stats.thru}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Thru</div></div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['front', 'back'] as const).map(h => (
            <button key={h} onClick={() => setHalf(h)} className={`pill-tab ${half === h ? 'active' : ''}`}>
              {h === 'front' ? 'Front 9 (1–9)' : 'Back 9 (10–18)'}
            </button>
          ))}
        </div>

        {adminTeam?.player1 && adminTeam?.player2 && (
          <DriveCounter scoreMap={adminScores} p1={adminTeam.player1} p2={adminTeam.player2} />
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {holes.map(hole => (
            <HoleCard
              key={hole}
              hole={hole}
              scoreRow={adminScores[hole]}
              approved={adminScores[hole] ? approvedIds.has(adminScores[hole].id) : false}
              isSaving={saving === hole}
              onMinus={() => adjustAdminScore(hole, -1)}
              onPlus={() => adjustAdminScore(hole, 1)}
              player1={adminTeam?.player1}
              player2={adminTeam?.player2}
              onSetDrive={(pid) => setAdminDrive(hole, pid)}
            />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
          <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#FCB514', display: 'inline-block' }} />
          Scores sync in real-time to all connected devices
        </div>
      </div>
    )
  }

  // ── Player view ───────────────────────────────────────────────
  const myStats = calcStats(myScores)

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {pageHeader}
      {notifBanner}

      {/* My team summary */}
      {myTeam && (
        <div className="glass animate-fadeUp" style={{ padding: '16px 20px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4 }}>Your Team</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#FCB514' }}>{myTeam.name}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              {[myTeam.player1?.name, myTeam.player2?.name].filter(Boolean).join(' & ')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: myStats.toPar <= 0 ? '#FCB514' : '#fff' }}>{myStats.toParStr}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>To Par</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{myStats.gross || '—'}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Gross</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{myStats.thru}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Thru</div></div>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('mine')} className={`pill-tab ${tab === 'mine' ? 'active' : ''}`}>
          My Scores
        </button>
        {partnerTeam ? (
          <button onClick={() => setTab('approve')} className={`pill-tab ${tab === 'approve' ? 'active' : ''}`}>
            Approve · {partnerTeam.name}
          </button>
        ) : (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
            No foursome assigned yet
          </span>
        )}
      </div>

      {/* Front / Back */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['front', 'back'] as const).map(h => (
          <button key={h} onClick={() => setHalf(h)} className={`pill-tab ${half === h ? 'active' : ''}`}>
            {h === 'front' ? 'Front 9 (1–9)' : 'Back 9 (10–18)'}
          </button>
        ))}
      </div>

      {/* MY SCORES */}
      {tab === 'mine' && (
        <>
          <DriveCounter scoreMap={myScores} p1={myTeam?.player1} p2={myTeam?.player2} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {holes.map(hole => {
              const row = myScores[hole]
              const approved = row ? approvedIds.has(row.id) : false
              return (
                <HoleCard
                  key={hole}
                  hole={hole}
                  scoreRow={row}
                  approved={approved}
                  isSaving={saving === hole}
                  onMinus={() => adjustMyScore(hole, -1)}
                  onPlus={() => adjustMyScore(hole, 1)}
                  player1={myTeam?.player1}
                  player2={myTeam?.player2}
                  onSetDrive={(pid) => setMyDrive(hole, pid)}
                />
              )
            })}
          </div>
        </>
      )}

      {/* APPROVE PARTNER */}
      {tab === 'approve' && partnerTeam && (
        <>
          <div className="glass" style={{ padding: '12px 16px', marginBottom: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4 }}>Playing With</div>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>{partnerTeam.name}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              {[partnerTeam.player1?.name, partnerTeam.player2?.name].filter(Boolean).join(' & ')}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {holes.map(hole => {
              const row      = partnerScores[hole]
              const hasScore = row?.score !== undefined
              const approved = row ? approvedIds.has(row.id) : false

              return (
                <HoleCard
                  key={hole}
                  hole={hole}
                  scoreRow={row}
                  approved={approved}
                  isSaving={false}
                  player1={partnerTeam.player1}
                  player2={partnerTeam.player2}
                  right={
                    !hasScore ? (
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Not entered</span>
                    ) : approved ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#4ade80', fontSize: 13 }}>
                        <CheckCircle size={14} /><span>Approved</span>
                      </div>
                    ) : (
                      <button
                        className="btn-outline"
                        onClick={() => approveScore(row, hole)}
                        disabled={approving === hole}
                        style={{ padding: '6px 16px', fontSize: 12 }}
                      >
                        {approving === hole ? '…' : 'Approve'}
                      </button>
                    )
                  }
                />
              )
            })}
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
        <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#FCB514', display: 'inline-block' }} />
        Scores sync in real-time to all connected devices
      </div>
    </div>
  )
}

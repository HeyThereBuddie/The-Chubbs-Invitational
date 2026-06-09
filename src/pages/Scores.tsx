import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Team, Player } from '../lib/types'
import { displayName } from '../lib/types'
import { Minus, Plus, Users } from 'lucide-react'

const HOLE_PARS = [5,4,3,5,4,3,4,5,4, 4,3,5,4,4,3,5,4,4]

const BASE = 'https://royalashburngolfclub.com/wp-content/uploads/2016/11'
const HOLE_DATA: { yards: number; si: number; description?: string; photo?: string }[] = [
  { yards: 520, si: 5,  photo: `${BASE}/ROY-Hole-1-1.png`,  description: 'A good starting hole. Play drive squarely down the middle avoiding fairway bunkers both left and right. Long hitters can carry the corner of the dogleg to challenge this green. To ensure a par or birdie try, play second shot to the corner of the dogleg allowing for a short iron to the green.' },
  { yards: 420, si: 11, photo: `${BASE}/ROY-Hole-2-1.png`, description: '"Par here" always brings a smile. A good drive favouring the right side will kick to the left because of the tilted fairway. Make sure you select the proper club to carry your ball onto the green as this green is slightly raised. Putting from below the hole is a must to give the best chance to make a putt.' },
  { yards: 170, si: 15, photo: `${BASE}/ROY-Hole-3-1.png`  },
  { yards: 510, si: 3,  photo: `${BASE}/ROY-Hole-4-1.png`  },
  { yards: 450, si: 1,  photo: `${BASE}/ROY-Hole-5-1.png`  },
  { yards: 185, si: 17, photo: `${BASE}/ROY-Hole-6-1.png`  },
  { yards: 410, si: 9,  photo: `${BASE}/ROY-Hole-7-1.png`  },
  { yards: 555, si: 7,  photo: `${BASE}/ROY-Hole-8-1.png`  },
  { yards: 460, si: 13, photo: `${BASE}/ROY-Hole-9-1.png`  },
  { yards: 445, si: 2,  photo: `${BASE}/ROY-Hole-10-1.png` },
  { yards: 195, si: 16, photo: `${BASE}/ROY-Hole-11-1.png` },
  { yards: 520, si: 8,  photo: `${BASE}/ROY-Hole-12-1.png` },
  { yards: 440, si: 4,  photo: `${BASE}/ROY-Hole-13-1.png` },
  { yards: 430, si: 10, photo: `${BASE}/ROY-Hole-14-1.png` },
  { yards: 165, si: 18, photo: `${BASE}/ROY-Hole-15-1.png` },
  { yards: 530, si: 6,  photo: `${BASE}/ROY-Hole-16-1.png` },
  { yards: 440, si: 12, photo: `${BASE}/ROY-Hole-17-1.png` },
  { yards: 465, si: 14, photo: `${BASE}/ROY-Hole-18-1.png` },
]

async function pingLeadCheck() {
  const { data: { session } } = await supabase.auth.getSession()
  supabase.functions.invoke('notify-lead-change', {
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
  }).catch(() => { /* fire and forget */ })
}

type TeamFull = Team & { player1?: Player; player2?: Player }
type ScoreRow = { id: string; hole: number; score: number; drive_used_id: string | null; putts: number | null }
type ChulliganRow = { id: string; player_id: string; half: 'front' | 'back'; hole: number }

const SCORE_SELECT = 'id, hole, score, drive_used_id, putts'

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
  const putts = entries.reduce((a, s) => a + (s.putts ?? 0), 0)
  return { gross, thru, toPar, putts, toParStr: toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}` }
}

export default function Scores() {
  const { profile, isAdmin } = useAuth()
  const myTeamId = profile?.team_id ?? undefined

  const [allTeams,         setAllTeams]         = useState<TeamFull[]>([])
  const [myTeam,           setMyTeam]           = useState<TeamFull | null>(null)
  const [myScores,         setMyScores]         = useState<Record<number, ScoreRow>>({})
  const [myChulligans,     setMyChulligans]     = useState<ChulliganRow[]>([])
  const [adminScores,      setAdminScores]      = useState<Record<number, ScoreRow>>({})
  const [adminChulligans,  setAdminChulligans]  = useState<ChulliganRow[]>([])
  const [viewingTeamId, setViewingTeamId] = useState<string | null>(null)
  const [viewTeam,    setViewTeam]    = useState<TeamFull | null>(null)
  const [viewScores,  setViewScores]  = useState<Record<number, ScoreRow>>({})

  const [adminTeamId, setAdminTeamId] = useState<string | null>(null)
  const [half,        setHalf]        = useState<'front' | 'back'>('front')
  const [saving,      setSaving]      = useState<number | null>(null)
  const [teamPick,    setTeamPick]    = useState('')
  const [settingTeam, setSettingTeam] = useState(false)
  const [expandedHoles, setExpandedHoles] = useState<Set<number>>(new Set())
  const toggleHoleInfo = (hole: number) => setExpandedHoles(prev => {
    const next = new Set(prev)
    next.has(hole) ? next.delete(hole) : next.add(hole)
    return next
  })

  const myTeamIdRef      = useRef<string | undefined>(undefined)
  const viewingTeamIdRef = useRef<string | null>(null)
  useEffect(() => { myTeamIdRef.current = myTeamId }, [myTeamId])
  useEffect(() => { viewingTeamIdRef.current = viewingTeamId }, [viewingTeamId])

  // ── Load ────────────────────────────────────────────────────

  useEffect(() => { loadAllTeams() }, [])
  useEffect(() => { if (myTeamId) loadPlayerData(myTeamId) }, [myTeamId])
  useEffect(() => { if (adminTeamId) loadAdminScores(adminTeamId) }, [adminTeamId])
  // Default view to own team on first load; switch to other teams for read-only browse
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (myTeamId && !viewingTeamId) setViewingTeamId(myTeamId) }, [myTeamId])
  useEffect(() => {
    if (!viewingTeamId || viewingTeamId === myTeamId) return
    loadViewTeam(viewingTeamId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingTeamId, myTeamId])

  useEffect(() => {
    const reload = () => {
      if (myTeamIdRef.current) loadPlayerData(myTeamIdRef.current)
      if (adminTeamId) loadAdminScores(adminTeamId)
      const vId = viewingTeamIdRef.current
      if (vId && vId !== myTeamIdRef.current) loadViewTeam(vId)
    }
    const sub = supabase.channel('scores-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' },     reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chulligans' }, reload)
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [adminTeamId])

  const loadAllTeams = async () => {
    const { data } = await supabase
      .from('teams')
      .select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
    if (data) {
      setAllTeams(data)
      if (isAdmin && data.length) {
        const initial = (myTeamId && data.find(t => t.id === myTeamId)) ? myTeamId : data[0].id
        setAdminTeamId(initial)
      }
    }
  }

  const loadPlayerData = async (teamId: string) => {
    const { data: t } = await supabase
      .from('teams')
      .select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)')
      .eq('id', teamId).single()
    if (t) setMyTeam(t)

    const [{ data: scores }, { data: ch }] = await Promise.all([
      supabase.from('scores').select(SCORE_SELECT).eq('team_id', teamId),
      supabase.from('chulligans').select('id, player_id, half, hole').eq('team_id', teamId),
    ])
    const map: Record<number, ScoreRow> = {}
    for (const s of scores ?? []) map[s.hole] = s
    setMyScores(map)
    setMyChulligans((ch ?? []) as ChulliganRow[])
  }

  const loadAdminScores = async (teamId: string) => {
    const [{ data: scores }, { data: ch }] = await Promise.all([
      supabase.from('scores').select(SCORE_SELECT).eq('team_id', teamId),
      supabase.from('chulligans').select('id, player_id, half, hole').eq('team_id', teamId),
    ])
    const map: Record<number, ScoreRow> = {}
    for (const s of scores ?? []) map[s.hole] = s
    setAdminScores(map)
    setAdminChulligans((ch ?? []) as ChulliganRow[])
  }

  const loadViewTeam = async (teamId: string) => {
    const [{ data: t }, { data: s }] = await Promise.all([
      supabase.from('teams').select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)').eq('id', teamId).single(),
      supabase.from('scores').select(SCORE_SELECT).eq('team_id', teamId),
    ])
    if (t) setViewTeam(t as unknown as TeamFull)
    const map: Record<number, ScoreRow> = {}
    for (const row of s ?? []) map[row.hole] = row
    setViewScores(map)
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
        .insert({ team_id: myTeamId, hole, score: next }).select('id, drive_used_id, putts').single()
      if (data) setMyScores(prev => ({ ...prev, [hole]: { id: data.id, hole, score: next, drive_used_id: data.drive_used_id, putts: data.putts } }))
    }
    setSaving(null)
    pingLeadCheck()
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
        .insert({ team_id: adminTeamId, hole, score: next }).select('id, drive_used_id, putts').single()
      if (data) setAdminScores(prev => ({ ...prev, [hole]: { id: data.id, hole, score: next, drive_used_id: data.drive_used_id, putts: data.putts } }))
    }
    setSaving(null)
    pingLeadCheck()
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

  const setMyPutts = async (hole: number, putts: number) => {
    const existing = myScores[hole]
    if (!existing?.id) return
    const newPutts = existing.putts === putts ? null : putts
    await supabase.from('scores').update({ putts: newPutts }).eq('id', existing.id)
    setMyScores(prev => ({ ...prev, [hole]: { ...prev[hole], putts: newPutts } }))
  }

  const setAdminPutts = async (hole: number, putts: number) => {
    const existing = adminScores[hole]
    if (!existing?.id) return
    const newPutts = existing.putts === putts ? null : putts
    await supabase.from('scores').update({ putts: newPutts }).eq('id', existing.id)
    setAdminScores(prev => ({ ...prev, [hole]: { ...prev[hole], putts: newPutts } }))
  }

  const resetMyScore = async (hole: number) => {
    const existing = myScores[hole]
    if (!existing?.id) return
    await supabase.from('scores').delete().eq('id', existing.id)
    setMyScores(prev => { const next = { ...prev }; delete next[hole]; return next })
  }

  const resetAdminScore = async (hole: number) => {
    const existing = adminScores[hole]
    if (!existing?.id) return
    await supabase.from('scores').delete().eq('id', existing.id)
    setAdminScores(prev => { const next = { ...prev }; delete next[hole]; return next })
  }

  const toggleChulligan = async (
    teamId: string,
    playerId: string,
    hole: number,
    chulligans: ChulliganRow[],
    setter: (c: ChulliganRow[]) => void,
  ) => {
    const half: 'front' | 'back' = hole <= 9 ? 'front' : 'back'
    const existing = chulligans.find(c => c.player_id === playerId && c.half === half)
    if (existing) {
      await supabase.from('chulligans').delete().eq('id', existing.id)
      if (existing.hole === hole) {
        // Same hole — toggle off
        setter(chulligans.filter(c => c.id !== existing.id))
      } else {
        // Different hole — move chulligan to new hole
        const { data } = await supabase.from('chulligans')
          .insert({ team_id: teamId, player_id: playerId, half, hole })
          .select('id, player_id, half, hole').single()
        if (data) setter([...chulligans.filter(c => c.id !== existing.id), data as ChulliganRow])
      }
    } else {
      const { data } = await supabase.from('chulligans')
        .insert({ team_id: teamId, player_id: playerId, half, hole })
        .select('id, player_id, half, hole').single()
      if (data) setter([...chulligans, data as ChulliganRow])
    }
  }

  const countDrives = (pid: string | null, from: number, to: number, scoreMap: Record<number, ScoreRow>) => {
    if (!pid) return 0
    let n = 0
    for (let h = from; h <= to; h++) {
      if (scoreMap[h]?.drive_used_id === pid) n++
    }
    return n
  }

  const claimTeam = async () => {
    if (!teamPick || !profile) return
    setSettingTeam(true)
    await supabase.from('profiles').update({ team_id: teamPick }).eq('id', profile.id)
    setSettingTeam(false)
    window.location.reload()
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

  // ── HoleCard ─────────────────────────────────────────────────

  const HoleCard = ({
    hole, scoreRow, isSaving, onMinus, onPlus, player1, player2, onSetDrive, driveDisabled, onSetPutts, onReset, chulligans, onToggleChulligan, readOnly, holeInfo, infoExpanded, onToggleInfo,
  }: {
    hole: number
    scoreRow: ScoreRow | undefined
    isSaving: boolean
    onMinus?: () => void
    onPlus?: () => void
    player1?: Player
    player2?: Player
    onSetDrive?: (playerId: string) => void
    driveDisabled?: Record<string, boolean>
    onSetPutts?: (putts: number) => void
    onReset?: () => void
    chulligans?: ChulliganRow[]
    onToggleChulligan?: (playerId: string, hole: number) => void
    readOnly?: boolean
    holeInfo?: { yards: number; si: number; description?: string; photo?: string }
    infoExpanded?: boolean
    onToggleInfo?: () => void
  }) => {
    const par      = HOLE_PARS[hole - 1]
    const score    = scoreRow?.score
    const hasScore = score !== undefined
    const cls      = hasScore ? scoreBubbleClass(score, par) : 'score-empty'
    const driveId  = scoreRow?.drive_used_id ?? null
    const putts    = scoreRow?.putts ?? null

    return (
      <div className="glass animate-fadeUp" style={{
        padding: '14px 20px', opacity: isSaving ? 0.7 : 1, transition: 'opacity 0.2s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 12, flexShrink: 0,
              background: 'rgba(252,181,20,0.12)', border: '2px solid rgba(252,181,20,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 24, fontWeight: 900, color: '#FCB514',
              letterSpacing: -0.5,
            }}>{hole}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#ffffff', lineHeight: 1 }}>Par {par}</span>
              {holeInfo && (
                <span style={{ fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.6)', lineHeight: 1 }}>{holeInfo.yards} yds</span>
              )}
              {(holeInfo?.description || holeInfo?.photo) && (
                <button onClick={onToggleInfo} style={{
                  marginTop: 3, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: infoExpanded ? '#FCB514' : 'rgba(255,255,255,0.3)',
                  fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, lineHeight: 1,
                }}>
                  <span>{infoExpanded ? '▲' : '▼'}</span> hole guide
                </button>
              )}
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {hasScore ? (
            <div className={`score-bubble ${cls}`} style={{ width: 56, height: 56, fontSize: 20 }}>
              {score}
            </div>
          ) : (
            <div style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 22, color: 'rgba(255,255,255,0.13)', fontWeight: 300, lineHeight: 1 }}>—</span>
            </div>
          )}

          {!readOnly && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                onClick={onMinus}
                disabled={isSaving || (hasScore && score <= 1)}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff', cursor: isSaving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><Minus size={14} /></button>
              <button
                onClick={onPlus}
                disabled={isSaving}
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(252,181,20,0.15)', border: '1px solid rgba(252,181,20,0.3)',
                  color: '#FCB514', cursor: isSaving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              ><Plus size={14} /></button>
              {hasScore && onReset && (
                <button
                  onClick={onReset}
                  disabled={isSaving}
                  title="Clear score"
                  style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.25)', cursor: isSaving ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, lineHeight: 1,
                  }}
                >×</button>
              )}
            </div>
          )}
        </div>

        {/* Read-only drive/putts summary */}
        {readOnly && hasScore && (scoreRow?.drive_used_id || scoreRow?.putts != null) && (
          <div style={{ marginTop: 8, display: 'flex', gap: 14 }}>
            {scoreRow?.drive_used_id && (player1 || player2) && (() => {
              const driver = [player1, player2].find(p => p?.id === scoreRow.drive_used_id)
              return driver ? (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Drive: {displayName(driver)}</span>
              ) : null
            })()}
            {scoreRow?.putts != null && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Putts: {scoreRow.putts}</span>
            )}
          </div>
        )}

        {/* Drive selector — shown whenever a score exists and editable */}
        {!readOnly && hasScore && player1 && player2 && onSetDrive && (
          <div style={{
            marginTop: 10, paddingTop: 10,
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>Drive:</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[player1, player2].map(p => {
                const active   = driveId === p.id
                const disabled = driveDisabled?.[p.id] ?? false
                return (
                  <button key={p.id} onClick={() => !disabled && onSetDrive(p.id)}
                    disabled={disabled}
                    title={disabled ? 'Max 5 drives per half reached' : undefined}
                    style={{
                      padding: '4px 12px', borderRadius: 999,
                      fontSize: 12, fontWeight: 600, border: '1px solid',
                      background: active ? 'rgba(252,181,20,0.18)' : 'rgba(255,255,255,0.05)',
                      borderColor: active ? '#FCB514' : 'rgba(255,255,255,0.08)',
                      color: active ? '#FCB514' : 'rgba(255,255,255,0.45)',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.3 : 1,
                      transition: 'all 0.15s',
                    }}>
                    {displayName(p)}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Putts selector — shown whenever a score exists and editable */}
        {!readOnly && hasScore && onSetPutts && (
          <div style={{
            marginTop: 10, paddingTop: 10,
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>Putts:</span>
            <div style={{ display: 'flex', gap: 5 }}>
              {[0, 1, 2, 3, 4, 5].map(n => {
                const active = putts === n
                return (
                  <button key={n} onClick={() => onSetPutts(n)} style={{
                    width: 32, height: 28, borderRadius: 6,
                    fontSize: 13, fontWeight: 700, border: '1px solid',
                    background: active ? 'rgba(252,181,20,0.18)' : 'rgba(255,255,255,0.05)',
                    borderColor: active ? '#FCB514' : 'rgba(255,255,255,0.08)',
                    color: active ? '#FCB514' : 'rgba(255,255,255,0.45)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                    {n}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Chulligan buttons — one per player, only when editable and score exists */}
        {!readOnly && hasScore && player1 && player2 && onToggleChulligan && chulligans !== undefined && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>🍺</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {[player1, player2].map(p => {
                const thisHalf: 'front' | 'back' = hole <= 9 ? 'front' : 'back'
                const myC = chulligans.find(c => c.player_id === p.id && c.half === thisHalf)
                const usedHere      = myC?.hole === hole
                const usedElsewhere = myC && !usedHere
                return (
                  <button key={p.id}
                    onClick={() => !usedElsewhere && onToggleChulligan(p.id, hole)}
                    title={usedElsewhere ? `${displayName(p)} already used chulligan on H${myC!.hole}` : undefined}
                    style={{
                      padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                      background: usedHere ? 'rgba(252,181,20,0.18)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${usedHere ? 'rgba(252,181,20,0.5)' : 'rgba(255,255,255,0.08)'}`,
                      color: usedHere ? '#FCB514' : usedElsewhere ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.45)',
                      cursor: usedElsewhere ? 'not-allowed' : 'pointer',
                      textDecoration: usedElsewhere ? 'line-through' : 'none',
                    }}>
                    {usedHere ? '✅' : '🍺'} {displayName(p)}{usedElsewhere ? ` H${myC!.hole}` : ''}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Hole guide dropdown */}
        {holeInfo && infoExpanded && (holeInfo.photo || holeInfo.description) && (
          <div style={{ marginTop: 10, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
            {holeInfo.photo && (
              <img
                src={holeInfo.photo}
                alt={`Hole ${hole} diagram`}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            )}
            {holeInfo.description && (
              <div style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
                {holeInfo.description}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── DriveCounter ─────────────────────────────────────────────

  const DriveCounter = ({ scoreMap, p1, p2 }: {
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
                  {[{ name: displayName(p1), count: p1c }, { name: displayName(p2), count: p2c }].map(({ name, count }) => {
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

  // ── ChulliganDashboard ───────────────────────────────────────

  const ChulliganDashboard = ({ p1, p2, chulligans }: {
    p1: Player | undefined
    p2: Player | undefined
    chulligans: ChulliganRow[]
  }) => {
    if (!p1 || !p2) return null
    const rows = [p1, p2]
    const halves: Array<{ label: string; key: 'front' | 'back' }> = [
      { label: 'Front 9', key: 'front' },
      { label: 'Back 9',  key: 'back'  },
    ]
    return (
      <div className="glass" style={{ padding: '12px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          🍺 Chulligans — 1 per player per nine (must chug)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr', gap: 6, alignItems: 'center' }}>
          {/* Header row */}
          <div />
          {halves.map(h => (
            <div key={h.key} style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {h.label}
            </div>
          ))}
          {/* Player rows */}
          {rows.map(p => (
            <>
              <div key={p.id + '-name'} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName(p)}
              </div>
              {halves.map(h => {
                const c = chulligans.find(c => c.player_id === p.id && c.half === h.key)
                return (
                  <div key={p.id + h.key} style={{
                    textAlign: 'center', padding: '5px 4px', borderRadius: 7,
                    background: c ? 'rgba(252,181,20,0.1)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${c ? 'rgba(252,181,20,0.3)' : 'rgba(255,255,255,0.07)'}`,
                  }}>
                    {c ? (
                      <>
                        <div style={{ fontSize: 14 }}>✅</div>
                        <div style={{ fontSize: 9, color: '#FCB514', marginTop: 2 }}>H{c.hole}</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: 14 }}>🍺</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>Available</div>
                      </>
                    )}
                  </div>
                )
              })}
            </>
          ))}
        </div>
      </div>
    )
  }

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
                {t.name}{(t.player1 || t.player2) ? ` — ${[t.player1 && displayName(t.player1), t.player2 && displayName(t.player2)].filter(Boolean).join(' & ')}` : ''}
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
    const adminTabTeams = myTeamId
      ? [...allTeams].sort((a, b) => (a.id === myTeamId ? -1 : b.id === myTeamId ? 1 : 0))
      : allTeams

    return (
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        {pageHeader}

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 16 }}>
          {adminTabTeams.map(t => (
            <button key={t.id} onClick={() => { setAdminTeamId(t.id); setAdminScores({}) }}
              className={`pill-tab ${adminTeamId === t.id ? 'active' : ''}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span>{t.name}{t.id === myTeamId ? ' ⭐' : ''}</span>
              {(t.player1 || t.player2) && (
                <span style={{ fontSize: 9, opacity: 0.55, whiteSpace: 'nowrap' }}>
                  {[t.player1 && displayName(t.player1), t.player2 && displayName(t.player2)].filter(Boolean).join(' & ')}
                </span>
              )}
            </button>
          ))}
        </div>

        {adminTeam && stats && (
          <div className="glass animate-fadeUp" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#FCB514' }}>{adminTeam.name}</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                {[adminTeam.player1 && displayName(adminTeam.player1), adminTeam.player2 && displayName(adminTeam.player2)].filter(Boolean).join(' & ')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: stats.toPar <= 0 ? '#FCB514' : '#fff' }}>{stats.toParStr}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>To Par</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{stats.gross || '—'}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Gross</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{stats.thru}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Thru</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{stats.putts || '—'}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Putts</div></div>
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

        <DriveCounter scoreMap={adminScores} p1={adminTeam?.player1} p2={adminTeam?.player2} />
        <ChulliganDashboard p1={adminTeam?.player1} p2={adminTeam?.player2} chulligans={adminChulligans} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(() => {
            const hFrom = half === 'front' ? 1 : 10
            const hTo   = half === 'front' ? 9 : 18
            const ap1   = adminTeam?.player1
            const ap2   = adminTeam?.player2
            const p1n   = countDrives(ap1?.id ?? null, hFrom, hTo, adminScores)
            const p2n   = countDrives(ap2?.id ?? null, hFrom, hTo, adminScores)
            return holes.map(hole => {
              const driveId = adminScores[hole]?.drive_used_id ?? null
              const driveDisabled: Record<string, boolean> = {
                ...(ap1 ? { [ap1.id]: p1n >= 5 && driveId !== ap1.id } : {}),
                ...(ap2 ? { [ap2.id]: p2n >= 5 && driveId !== ap2.id } : {}),
              }
              return (
                <HoleCard
                  key={hole}
                  hole={hole}
                  scoreRow={adminScores[hole]}
                  isSaving={saving === hole}
                  onMinus={() => adjustAdminScore(hole, -1)}
                  onPlus={() => adjustAdminScore(hole, 1)}
                  player1={ap1}
                  player2={ap2}
                  onSetDrive={(pid) => setAdminDrive(hole, pid)}
                  driveDisabled={driveDisabled}
                  onSetPutts={(n) => setAdminPutts(hole, n)}
                  onReset={() => resetAdminScore(hole)}
                  chulligans={adminChulligans}
                  onToggleChulligan={(pid, h) => toggleChulligan(adminTeamId!, pid, h, adminChulligans, setAdminChulligans)}
                  holeInfo={HOLE_DATA[hole - 1]}
                  infoExpanded={expandedHoles.has(hole)}
                  onToggleInfo={() => toggleHoleInfo(hole)}
                />
              )
            })
          })()}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
          <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#FCB514', display: 'inline-block' }} />
          Scores sync in real-time to all connected devices
        </div>
      </div>
    )
  }

  // ── Player view ───────────────────────────────────────────────

  const isViewingMyTeam = viewingTeamId === myTeamId
  const displayTeam   = isViewingMyTeam ? myTeam   : viewTeam
  const displayScores = isViewingMyTeam ? myScores : viewScores
  const displayStats  = calcStats(displayScores)

  // Own team always pinned to the left
  const tabTeams = myTeamId
    ? [...allTeams].sort((a, b) => (a.id === myTeamId ? -1 : b.id === myTeamId ? 1 : 0))
    : allTeams

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {pageHeader}

      {/* Team tabs — browse all scorecards; own team is editable, others are read-only */}
      {allTeams.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 16 }}>
          {tabTeams.map(t => (
            <button key={t.id} onClick={() => setViewingTeamId(t.id)}
              className={`pill-tab ${viewingTeamId === t.id ? 'active' : ''}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
              <span>{t.name}{t.id === myTeamId ? ' ⭐' : ''}</span>
              {(t.player1 || t.player2) && (
                <span style={{ fontSize: 9, opacity: 0.55, whiteSpace: 'nowrap' }}>
                  {[t.player1 && displayName(t.player1), t.player2 && displayName(t.player2)].filter(Boolean).join(' & ')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Team header */}
      {displayTeam && (
        <div className="glass animate-fadeUp" style={{ padding: '16px 20px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 4 }}>
              {isViewingMyTeam ? 'Your Team' : 'Viewing'}
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#FCB514' }}>{displayTeam.name}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
              {[displayTeam.player1 && displayName(displayTeam.player1), displayTeam.player2 && displayName(displayTeam.player2)].filter(Boolean).join(' & ')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: displayStats.toPar <= 0 ? '#FCB514' : '#fff' }}>{displayStats.toParStr}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>To Par</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{displayStats.gross || '—'}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Gross</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{displayStats.thru}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Thru</div></div>
            <div><div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{displayStats.putts || '—'}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Putts</div></div>
          </div>
        </div>
      )}

      {!isViewingMyTeam && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <span style={{ fontSize: 13 }}>👁</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Read-only — you can only edit your own scorecard</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['front', 'back'] as const).map(h => (
          <button key={h} onClick={() => setHalf(h)} className={`pill-tab ${half === h ? 'active' : ''}`}>
            {h === 'front' ? 'Front 9 (1–9)' : 'Back 9 (10–18)'}
          </button>
        ))}
      </div>

      {/* Drive counter + chulligans only for own team */}
      {isViewingMyTeam && <DriveCounter scoreMap={myScores} p1={myTeam?.player1} p2={myTeam?.player2} />}
      {isViewingMyTeam && <ChulliganDashboard p1={myTeam?.player1} p2={myTeam?.player2} chulligans={myChulligans} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(() => {
          if (isViewingMyTeam) {
            const hFrom = half === 'front' ? 1 : 10
            const hTo   = half === 'front' ? 9 : 18
            const mp1   = myTeam?.player1
            const mp2   = myTeam?.player2
            const p1n   = countDrives(mp1?.id ?? null, hFrom, hTo, myScores)
            const p2n   = countDrives(mp2?.id ?? null, hFrom, hTo, myScores)
            return holes.map(hole => {
              const driveId = myScores[hole]?.drive_used_id ?? null
              const driveDisabled: Record<string, boolean> = {
                ...(mp1 ? { [mp1.id]: p1n >= 5 && driveId !== mp1.id } : {}),
                ...(mp2 ? { [mp2.id]: p2n >= 5 && driveId !== mp2.id } : {}),
              }
              return (
                <HoleCard
                  key={hole}
                  hole={hole}
                  scoreRow={myScores[hole]}
                  isSaving={saving === hole}
                  onMinus={() => adjustMyScore(hole, -1)}
                  onPlus={() => adjustMyScore(hole, 1)}
                  player1={mp1}
                  player2={mp2}
                  onSetDrive={(pid) => setMyDrive(hole, pid)}
                  driveDisabled={driveDisabled}
                  onSetPutts={(n) => setMyPutts(hole, n)}
                  onReset={() => resetMyScore(hole)}
                  chulligans={myChulligans}
                  onToggleChulligan={(pid, h) => toggleChulligan(myTeamId!, pid, h, myChulligans, setMyChulligans)}
                  holeInfo={HOLE_DATA[hole - 1]}
                  infoExpanded={expandedHoles.has(hole)}
                  onToggleInfo={() => toggleHoleInfo(hole)}
                />
              )
            })
          }
          // Read-only view for another team
          return holes.map(hole => (
            <HoleCard
              key={hole}
              hole={hole}
              scoreRow={viewScores[hole]}
              isSaving={false}
              player1={viewTeam?.player1}
              player2={viewTeam?.player2}
              readOnly
              holeInfo={HOLE_DATA[hole - 1]}
            />
          ))
        })()}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
        <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#FCB514', display: 'inline-block' }} />
        Scores sync in real-time to all connected devices
      </div>
    </div>
  )
}

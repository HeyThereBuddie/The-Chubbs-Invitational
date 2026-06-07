import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Team, Player } from '../lib/types'
import { Minus, Plus, Users } from 'lucide-react'

const HOLE_PARS = [4,4,3,5,4,3,4,5,4, 4,3,5,4,4,3,5,4,4]

type TeamFull = Team & { player1?: Player; player2?: Player }
type ScoreRow = { id: string; hole: number; score: number; drive_used_id: string | null; putts: number | null }

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

  const [allTeams,    setAllTeams]    = useState<TeamFull[]>([])
  const [myTeam,      setMyTeam]      = useState<TeamFull | null>(null)
  const [myScores,    setMyScores]    = useState<Record<number, ScoreRow>>({})
  const [adminScores, setAdminScores] = useState<Record<number, ScoreRow>>({})

  const [adminTeamId, setAdminTeamId] = useState<string | null>(null)
  const [half,        setHalf]        = useState<'front' | 'back'>('front')
  const [saving,      setSaving]      = useState<number | null>(null)
  const [teamPick,    setTeamPick]    = useState('')
  const [settingTeam, setSettingTeam] = useState(false)

  const myTeamIdRef = useRef<string | undefined>(undefined)
  useEffect(() => { myTeamIdRef.current = myTeamId }, [myTeamId])

  // ── Load ────────────────────────────────────────────────────

  useEffect(() => { loadAllTeams() }, [])
  useEffect(() => { if (myTeamId) loadPlayerData(myTeamId) }, [myTeamId])
  useEffect(() => { if (adminTeamId) loadAdminScores(adminTeamId) }, [adminTeamId])

  useEffect(() => {
    const sub = supabase.channel('scores-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' }, () => {
        if (myTeamIdRef.current) loadPlayerData(myTeamIdRef.current)
        if (adminTeamId) loadAdminScores(adminTeamId)
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [adminTeamId])

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

    const { data } = await supabase.from('scores').select(SCORE_SELECT).eq('team_id', teamId)
    const map: Record<number, ScoreRow> = {}
    for (const s of data ?? []) map[s.hole] = s
    setMyScores(map)
  }

  const loadAdminScores = async (teamId: string) => {
    const { data } = await supabase.from('scores').select(SCORE_SELECT).eq('team_id', teamId)
    const map: Record<number, ScoreRow> = {}
    for (const s of data ?? []) map[s.hole] = s
    setAdminScores(map)
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
    hole, scoreRow, isSaving, onMinus, onPlus, player1, player2, onSetDrive, driveDisabled, onSetPutts,
  }: {
    hole: number
    scoreRow: ScoreRow | undefined
    isSaving: boolean
    onMinus: () => void
    onPlus: () => void
    player1?: Player
    player2?: Player
    onSetDrive?: (playerId: string) => void
    driveDisabled?: Record<string, boolean>
    onSetPutts?: (putts: number) => void
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 36, textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{hole}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Par {par}</div>
          </div>

          <div style={{ flex: 1 }} />

          <div className={`score-bubble ${cls}`} style={{ width: 56, height: 56, fontSize: 20 }}>
            {hasScore ? score : '—'}
          </div>

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
          </div>
        </div>

        {/* Drive selector — shown whenever a score exists */}
        {hasScore && player1 && player2 && onSetDrive && (
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
                    {p.name.split(' ')[0]}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Putts selector — shown whenever a score exists */}
        {hasScore && onSetPutts && (
          <div style={{
            marginTop: 10, paddingTop: 10,
            borderTop: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>Putts:</span>
            <div style={{ display: 'flex', gap: 5 }}>
              {[1, 2, 3, 4, 5].map(n => {
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

  const myStats = calcStats(myScores)

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {pageHeader}

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
            <div><div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{myStats.putts || '—'}</div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Putts</div></div>
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

      <DriveCounter scoreMap={myScores} p1={myTeam?.player1} p2={myTeam?.player2} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(() => {
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

import { useEffect, useState, useRef, memo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useYear } from '../context/YearContext'
import { localDb, parseJson } from '../lib/localDb'
import { displayName, HOLE_PARS } from '../lib/types'
import type { Team, Player } from '../lib/types'
import { Pencil, Check, X } from 'lucide-react'

type ScoreRow     = { hole: number; score: number; putts: number | null; drive_used_id: string | null }
type ChulliganRow = { id: string; player_id: string; hole: number }
type TeamFull     = Team & { player1?: Player; player2?: Player }

// ── Stats helpers ─────────────────────────────────────────
function calcStats(scores: ScoreRow[]) {
  const played = scores.filter(s => s.score > 0)
  const gross = played.reduce((a, s) => a + s.score, 0)
  const parSoFar = played.reduce((a, s) => a + HOLE_PARS[s.hole - 1], 0)
  const toPar = gross - parSoFar
  const putts = played.reduce((a, s) => a + (s.putts ?? 0), 0)

  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0
  for (const s of played) {
    const diff = s.score - HOLE_PARS[s.hole - 1]
    if (diff <= -2) eagles++
    else if (diff === -1) birdies++
    else if (diff === 0) pars++
    else if (diff === 1) bogeys++
    else doubles++
  }

  return { gross, toPar, putts, played: played.length, eagles, birdies, pars, bogeys, doubles }
}

function toParStr(n: number)   { return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}` }
function toParColor(n: number) { return n < 0 ? '#22c55e' : n > 0 ? '#ef4444' : '#FCB514' }

function scoreColor(score: number, par: number) {
  const d = score - par
  if (d <= -2) return '#FCB514'
  if (d === -1) return '#22c55e'
  if (d === 0)  return 'var(--tx2)'
  if (d === 1)  return '#f59e0b'
  return '#ef4444'
}

// ── Component ─────────────────────────────────────────────
export default function MyTeamPage() {
  const { profile } = useAuth()
  const { effectiveTournamentId, isCurrentYear } = useYear()
  const myTeamId = isCurrentYear ? (profile?.team_id ?? null) : null

  const [allTeams,      setAllTeams]      = useState<TeamFull[]>([])
  const [viewingTeamId, setViewingTeamId] = useState<string | null>(null)
  const [team,          setTeam]          = useState<TeamFull | null>(null)
  const [scores,        setScores]        = useState<ScoreRow[]>([])
  const [chulligans,    setChulligans]    = useState<ChulliganRow[]>([])
  const [loading,       setLoading]       = useState(true)
  const [editingName,   setEditingName]   = useState(false)
  const [nameInput,     setNameInput]     = useState('')
  const [saving,        setSaving]        = useState(false)

  const viewingTeamIdRef = useRef<string | null>(null)
  useEffect(() => { viewingTeamIdRef.current = viewingTeamId }, [viewingTeamId])

  const nameInputRef = useRef<HTMLInputElement>(null)

  // Load all teams for the tab bar
  useEffect(() => {
    if (!effectiveTournamentId) { setAllTeams([]); setLoading(false); return }
    supabase.from('teams')
      .select('*, player1:profiles!teams_p1_id_fkey(id, name, nickname), player2:profiles!teams_p2_id_fkey(id, name, nickname)')
      .eq('tournament_id', effectiveTournamentId)
      .then(async ({ data }) => {
        const teams: TeamFull[] = data
          ? (data as unknown as TeamFull[])
          : (await localDb.teams.where('tournament_id').equals(effectiveTournamentId).toArray()).map(t => ({
              ...t,
              player1: parseJson(t.player1_json) as Player | undefined,
              player2: parseJson(t.player2_json) as Player | undefined,
            })) as unknown as TeamFull[]
        setAllTeams(teams)
        const defaultId = myTeamId ?? (teams[0]?.id ?? null)
        setViewingTeamId(defaultId)
        if (!defaultId) setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTournamentId])

  // Load full data whenever selected team changes
  useEffect(() => {
    if (!viewingTeamId) return
    setLoading(true)
    Promise.all([
      supabase
        .from('teams')
        .select(`id, name,
          player1:profiles!teams_p1_id_fkey(id, name, nickname, email, role, status, handicap, joined_at, team_id, notes, phone, avatar_url),
          player2:profiles!teams_p2_id_fkey(id, name, nickname, email, role, status, handicap, joined_at, team_id, notes, phone, avatar_url)`)
        .eq('id', viewingTeamId)
        .single(),
      supabase.from('scores').select('hole, score, putts, drive_used_id').eq('team_id', viewingTeamId),
      supabase.from('chulligans').select('id, player_id, hole').eq('team_id', viewingTeamId),
    ]).then(async ([{ data: t }, { data: s }, { data: ch }]) => {
      if (t) {
        setTeam(t as unknown as TeamFull)
        setScores((s ?? []) as ScoreRow[])
        setChulligans((ch ?? []) as ChulliganRow[])
      } else {
        // Supabase unavailable — fall back to local cache
        const [localTeam, localScores, localCh] = await Promise.all([
          localDb.teams.get(viewingTeamId),
          localDb.scores.where('team_id').equals(viewingTeamId).toArray(),
          localDb.chulligans.where('team_id').equals(viewingTeamId).toArray(),
        ])
        if (localTeam) {
          setTeam({
            ...localTeam,
            player1: parseJson(localTeam.player1_json) as Player | undefined,
            player2: parseJson(localTeam.player2_json) as Player | undefined,
          } as unknown as TeamFull)
        }
        setScores((localScores ?? []) as ScoreRow[])
        setChulligans((localCh ?? []) as ChulliganRow[])
      }
      setLoading(false)
    })
  }, [viewingTeamId])

  // Real-time: reload current team's data on any change
  useEffect(() => {
    const reload = async () => {
      const tid = viewingTeamIdRef.current
      if (!tid) return
      const [{ data: s }, { data: ch }] = await Promise.all([
        supabase.from('scores').select('hole, score, putts, drive_used_id').eq('team_id', tid),
        supabase.from('chulligans').select('id, player_id, hole').eq('team_id', tid),
      ])
      if (s)  setScores(s as ScoreRow[])
      if (ch) setChulligans(ch as ChulliganRow[])
    }
    const sub = supabase.channel('myteam-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores' },     reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chulligans' }, reload)
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [])

  async function saveName() {
    if (!team) return
    const trimmed = nameInput.trim()
    if (!trimmed || trimmed === team.name) { setEditingName(false); return }
    setSaving(true)
    const { error } = await supabase.from('teams').update({ name: trimmed }).eq('id', team.id)
    if (!error) {
      const updated = { ...team, name: trimmed }
      setTeam(updated)
      setAllTeams(prev => prev.map(t => t.id === team.id ? { ...t, name: trimmed } : t))
    }
    setSaving(false)
    setEditingName(false)
  }

  // ── No team, no teams in DB ───────────────────────────────
  if (!loading && allTeams.length === 0) return (
    <div className="glass animate-fadeUp" style={{ padding: '40px', textAlign: 'center', maxWidth: 480, margin: '40px auto' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>⛳</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--tx1)', marginBottom: 8 }}>No teams yet</div>
      <div style={{ color: 'var(--tx3)', fontSize: 14 }}>Teams will appear here once the tournament is set up.</div>
    </div>
  )

  // Tab order: own team first, then alphabetical
  const tabTeams = myTeamId
    ? [...allTeams].sort((a, b) => (a.id === myTeamId ? -1 : b.id === myTeamId ? 1 : 0))
    : allTeams

  const isOwnTeam = viewingTeamId === myTeamId && myTeamId !== null && isCurrentYear

  // ── Stats ─────────────────────────────────────────────────
  const stats      = calcStats(scores)
  const players    = [team?.player1, team?.player2].filter(Boolean) as Player[]
  const frontStats = calcStats(scores.filter(s => s.hole <= 9))
  const backStats  = calcStats(scores.filter(s => s.hole >= 10))

  const driveCount = (pid: string, from = 1, to = 18) =>
    scores.filter(s => s.hole >= from && s.hole <= to && s.drive_used_id === pid).length

  const scoreMap: Record<number, ScoreRow> = {}
  for (const s of scores) scoreMap[s.hole] = s

  const scorecardHalves = [
    { label: 'FRONT', tag: 'OUT', holes: Array.from({ length: 9 }, (_, i) => i + 1) },
    { label: 'BACK',  tag: 'IN',  holes: Array.from({ length: 9 }, (_, i) => i + 10) },
  ]

  const breakdown = [
    { label: '🦅 Eagle',  count: stats.eagles,  color: '#FCB514' },
    { label: '🐦 Birdie', count: stats.birdies,  color: '#22c55e' },
    { label: 'Par',        count: stats.pars,     color: 'var(--tx2)' },
    { label: 'Bogey',      count: stats.bogeys,   color: '#f59e0b' },
    { label: 'Double+',    count: stats.doubles,  color: '#ef4444' },
  ]
  const maxBreakdown = Math.max(...breakdown.map(b => b.count), 1)

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* ── Team selector tabs ── */}
      {allTeams.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 20 }}>
          {tabTeams.map(t => (
            <button
              key={t.id}
              onClick={() => { setViewingTeamId(t.id); setEditingName(false) }}
              className={`pill-tab ${viewingTeamId === t.id ? 'active' : ''}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
            >
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

      {/* ── Loading ── */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
          <div className="animate-spin" style={{ width: 36, height: 36, border: '3px solid rgba(252,181,20,0.2)', borderTopColor: '#FCB514', borderRadius: '50%' }} />
        </div>
      ) : !team ? null : (
        <>
          {/* ── Read-only banner ── */}
          {!isOwnTeam && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 14px', borderRadius: 10, background: 'var(--surf)', border: '1px solid var(--bdr)' }}>
              <span style={{ fontSize: 13 }}>👁</span>
              <span style={{ fontSize: 12, color: 'var(--tx3)' }}>Read-only — you can only edit your own team</span>
            </div>
          )}

          {/* ── Team header ── */}
          <div style={{ marginBottom: 28 }}>
            {isOwnTeam && editingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                  maxLength={50}
                  autoFocus
                  style={{
                    fontFamily: 'Bebas Neue', fontSize: 28, letterSpacing: 3, color: '#FCB514',
                    background: 'rgba(252,181,20,0.07)', border: '1px solid rgba(252,181,20,0.4)',
                    borderRadius: 8, padding: '4px 12px', outline: 'none', minWidth: 0, flex: 1,
                  }}
                />
                <button onClick={saveName} disabled={saving} title="Save" style={{ background: 'rgba(252,181,20,0.15)', border: '1px solid rgba(252,181,20,0.3)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#FCB514', display: 'flex', alignItems: 'center' }}>
                  <Check size={16} />
                </button>
                <button onClick={() => setEditingName(false)} title="Cancel" style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: 'var(--tx3)', display: 'flex', alignItems: 'center' }}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--tx4)', textTransform: 'uppercase', marginRight: 4 }}>
                  {isOwnTeam ? 'Your Team' : 'Viewing'}
                </div>
                <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 32, color: '#FCB514', letterSpacing: 4, margin: 0 }}>
                  {team.name}
                </h1>
                {isOwnTeam && (
                  <button
                    onClick={() => { setNameInput(team.name); setEditingName(true) }}
                    title="Rename team"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(252,181,20,0.35)', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            )}
            <p style={{ color: 'var(--tx3)', fontSize: 13, margin: 0 }}>
              {players.map(p => displayName(p)).join(' & ')}
            </p>
          </div>

          {/* ── Player cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: players.length > 1 ? '1fr 1fr' : '1fr', gap: 14, marginBottom: 20 }}>
            {players.map(p => (
              <div key={p.id} className="glass animate-fadeUp" style={{ padding: '22px 20px' }}>
                <div style={{ marginBottom: 12 }}>
                  <AvatarCircle player={p} size={80} />
                </div>
                <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--tx1)', marginBottom: p.nickname ? 2 : 6 }}>
                  {displayName(p)}
                </div>
                {p.nickname && (
                  <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 6 }}>{p.name}</div>
                )}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <StatChip label="All Drives" value={driveCount(p.id)} />
                  {p.handicap != null && <StatChip label="HCP" value={p.handicap} />}
                </div>
              </div>
            ))}
          </div>

          {/* ── Content: round has started ── */}
          {stats.played > 0 ? (
            <>
              {/* Round Summary */}
              <div className="glass animate-fadeUp" style={{ padding: '22px 26px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 18 }}>
                  Round Summary
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12, marginBottom: 20 }}>
                  <BigStat label="Score"    value={`${stats.gross}`}            sub={`${toParStr(stats.toPar)} to par`} color={toParColor(stats.toPar)} />
                  <BigStat label="Thru"     value={`${stats.played}`}           sub="of 18 holes" />
                  <BigStat label="Putts"    value={`${stats.putts}`}            sub="total" />
                  {stats.birdies + stats.eagles > 0 && (
                    <BigStat label="Under Par" value={`${stats.birdies + stats.eagles}`} sub="holes" color="#22c55e" />
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: '1px solid var(--bdr)', paddingTop: 16 }}>
                  {[
                    { label: 'Front 9', st: frontStats },
                    { label: 'Back 9',  st: backStats  },
                  ].map(({ label, st }) => (
                    <div key={label} style={{ textAlign: 'center', padding: '10px 8px', borderRadius: 10, background: 'var(--surf)' }}>
                      <div style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                      {st.played > 0 ? (
                        <>
                          <div style={{ fontSize: 22, fontWeight: 900, color: toParColor(st.toPar), fontFamily: 'Bebas Neue', letterSpacing: 2, lineHeight: 1 }}>
                            {st.gross}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 3 }}>
                            {toParStr(st.toPar)} · {st.played} holes
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: 14, color: 'var(--tx4)', marginTop: 4 }}>—</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Scorecard */}
              <div className="glass animate-fadeUp" style={{ padding: '20px 22px', marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 14 }}>
                  Scorecard
                </div>
                {scorecardHalves.map(({ label, tag, holes }) => {
                  const holePars  = holes.map(h => HOLE_PARS[h - 1])
                  const totalPar  = holePars.reduce((a, p) => a + p, 0)
                  const played    = holes.filter(h => scoreMap[h])
                  const subtotal  = played.reduce((a, h) => a + scoreMap[h].score, 0)
                  const playedPar = played.reduce((a, h) => a + HOLE_PARS[h - 1], 0)
                  const toPar     = subtotal - playedPar
                  return (
                    <div key={label} style={{ marginBottom: 16 }}>
                      <div style={{ overflowX: 'auto' }}>
                        <div style={{ minWidth: 340 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(9, 1fr) 52px`, gap: 2, marginBottom: 3 }}>
                            <div style={{ fontSize: 9, color: 'var(--tx3)', fontWeight: 700, padding: '2px 4px', letterSpacing: 1 }}>{label}</div>
                            {holes.map(h => (
                              <div key={h} style={{ fontSize: 10, color: 'var(--tx3)', textAlign: 'center', padding: '2px 0' }}>{h}</div>
                            ))}
                            <div style={{ fontSize: 9, color: 'var(--tx4)', textAlign: 'center', fontWeight: 700, padding: '2px 0' }}>{tag}</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(9, 1fr) 52px`, gap: 2, marginBottom: 3 }}>
                            <div style={{ fontSize: 9, color: 'var(--tx4)', padding: '2px 4px' }}>PAR</div>
                            {holePars.map((par, i) => (
                              <div key={i} style={{ fontSize: 10, color: 'var(--tx4)', textAlign: 'center', padding: '2px 0' }}>{par}</div>
                            ))}
                            <div style={{ fontSize: 10, color: 'var(--tx4)', textAlign: 'center', fontWeight: 700, padding: '2px 0' }}>{totalPar}</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(9, 1fr) 52px`, gap: 2, marginBottom: 3 }}>
                            <div style={{ fontSize: 9, color: 'var(--tx4)', padding: '2px 4px' }}>SCORE</div>
                            {holes.map((h, i) => {
                              const s = scoreMap[h]?.score ?? null
                              if (s === null) return (
                                <div key={h} style={{ fontSize: 10, color: 'var(--tx5)', textAlign: 'center', padding: '3px 0' }}>—</div>
                              )
                              return (
                                <div key={h} style={{ fontSize: 11, fontWeight: 700, color: scoreColor(s, holePars[i]), textAlign: 'center', padding: '3px 0' }}>{s}</div>
                              )
                            })}
                            <div style={{ fontSize: 11, fontWeight: 700, textAlign: 'center', padding: '3px 0', color: played.length > 0 ? toParColor(toPar) : 'var(--tx4)' }}>
                              {played.length > 0 ? `${subtotal}` : '—'}
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(9, 1fr) 52px`, gap: 2, marginBottom: 3 }}>
                            <div style={{ fontSize: 9, color: 'var(--tx4)', padding: '2px 4px' }}>PUTTS</div>
                            {holes.map(h => {
                              const p = scoreMap[h]?.putts ?? null
                              return (
                                <div key={h} style={{ fontSize: 10, color: 'var(--tx4)', textAlign: 'center', padding: '3px 0' }}>
                                  {p !== null ? p : <span style={{ color: 'var(--tx5)' }}>—</span>}
                                </div>
                              )
                            })}
                            <div style={{ fontSize: 10, color: 'var(--tx4)', textAlign: 'center', padding: '3px 0', fontWeight: 700 }}>
                              {played.length > 0 ? played.reduce((a, h) => a + (scoreMap[h]?.putts ?? 0), 0) : '—'}
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: `60px repeat(9, 1fr) 52px`, gap: 2 }}>
                            <div style={{ fontSize: 9, color: 'var(--tx4)', padding: '2px 4px' }}>🍺</div>
                            {holes.map(h => {
                              const hit = chulligans.find(c => c.hole === h)
                              return (
                                <div key={h} style={{ textAlign: 'center', padding: '2px 0', fontSize: 11 }}>
                                  {hit ? '🍺' : <span style={{ color: 'var(--tx5)', fontSize: 9 }}>·</span>}
                                </div>
                              )
                            })}
                            <div />
                          </div>
                        </div>
                      </div>
                      {played.length > 0 && (
                        <div style={{ marginTop: 6, fontSize: 11, color: toParColor(toPar), textAlign: 'right', fontWeight: 600 }}>
                          {toParStr(toPar)} ({played.length} holes)
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Drive Usage */}
              {players.length === 2 && (
                <div className="glass animate-fadeUp" style={{ padding: '20px 26px', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 14 }}>
                    Drive Usage — min 4 per player per nine
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {[{ label: 'Front 9', from: 1, to: 9 }, { label: 'Back 9', from: 10, to: 18 }].map(({ label, from, to }) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, color: 'var(--tx4)', marginBottom: 8, fontWeight: 600 }}>{label}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          {players.map(p => {
                            const c  = driveCount(p.id, from, to)
                            const ok = c >= 4
                            return (
                              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AvatarCircle player={p} size={22} />
                                <div style={{ flex: 1, fontSize: 12, color: 'var(--tx2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {displayName(p)}
                                </div>
                                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <div style={{ fontSize: 16, fontWeight: 700, color: ok ? '#22c55e' : c > 0 ? '#FCB514' : 'var(--tx4)', minWidth: 20, textAlign: 'right' }}>{c}</div>
                                  {ok && <span style={{ fontSize: 10, color: '#22c55e' }}>✓</span>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chulligans */}
              {players.length === 2 && (
                <div className="glass animate-fadeUp" style={{ padding: '20px 26px', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 14 }}>
                    🍺 Chulligans — 1 per player per round (must chug)
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {players.map(p => {
                      const c = chulligans.find(ch => ch.player_id === p.id)
                      return (
                        <div key={p.id} style={{
                          flex: 1, textAlign: 'center', padding: '12px 10px', borderRadius: 12,
                          background: c ? 'rgba(252,181,20,0.1)' : 'var(--surf2)',
                          border: `1px solid ${c ? 'rgba(252,181,20,0.35)' : 'var(--bdr)'}`,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                            <AvatarCircle player={p} size={36} />
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayName(p)}
                          </div>
                          <div style={{ fontSize: 22, marginBottom: 4 }}>{c ? '✅' : '🍺'}</div>
                          <div style={{ fontSize: 11, color: c ? '#FCB514' : 'var(--tx4)', fontWeight: 600 }}>
                            {c ? `Used H${c.hole}` : 'Available'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Scoring Breakdown */}
              <div className="glass animate-fadeUp" style={{ padding: '22px 26px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'var(--tx3)', textTransform: 'uppercase', marginBottom: 18 }}>
                  Scoring Breakdown
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {breakdown.map(({ label, count, color }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 70, fontSize: 12, color: 'var(--tx2)', textAlign: 'right', flexShrink: 0 }}>{label}</div>
                      <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--surf2)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 999, width: `${(count / maxBreakdown) * 100}%`, background: color, transition: 'width 0.6s ease' }} />
                      </div>
                      <div style={{ width: 20, fontSize: 13, fontWeight: 700, color, textAlign: 'right', flexShrink: 0 }}>{count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="glass animate-fadeUp" style={{ padding: '32px', textAlign: 'center', color: 'var(--tx3)' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🏌️</div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Round hasn't started yet</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Stats will appear once scores are entered.</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

const AvatarCircle = memo(function AvatarCircle({ player, size }: { player: Player; size: number }) {
  const [err, setErr] = useState(false)
  const hasPhoto = !!player.avatar_url && !err
  const initial  = displayName(player).charAt(0).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      border: '2px solid rgba(252,181,20,0.4)',
      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: hasPhoto ? '#111' : 'linear-gradient(135deg, rgba(252,181,20,0.3), rgba(252,181,20,0.1))',
      fontSize: size * 0.4, fontWeight: 800, color: '#FCB514',
      fontFamily: 'Bebas Neue', letterSpacing: 1,
    }}>
      {hasPhoto ? (
        <img
          src={player.avatar_url!}
          alt={displayName(player)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setErr(true)}
        />
      ) : initial}
    </div>
  )
})

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#FCB514', fontFamily: 'Bebas Neue', letterSpacing: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    </div>
  )
}

function BigStat({ label, value, sub, color = 'var(--tx1)' }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 12, background: 'var(--surf)' }}>
      <div style={{ fontSize: 11, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color, fontFamily: 'Bebas Neue', letterSpacing: 2, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>{sub}</div>
    </div>
  )
}

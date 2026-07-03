import { useEffect, useState, useRef, memo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useYear } from '../context/YearContext'
import { localDb, parseJson } from '../lib/localDb'
import { displayName } from '../lib/types'
import { useCourse } from '../context/CourseContext'
import type { Team, Player } from '../lib/types'
import { Pencil, Check, X } from 'lucide-react'

type ScoreRow     = { hole: number; score: number; putts: number | null; drive_used_id: string | null }
type ChulliganRow = { id: string; player_id: string; hole: number }
type TeamFull     = Team & { player1?: Player; player2?: Player }

// ── Stats helpers ─────────────────────────────────────────
function calcStats(scores: ScoreRow[], parOf: (hole: number) => number) {
  const played = scores.filter(s => s.score > 0)
  const gross = played.reduce((a, s) => a + s.score, 0)
  const parSoFar = played.reduce((a, s) => a + parOf(s.hole), 0)
  const toPar = gross - parSoFar
  const putts = played.reduce((a, s) => a + (s.putts ?? 0), 0)

  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0
  for (const s of played) {
    const diff = s.score - parOf(s.hole)
    if (diff <= -2) eagles++
    else if (diff === -1) birdies++
    else if (diff === 0) pars++
    else if (diff === 1) bogeys++
    else doubles++
  }

  return { gross, toPar, putts, played: played.length, eagles, birdies, pars, bogeys, doubles }
}

function toParStr(n: number)   { return n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}` }
function toParColor(n: number) { return n < 0 ? '#22c55e' : n > 0 ? '#ef4444' : '#D4A53A' }

function scoreColor(score: number, par: number) {
  const d = score - par
  if (d <= -2) return '#D4A53A'
  if (d === -1) return '#22c55e'
  if (d === 0)  return 'var(--tx2)'
  if (d === 1)  return '#f59e0b'
  return '#ef4444'
}

// ── Scorecard cell styles (presentational) ────────────────
const CARD_GRID_COLS = '44px repeat(9, 1fr) 38px'
const cellNum: React.CSSProperties = {
  textAlign: 'center', padding: '5px 0', lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
}
const rowLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
  color: 'var(--tx4)', padding: '5px 4px 5px 6px', lineHeight: 1,
  display: 'flex', alignItems: 'center',
}

// ── Component ─────────────────────────────────────────────
export default function MyTeamPage() {
  const { profile } = useAuth()
  const { parOf } = useCourse()
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

    ;(async () => {
      // Step 1: Show cached teams immediately
      const localTeams = await localDb.teams
        .where('tournament_id').equals(effectiveTournamentId).toArray()
      if (localTeams.length > 0) {
        const cached: TeamFull[] = localTeams.map(t => ({
          ...t,
          player1: parseJson(t.player1_json) as Player | undefined,
          player2: parseJson(t.player2_json) as Player | undefined,
        })) as unknown as TeamFull[]
        setAllTeams(cached)
        const cachedIds = new Set(cached.map(t => t.id))
        // Only use myTeamId if it belongs to THIS tournament — avoids showing last year's scores
        const validMyId = myTeamId && cachedIds.has(myTeamId) ? myTeamId : null
        const defaultId = validMyId ?? (cached[0]?.id ?? null)
        setViewingTeamId(defaultId)
        if (!defaultId) setLoading(false)
      }

      // Step 2: Refresh from Supabase in the background
      try {
        const { data } = await supabase.from('teams')
          .select('*, player1:profiles!teams_p1_id_fkey(id, name, nickname), player2:profiles!teams_p2_id_fkey(id, name, nickname)')
          .eq('tournament_id', effectiveTournamentId)
        if (data) {
          const teams = data as unknown as TeamFull[]
          setAllTeams(teams)
          const freshIds = new Set(teams.map(t => t.id))
          const validMyIdFresh = myTeamId && freshIds.has(myTeamId) ? myTeamId : null
          setViewingTeamId(prev => {
            // Keep existing selection only if it's valid for this tournament
            if (prev && freshIds.has(prev)) return prev
            return validMyIdFresh ?? (teams[0]?.id ?? null)
          })
        }
      } catch { /* offline — cached data already shown */ }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTournamentId])

  // Load full data whenever selected team changes
  useEffect(() => {
    if (!viewingTeamId) return
    setLoading(true)

    ;(async () => {
      // Step 1: Show cached data immediately
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
      if (localTeam) setLoading(false)  // unblock UI as soon as we have cached data

      // Step 2: Refresh from Supabase in the background
      try {
        const [{ data: t }, { data: s }, { data: ch }] = await Promise.all([
          supabase
            .from('teams')
            .select(`id, name,
              player1:profiles!teams_p1_id_fkey(id, name, nickname, email, role, status, handicap, joined_at, team_id, notes, phone, avatar_url),
              player2:profiles!teams_p2_id_fkey(id, name, nickname, email, role, status, handicap, joined_at, team_id, notes, phone, avatar_url)`)
            .eq('id', viewingTeamId)
            .single(),
          supabase.from('scores').select('hole, score, putts, drive_used_id').eq('team_id', viewingTeamId),
          supabase.from('chulligans').select('id, player_id, hole').eq('team_id', viewingTeamId),
        ])
        if (t) {
          setTeam(t as unknown as TeamFull)
          setScores((s ?? []) as ScoreRow[])
          setChulligans((ch ?? []) as ChulliganRow[])
        }
      } catch { /* offline — cached data already shown */ } finally {
        setLoading(false)
      }
    })()
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
    <div className="glass animate-fadeUp" style={{ padding: '44px 32px', textAlign: 'center', maxWidth: 480, margin: '40px auto' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>⛳</div>
      <div style={{ fontFamily: 'Bebas Neue', fontSize: 24, letterSpacing: 2, color: 'var(--tx1)', marginBottom: 8 }}>No teams yet</div>
      <div style={{ color: 'var(--tx3)', fontSize: 13, lineHeight: 1.5 }}>Teams will appear here once the&nbsp;tournament is set up.</div>
    </div>
  )

  // Tab order: own team first, then alphabetical
  const tabTeams = myTeamId
    ? [...allTeams].sort((a, b) => (a.id === myTeamId ? -1 : b.id === myTeamId ? 1 : 0))
    : allTeams

  const isOwnTeam = viewingTeamId === myTeamId && myTeamId !== null && isCurrentYear

  // ── Stats ─────────────────────────────────────────────────
  const stats      = calcStats(scores, parOf)
  const players    = [team?.player1, team?.player2].filter(Boolean) as Player[]
  const frontStats = calcStats(scores.filter(s => s.hole <= 9), parOf)
  const backStats  = calcStats(scores.filter(s => s.hole >= 10), parOf)

  const driveCount = (pid: string, from = 1, to = 18) =>
    scores.filter(s => s.hole >= from && s.hole <= to && s.drive_used_id === pid).length

  const scoreMap: Record<number, ScoreRow> = {}
  for (const s of scores) scoreMap[s.hole] = s

  const scorecardHalves = [
    { label: 'FRONT', tag: 'OUT', holes: Array.from({ length: 9 }, (_, i) => i + 1) },
    { label: 'BACK',  tag: 'IN',  holes: Array.from({ length: 9 }, (_, i) => i + 10) },
  ]

  const breakdown = [
    { label: '🦅 Eagle',  count: stats.eagles,  color: '#D4A53A' },
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
        <div className="animate-fadeUp" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12, marginBottom: 16 }}>
          {tabTeams.map(t => (
            <button
              key={t.id}
              onClick={() => { setViewingTeamId(t.id); setEditingName(false) }}
              className={`pill-tab pressable ${viewingTeamId === t.id ? 'active' : ''}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}
            >
              <span>{t.name}{t.id === myTeamId ? ' ⭐' : ''}</span>
              {(t.player1 || t.player2) && (
                <span style={{ fontSize: 9, opacity: 0.55, whiteSpace: 'nowrap', letterSpacing: 0.3 }}>
                  {[t.player1 && displayName(t.player1), t.player2 && displayName(t.player2)].filter(Boolean).join(' & ')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Loading skeleton — mirrors page layout ── */}
      {loading ? (
        <div aria-busy="true" className="animate-fadeUp">
          {/* Team header */}
          <div style={{ marginBottom: 24 }}>
            <div className="skeleton skeleton-line" style={{ width: 72, height: 10, marginBottom: 12 }} />
            <div className="skeleton skeleton-title" style={{ width: 200, height: 28, marginBottom: 10 }} />
            <div className="skeleton skeleton-line" style={{ width: 150 }} />
          </div>
          {/* Player cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[0, 1].map(i => (
              <div key={i} className="glass" style={{ padding: 20 }}>
                <div className="skeleton skeleton-circle" style={{ width: 72, height: 72, marginBottom: 14 }} />
                <div className="skeleton skeleton-line" style={{ width: '70%', marginBottom: 10 }} />
                <div className="skeleton skeleton-line" style={{ width: '45%' }} />
              </div>
            ))}
          </div>
          {/* Stats row */}
          <div className="glass" style={{ padding: 20, marginBottom: 12 }}>
            <div className="skeleton skeleton-line" style={{ width: 120, height: 10, marginBottom: 16 }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[0, 1, 2].map(i => (
                <div key={i} className="skeleton" style={{ height: 80, borderRadius: 14 }} />
              ))}
            </div>
          </div>
          {/* Scorecard block */}
          <div className="glass" style={{ padding: 20 }}>
            <div className="skeleton skeleton-line" style={{ width: 90, height: 10, marginBottom: 16 }} />
            <div className="skeleton skeleton-card" style={{ height: 128, borderRadius: 14, marginBottom: 12 }} />
            <div className="skeleton skeleton-card" style={{ height: 128, borderRadius: 14 }} />
          </div>
        </div>
      ) : !team ? null : (
        <>
          {/* ── Read-only banner ── */}
          {!isOwnTeam && (
            <div className="glass-flat animate-fadeUp" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 14px' }}>
              <span style={{ fontSize: 13, lineHeight: 1 }}>👁</span>
              <span style={{ fontSize: 12, color: 'var(--tx3)', letterSpacing: 0.2 }}>Read-only — you can only edit your own&nbsp;team</span>
            </div>
          )}

          {/* ── Team header ── */}
          <div className="animate-fadeUp" style={{ marginBottom: 28 }}>
            {isOwnTeam && editingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                  maxLength={50}
                  autoFocus
                  style={{
                    fontFamily: 'Bebas Neue', fontSize: 28, letterSpacing: 3, color: 'var(--gold)',
                    background: 'var(--gold-08)', border: '1px solid var(--gold-40)',
                    borderRadius: 10, padding: '4px 12px', outline: 'none', minWidth: 0, flex: 1,
                  }}
                />
                <button className="pressable" onClick={saveName} disabled={saving} title="Save" style={{ background: 'var(--gold-15)', border: '1px solid var(--gold-25)', borderRadius: 10, padding: 10, minWidth: 40, minHeight: 40, cursor: 'pointer', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={16} />
                </button>
                <button className="pressable" onClick={() => setEditingName(false)} title="Cancel" style={{ background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 10, padding: 10, minWidth: 40, minHeight: 40, cursor: 'pointer', color: 'var(--tx3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <div className="section-label" style={{ fontSize: 10, letterSpacing: 2.5, color: 'var(--tx4)' }}>
                    {isOwnTeam ? 'Your Team' : 'Viewing'}
                  </div>
                  <h1 className="gold-text" style={{ fontFamily: 'Bebas Neue', fontSize: 36, letterSpacing: 3, margin: 0, lineHeight: 0.95 }}>
                    {team.name}
                  </h1>
                </div>
                {isOwnTeam && (
                  <button
                    className="pressable"
                    onClick={() => { setNameInput(team.name); setEditingName(true) }}
                    title="Rename team"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold-40)', padding: 6, display: 'flex', alignItems: 'center', flexShrink: 0, alignSelf: 'flex-end' }}
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            )}
            <p style={{ color: 'var(--tx3)', fontSize: 13, letterSpacing: 0.2, margin: 0 }}>
              {players.map(p => displayName(p)).join(' & ')}
            </p>
          </div>

          {/* ── Player cards ── */}
          <div className="animate-fadeUp delay-100" style={{ display: 'grid', gridTemplateColumns: players.length > 1 ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 20 }}>
            {players.map(p => (
              <div key={p.id} className="glass" style={{ padding: 20 }}>
                <div style={{ marginBottom: 12 }}>
                  <AvatarCircle player={p} size={72} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: -0.2, color: 'var(--tx1)', marginBottom: p.nickname ? 2 : 8 }}>
                  {displayName(p)}
                </div>
                {p.nickname && (
                  <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 8 }}>{p.name}</div>
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
              <div className="glass animate-fadeUp delay-200" style={{ padding: 20, marginBottom: 12 }}>
                <div className="section-label" style={{ marginBottom: 16 }}>Round Summary</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 8, marginBottom: 16 }}>
                  <BigStat label="Score"    value={`${stats.gross}`}            sub={`${toParStr(stats.toPar)} to par`} color={toParColor(stats.toPar)} />
                  <BigStat label="Thru"     value={`${stats.played}`}           sub="of 18 holes" />
                  <BigStat label="Putts"    value={`${stats.putts}`}            sub="total" />
                  {stats.birdies + stats.eagles > 0 && (
                    <BigStat label="Under Par" value={`${stats.birdies + stats.eagles}`} sub="holes" color="#22c55e" />
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, borderTop: '1px solid var(--bdr)', paddingTop: 16 }}>
                  {[
                    { label: 'Front 9', st: frontStats },
                    { label: 'Back 9',  st: backStats  },
                  ].map(({ label, st }) => (
                    <div key={label} className="stat-tile">
                      <div className="section-label" style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--tx4)', marginBottom: 6 }}>{label}</div>
                      {st.played > 0 ? (
                        <>
                          <div style={{ fontSize: 24, fontWeight: 400, color: toParColor(st.toPar), fontFamily: 'Bebas Neue', letterSpacing: 2, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                            {st.gross}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                            {toParStr(st.toPar)} · {st.played}&nbsp;holes
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
              <div className="glass animate-fadeUp delay-300" style={{ padding: '20px 14px', marginBottom: 12 }}>
                <div className="section-label" style={{ marginBottom: 14, paddingLeft: 6 }}>Scorecard</div>
                {scorecardHalves.map(({ label, tag, holes }) => {
                  const holePars  = holes.map(h => parOf(h))
                  const totalPar  = holePars.reduce((a, p) => a + p, 0)
                  const played    = holes.filter(h => scoreMap[h])
                  const subtotal  = played.reduce((a, h) => a + scoreMap[h].score, 0)
                  const playedPar = played.reduce((a, h) => a + parOf(h), 0)
                  const toPar     = subtotal - playedPar
                  return (
                    <div key={label} className="glass-flat" style={{ marginBottom: 12, padding: '8px 6px 6px', overflow: 'hidden' }}>
                      {/* Header row — hole numbers */}
                      <div style={{ display: 'grid', gridTemplateColumns: CARD_GRID_COLS, borderBottom: '1px solid var(--bdr)', paddingBottom: 2, marginBottom: 2 }}>
                        <div style={{ ...rowLabel, color: 'var(--tx2)', letterSpacing: 1.5 }}>{label}</div>
                        {holes.map(h => (
                          <div key={h} style={{ ...cellNum, fontSize: 10, fontWeight: 600, color: 'var(--tx3)' }}>{h}</div>
                        ))}
                        <div style={{ ...cellNum, fontSize: 9, fontWeight: 700, letterSpacing: 1, color: 'var(--tx3)' }}>{tag}</div>
                      </div>
                      {/* Par row */}
                      <div style={{ display: 'grid', gridTemplateColumns: CARD_GRID_COLS }}>
                        <div style={rowLabel}>Par</div>
                        {holePars.map((par, i) => (
                          <div key={i} style={{ ...cellNum, fontSize: 10, color: 'var(--tx4)' }}>{par}</div>
                        ))}
                        <div style={{ ...cellNum, fontSize: 10, fontWeight: 700, color: 'var(--tx4)' }}>{totalPar}</div>
                      </div>
                      {/* Score row */}
                      <div style={{ display: 'grid', gridTemplateColumns: CARD_GRID_COLS, background: 'var(--surf)', borderRadius: 8 }}>
                        <div style={{ ...rowLabel, color: 'var(--tx3)' }}>Score</div>
                        {holes.map((h, i) => {
                          const s = scoreMap[h]?.score ?? null
                          if (s === null) return (
                            <div key={h} style={{ ...cellNum, fontSize: 10, color: 'var(--tx5)' }}>—</div>
                          )
                          return (
                            <div key={h} style={{ ...cellNum, fontSize: 12, fontWeight: 700, color: scoreColor(s, holePars[i]) }}>{s}</div>
                          )
                        })}
                        <div style={{ ...cellNum, fontSize: 12, fontWeight: 800, color: played.length > 0 ? toParColor(toPar) : 'var(--tx4)' }}>
                          {played.length > 0 ? `${subtotal}` : '—'}
                        </div>
                      </div>
                      {/* Putts row */}
                      <div style={{ display: 'grid', gridTemplateColumns: CARD_GRID_COLS }}>
                        <div style={rowLabel}>Putts</div>
                        {holes.map(h => {
                          const p = scoreMap[h]?.putts ?? null
                          return (
                            <div key={h} style={{ ...cellNum, fontSize: 10, color: 'var(--tx4)' }}>
                              {p !== null ? p : <span style={{ color: 'var(--tx5)' }}>—</span>}
                            </div>
                          )
                        })}
                        <div style={{ ...cellNum, fontSize: 10, fontWeight: 700, color: 'var(--tx4)' }}>
                          {played.length > 0 ? played.reduce((a, h) => a + (scoreMap[h]?.putts ?? 0), 0) : '—'}
                        </div>
                      </div>
                      {/* Chulligan row */}
                      <div style={{ display: 'grid', gridTemplateColumns: CARD_GRID_COLS }}>
                        <div style={rowLabel}>🍺</div>
                        {holes.map(h => {
                          const hit = chulligans.find(c => c.hole === h)
                          return (
                            <div key={h} style={{ ...cellNum, fontSize: 11, padding: '3px 0' }}>
                              {hit ? '🍺' : <span style={{ color: 'var(--tx5)', fontSize: 9 }}>·</span>}
                            </div>
                          )
                        })}
                        <div />
                      </div>
                      {played.length > 0 && (
                        <div style={{ marginTop: 4, padding: '2px 6px 2px 0', fontSize: 11, fontWeight: 600, color: toParColor(toPar), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {toParStr(toPar)} ({played.length}&nbsp;holes)
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Drive Usage */}
              {players.length === 2 && (
                <div className="glass animate-fadeUp delay-400" style={{ padding: 20, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    <div className="section-label">Drive Usage</div>
                    <div style={{ fontSize: 10, color: 'var(--tx4)', letterSpacing: 0.3 }}>min 4 per player per&nbsp;nine</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[{ label: 'Front 9', from: 1, to: 9 }, { label: 'Back 9', from: 10, to: 18 }].map(({ label, from, to }) => (
                      <div key={label} className="glass-flat" style={{ padding: '10px 12px' }}>
                        <div className="section-label" style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--tx4)', marginBottom: 10 }}>{label}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                                  <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: ok ? '#22c55e' : c > 0 ? 'var(--gold)' : 'var(--tx4)', minWidth: 20, textAlign: 'right' }}>{c}</div>
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
                <div className="glass animate-fadeUp delay-500" style={{ padding: 20, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                    <div className="section-label">🍺 Chulligans</div>
                    <div style={{ fontSize: 10, color: 'var(--tx4)', letterSpacing: 0.3 }}>1 per player per round · must&nbsp;chug</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {players.map(p => {
                      const c = chulligans.find(ch => ch.player_id === p.id)
                      return (
                        <div key={p.id} className={c ? undefined : 'glass-flat'} style={{
                          flex: 1, textAlign: 'center', padding: '14px 10px',
                          ...(c ? {
                            borderRadius: 14,
                            background: 'var(--gold-08)',
                            border: '1px solid var(--gold-25)',
                            boxShadow: 'var(--elev-1)',
                          } : {}),
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                            <AvatarCircle player={p} size={36} />
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx2)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {displayName(p)}
                          </div>
                          <div style={{ fontSize: 22, marginBottom: 4, lineHeight: 1 }}>{c ? '✅' : '🍺'}</div>
                          <div style={{ fontSize: 11, color: c ? 'var(--gold)' : 'var(--tx4)', fontWeight: 600, letterSpacing: 0.3 }}>
                            {c ? `Used H${c.hole}` : 'Available'}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Scoring Breakdown */}
              <div className="glass animate-fadeUp delay-500" style={{ padding: 20 }}>
                <div className="section-label" style={{ marginBottom: 16 }}>Scoring Breakdown</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {breakdown.map(({ label, count, color }) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 72, fontSize: 12, color: 'var(--tx2)', textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>{label}</div>
                      <div style={{ flex: 1, height: 8, borderRadius: 999, background: 'var(--surf2)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 999, width: `${(count / maxBreakdown) * 100}%`, background: color, transition: 'width 0.6s ease' }} />
                      </div>
                      <div style={{ width: 20, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color, textAlign: 'right', flexShrink: 0 }}>{count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="glass animate-fadeUp delay-200" style={{ padding: '36px 24px', textAlign: 'center', color: 'var(--tx3)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🏌️</div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 1.5, color: 'var(--tx1)' }}>Round hasn't started yet</div>
              <div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>Stats will appear once scores are&nbsp;entered.</div>
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
      border: '2px solid var(--gold-40)',
      boxShadow: 'var(--elev-1)',
      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: hasPhoto ? '#111' : 'linear-gradient(135deg, rgba(212,165,58,0.3), rgba(212,165,58,0.1))',
      fontSize: size * 0.4, fontWeight: 800, color: 'var(--gold)',
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
    <div>
      <div style={{ fontSize: 20, color: 'var(--gold)', fontFamily: 'Bebas Neue', letterSpacing: 1, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div className="section-label" style={{ fontSize: 9, letterSpacing: 1.2, color: 'var(--tx4)', marginTop: 3 }}>{label}</div>
    </div>
  )
}

function BigStat({ label, value, sub, color = 'var(--tx1)' }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="stat-tile">
      <div className="section-label" style={{ fontSize: 10, letterSpacing: 1.5, color: 'var(--tx4)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 32, color, fontFamily: 'Bebas Neue', letterSpacing: 1.5, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--tx3)', marginTop: 5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{sub}</div>
    </div>
  )
}

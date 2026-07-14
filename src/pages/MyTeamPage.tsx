import { useEffect, useState, useRef, memo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useYear } from '../context/YearContext'
import { localDb, parseJson } from '../lib/localDb'
import { displayName, teamMemberName } from '../lib/types'
import { useCourse } from '../context/CourseContext'
import type { Team, Player } from '../lib/types'
import { Pencil, Check, X } from 'lucide-react'
import { ShotStats } from '../components/ShotStats'
import { usePersistedTab } from '../hooks/usePersistedTab'

// Augusta scoreboard palette — matches the Leaderboard / Dashboard / Hall of Fame.
const AUGUSTA = '#0a5c39'
const AUGUSTA_DEEP = '#063a25'
const CREAM = '#efe8d2'
const GOLD_SOFT = '#e7c877'
const MASTERS_RED = '#e0402f'
const MASTHEAD = `linear-gradient(180deg, ${AUGUSTA}, ${AUGUSTA_DEEP})`

function Crest({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="50" cy="50" r="48" fill={AUGUSTA_DEEP} stroke="#d4a53a" strokeWidth="3.5" />
      <path d="M40 74 L40 28 L69 35 L40 42" fill="#e0402f" />
      <rect x="37.5" y="26" width="3" height="48" rx="1.5" fill={CREAM} />
    </svg>
  )
}

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

// Masters to-par colour: red under par, gold on E, muted over.
function parColor(n: number) { return n < 0 ? MASTERS_RED : n === 0 ? 'var(--gold)' : 'var(--tx3)' }

// Scorecard notation for a hole's score — red circle under par, square over par.
function scoreNote(score: number, par: number): React.CSSProperties {
  const d = score - par
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
  }
  if (d <= -2) return { ...base, color: '#fff', background: MASTERS_RED, borderRadius: '50%' }        // eagle+
  if (d === -1) return { ...base, color: MASTERS_RED, border: `1.6px solid ${MASTERS_RED}`, borderRadius: '50%' } // birdie
  if (d === 0)  return { ...base, color: 'var(--tx1)' }                                                // par
  if (d === 1)  return { ...base, color: 'var(--tx2)', border: '1.5px solid var(--tx4)', borderRadius: 4 } // bogey
  return { ...base, color: '#fff', background: '#7c2d2a', borderRadius: 4 }                            // double+
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
  const [teamSubTab, setTeamSubTab] = usePersistedTab<'profile' | 'stats'>('team.subtab', 'profile', ['profile', 'stats'])
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

  // Compact roster row — pic / name / handicap, kept short so the scorecard leads.
  const playersCompact = (
    <div className="glass animate-fadeUp delay-100" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
      {players.map((p, i) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: i > 0 ? '1px solid var(--bdr)' : undefined }}>
          <AvatarCircle player={p} size={40} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--tx1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName(p)}</div>
            {p.nickname && <div style={{ fontSize: 11.5, color: 'var(--tx3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>}
          </div>
          <div style={{ display: 'flex', gap: 16, flexShrink: 0, alignItems: 'center' }}>
            <StatChip label="Drives" value={driveCount(p.id)} />
            {p.handicap != null && <StatChip label="HCP" value={p.handicap} />}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* ── Team selector tabs ── */}
      {allTeams.length > 1 && (
        <div className="pill-tabs animate-fadeUp" style={{ marginBottom: 16 }}>
          {tabTeams.map(t => (
            <button
              key={t.id}
              onClick={() => { setViewingTeamId(t.id); setEditingName(false); setTeamSubTab('profile') }}
              className={`pill-tab pressable ${viewingTeamId === t.id ? 'active' : ''}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}
            >
              <span>{t.name}{t.id === myTeamId ? ' ⭐' : ''}</span>
              {(t.player1 || t.player2 || t.p1_name || t.p2_name) && (
                <span style={{ fontSize: 9, opacity: 0.55, whiteSpace: 'nowrap', letterSpacing: 0.3 }}>
                  {[teamMemberName(t.player1, t.p1_name), teamMemberName(t.player2, t.p2_name)].filter(Boolean).join(' & ')}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Team sub-tabs: profile vs team shot stats ── */}
      {!loading && team && (
        <div className="pill-tabs animate-fadeUp" style={{ marginBottom: 16 }}>
          <button onClick={() => setTeamSubTab('profile')} className={`pill-tab pressable ${teamSubTab === 'profile' ? 'active' : ''}`}>⛳ Team Profile</button>
          <button onClick={() => setTeamSubTab('stats')} className={`pill-tab pressable ${teamSubTab === 'stats' ? 'active' : ''}`}>📊 Shot Stats</button>
        </div>
      )}

      {teamSubTab === 'stats' && !loading && team && (
        <ShotStats teamId={viewingTeamId} />
      )}

      {/* ── Loading skeleton — mirrors page layout ── */}
      {teamSubTab === 'profile' && (loading ? (
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

          {/* ── Team masthead (Augusta) ── */}
          <div className="glass animate-fadeUp" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
            {isOwnTeam && editingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px' }}>
                <input
                  ref={nameInputRef}
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
                  maxLength={50}
                  autoFocus
                  style={{
                    fontFamily: 'Bebas Neue', fontSize: 26, letterSpacing: 3, color: 'var(--gold)',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 18px', background: MASTHEAD, borderBottom: '2px solid rgba(240,230,200,0.18)' }}>
                <Crest size={38} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2.2, textTransform: 'uppercase', color: GOLD_SOFT }}>{isOwnTeam ? 'Your Team' : 'Viewing'}</div>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: 30, letterSpacing: 2.5, color: CREAM, lineHeight: 1, marginTop: 2 }}>{team.name}</div>
                  <div style={{ fontSize: 12, color: 'rgba(240,230,200,0.72)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {players.map(p => displayName(p)).join(' · ')}
                  </div>
                </div>
                {stats.played > 0 && (
                  <div style={{ textAlign: 'right', flexShrink: 0, color: CREAM }}>
                    <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: GOLD_SOFT }}>Thru</div>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: 1, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{stats.played === 18 ? 'F' : stats.played}</div>
                  </div>
                )}
                {isOwnTeam && (
                  <button className="pressable" onClick={() => { setNameInput(team.name); setEditingName(true) }} title="Rename team"
                    style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(240,230,200,0.25)', borderRadius: 9, cursor: 'pointer', color: CREAM, padding: 8, display: 'flex', alignItems: 'center', flexShrink: 0, alignSelf: 'flex-start' }}>
                    <Pencil size={14} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Roster — directly under the team title */}
          {playersCompact}

          {/* ── Content: round has started ── */}
          {stats.played > 0 ? (
            <>
              {/* Round Summary — clean To Par / Gross / Putts strip */}
              <div className="glass animate-fadeUp delay-200" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  {[
                    { label: 'To Par', value: toParStr(stats.toPar), color: stats.toPar < 0 ? MASTERS_RED : stats.toPar === 0 ? 'var(--gold)' : 'var(--tx2)' },
                    { label: 'Gross',  value: `${stats.gross}`,      color: 'var(--tx1)' },
                    { label: 'Putts',  value: `${stats.putts}`,      color: 'var(--tx1)' },
                  ].map((c, i) => (
                    <div key={c.label} style={{ padding: '18px 10px', textAlign: 'center', borderLeft: i > 0 ? '1px solid var(--bdr)' : undefined }}>
                      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.3, textTransform: 'uppercase', color: 'var(--tx4)', marginBottom: 7 }}>{c.label}</div>
                      <div style={{ fontFamily: 'Bebas Neue', fontSize: 32, letterSpacing: 1, color: c.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{c.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', background: AUGUSTA_DEEP, color: 'rgba(240,230,200,0.72)', fontSize: 11, letterSpacing: 0.4 }}>
                  🍺 {chulligans.length} of {players.length} chulligans used ·&nbsp;<span style={{ color: MASTERS_RED, fontWeight: 700 }}>red</span>&nbsp;= under par
                </div>
              </div>

              {/* Scorecard — Augusta card with golf notation */}
              <div className="glass animate-fadeUp delay-300" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
                {/* Masthead */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', background: MASTHEAD, borderBottom: '2px solid rgba(240,230,200,0.18)' }}>
                  <Crest size={30} />
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: 22, letterSpacing: 2, color: CREAM, lineHeight: 1 }}>Scorecard</div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right', color: CREAM }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase', color: GOLD_SOFT }}>Total</div>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 1, lineHeight: 1, color: stats.toPar < 0 ? MASTERS_RED : 'var(--cream, #efe8d2)' }}>{toParStr(stats.toPar)}</div>
                  </div>
                </div>

                {scorecardHalves.map(({ label, tag, holes }, ni) => {
                  const holePars  = holes.map(h => parOf(h))
                  const totalPar  = holePars.reduce((a, p) => a + p, 0)
                  const played    = holes.filter(h => scoreMap[h])
                  const subtotal  = played.reduce((a, h) => a + scoreMap[h].score, 0)
                  const playedPar = played.reduce((a, h) => a + parOf(h), 0)
                  const toPar     = subtotal - playedPar
                  return (
                    <div key={label} style={{ padding: '12px 12px 8px', borderTop: ni > 0 ? '1px solid var(--bdr)' : undefined }}>
                      {/* Hole numbers */}
                      <div style={{ display: 'grid', gridTemplateColumns: CARD_GRID_COLS, borderBottom: '1px solid var(--bdr)', paddingBottom: 4, marginBottom: 3 }}>
                        <div style={{ ...rowLabel, color: 'var(--gold)', letterSpacing: 1.5 }}>{label}</div>
                        {holes.map(h => (
                          <div key={h} style={{ ...cellNum, fontSize: 10, fontWeight: 700, color: 'var(--tx4)' }}>{h}</div>
                        ))}
                        <div style={{ ...cellNum, fontSize: 9, fontWeight: 800, letterSpacing: 1, color: 'var(--gold)' }}>{tag}</div>
                      </div>
                      {/* Par */}
                      <div style={{ display: 'grid', gridTemplateColumns: CARD_GRID_COLS }}>
                        <div style={rowLabel}>Par</div>
                        {holePars.map((par, i) => (
                          <div key={i} style={{ ...cellNum, fontSize: 10, color: 'var(--tx4)' }}>{par}</div>
                        ))}
                        <div style={{ ...cellNum, fontSize: 10, fontWeight: 700, color: 'var(--tx4)' }}>{totalPar}</div>
                      </div>
                      {/* Score — notation */}
                      <div style={{ display: 'grid', gridTemplateColumns: CARD_GRID_COLS, alignItems: 'center' }}>
                        <div style={{ ...rowLabel, color: 'var(--tx3)' }}>Score</div>
                        {holes.map((h, i) => {
                          const s = scoreMap[h]?.score ?? null
                          return (
                            <div key={h} style={{ ...cellNum, padding: '4px 0' }}>
                              {s === null ? <span style={{ fontSize: 11, color: 'var(--tx5)' }}>—</span> : <span style={scoreNote(s, holePars[i])}>{s}</span>}
                            </div>
                          )
                        })}
                        <div style={{ ...cellNum, fontFamily: 'Bebas Neue', fontSize: 16, color: played.length > 0 ? parColor(toPar) : 'var(--tx4)' }}>
                          {played.length > 0 ? subtotal : '—'}
                        </div>
                      </div>
                      {/* Putts */}
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
                      {played.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 6, padding: '5px 38px 0 0' }}>
                          <span style={{ fontSize: 10, color: 'var(--tx4)', textTransform: 'uppercase', letterSpacing: 1 }}>{tag === 'OUT' ? 'Front' : 'Back'}</span>
                          <span style={{ fontFamily: 'Bebas Neue', fontSize: 15, letterSpacing: 1, color: parColor(toPar) }}>{toParStr(toPar)} · {played.length}&nbsp;holes</span>
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'center', padding: 12, background: AUGUSTA_DEEP }}>
                  {[
                    { n: '2', label: 'Eagle',  st: { color: '#fff', background: MASTERS_RED, borderRadius: '50%' } as React.CSSProperties },
                    { n: '3', label: 'Birdie', st: { color: '#ffb4ab', border: '1.4px solid #ffb4ab', borderRadius: '50%' } as React.CSSProperties },
                    { n: '4', label: 'Par',    st: { color: 'rgba(240,230,200,0.85)' } as React.CSSProperties },
                    { n: '5', label: 'Bogey+', st: { color: 'rgba(240,230,200,0.8)', border: '1.3px solid rgba(240,230,200,0.45)', borderRadius: 4 } as React.CSSProperties },
                  ].map(l => (
                    <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'rgba(240,230,200,0.8)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 17, height: 17, fontSize: 9, fontWeight: 700, ...l.st }}>{l.n}</span> {l.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Drive Usage */}
              {players.length === 2 && (
                <div className="glass animate-fadeUp delay-400" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px', background: MASTHEAD, borderBottom: '2px solid rgba(240,230,200,0.18)' }}>
                    <span style={{ fontSize: 15 }}>⛳</span>
                    <span style={{ fontFamily: 'Bebas Neue', fontSize: 19, letterSpacing: 2, color: CREAM, lineHeight: 1 }}>Drive Usage</span>
                    <span style={{ marginLeft: 'auto', fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: GOLD_SOFT }}>Min 4 / nine</span>
                  </div>
                  <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
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
                <div className="glass animate-fadeUp delay-500" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px', background: MASTHEAD, borderBottom: '2px solid rgba(240,230,200,0.18)' }}>
                    <span style={{ fontSize: 15 }}>🍺</span>
                    <span style={{ fontFamily: 'Bebas Neue', fontSize: 19, letterSpacing: 2, color: CREAM, lineHeight: 1 }}>Chulligans</span>
                    <span style={{ marginLeft: 'auto', fontSize: 9.5, letterSpacing: 0.8, textTransform: 'uppercase', color: GOLD_SOFT }}>1 each · must chug</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, padding: 16 }}>
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
              <div className="glass animate-fadeUp delay-500" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '11px 16px', background: MASTHEAD, borderBottom: '2px solid rgba(240,230,200,0.18)' }}>
                  <span style={{ fontSize: 15 }}>📊</span>
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 19, letterSpacing: 2, color: CREAM, lineHeight: 1 }}>Scoring Breakdown</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16 }}>
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
      ))}
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


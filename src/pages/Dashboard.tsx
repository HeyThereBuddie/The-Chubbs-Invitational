import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { localDb, parseJson } from '../lib/localDb'
import { useAuth } from '../context/AuthContext'
import { useYear } from '../context/YearContext'
import { useTheme } from '../context/ThemeContext'
import { ALL_QUOTES, COURSE_NAME, TOURNAMENT_DATE, FIRST_TEE_TIME, COURSE_PAR, displayName, teamMemberName } from '../lib/types'
import type { Team, Score, Player } from '../lib/types'
import { formatDistanceToNow } from 'date-fns'
import PushEnableTile from '../components/PushEnableTile'

const CHUBBS_IMG = 'https://static.wikia.nocookie.net/sandlerverse/images/8/81/Chubbs_Peterson_in_Happy_Gilmore.webp'

// Augusta scoreboard palette — matches the Leaderboard / Hall of Fame Masters styling.
const AUGUSTA = '#0a5c39'
const AUGUSTA_DEEP = '#063a25'
const CREAM = '#efe8d2'
const MASTERS_RED = '#e0402f'

interface FeedEvent {
  id: string
  event_type: 'score' | 'chulligan' | 'putt' | 'contest'
  team_name: string
  voter_name: string | null
  player_name: string | null
  hole: number
  score: number | null
  label: string
  emoji: string
  created_at: string
}

const SCORE_COLORS: Record<string, string> = {
  'Hole in One!': '#3b82f6',
  'Eagle':        '#86efac',
  'Birdie':       '#4ade80',
  'Par':          '#22c55e',
  'Bogey':        '#ef4444',
  'Double':       '#dc2626',
}

function eventColor(ev: FeedEvent) {
  if (ev.event_type === 'contest') return '#D4A53A'
  if (ev.event_type === 'chulligan') return '#f59e0b'
  if (ev.event_type === 'putt') {
    if (ev.label === '3-Putt') return '#fb923c'
    if (ev.label === '4-Putt') return '#ea580c'
    return '#c2410c'
  }
  if (ev.label.startsWith('+')) return '#991b1b'
  return SCORE_COLORS[ev.label] ?? '#ef4444'
}

function isHighlight(ev: FeedEvent) {
  return ev.event_type === 'contest' || ev.event_type === 'chulligan' || ev.event_type === 'putt' || ['Hole in One!', 'Eagle', 'Birdie'].includes(ev.label)
}


interface LeaderRow {
  team: Team & { player1?: Player; player2?: Player }
  toPar: number
  gross: number
  thru: number
}

interface DefendingChamp {
  teamName: string
  player1Name: string | null
  player2Name: string | null
  toPar: number | null
  year: number
}

interface ContestLeader { name: string; photo_url: string | null; detail: string | null }

// Yards → feet/inches, for the Closest-to-Pin readout.
function feetInchesLabel(yds: number): string {
  const totalFt = yds * 3, ft = Math.floor(totalFt), inch = Math.round((totalFt - ft) * 12)
  return inch >= 12 ? `${ft + 1} ft` : inch > 0 ? `${ft} ft ${inch} in` : `${ft} ft`
}

export default function Dashboard() {
  const { profile } = useAuth()
  const { isDark } = useTheme()
  const navigate = useNavigate()
  const { effectiveTournamentId, isCurrentYear } = useYear()
  const [leaders, setLeaders] = useState<LeaderRow[]>([])
  const [feed, setFeed] = useState<FeedEvent[]>([])
  const [contestLeaders, setContestLeaders] = useState<{ ctp: ContestLeader | null; ld: ContestLeader | null }>({ ctp: null, ld: null })
  const [quoteIdx, setQuoteIdx] = useState(0)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  const [defendingChamp, setDefendingChamp] = useState<DefendingChamp | null>(null)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    const i = setInterval(() => {
      setQuoteIdx(n => (n + 1) % ALL_QUOTES.length)
    }, 7000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => { fetchData(); fetchDefendingChamp() }, [effectiveTournamentId])
  useEffect(() => {
    fetchFeedRef.current = fetchFeed
  })
  useEffect(() => {
    fetchFeed()

    if (!isCurrentYear) return

    const channel = supabase
      .channel('feed_events_dashboard')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_events' }, payload => {
        setFeed(prev => [payload.new as FeedEvent, ...prev].slice(0, 7))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'feed_events' }, () => {
        fetchFeedRef.current()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrentYear, effectiveTournamentId])

  // Contest leaders — fetch + keep live.
  useEffect(() => {
    fetchContestLeaders()
    if (!isCurrentYear) return
    const ch = supabase
      .channel('contest_entries_dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contest_entries' }, () => fetchContestLeaders())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCurrentYear, effectiveTournamentId])

  const fetchFeed = async () => {
    if (!effectiveTournamentId) { setFeed([]); return }

    // Step 1: Show cached feed immediately
    const localFeed = await localDb.feed_events
      .where('tournament_id').equals(effectiveTournamentId).toArray()
    if (localFeed.length > 0) {
      const sorted = [...localFeed]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 7)
      setFeed(sorted as unknown as FeedEvent[])
    }

    // Step 2: Refresh from Supabase in background
    try {
      const { data: eventsData } = await supabase
        .from('feed_events').select('*')
        .eq('tournament_id', effectiveTournamentId)
        .order('created_at', { ascending: false }).limit(7)
      if (eventsData) setFeed(eventsData as FeedEvent[])
    } catch { /* offline — cached feed already shown */ }
  }

  const fetchFeedRef = useRef(fetchFeed)

  const fetchDefendingChamp = async () => {
    const { data: lastT } = await supabase
      .from('tournaments').select('id, year').eq('status', 'completed')
      .order('year', { ascending: false }).limit(1).single()
    if (!lastT) return
    const { data: result } = await supabase
      .from('tournament_results').select('*')
      .eq('tournament_id', lastT.id).eq('category', 'champion').single()
    if (!result) return
    setDefendingChamp({
      teamName: result.team_name ?? '',
      player1Name: result.player1_name ?? null,
      player2Name: result.player2_name ?? null,
      toPar: result.score_to_par ?? null,
      year: lastT.year,
    })
  }

  const fetchData = async () => {
    if (!effectiveTournamentId) { setLeaders([]); return }

    // Step 1: Show cached data immediately (works offline)
    const [localTeams, localScores] = await Promise.all([
      localDb.teams.where('tournament_id').equals(effectiveTournamentId).toArray(),
      localDb.scores.toArray(),
    ])
    if (localTeams.length > 0) {
      const cachedTeams = localTeams.map(t => ({
        ...t,
        player1: parseJson(t.player1_json) as Player | undefined,
        player2: parseJson(t.player2_json) as Player | undefined,
      }))
      const cachedRows: LeaderRow[] = cachedTeams.map(team => {
        const teamScores = localScores.filter(s => s.team_id === team.id)
        const gross = teamScores.reduce((sum, s) => sum + s.score, 0)
        const thru = teamScores.length
        const toPar = gross - (thru * (COURSE_PAR / 18))
        return { team: team as unknown as Team & { player1?: Player; player2?: Player }, gross, thru, toPar }
      })
      cachedRows.sort((a, b) => a.toPar - b.toPar || b.thru - a.thru)
      setLeaders(cachedRows.slice(0, 5))
    }

    // Step 2: Refresh from Supabase in background
    try {
      const [teamsRes, scoresRes] = await Promise.all([
        supabase.from('teams').select('*, player1:profiles!teams_p1_id_fkey(*), player2:profiles!teams_p2_id_fkey(*)').eq('tournament_id', effectiveTournamentId),
        supabase.from('scores').select('*'),
      ])
      const teams: (Team & { player1?: Player; player2?: Player })[] = teamsRes.data ?? []
      const scores: Score[] = scoresRes.data ?? []
      const rows: LeaderRow[] = teams.map(team => {
        const teamScores = scores.filter(s => s.team_id === team.id)
        const gross = teamScores.reduce((sum, s) => sum + s.score, 0)
        const thru = teamScores.length
        const toPar = gross - (thru * (COURSE_PAR / 18))
        return { team, gross, thru, toPar }
      })
      rows.sort((a, b) => a.toPar - b.toPar || b.thru - a.thru)
      setLeaders(rows.slice(0, 5))
    } catch { /* offline — cached data already shown */ }
  }

  // Current contest holders (CTP / LD). The most recent entry per type is the
  // standing leader — same rule the Contests page uses.
  const fetchContestLeaders = async () => {
    if (!effectiveTournamentId) { setContestLeaders({ ctp: null, ld: null }); return }
    try {
      const { data } = await supabase
        .from('contest_entries')
        .select('type, photo_url, distance_yds, player:profiles(*)')
        .eq('tournament_id', effectiveTournamentId)
        .in('type', ['ctp', 'ld'])
        .order('created_at', { ascending: false })
      type Row = { type: string; photo_url: string | null; distance_yds: number | null; player?: Player }
      const rows = (data ?? []) as unknown as Row[]
      const asLeader = (r: Row | undefined, detail: string | null): ContestLeader | null =>
        r?.player ? { name: displayName(r.player), photo_url: r.photo_url, detail } : null
      // CTP = latest submission; LD = longest measured drive.
      const ctp = rows.find(r => r.type === 'ctp')
      const ldRows = rows.filter(r => r.type === 'ld')
      const ld = ldRows.reduce<Row | undefined>((best, r) => (r.distance_yds ?? -1) > (best?.distance_yds ?? -1) ? r : best, undefined)
      setContestLeaders({
        ctp: asLeader(ctp, ctp?.distance_yds != null ? feetInchesLabel(ctp.distance_yds) : null),
        ld: asLeader(ld, ld?.distance_yds != null ? `${Math.round(ld.distance_yds)} yds` : null),
      })
    } catch { /* offline — keep whatever we have */ }
  }

  const toPar = (n: number) => n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`
  const currentQuote = ALL_QUOTES[quoteIdx]

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>

      {/* Waitlist banner */}
      {profile?.status === 'waitlist' && isCurrentYear && (
        <div style={{
          background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 16, padding: '16px 20px', marginBottom: 20,
          display: 'flex', gap: 12, alignItems: 'center',
          boxShadow: 'var(--elev-1)',
        }}>
          <span style={{ fontSize: 20 }}>⏳</span>
          <div>
            <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: 14 }}>You're on the Waitlist</div>
            <div style={{ fontSize: 13, color: 'var(--tx3)', marginTop: 2 }}>
              We'll reach out when a spot opens. Hang tight!
            </div>
          </div>
        </div>
      )}

      {/* ── Compact Hero ─────────────────────────────────────── */}
      <div className="animate-fadeUp" style={{
        marginBottom: 16, borderRadius: 16, overflow: 'hidden',
        border: '1px solid var(--gold-25)',
        boxShadow: 'var(--elev-2)',
        background: isDark
          ? 'linear-gradient(135deg, #0e0a02 0%, #1a1000 50%, #0e0a02 100%)'
          : 'linear-gradient(135deg, #fffbef 0%, #fff8e1 50%, #fffbef 100%)',
      }}>
        <div style={{ padding: isMobile ? '12px' : '12px 16px', display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
          {!isMobile && (
            <div className="animate-glow-pulse" style={{ width: 40, height: 40, borderRadius: '50%', border: '2px solid var(--gold-dim)', overflow: 'hidden', flexShrink: 0 }}>
              <img src={CHUBBS_IMG} alt="Chubbs" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="text-shimmer" style={{ fontFamily: 'Bebas Neue', fontSize: isMobile ? 16 : 20, letterSpacing: isMobile ? 2 : 3, lineHeight: 1 }}>
              The Chubbs Memorial
            </div>
            <div style={{ display: 'flex', gap: isMobile ? 8 : 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--tx3)', marginTop: 4 }}>
              <span>⛳ {COURSE_NAME}</span>
              <span>📅 {TOURNAMENT_DATE}</span>
              {!isMobile && <span>🕗 {FIRST_TEE_TIME}</span>}
            </div>
          </div>

          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            {!isMobile && <div style={{ fontSize: 11, color: 'var(--tx3)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>Welcome</div>}
            <div style={{ fontFamily: 'Bebas Neue', fontSize: isMobile ? 16 : 20, color: 'var(--gold)', letterSpacing: 2, lineHeight: 1 }}>
              {profile ? displayName(profile) : 'Player'}
            </div>
          </div>
        </div>

        {!isMobile && (
          <div style={{ borderTop: '1px solid var(--gold-08)', padding: '8px 16px', background: 'rgba(0,0,0,0.2)', fontSize: 12 }}>
            <span style={{ color: 'var(--tx3)', fontStyle: 'italic' }}>💬 "{currentQuote.quote}"</span>
            <span style={{ color: 'var(--gold-dim)', marginLeft: 8 }}>— {currentQuote.by}</span>
          </div>
        )}
      </div>

      {/* ── Turn-on-notifications nudge (a second entry point) ── */}
      {isCurrentYear && <PushEnableTile />}

      {/* ── Defending Champions ──────────────────────────────── */}
      {defendingChamp && (
        <div className="glass-flat animate-fadeUp" style={{
          marginBottom: 16, borderRadius: 16,
          borderColor: 'var(--gold-25)',
          background: 'var(--gold-08)',
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 22, flexShrink: 0 }}>🏆</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: 2, color: 'var(--gold-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>
              {defendingChamp.year} Defending Champions
            </div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: isMobile ? 16 : 20, color: 'var(--gold)', letterSpacing: 2, lineHeight: 1 }}>
              {defendingChamp.teamName}
            </div>
            {(defendingChamp.player1Name || defendingChamp.player2Name) && (
              <div style={{ fontSize: 12, color: 'var(--tx3)', marginTop: 2 }}>
                {[defendingChamp.player1Name, defendingChamp.player2Name].filter(Boolean).join(' & ')}
              </div>
            )}
          </div>
          {defendingChamp.toPar != null && (
            <div style={{
              fontFamily: 'Bebas Neue', fontSize: 20, letterSpacing: 1, flexShrink: 0,
              color: defendingChamp.toPar < 0 ? MASTERS_RED : defendingChamp.toPar > 0 ? 'var(--tx2)' : 'var(--gold)',
            }}>
              {defendingChamp.toPar === 0 ? 'E' : defendingChamp.toPar > 0 ? `+${defendingChamp.toPar}` : defendingChamp.toPar}
            </div>
          )}
        </div>
      )}

      {/* ── Live Leaderboard + Live Scoring Feed ─────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>

        {/* Live leaderboard */}
        <div data-tour="leaderboard" className="glass animate-fadeUp delay-100" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 11,
            background: `linear-gradient(180deg, ${AUGUSTA}, ${AUGUSTA_DEEP})`,
            borderBottom: '2px solid rgba(240,230,200,0.18)',
          }}>
            <svg width="30" height="30" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
              <circle cx="50" cy="50" r="48" fill={AUGUSTA_DEEP} stroke="#d4a53a" strokeWidth="3.5" />
              <path d="M40 74 L40 28 L69 35 L40 42" fill={MASTERS_RED} />
              <rect x="37.5" y="26" width="3" height="48" rx="1.5" fill={CREAM} />
            </svg>
            <span style={{ fontFamily: 'Bebas Neue', fontSize: 19, letterSpacing: 2, color: CREAM }}>{isCurrentYear ? 'Live Leaderboard' : 'Final Standings'}</span>
            {isCurrentYear && <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: MASTERS_RED, boxShadow: `0 0 8px ${MASTERS_RED}`, marginLeft: 'auto', display: 'inline-block' }} />}
          </div>
          {leaders.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--tx3)', fontSize: 14 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⛳</div>
              No scores yet — may the best ball win.
            </div>
          ) : (
            leaders.map((row, i) => {
              const tp = Math.round(row.toPar)
              const totalColor = tp < 0 ? MASTERS_RED : tp === 0 ? 'var(--gold)' : 'var(--tx2)'
              return (
              <div key={row.team.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px',
                borderBottom: i < leaders.length - 1 ? '1px solid var(--bdr)' : 'none',
                background: i === 0 ? 'linear-gradient(90deg, var(--gold-08), transparent 62%)' : 'transparent',
                boxShadow: i === 0 ? 'inset 3px 0 0 var(--gold)' : undefined,
              }}>
                <span style={{ width: 24, textAlign: 'center', flexShrink: 0, fontFamily: 'Bebas Neue', fontSize: 18, letterSpacing: 0.5, color: i === 0 ? 'var(--gold)' : 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, color: i === 0 ? 'var(--gold)' : 'var(--tx1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.team.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[teamMemberName(row.team.player1, row.team.p1_name), teamMemberName(row.team.player2, row.team.p2_name)].filter(Boolean).join(' & ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: 19, fontVariantNumeric: 'tabular-nums', color: totalColor, lineHeight: 1 }}>
                    {toPar(tp)}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--tx4)', marginTop: 2 }}>{row.thru === 18 ? 'F' : `thru ${row.thru}`}</div>
                </div>
              </div>
              )
            })
          )}
        </div>

        {/* Live Scoring Feed */}
        <div
          data-tour="feed"
          className="glass pressable animate-fadeUp delay-200"
          onClick={() => navigate('/live-feed')}
          role="button"
          style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}
        >
          <div style={{
            padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: '1px solid rgba(212,165,58,0.1)',
            background: 'rgba(212,165,58,0.04)',
          }}>
            <span style={{ fontSize: 15 }}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#D4A53A' }}>Live Feed</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold-dim)' }}>View all →</span>
              <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', letterSpacing: 1.5, textTransform: 'uppercase' }}>Live</span>
            </div>
          </div>
          {feed.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>⛳</div>
              <div style={{ fontSize: 14, color: 'var(--tx3)' }}>Events appear here as scores and chulligans are recorded</div>
            </div>
          ) : (
            feed.map((ev, i) => {
              const color = eventColor(ev)
              const highlight = isHighlight(ev)
              return (
                <div key={ev.id} style={{
                  padding: '11px 20px',
                  borderBottom: i < feed.length - 1 ? '1px solid var(--bdr)' : 'none',
                  background: highlight ? 'rgba(212,165,58,0.02)' : 'transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                      background: highlight ? 'rgba(212,165,58,0.1)' : 'var(--surf)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18,
                    }}>{ev.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                          {ev.label}
                        </span>
                        {ev.event_type === 'contest' && ev.label.includes('Vote') ? (
                          <span style={{ fontSize: 13, color: 'var(--tx2)' }}>
                            <strong style={{ color: 'var(--tx1)', fontWeight: 700 }}>{ev.voter_name}</strong>
                            {' voted '}
                            <strong style={{ color: '#D4A53A', fontWeight: 700 }}>{ev.player_name}</strong>
                            {' for jackass'}
                          </span>
                        ) : ev.event_type === 'contest' ? (
                          ev.player_name && (
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx1)' }}>{ev.player_name}</span>
                          )
                        ) : (
                          <>
                            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--tx1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {ev.team_name || 'Unknown Team'}
                            </span>
                            {ev.player_name && (
                              <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{ev.player_name}</span>
                            )}
                            <span style={{ fontSize: 12, color: 'var(--tx3)', flexShrink: 0 }}>
                              Hole {ev.hole}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {ev.score != null && ev.event_type === 'score' && (
                        <div>
                          <div style={{ fontSize: 9, color: 'var(--tx3)', textTransform: 'uppercase', letterSpacing: 1 }}>Score</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: 'Bebas Neue', letterSpacing: 1 }}>
                            {ev.score}
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--tx4)' }}>
                        {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Contest Leaders (live) ────────────────────────────── */}
      <div
        className="glass pressable animate-fadeUp delay-300"
        onClick={() => navigate('/contests')}
        role="button"
        style={{ padding: 0, overflow: 'hidden', marginBottom: 20, cursor: 'pointer' }}
      >
        <div style={{
          padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: '1px solid rgba(212,165,58,0.1)',
          background: 'rgba(212,165,58,0.04)',
        }}>
          <span style={{ fontSize: 15 }}>🎯</span>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#D4A53A' }}>Contest Leaders</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold-dim)' }}>View all →</span>
            {isCurrentYear && (
              <>
                <span className="animate-pulseDot" style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', letterSpacing: 1.5, textTransform: 'uppercase' }}>Live</span>
              </>
            )}
          </div>
        </div>
        {[
          { icon: '🎯', label: 'Closest to Pin', leader: contestLeaders.ctp },
          { icon: '💥', label: 'Longest Drive',  leader: contestLeaders.ld },
        ].map((c, i) => (
          <div key={c.label} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px',
            borderBottom: i === 0 ? '1px solid var(--bdr)' : 'none',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: 'var(--surf)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}>{c.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold-dim)', textTransform: 'uppercase', letterSpacing: 1.2 }}>{c.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.leader ? 'var(--tx1)' : 'var(--tx4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                {c.leader ? c.leader.name : 'Up for grabs'}
              </div>
            </div>
            {c.leader?.detail && (
              <div style={{ flexShrink: 0, fontFamily: 'Bebas Neue', fontSize: 18, color: '#D4A53A', letterSpacing: 0.5 }}>{c.leader.detail}</div>
            )}
            {c.leader?.photo_url
              ? <img src={c.leader.photo_url} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--bdr)' }} />
              : c.leader && <span style={{ fontSize: 18, flexShrink: 0 }}>🏆</span>}
          </div>
        ))}
      </div>

    </div>
  )
}
